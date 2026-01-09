<script setup lang="ts">
import { computed } from 'vue';
import type { PracticeStats } from '@/lib/database';

const props = defineProps<{
  stats: PracticeStats[];
}>();

// Generate last 52 weeks of dates
const weeks = computed(() => {
  const result: { date: string; count: number; dayOfWeek: number }[][] = [];
  const today = new Date();
  
  // Start from 52 weeks ago, aligned to Sunday
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (52 * 7) - today.getDay());
  
  // Create a map for quick lookup
  const statsMap = new Map(props.stats.map(s => [s.date, s.count]));
  
  let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];
  
  for (let i = 0; i <= 52 * 7 + today.getDay(); i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const count = statsMap.get(dateStr) || 0;
    const dayOfWeek = date.getDay();
    
    currentWeek.push({ date: dateStr, count, dayOfWeek });
    
    if (dayOfWeek === 6) { // Saturday - end of week
      result.push(currentWeek);
      currentWeek = [];
    }
  }
  
  if (currentWeek.length > 0) {
    result.push(currentWeek);
  }
  
  return result;
});

// Get color intensity based on count
const getColorClass = (count: number): string => {
  if (count === 0) return 'bg-muted';
  if (count <= 5) return 'bg-green-200 dark:bg-green-900';
  if (count <= 15) return 'bg-green-400 dark:bg-green-700';
  if (count <= 30) return 'bg-green-500 dark:bg-green-600';
  return 'bg-green-600 dark:bg-green-500';
};

// Format date for tooltip
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

// Calculate total words practiced
const totalWords = computed(() => {
  return props.stats.reduce((sum, s) => sum + s.count, 0);
});

// Get today's count
const todayCount = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  return props.stats.find(s => s.date === today)?.count || 0;
});

// Month labels
const months = computed(() => {
  const result: { label: string; colStart: number }[] = [];
  let lastMonth = -1;
  
  weeks.value.forEach((week, weekIndex) => {
    if (week.length > 0) {
      const firstDay = new Date(week[0].date);
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        result.push({
          label: firstDay.toLocaleDateString('en-US', { month: 'short' }),
          colStart: weekIndex
        });
        lastMonth = month;
      }
    }
  });
  
  return result;
});
</script>

<template>
  <div class="space-y-3">
    <!-- Summary stats -->
    <div class="flex gap-4 text-sm">
      <div class="text-muted-foreground">
        Today: <span class="font-semibold text-foreground">{{ todayCount }}</span> words
      </div>
      <div class="text-muted-foreground">
        Total: <span class="font-semibold text-foreground">{{ totalWords }}</span> words
      </div>
    </div>
    
    <!-- Chart container -->
    <div class="overflow-x-auto pb-2">
      <div class="min-w-max">
        <!-- Month labels -->
        <div class="flex text-xs text-muted-foreground mb-1 pl-8">
          <div class="relative w-full" style="height: 16px;">
            <span 
              v-for="month in months" 
              :key="month.label + month.colStart"
              class="absolute"
              :style="{ left: `${month.colStart * 13}px` }"
            >
              {{ month.label }}
            </span>
          </div>
        </div>
        
        <!-- Grid with day labels -->
        <div class="flex">
          <!-- Day labels -->
          <div class="flex flex-col gap-0.5 text-xs text-muted-foreground mr-1" style="width: 28px;">
            <div class="h-3"></div>
            <div class="h-3 flex items-center">Mon</div>
            <div class="h-3"></div>
            <div class="h-3 flex items-center">Wed</div>
            <div class="h-3"></div>
            <div class="h-3 flex items-center">Fri</div>
            <div class="h-3"></div>
          </div>
          
          <!-- Weeks grid -->
          <div class="flex gap-0.5">
            <div 
              v-for="(week, weekIndex) in weeks" 
              :key="weekIndex"
              class="flex flex-col gap-0.5"
            >
              <div
                v-for="day in week"
                :key="day.date"
                :class="[
                  'w-3 h-3 rounded-sm transition-colors',
                  getColorClass(day.count)
                ]"
                :title="`${formatDate(day.date)}: ${day.count} words`"
              />
            </div>
          </div>
        </div>
        
        <!-- Legend -->
        <div class="flex items-center gap-1 mt-2 text-xs text-muted-foreground justify-end">
          <span>Less</span>
          <div class="w-3 h-3 rounded-sm bg-muted" />
          <div class="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" />
          <div class="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" />
          <div class="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600" />
          <div class="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
          <span>More</span>
        </div>
      </div>
    </div>
  </div>
</template>
