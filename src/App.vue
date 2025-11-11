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
  if (showResult.value) {
    showResult.value = false;
    userInput.value = '';
  } else {
    showResult.value = true;
  }
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
  <main class="min-h-screen bg-background p-4 flex flex-col pb-24">
    <!-- Header -->
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-primary mb-2">Flashcards</h1>
      <p class="text-sm text-muted-foreground">
        Card {{ currentIndex + 1 }} of {{ words.length }}
      </p>
    </div>

    <!-- Flashcard -->
    <div class="flex-1 flex flex-col max-w-md mx-auto w-full gap-4">
      <div class="relative w-full h-[300px] perspective-1000">
        <Card
          class="w-full h-full absolute transition-transform duration-700 transform-style-preserve-3d cursor-pointer"
          :class="{ 'rotate-y-180': isFlipped }" @click="flipCard">
          <!-- Front of the card -->
          <div class="absolute w-full h-full backface-hidden flex items-center justify-center">
            <CardContent class="p-8 text-center">
              <div class="text-4xl font-bold text-primary mb-2">
                {{ currentCard.front }}
              </div>
              <p class="text-sm text-muted-foreground mt-4">
                Front - Tap to flip
              </p>
            </CardContent>
          </div>

          <!-- Back of the card -->
          <div class="absolute w-full h-full backface-hidden rotate-y-180 flex items-center justify-center">
            <CardContent class="p-8 text-center">
              <div class="text-4xl font-bold text-primary mb-2">
                {{ currentCard.back }}
              </div>
              <p class="text-sm text-muted-foreground mt-4">
                Back - Tap to flip
              </p>
            </CardContent>
          </div>
        </Card>
      </div>

      <!-- Spelling Check Section -->
      <Card>
        <CardContent class="p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold">Practice Spelling</h2>
            <span class="text-xs text-muted-foreground">{{ currentCard.front }}</span>
          </div>

          <div class="space-y-3">
            <div class="relative">
              <Input v-model="userInput" placeholder="Type the translation..."
                @keyup.enter="userInput.trim() && checkSpelling()" class="text-lg pr-10" :class="{
                  'border-green-500 focus-visible:ring-green-500': showResult && isCorrect,
                  'border-red-500 focus-visible:ring-red-500': showResult && !isCorrect
                }" />
              <div v-if="showResult" class="absolute right-3 top-1/2 -translate-y-1/2 text-xl">
                {{ isCorrect ? '✓' : '✗' }}
              </div>
            </div>

            <Button class="w-full" @click="checkSpelling" :disabled="!userInput.trim()" variant="default">
              {{ showResult ? 'Try Again' : 'Check Answer' }}
            </Button>

            <div v-if="showResult && !isCorrect" class="text-center p-3 rounded-lg bg-muted">
              <p class="text-sm text-muted-foreground">
                Correct answer: <span class="font-semibold text-foreground">{{ currentCard.back }}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Navigation at bottom -->
    <div class="fixed bottom-0 left-0 right-0 p-4 bg-background border-t">
      <div class="max-w-md mx-auto grid grid-cols-3 gap-3">
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
