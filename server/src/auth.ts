import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from './db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Middleware to authenticate token
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) {
            return res.sendStatus(403);
        }
        (req as any).user = user;
        next();
    });
};

router.post('/register', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    console.log(`Registration attempt for user: ${username} from IP: ${ip}`);

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
            [username, hashedPassword]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

        res.status(201).json({ user, token });
    } catch (error: any) {
        if (error.code === '23505') { // Unique violation
            return res.status(409).json({ error: 'Username already exists' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    console.log(`Login attempt for user: ${username} from IP: ${ip}`);

    try {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);

        // Don't send password hash back
        delete user.password_hash;

        res.json({ user, token });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
