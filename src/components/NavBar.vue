<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { Home, BookOpen, Sparkles, Settings } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';

const route = useRoute();
const store = useWordStore();

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
  // Update indicator after layout change
  nextTick(updateActiveIndicator);
};

onMounted(() => {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', checkVisualViewport);
    checkVisualViewport(); // Initial check
  }
  // Initial indicator position
  nextTick(updateActiveIndicator);
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

// Active Indicator Logic
const itemRefs = ref<HTMLElement[]>([]);
const indicatorStyle = ref({
  left: '0px',
  width: '0px',
  opacity: 0
});

const updateActiveIndicator = () => {
  const activeIndex = navItems.findIndex(item => item.name === route.name);
  if (activeIndex === -1 || !itemRefs.value[activeIndex]) {
    indicatorStyle.value.opacity = 0;
    return;
  }

  const el = itemRefs.value[activeIndex];
  indicatorStyle.value = {
    left: `${el.offsetLeft}px`,
    width: `${el.offsetWidth}px`,
    opacity: 1
  };
};

watch(() => route.name, () => {
  nextTick(updateActiveIndicator);
});

watch(isKeyboardOpen, () => {
  nextTick(updateActiveIndicator);
});
</script>

<template>
  <div 
    class="bg-background/80 backdrop-blur-md border-t z-50 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] overflow-hidden shrink-0"
    :class="{ 'h-0 border-none': isHidden }"
    :style="{ height: isHidden ? '0px' : `${navHeight}px` }"
  >
    <div class="max-w-md mx-auto h-full flex justify-around items-center px-2 relative">
      <!-- Sliding Active Indicator -->
      <div 
        class="absolute bg-primary/10 rounded-lg -z-10 transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]"
        :style="{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          height: isKeyboardOpen ? '28px' : '48px',
          opacity: indicatorStyle.opacity
        }"
      ></div>

      <router-link 
        v-for="(item, index) in navItems" 
        :key="item.name"
        :to="item.path"
        ref="itemRefs"
        class="flex flex-col items-center justify-center gap-0.5 p-1 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] relative group w-full"
        :class="[
          route.name === item.name ? 'text-primary scale-105' : 'text-muted-foreground hover:text-foreground',
          isKeyboardOpen ? 'py-1' : 'py-1.5'
        ]"
      >
        <component :is="item.icon" :class="isKeyboardOpen ? 'h-5 w-5' : 'h-6 w-6'" class="transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]" />
        
        <span 
          class="text-[10px] font-medium transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] origin-bottom"
          :class="{ 'opacity-0 h-0 scale-y-0 overflow-hidden': isKeyboardOpen }"
        >
          {{ item.label }}
        </span>
      </router-link>
    </div>
  </div>
</template>
