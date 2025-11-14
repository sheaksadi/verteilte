interface DictionaryEntry {
  word: string;
  pronunciation?: string;
  gender?: string;
  meanings?: string[];
  notes?: string[];
  synonyms?: string[];
  seeAlso?: string[];
}

interface SearchResult extends DictionaryEntry {
  score: number;
  matchType: string;
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// Calculate similarity score (0–1)
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return 1 - distance / maxLength;
}

// Fuzzy search
export function fuzzySearch(
  data: DictionaryEntry[],
  searchTerm: string,
  threshold: number = 0.6
): SearchResult[] {
  if (!searchTerm || searchTerm.length === 0) return [];
  
  const results: SearchResult[] = [];

  data.forEach(entry => {
    if (!entry.word || typeof entry.word !== 'string') return;
    if (!entry.word.toLowerCase().startsWith(searchTerm[0].toLowerCase())) return;
    if (Math.abs(entry.word.length - searchTerm.length) > 4) return;

    const wordSimilarity = calculateSimilarity(entry.word, searchTerm);

    const lowerWord = entry.word.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const hasSubstring = lowerWord.includes(lowerSearch) || lowerSearch.includes(lowerWord);
    const finalScore = hasSubstring ? Math.max(wordSimilarity, 0.85) : wordSimilarity;

    if (finalScore >= threshold) {
      results.push({
        ...entry,
        score: finalScore,
        matchType: 'word'
      });
    }
  });

  return results.sort((a, b) => b.score - a.score);
}

// Load and decompress dictionary
export async function loadDictionary(): Promise<DictionaryEntry[]> {
  try {
    // Use public folder path which works for both dev and production
    // Note: Vite automatically decompresses .gz files, so we get JSON directly
    const response = await fetch('/dictionary.json.gz');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dictionary: ${response.status}`);
    }
    
    // Browser automatically decompresses gzipped content
    const data = await response.json();
    
    return data as DictionaryEntry[];
  } catch (error) {
    console.error('Failed to load dictionary:', error);
    return [];
  }
}

export type { DictionaryEntry, SearchResult };
