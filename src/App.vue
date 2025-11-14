<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun, Edit3, Plus, X, Check } from 'lucide-vue-next';
import { loadDictionary, fuzzySearch, type DictionaryEntry, type SearchResult } from '@/lib/dictionary';

const words = ref([
  { original: 'Hallo', translation: 'Hello', article: '' },
  { original: 'Tschüss', translation: 'Goodbye', article: '' },
  { original: 'Danke', translation: 'Thank you', article: '' },
  { original: 'Bitte', translation: 'Please', article: '' },
  { original: 'Haus', translation: 'House', article: 'das' },
  { original: 'Katze', translation: 'Cat', article: 'die' },
  { original: 'Hund', translation: 'Dog', article: 'der' },
]);

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
const dictionary = ref<DictionaryEntry[]>([]);
const suggestions = ref<SearchResult[]>([]);
const showSuggestions = ref(false);

const currentCard = computed(() => words.value[currentIndex.value]);

const answerLength = computed(() => currentCard.value.original.length);

const userInputString = computed(() => userInput.value.join(''));

const isCorrect = computed(() => {
  if (!showResult.value) return null;
  return userInputString.value.toLowerCase().trim() === currentCard.value.original.toLowerCase().trim();
});

const initializeInput = () => {
  userInput.value = new Array(answerLength.value).fill('');
  showResult.value = false;
  setTimeout(() => {
    const firstInput = inputRefs.value[0];
    if (firstInput) {
      firstInput.focus();
    }
  }, 150);
};

const handleInput = (index: number, event: Event) => {
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
      setTimeout(() => {
        const nextInput = inputRefs.value[index + 1];
        if (nextInput) {
          nextInput.focus();
        }
      }, 0);
    } else {
      // All characters filled, trigger spell check
      setTimeout(() => {
        target.blur();
        flipCard();
        // If correct, auto-select "Great" and move to next card
        setTimeout(() => {
          if (isCorrect.value) {
            nextCard();
          }
        }, 1000);
      }, 200);
    }
  }
};

const handleKeydown = (index: number, event: KeyboardEvent) => {
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
      setTimeout(() => {
        flipCard();
      }, 100);
    }
  }, 10);
};

const flipCard = () => {
  if (!isFlipped.value && userInputString.value.trim()) {
    // Check spelling when flipping
    showResult.value = true;
  }
  isFlipped.value = !isFlipped.value;
};



const nextCard = () => {
  // First flip back to front if currently flipped
  if (isFlipped.value) {
    isFlipped.value = false;
    // Wait for flip animation to complete before changing card
    setTimeout(() => {
      if (currentIndex.value < words.value.length - 1) {
        currentIndex.value++;
      } else {
        currentIndex.value = 0;
      }
      initializeInput();
    }, 700); // Match the transition duration
  } else {
    // If already on front, just move to next card
    if (currentIndex.value < words.value.length - 1) {
      currentIndex.value++;
    } else {
      currentIndex.value = 0;
    }
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

const updateSuggestions = () => {
  const searchTerm = newWordOriginal.value.trim();
  if (searchTerm.length >= 2 && dictionary.value.length > 0) {
    suggestions.value = fuzzySearch(dictionary.value, searchTerm, 0.5).slice(0, 5);
    showSuggestions.value = suggestions.value.length > 0;
  } else {
    suggestions.value = [];
    showSuggestions.value = false;
  }
};

const selectSuggestion = (suggestion: SearchResult) => {
  newWordOriginal.value = suggestion.word;
  newWordTranslation.value = suggestion.meanings?.[0] || '';
  newWordArticle.value = suggestion.gender === 'masc' ? 'der' : 
                        suggestion.gender === 'fem' ? 'die' : 
                        suggestion.gender === 'neut' ? 'das' : '';
  showSuggestions.value = false;
  nextTick(() => {
    const translationInput = document.getElementById('newWordTranslation') as HTMLInputElement;
    if (translationInput) translationInput.focus();
  });
};

const addWord = () => {
  if (newWordOriginal.value.trim() && newWordTranslation.value.trim()) {
    words.value.push({
      original: newWordOriginal.value.trim(),
      translation: newWordTranslation.value.trim(),
      article: newWordArticle.value.trim()
    });
    newWordOriginal.value = '';
    newWordTranslation.value = '';
    newWordArticle.value = '';
    showSuggestions.value = false;
    // Focus back on original input for quick entry
    nextTick(() => {
      const originalInput = document.getElementById('newWordOriginal') as HTMLInputElement;
      if (originalInput) originalInput.focus();
    });
  }
};

const deleteWord = (index: number) => {
  words.value.splice(index, 1);
  if (currentIndex.value >= words.value.length) {
    currentIndex.value = Math.max(0, words.value.length - 1);
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

onMounted(async () => {
  // Check system preference for dark mode
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode.value = true;
    document.documentElement.classList.add('dark');
  }
  
  // Initialize input for first card
  initializeInput();
  
  // Load dictionary asynchronously (don't block UI)
  loadDictionary()
    .then(data => {
      dictionary.value = data;
      console.log(`Dictionary loaded: ${data.length} entries`);
    })
    .catch(err => {
      console.warn('Dictionary not loaded, suggestions disabled:', err);
    });
});

// Watch for card changes to reinitialize input
watch(currentIndex, () => {
  initializeInput();
});
</script>

<template>
  <main class="min-h-screen bg-background p-4 flex flex-col transition-colors duration-300">
    <!-- Edit View -->
    <div v-if="showEditView" class="max-w-2xl mx-auto w-full">
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
                @keyup.enter="document.getElementById('newWordTranslation')?.focus()"
                @blur="setTimeout(() => showSuggestions = false, 200)"
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
                  @click="selectSuggestion(suggestion)"
                  class="w-full px-3 py-2 text-left hover:bg-accent transition-colors border-b last:border-b-0"
                >
                  <div class="font-semibold">
                    <span v-if="suggestion.gender" class="text-xs text-muted-foreground mr-1">
                      {{ suggestion.gender === 'masc' ? 'der' : suggestion.gender === 'fem' ? 'die' : suggestion.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ suggestion.word }}
                    <span class="text-xs text-muted-foreground ml-2">({{ (suggestion.score * 100).toFixed(0) }}%)</span>
                  </div>
                  <div class="text-sm text-muted-foreground truncate">
                    {{ suggestion.meanings?.[0] || 'No translation' }}
                  </div>
                </button>
              </div>
            </div>
            <Input 
              id="newWordTranslation"
              v-model="newWordTranslation" 
              placeholder="English translation (e.g., House)" 
              @keyup.enter="document.getElementById('newWordArticle')?.focus()"
              class="text-lg"
            />
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
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="flex items-center justify-between max-w-md mx-auto mb-4">
        <h1 class="text-2xl font-bold text-primary">Flashcards</h1>
        <div class="flex gap-2">
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
        Card {{ currentIndex + 1 }} of {{ words.length }}
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
            <CardContent class="p-8 text-center flex-1 flex flex-col justify-center">
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
              </div>
            </CardContent>
          </div>

          <!-- Back of the card -->
          <div class="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col">
            <CardContent class="p-8 text-center flex-1 flex flex-col justify-center">
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
      <div class="grid grid-cols-3 gap-3">
        <Button variant="outline" class="w-full" @click="nextCard">
          Bad
        </Button>
        <Button variant="outline" class="w-full" @click="nextCard">
          Good
        </Button>
        <Button variant="outline" class="w-full" @click="nextCard">
          Great
        </Button>
      </div>
    </div>
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
