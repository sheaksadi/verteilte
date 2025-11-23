<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Play, Check, Home, BookOpen, Sparkles, Settings as SettingsIcon } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import FlashcardView from '@/components/FlashcardView.vue';
import WordManager from '@/components/WordManager.vue';
import ImportDialog from '@/components/ImportDialog.vue';
import Auth from '@/components/Auth.vue';
import DebugInfo from '@/components/DebugInfo.vue';
import Settings from '@/components/Settings.vue';
import AIWordAdder from '@/components/AIWordAdder.vue';

const store = useWordStore();
const { words, dueWords, isLoading, debugInfo, isLoggedIn } = storeToRefs(store);

type View = 'home' | 'words' | 'ai-add' | 'settings';
const currentView = ref<View>('home');

const showImportDialog = ref(false);
const showAuthDialog = ref(false);
const showDebug = ref(false);
const cardHeight = ref(25);

const openImportDialog = () => {
  showImportDialog.value = true;
};

const toggleDebug = () => {
  showDebug.value = !showDebug.value;
};

onMounted(async () => {
  // Detect platform
  debugInfo.value.platform = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'tauri' : 'browser';

  // Check system preference for dark mode
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
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
  <main class="min-h-screen bg-background flex flex-col transition-colors duration-300 relative pb-24">
    
    <!-- Content Area -->
    <div class="flex-1 p-4 overflow-y-auto">
      <!-- Loading state -->
      <div v-if="isLoading" class="flex items-center justify-center min-h-[50vh]">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p class="text-muted-foreground">Loading...</p>
        </div>
      </div>

      <div v-else>
        <!-- Home / Practice View -->
        <div v-if="currentView === 'home'">
          <!-- No words message -->
          <div v-if="words.length === 0" class="text-center max-w-md mx-auto mt-20">
            <Card>
              <CardContent class="p-8">
                <h2 class="text-xl font-semibold mb-3">No words yet!</h2>
                <p class="text-muted-foreground mb-4">Add some words to start practicing.</p>
                <Button @click="currentView = 'words'" class="dark:bg-purple-500 dark:hover:bg-purple-600">
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
                  
                  <Button @click="currentView = 'words'" variant="outline" class="w-full border-primary/20 hover:bg-primary/5">
                    <Plus class="h-4 w-4 mr-2" /> Add More Words
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <!-- Flashcard content -->
          <FlashcardView v-else 
            :isDarkMode="true"
            :cardHeight="cardHeight"
          />
          
          <DebugInfo v-if="showDebug" v-model:cardHeight="cardHeight" />
        </div>

        <!-- Words View -->
        <WordManager v-else-if="currentView === 'words'" @open-import-dialog="openImportDialog" @close="currentView = 'home'" />

        <!-- AI Add View -->
        <AIWordAdder v-else-if="currentView === 'ai-add'" />

        <!-- Settings View -->
        <Settings v-else-if="currentView === 'settings'" @open-import="openImportDialog" @toggle-debug="toggleDebug" />
      </div>
    </div>

    <!-- Bottom Navigation Bar -->
    <div class="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t p-2 z-50">
      <div class="max-w-md mx-auto flex justify-around items-center">
        <button @click="currentView = 'home'" 
          class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors"
          :class="currentView === 'home' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'">
          <Home class="h-6 w-6" />
          <span class="text-[10px] font-medium">Practice</span>
        </button>
        
        <button @click="currentView = 'words'" 
          class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors"
          :class="currentView === 'words' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'">
          <BookOpen class="h-6 w-6" />
          <span class="text-[10px] font-medium">Words</span>
        </button>

        <button @click="currentView = 'ai-add'" 
          class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors"
          :class="currentView === 'ai-add' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'">
          <Sparkles class="h-6 w-6" />
          <span class="text-[10px] font-medium">AI Add</span>
        </button>

        <button @click="currentView = 'settings'" 
          class="flex flex-col items-center gap-1 p-2 rounded-lg transition-colors"
          :class="currentView === 'settings' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'">
          <SettingsIcon class="h-6 w-6" />
          <span class="text-[10px] font-medium">Settings</span>
        </button>
      </div>
    </div>

    <!-- Dialogs -->
    <ImportDialog v-if="showImportDialog" @close="showImportDialog = false" />
    <Auth v-if="showAuthDialog" @close="showAuthDialog = false" />
  </main>
</template>
