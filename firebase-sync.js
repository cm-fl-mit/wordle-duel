// Firebase Realtime Database sync module for Wordle Duel
class FirebaseSync {
    constructor() {
        this.db = null;
        this.roomRef = null;
        this.playerId = this.generatePlayerId();
        this.currentRoom = null;
        this.listeners = {};
    }

    // Initialize Firebase with config
    async initFirebase() {
        // Use config from firebase-config.js
        if (typeof FIREBASE_CONFIG === 'undefined') {
            throw new Error('Firebase config not found. Please edit firebase-config.js');
        }

        // Initialize Firebase (check if already initialized)
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        this.db = firebase.database();
        console.log('Firebase initialized');
    }

    // Generate unique player ID
    generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Create a new room with 6-character code
    async createRoom(playerName) {
        try {
            const roomCode = this.generateRoomCode();
            this.currentRoom = roomCode;

            console.log('Attempting to create room:', roomCode);
            console.log('Database reference:', this.db);

            const roomData = {
                code: roomCode,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                players: {
                    [this.playerId]: {
                        name: playerName,
                        joinedAt: firebase.database.ServerValue.TIMESTAMP,
                        guesses: [],
                        boards: []
                    }
                },
                gameState: {
                    status: 'waiting', // waiting, active, finished
                    currentRound: 1,
                    round1: { player1Submit: false, player2Submit: false, revealed: false },
                    round2: { player1Submit: false, player2Submit: false, revealed: false },
                    round3: { player1Submit: false, player2Submit: false, revealed: false },
                    round4: { player1Submit: false, player2Submit: false, revealed: false },
                    round5: { player1Submit: false, player2Submit: false, revealed: false },
                    round6: { player1Submit: false, player2Submit: false, revealed: false }
                }
            };

            this.roomRef = this.db.ref('rooms/' + roomCode);
            console.log('Writing to path:', 'rooms/' + roomCode);
            await this.roomRef.set(roomData);
            console.log('Room created successfully:', roomCode);
            return roomCode;
        } catch (error) {
            console.error('Error creating room:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            throw error;
        }
    }

    // Join an existing room
    async joinRoom(roomCode, playerName) {
        try {
            this.currentRoom = roomCode;
            this.roomRef = this.db.ref('rooms/' + roomCode);

            // Check if room exists
            const snapshot = await this.roomRef.once('value');
            if (!snapshot.exists()) {
                throw new Error('Room not found');
            }

            const roomData = snapshot.val();

            // Check for player collision (same name already in room)
            if (roomData.players) {
                for (const pid in roomData.players) {
                    if (roomData.players[pid].name === playerName) {
                        throw new Error('Player name already taken in this room');
                    }
                }
            }

            // Add player to room
            await this.roomRef.child('players').child(this.playerId).set({
                name: playerName,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            });

            console.log('Joined room:', roomCode);
            return roomCode;
        } catch (error) {
            console.error('Error joining room:', error);
            throw error;
        }
    }

    // Sync player's game state (guesses, board)
    async syncGameState(playerId, guesses, boards) {
        try {
            if (!this.roomRef) return;

            const playerStateRef = this.roomRef.child('players').child(playerId);
            await playerStateRef.update({
                guesses,
                boards,
                lastUpdate: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Error syncing game state:', error);
        }
    }

    // Mark that a player submitted for a round
    async markRoundSubmit(roundNumber, playerIndex) {
        try {
            if (!this.roomRef) return;

            const roundKey = `round${roundNumber}`;
            const submitKey = `player${playerIndex}Submit`;

            await this.roomRef.child('gameState').child(roundKey).update({
                [submitKey]: true
            });
        } catch (error) {
            console.error('Error marking round submit:', error);
        }
    }

    // Mark round as revealed
    async markRoundRevealed(roundNumber) {
        try {
            if (!this.roomRef) return;

            const roundKey = `round${roundNumber}`;

            await this.roomRef.child('gameState').child(roundKey).update({
                revealed: true
            });

            // Advance to next round
            if (roundNumber < 6) {
                await this.roomRef.child('gameState').update({
                    currentRound: roundNumber + 1
                });
            }
        } catch (error) {
            console.error('Error marking round revealed:', error);
        }
    }

    // Listen for game state changes
    onGameStateChange(callback) {
        if (!this.roomRef) return;

        const gameStateRef = this.roomRef.child('gameState');
        gameStateRef.on('value', (snapshot) => {
            callback(snapshot.val());
        });

        this.listeners['gameState'] = gameStateRef;
    }

    // Listen for opponent's game state changes
    onOpponentStateChange(callback) {
        if (!this.roomRef) return;

        const playersRef = this.roomRef.child('players');
        playersRef.on('child_changed', (snapshot) => {
            const playerId = snapshot.key;
            if (playerId !== this.playerId) {
                const playerData = snapshot.val();
                callback({
                    playerId,
                    name: playerData.name,
                    guesses: playerData.guesses || [],
                    boards: playerData.boards || [],
                    state: playerData.state || 'playing',
                    isTyping: playerData.isTyping || false
                });
            }
        });

        // Store listener for cleanup
        this.listeners['playerChanged'] = playersRef.child('child_changed');
    }

    // Update typing status
    async updateTypingStatus(isTyping) {
        try {
            if (!this.roomRef) return;

            const playerStateRef = this.roomRef.child('players').child(this.playerId);
            await playerStateRef.update({
                isTyping: isTyping,
                lastTyping: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error('Error updating typing status:', error);
        }
    }

    // Listen for game state updates
    onGameStateChange(callback) {
        if (!this.roomRef) return;

        const gameStateRef = this.roomRef.child('gameState');
        gameStateRef.on('value', (snapshot) => {
            callback(snapshot.val());
        });

        this.listeners['gameState'] = gameStateRef;
    }

    // Listen for room state changes (player joined/left)
    onRoomStateChange(callback) {
        if (!this.roomRef) return;

        const playersRef = this.roomRef.child('players');
        playersRef.on('value', (snapshot) => {
            const players = snapshot.val() || {};
            const playerList = Object.keys(players).map(id => ({
                id,
                name: players[id].name,
                hasData: !!players[id].guesses
            }));
            callback(playerList);
        });

        this.listeners['roomState'] = playersRef;
    }

    // Update game state (round, words, status)
    async updateGameState(gameState) {
        try {
            if (!this.roomRef) return;
            await this.roomRef.child('gameState').update(gameState);
        } catch (error) {
            console.error('Error updating game state:', error);
        }
    }

    // Detect collision: check if other players have same name
    detectNameCollision(playerName, existingPlayers) {
        return existingPlayers.some(p => p.name === playerName);
    }

    // Generate 6-character room code
    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Clean up listeners
    removeAllListeners() {
        if (this.roomRef) {
            this.roomRef.off();
        }
        Object.values(this.listeners).forEach(ref => {
            if (ref) ref.off();
        });
        this.listeners = {};
    }

    // Leave room
    async leaveRoom() {
        try {
            if (this.roomRef) {
                await this.roomRef.child('players').child(this.playerId).remove();
                this.removeAllListeners();
                this.currentRoom = null;
                this.roomRef = null;
            }
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }

    // Get current player ID
    getPlayerId() {
        return this.playerId;
    }

    // Get current room code
    getCurrentRoom() {
        return this.currentRoom;
    }
}

// Global instance
const firebaseSync = new FirebaseSync();
