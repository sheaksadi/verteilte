import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';

export interface DictionaryEntry {
  word: string;
  pronunciation?: string;
  gender?: string;
  meanings: string[];
  notes: string[];
  synonyms: string[];
  seeAlso: string[];
}

export interface DictionaryInfo {
  version: string;
  path: string;
  exists: boolean;
  logs: string[];
}

let db: Database | null = null;

// Check if running in Tauri
function isTauri(): boolean {
  const hasTauriInternals = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const hasTauriMetadata = typeof window !== 'undefined' && '__TAURI_METADATA__' in window;
  return hasTauriInternals || hasTauriMetadata;
}

// Initialize dictionary database (call this on app startup)
export async function initializeDictionary(): Promise<DictionaryInfo | null> {
  try {
    console.log('[Dictionary] Attempting to initialize...');
    
    // Try to invoke the command - if it fails, we're not in Tauri
    const info = await invoke<DictionaryInfo>('ensure_dictionary_db');
    console.log('[Dictionary] Database ready:', info);
    
    // Load the database connection using the absolute path from info
    // Remove the file:// prefix if present and use sqlite: protocol
    const dbPath = info.path.replace('file://', '');
    console.log('[Dictionary] Loading DB from path:', dbPath);
    
    db = await Database.load(`sqlite:${dbPath}`);
    console.log('[Dictionary] Database connection established');
    
    return info;
  } catch (error) {
    // Check if it's a "not in Tauri" error vs actual initialization error
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('__TAURI_INTERNALS__') || errorMsg.includes('not available')) {
      console.log('[Dictionary] Not running in Tauri, skipping initialization');
      return null;
    }
    
    console.error('[Dictionary] Failed to initialize:', error);
    throw error;
  }
}

// Search dictionary for autocomplete suggestions
export async function searchDictionary(query: string, limit: number = 10): Promise<DictionaryEntry[]> {
  console.log('[Dictionary] searchDictionary called:', { query, limit, hasTauri: isTauri(), hasDb: !!db });
  
  if (!isTauri() || !db) {
    console.log('[Dictionary] Search aborted: no Tauri or no DB');
    return [];
  }

  if (!query || query.trim().length === 0) {
    console.log('[Dictionary] Search aborted: empty query');
    return [];
  }

  try {
    const searchPattern = `${query.toLowerCase()}%`;
    console.log('[Dictionary] Searching with pattern:', searchPattern);
    
    const results = await db.select<Array<{
      word: string;
      pronunciation: string | null;
      gender: string | null;
      meanings: string;
      notes: string;
      synonyms: string;
      seeAlso: string;
    }>>(
      `SELECT word, pronunciation, gender, meanings, notes, synonyms, seeAlso 
       FROM dictionary 
       WHERE LOWER(word) LIKE $1 
       ORDER BY LENGTH(word), word
       LIMIT $2`,
      [searchPattern, limit]
    );

    console.log('[Dictionary] Query returned', results.length, 'results');
    
    const entries = results.map(row => ({
      word: row.word,
      pronunciation: row.pronunciation || undefined,
      gender: row.gender || undefined,
      meanings: JSON.parse(row.meanings || '[]'),
      notes: JSON.parse(row.notes || '[]'),
      synonyms: JSON.parse(row.synonyms || '[]'),
      seeAlso: JSON.parse(row.seeAlso || '[]'),
    }));
    
    console.log('[Dictionary] Returning', entries.length, 'entries');
    if (entries.length > 0) {
      console.log('[Dictionary] First result:', entries[0].word);
    }
    
    return entries;
  } catch (error) {
    console.error('[Dictionary] Search failed:', error);
    return [];
  }
}
