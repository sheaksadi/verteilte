<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun, Edit3, Plus, X, Check, Download, Upload, Copy } from 'lucide-vue-next';
import { initializeDictionary, searchDictionary, searchByMeaning, type DictionaryEntry, type DictionaryInfo } from '@/lib/dictionary';
import { getAllWords, addWord as dbAddWord, deleteWord as dbDeleteWord, exportWords, importWords, updateWordReview, resetAllWords, getDatabase, type Word } from '@/lib/database';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

const words = ref<Word[]>([]);


const currentIndex = ref(0);
const isFlipped = ref(false);
const userInput = ref<string[]>([]);
const showResult = ref(false);
const isDarkMode = ref(false);
const inputRefs = ref<HTMLInputElement[]>([]);
const showEditView = ref(false);
const newWordOriginal = ref('');
const newWordTranslation = ref('');
const newWordArticle = ref('');
const suggestions = ref<DictionaryEntry[]>([]);
const showSuggestions = ref(false);
const translationSuggestions = ref<DictionaryEntry[]>([]);
const showTranslationSuggestions = ref(false);
const isLoading = ref(true);
const dictionaryInfo = ref<DictionaryInfo | null>(null);
const importText = ref('');
const showImportDialog = ref(false);
const importResult = ref<{ added: number; skipped: number; errors: string[] } | null>(null);
const exportSuccess = ref(false);

// Debug info
const debugInfo = ref({
  platform: 'unknown',
  dictionaryLoaded: false,
  dictionaryVersion: '',
  loadError: '',
  dbWordsCount: 0,
  dictionaryLogs: [] as string[],
});

// Ensure minimum loading time to prevent flash
let loadStartTime = Date.now();

// Filter words to only show those due for review
const dueWords = computed(() => {
  const now = Date.now();
  const due = words.value.filter(word => word.nextReviewAt <= now);
  console.log('[Debug] Due words calculation:', {
    totalWords: words.value.length,
    dueWords: due.length,
    now,
    firstWordNextReview: words.value[0]?.nextReviewAt,
    firstWordDue: words.value[0] ? words.value[0].nextReviewAt <= now : false
  });
  return due;
});

// Current card from due words only
const currentCard = computed(() => dueWords.value[currentIndex.value]);

const answerLength = computed(() => currentCard.value?.original?.length || 0);

const inputSize = computed(() => {
  const length = answerLength.value;
  if (length <= 8) return 'w-10 h-12 text-xl';
  if (length <= 12) return 'w-8 h-10 text-lg';
  if (length <= 16) return 'w-7 h-9 text-base';
  return 'w-6 h-8 text-sm';
});

const userInputString = computed(() => userInput.value.join(''));

// Store the answer when checking to prevent re-evaluation issues
const checkedAnswer = ref('');
const expectedAnswer = ref('');

const isCorrect = computed(() => {
  if (!showResult.value || !currentCard.value) {
    console.log('[Debug] isCorrect: Not ready to check', { showResult: showResult.value, hasCard: !!currentCard.value });
    return null;
  }
  
  // Use the stored checked answer instead of live userInput
  const answer = checkedAnswer.value || userInputString.value;
  const correct = answer.toLowerCase().trim();
  
  // Use expected answer if we stored it, otherwise use current card
  const expected = (expectedAnswer.value || currentCard.value.original).toLowerCase().trim();
  const result = correct === expected;
  
  console.log('[Debug] isCorrect computed:', {
    answer,
    correct,
    expected,
    result,
    showResult: showResult.value,
    currentCardOriginal: currentCard.value.original
  });
  
  return result;
});

// Calculate next review time based on score change
// Using improved spaced repetition intervals based on Anki/SuperMemo research:
// - Bad: -2 score, decreases interval (goes back further)
// - Good: +1 score, increases by 2.5x 
// - Great: +2 score, increases by 3x
const calculateNextReview = (currentScore: number, scoreChange: number): number => {
  const now = Date.now();
  const newScore = Math.max(0, currentScore + scoreChange);
  
  // If score is 0 (new card or failed card), start with 10 minutes
  if (newScore === 0) {
    return now + 10 * 60 * 1000;
  }
  
  // For positive scores, use exponential growth
  // Base interval is 1 hour, grows exponentially with score
  const baseInterval = 60 * 60 * 1000; // 1 hour base
  const interval = baseInterval * Math.pow(2.5, newScore - 1);
  return now + interval;
};

// Format time interval for display
const formatInterval = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

// Calculate intervals for button display
const badInterval = computed(() => {
  if (!currentCard.value) return '';
  const nextReview = calculateNextReview(currentCard.value.score, -2);
  return formatInterval(nextReview - Date.now());
});

const goodInterval = computed(() => {
  if (!currentCard.value) return '';
  const nextReview = calculateNextReview(currentCard.value.score, 1);
  return formatInterval(nextReview - Date.now());
});

const greatInterval = computed(() => {
  if (!currentCard.value) return '';
  const nextReview = calculateNextReview(currentCard.value.score, 2);
  return formatInterval(nextReview - Date.now());
});

