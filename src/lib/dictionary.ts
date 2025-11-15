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

// Search dictionary for autocomplete suggestions (German word search)
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

// Levenshtein distance for fuzzy string matching
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// Search dictionary by English meaning (reverse lookup)
export async function searchByMeaning(query: string, limit: number = 10): Promise<DictionaryEntry[]> {
  console.log('[Dictionary] searchByMeaning called:', { query, limit, hasTauri: isTauri(), hasDb: !!db });
  
  if (!isTauri() || !db) {
    console.log('[Dictionary] Search aborted: no Tauri or no DB');
    return [];
  }

  if (!query || query.trim().length === 0) {
    console.log('[Dictionary] Search aborted: empty query');
    return [];
  }

  try {
    const searchTerm = query.toLowerCase().trim();
    console.log('[Dictionary] Searching for English phrase:', searchTerm);
    
    // Get 200 results that contain the search term, then fuzzy match in TypeScript
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
       WHERE LOWER(meanings) LIKE '%' || $1 || '%'
       ORDER BY LENGTH(word), word
       LIMIT 200`,
      [searchTerm]
    );

    console.log('[Dictionary] Raw query returned', results.length, 'results, fuzzy matching phrases...');
    
    // Parse and score each result using Levenshtein distance on full phrases
    const scoredResults = results.map(row => {
      const meanings = JSON.parse(row.meanings || '[]');
      let bestScore = 999999; // Lower is better for Levenshtein
      let bestMatchType = 'none';
      
      meanings.forEach((meaning: string) => {
        const lowerMeaning = meaning.toLowerCase();
        
        // Split by comma to get distinct phrases
        const phrases = lowerMeaning.split(',').map(p => p.trim()).filter(p => p);
        
        // Check each phrase as a whole
        phrases.forEach((phrase, phraseIndex) => {
          // Calculate distance for the entire phrase
          const distance = levenshteinDistance(searchTerm, phrase);
          
          // Boost score for phrases at earlier positions
          const positionPenalty = phraseIndex * 0.5;
          const finalScore = distance + positionPenalty;
          
          if (finalScore < bestScore) {
            bestScore = finalScore;
            if (distance === 0) bestMatchType = 'exact';
            else if (phrase.startsWith(searchTerm)) bestMatchType = 'prefix';
            else bestMatchType = 'fuzzy';
          }
        });
      });
      
      return {
        word: row.word,
        pronunciation: row.pronunciation || undefined,
        gender: row.gender || undefined,
        meanings,
        notes: JSON.parse(row.notes || '[]'),
        synonyms: JSON.parse(row.synonyms || '[]'),
        seeAlso: JSON.parse(row.seeAlso || '[]'),
        score: bestScore,
        matchType: bestMatchType,
        wordLength: row.word.length
      };
    })
    .filter(entry => entry.score < 999999) // Only keep entries with matches
    .sort((a, b) => {
      // Sort by score first (lower is better), then by word length
      if (a.score !== b.score) return a.score - b.score;
      return a.wordLength - b.wordLength;
    })
    .slice(0, limit)
    .map(({ score, matchType, wordLength, ...entry }) => entry); // Remove score/matchType/wordLength from final results
    
    console.log('[Dictionary] Returning', scoredResults.length, 'best phrase matches');
    if (scoredResults.length > 0) {
      console.log('[Dictionary] First result:', scoredResults[0].word, 'Meanings:', scoredResults[0].meanings);
    }
    
    return scoredResults;
  } catch (error) {
    console.error('[Dictionary] Meaning search failed:', error);
    return [];
  }
}
