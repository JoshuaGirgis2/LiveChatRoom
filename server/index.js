require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// AWS configuration
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

// Use CORS middleware
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Function to save messages to DynamoDB
const saveMessage = async (username, message, room) => {
    const timestamp = new Date().toISOString();
    const params = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        Item: {
            id: `${Date.now()}`, // Corrected template literal for id
            room: room,
            username: username,
            message: message,
            timestamp: timestamp,
        },
    };

    try {
        await dynamoDB.put(params).promise();
        console.log('Message saved successfully:', params.Item);
    } catch (error) {
        console.error('Error saving message:', error);
    }
};

// Fetch last 100 messages from a specific room
const fetchLast100Messages = async (room) => {
    const params = {
        TableName: process.env.DYNAMODB_TABLE_NAME,
        IndexName: 'RoomIndex',
        KeyConditionExpression: 'room = :room',
        ExpressionAttributeValues: {
            ':room': room,
        },
        ScanIndexForward: false, // Sort in descending order (newest first)
        Limit: 100,
    };

    try {
        const data = await dynamoDB.query(params).promise();
        return data.Items.reverse(); // Reverse to get oldest messages first
    } catch (error) {
        console.error('Error fetching messages:', error);
        return [];
    }
};

// In-memory map to store user info
let allUsers = new Map();
const CHAT_BOT = 'ChatBot';

// Socket.IO logic
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`); // Corrected template literal

    // Handle join room
    socket.on('join_room', async ({ username, room }) => {
        // Check if the user is already in the room
        if (socket.room === room) {
            console.log(`${username} is already in room: ${room}`); // Corrected template literal
            return;
        }

        console.log(`${username} is joining room: ${room}`); // Corrected template literal

        // Leave the current room if any
        if (socket.room) {
            socket.leave(socket.room);
            const oldUserKey = `${socket.username}-${socket.room}`; // Corrected template literal
            allUsers.delete(oldUserKey);
        }

        socket.join(room);

        // Set the username and room on the socket object
        socket.username = username;
        socket.room = room;

        // Add user to allUsers map
        const userKey = `${username}-${room}`; // Corrected template literal
        allUsers.set(userKey, { username, room, socketId: socket.id });

        // Broadcast updated user list to the room
        const chatRoomUsers = Array.from(allUsers.values()).filter(user => user.room === room);
        io.in(room).emit('chatroom_users', chatRoomUsers);

        const __createdtime__ = Date.now();

        // Send welcome message only to the user who joined
        socket.emit('receive_message', {
            message: `Welcome ${username}`, // Corrected template literal
            username: CHAT_BOT,
            __createdtime__,
        });

        // Notify other users in the room
        socket.to(room).emit('receive_message', {
            message: `${username} has joined the chat room`, // Corrected template literal
            username: CHAT_BOT,
            __createdtime__,
        });

        // Save join message to DynamoDB
        await saveMessage(CHAT_BOT, `${username} has joined the chat room`, room); // Corrected template literal

        // Fetch last 100 messages and send to the user
        try {
            const last100Messages = await fetchLast100Messages(room);
            socket.emit('last_100_messages', JSON.stringify(last100Messages));
        } catch (error) {
            console.error('Error fetching last 100 messages:', error);
        }
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
        const { message, username, room } = data;
        const __createdtime__ = Date.now();

        console.log(`Message from ${username} in room ${room}: ${message}`); // Corrected template literal

        // Emit message to room
        io.in(room).emit('receive_message', {
            message: message,
            username: username,
            __createdtime__: __createdtime__,
        });

        // Save the message to DynamoDB
        await saveMessage(username, message, room);
    });

    // Handle user disconnect
    socket.on('disconnect', async () => {
        if (socket.username && socket.room) {
            const userKey = `${socket.username}-${socket.room}`; // Corrected template literal
            allUsers.delete(userKey);

            // Notify room about user leaving
            const chatRoomUsers = Array.from(allUsers.values()).filter(u => u.room === socket.room);
            io.in(socket.room).emit('chatroom_users', chatRoomUsers);
            io.in(socket.room).emit('receive_message', {
                message: `${socket.username} has left the chat room`, // Corrected template literal
                username: CHAT_BOT,
                __createdtime__: Date.now(),
            });

            // Save leave message to DynamoDB
            await saveMessage(CHAT_BOT, `${socket.username} has left the chat room`, socket.room); // Corrected template literal

            console.log(`${socket.username} has disconnected from room: ${socket.room}`); // Corrected template literal
        }
    });
});

// Start the server
server.listen(4000, () => console.log('Server running on port 4000'));
