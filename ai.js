// AI opponent that plays fair (no cheating)
class WordleAI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.possibleWords = [...ANSWER_WORDS];
    }

    makeGuess(previousGuesses, previousBoards) {
        // Filter possible words based on what we know
        if (previousGuesses.length > 0) {
            this.updatePossibleWords(previousGuesses, previousBoards);
        }

        // Pick a random word from remaining possibilities
        if (this.possibleWords.length === 0) {
            this.possibleWords = [...ANSWER_WORDS];
        }

        const idx = Math.floor(Math.random() * this.possibleWords.length);
        return this.possibleWords[idx].toUpperCase();
    }

    updatePossibleWords(guesses, boards) {
        const lastGuess = guesses[guesses.length - 1];
        const lastBoard = boards[boards.length - 1];

        this.possibleWords = this.possibleWords.filter(word => {
            return this.matchesConstraints(word.toUpperCase(), lastGuess, lastBoard);
        });
    }

    matchesConstraints(word, guess, board) {
        const wordLetters = word.split('');
        const guessLetters = guess.split('');

        // Check correct positions
        for (let i = 0; i < 5; i++) {
            if (board[i] === 'correct' && wordLetters[i] !== guessLetters[i]) {
                return false;
            }
            if (board[i] === 'absent' && wordLetters.includes(guessLetters[i])) {
                return false;
            }
        }

        // Check present letters
        for (let i = 0; i < 5; i++) {
            if (board[i] === 'present') {
                if (!wordLetters.includes(guessLetters[i])) {
                    return false;
                }
                if (wordLetters[i] === guessLetters[i]) {
                    return false;
                }
            }
        }

        return true;
    }

    getDelay() {
        return 3000 + Math.random() * 7000; // 3-10 seconds
    }
}