// Format last reviewed time
const lastReviewedText = computed(() => {
  if (!currentCard.value || !currentCard.value.lastReviewedAt) return 'Never';
  const diff = Date.now() - currentCard.value.lastReviewedAt;
  return formatInterval(diff) + ' ago';
});

const initializeInput = () => {
  userInput.value = new Array(answerLength.value).fill('');
  showResult.value = false;
  checkedAnswer.value = '';
  expectedAnswer.value = '';
  setTimeout(() => {
    const firstInput = inputRefs.value[0];
    if (firstInput) {
      firstInput.focus();
    }
  }, 150);
};

const handleInput = (index: number, event: Event) => {
  // Don't allow input if we're in the middle of checking/flipping
  if (showResult.value) {
    const target = event.target as HTMLInputElement;
    target.value = '';
    return;
  }
  
  const target = event.target as HTMLInputElement;
  const value = target.value;
  
  // Clear the current value first
  userInput.value[index] = '';
  
  if (value) {
    // Take only the last character typed
    const char = value.slice(-1);
    userInput.value[index] = char;
    
    // Move to next input if not at the end
    if (index < answerLength.value - 1) {
      // Use nextTick instead of setTimeout for better Vue reactivity
      nextTick(() => {
        const nextInput = inputRefs.value[index + 1];
        if (nextInput) {
          nextInput.focus();
          // Ensure cursor is at the end (mobile keyboard fix)
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    } else {
      // All characters filled, lock in the answer and check spelling
      const finalAnswer = userInput.value.join('');
      checkedAnswer.value = finalAnswer;
      
      // Also store what we're checking against to prevent card changes
      const expectedWord = currentCard.value?.original || '';
      expectedAnswer.value = expectedWord;
      
      // Check immediately and store the result
      const isAnswerCorrect = finalAnswer.toLowerCase().trim() === expectedWord.toLowerCase().trim();
      
      console.log('[Debug] Checking answer:', {
        typed: finalAnswer,
        expected: expectedWord,
        match: isAnswerCorrect
      });
      
      showResult.value = true;
      
      // Then trigger flip
      setTimeout(() => {
        target.blur();
        flipCard();
        
        // If correct, auto-rate as great and move to next
        if (isAnswerCorrect) {
          setTimeout(() => {
            console.log('[Debug] Correct! Auto-rating as great');
            nextCard('great');
          }, 1000);
        } else {
          // If incorrect, just show the answer and wait for user to click next
          console.log('[Debug] Incorrect! Waiting for user to click next');
        }
      }, 200);
    }
  }
};

const handleKeydown = (index: number, event: KeyboardEvent) => {
  // Don't allow any keyboard input if we're checking/showing result
  if (showResult.value) {
    event.preventDefault();
    return;
  }
  
  // Handle backspace
  if (event.key === 'Backspace') {
    if (!userInput.value[index] && index > 0) {
      event.preventDefault();
      setTimeout(() => {
        const prevInput = inputRefs.value[index - 1];
        if (prevInput) {
          prevInput.focus();
        }
      }, 0);
    }
  }
};

const handlePaste = (event: ClipboardEvent) => {
  // Don't allow paste if we're checking/showing result
  if (showResult.value) {
    event.preventDefault();
    return;
  }
  
  event.preventDefault();
  const pastedText = event.clipboardData?.getData('text') || '';
  const chars = pastedText.slice(0, answerLength.value).split('');
  
  chars.forEach((char, index) => {
    if (index < answerLength.value) {
      userInput.value[index] = char;
    }
  });
  
  // Focus the next empty input or the last one
  const nextEmptyIndex = userInput.value.findIndex(c => !c);
  const focusIndex = nextEmptyIndex >= 0 ? nextEmptyIndex : answerLength.value - 1;
  
  setTimeout(() => {
    const targetInput = inputRefs.value[focusIndex];
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }
    
    // If all filled, trigger spell check
    if (nextEmptyIndex === -1) {
      const finalAnswer = userInput.value.join('');
      checkedAnswer.value = finalAnswer;
      expectedAnswer.value = currentCard.value?.original || '';
      showResult.value = true;
      
      console.log('[Debug] Paste check:', {
        typed: finalAnswer,
        expected: expectedAnswer.value,
        match: finalAnswer.toLowerCase().trim() === expectedAnswer.value.toLowerCase().trim()
      });
      
      setTimeout(() => {
        flipCard();
      }, 100);
    }
  }, 10);
};

const flipCard = () => {
  // Only flip the card, don't change showResult here
  // showResult is set when typing completes
  isFlipped.value = !isFlipped.value;
};



const nextCardAfterIncorrect = () => {
  // Called when user clicks "Next" after getting answer wrong
  nextCard('bad');
};

const laterCard = async () => {
  try {
    console.log('[Debug] Later button clicked');
    if (!currentCard.value?.id) {
      console.log('[Debug] No current card');
      return;
    }
    
    // Set next review to 1 minute from now without changing score
    const oneMinuteFromNow = Date.now() + 60000; // 60 seconds
    
    console.log('[Debug] Getting database...');
    const database = await getDatabase();
    console.log('[Debug] Updating word:', currentCard.value.id);
    await database.execute(
      'UPDATE words SET nextReviewAt = ? WHERE id = ?',
      [oneMinuteFromNow, currentCard.value.id]
    );
    
    console.log('[Debug] Reloading words...');
    // Reload words
    words.value = await getAllWords();
    
    console.log('[Debug] Moving to next card...');
    
    // Flip back to front if needed
    if (isFlipped.value) {
      isFlipped.value = false;
      setTimeout(() => {
        // Clear state after flip completes
        userInput.value = new Array(answerLength.value).fill('');
        showResult.value = false;
        checkedAnswer.value = '';
        expectedAnswer.value = '';
        initializeInput();
      }, 700);
    } else {
      // Clear and initialize immediately if not flipped
      userInput.value = new Array(answerLength.value).fill('');
      showResult.value = false;
      checkedAnswer.value = '';
      expectedAnswer.value = '';
      initializeInput();
    }
  } catch (error) {
    console.error('[Debug] Later card error:', error);
  }
};

const nextCard = async (rating: 'bad' | 'good' | 'great') => {
  if (!currentCard.value?.id) return;
  
  console.log('[Debug] ========== NEXT CARD CALLED ==========');
  console.log('[Debug] Rating:', rating);
  console.log('[Debug] Current card:', currentCard.value.original);
  console.log('[Debug] Current score:', currentCard.value.score);
  
  // Store the current card ID before any updates
  const currentWordId = currentCard.value.id;
  
  // Update score based on rating
  const scoreChange = rating === 'bad' ? -2 : rating === 'good' ? 1 : 2;
  console.log('[Debug] Score change:', scoreChange);
  
  await updateWordReview(currentWordId, scoreChange);
  
  // First flip back to front if currently flipped
  if (isFlipped.value) {
    isFlipped.value = false;
    // Wait for flip animation to complete before loading next card
    setTimeout(async () => {
      // Reload words to get updated order
      words.value = await getAllWords();
      
      console.log('[Debug] Words reloaded, new first card:', dueWords.value[0]?.original);
      
      // Find where the next card should be (always go to index 0 since words are sorted by nextReviewAt)
      currentIndex.value = 0;
      
      // Clear state after flip completes
      userInput.value = new Array(answerLength.value).fill('');
      showResult.value = false;
      checkedAnswer.value = '';
      expectedAnswer.value = '';
      initializeInput();
    }, 700); // Match the transition duration
  } else {
    // Reload words to get updated order
    words.value = await getAllWords();
    
    console.log('[Debug] Words reloaded, new first card:', dueWords.value[0]?.original);
    
    // Find where the next card should be (always go to index 0 since words are sorted by nextReviewAt)
    currentIndex.value = 0;
    
    // If already on front, clear and initialize immediately
    userInput.value = new Array(answerLength.value).fill('');
    showResult.value = false;
    checkedAnswer.value = '';
    expectedAnswer.value = '';
    initializeInput();
  }
};

const prevCard = () => {
  // First flip back to front if currently flipped
  if (isFlipped.value) {
    isFlipped.value = false;
    // Wait for flip animation to complete before changing card
    setTimeout(() => {
      if (currentIndex.value > 0) {
        currentIndex.value--;
      } else {
        currentIndex.value = words.value.length - 1;
      }
      initializeInput();
    }, 700); // Match the transition duration
  } else {
    // If already on front, just move to previous card
    if (currentIndex.value > 0) {
      currentIndex.value--;
    } else {
      currentIndex.value = words.value.length - 1;
    }
    initializeInput();
  }
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

const updateSuggestions = async () => {
  const searchTerm = newWordOriginal.value.trim();
  if (searchTerm.length >= 2 && dictionaryInfo.value) {
    const results = await searchDictionary(searchTerm, 10);
    suggestions.value = results;
    showSuggestions.value = results.length > 0;
  } else {
    suggestions.value = [];
    showSuggestions.value = false;
  }
};

const updateTranslationSuggestions = async () => {
  const searchTerm = newWordTranslation.value.trim();
  if (searchTerm.length >= 2 && dictionaryInfo.value) {
    const results = await searchByMeaning(searchTerm, 10);
    translationSuggestions.value = results;
    showTranslationSuggestions.value = results.length > 0;
  } else {
    translationSuggestions.value = [];
    showTranslationSuggestions.value = false;
  }
};

const selectSuggestion = (suggestion: DictionaryEntry) => {
  newWordOriginal.value = suggestion.word;
  newWordTranslation.value = suggestion.meanings?.[0] || '';
  newWordArticle.value = suggestion.gender === 'masc' ? 'der' : 
                        suggestion.gender === 'fem' ? 'die' : 
                        suggestion.gender === 'neut' ? 'das' : '';
  showSuggestions.value = false;
  showTranslationSuggestions.value = false;
};

const selectTranslationSuggestion = (suggestion: DictionaryEntry) => {
  newWordOriginal.value = suggestion.word;
  newWordTranslation.value = suggestion.meanings?.[0] || '';
  newWordArticle.value = suggestion.gender === 'masc' ? 'der' : 
                        suggestion.gender === 'fem' ? 'die' : 
                        suggestion.gender === 'neut' ? 'das' : '';
  showSuggestions.value = false;
  showTranslationSuggestions.value = false;
};

const focusTranslation = () => {
  const translationInput = document.getElementById('newWordTranslation') as HTMLInputElement;
  if (translationInput) translationInput.focus();
};

const focusArticle = () => {
  const articleInput = document.getElementById('newWordArticle') as HTMLInputElement;
  if (articleInput) articleInput.focus();
};

const delayHideSuggestions = () => {
  setTimeout(() => {
    showSuggestions.value = false;
    showTranslationSuggestions.value = false;
  }, 200);
};

const addWord = async () => {
  if (newWordOriginal.value.trim() && newWordTranslation.value.trim()) {
    const now = Date.now();
    const newWord: Omit<Word, 'id'> = {
      original: newWordOriginal.value.trim(),
      translation: newWordTranslation.value.trim(),
      article: newWordArticle.value.trim(),
      score: 0,
      createdAt: now,
      lastReviewedAt: 0,
      nextReviewAt: now
    };
    
    await dbAddWord(newWord);
    words.value = await getAllWords();
    
    newWordOriginal.value = '';
    newWordTranslation.value = '';
    newWordArticle.value = '';
    showSuggestions.value = false;
    
    // Reinitialize input boxes for the current card
    nextTick(() => {
      initializeInput();
      // Then focus back on original input for quick entry if still in edit view
      if (showEditView.value) {
        const originalInput = document.getElementById('newWordOriginal') as HTMLInputElement;
        if (originalInput) originalInput.focus();
      }
    });
  }
};

const deleteWord = async (index: number) => {
  const word = words.value[index];
  if (word.id) {
    await dbDeleteWord(word.id);
    words.value = await getAllWords();
    if (currentIndex.value >= words.value.length) {
      currentIndex.value = Math.max(0, words.value.length - 1);
    }
  }
};

const toggleEditView = () => {
  showEditView.value = !showEditView.value;
  if (showEditView.value) {
    nextTick(() => {
      const originalInput = document.getElementById('newWordOriginal') as HTMLInputElement;
      if (originalInput) originalInput.focus();
    });
  }
};

const handleExport = async () => {
  try {
    const exportedText = await exportWords();
    
    // Check if we're in Tauri
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    
    if (isTauri) {
      // Use clipboard in Tauri
      await writeText(exportedText);
      exportSuccess.value = true;
      setTimeout(() => exportSuccess.value = false, 3000);
    } else {
      // Use browser download
      const blob = new Blob([exportedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verteilte-words-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed: ' + error);
  }
};

const openImportDialog = () => {
  importText.value = '';
  importResult.value = null;
  showImportDialog.value = true;
};

const handleImport = async () => {
  if (!importText.value.trim()) {
    return;
  }
  
  const result = await importWords(importText.value);
  importResult.value = result;
  
  // Reload words
  words.value = await getAllWords();
  debugInfo.value.dbWordsCount = words.value.length;
  
  // Reinitialize if we have words
  if (words.value.length > 0) {
    nextTick(() => initializeInput());
  }
};

const closeImportDialog = () => {
  showImportDialog.value = false;
  importText.value = '';
  importResult.value = null;
};

const resetAllCardsDebug = async () => {
  if (confirm('Reset all cards to score 0 and make them due now? This cannot be undone!')) {
    await resetAllWords();
    words.value = await getAllWords();
    currentIndex.value = 0;
    initializeInput();
    alert('All cards have been reset!');
  }
};

onMounted(async () => {
  loadStartTime = Date.now();
  
  // Detect platform
  debugInfo.value.platform = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'browser';
  
  // Check system preference for dark mode
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode.value = true;
    document.documentElement.classList.add('dark');
  }
  
  // Add global keyboard listener for Enter key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && showResult.value && !isCorrect.value) {
      // Enter key triggers Next button when answer is incorrect
      nextCardAfterIncorrect();
    }
  });
  
  // Load saved words from database
  try {
    words.value = await getAllWords();
    debugInfo.value.dbWordsCount = words.value.length;
    console.log(`Loaded ${words.value.length} words from database`);
    console.log('[Debug] First 3 words:', words.value.slice(0, 3).map(w => ({
      original: w.original,
      nextReviewAt: w.nextReviewAt,
      now: Date.now(),
      isDue: w.nextReviewAt <= Date.now()
    })));
  } catch (error) {
    console.error('Failed to load words from database:', error);
    debugInfo.value.loadError = error instanceof Error ? error.message : String(error);
  }
  
  // Initialize dictionary database asynchronously
  initializeDictionary()
    .then(info => {
      if (info) {
        dictionaryInfo.value = info;
        debugInfo.value.dictionaryLoaded = true;
        debugInfo.value.dictionaryVersion = info.version;
        debugInfo.value.dictionaryLogs = info.logs;
        console.log('[App] Dictionary initialized:', info);
      } else {
        console.log('[App] Dictionary not available (browser mode)');
        debugInfo.value.dictionaryLogs = ['[App] Browser mode - dictionary not available'];
      }
    })
    .catch(err => {
      console.error('[App] Failed to initialize dictionary:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      debugInfo.value.loadError = errorMsg;
      
      // Try to parse logs from error message if it starts with "LOGS:"
      if (errorMsg.startsWith('LOGS:')) {
        try {
          const logsJson = errorMsg.substring(5);
          const parsedLogs = JSON.parse(logsJson);
          debugInfo.value.dictionaryLogs = parsedLogs;
          console.log('[App] Extracted', parsedLogs.length, 'logs from error');
        } catch (e) {
          console.error('[App] Failed to parse logs from error:', e);
          debugInfo.value.dictionaryLogs = [`[App ERROR] ${errorMsg}`];
        }
      } else {
        debugInfo.value.dictionaryLogs = [`[App ERROR] ${errorMsg}`];
      }
    });
  
  // Ensure minimum loading time of 300ms to prevent flash
  const loadTime = Date.now() - loadStartTime;
  const minLoadTime = 300;
  if (loadTime < minLoadTime) {
    await new Promise(resolve => setTimeout(resolve, minLoadTime - loadTime));
  }
  
  // Mark as loaded
  isLoading.value = false;
  
  // Initialize input for first card
  if (words.value.length > 0) {
    nextTick(() => initializeInput());
  }
});

// Watch for card changes to reinitialize input
watch(currentIndex, () => {
  initializeInput();
});

</script>

<template>
  <main class="min-h-screen bg-background p-4 flex flex-col transition-colors duration-300">
    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <!-- Edit View -->
    <div v-else-if="showEditView" class="max-w-2xl mx-auto w-full">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-primary">Manage Words</h1>
        <Button variant="outline" size="icon" @click="toggleEditView" class="rounded-full">
          <X class="h-5 w-5" />
        </Button>
      </div>

      <!-- Quick Add Form -->
      <Card class="mb-6">
        <CardContent class="p-4">
          <h2 class="font-semibold mb-3">Add New Word</h2>
          <div class="space-y-3">
            <div class="relative">
              <Input 
                id="newWordOriginal"
                v-model="newWordOriginal" 
                placeholder="German word (e.g., Haus)" 
                @input="updateSuggestions"
                @keyup.enter="focusTranslation"
                @blur="delayHideSuggestions"
                @focus="updateSuggestions"
                class="text-lg"
              />
              <!-- Suggestions Dropdown -->
              <div 
                v-if="showSuggestions && suggestions.length > 0"
                class="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto"
              >
                <button
                  v-for="(suggestion, idx) in suggestions"
                  :key="idx"
                  @mousedown.prevent="selectSuggestion(suggestion)"
                  class="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-b-0"
                >
                  <div class="font-semibold">
                    <span v-if="suggestion.gender" class="text-xs text-muted-foreground mr-1">
                      {{ suggestion.gender === 'masc' ? 'der' : suggestion.gender === 'fem' ? 'die' : suggestion.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ suggestion.word }}
                  </div>
                  <div class="text-sm text-muted-foreground truncate">
                    {{ suggestion.meanings?.[0] || 'No translation' }}
                  </div>
                </button>
              </div>
            </div>
            <div class="relative">
              <Input 
                id="newWordTranslation"
                v-model="newWordTranslation" 
                placeholder="English translation (e.g., House)" 
                @input="updateTranslationSuggestions"
                @keyup.enter="focusArticle"
                @blur="delayHideSuggestions"
                @focus="updateTranslationSuggestions"
                class="text-lg"
              />
              <!-- Translation Suggestions Dropdown -->
              <div 
                v-if="showTranslationSuggestions && translationSuggestions.length > 0"
                class="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto"
              >
                <button
                  v-for="(suggestion, idx) in translationSuggestions"
                  :key="idx"
                  @mousedown.prevent="selectTranslationSuggestion(suggestion)"
                  class="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-b-0"
                >
                  <div class="font-semibold">
                    <span v-if="suggestion.gender" class="text-xs text-muted-foreground mr-1">
                      {{ suggestion.gender === 'masc' ? 'der' : suggestion.gender === 'fem' ? 'die' : suggestion.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ suggestion.word }}
                  </div>
                  <div class="text-sm text-muted-foreground truncate">
                    {{ suggestion.meanings?.[0] || 'No translation' }}
                  </div>
                </button>
              </div>
            </div>
            <Input 
              id="newWordArticle"
              v-model="newWordArticle" 
              placeholder="Article (der/die/das - optional)" 
              @keyup.enter="addWord()"
              class="text-lg"
            />
            <Button 
              @click="addWord" 
              :disabled="!newWordOriginal.trim() || !newWordTranslation.trim()"
              class="w-full dark:bg-purple-500 dark:hover:bg-purple-600"
            >
              <Plus class="h-4 w-4 mr-2" /> Add Word
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Words List -->
      <div class="space-y-2">
        <h2 class="font-semibold text-sm text-muted-foreground mb-2">
          {{ words.length }} word{{ words.length !== 1 ? 's' : '' }}
        </h2>
        <Card v-for="(word, index) in words" :key="index" class="group">
          <CardContent class="p-3 flex items-center justify-between">
            <div class="flex-1">
              <div class="font-semibold">
                <span v-if="word.article" class="text-muted-foreground text-sm">{{ word.article }} </span>{{ word.original }}
              </div>
              <div class="text-sm text-muted-foreground">{{ word.translation }}</div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              @click="deleteWord(index)"
              class="opacity-50 group-hover:opacity-100 transition-opacity"
            >
              <X class="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>

    <!-- Practice View -->
    <div v-else>
    <!-- No words message -->
    <div v-if="words.length === 0" class="text-center max-w-md mx-auto">
      <Card>
        <CardContent class="p-8">
          <h2 class="text-xl font-semibold mb-3">No words yet!</h2>
          <p class="text-muted-foreground mb-4">Add some words to start practicing.</p>
          <Button @click="toggleEditView" class="dark:bg-purple-500 dark:hover:bg-purple-600">
            <Plus class="h-4 w-4 mr-2" /> Add Words
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- No cards due message -->
    <div v-else-if="dueWords.length === 0" class="text-center max-w-md mx-auto">
      <Card>
        <CardContent class="p-8">
          <h2 class="text-xl font-semibold mb-3">🎉 All caught up!</h2>
          <p class="text-muted-foreground mb-2">No cards are due for review right now.</p>
          <p class="text-sm text-muted-foreground mb-4">Come back later to review more cards.</p>
          <Button @click="toggleEditView" variant="outline">
            <Plus class="h-4 w-4 mr-2" /> Add More Words
          </Button>
        </CardContent>
      </Card>
      
      <!-- Debug Info on All Caught Up Screen -->
      <Card class="mt-4">
        <CardContent class="p-3">
          <h3 class="text-xs font-semibold mb-2">Debug Info</h3>
          <div class="text-xs text-muted-foreground space-y-1">
            <div>Platform: <span class="font-mono">{{ debugInfo.platform }}</span></div>
            <div>Words in DB: <span class="font-mono">{{ debugInfo.dbWordsCount }}</span></div>
            <div>Dictionary Loaded: <span :class="debugInfo.dictionaryLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'" class="font-mono">{{ debugInfo.dictionaryLoaded ? 'YES' : 'NO' }}</span></div>
            <div v-if="debugInfo.dictionaryVersion">Dictionary Version: <span class="font-mono">{{ debugInfo.dictionaryVersion }}</span></div>
            <div v-if="debugInfo.loadError" class="text-red-600 dark:text-red-400 break-words mt-1">Error: {{ debugInfo.loadError }}</div>
          </div>
          
          <div class="mt-3 border-t pt-2">
            <Button 
              @click="resetAllCardsDebug" 
              variant="destructive" 
              size="sm" 
              class="w-full text-xs"
            >
              Reset All Cards (Score=0, Due Now)
            </Button>
          </div>
          
          <div v-if="debugInfo.dictionaryLogs.length > 0" class="mt-3 border-t pt-2">
            <div class="text-xs font-semibold mb-1">Dictionary Logs ({{ debugInfo.dictionaryLogs.length }}):</div>
            <div class="max-h-60 overflow-y-auto bg-black/5 dark:bg-white/5 p-2 rounded">
              <div v-for="(log, i) in debugInfo.dictionaryLogs" :key="i" class="text-[10px] font-mono break-words py-0.5 leading-tight" :class="log.includes('ERROR') ? 'text-red-600 dark:text-red-400 font-semibold' : log.includes('✓') || log.includes('Successfully') ? 'text-green-600 dark:text-green-400' : ''">{{ log }}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Flashcard content -->
    <div v-else>
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="flex items-center justify-between max-w-md mx-auto mb-4">
        <h1 class="text-2xl font-bold text-primary">Flashcards</h1>
        <div class="flex gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            @click="handleExport" 
            class="rounded-full relative" 
            :title="exportSuccess ? 'Copied to clipboard!' : 'Export words to clipboard'"
          >
            <Check v-if="exportSuccess" class="h-5 w-5 text-green-600" />
            <Copy v-else class="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" @click="openImportDialog" class="rounded-full" title="Import words">
            <Upload class="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" @click="toggleEditView" class="rounded-full">
            <Edit3 class="h-5 w-5" />
          </Button>
          <Button variant="outline" size="icon" @click="toggleDarkMode" class="rounded-full">
            <Sun v-if="isDarkMode" class="h-5 w-5" />
            <Moon v-else class="h-5 w-5" />
          </Button>
        </div>
      </div>
      <p class="text-sm text-muted-foreground">
        Card {{ currentIndex + 1 }} of {{ dueWords.length }}
      </p>
    </div>

    <!-- Flashcard -->
    <div class="flex-1 flex flex-col max-w-md mx-auto w-full gap-4">
      <div class="relative w-full h-[350px] perspective-1000">
        <Card
          class="w-full h-full absolute transition-transform duration-700 transform-style-preserve-3d cursor-pointer"
          :class="{ 'rotate-y-180': isFlipped }" @click="flipCard">
          <!-- Front of the card -->
          <div class="absolute w-full h-full backface-hidden flex flex-col">
            <CardContent class="p-8 text-center flex-1 flex flex-col justify-center relative">
              <!-- Score and Last Reviewed in corners -->
              <div class="absolute top-2 left-2 text-xs text-muted-foreground">
                Score: {{ currentCard.score }}
              </div>
              <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
                {{ lastReviewedText }}
              </div>
              
              <div class="text-4xl font-bold text-primary dark:text-purple-400 mb-6 transition-all duration-300">
                {{ currentCard.translation }}
              </div>
              <div v-if="currentCard.article" class="text-sm text-muted-foreground mb-4">
                Article: {{ currentCard.article }}
              </div>
              
              <div class="space-y-3">
                <div class="flex justify-center gap-1.5 flex-wrap" @click.stop>
                  <input 
                    v-for="(char, index) in userInput" 
                    :key="`${currentIndex}-${index}`"
                    :ref="el => { if (el) inputRefs[index] = el as HTMLInputElement }"
                    v-model="userInput[index]"
                    @input="handleInput(index, $event)"
                    @keydown="handleKeydown(index, $event)"
                    @paste="handlePaste"
                    type="text"
                    maxlength="1"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    inputmode="text"
                    enterkeyhint="next"
                    class="w-10 h-12 text-center text-xl font-semibold p-0 transition-all border rounded-md bg-background"
                    :class="{
                      'border-green-500 ring-2 ring-green-500 dark:border-green-600 dark:ring-green-600 bg-green-50 dark:bg-green-950': showResult && isCorrect,
                      'border-red-500 ring-2 ring-red-500 dark:border-red-600 dark:ring-red-600 bg-red-50 dark:bg-red-950': showResult && !isCorrect && userInput[index],
                      'border-muted-foreground/20 focus:border-primary focus:ring-2 focus:ring-primary': !showResult
                    }"
                  />
                </div>
                
                <p class="text-sm text-muted-foreground transition-all duration-300">
                  {{ showResult ? (isCorrect ? '✓ Correct!' : '✗ Incorrect') : 'Type answer - auto-checks when complete' }}
                </p>
                
                <!-- Debug info -->
                <p v-if="showResult" class="text-xs text-muted-foreground mt-2">
                  Your answer: "{{ checkedAnswer }}" | Expected: "{{ currentCard.original }}"
                </p>
              </div>
            </CardContent>
          </div>

          <!-- Back of the card -->
          <div class="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col">
            <CardContent class="p-8 text-center flex-1 flex flex-col justify-center relative">
              <!-- Score and Last Reviewed in corners -->
              <div class="absolute top-2 left-2 text-xs text-muted-foreground">
                Score: {{ currentCard.score }}
              </div>
              <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
                {{ lastReviewedText }}
              </div>
              
              <div class="text-4xl font-bold text-primary dark:text-purple-400 mb-4 transition-all duration-300">
                {{ currentCard.original }}
              </div>
              <div v-if="currentCard.article" class="text-lg text-muted-foreground mb-4">
                {{ currentCard.article }}
              </div>
              
              <div v-if="userInputString.trim()" class="mt-4 p-4 rounded-lg" :class="{
                'bg-green-50 dark:bg-green-950': isCorrect,
                'bg-red-50 dark:bg-red-950': !isCorrect
              }">
                <p class="text-sm font-semibold mb-1" :class="{
                  'text-green-700 dark:text-green-300': isCorrect,
                  'text-red-700 dark:text-red-300': !isCorrect
                }">
                  {{ isCorrect ? '✓ Correct!' : '✗ Your answer' }}
                </p>
                <p class="text-base" :class="{
                  'text-green-600 dark:text-green-400': isCorrect,
                  'text-red-600 dark:text-red-400': !isCorrect
                }">
                  {{ userInputString }}
                </p>
              </div>
              
              <p class="text-sm text-muted-foreground mt-4 transition-all duration-300">
                Tap to flip back
              </p>
            </CardContent>
          </div>
        </Card>
      </div>

      <!-- Navigation directly under card -->
      <div v-if="showResult && !isCorrect" class="flex flex-col gap-2">
        <Button 
          class="w-full max-w-md dark:bg-purple-500 dark:hover:bg-purple-600" 
          @click="nextCardAfterIncorrect"
        >
          Next
        </Button>
        <Button 
          variant="outline"
          class="w-full max-w-md" 
          @click="laterCard"
        >
          Later (1 min)
        </Button>
      </div>
      <div v-else class="flex flex-col gap-2">
        <div class="grid grid-cols-4 gap-3">
          <Button 
            variant="outline" 
            class="w-full flex flex-col gap-0.5 h-auto py-2" 
            @click="laterCard"
            :disabled="showResult && !isCorrect"
          >
            <span class="font-semibold">Later</span>
            <span class="text-xs text-muted-foreground">1 min</span>
          </Button>
          <Button 
            variant="outline" 
            class="w-full flex flex-col gap-0.5 h-auto py-2" 
            @click="nextCard('bad')"
            :disabled="showResult && !isCorrect"
          >
            <span class="font-semibold">Bad</span>
            <span class="text-xs text-muted-foreground">{{ badInterval }}</span>
          </Button>
          <Button 
            variant="outline" 
            class="w-full flex flex-col gap-0.5 h-auto py-2" 
            @click="nextCard('good')"
            :disabled="showResult && !isCorrect"
          >
            <span class="font-semibold">Good</span>
            <span class="text-xs text-muted-foreground">{{ goodInterval }}</span>
          </Button>
          <Button 
            variant="outline" 
            class="w-full flex flex-col gap-0.5 h-auto py-2" 
            @click="nextCard('great')"
            :disabled="showResult && !isCorrect"
          >
            <span class="font-semibold">Great</span>
            <span class="text-xs text-muted-foreground">{{ greatInterval }}</span>
          </Button>
        </div>
      </div>

      <!-- Debug Info -->
      <Card class="mt-4">
        <CardContent class="p-3">
          <h3 class="text-xs font-semibold mb-2">Debug Info</h3>
          <div class="text-xs text-muted-foreground space-y-1">
            <div>Platform: <span class="font-mono">{{ debugInfo.platform }}</span></div>
            <div>Words in DB: <span class="font-mono">{{ debugInfo.dbWordsCount }}</span></div>
            <div>Dictionary Loaded: <span :class="debugInfo.dictionaryLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'" class="font-mono">{{ debugInfo.dictionaryLoaded ? 'YES' : 'NO' }}</span></div>
            <div v-if="debugInfo.dictionaryVersion">Dictionary Version: <span class="font-mono">{{ debugInfo.dictionaryVersion }}</span></div>
            <div v-if="debugInfo.loadError" class="text-red-600 dark:text-red-400 break-words mt-1">Error: {{ debugInfo.loadError }}</div>
          </div>
          
          <div class="mt-3 border-t pt-2">
            <Button 
              @click="resetAllCardsDebug" 
              variant="destructive" 
              size="sm" 
              class="w-full text-xs"
            >
              Reset All Cards (Score=0, Due Now)
            </Button>
          </div>
          
          <div v-if="debugInfo.dictionaryLogs.length > 0" class="mt-3 border-t pt-2">
            <div class="text-xs font-semibold mb-1">Dictionary Logs ({{ debugInfo.dictionaryLogs.length }}):</div>
            <div class="max-h-60 overflow-y-auto bg-black/5 dark:bg-white/5 p-2 rounded">
              <div v-for="(log, i) in debugInfo.dictionaryLogs" :key="i" class="text-[10px] font-mono break-words py-0.5 leading-tight" :class="log.includes('ERROR') ? 'text-red-600 dark:text-red-400 font-semibold' : log.includes('✓') || log.includes('Successfully') ? 'text-green-600 dark:text-green-400' : ''">{{ log }}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
    </div>
    
    <!-- Import Dialog -->
    <div v-if="showImportDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" @click.self="closeImportDialog">
      <Card class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-2xl font-bold">Import Words</h2>
            <Button variant="ghost" size="icon" @click="closeImportDialog">
              <X class="h-5 w-5" />
            </Button>
          </div>
          
          <div class="space-y-4">
            <div>
              <p class="text-sm text-muted-foreground mb-2">
                Paste your words below. Format: <span class="font-mono">original | translation | article</span>
              </p>
              <p class="text-sm text-muted-foreground mb-3">
                Lines starting with # are comments. Example:<br>
                <span class="font-mono text-xs">Haus | House | das</span><br>
                <span class="font-mono text-xs">Katze | Cat | die</span>
              </p>
              <textarea
                v-model="importText"
                class="w-full h-64 p-3 rounded-md border border-input bg-background font-mono text-sm resize-none"
                placeholder="# Paste your words here&#10;Haus | House | das&#10;Katze | Cat | die&#10;Hund | Dog | der"
              ></textarea>
            </div>
            
            <div v-if="importResult" class="rounded-lg border p-4 space-y-2">
              <p class="font-semibold">Import Results:</p>
              <div class="text-sm space-y-1">
                <p class="text-green-600 dark:text-green-400">✓ Added: {{ importResult.added }} words</p>
                <p class="text-yellow-600 dark:text-yellow-400">⊘ Skipped: {{ importResult.skipped }} (already exist)</p>
                <p v-if="importResult.errors.length > 0" class="text-red-600 dark:text-red-400">
                  ✗ Errors: {{ importResult.errors.length }}
                </p>
              </div>
              <div v-if="importResult.errors.length > 0" class="mt-2 max-h-32 overflow-y-auto">
                <p class="text-xs font-semibold mb-1">Error details:</p>
                <div class="text-xs text-red-600 dark:text-red-400 space-y-0.5 font-mono">
                  <p v-for="(error, i) in importResult.errors" :key="i">{{ error }}</p>
                </div>
              </div>
            </div>
            
            <div class="flex gap-3">
              <Button @click="handleImport" class="flex-1" :disabled="!importText.trim()">
                <Upload class="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" @click="closeImportDialog">
                Close
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>

<style>
.perspective-1000 {
  perspective: 1000px;
}

.transform-style-preserve-3d {
  transform-style: preserve-3d;
}

.rotate-y-180 {
  transform: rotateY(180deg);
}

.backface-hidden {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
</style>
