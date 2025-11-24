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

import { spawn } from 'child_process';

app.get('/tts', (req, res) => {
    const text = req.query.text as string;
    if (!text) {
        res.status(400).send('Missing text parameter');
        return;
    }

    const startTime = Date.now();
    console.log(`[TTS] Received request for: "${text}"`);

    const piperPath = path.resolve('/app/piper/piper');
    const modelPath = path.resolve('/app/piper-model/de_DE-thorsten-high.onnx');

    // Check if we are running locally (not in docker) for dev fallback
    // But user said "run on server with docker", so we assume paths are correct for docker.
    // If dev environment, paths might differ. 

    console.log(`[TTS] Spawning Piper process...`);

    const piperProcess = spawn(piperPath, [
        '--model', modelPath,
        '--output_file', '-' // Output to stdout
    ]);

    res.setHeader('Content-Type', 'audio/wav');

    piperProcess.stdout.pipe(res);

    piperProcess.stdin.write(text);
    piperProcess.stdin.end();

    piperProcess.stderr.on('data', (data) => {
        // Piper writes some info to stderr even on success, so we log it as debug/info unless it looks like an error
        const msg = data.toString();
        if (msg.includes('Error') || msg.includes('error')) {
            console.error(`[Piper Error]: ${msg}`);
        } else {
            console.log(`[Piper Log]: ${msg.trim()}`);
        }
    });

    piperProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code !== 0) {
            console.error(`[TTS] Failed. Piper process exited with code ${code} after ${duration}ms`);
            // If headers haven't been sent, we could send 500, but stdout might have started.
            if (!res.headersSent) {
                res.status(500).send('TTS Generation Failed');
            }
        } else {
            console.log(`[TTS] Success! Audio generated in ${duration}ms`);
        }
    });
});


import path from 'path';
import os from 'os';

import { migrate } from './db';

// Serve dictionary files
// Serve dictionary files
app.use('/dictionaries', (req, res, next) => {
    console.log(`[Dictionary Request] ${req.method} ${req.url}`);
    next();
}, express.static(path.join(__dirname, '../dictionaries')));

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
