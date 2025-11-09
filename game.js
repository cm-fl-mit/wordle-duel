// Core Wordle game logic
class WordleGame {
    constructor(targetWord) {
        this.targetWord = targetWord.toUpperCase();
        this.guesses = [];
        this.boards = [];
        this.currentGuess = '';
        this.keyboardState = {};
    }

    evaluateGuess(guess) {
        guess = guess.toUpperCase();
        const result = Array(5).fill('absent');
        const targetLetters = this.targetWord.split('');
        const guessLetters = guess.split('');

        // Mark correct positions first
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] === targetLetters[i]) {
                result[i] = 'correct';
                targetLetters[i] = null;
                guessLetters[i] = null;
            }
        }

        // Mark present letters
        for (let i = 0; i < 5; i++) {
            if (guessLetters[i] !== null) {
                const idx = targetLetters.indexOf(guessLetters[i]);
                if (idx !== -1) {
                    result[i] = 'present';
                    targetLetters[idx] = null;
                }
            }
        }

        return result;
    }

    submitGuess(guess) {
        if (!this.isValidWord(guess)) {
            return { valid: false, message: 'Not in word list' };
        }

        const result = this.evaluateGuess(guess);
        this.guesses.push(guess.toUpperCase());
        this.boards.push(result);

        // Update keyboard state
        guess.toUpperCase().split('').forEach((letter, i) => {
            const state = result[i];
            if (!this.keyboardState[letter] ||
                (state === 'correct' ||
                 (state === 'present' && this.keyboardState[letter] === 'absent'))) {
                this.keyboardState[letter] = state;
            }
        });

        const isWin = result.every(r => r === 'correct');
        return { valid: true, result, isWin, isDone: isWin || this.guesses.length >= 6 };
    }

    isValidWord(word) {
        return VALID_WORDS.includes(word.toLowerCase());
    }
}

// Rendering functions
function createBoard(boardElement, guesses, boards, currentGuess = '') {
    boardElement.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const row = document.createElement('div');
        row.className = 'row';

        for (let j = 0; j < 5; j++) {
            const tile = document.createElement('div');
            tile.className = 'tile';

            if (i < guesses.length) {
                tile.textContent = guesses[i][j];
                tile.classList.add(boards[i][j], 'filled');
            } else if (i === guesses.length && j < currentGuess.length) {
                tile.textContent = currentGuess[j].toUpperCase();
                tile.classList.add('filled');
            }

            row.appendChild(tile);
        }

        boardElement.appendChild(row);
    }
}

function createKeyboard(keyboardElement, keyboardState, onKeyClick) {
    const rows = [
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['Z','X','C','V','B','N','M']
    ];

    keyboardElement.innerHTML = '';
    rows.forEach((row, rowIndex) => {
        // Add spacers for offset rows
        if (rowIndex === 1) {
            // Middle row: offset by 0.5 key width
            const halfSpacer = document.createElement('div');
            halfSpacer.className = 'key-spacer half';
            keyboardElement.appendChild(halfSpacer);
        } else if (rowIndex === 2) {
            // Bottom row: offset by 1.5 key widths
            const spacer1 = document.createElement('div');
            spacer1.className = 'key-spacer';
            keyboardElement.appendChild(spacer1);
            const halfSpacer = document.createElement('div');
            halfSpacer.className = 'key-spacer half';
            keyboardElement.appendChild(halfSpacer);
        }

        row.forEach(letter => {
            const key = document.createElement('div');
            key.className = 'key';
            key.textContent = letter;
            if (keyboardState[letter]) {
                key.classList.add(keyboardState[letter]);
            }
            key.onclick = () => onKeyClick(letter);
            keyboardElement.appendChild(key);
        });
    });
}
