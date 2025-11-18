<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import FlashcardView from '@/components/FlashcardView.vue';
import WordManager from '@/components/WordManager.vue';
import ImportDialog from '@/components/ImportDialog.vue';
import DebugInfo from '@/components/DebugInfo.vue';

const store = useWordStore();
const { words, dueWords, isLoading, debugInfo } = storeToRefs(store);

const showEditView = ref(false);
const showImportDialog = ref(false);
const isDarkMode = ref(false);

const toggleEditView = () => {
  showEditView.value = !showEditView.value;
};

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

const openImportDialog = () => {
  showImportDialog.value = true;
};

onMounted(async () => {
  // Detect platform
  debugInfo.value.platform = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'browser';

  // Check system preference for dark mode
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    isDarkMode.value = true;
    document.documentElement.classList.add('dark');
  }

  // Initialize dictionary
  store.initDictionary();

  // Load words
  await store.loadWords();
  
  // Ensure minimum loading time to prevent flash
  setTimeout(() => {
    isLoading.value = false;
  }, 300);
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
    <WordManager v-else-if="showEditView" @close="toggleEditView" />

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
        <DebugInfo />
      </div>

      <!-- Flashcard content -->
      <FlashcardView v-else 
        :isDarkMode="isDarkMode"
        @toggle-dark-mode="toggleDarkMode"
        @toggle-edit-view="toggleEditView"
        @open-import-dialog="openImportDialog"
      />
    </div>

    <!-- Import Dialog -->
    <ImportDialog v-if="showImportDialog" @close="showImportDialog = false" />
  </main>
</template>
