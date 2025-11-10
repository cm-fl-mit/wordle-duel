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

        // Listen for opponent state changes
        firebaseSync.onOpponentStateChange((opponentData) => {
            this.opponentName = opponentData.name;

            // Always update opponent game data
            this.opponentGame.guesses = opponentData.guesses || [];
            this.opponentGame.boards = opponentData.boards || [];

            // Update opponent board with their latest data
            this.updateOpponentBoard();

            // Check if opponent has submitted for current round
            const opponentRoundCount = (opponentData.guesses || []).length;
            const myRoundCount = this.playerGame.guesses.length;

            console.log('Opponent state change:', {
                opponentRoundCount,
                myRoundCount,
                opponentState: opponentData.state,
                playerSubmitted: this.playerSubmitted,
                opponentSubmitted: this.opponentSubmitted
            });

            // Check if opponent has same or more guesses (they've submitted for current round)
            if (opponentRoundCount >= myRoundCount && opponentData.state === 'submitted') {
                // Mark opponent as submitted if they're on the same round and submitted
                if (opponentRoundCount === myRoundCount && !this.opponentSubmitted) {
                    this.opponentSubmitted = true;

                    // Show opponent status
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl) {
                        oppStatusEl.textContent = 'Opponent submitted their word!';
                    }

                    // If I've also submitted, end round
                    if (this.playerSubmitted) {
                        console.log('Both submitted! Ending round...');
                        this.endRound();
                    } else {
                        // I haven't submitted yet
                        this.updateRoundStatus(`${this.opponentName} is waiting - enter your guess`);
                    }
                } else if (opponentRoundCount > myRoundCount) {
                    // Opponent is ahead
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl) {
                        oppStatusEl.textContent = 'Opponent submitted their word!';
                    }
                }
            } else {
                // Opponent is still playing
                const oppStatusEl = document.getElementById('opponent-status');
                if (oppStatusEl) {
                    if (opponentData.isTyping) {
                        oppStatusEl.textContent = 'Opponent is typing...';
                    } else {
                        oppStatusEl.textContent = '';
                    }
                }
            }
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

        // Sync state if multiplayer - NOW includes the new guess
        if (this.gameMode === 'multiplayer') {
            firebaseSync.syncGameState(
                firebaseSync.getPlayerId(),
                this.playerGame.guesses,
                this.playerGame.boards,
                'submitted'
            );
            this.sendTypingIndicator(false); // Clear typing indicator
        }

        // Check if both players submitted - if so, end round
        if (this.gameMode === 'ai' && this.opponentSubmitted) {
            this.endRound();
        } else if (this.gameMode === 'multiplayer' && this.opponentSubmitted) {
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

    // Update opponent board display
    updateOpponentBoard() {
        const board = document.getElementById('board2');
        const guesses = this.opponentGame.guesses || [];
        const boards = this.opponentGame.boards || [];

        // Show all opponent guesses - they're already synced from Firebase
        createBoard(board, guesses, boards);
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
