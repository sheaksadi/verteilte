import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();

import fs from 'fs';
import path from 'path';

export const migrate = async () => {
    try {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await query(schema);

        // Check if language column exists
        try {
            await query('SELECT language FROM words LIMIT 1');
        } catch (e) {
            console.log('Adding language column to words table...');
            await query("ALTER TABLE words ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'de'");
        }

        // Always ensure index exists
        await query("CREATE INDEX IF NOT EXISTS idx_words_language ON words(language)");

        console.log('Migration successful');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};
