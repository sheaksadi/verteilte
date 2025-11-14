<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun } from 'lucide-vue-next';

const words = ref([
  { front: 'Hello', back: 'Hola' },
  { front: 'Goodbye', back: 'Adiós' },
  { front: 'Thank you', back: 'Gracias' },
  { front: 'Please', back: 'Por favor' },
  { front: 'Yes', back: 'Sí' },
  { front: 'No', back: 'No' },
]);

const currentIndex = ref(0);
const isFlipped = ref(false);
const userInput = ref<string[]>([]);
const showResult = ref(false);
const isDarkMode = ref(false);
const inputRefs = ref<HTMLInputElement[]>([]);

const currentCard = computed(() => words.value[currentIndex.value]);

const answerLength = computed(() => currentCard.value.back.length);

const userInputString = computed(() => userInput.value.join(''));

const isCorrect = computed(() => {
  if (!showResult.value) return null;
  return userInputString.value.toLowerCase().trim() === currentCard.value.back.toLowerCase().trim();
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
  if (currentIndex.value < words.value.length - 1) {
    currentIndex.value++;
  } else {
    currentIndex.value = 0;
  }
  isFlipped.value = false;
  initializeInput();
};

const prevCard = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  } else {
    currentIndex.value = words.value.length - 1;
  }
  isFlipped.value = false;
  initializeInput();
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

onMounted(() => {
  // Check system preference for dark mode
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode.value = true;
    document.documentElement.classList.add('dark');
  }
  
  // Initialize input for first card
  initializeInput();
});

// Watch for card changes to reinitialize input
watch(currentIndex, () => {
  initializeInput();
});
</script>

<template>
  <main class="min-h-screen bg-background p-4 flex flex-col transition-colors duration-300">
    <!-- Header -->
    <div class="text-center mb-6">
      <div class="flex items-center justify-between max-w-md mx-auto mb-4">
        <h1 class="text-2xl font-bold text-primary">Flashcards</h1>
        <Button variant="outline" size="icon" @click="toggleDarkMode" class="rounded-full">
          <Sun v-if="isDarkMode" class="h-5 w-5" />
          <Moon v-else class="h-5 w-5" />
        </Button>
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
                {{ currentCard.front }}
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
                {{ currentCard.back }}
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
