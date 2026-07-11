const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

if (!fs.existsSync('messages.json')) {
  fs.writeFileSync('messages.json', JSON.stringify({}));
}

if (!fs.existsSync('rooms.json')) {
  fs.writeFileSync('rooms.json', JSON.stringify([]));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },

  filename: (req, file, cb) => {
    cb(
      null,
      Date.now() + path.extname(file.originalname)
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 100
  }
});

function loadRooms() {
  return JSON.parse(fs.readFileSync('rooms.json'));
}

function saveRooms(rooms) {
  fs.writeFileSync(
    'rooms.json',
    JSON.stringify(rooms, null, 2)
  );
}

function loadMessages() {
  return JSON.parse(fs.readFileSync('messages.json'));
}

function saveMessages(messages) {
  fs.writeFileSync(
    'messages.json',
    JSON.stringify(messages, null, 2)
  );
}

app.get('/rooms', (req, res) => {
  res.json(loadRooms());
});

app.post('/create-room', (req, res) => {

  const rooms = loadRooms();

  const room = {
    id: Date.now(),
    name: req.body.name,
    owner: req.body.owner,
    password: req.body.password || ''
  };

  rooms.push(room);

  saveRooms(rooms);

  res.json(room);
});

app.post('/verify-room', (req, res) => {

  const rooms = loadRooms();

  const room = rooms.find(
    r => r.id == req.body.roomId
  );

  if (!room) {

    return res.json({
      success: false,
      message: '방이 존재하지 않습니다.'
    });
  }

  if (!room.password) {

    return res.json({
      success: true
    });
  }

  if (room.password === req.body.password) {

    return res.json({
      success: true
    });
  }

  res.json({
    success: false,
    message: '비밀번호가 틀렸습니다.'
  });
});

app.post(
  '/upload',
  upload.single('file'),
  (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error: '파일 없음'
      });
    }

    res.json({
      url: '/uploads/' + req.file.filename,
      type: req.file.mimetype,
      original: req.file.originalname
    });
  }
);

const roomUsers = {};

io.on('connection', (socket) => {

  socket.on(
    'joinRoom',
    ({ roomId, nickname }) => {

      socket.join(roomId);

      socket.roomId = roomId;
      socket.nickname = nickname;

      if (!roomUsers[roomId]) {
        roomUsers[roomId] = [];
      }

      roomUsers[roomId] =
        roomUsers[roomId].filter(
          user => user.socketId !== socket.id
        );

      roomUsers[roomId].push({
        socketId: socket.id,
        nickname
      });

      const uniqueUsers = [
        ...new Set(
          roomUsers[roomId].map(
            user => user.nickname
          )
        )
      ];

      const messages = loadMessages();

      io.to(roomId).emit(
        'systemMessage',
        {
          text: `${nickname}님이 입장했습니다.`
        }
      );

      io.to(roomId).emit(
        'userList',
        uniqueUsers
      );

      socket.emit(
        'loadMessages',
        messages[roomId] || []
      );
    }
  );

  socket.on('chatMessage', (data) => {

    const messages = loadMessages();

    if (!messages[data.roomId]) {
      messages[data.roomId] = [];
    }

    messages[data.roomId].push(data);

    saveMessages(messages);

    io.to(data.roomId).emit(
      'chatMessage',
      data
    );
  });

  socket.on('disconnect', () => {

    const roomId = socket.roomId;

    if (
      !roomId ||
      !roomUsers[roomId]
    ) return;

    roomUsers[roomId] =
      roomUsers[roomId].filter(
        user =>
          user.socketId !== socket.id
      );

    const uniqueUsers = [
      ...new Set(
        roomUsers[roomId].map(
          user => user.nickname
        )
      )
    ];

    io.to(roomId).emit(
      'systemMessage',
      {
        text: `${socket.nickname}님이 퇴장했습니다.`
      }
    );

    io.to(roomId).emit(
      'userList',
      uniqueUsers
    );
  });
});

server.listen(PORT, () => {
  console.log(
    'Korea Chat Go Server running'
  );
});
