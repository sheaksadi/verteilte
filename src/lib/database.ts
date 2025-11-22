import Database from '@tauri-apps/plugin-sql';

export interface Word {
  id: string; // UUID
  original: string;
  translation: string;
  article: string;
  score: number;
  createdAt: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

let db: Database | null = null;
let inMemoryWords: Word[] = [];

const DEFAULT_WORDS: Word[] = [];
const STORAGE_KEY = 'verteilte_words_db';
const SETTINGS_KEY = 'verteilte_settings';

export interface AlgorithmSettings {
  intervals: Record<number, number>; // score -> ms
  maxScore: number;
  maxScoreBehavior: 'cap' | 'archive'; // 'cap' = stay at max, 'archive' = stop reviewing
}

export const DEFAULT_ALGORITHM_SETTINGS: AlgorithmSettings = {
  intervals: {
    0: 10 * 60 * 1000,             // 10 mins
    1: 4 * 60 * 60 * 1000,         // 4 hours
    2: 12 * 60 * 60 * 1000,        // 12 hours
    3: 24 * 60 * 60 * 1000,        // 1 day
    4: 2 * 24 * 60 * 60 * 1000,    // 2 days
    5: 3 * 24 * 60 * 60 * 1000,    // 3 days
    6: 5 * 24 * 60 * 60 * 1000,    // 5 days
    7: 10 * 24 * 60 * 60 * 1000,   // 10 days
    8: 25 * 24 * 60 * 60 * 1000,   // 25 days
    9: 50 * 24 * 60 * 60 * 1000,   // 50 days
    10: 90 * 24 * 60 * 60 * 1000   // 90 days
  },
  maxScore: 10,
  maxScoreBehavior: 'cap'
};

// Backwards compatibility export, but now it should ideally read from settings if possible.
// However, for direct imports where async isn't possible, we might need to rely on the store or a getter.
// For now, I'll export the default as SCORE_INTERVALS to avoid breaking other files immediately,
// but I will deprecate its direct usage in favor of `getAlgorithmSettings`.
export const SCORE_INTERVALS = DEFAULT_ALGORITHM_SETTINGS.intervals;

let inMemorySettings: AlgorithmSettings = { ...DEFAULT_ALGORITHM_SETTINGS };

function saveSettingsToStorage() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(inMemorySettings));
  }
}

function loadSettingsFromStorage() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all fields exist
        inMemorySettings = { ...DEFAULT_ALGORITHM_SETTINGS, ...parsed };
        // Ensure intervals is a proper object (if partial)
        inMemorySettings.intervals = { ...DEFAULT_ALGORITHM_SETTINGS.intervals, ...parsed.intervals };
      } catch (e) {
        console.error('Failed to parse stored settings', e);
      }
    }
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function generateUUID(): string {
  return crypto.randomUUID();
}

