<script setup lang="ts">
import { onMounted } from 'vue';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import ImportDialog from '@/components/ImportDialog.vue';
import Auth from '@/components/Auth.vue';
import NavBar from '@/components/NavBar.vue';

const store = useWordStore();
const { isLoading, debugInfo } = storeToRefs(store);

// Global dialog states could be moved to a UI store, but for now we can keep them here 
// or trigger them via events/bus. 
// However, since Settings is now a route, it can handle its own dialogs or use a global store.
// The ImportDialog was triggered from WordManager and Settings.
// Let's use a simple event bus or store for global dialogs if needed.
// For now, let's assume components handle their own dialogs or we pass props?
// Router views don't easily accept props from App.vue without setup.
// I'll leave ImportDialog here and maybe expose a provide/inject or use a store.
// Actually, `WordManager` and `Settings` emitted `open-import-dialog`.
// I'll use a simple global state for this dialog since it's used in multiple places.
// Or better, I'll move `ImportDialog` into the views that need it, or make it a global component controlled by store.
// Let's add `showImportDialog` to `wordStore` for simplicity as it relates to words.

const showAuthDialog = ref(false); // This is triggered by sync if not logged in.

// We need to listen to store for auth requests if we want to show dialog globally.
// The store currently just sets `showAuthDialog.value = true` in the old App.vue logic.
// But store doesn't have access to `showAuthDialog` ref.
// In the old App.vue: `handleSyncClick` checked `isLoggedIn`.
// I'll add a watcher or just let the views handle auth triggers.
// But `NavBar` has a sync status? No, `NavBar` just links.
// `Settings` has the sync button.
// So `Settings` can import `Auth` component directly.
// `App.vue` doesn't need to handle Auth dialog anymore if it's only triggered from Settings.
// Wait, `WordManager` also had sync? No, only `App.vue` top bar had sync.
// So `Settings` view now owns Sync.
// So I can remove Auth/Import dialogs from App.vue and move them to Settings/WordManager.

import { ref } from 'vue';

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
  <main class="h-dvh w-screen bg-background flex flex-col overflow-hidden relative">
    
    <!-- Content Area -->
    <!-- flex-1 to take available space, overflow-hidden to prevent body scroll -->
    <!-- The router-view container will handle scrolling -->
    <div class="flex-1 relative w-full overflow-hidden flex flex-col">
      <!-- Loading state -->
      <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-background z-50">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p class="text-muted-foreground">Loading...</p>
        </div>
      </div>

      <!-- Router View -->
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <!-- Remove pb-24 since NavBar is not fixed anymore -->
          <component :is="Component" class="h-full w-full overflow-y-auto p-4" />
        </transition>
      </router-view>
    </div>

    <!-- Navigation Bar -->
    <!-- It is now a flex item, so it will sit at the bottom -->
    <NavBar />

  </main>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

