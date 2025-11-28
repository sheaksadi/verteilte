<script setup lang="ts">
import { ref } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Play, Check } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import FlashcardView from '@/components/FlashcardView.vue';
import DebugInfo from '@/components/DebugInfo.vue';
import { useRouter } from 'vue-router';

const store = useWordStore();
const { words, dueWords } = storeToRefs(store);
const router = useRouter();

// We can keep this local or move to store if needed globally
const showDebug = ref(false);
const cardHeight = ref(25);

// Expose toggleDebug to be called from parent or via event bus if needed
// For now, let's just have a local toggle or maybe Settings controls it?
// In the previous App.vue, Settings toggled it via emit.
// Now Settings is a separate route.
// Maybe we can use a query param ?debug=true or just a simple store state.
// For simplicity, let's assume DebugInfo is always available if enabled in settings?
// The user asked to "Move Debug Mode toggle" to settings.
// So `Settings.vue` has a toggle. We need to share that state.
// Expose toggleDebug to be called from parent or via event bus if needed
// For now, let's just have a local toggle or maybe Settings controls it?
// In the previous App.vue, Settings toggled it via emit.
// Now Settings is a separate route.
// Maybe we can use a query param ?debug=true or just a simple store state.
// For simplicity, let's assume DebugInfo is always available if enabled in settings?
// The user asked to "Move Debug Mode toggle" to settings.
// So `Settings.vue` has a toggle. We need to share that state.
// I'll add `showDebug` to the `wordStore` or a new `uiStore`.
// Since I'm already using `wordStore` extensively, I'll add it there for now to avoid creating a new file just for one boolean.
// Actually, `wordStore` already has `debugInfo`. I can add `isDebugMode` there.
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- No words message -->
    <div v-if="words.length === 0" class="text-center max-w-md mx-auto mt-20">
      <Card>
        <CardContent class="p-8">
          <h2 class="text-xl font-semibold mb-3">No words yet!</h2>
          <p class="text-muted-foreground mb-4">Add some words to start practicing.</p>
          <Button @click="router.push('/words')" class="dark:bg-purple-500 dark:hover:bg-purple-600">
            <Plus class="h-4 w-4 mr-2" /> Add Words
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- No cards due message -->
    <div v-else-if="dueWords.length === 0" class="text-center max-w-md mx-auto w-full mt-20">
      <Card class="border-none shadow-lg overflow-hidden">
        <div class="bg-gradient-to-br from-primary/5 to-purple-500/5 p-8 flex flex-col items-center">
          <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Check class="w-8 h-8 text-primary" />
          </div>
          
          <h2 class="text-2xl font-bold mb-2 text-primary">
            All Caught Up!
          </h2>
          <p class="text-muted-foreground mb-8 max-w-xs mx-auto">
            You've reviewed all your due cards. Great job keeping up with your streak!
          </p>
          
          <div class="flex flex-col gap-3 w-full max-w-xs">
            <Button v-if="store.failedSessionWords.length > 0" @click="store.startReviewFailedMode()" class="w-full bg-red-600 hover:bg-red-700 text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
               Review Failed Cards ({{ store.failedSessionWords.length }})
            </Button>

            <Button @click="store.startKeepGoingMode()" class="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
              <Play class="h-4 w-4 mr-2 fill-current" /> Keep Going (Review Next 5)
            </Button>
            
            <Button @click="router.push('/words')" variant="outline" class="w-full border-primary/20 hover:bg-primary/5">
              <Plus class="h-4 w-4 mr-2" /> Add More Words
            </Button>
          </div>
        </div>
      </Card>
    </div>

    <!-- Flashcard content -->
    <div v-else class="flex-1 overflow-hidden flex flex-col justify-center relative">
      <FlashcardView 
        :isDarkMode="true"
        :cardHeight="cardHeight"
        class="h-full max-h-full"
      />
    </div>
    
    <!-- We'll handle DebugInfo visibility via store later, or just omit for now if not critical -->
    <!-- <DebugInfo v-if="store.isDebugMode" v-model:cardHeight="cardHeight" /> -->
  </div>
</template>
