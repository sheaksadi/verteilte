<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Play, Check, User, RefreshCw, LogOut } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import FlashcardView from '@/components/FlashcardView.vue';
import WordManager from '@/components/WordManager.vue';
import ImportDialog from '@/components/ImportDialog.vue';
import Auth from '@/components/Auth.vue';
import DebugInfo from '@/components/DebugInfo.vue';

const store = useWordStore();
const { words, dueWords, isLoading, debugInfo, isLoggedIn, user, isSyncing } = storeToRefs(store);

const showEditView = ref(false);
const showImportDialog = ref(false);
const showAuthDialog = ref(false);
const showDebug = ref(false);
const isDarkMode = ref(false);
const cardHeight = ref(32);

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

const handleSyncClick = () => {
  if (isLoggedIn.value) {
    store.sync();
  } else {
    showAuthDialog.value = true;
  }
};

const handleLogout = () => {
  store.logout();
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
  <main class="min-h-screen bg-background p-4 flex flex-col transition-colors duration-300 relative">
    <!-- User/Sync Controls (Top Left) -->
    <div class="absolute top-4 left-4 z-10 flex gap-2">
      <Button variant="outline" size="icon" @click="handleSyncClick" class="rounded-full bg-background/80 backdrop-blur-sm shadow-sm" :title="isLoggedIn ? 'Sync now' : 'Login to sync'">
        <RefreshCw v-if="isLoggedIn" class="h-4 w-4" :class="{ 'animate-spin': isSyncing }" />
        <User v-else class="h-4 w-4" />
      </Button>
      <Button v-if="isLoggedIn" variant="outline" size="icon" @click="handleLogout" class="rounded-full bg-background/80 backdrop-blur-sm shadow-sm" title="Logout">
        <LogOut class="h-4 w-4" />
      </Button>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p class="text-muted-foreground">Loading...</p>
      </div>
    </div>

    <!-- Edit View -->
    <WordManager v-else-if="showEditView" @close="toggleEditView" @open-import-dialog="openImportDialog" />

    <!-- Practice View -->
    <div v-else>
      <!-- No words message -->
      <div v-if="words.length === 0" class="text-center max-w-md mx-auto mt-20">
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
              <Button @click="store.startKeepGoingMode()" class="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
                <Play class="h-4 w-4 mr-2 fill-current" /> Keep Going (Review Next 5)
              </Button>
              
              <Button @click="toggleEditView" variant="outline" class="w-full border-primary/20 hover:bg-primary/5">
                <Plus class="h-4 w-4 mr-2" /> Add More Words
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <!-- Flashcard content -->
      <FlashcardView v-else 
        :isDarkMode="isDarkMode"
        :cardHeight="cardHeight"
        @toggle-dark-mode="toggleDarkMode"
        @toggle-edit-view="toggleEditView"
        @open-import-dialog="openImportDialog"
        @toggle-debug="showDebug = !showDebug"
      />
      
      <DebugInfo v-if="showDebug" v-model:cardHeight="cardHeight" />
    </div>

    <!-- Import Dialog -->
    <ImportDialog v-if="showImportDialog" @close="showImportDialog = false" />
    
    <!-- Auth Dialog -->
    <Auth v-if="showAuthDialog" @close="showAuthDialog = false" />
  </main>
</template>
