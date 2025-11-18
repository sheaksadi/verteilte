<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Upload } from 'lucide-vue-next';
import { importWords, getAllWords } from '@/lib/database';
import { useWordStore } from '@/stores/wordStore';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useWordStore();
const importText = ref('');
const importResult = ref<{ added: number; skipped: number; errors: string[] } | null>(null);

const handleImport = async () => {
  if (!importText.value.trim()) {
    return;
  }

  const result = await importWords(importText.value);
  importResult.value = result;

  // Reload words in store
  await store.loadWords();
};

const close = () => {
  emit('close');
  importText.value = '';
  importResult.value = null;
};
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
    @click.self="close">
    <Card class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <CardContent class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold">Import Words</h2>
          <Button variant="ghost" size="icon" @click="close">
            <X class="h-5 w-5" />
          </Button>
        </div>

        <div class="space-y-4">
          <div>
            <p class="text-sm text-muted-foreground mb-2">
              Paste your words below. Format: <span class="font-mono">original | translation | article</span>
            </p>
            <p class="text-sm text-muted-foreground mb-3">
              Lines starting with # are comments. Example:<br>
              <span class="font-mono text-xs">Haus | House | das</span><br>
              <span class="font-mono text-xs">Katze | Cat | die</span>
            </p>
            <textarea v-model="importText"
              class="w-full h-64 p-3 rounded-md border border-input bg-background font-mono text-sm resize-none"
              placeholder="# Paste your words here&#10;Haus | House | das&#10;Katze | Cat | die&#10;Hund | Dog | der"></textarea>
          </div>

          <div v-if="importResult" class="rounded-lg border p-4 space-y-2">
            <p class="font-semibold">Import Results:</p>
            <div class="text-sm space-y-1">
              <p class="text-green-600 dark:text-green-400">✓ Added: {{ importResult.added }} words</p>
              <p class="text-yellow-600 dark:text-yellow-400">⊘ Skipped: {{ importResult.skipped }} (already exist)
              </p>
              <p v-if="importResult.errors.length > 0" class="text-red-600 dark:text-red-400">
                ✗ Errors: {{ importResult.errors.length }}
              </p>
            </div>
            <div v-if="importResult.errors.length > 0" class="mt-2 max-h-32 overflow-y-auto">
              <p class="text-xs font-semibold mb-1">Error details:</p>
              <div class="text-xs text-red-600 dark:text-red-400 space-y-0.5 font-mono">
                <p v-for="(error, i) in importResult.errors" :key="i">{{ error }}</p>
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <Button @click="handleImport" class="flex-1" :disabled="!importText.trim()">
              <Upload class="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline" @click="close">
              Close
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
