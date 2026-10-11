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

// Konstanta Game
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GOAL_TOP = 150;
const GOAL_BOTTOM = 250;

function resetPosition(room) {
    room.ball = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 };
    const playerIds = Object.keys(room.players);
    if(playerIds[0]) {
        room.players[playerIds[0]].x = 200;
        room.players[playerIds[0]].y = 300;
    }
    if(playerIds[1]) {
        room.players[playerIds[1]].x = 600;
        room.players[playerIds[1]].y = 300;
    }
}

io.on('connection', (socket) => {
    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                players: {}, 
                ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0 },
                score: { blue: 0, red: 0 }
            };
            socket.join(roomId);
            // Player 1 (Blue - Kiri)
            rooms[roomId].players[socket.id] = { x: 200, y: 300, color: '#3498db', team: 'blue' };
            socket.emit('roomCreated', roomId);
        } else {
            socket.emit('errorMsg', 'Room sudah ada!');
        }
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && Object.keys(rooms[roomId].players).length < 2) {
            socket.join(roomId);
            // Player 2 (Red - Kanan)
            rooms[roomId].players[socket.id] = { x: 600, y: 300, color: '#e74c3c', team: 'red' };
            io.to(roomId).emit('gameStart', rooms[roomId]);
        } else {
            socket.emit('errorMsg', 'Room penuh atau tidak ditemukan!');
        }
    });

    socket.on('move', (data) => {
        const { roomId, x, y } = data;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].x = x;
            rooms[roomId].players[socket.id].y = y;
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                io.to(roomId).emit('playerLeft');
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId]; 
                }
            }
        }
    });
});

// Game Loop Server (60 FPS) untuk Fisika Bola
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const ball = room.ball;

        // Terapkan kecepatan bola & gesekan rumput
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= 0.97; // Gesekan (melambat)
        ball.vy *= 0.97;

        // Deteksi tabrakan Pemain dengan Bola
        for (const id in room.players) {
            const p = room.players[id];
            const dx = ball.x - p.x;
            const dy = ball.y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Radius pemain 20, radius bola 10 (Total jarak tabrakan = 30)
            if (distance < 30) {
                const angle = Math.atan2(dy, dx);
                const kickForce = 8; // Kekuatan tendangan
                ball.vx = Math.cos(angle) * kickForce;
                ball.vy = Math.sin(angle) * kickForce;
            }
        }

        // Pantulan Bola ke Tembok Atas & Bawah
        if (ball.y < 10) { ball.y = 10; ball.vy *= -1; }
        if (ball.y > CANVAS_HEIGHT - 10) { ball.y = CANVAS_HEIGHT - 10; ball.vy *= -1; }

        // Deteksi Gol atau Pantulan Tembok Kiri/Kanan
        if (ball.x < 10) {
            if (ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM) {
                room.score.red += 1; // Bola masuk gawang kiri (gol untuk Merah)
                resetPosition(room);
            } else {
                ball.x = 10; ball.vx *= -1;
            }
        }
        if (ball.x > CANVAS_WIDTH - 10) {
            if (ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM) {
                room.score.blue += 1; // Bola masuk gawang kanan (gol untuk Biru)
                resetPosition(room);
            } else {
                ball.x = CANVAS_WIDTH - 10; ball.vx *= -1;
            }
        }

        // Kirim update state ke semua pemain di room
        if (Object.keys(room.players).length === 2) {
            io.to(roomId).emit('updateState', room);
        }
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
