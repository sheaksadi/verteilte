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

// Export words in simple text format: "original | translation | article"
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

// Import words from text format, only adding new entries
export async function importWords(text: string): Promise<{ added: number; skipped: number; errors: string[] }> {
  const database = await initDatabase();
  const existingWords = await getAllWords();
  
  // Create a set of existing words for quick lookup (case-insensitive)
  const existingSet = new Set(
    existingWords.map(w => `${w.original.toLowerCase()}|${w.article.toLowerCase()}`)
  );
  
  const lines = text.split('\n');
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }
    
    // Parse line: "original | translation | article"
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: Invalid format - need at least "original | translation"`);
      continue;
    }
    
    const original = parts[0];
    const translation = parts[1];
    const article = parts.length > 2 ? parts[2] : '';
    
    if (!original || !translation) {
      errors.push(`Line ${i + 1}: Missing original or translation`);
      continue;
    }
    
    // Check if word already exists (case-insensitive)
    const key = `${original.toLowerCase()}|${article.toLowerCase()}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }
    
    // Add the word
    try {
      await addWord({ original, translation, article });
      existingSet.add(key); // Add to set to avoid duplicates in same import
      added++;
    } catch (error) {
      errors.push(`Line ${i + 1}: Failed to add word - ${error}`);
    }
  }
  
  return { added, skipped, errors };
}