export async function initDatabase(): Promise<Database | null> {
  if (!isTauri()) {
    if (inMemoryWords.length === 0) {
      loadFromStorage();
    }
    loadSettingsFromStorage();
    return null;
  }

  if (!db) {
    try {
      console.log('Attempting to load SQLite database...');
      db = await Database.load('sqlite:words.db');

      // Load settings from local storage even in Tauri mode for now
      loadSettingsFromStorage();

      // Migration: Check if table has new schema
      try {
        // Check if id is text
        // This is a simplified check. Ideally we'd check schema version.
        // For now, we'll try to create the table with new schema if it doesn't exist
        // If it exists with old schema, we might need to migrate.

        // Let's check if 'updatedAt' column exists
        const result = await db.select<any[]>('PRAGMA table_info(words)');
        const hasUpdatedAt = result.some(col => col.name === 'updatedAt');

        if (!hasUpdatedAt) {
          console.log('Migrating database to new schema...');
          // Old schema detected. We need to migrate.
          // 1. Rename old table
          // 2. Create new table
          // 3. Copy data

          // Check if words table exists first
          const tables = await db.select<any[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='words'");

          if (tables.length > 0) {
            await db.execute('ALTER TABLE words RENAME TO words_old');

            // Create new table
            await db.execute(`
                    CREATE TABLE words (
                        id TEXT PRIMARY KEY,
                        original TEXT NOT NULL,
                        translation TEXT NOT NULL,
                        article TEXT DEFAULT '',
                        score INTEGER DEFAULT 0,
                        createdAt INTEGER NOT NULL,
                        lastReviewedAt INTEGER DEFAULT 0,
                        nextReviewAt INTEGER NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        deletedAt INTEGER DEFAULT NULL
                    )
                `);

            // Copy data
            const oldWords = await db.select<any[]>('SELECT * FROM words_old');
            const now = Date.now();

            for (const w of oldWords) {
              await db.execute(
                'INSERT INTO words (id, original, translation, article, score, createdAt, lastReviewedAt, nextReviewAt, updatedAt, deletedAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                [
                  generateUUID(),
                  w.original,
                  w.translation,
                  w.article || '',
                  w.score || 0,
                  w.createdAt || now,
                  w.lastReviewedAt || 0,
                  w.nextReviewAt || now,
                  now, // updatedAt
                  null // deletedAt
                ]
              );
            }

            await db.execute('DROP TABLE words_old');
            console.log('Migration complete.');
          } else {
            // Table doesn't exist, just create it
            await db.execute(`
                    CREATE TABLE IF NOT EXISTS words (
                        id TEXT PRIMARY KEY,
                        original TEXT NOT NULL,
                        translation TEXT NOT NULL,
                        article TEXT DEFAULT '',
                        score INTEGER DEFAULT 0,
                        createdAt INTEGER NOT NULL,
                        lastReviewedAt INTEGER DEFAULT 0,
                        nextReviewAt INTEGER NOT NULL,
                        updatedAt INTEGER NOT NULL,
                        deletedAt INTEGER DEFAULT NULL
                    )
                `);
          }
        }
      } catch (e) {
        console.error('Migration check failed:', e);
        // Fallback create if not exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS words (
                id TEXT PRIMARY KEY,
                original TEXT NOT NULL,
                translation TEXT NOT NULL,
                article TEXT DEFAULT '',
                score INTEGER DEFAULT 0,
                createdAt INTEGER NOT NULL,
                lastReviewedAt INTEGER DEFAULT 0,
                nextReviewAt INTEGER NOT NULL,
                updatedAt INTEGER NOT NULL,
                deletedAt INTEGER DEFAULT NULL
            )
        `);
      }

      console.log('Database loaded successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
  return db;
}

export async function getAlgorithmSettings(): Promise<AlgorithmSettings> {
  // Ensure loaded
  if (Object.keys(inMemorySettings.intervals).length === 0) {
    loadSettingsFromStorage();
  }
  return { ...inMemorySettings };
}

export async function saveAlgorithmSettings(settings: AlgorithmSettings): Promise<void> {
  inMemorySettings = { ...settings };
  saveSettingsToStorage();
}

// Alias for consistency
export async function getDatabase(): Promise<Database | null> {
  return initDatabase();
}

export async function getAllWords(): Promise<Word[]> {
  const database = await initDatabase();

  if (!database) {
    return [...inMemoryWords].filter(w => !w.deletedAt).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  }

  const result = await database.select<Word[]>('SELECT * FROM words WHERE deletedAt IS NULL ORDER BY nextReviewAt ASC');
  return result;
}

export async function getWordsForSync(lastSync: number): Promise<Word[]> {
  const database = await initDatabase();
  if (!database) {
    return inMemoryWords.filter(w => w.updatedAt > lastSync);
  }
  return await database.select<Word[]>('SELECT * FROM words WHERE updatedAt > $1', [lastSync]);
}

export async function upsertWords(words: Word[]): Promise<void> {
  const database = await initDatabase();

  if (!database) {
    for (const w of words) {
      const index = inMemoryWords.findIndex(existing => existing.id === w.id);
      if (index >= 0) {
        inMemoryWords[index] = w;
      } else {
        inMemoryWords.push(w);
      }
    }
    saveToStorage();
    return;
  }

  for (const w of words) {
    await database.execute(
      `INSERT INTO words (id, original, translation, article, score, createdAt, lastReviewedAt, nextReviewAt, updatedAt, deletedAt)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT(id) DO UPDATE SET
             original = $2, translation = $3, article = $4, score = $5, createdAt = $6, lastReviewedAt = $7, nextReviewAt = $8, updatedAt = $9, deletedAt = $10`,
      [w.id, w.original, w.translation, w.article, w.score, w.createdAt, w.lastReviewedAt, w.nextReviewAt, w.updatedAt, w.deletedAt]
    );
  }
}

export async function addWord(word: Omit<Word, 'id' | 'updatedAt' | 'deletedAt'>): Promise<string> {
  const database = await initDatabase();
  const now = Date.now();
  const newId = generateUUID();

  if (!database) {
    const newWord: Word = {
      ...word,
      id: newId,
      score: word.score ?? 0,
      createdAt: word.createdAt ?? now,
      lastReviewedAt: word.lastReviewedAt ?? 0,
      nextReviewAt: word.nextReviewAt ?? now,
      updatedAt: now,
      deletedAt: null
    };
    inMemoryWords.unshift(newWord);
    saveToStorage();
    return newId;
  }

  await database.execute(
    'INSERT INTO words (id, original, translation, article, score, createdAt, lastReviewedAt, nextReviewAt, updatedAt, deletedAt) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
    [
      newId,
      word.original,
      word.translation,
      word.article || '',
      word.score ?? 0,
      word.createdAt ?? now,
      word.lastReviewedAt ?? 0,
      word.nextReviewAt ?? now,
      now,
      null
    ]
  );
  return newId;
}

export async function deleteWord(id: string): Promise<void> {
  const database = await initDatabase();
  const now = Date.now();

  if (!database) {
    const index = inMemoryWords.findIndex(w => w.id === id);
    if (index >= 0) {
      inMemoryWords[index].deletedAt = now;
      inMemoryWords[index].updatedAt = now;
      saveToStorage();
    }
    return;
  }

  await database.execute('UPDATE words SET deletedAt = $1, updatedAt = $1 WHERE id = $2', [now, id]);
}

function saveToStorage() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inMemoryWords));
  }
}

function loadFromStorage() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        inMemoryWords = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse stored words', e);
      }
    }
  }
}

function calculateNextReview(score: number): number {
  const now = Date.now();

  // If archived, return a far future date (or handle differently)
  // But for now, just use max score behavior

  // Cap score at maxScore, default to 0 if negative
  const maxScore = inMemorySettings.maxScore;
  const effectiveScore = Math.max(0, Math.min(maxScore, score));

  // Get interval from settings, fallback to max score interval
  const interval = inMemorySettings.intervals[effectiveScore] || inMemorySettings.intervals[maxScore] || (24 * 60 * 60 * 1000);

  return now + interval;
}

export async function updateWordReview(id: string, scoreChange: number): Promise<void> {
  const database = await initDatabase();
  const now = Date.now();
  const maxScore = inMemorySettings.maxScore;

  if (!database) {
    const word = inMemoryWords.find(w => w.id === id);
    if (word) {
      let newScore = word.score + scoreChange;

      // Apply max score behavior
      if (newScore > maxScore) {
        if (inMemorySettings.maxScoreBehavior === 'archive') {
          // For now, just cap it, but maybe we should mark it?
          // We don't have an 'archived' state yet.
          newScore = maxScore;
        } else {
          newScore = maxScore;
        }
      }

      word.score = Math.max(0, newScore);
      word.lastReviewedAt = now;
      word.nextReviewAt = calculateNextReview(word.score);
      word.updatedAt = now;
      saveToStorage();
    }
    return;
  }

  const result = await database.select<Array<{ score: number }>>('SELECT score FROM words WHERE id = $1', [id]);
  if (result.length === 0) return;

  const currentScore = result[0].score;
  let newScore = currentScore + scoreChange;

  if (newScore > maxScore) {
    newScore = maxScore;
  }

  newScore = Math.max(0, newScore);

  const nextReviewAt = calculateNextReview(newScore);

  await database.execute(
    'UPDATE words SET score = $1, lastReviewedAt = $2, nextReviewAt = $3, updatedAt = $2 WHERE id = $4',
    [newScore, now, nextReviewAt, id]
  );
}

export async function exportWords(): Promise<string> {
  const words = await getAllWords();

  if (words.length === 0) {
    return '# No words to export\n# Format: original | translation | article\n# Example: Haus | House | das\n';
  }

  let output = '# Exported words from Verteilte\n';
  output += `# Date: ${new Date().toISOString().split('T')[0]}\n`;
  output += '# Format: original | translation | article\n';
  output += '# Lines starting with # are comments and will be ignored\n\n';

  for (const word of words) {
    output += `${word.original} | ${word.translation} | ${word.article || ''}\n`;
  }

  return output;
}

export async function importWords(text: string): Promise<{ added: number; skipped: number; errors: string[] }> {
  const database = await initDatabase();
  const existingWords = await getAllWords();

  const existingSet = new Set(
    existingWords.map(w => `${w.original.toLowerCase()}|${w.article.toLowerCase()}`)
  );

  const lines = text.split('\n');
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: Invalid format`);
      continue;
    }

    const original = parts[0];
    const translation = parts[1];
    const article = parts.length > 2 ? parts[2] : '';

    if (!original || !translation) {
      errors.push(`Line ${i + 1}: Missing original or translation`);
      continue;
    }

    const key = `${original.toLowerCase()}|${article.toLowerCase()}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    try {
      await addWord({
        original,
        translation,
        article,
        score: 0,
        createdAt: Date.now(),
        lastReviewedAt: 0,
        nextReviewAt: Date.now()
      });
      existingSet.add(key);
      added++;
    } catch (error) {
      errors.push(`Line ${i + 1}: Failed to add word - ${error}`);
    }
  }

  return { added, skipped, errors };
}

export async function resetAllWords(): Promise<void> {
  const database = await initDatabase();
  const now = Date.now();

  if (!database) {
    inMemoryWords = inMemoryWords.map(word => ({
      ...word,
      score: 0,
      lastReviewedAt: now,
      nextReviewAt: now,
      updatedAt: now
    }));
    saveToStorage();
    return;
  }

  await database.execute(
    'UPDATE words SET score = 0, lastReviewedAt = $1, nextReviewAt = $1, updatedAt = $1',
    [now]
  );
}
