const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// BERITAHU SERVER BAHWA FILE STATIS ADA DI FOLDER "public"
app.use(express.static(path.join(__dirname, 'public')));

// ARAHKAN RUTE UTAMA KE "public/index.html"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('createRoom', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: {}, ball: { x: 400, y: 300 } };
            socket.join(roomId);
            rooms[roomId].players[socket.id] = { x: 200, y: 300, color: 'blue', score: 0 };
            socket.emit('roomCreated', roomId);
            console.log(`Room ${roomId} created`);
        } else {
            socket.emit('errorMsg', 'Room sudah ada!');
        }
    });

    socket.on('joinRoom', (roomId) => {
        if (rooms[roomId] && Object.keys(rooms[roomId].players).length < 2) {
            socket.join(roomId);
            rooms[roomId].players[socket.id] = { x: 600, y: 300, color: 'red', score: 0 };
            io.to(roomId).emit('gameStart', rooms[roomId]);
            console.log(`Player joined room ${roomId}`);
        } else {
            socket.emit('errorMsg', 'Room penuh atau tidak ditemukan!');
        }
    });

    socket.on('move', (data) => {
        const { roomId, x, y } = data;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].x = x;
            rooms[roomId].players[socket.id].y = y;
            socket.to(roomId).emit('updateState', rooms[roomId]);
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
        console.log('Player disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
