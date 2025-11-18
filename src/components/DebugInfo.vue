<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';

const store = useWordStore();
const { debugInfo } = storeToRefs(store);

const resetAllCardsDebug = async () => {
  if (confirm('Reset all cards to score 0 and make them due now? This cannot be undone!')) {
    await store.resetWords();
    alert('All cards have been reset!');
  }
};
</script>

<template>
  <Card class="mt-4">
    <CardContent class="p-3">
      <h3 class="text-xs font-semibold mb-2">Debug Info</h3>
      <div class="text-xs text-muted-foreground space-y-1">
        <div>Platform: <span class="font-mono">{{ debugInfo.platform }}</span></div>
        <div>Words in DB: <span class="font-mono">{{ debugInfo.dbWordsCount }}</span></div>
        <div>Dictionary Loaded: <span
            :class="debugInfo.dictionaryLoaded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
            class="font-mono">{{ debugInfo.dictionaryLoaded ? 'YES' : 'NO' }}</span></div>
        <div v-if="debugInfo.dictionaryVersion">Dictionary Version: <span class="font-mono">{{
          debugInfo.dictionaryVersion }}</span></div>
        <div v-if="debugInfo.loadError" class="text-red-600 dark:text-red-400 break-words mt-1">Error: {{
          debugInfo.loadError }}</div>
      </div>

      <div class="mt-3 border-t pt-2">
        <Button @click="resetAllCardsDebug" variant="destructive" size="sm" class="w-full text-xs">
          Reset All Cards (Score=0, Due Now)
        </Button>
      </div>

      <div v-if="debugInfo.dictionaryLogs.length > 0" class="mt-3 border-t pt-2">
        <div class="text-xs font-semibold mb-1">Dictionary Logs ({{ debugInfo.dictionaryLogs.length }}):</div>
        <div class="max-h-60 overflow-y-auto bg-black/5 dark:bg-white/5 p-2 rounded">
          <div v-for="(log, i) in debugInfo.dictionaryLogs" :key="i"
            class="text-[10px] font-mono break-words py-0.5 leading-tight"
            :class="log.includes('ERROR') ? 'text-red-600 dark:text-red-400 font-semibold' : log.includes('✓') || log.includes('Successfully') ? 'text-green-600 dark:text-green-400' : ''">
            {{ log }}</div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
