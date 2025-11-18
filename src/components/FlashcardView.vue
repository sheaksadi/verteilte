<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Edit3, Upload, Copy, Check } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import DebugInfo from '@/components/DebugInfo.vue';

const props = defineProps<{
  isDarkMode: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-dark-mode'): void;
  (e: 'toggle-edit-view'): void;
  (e: 'open-import-dialog'): void;
  (e: 'export-words'): void;
  (e: 'reset-debug'): void;
}>();

const store = useWordStore();
const { dueWords, debugInfo } = storeToRefs(store);

const currentIndex = ref(0);
const isFlipped = ref(false);
const hasPeeked = ref(false);
const userInput = ref<string[]>([]);
const showResult = ref(false);
const inputRefs = ref<HTMLInputElement[]>([]);
const checkedAnswer = ref('');
const expectedAnswer = ref('');
const exportSuccess = ref(false);

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

// Calculate next review time based on score change
const calculateNextReview = (currentScore: number, scoreChange: number): number => {
  const now = Date.now();
  const newScore = Math.max(0, currentScore + scoreChange);

  // If score is 0 (new card or failed card), start with 10 minutes
  if (newScore === 0) {
    return now + 10 * 60 * 1000;
  }

  // For positive scores, use exponential growth
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
  hasPeeked.value = false;
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

      showResult.value = true;

      // Then trigger flip
      setTimeout(() => {
        target.blur();
        flipCard();

        // If correct AND card wasn't peeked at, auto-rate as great
        if (isAnswerCorrect && !hasPeeked.value) {
          setTimeout(() => {
            nextCard('great');
          }, 1000);
        } else {
          // If incorrect OR peeked, auto-rate as bad
          setTimeout(() => {
            nextCard('bad');
          }, 1000);
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

      setTimeout(() => {
        flipCard();
      }, 100);
    }
  }, 10);
};

const flipCard = () => {
  // Only flip the card, don't change showResult here
  // showResult is set when typing completes
  if (!showResult.value && !isFlipped.value) {
    hasPeeked.value = true;
  }
  isFlipped.value = !isFlipped.value;
};

const laterCard = async () => {
  if (!currentCard.value?.id) return;

  await store.updateReviewLater(currentCard.value.id);

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
};

const nextCard = async (rating: 'bad' | 'good' | 'great') => {
  if (!currentCard.value?.id) return;

  // Update score based on rating
  const scoreChange = rating === 'bad' ? -2 : rating === 'good' ? 1 : 2;

  await store.updateReview(currentCard.value.id, scoreChange);

  // First flip back to front if currently flipped
  if (isFlipped.value) {
    isFlipped.value = false;
    // Wait for flip animation to complete before loading next card
    setTimeout(async () => {
      // Reload words to get updated order
      await store.loadWords();

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
    await store.loadWords();

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

const nextCardAfterIncorrect = () => {
    // If the user presses Enter after getting it wrong, we treat it as 'bad'
    nextCard('bad');
}

const handleExport = () => {
    emit('export-words');
    exportSuccess.value = true;
    setTimeout(() => exportSuccess.value = false, 3000);
}

onMounted(() => {
  // Add global keyboard listener for Enter key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && showResult.value && isCorrect.value === false) {
      // Enter key triggers Next button when answer is incorrect
      nextCardAfterIncorrect();
    }
  });
  
  if (dueWords.value.length > 0) {
    nextTick(() => initializeInput());
  }
});

// Watch for card changes to reinitialize input
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
        <Button variant="outline" size="icon" @click="handleExport" class="rounded-full relative"
          :title="exportSuccess ? 'Copied to clipboard!' : 'Export words to clipboard'">
          <Check v-if="exportSuccess" class="h-5 w-5 text-green-600" />
          <Copy v-else class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('open-import-dialog')" class="rounded-full" title="Import words">
          <Upload class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('toggle-edit-view')" class="rounded-full">
          <Edit3 class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('toggle-dark-mode')" class="rounded-full">
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
              Score: {{ currentCard?.score }}
            </div>
            <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
              {{ lastReviewedText }}
            </div>

            <div class="text-4xl font-bold text-primary dark:text-purple-400 mb-6 transition-all duration-300">
              {{ currentCard?.translation }}
            </div>
            <div v-if="currentCard?.article" class="text-sm text-muted-foreground mb-4">
              Article: {{ currentCard?.article }}
            </div>

            <div class="space-y-3">
              <div class="flex justify-center gap-1.5 flex-wrap" @click.stop>
                <input v-for="(char, index) in userInput" :key="`${currentIndex}-${index}`"
                  :ref="el => { if (el) inputRefs[index] = el as HTMLInputElement }" v-model="userInput[index]"
                  @input="handleInput(index, $event)" @keydown="handleKeydown(index, $event)" @paste="handlePaste"
                  type="text" maxlength="1" autocomplete="off" autocorrect="off" autocapitalize="off"
                  spellcheck="false" inputmode="text" enterkeyhint="next"
                  class="w-10 h-12 text-center text-xl font-semibold p-0 transition-all border rounded-md bg-background"
                  :class="{
                    'border-green-500 ring-2 ring-green-500 dark:border-green-600 dark:ring-green-600 bg-green-50 dark:bg-green-950': showResult && isCorrect,
                    'border-red-500 ring-2 ring-red-500 dark:border-red-600 dark:ring-red-600 bg-red-50 dark:bg-red-950': showResult && !isCorrect && userInput[index],
                    'border-muted-foreground/20 focus:border-primary focus:ring-2 focus:ring-primary': !showResult
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
          </CardContent>
        </div>

        <!-- Back of the card -->
        <div class="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col">
          <CardContent class="p-8 text-center flex-1 flex flex-col justify-center relative">
            <!-- Score and Last Reviewed in corners -->
            <div class="absolute top-2 left-2 text-xs text-muted-foreground">
              Score: {{ currentCard?.score }}
            </div>
            <div class="absolute top-2 right-2 text-xs text-muted-foreground text-right">
              {{ lastReviewedText }}
            </div>

            <div class="text-4xl font-bold text-primary dark:text-purple-400 mb-4 transition-all duration-300">
              {{ currentCard?.original }}
            </div>
            <div v-if="currentCard?.article" class="text-lg text-muted-foreground mb-4">
              {{ currentCard?.article }}
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
    <div class="flex flex-col gap-2">
      <div class="grid grid-cols-4 gap-3">
        <Button variant="outline" class="w-full flex flex-col gap-0.5 h-auto py-2" @click="laterCard">
          <span class="font-semibold">Later</span>
          <span class="text-xs text-muted-foreground">1 min</span>
        </Button>
        <Button variant="outline" class="w-full flex flex-col gap-0.5 h-auto py-2" @click="nextCard('bad')">
          <span class="font-semibold">Bad</span>
          <span class="text-xs text-muted-foreground">{{ badInterval }}</span>
        </Button>
        <Button variant="outline" class="w-full flex flex-col gap-0.5 h-auto py-2" @click="nextCard('good')">
          <span class="font-semibold">Good</span>
          <span class="text-xs text-muted-foreground">{{ goodInterval }}</span>
        </Button>
        <Button variant="outline" class="w-full flex flex-col gap-0.5 h-auto py-2" @click="nextCard('great')">
          <span class="font-semibold">Great</span>
          <span class="text-xs text-muted-foreground">{{ greatInterval }}</span>
        </Button>
      </div>
    </div>

    <!-- Debug Info -->
    <DebugInfo />
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
</style>
