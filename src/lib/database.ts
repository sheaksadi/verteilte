import Database from '@tauri-apps/plugin-sql';

export interface Word {
  id?: number;
  original: string;
  translation: string;
  article: string;
  score: number;
  createdAt: number;
  lastReviewedAt: number;
  nextReviewAt: number;
}

let db: Database | null = null;
let inMemoryWords: Word[] = [];
let nextId = 1;

const DEFAULT_WORDS: Word[] = [];

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function initDatabase(): Promise<Database | null> {
  if (!isTauri()) {
    // In browser mode, use in-memory storage
    // No default words - start empty
    return null;
  }

  if (!db) {
    try {
      console.log('Attempting to load SQLite database...');
      db = await Database.load('sqlite:words.db');
      console.log('Database loaded successfully');
    } catch (error) {
      console.error('Error initializing database:', error);
      throw error;
    }
  }
  return db;
}

// Alias for consistency
export async function getDatabase(): Promise<Database | null> {
  return initDatabase();
}

export async function getAllWords(): Promise<Word[]> {
  const database = await initDatabase();
  
  if (!database) {
    // In-memory mode - sort by nextReviewAt
    return [...inMemoryWords].sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  }
  
  const result = await database.select<Word[]>('SELECT * FROM words ORDER BY nextReviewAt ASC');
  return result;
}

export async function addWord(word: Omit<Word, 'id'>): Promise<number> {
  const database = await initDatabase();
  const now = Date.now();
  
  if (!database) {
    // In-memory mode
    const newWord: Word = { 
      ...word, 
      id: nextId++,
      score: word.score ?? 0,
      createdAt: word.createdAt ?? now,
      lastReviewedAt: word.lastReviewedAt ?? 0,
      nextReviewAt: word.nextReviewAt ?? now
    };
    inMemoryWords.unshift(newWord);
    return newWord.id!;
  }
  
  const result = await database.execute(
    'INSERT INTO words (original, translation, article, score, createdAt, lastReviewedAt, nextReviewAt) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [
      word.original, 
      word.translation, 
      word.article || '', 
      word.score ?? 0, 
      word.createdAt ?? now, 
      word.lastReviewedAt ?? 0, 
      word.nextReviewAt ?? now
    ]
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

// Calculate next review time based on score (exponential backoff)
// Bad: -1, Good: 0, Great: +1
// Using improved spaced repetition intervals:
// - Bad (again): 10 minutes (reset)
// - Good: 2.5x multiplier, starting at 1 hour
// - Great: 3x multiplier, starting at 1 hour
function calculateNextReview(score: number): number {
  const now = Date.now();
  
  // Score 0 means this is first review or was marked bad
  if (score === 0) {
    return now + 10 * 60 * 1000; // 10 minutes
  }
  
  // For positive scores, use exponential growth
  const baseInterval = 60 * 60 * 1000; // 1 hour base
  const interval = baseInterval * Math.pow(2.5, score - 1);
  return now + interval;
}

// Update word score and review times
export async function updateWordReview(id: number, scoreChange: number): Promise<void> {
  const database = await initDatabase();
  const now = Date.now();
  
  if (!database) {
    // In-memory mode
    const word = inMemoryWords.find(w => w.id === id);
    if (word) {
      word.score = Math.max(0, word.score + scoreChange);
      word.lastReviewedAt = now;
      word.nextReviewAt = calculateNextReview(word.score);
    }
    return;
  }
  
  // Get current score
  const result = await database.select<Array<{ score: number }>>('SELECT score FROM words WHERE id = $1', [id]);
  if (result.length === 0) return;
  
  const newScore = Math.max(0, result[0].score + scoreChange);
  const nextReviewAt = calculateNextReview(newScore);
  
  await database.execute(
    'UPDATE words SET score = $1, lastReviewedAt = $2, nextReviewAt = $3 WHERE id = $4',
    [newScore, now, nextReviewAt, id]
  );
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
      await addWord({ 
        original, 
        translation, 
        article, 
        score: 0, 
        createdAt: Date.now(), 
        lastReviewedAt: 0, 
        nextReviewAt: Date.now() 
      });
      existingSet.add(key); // Add to set to avoid duplicates in same import
      added++;
    } catch (error) {
      errors.push(`Line ${i + 1}: Failed to add word - ${error}`);
    }
  }
  
  return { added, skipped, errors };
}

// Reset all words to score 0 and make them due now
export async function resetAllWords(): Promise<void> {
  const database = await initDatabase();
  const now = Date.now();
  
  if (!database) {
    // In-memory mode
    inMemoryWords = inMemoryWords.map(word => ({
      ...word,
      score: 0,
      lastReviewedAt: now,
      nextReviewAt: now
    }));
    return;
  }
  
  // Database mode
  await database.execute(
    'UPDATE words SET score = 0, lastReviewedAt = $1, nextReviewAt = $1',
    [now]
  );
}
