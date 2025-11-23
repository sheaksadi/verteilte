import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 6900;

app.use(cors());
app.use(express.json());

import authRouter from './auth';
app.use('/auth', authRouter);

import syncRouter from './sync';
app.use('/sync', syncRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ping', (req, res) => {
    console.log('Ping received!');
    res.json({ status: 'ok', message: 'pong' });
});


import path from 'path';
import os from 'os';

import { migrate } from './db';

// Serve dictionary files
app.use('/dictionaries', express.static(path.join(__dirname, '../dictionaries')));

migrate().then(() => {
    app.listen(Number(port), '0.0.0.0', () => {
        const networkInterfaces = os.networkInterfaces();
        const ip = Object.values(networkInterfaces)
            .flat()
            .find((iface) => iface?.family === 'IPv4' && !iface.internal)?.address;

        console.log(`Server running on port ${port}`);
        if (ip) {
            console.log(`Network access: http://${ip}:${port}`);
        }
    });
});
