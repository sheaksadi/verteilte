import Database from '@tauri-apps/plugin-sql';

export interface Word {
  id?: number;
  original: string;
  translation: string;
  article: string;
}

let db: Database | null = null;
let inMemoryWords: Word[] = [];
let nextId = 1;

const DEFAULT_WORDS = [
  { original: 'Hallo', translation: 'Hello', article: '' },
  { original: 'Tschüss', translation: 'Goodbye', article: '' },
  { original: 'Danke', translation: 'Thank you', article: '' },
  { original: 'Bitte', translation: 'Please', article: '' },
  { original: 'Haus', translation: 'House', article: 'das' },
  { original: 'Katze', translation: 'Cat', article: 'die' },
  { original: 'Hund', translation: 'Dog', article: 'der' },
];

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function initDatabase(): Promise<Database | null> {
  if (!isTauri()) {
    // In browser mode, use in-memory storage with default words
    if (inMemoryWords.length === 0) {
      inMemoryWords = DEFAULT_WORDS.map((word, index) => ({
        ...word,
        id: index + 1
      }));
      nextId = DEFAULT_WORDS.length + 1;
    }
    return null;
  }

  if (!db) {
    try {
      console.log('Attempting to load SQLite database...');
      db = await Database.load('sqlite:words.db');
      console.log('Database loaded successfully');
      
      // Check if database is empty and seed with default words
      const count = await db.select<Array<{ count: number }>>('SELECT COUNT(*) as count FROM words');
      console.log('Word count in database:', count[0].count);
      
      if (count[0].count === 0) {
        console.log('Database is empty, seeding with default words...');
        for (const word of DEFAULT_WORDS) {
          await db.execute(
            'INSERT INTO words (original, translation, article) VALUES ($1, $2, $3)',
            [word.original, word.translation, word.article]
          );
        }
        console.log('Seeded database with default words');
      }
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
  return db;
}

export async function getAllWords(): Promise<Word[]> {
  const database = await initDatabase();
  
  if (!database) {
    // In-memory mode
    return [...inMemoryWords];
  }
  
  const result = await database.select<Word[]>('SELECT * FROM words ORDER BY created_at DESC');
  return result;
}

export async function addWord(word: Omit<Word, 'id'>): Promise<number> {
  const database = await initDatabase();
  
  if (!database) {
    // In-memory mode
    const newWord: Word = { ...word, id: nextId++ };
    inMemoryWords.unshift(newWord);
    return newWord.id!;
  }
  
  const result = await database.execute(
    'INSERT INTO words (original, translation, article) VALUES ($1, $2, $3)',
    [word.original, word.translation, word.article || '']
  );
  return result.lastInsertId;
}

export async function deleteWord(id: number): Promise<void> {
  const database = await initDatabase();
  
  if (!database) {
    // In-memory mode
    const index = inMemoryWords.findIndex(w => w.id === id);
    if (index >= 0) {
      inMemoryWords.splice(index, 1);
    }
    return;
  }
  
  await database.execute('DELETE FROM words WHERE id = $1', [id]);
}
