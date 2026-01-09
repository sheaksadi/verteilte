import { Router, Request, Response } from 'express';
import { authenticateToken } from './auth';
import { query } from './db';

const router = Router();

interface SyncWord {
    id: string;
    original: string;
    translation: string;
    article: string;
    language: string;
    score: number;
    createdAt: number;
    lastReviewedAt: number;
    nextReviewAt: number;
    updatedAt: number;
    deletedAt: number | null;
}

interface SyncPracticeStats {
    date: string;
    count: number;
    updatedAt: number;
}

interface SyncRequest {
    lastSyncTimestamp: number;
    changes: SyncWord[];
    practiceStats?: SyncPracticeStats[];
}

router.post('/', authenticateToken, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { lastSyncTimestamp, changes, practiceStats } = req.body as SyncRequest;

    if (typeof lastSyncTimestamp !== 'number' || !Array.isArray(changes)) {
        return res.status(400).json({ error: 'Invalid sync request format' });
    }

    const client = await import('./db').then(m => m.getClient());

    try {
        await client.query('BEGIN');

        const now = Date.now();

        // 1. Apply client changes
        for (const word of changes) {
            // Ensure the word belongs to the user or is new
            // We trust the client's ID if it's a UUID. If it's a new word, client should generate UUID.

            // Default language to 'de' if missing (for backward compatibility)
            const lang = word.language || 'de';

            if (word.deletedAt) {
                // Soft delete
                await client.query(
                    `INSERT INTO words (id, user_id, original, translation, article, language, score, created_at, last_reviewed_at, next_review_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             deleted_at = $12,
             updated_at = $11`,
                    [word.id, user.id, word.original, word.translation, word.article, lang, word.score, word.createdAt, word.lastReviewedAt, word.nextReviewAt, now, word.deletedAt]
                );
            } else {
                // Upsert
                await client.query(
                    `INSERT INTO words (id, user_id, original, translation, article, language, score, created_at, last_reviewed_at, next_review_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
           ON CONFLICT (id) DO UPDATE SET
             original = $3,
             translation = $4,
             article = $5,
             language = $6,
             score = $7,
             created_at = $8,
             last_reviewed_at = $9,
             next_review_at = $10,
             updated_at = $11,
             deleted_at = NULL
             WHERE words.user_id = $2`, // Ensure we only update if it belongs to user
                    [word.id, user.id, word.original, word.translation, word.article, lang, word.score, word.createdAt, word.lastReviewedAt, word.nextReviewAt, now]
                );
            }
        }

        // 2. Fetch server changes
        const result = await client.query(
            `SELECT id, original, translation, article, language, score, created_at, last_reviewed_at, next_review_at, updated_at, deleted_at
       FROM words
       WHERE user_id = $1 AND updated_at > $2 AND updated_at <= $3`,
            [user.id, lastSyncTimestamp, now]
        );

        const serverChanges = result.rows.map(row => ({
            id: row.id,
            original: row.original,
            translation: row.translation,
            article: row.article,
            language: row.language,
            score: row.score,
            createdAt: parseInt(row.created_at),
            lastReviewedAt: parseInt(row.last_reviewed_at),
            nextReviewAt: parseInt(row.next_review_at),
            updatedAt: parseInt(row.updated_at),
            deletedAt: row.deleted_at ? parseInt(row.deleted_at) : null
        }));

        // 3. Apply client practice stats
        if (practiceStats && Array.isArray(practiceStats)) {
            for (const stat of practiceStats) {
                // Upsert with "higher count wins" strategy
                await client.query(
                    `INSERT INTO practice_stats (user_id, date, count, updated_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, date) DO UPDATE SET
                       count = CASE WHEN $3 > practice_stats.count THEN $3 ELSE practice_stats.count END,
                       updated_at = CASE WHEN $4 > practice_stats.updated_at THEN $4 ELSE practice_stats.updated_at END`,
                    [user.id, stat.date, stat.count, stat.updatedAt]
                );
            }
        }

        // 4. Fetch server practice stats changes
        const statsResult = await client.query(
            `SELECT date, count, updated_at FROM practice_stats
             WHERE user_id = $1 AND updated_at > $2 AND updated_at <= $3`,
            [user.id, lastSyncTimestamp, now]
        );

        const serverPracticeStats = statsResult.rows.map(row => ({
            date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
            count: row.count,
            updatedAt: parseInt(row.updated_at)
        }));

        await client.query('COMMIT');

        res.json({
            timestamp: now,
            changes: serverChanges,
            practiceStats: serverPracticeStats
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

export default router;
