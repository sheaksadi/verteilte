<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Home, BookOpen, Sparkles, Settings } from 'lucide-vue-next';

const route = useRoute();

// Keyboard detection logic
const isKeyboardOpen = ref(false);
const navHeight = ref(64); // Default height

const checkVisualViewport = () => {
  if (!window.visualViewport) return;
  
  const height = window.visualViewport.height;
  const windowHeight = window.innerHeight;
  
  // If viewport is significantly smaller than window, keyboard is likely open
  if (windowHeight - height > 150) {
    isKeyboardOpen.value = true;
    navHeight.value = 40; // Shrink height
  } else {
    isKeyboardOpen.value = false;
    navHeight.value = 64; // Restore height
  }
};

onMounted(() => {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', checkVisualViewport);
    checkVisualViewport(); // Initial check
  }
});

onUnmounted(() => {
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', checkVisualViewport);
  }
});

const isHidden = computed(() => {
  return route.meta.hideNav === true;
});

const navItems = [
  { name: 'home', path: '/', icon: Home, label: 'Practice' },
  { name: 'words', path: '/words', icon: BookOpen, label: 'Words' },
  { name: 'add', path: '/add', icon: Sparkles, label: 'AI Add' },
  { name: 'settings', path: '/settings', icon: Settings, label: 'Settings' },
];
</script>

<template>
  <div 
    class="bg-background/80 backdrop-blur-md border-t z-50 transition-all duration-100 ease-out overflow-hidden shrink-0"
    :class="{ 'h-0 border-none': isHidden }"
    :style="{ height: isHidden ? '0px' : `${navHeight}px` }"
  >
    <div class="max-w-md mx-auto h-full flex justify-around items-center px-2">
      <router-link 
        v-for="item in navItems" 
        :key="item.name"
        :to="item.path"
        class="flex flex-col items-center justify-center gap-0.5 p-1 rounded-lg transition-all duration-100 relative group"
        :class="[
          route.name === item.name ? 'text-primary scale-105' : 'text-muted-foreground hover:text-foreground',
          isKeyboardOpen ? 'py-1' : 'py-1.5'
        ]"
      >
        <!-- Active Indicator Background -->
        <div 
          v-if="route.name === item.name" 
          class="absolute inset-0 bg-primary/10 rounded-lg -z-10 animate-in fade-in zoom-in duration-100"
        ></div>

        <component :is="item.icon" :class="isKeyboardOpen ? 'h-5 w-5' : 'h-6 w-6'" class="transition-all duration-100" />
        
        <span 
          class="text-[10px] font-medium transition-all duration-100 origin-bottom"
          :class="{ 'opacity-0 h-0 scale-y-0 overflow-hidden': isKeyboardOpen }"
        >
          {{ item.label }}
        </span>
      </router-link>
    </div>
  </div>
</template>
