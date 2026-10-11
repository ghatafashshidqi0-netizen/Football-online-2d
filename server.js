const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GOAL_TOP = 130;
const GOAL_BOTTOM = 270;

function resetPosition(room) {
    room.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 };
    const pIds = Object.keys(room.players);
    if(pIds[0]) { room.players[pIds[0]].x = 200; room.players[pIds[0]].y = 200; }
    if(pIds[1]) { room.players[pIds[1]].x = 600; room.players[pIds[1]].y = 200; }
    room.state = 'playing';
}

io.on('connection', (socket) => {
    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                players: {}, ball: { x: CANVAS_WIDTH/2, y: CANVAS_HEIGHT/2, vx: 0, vy: 0 },
                score: { blue: 0, red: 0 }, timeLeft: 180, state: 'waiting', lastScorer: ''
            };
            socket.join(roomId);
            rooms[roomId].players[socket.id] = { x: 200, y: 200, color: '#3498db', team: 'blue', isSprinting: false };
            socket.emit('roomCreated', roomId);
        } else {
            socket.emit('errorMsg', 'Room sudah ada!');
        }
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && Object.keys(rooms[roomId].players).length < 2) {
            socket.join(roomId);
            rooms[roomId].players[socket.id] = { x: 600, y: 200, color: '#e74c3c', team: 'red', isSprinting: false };
            rooms[roomId].state = 'playing';
            io.to(roomId).emit('gameStart', rooms[roomId]);
        } else {
            socket.emit('errorMsg', 'Room penuh atau tidak ditemukan!');
        }
    });

    socket.on('move', (data) => {
        const { roomId, x, y, isSprinting } = data;
        if (rooms[roomId] && rooms[roomId].players[socket.id] && rooms[roomId].state === 'playing') {
            rooms[roomId].players[socket.id].x = x;
            rooms[roomId].players[socket.id].y = y;
            rooms[roomId].players[socket.id].isSprinting = isSprinting;
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                io.to(roomId).emit('playerLeft');
                delete rooms[roomId]; 
            }
        }
    });
});

// Timer Loop (Detik)
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.state === 'playing' && Object.keys(room.players).length === 2) {
            room.timeLeft -= 1;
            if (room.timeLeft <= 0) {
                room.state = 'gameover';
                io.to(roomId).emit('gameOver', room);
            }
        }
    }
}, 1000);

// Physics Loop (60 FPS)
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.state !== 'playing') continue; // Stop fisika jika terjadi Gol atau Game Over

        const ball = room.ball;
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.96; // Gesekan rumput
        ball.vy *= 0.96;

        // Deteksi tabrakan Pemain & Bola
        for (const id in room.players) {
            const p = room.players[id];
            const dx = ball.x - p.x;
            const dy = ball.y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 30) {
                const angle = Math.atan2(dy, dx);
                // Tendangan jauh lebih kencang jika sambil sprint!
                const kickForce = p.isSprinting ? 14 : 8; 
                ball.vx = Math.cos(angle) * kickForce;
                ball.vy = Math.sin(angle) * kickForce;
            }
        }

        // Pantulan tembok atas bawah
        if (ball.y < 10) { ball.y = 10; ball.vy *= -0.8; }
        if (ball.y > CANVAS_HEIGHT - 10) { ball.y = CANVAS_HEIGHT - 10; ball.vy *= -0.8; }

        // Deteksi Gol
        if (ball.x < 10) {
            if (ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM) {
                room.score.red += 1;
                room.state = 'goal';
                room.lastScorer = 'TIM MERAH';
                io.to(roomId).emit('goalScored', room);
                setTimeout(() => resetPosition(room), 3000); // Jeda 3 detik setelah gol
            } else {
                ball.x = 10; ball.vx *= -0.8;
            }
        }
        if (ball.x > CANVAS_WIDTH - 10) {
            if (ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM) {
                room.score.blue += 1;
                room.state = 'goal';
                room.lastScorer = 'TIM BIRU';
                io.to(roomId).emit('goalScored', room);
                setTimeout(() => resetPosition(room), 3000);
            } else {
                ball.x = CANVAS_WIDTH - 10; ball.vx *= -0.8;
            }
        }

        // Kirim data ke client
        if (Object.keys(room.players).length === 2) {
            io.to(roomId).emit('updateState', room);
        }
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
