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
            alert('Room created: ' + roomCode + '\nShare this code with your opponent.');
            await this.joinMultiplayer(roomCode, this.playerName);
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

        const target = ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
        this.playerGame = new WordleGame(target);

        // Wait for opponent to join
        firebaseSync.onRoomStateChange((players) => {
            if (players.length === 2) {
                const opponent = players.find(p => p.id !== firebaseSync.getPlayerId());
                if (opponent) {
                    this.opponentName = opponent.name;
                }
            }
        });

        // Listen for opponent state changes
        firebaseSync.onOpponentStateChange((opponentData) => {
            this.opponentName = opponentData.name;

            // Store opponent game data but don't reveal current round yet
            if (!this.opponentGame) {
                this.opponentGame = {
                    guesses: opponentData.guesses,
                    boards: opponentData.boards
                };
            } else {
                this.opponentGame.guesses = opponentData.guesses;
                this.opponentGame.boards = opponentData.boards;
            }

            if (opponentData.state === 'submitted') {
                this.opponentSubmitted = true;

                // Show opponent status
                const oppStatusEl = document.getElementById('opponent-status');
                if (oppStatusEl) {
                    oppStatusEl.textContent = '✓ Submitted';
                }

                // Update main status if player hasn't submitted yet
                if (!this.playerSubmitted) {
                    this.updateRoundStatus(`${this.opponentName} is waiting - enter your guess`);
                }

                // If both submitted, end round and reveal
                if (this.playerSubmitted) {
                    this.endRound();
                }
            } else {
                // Update board (will hide current round guess)
                this.updateOpponentBoard();

                // Show typing indicator if opponent is typing
                if (opponentData.isTyping) {
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl) {
                        oppStatusEl.textContent = 'typing...';
                    }
                } else {
                    const oppStatusEl = document.getElementById('opponent-status');
                    if (oppStatusEl) {
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

        document.getElementById('round').textContent = `Round ${this.currentRound}/${this.maxRounds}`;
        const input = document.getElementById('input');
        input.value = '';
        input.disabled = false;
        input.focus(); // Auto-focus for keyboard input

        this.updateRoundStatus('Enter your guess');

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

        // Update status messages
        this.updateRoundStatus(`Waiting for ${this.opponentName} to reveal Round ${this.currentRound}`);

        const statusEl = document.getElementById('player-status');
        if (statusEl) {
            statusEl.textContent = '✓ Submitted';
        }

        // Sync state if multiplayer (but don't reveal yet)
        if (this.gameMode === 'multiplayer') {
            firebaseSync.syncGameState(
                firebaseSync.getPlayerId(),
                this.playerGame.guesses,
                this.playerGame.boards,
                'submitted'
            );
            this.sendTypingIndicator(false); // Clear typing indicator
        }

        // Check if both players submitted
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

        // Show all previous guesses, but hide current round's guess after submission
        const guessesToShow = this.playerSubmitted ?
            this.playerGame.guesses.slice(0, -1) :
            this.playerGame.guesses;
        const boardsToShow = this.playerSubmitted ?
            this.playerGame.boards.slice(0, -1) :
            this.playerGame.boards;

        createBoard(board, guessesToShow, boardsToShow, currentInput);
    }

    // Update opponent board display
    updateOpponentBoard() {
        const board = document.getElementById('board2');
        const guesses = this.opponentGame.guesses || [];
        const boards = this.opponentGame.boards || [];

        // Hide opponent's current round guess until round ends
        const guessesToShow = this.opponentSubmitted ?
            guesses.slice(0, -1) :
            guesses;
        const boardsToShow = this.opponentSubmitted ?
            boards.slice(0, -1) :
            boards;

        createBoard(board, guessesToShow, boardsToShow);
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
        if (this.currentRound >= this.maxRounds) {
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
        this.currentRound++;
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
