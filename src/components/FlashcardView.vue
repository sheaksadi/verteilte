<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Edit3, Bug } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { impactFeedback, vibrate } from '@tauri-apps/plugin-haptics';

const props = defineProps<{
  isDarkMode: boolean;
  cardHeight: number;
}>();

const emit = defineEmits(['toggle-dark-mode', 'toggle-edit-view', 'toggle-debug']);

const store = useWordStore();
const { dueWords } = storeToRefs(store);

const currentIndex = ref(0);
const isFlipped = ref(false);
const hasPeeked = ref(false);
const hasFailed = ref(false); // Tracks if the user got it wrong or flipped
const userInput = ref<string[]>([]);
const showResult = ref(false);
const inputRefs = ref<HTMLInputElement[]>([]);
const checkedAnswer = ref('');
const expectedAnswer = ref('');

const justCorrectedIndex = ref<number | null>(null);
const isTransitioning = ref(false);
const nextCardTimeout = ref<NodeJS.Timeout | null>(null);

// Current card from due words only
const currentCard = computed(() => dueWords.value[currentIndex.value]);

const answerLength = computed(() => currentCard.value?.original?.length || 0);

const userInputString = computed(() => userInput.value.join(''));

const isCorrect = computed(() => {
  if (!showResult.value || !currentCard.value) {
    return null;
  }

  // Use the stored checked answer instead of live userInput
  const answer = checkedAnswer.value || userInputString.value;
  const correct = answer.toLowerCase().trim();

  // Use expected answer if we stored it, otherwise use current card
  const expected = (expectedAnswer.value || currentCard.value.original).toLowerCase().trim();
  return correct === expected;
});

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

// Format last reviewed time
const lastReviewedText = computed(() => {
  if (!currentCard.value || !currentCard.value.lastReviewedAt) return 'Never';
  const diff = Date.now() - currentCard.value.lastReviewedAt;
  return formatInterval(diff) + ' ago';
});

// Dynamic text size based on length
const getTextSizeClass = (text: string | undefined) => {
  if (!text) return 'text-4xl';
  const length = text.length;
  if (length < 15) return 'text-4xl';
  if (length < 25) return 'text-3xl';
  if (length < 40) return 'text-2xl';
  return 'text-xl';
};

const getArticleClass = (article: string | undefined) => {
  if (!article) return '';
  const lower = article.toLowerCase().trim();
  if (lower === 'der') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800';
  if (lower === 'die') return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800';
  if (lower === 'das') return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-green-200 dark:border-green-800';
  return 'bg-secondary text-secondary-foreground';
};

const lastFocusedIndex = ref(0);

const initializeInput = () => {
  userInput.value = new Array(answerLength.value).fill('');
  showResult.value = false;
  hasPeeked.value = false;
  hasFailed.value = false;
  checkedAnswer.value = '';
  expectedAnswer.value = '';
  lastFocusedIndex.value = 0;
  setTimeout(() => {
    const firstInput = inputRefs.value[0];
    if (firstInput) {
      firstInput.focus();
    }
  }, 150);
};

