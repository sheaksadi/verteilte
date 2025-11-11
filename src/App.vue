<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
const userInput = ref('');
const showResult = ref(false);

const currentCard = computed(() => words.value[currentIndex.value]);

const isCorrect = computed(() => {
  if (!showResult.value) return null;
  return userInput.value.toLowerCase().trim() === currentCard.value.back.toLowerCase().trim();
});

const flipCard = () => {
  isFlipped.value = !isFlipped.value;
  showResult.value = false;
  userInput.value = '';
};

const checkSpelling = () => {
  showResult.value = true;
};

const nextCard = () => {
  if (currentIndex.value < words.value.length - 1) {
    currentIndex.value++;
  } else {
    currentIndex.value = 0;
  }
  isFlipped.value = false;
  showResult.value = false;
  userInput.value = '';
};

const prevCard = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  } else {
    currentIndex.value = words.value.length - 1;
  }
  isFlipped.value = false;
  showResult.value = false;
  userInput.value = '';
};
</script>

<template>
  <main class="min-h-screen bg-background p-4 flex flex-col">
    <!-- Header -->
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-primary mb-2">Flashcards</h1>
      <p class="text-sm text-muted-foreground">
        Card {{ currentIndex + 1 }} of {{ words.length }}
      </p>
    </div>

    <!-- Flashcard -->
    <div class="flex-1 flex flex-col max-w-md mx-auto w-full gap-4">
      <Card class="cursor-pointer transition-all hover:shadow-lg flex-1 flex items-center justify-center min-h-[300px]"
        @click="flipCard">
        <CardContent class="p-8 text-center">
          <div class="text-4xl font-bold text-primary mb-2">
            {{ isFlipped ? currentCard.back : currentCard.front }}
          </div>
          <p class="text-sm text-muted-foreground mt-4">
            {{ isFlipped ? 'Back' : 'Front' }} - Tap to flip
          </p>
        </CardContent>
      </Card>

      <!-- Navigation -->
      <div class="flex gap-2">
        <Button variant="outline" class="flex-1" @click="prevCard">
          Previous
        </Button>
        <Button variant="outline" class="flex-1" @click="nextCard">
          Next
        </Button>
      </div>

      <!-- Spelling Check Section -->
      <Card>
        <CardContent class="p-4">
          <h2 class="font-semibold mb-3">Check Your Spelling</h2>
          <p class="text-sm text-muted-foreground mb-3">
            Type: <span class="font-semibold text-foreground">{{ currentCard.front }}</span>
          </p>

          <div class="space-y-3">
            <Input v-model="userInput" placeholder="Type your answer..." @keyup.enter="checkSpelling" :class="{
              'border-green-500': showResult && isCorrect,
              'border-red-500': showResult && !isCorrect
            }" />

            <Button class="w-full" @click="checkSpelling" :disabled="!userInput.trim()">
              Check
            </Button>

            <div v-if="showResult" class="text-center p-3 rounded-lg" :class="{
              'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300': isCorrect,
              'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300': !isCorrect
            }">
              <p class="font-semibold mb-1">
                {{ isCorrect ? '✓ Correct!' : '✗ Incorrect' }}
              </p>
              <p v-if="!isCorrect" class="text-sm">
                Correct answer: <span class="font-bold">{{ currentCard.back }}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </main>
</template>
