<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, X, Search, Trash2, Upload, Copy, Check } from 'lucide-vue-next';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { searchDictionary, searchByMeaning, type DictionaryEntry } from '@/lib/dictionary';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-import-dialog'): void;
}>();

const store = useWordStore();
const { words, filteredWords, searchQuery, dictionaryInfo } = storeToRefs(store);

const exportSuccess = ref(false);

const handleExport = async () => {
  try {
    const text = words.value.map(w => `${w.original} | ${w.translation} | ${w.article || ''}`).join('\n');
    await navigator.clipboard.writeText(text);
    exportSuccess.value = true;
    setTimeout(() => exportSuccess.value = false, 3000);
  } catch (err) {
    console.error('Failed to export:', err);
  }
};

const newWordOriginal = ref('');
const newWordTranslation = ref('');
const newWordArticle = ref('');
const suggestions = ref<DictionaryEntry[]>([]);
const showSuggestions = ref(false);
const translationSuggestions = ref<DictionaryEntry[]>([]);
const showTranslationSuggestions = ref(false);

const updateSuggestions = async () => {
  const searchTerm = newWordOriginal.value.trim();
  if (searchTerm.length >= 2 && dictionaryInfo.value) {
    const results = await searchDictionary(searchTerm, 10);
    suggestions.value = results;
    showSuggestions.value = results.length > 0;
  } else {
    suggestions.value = [];
    showSuggestions.value = false;
  }
};

const updateTranslationSuggestions = async () => {
  const searchTerm = newWordTranslation.value.trim();
  if (searchTerm.length >= 2 && dictionaryInfo.value) {
    const results = await searchByMeaning(searchTerm, 10);
    translationSuggestions.value = results;
    showTranslationSuggestions.value = results.length > 0;
  } else {
    translationSuggestions.value = [];
    showTranslationSuggestions.value = false;
  }
};

const selectSuggestion = (suggestion: DictionaryEntry) => {
  newWordOriginal.value = suggestion.word;
  newWordTranslation.value = suggestion.meanings?.[0] || '';
  newWordArticle.value = suggestion.gender === 'masc' ? 'der' :
    suggestion.gender === 'fem' ? 'die' :
      suggestion.gender === 'neut' ? 'das' : '';
  showSuggestions.value = false;
  showTranslationSuggestions.value = false;
};

const selectTranslationSuggestion = (suggestion: DictionaryEntry) => {
  newWordOriginal.value = suggestion.word;
  newWordTranslation.value = suggestion.meanings?.[0] || '';
  newWordArticle.value = suggestion.gender === 'masc' ? 'der' :
    suggestion.gender === 'fem' ? 'die' :
      suggestion.gender === 'neut' ? 'das' : '';
  showSuggestions.value = false;
  showTranslationSuggestions.value = false;
};

const focusTranslation = () => {
  const translationInput = document.getElementById('newWordTranslation') as HTMLInputElement;
  if (translationInput) translationInput.focus();
};

const focusArticle = () => {
  const articleInput = document.getElementById('newWordArticle') as HTMLInputElement;
  if (articleInput) articleInput.focus();
};

const delayHideSuggestions = () => {
  setTimeout(() => {
    showSuggestions.value = false;
    showTranslationSuggestions.value = false;
  }, 200);
};

const addWord = async () => {
  if (newWordOriginal.value.trim() && newWordTranslation.value.trim()) {
    await store.addWord(
      newWordOriginal.value.trim(),
      newWordTranslation.value.trim(),
      newWordArticle.value.trim()
    );

    newWordOriginal.value = '';
    newWordTranslation.value = '';
    newWordArticle.value = '';
    showSuggestions.value = false;

    // Focus back on original input for quick entry
    nextTick(() => {
      const originalInput = document.getElementById('newWordOriginal') as HTMLInputElement;
      if (originalInput) originalInput.focus();
    });
  }
};

const deleteWord = async (word: any) => {
    if (word.id) {
        await store.deleteWord(word.id);
    }
};

