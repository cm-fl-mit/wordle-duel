// Main Wordle Duel app controller
class WordleDuelApp {
    constructor() {
        this.gameMode = null; // 'ai' or 'multiplayer'
        this.playerName = 'Player';
        this.opponentName = 'Opponent';
        this.currentRound = 1;
        this.maxRounds = 6;

        // Game instances
        this.playerGame = null;
        this.opponentGame = null;
        this.aiOpponent = null;
        this.aiGuessTimeout = null;

        // State
        this.playerSubmitted = false;
        this.opponentSubmitted = false;
        this.roundResults = [];
        this.playerScore = 0;
        this.opponentScore = 0;
    }

    // Initialize the app
    async init() {
        try {
            // Load word list first
            await loadWordList();

            // Initialize Firebase for multiplayer
            await firebaseSync.initFirebase();
            this.setupEventListeners();
            this.showScreen('menu');
        } catch (error) {
            console.error('Initialization error:', error);
            alert('Failed to initialize. Check config and reload.');
        }
    }

    // Setup event listeners
    setupEventListeners() {
        const input = document.getElementById('input');

        // Auto-uppercase and limit to letters
        input.addEventListener('input', (e) => {
            let value = e.target.value.toUpperCase();
            value = value.replace(/[^A-Z]/g, ''); // Only letters
            e.target.value = value;

            // Update board preview as typing
            if (!this.playerSubmitted) {
                this.updatePlayerBoard();
            }

            // Send typing indicator for multiplayer
            if (this.gameMode === 'multiplayer' && !this.playerSubmitted) {
                this.sendTypingIndicator(value.length > 0);
            }
        });

        // Submit on Enter
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitGuess();
            }
        });
    }

    // Show/hide screens
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(screenName).classList.remove('hidden');
    }

    // Play against AI
    playAI() {
        this.gameMode = 'ai';
        this.opponentName = 'AI';
        this.playerName = 'You';

        // Both players guess the SAME word
        const targetWord = ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];

        this.playerGame = new WordleGame(targetWord);
        this.opponentGame = new WordleGame(targetWord);
        this.aiOpponent = new WordleAI();

        this.startGame();
    }

    // Create multiplayer room
    async createRoom() {
        try {
            this.playerName = 'Player 1';
            const roomCode = await firebaseSync.createRoom(this.playerName);

            // Display room code in UI instead of alert
            await this.joinMultiplayer(roomCode, this.playerName);

            // Show room code and waiting message
            const roomCodeDisplay = document.getElementById('room-code-display');
            const roomCodeText = document.getElementById('room-code-text');
            const waitingMessage = document.getElementById('waiting-message');

            if (roomCodeDisplay && roomCodeText && waitingMessage) {
                roomCodeText.textContent = roomCode;
                roomCodeDisplay.classList.remove('hidden');
                waitingMessage.classList.remove('hidden');
            }
        } catch (error) {
            alert('Error creating room: ' + error.message);
        }
    }

    // Join multiplayer room
    async joinRoom() {
        const code = document.getElementById('roomCode').value.toUpperCase();

        if (!code) {
            alert('Please enter a room code');
            return;
        }

        try {
            this.playerName = 'Player 2';
            await firebaseSync.joinRoom(code, this.playerName);
            await this.joinMultiplayer(code, this.playerName);
        } catch (error) {
            alert('Error joining room: ' + error.message);
        }
    }

    // Setup multiplayer game
    async joinMultiplayer(roomCode, playerName) {
        this.gameMode = 'multiplayer';
        this.waitingForOpponent = (playerName === 'Player 1'); // Creator waits for joiner
        this.playerIndex = (playerName === 'Player 1') ? 1 : 2; // Store player index

        const target = ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
        this.playerGame = new WordleGame(target);

        // Initialize empty opponent game for display
        this.opponentGame = {
            guesses: [],
            boards: []
        };

        // Wait for opponent to join
        firebaseSync.onRoomStateChange((players) => {
            if (players.length === 2) {
                const opponent = players.find(p => p.id !== firebaseSync.getPlayerId());
                if (opponent) {
                    this.opponentName = opponent.name;
                    this.waitingForOpponent = false;

                    // Update UI to show opponent joined
                    const oppNameEl = document.getElementById('oppName');
                    if (oppNameEl) {
                        oppNameEl.textContent = this.opponentName;
                    }
                    this.updateRoundStatus('Opponent joined! Enter your guess');

                    // Hide waiting message, enable input
                    const waitingMsg = document.getElementById('waiting-message');
                    if (waitingMsg) {
                        waitingMsg.classList.add('hidden');
                    }
                    document.getElementById('input').disabled = false;
                }
            }
        });

        // Listen for opponent's guess data changes
        firebaseSync.onOpponentStateChange((opponentData) => {
            this.opponentName = opponentData.name;

            // Always update opponent game data
            this.opponentGame.guesses = opponentData.guesses || [];
            this.opponentGame.boards = opponentData.boards || [];

            // Show typing indicator
            const oppStatusEl = document.getElementById('opponent-status');
            if (oppStatusEl && opponentData.isTyping) {
                oppStatusEl.textContent = 'Opponent is typing...';
            }
        });

        // Listen for shared game state changes (THIS is the single source of truth)
        firebaseSync.onGameStateChange((gameState) => {
            if (!gameState) return;

            const currentRound = gameState.currentRound || 1;
            const roundKey = `round${currentRound}`;
            const roundState = gameState[roundKey];

            console.log('Game state changed:', { currentRound, roundState });

            // Check if both players have submitted for current round
            if (roundState && roundState.player1Submit && roundState.player2Submit && !roundState.revealed) {
                console.log('Both submitted! Revealing...');
                // Both submitted - reveal and advance
                this.revealAndAdvance(currentRound);
            } else if (roundState) {
                // Update status based on who submitted
                const myKey = `player${this.playerIndex}Submit`;
                const opponentKey = `player${this.playerIndex === 1 ? 2 : 1}Submit`;

                if (roundState[opponentKey] && !roundState[myKey]) {
                    this.updateRoundStatus(`${this.opponentName} is waiting - enter your guess`);
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl) {
                        oppStatusEl.textContent = 'Opponent submitted their word!';
                    }
                } else if (!roundState[opponentKey]) {
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl && oppStatusEl.textContent !== 'Opponent is typing...') {
                        oppStatusEl.textContent = '';
                    }
                }
            }

            // Update round display
            document.getElementById('round').textContent = `Round ${currentRound}/6`;
        });

        this.startGame();
    }

    // Start the game
    startGame() {
        this.currentRound = 1;
        this.playerScore = 0;
        this.opponentScore = 0;
        this.roundResults = [];
        this.showScreen('game');
        this.startRound();
    }

    // Start a new round
    startRound() {
        this.playerSubmitted = false;
        this.opponentSubmitted = false;
        this.roundEnding = false; // Reset the flag for the new round

        // Clear status indicators
        const playerStatusEl = document.getElementById('player-status');
        const opponentStatusEl = document.getElementById('opponent-status');
        if (playerStatusEl) playerStatusEl.textContent = '';
        if (opponentStatusEl) opponentStatusEl.textContent = '';

        // Round number based on guesses made + 1 (current round)
        const actualRound = this.playerGame.guesses.length + 1;
        document.getElementById('round').textContent = `Round ${actualRound}/${this.maxRounds}`;
        const input = document.getElementById('input');
        input.value = '';

        // If waiting for opponent, disable input
        if (this.waitingForOpponent) {
            input.disabled = true;
            this.updateRoundStatus('Waiting for opponent to join...');
        } else {
            input.disabled = false;
            input.focus(); // Auto-focus for keyboard input
            this.updateRoundStatus('Enter your guess');
        }

        this.updateBoards();

        // If AI mode, make AI guess after delay
        if (this.gameMode === 'ai') {
            this.scheduleAIGuess();
        }
    }

    // Update round status message
    updateRoundStatus(message) {
        const statusEl = document.getElementById('round-status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    // Submit player's guess
    submitGuess() {
        if (this.playerSubmitted) {
            alert('Already submitted this round');
            return;
        }

        const guess = document.getElementById('input').value.trim();

        if (guess.length !== 5) {
            alert('Enter 5-letter word');
            return;
        }

        const result = this.playerGame.submitGuess(guess);

        if (!result.valid) {
            alert(result.message);
            return;
        }

        this.playerSubmitted = true;
        document.getElementById('input').disabled = true;
        document.getElementById('input').value = '';

        // Update board to show the submitted word immediately
        this.updatePlayerBoard();

        // Update status messages
        this.updateRoundStatus(`Waiting for ${this.opponentName} to submit...`);

        // Sync state if multiplayer
        if (this.gameMode === 'multiplayer') {
            // Sync my guess data
            firebaseSync.syncGameState(
                firebaseSync.getPlayerId(),
                this.playerGame.guesses,
                this.playerGame.boards
            );

            // Mark that I submitted for this round
            const currentRound = this.playerGame.guesses.length; // Round number = number of guesses
            firebaseSync.markRoundSubmit(currentRound, this.playerIndex);

            this.sendTypingIndicator(false); // Clear typing indicator
        }

        // AI mode - check if both submitted
        if (this.gameMode === 'ai' && this.opponentSubmitted) {
            this.endRound();
        }
    }

    // Send typing indicator to opponent
    sendTypingIndicator(isTyping) {
        if (this.gameMode === 'multiplayer') {
            firebaseSync.updateTypingStatus(isTyping);
        }
    }

    // Schedule AI guess with delay
    scheduleAIGuess() {
        if (this.aiGuessTimeout) clearTimeout(this.aiGuessTimeout);

        const delay = this.aiOpponent.getDelay();
        this.aiGuessTimeout = setTimeout(() => {
            this.makeAIGuess();
        }, delay);
    }

    // Make AI guess
    makeAIGuess() {
        const guess = this.aiOpponent.makeGuess(
            this.opponentGame.guesses,
            this.opponentGame.boards
        );

        const result = this.opponentGame.submitGuess(guess);
        this.opponentSubmitted = true;
        this.updateOpponentBoard();

        if (this.playerSubmitted) {
            this.endRound();
        }
    }

    // Update player board display
    updatePlayerBoard() {
        const board = document.getElementById('board1');
        const currentInput = this.playerSubmitted ? '' : document.getElementById('input').value;

        // Always show all completed guesses + current input
        createBoard(board, this.playerGame.guesses, this.playerGame.boards, currentInput);
    }

    // Update opponent board display (only show revealed rounds)
    updateOpponentBoard() {
        const board = document.getElementById('board2');
        const guesses = this.opponentGame.guesses || [];
        const boards = this.opponentGame.boards || [];

        // In multiplayer, only show opponent guesses that have been revealed
        if (this.gameMode === 'multiplayer') {
            // Show guesses up to the last revealed round
            const revealedGuesses = guesses.slice(0, this.playerGame.guesses.length);
            const revealedBoards = boards.slice(0, this.playerGame.guesses.length);
            createBoard(board, revealedGuesses, revealedBoards);
        } else {
            // In AI mode, show all guesses
            createBoard(board, guesses, boards);
        }
    }

    // Update both boards and keyboard
    updateBoards() {
        this.updatePlayerBoard();
        this.updateOpponentBoard();

        const keyboard = document.getElementById('keyboard');
        createKeyboard(keyboard, this.playerGame.keyboardState, (letter) => {
            if (!this.playerSubmitted) {
                const input = document.getElementById('input');
                if (input.value.length < 5) {
                    input.value += letter;
                    input.focus();
                }
            }
        });
    }

    // End current round
    endRound() {
        // Prevent calling endRound multiple times
        if (this.roundEnding) {
            console.log('Round already ending, skipping duplicate call');
            return;
        }
        this.roundEnding = true;

        if (this.aiGuessTimeout) clearTimeout(this.aiGuessTimeout);

        document.getElementById('input').disabled = true;

        // REVEAL: Now show both guesses simultaneously
        this.updateRoundStatus('Revealing guesses...');
        this.revealGuesses();

        // Check for collision - both submitted same word this round
        const playerLastGuess = this.playerGame.guesses[this.playerGame.guesses.length - 1];
        const opponentLastGuess = this.opponentGame.guesses[this.opponentGame.guesses.length - 1];

        // Check if either player won first (before checking collision)
        const playerWon = this.playerGame.boards[this.playerGame.boards.length - 1]?.every(r => r === 'correct');
        const opponentWon = this.opponentGame.boards[this.opponentGame.boards.length - 1]?.every(r => r === 'correct');

        // If both guessed the answer correctly, whoever submitted first wins
        if (playerWon && opponentWon) {
            // In this prototype, we'll call it a draw (could track timestamps to determine winner)
            setTimeout(() => {
                this.endGame('both_won');
            }, 2000);
            return;
        }

        if (playerWon) {
            setTimeout(() => {
                this.endGame('player_win');
            }, 2000);
            return;
        }

        if (opponentWon) {
            setTimeout(() => {
                this.endGame('opponent_win');
            }, 2000);
            return;
        }

        // Only check collision if neither player won
        if (playerLastGuess && opponentLastGuess && playerLastGuess === opponentLastGuess) {
            // COLLISION - both lose!
            setTimeout(() => {
                this.endGame('collision');
            }, 2000);
            return;
        }

        // Check if game is over (6 guesses used)
        if (this.playerGame.guesses.length >= this.maxRounds) {
            setTimeout(() => {
                this.endGame('draw');
            }, 2000);
            return;
        }

        // Continue to next round
        setTimeout(() => {
            this.nextRound();
        }, 2000);
    }

    // Reveal both players' guesses simultaneously
    revealGuesses() {
        const board1 = document.getElementById('board1');
        const board2 = document.getElementById('board2');

        // Show all guesses including current round
        createBoard(board1, this.playerGame.guesses, this.playerGame.boards);
        createBoard(board2, this.opponentGame.guesses || [], this.opponentGame.boards || []);

        // Clear status messages
        const playerStatusEl = document.getElementById('player-status');
        const opponentStatusEl = document.getElementById('opponent-status');
        if (playerStatusEl) {
            playerStatusEl.textContent = '';
        }
        if (opponentStatusEl) {
            opponentStatusEl.textContent = '';
        }
    }

    // Move to next round
    nextRound() {
        // Reset state to 'playing' for next round if multiplayer
        if (this.gameMode === 'multiplayer') {
            firebaseSync.syncGameState(
                firebaseSync.getPlayerId(),
                this.playerGame.guesses,
                this.playerGame.boards,
                'playing'
            );
        }

        // Don't reset games - guesses persist across rounds
        this.startRound();
    }

    // Reveal and advance to next round (MULTIPLAYER ONLY - triggered when both submit)
    async revealAndAdvance(roundNumber) {
        console.log(`revealAndAdvance called for round ${roundNumber}`);

        // Show "Revealing guesses..." message
        this.updateRoundStatus('Revealing guesses...');

        // Update both boards to show the just-submitted guesses with colors
        this.updatePlayerBoard();
        this.updateOpponentBoard();

        // Clear status indicators
        const playerStatusEl = document.getElementById('player-status');
        const opponentStatusEl = document.getElementById('opponent-status');
        if (playerStatusEl) playerStatusEl.textContent = '';
        if (opponentStatusEl) opponentStatusEl.textContent = '';

        // Get the latest guesses for both players
        const playerLastGuess = this.playerGame.guesses[this.playerGame.guesses.length - 1];
        const opponentLastGuess = this.opponentGame.guesses[this.opponentGame.guesses.length - 1];

        // Check if either player won first (before checking collision)
        const playerWon = this.playerGame.boards[this.playerGame.boards.length - 1]?.every(r => r === 'correct');
        const opponentWon = this.opponentGame.boards[this.opponentGame.boards.length - 1]?.every(r => r === 'correct');

        // Mark round as revealed in Firebase
        await firebaseSync.markRoundRevealed(roundNumber);

        // If both guessed the answer correctly
        if (playerWon && opponentWon) {
            setTimeout(() => {
                this.endGame('both_won');
            }, 2000);
            return;
        }

        if (playerWon) {
            setTimeout(() => {
                this.endGame('player_win');
            }, 2000);
            return;
        }

        if (opponentWon) {
            setTimeout(() => {
                this.endGame('opponent_win');
            }, 2000);
            return;
        }

        // Check for collision - both submitted same word this round (but neither won)
        if (playerLastGuess && opponentLastGuess && playerLastGuess === opponentLastGuess) {
            setTimeout(() => {
                this.endGame('collision');
            }, 2000);
            return;
        }

        // Check if game is over (6 guesses used)
        if (roundNumber >= 6) {
            setTimeout(() => {
                this.endGame('draw');
            }, 2000);
            return;
        }

        // Continue to next round after a brief delay
        setTimeout(() => {
            // Reset playerSubmitted flag for next round
            this.playerSubmitted = false;

            // Re-enable input for next round
            const input = document.getElementById('input');
            input.disabled = false;
            input.value = '';
            input.focus();

            // Update status
            this.updateRoundStatus('Enter your guess');

            // Update boards for next round
            this.updateBoards();
        }, 2000);
    }

    // End the game
    endGame(reason) {

        let resultText;
        if (reason === 'collision') {
            resultText = 'COLLISION! Both players lose!';
        } else if (reason === 'player_win') {
            resultText = 'You Win!';
        } else if (reason === 'opponent_win') {
            resultText = 'You Lose!';
        } else if (reason === 'both_won') {
            resultText = 'Both players guessed correctly - Draw!';
        } else {
            resultText = 'Draw - Neither player guessed the word';
        }

        document.getElementById('resultText').textContent = resultText;

        // Cleanup
        if (this.gameMode === 'multiplayer') {
            firebaseSync.leaveRoom();
        }

        this.showScreen('result');
    }
}

// Global app instance
let app;

// Global functions for HTML onclick handlers
function playAI() {
    app.playAI();
}

function createRoom() {
    app.createRoom();
}

function joinRoom() {
    app.joinRoom();
}

function submitGuess() {
    app.submitGuess();
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app = new WordleDuelApp();
    app.init();
});