const handleFocus = (index: number) => {
  lastFocusedIndex.value = index;
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
    
    // Check for smart umlaut substitution
    if (index > 0 && ['e', 'E', 's', 'S'].includes(char)) {
      const prevChar = userInput.value[index - 1];
      if (prevChar) {
        let potentialUmlaut = '';
        const pair = (prevChar + char).toLowerCase();
        
        if (pair === 'ae') potentialUmlaut = 'ä';
        else if (pair === 'oe') potentialUmlaut = 'ö';
        else if (pair === 'ue') potentialUmlaut = 'ü';
        else if (pair === 'ss') potentialUmlaut = 'ß';

        if (potentialUmlaut) {
          const expectedWord = currentCard.value?.original || '';
          const expectedChar = expectedWord[index - 1]?.toLowerCase();

          if (expectedChar === potentialUmlaut) {
            userInput.value[index - 1] = potentialUmlaut;
            userInput.value[index] = ''; 
            
            justCorrectedIndex.value = index - 1;
            impactFeedback('light').catch(e => console.debug('Haptics not available:', e));

            setTimeout(() => {
              justCorrectedIndex.value = null;
            }, 500);

            target.value = '';
            return;
          }
        }
      }
    }

    userInput.value[index] = char;

    // Move to next input if not at the end
    if (index < answerLength.value - 1) {
      nextTick(() => {
        const nextInput = inputRefs.value[index + 1];
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    } else {
      // All characters filled, lock in the answer and check spelling
      const finalAnswer = userInput.value.join('');
      checkedAnswer.value = finalAnswer;

      const expectedWord = currentCard.value?.original || '';
      expectedAnswer.value = expectedWord;

      // Check immediately and store the result
      const isAnswerCorrect = finalAnswer.toLowerCase().trim() === expectedWord.toLowerCase().trim();

      if (isAnswerCorrect) {
        const triggerHaptics = async () => {
          try {
            await vibrate(2);
            await new Promise(resolve => setTimeout(resolve, 50));
            await vibrate(2);
          } catch (e) {
            console.debug('Haptics not available:', e);
          }
        };
        triggerHaptics();
      } else {
        // Wrong answer
        hasFailed.value = true;
      }

      showResult.value = true;

      // Then trigger flip
      setTimeout(() => {
        target.blur();
        flipCard();

        // Auto-advance logic
        if (isAnswerCorrect) {
          nextCardTimeout.value = setTimeout(() => {
            nextCard();
          }, 1000);
        }
        // If incorrect, we DO NOT auto-advance. User must retry.
      }, 200);
    }
  }
};

const handleKeydown = (index: number, event: KeyboardEvent) => {
  if (showResult.value) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Backspace') {
    if (!userInput.value[index] && index > 0) {
      event.preventDefault();
      setTimeout(() => {
        const prevInput = inputRefs.value[index - 1];
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }, 0);
    }
  }
};

const handlePaste = (event: ClipboardEvent) => {
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

  const nextEmptyIndex = userInput.value.findIndex(c => !c);
  const focusIndex = nextEmptyIndex >= 0 ? nextEmptyIndex : answerLength.value - 1;

  setTimeout(() => {
    const targetInput = inputRefs.value[focusIndex];
    if (targetInput) {
      targetInput.focus();
      targetInput.select();
    }

    if (nextEmptyIndex === -1) {
      const finalAnswer = userInput.value.join('');
      checkedAnswer.value = finalAnswer;
      expectedAnswer.value = currentCard.value?.original || '';
      
      const isAnswerCorrect = finalAnswer.toLowerCase().trim() === expectedAnswer.value.toLowerCase().trim();
      if (!isAnswerCorrect) {
        hasFailed.value = true;
      }

      showResult.value = true;

      setTimeout(() => {
        flipCard();
      }, 100);
    }
  }, 10);
};

const flipCard = () => {
  if (!showResult.value && !isFlipped.value) {
    hasPeeked.value = true;
    hasFailed.value = true; // Flipping counts as a failure/penalty
  }
  isFlipped.value = !isFlipped.value;

  if (!isFlipped.value) {
    setTimeout(() => {
      const targetInput = inputRefs.value[lastFocusedIndex.value] || inputRefs.value[0];
      if (targetInput) {
        targetInput.focus();
      }
    }, 300);
  }
};

const retryCard = () => {
  if (isFlipped.value) {
    isFlipped.value = false;
    setTimeout(() => {
      userInput.value = new Array(answerLength.value).fill('');
      showResult.value = false;
      checkedAnswer.value = '';
      expectedAnswer.value = '';
      initializeInput();
    }, 700);
  }
};

