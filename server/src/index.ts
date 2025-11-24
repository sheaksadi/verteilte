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
            if (!res.headersSent) {
                res.status(500).send('TTS Generation Failed');
            }
        } else {
            console.log(`[TTS] Success! Audio generated in ${duration}ms`);
        }
    });
});

app.post('/tts/bulk', async (req, res) => {
    const { texts } = req.body;
    if (!texts || !Array.isArray(texts)) {
        res.status(400).json({ error: 'Missing or invalid "texts" array' });
        return;
    }

    console.log(`[TTS Bulk] Received request for ${texts.length} items`);
    const results: { text: string; audio: string | null; error?: string }[] = [];

    const piperPath = path.resolve('/app/piper/piper');
    const modelPath = path.resolve('/app/piper-model/de_DE-thorsten-high.onnx');

    // Process sequentially to avoid overloading the server
    for (const text of texts) {
        try {
            const audioBase64 = await new Promise<string>((resolve, reject) => {
                const piperProcess = spawn(piperPath, [
                    '--model', modelPath,
                    '--output_file', '-'
                ]);

                let audioChunks: Buffer[] = [];
                piperProcess.stdout.on('data', (chunk) => audioChunks.push(chunk));

                piperProcess.stdin.write(text);
                piperProcess.stdin.end();

                piperProcess.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Piper exited with code ${code}`));
                    } else {
                        const audioBuffer = Buffer.concat(audioChunks);
                        resolve(audioBuffer.toString('base64'));
                    }
                });

                piperProcess.on('error', (err) => reject(err));
            });

            results.push({ text, audio: audioBase64 });
        } catch (error) {
            console.error(`[TTS Bulk] Failed for "${text}":`, error);
            results.push({ text, audio: null, error: String(error) });
        }
    }

    res.json({ results });
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