const formatNextDue = (timestamp: number): string => {
  const now = Date.now();
  if (timestamp <= now) return 'Due';
  
  const ms = timestamp - now;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days}d`;
  if (hours > 0) return `in ${hours}h`;
  if (minutes > 0) return `in ${minutes}m`;
  return `in ${seconds}s`;
};
</script>

<template>
  <div class="max-w-4xl mx-auto w-full pb-10">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-primary tracking-tight">Manage Words</h1>
        <p class="text-muted-foreground mt-1">Add, edit, and review your vocabulary collection</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="icon" @click="handleExport" class="rounded-full h-10 w-10 bg-background hover:bg-accent"
          :title="exportSuccess ? 'Copied to clipboard!' : 'Export words to clipboard'">
          <Check v-if="exportSuccess" class="h-5 w-5 text-green-600" />
          <Copy v-else class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('open-import-dialog')" class="rounded-full h-10 w-10 bg-background hover:bg-accent" title="Import words">
          <Upload class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('close')" class="rounded-full h-10 w-10 bg-background hover:bg-accent">
          <X class="h-5 w-5" />
        </Button>
      </div>
    </div>

    <!-- Quick Add Form -->
    <Card class="mb-8 border-primary/10 shadow-md overflow-hidden">
      <div class="bg-primary/5 p-4 border-b border-primary/10">
        <h2 class="font-semibold flex items-center gap-2 text-primary">
          <Plus class="h-4 w-4" /> Add New Word
        </h2>
      </div>
      <CardContent class="p-6">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          <!-- Original Word Input -->
          <div class="md:col-span-5 relative">
            <label class="text-xs font-medium text-muted-foreground mb-1.5 block ml-1">Original Word</label>
            <div class="relative">
              <Input id="newWordOriginal" v-model="newWordOriginal" placeholder="e.g., Haus"
                @input="updateSuggestions" @keyup.enter="focusTranslation" @blur="delayHideSuggestions"
                @focus="updateSuggestions" class="text-base h-11 bg-background/50 focus:bg-background transition-colors" />
              <!-- Suggestions Dropdown -->
              <div v-if="showSuggestions && suggestions.length > 0"
                class="absolute z-20 w-full mt-1 bg-popover border rounded-md shadow-xl max-h-60 overflow-y-auto">
                <button v-for="(suggestion, idx) in suggestions" :key="idx"
                  @mousedown.prevent="selectSuggestion(suggestion)"
                  class="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors border-b last:border-b-0">
                  <div class="font-semibold text-sm">
                    <span v-if="suggestion.gender" class="text-xs text-muted-foreground mr-1 uppercase tracking-wider font-mono bg-muted px-1 rounded">
                      {{ suggestion.gender === 'masc' ? 'der' : suggestion.gender === 'fem' ? 'die' : suggestion.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ suggestion.word }}
                  </div>
                  <div class="text-xs text-muted-foreground truncate mt-0.5">
                    {{ suggestion.meanings?.[0] || 'No translation' }}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Translation Input -->
          <div class="md:col-span-5 relative">
            <label class="text-xs font-medium text-muted-foreground mb-1.5 block ml-1">Translation</label>
            <div class="relative">
              <Input id="newWordTranslation" v-model="newWordTranslation"
                placeholder="e.g., House" @input="updateTranslationSuggestions"
                @keyup.enter="focusArticle" @blur="delayHideSuggestions" @focus="updateTranslationSuggestions"
                class="text-base h-11 bg-background/50 focus:bg-background transition-colors" />
              <!-- Translation Suggestions Dropdown -->
              <div v-if="showTranslationSuggestions && translationSuggestions.length > 0"
                class="absolute z-20 w-full mt-1 bg-popover border rounded-md shadow-xl max-h-60 overflow-y-auto">
                <button v-for="(suggestion, idx) in translationSuggestions" :key="idx"
                  @mousedown.prevent="selectTranslationSuggestion(suggestion)"
                  class="w-full px-3 py-2.5 text-left hover:bg-accent transition-colors border-b last:border-b-0">
                  <div class="font-semibold text-sm">
                    <span v-if="suggestion.gender" class="text-xs text-muted-foreground mr-1 uppercase tracking-wider font-mono bg-muted px-1 rounded">
                      {{ suggestion.gender === 'masc' ? 'der' : suggestion.gender === 'fem' ? 'die' : suggestion.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ suggestion.word }}
                  </div>
                  <div class="text-xs text-muted-foreground truncate mt-0.5">
                    {{ suggestion.meanings?.[0] || 'No translation' }}
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Article Input -->
          <div class="md:col-span-2">
            <label class="text-xs font-medium text-muted-foreground mb-1.5 block ml-1">Article</label>
            <Input id="newWordArticle" v-model="newWordArticle" placeholder="der/die/das"
              @keyup.enter="addWord()" class="text-base h-11 bg-background/50 focus:bg-background transition-colors text-center" />
          </div>
        </div>
        
        <div class="mt-4 flex justify-end">
          <Button @click="addWord" :disabled="!newWordOriginal.trim() || !newWordTranslation.trim()"
            class="w-full md:w-auto min-w-[150px] h-11 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-sm">
            <Plus class="h-4 w-4 mr-2" /> Add to Collection
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Search and Stats -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
      <div class="relative w-full md:w-96">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input v-model="searchQuery" placeholder="Search your words..." class="pl-9 bg-background/50" />
      </div>
      <div class="text-sm text-muted-foreground font-medium px-3 py-1.5 bg-muted/50 rounded-full">
        {{ filteredWords.length }} word{{ filteredWords.length !== 1 ? 's' : '' }} found
      </div>
    </div>

    <!-- Words List -->
    <div class="bg-card rounded-lg border shadow-sm overflow-hidden">
      <div class="divide-y divide-border">
        <div v-for="(word, index) in filteredWords" :key="index" 
          class="group p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
          <div class="flex-1 min-w-0 mr-4">
            <div class="font-bold text-base flex items-baseline gap-2 truncate">
              <span v-if="word.article" class="text-xs font-normal text-muted-foreground italic bg-muted/50 px-1.5 py-0.5 rounded shrink-0">{{ word.article }}</span>
              <span class="text-foreground truncate">{{ word.original }}</span>
            </div>
            <div class="text-sm text-muted-foreground mt-0.5 truncate">{{ word.translation }}</div>
          </div>
          
          <div class="flex items-center gap-4 shrink-0">
            <div class="flex flex-col items-end gap-0.5">
              <div class="text-xs font-medium" 
                :class="{ 'text-red-600 dark:text-red-400': word.nextReviewAt <= Date.now(), 'text-muted-foreground': word.nextReviewAt > Date.now() }">
                {{ formatNextDue(word.nextReviewAt) }}
              </div>
              <div class="text-xs text-muted-foreground">
                Score: {{ word.score }}
              </div>
            </div>

            <Button variant="ghost" size="icon" @click="deleteWord(word)"
              class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-if="filteredWords.length === 0" class="p-8 text-center text-muted-foreground">
        <div v-if="searchQuery" class="flex flex-col items-center">
          <Search class="h-12 w-12 mb-3 opacity-20" />
          <p>No words found matching "{{ searchQuery }}"</p>
          <Button variant="link" @click="searchQuery = ''" class="mt-2">Clear search</Button>
        </div>
        <div v-else class="flex flex-col items-center">
          <p>No words yet. Add your first word above!</p>
        </div>
      </div>
    </div>
  </div>
</template>