const nextCard = async () => {
  if (!currentCard.value?.id || isTransitioning.value) return;
  
  isTransitioning.value = true;
  
  if (nextCardTimeout.value) {
    clearTimeout(nextCardTimeout.value);
    nextCardTimeout.value = null;
  }

  try {
    const cardId = currentCard.value.id;
    
    // Scoring Logic:
    // If correct first try (not failed): +1
    // If failed (wrong or flipped): -1
    const scoreChange = hasFailed.value ? -1 : 1;

    if (isFlipped.value) {
      isFlipped.value = false;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    
    await store.updateReview(cardId, scoreChange);
    await store.loadWords();

    currentIndex.value = 0;

    userInput.value = new Array(answerLength.value).fill('');
    showResult.value = false;
    checkedAnswer.value = '';
    expectedAnswer.value = '';
    hasFailed.value = false;
    initializeInput();
  } finally {
    isTransitioning.value = false;
  }
};

onMounted(() => {
  window.addEventListener('keydown', (e) => {
    // If result is shown and it's incorrect, Enter key retries
    if (e.key === 'Enter' && showResult.value && isCorrect.value === false) {
      retryCard();
    }
  });
  
  if (dueWords.value.length > 0) {
    nextTick(() => initializeInput());
  }
});

watch(currentIndex, () => {
  initializeInput();
});
</script>

<template>
  <!-- Header -->
  <div class="text-center mb-6">
    <div class="flex items-center justify-between max-w-md mx-auto mb-4">
      <h1 class="text-2xl font-bold text-primary">Flashcards</h1>
      
      <div class="flex gap-2">
        <Button variant="ghost" size="icon" @click="emit('toggle-dark-mode')" class="rounded-full">
          <Sun v-if="isDarkMode" class="h-5 w-5" />
          <Moon v-else class="h-5 w-5" />
        </Button>
        


        <Button variant="ghost" size="icon" @click="emit('toggle-debug')" class="rounded-full text-muted-foreground hover:text-foreground">
          <Bug class="h-5 w-5" />
        </Button>

        <Button @click="emit('toggle-edit-view')" variant="outline" size="sm">
          <Edit3 class="h-4 w-4 mr-2" /> Manage Words
        </Button>
      </div>
    </div>
  </div>

  <!-- Flashcard -->
  <div class="flex-1 flex flex-col max-w-md mx-auto w-full gap-4">
    <div class="relative w-full perspective-1000">
      <Card
        class="w-full grid grid-cols-1 transition-transform duration-700 transform-style-preserve-3d cursor-pointer"
        :style="{ minHeight: `${cardHeight}rem` }"
        :class="{ 'rotate-y-180': isFlipped }" @click="flipCard">
        <!-- Front of the card -->
        <div class="col-start-1 row-start-1 w-full h-full backface-hidden flex flex-col">
          <CardContent class="p-8 text-center flex-1 flex flex-col justify-center relative">
            <!-- Score and Last Reviewed in corners -->
            <div class="absolute top-2 left-2 text-xs text-muted-foreground">
              <span v-if="store.isKeepGoingMode" class="text-amber-600 font-medium flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                No Score Mode
              </span>
              <span v-else>Score: {{ currentCard?.score }}</span>
            </div>
            <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
              {{ lastReviewedText }}
            </div>

            <div class="font-bold text-primary dark:text-purple-400 mb-6 transition-all duration-300 max-h-[200px] overflow-y-auto break-words w-full px-2"
                 :class="getTextSizeClass(currentCard?.translation)">
              {{ currentCard?.translation }}
            </div>
            <div v-if="currentCard?.article" class="mb-6">
              <span class="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-bold border shadow-sm"
                    :class="getArticleClass(currentCard?.article)">
                {{ currentCard?.article }}
              </span>
            </div>

            <div class="space-y-3">
              <div class="flex justify-center gap-1.5 flex-wrap w-fit mx-auto" @click.stop>
                <input v-for="(char, index) in userInput" :key="`${currentIndex}-${index}`"
                  :ref="el => { if (el) inputRefs[index] = el as HTMLInputElement }" v-model="userInput[index]"
                  @input="handleInput(index, $event)" @keydown="handleKeydown(index, $event)" @paste="handlePaste"
                  @focus="handleFocus(index)"
                  type="text" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off"
                  spellcheck="false" inputmode="text" enterkeyhint="next"
                  class="w-10 h-12 text-center text-xl font-semibold p-0 transition-all border rounded-md bg-background"
                  :class="{
                    'border-green-500 ring-2 ring-green-500 dark:border-green-600 dark:ring-green-600 bg-green-50 dark:bg-green-950': showResult && isCorrect,
                    'border-red-500 ring-2 ring-red-500 dark:border-red-600 dark:ring-red-600 bg-red-50 dark:bg-red-950': showResult && !isCorrect && userInput[index],
                    'border-muted-foreground/20 focus:border-primary focus:ring-2 focus:ring-primary': !showResult,
                    'animate-flash-success': justCorrectedIndex === index
                  }" />
              </div>

              <p class="text-sm text-muted-foreground transition-all duration-300">
                {{ showResult ? (isCorrect ? '✓ Correct!' : '✗ Incorrect') : 'Type answer - auto-checks when complete' }}
              </p>

              <!-- Debug info -->
              <p v-if="showResult" class="text-xs text-muted-foreground mt-2">
                Your answer: "{{ checkedAnswer }}" | Expected: "{{ currentCard?.original }}"
              </p>
            </div>

            <!-- Progress Indicator -->
            <div class="absolute bottom-4 left-0 right-0 flex justify-center gap-1 px-8">
              <div v-for="(_, index) in dueWords" :key="index" class="h-1.5 rounded-full transition-all duration-300"
                :class="[
                  index === currentIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/20'
                ]"></div>
            </div>
          </CardContent>
        </div>

        <!-- Back of the card -->
        <div class="col-start-1 row-start-1 w-full h-full backface-hidden rotate-y-180 flex flex-col">
          <CardContent class="p-8 text-center flex-1 flex flex-col justify-center relative">
            <!-- Score and Last Reviewed in corners -->
            <div class="absolute top-2 left-2 text-xs text-muted-foreground">
              <span v-if="store.isKeepGoingMode" class="text-amber-600 font-medium flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                No Score Mode
              </span>
              <span v-else>Score: {{ currentCard?.score }}</span>
            </div>
            <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
              {{ lastReviewedText }}
            </div>

            <div v-if="currentCard?.article" class="mb-2">
              <span class="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-lg font-bold border shadow-sm"
                    :class="getArticleClass(currentCard?.article)">
                {{ currentCard?.article }}
              </span>
            </div>
            <div class="font-bold text-primary dark:text-purple-400 mb-4 transition-all duration-300 max-h-[200px] overflow-y-auto break-words w-full px-2"
                 :class="getTextSizeClass(currentCard?.original)">
              {{ currentCard?.original }}
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

            <!-- Progress Indicator -->
            <div class="absolute bottom-4 left-0 right-0 flex justify-center gap-1 px-8">
              <div v-for="(_, index) in dueWords" :key="index" class="h-1.5 rounded-full transition-all duration-300"
                :class="[
                  index === currentIndex ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/20'
                ]"></div>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>

    <!-- Navigation directly under card -->
    <div class="flex flex-col gap-2">
      <div v-if="showResult && !isCorrect" class="w-full">
        <Button class="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-primary-foreground dark:bg-purple-600 dark:hover:bg-purple-700 dark:text-white" @click="retryCard">
          Retry
        </Button>
      </div>
      <!-- No other buttons! -->
    </div>

  </div>
</template>

<style scoped>
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

@keyframes flash-success {
  0% {
    background-color: rgba(34, 197, 94, 0.2);
    transform: scale(1.1);
  }
  100% {
    background-color: transparent;
    transform: scale(1);
  }
}

.animate-flash-success {
  animation: flash-success 0.5s ease-out;
}
</style>
