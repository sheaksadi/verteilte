<script setup lang="ts">
import { ref } from 'vue';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Trash2, Volume2, Upload, Globe, Download, RefreshCw, Loader2 } from 'lucide-vue-next';
import { searchDictionary } from '@/lib/dictionary';
import ImportDialog from '@/components/ImportDialog.vue';
import { Progress } from '@/components/ui/progress';

const store = useWordStore();
const { filteredWords, searchQuery, currentLanguage, languageStatus } = storeToRefs(store);

import { onMounted } from 'vue';

onMounted(() => {
  store.checkAllDictionaries();
});

const languages = [
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
];

// Local state for new word form
const newOriginal = ref('');
const newTranslation = ref('');
const newArticle = ref('');
const isAdding = ref(false);
const showImportDialog = ref(false);

// Dictionary suggestions
const suggestions = ref<any[]>([]);
const isSearchingDict = ref(false);

const handleSearchInput = async () => {
  if (!newOriginal.value || newOriginal.value.length < 2) {
    suggestions.value = [];
    return;
  }

  isSearchingDict.value = true;
  try {
    // Search German -> English
    const results = await searchDictionary(newOriginal.value);
    suggestions.value = results.slice(0, 5);
  } catch (e) {
    console.error(e);
  } finally {
    isSearchingDict.value = false;
  }
};

const selectSuggestion = (s: any) => {
  newOriginal.value = s.word;
  newTranslation.value = s.meanings.join(', ');
  if (s.gender) {
    newArticle.value = s.gender === 'masc' ? 'der' :
                       s.gender === 'fem' ? 'die' :
                       s.gender === 'neut' ? 'das' : '';
  }
  suggestions.value = [];
};

const addWord = async () => {
  if (!newOriginal.value || !newTranslation.value) return;

  const article = newArticle.value === 'none' ? '' : newArticle.value;
  await store.addWord(newOriginal.value, newTranslation.value, article);
  
  // Reset form
  newOriginal.value = '';
  newTranslation.value = '';
  newArticle.value = '';
  isAdding.value = false;
};

const deleteWord = async (id: string) => {
  if (confirm('Are you sure you want to delete this word?')) {
    await store.deleteWord(id);
  }
};

const speak = (text: string) => {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  window.speechSynthesis.speak(utterance);
};

// Helper to get article color
const getArticleColor = (article: string) => {
  switch (article.toLowerCase()) {
    case 'der': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
    case 'die': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    case 'das': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
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
  <div class="max-w-4xl mx-auto w-full pb-20 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-primary tracking-tight">My Words</h1>
        <p class="text-muted-foreground mt-1">Manage your vocabulary collection</p>
      </div>
      <div class="flex gap-2 items-center">
        <Select :model-value="currentLanguage" @update:model-value="store.setLanguage">
          <SelectTrigger class="w-[140px]">
            <Globe class="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="lang in languages" :key="lang.code" :value="lang.code" class="w-full">
              <div class="flex items-center justify-between w-full min-w-[200px]">
                <div class="flex items-center">
                  <span class="mr-2">{{ lang.flag }}</span> {{ lang.name }}
                </div>
                <div class="ml-2" @click.stop.prevent @pointerdown.stop.prevent>
                   <!-- Loading Spinner -->
                   <Loader2 v-if="languageStatus[lang.code]?.downloading" class="h-4 w-4 animate-spin text-muted-foreground" />
                   
                   <!-- Refresh (if exists) -->
                   <Button v-else-if="languageStatus[lang.code]?.exists" variant="ghost" size="icon" class="h-6 w-6" @click.stop.prevent="store.downloadDictionary(lang.code)" title="Redownload Dictionary">
                     <RefreshCw class="h-3 w-3" />
                   </Button>
                   
                   <!-- Download (if not exists) -->
                   <Button v-else variant="ghost" size="icon" class="h-6 w-6" @click.stop.prevent="store.downloadDictionary(lang.code)" title="Download Dictionary">
                     <Download class="h-3 w-3" />
                   </Button>
                </div>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" @click="showImportDialog = true">
          <Upload class="h-4 w-4" />
        </Button>
        <Button @click="isAdding = !isAdding">
          <Plus class="h-4 w-4 mr-2" /> Add Word
        </Button>
      </div>
    </div>



    <!-- Add Word Form -->
    <Card v-if="isAdding" class="animate-in slide-in-from-top-4 duration-300">
      <CardHeader>
        <CardTitle>Add New Word</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="space-y-2 relative">
            <Input v-model="newOriginal" placeholder="German Word" @input="handleSearchInput" />
            <!-- Suggestions -->
            <div v-if="suggestions.length > 0" class="absolute z-10 w-full bg-popover border rounded-md shadow-md mt-1 overflow-hidden">
              <div v-for="s in suggestions" :key="s.word" 
                   class="p-2 hover:bg-accent cursor-pointer text-sm"
                   @click="selectSuggestion(s)">
                <div class="font-medium">
                   <span v-if="s.gender" class="text-xs text-muted-foreground mr-1 uppercase tracking-wider font-mono bg-muted px-1 rounded">
                      {{ s.gender === 'masc' ? 'der' : s.gender === 'fem' ? 'die' : s.gender === 'neut' ? 'das' : '' }}
                    </span>
                    {{ s.word }}
                </div>
                <div class="text-xs text-muted-foreground">{{ s.meanings.join(', ') }}</div>
              </div>
            </div>
          </div>
          <div class="space-y-2">
            <Input v-model="newTranslation" placeholder="Translation" />
          </div>
          <div class="space-y-2">
            <Select v-model="newArticle">
              <SelectTrigger>
                <SelectValue placeholder="Article" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="der">Der (Masc)</SelectItem>
                <SelectItem value="die">Die (Fem)</SelectItem>
                <SelectItem value="das">Das (Neut)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" @click="isAdding = false">Cancel</Button>
          <Button @click="addWord" :disabled="!newOriginal || !newTranslation">Save Word</Button>
        </div>
      </CardContent>
    </Card>

    <!-- Search & List -->
    <div class="space-y-4">
      <div class="relative">
        <Search class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input v-model="searchQuery" placeholder="Search words..." class="pl-9" />
      </div>

      <div class="grid gap-3">
        <Card v-for="word in filteredWords" :key="word.id" class="group hover:shadow-md transition-all">
          <CardContent class="p-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <Badge v-if="word.article" variant="secondary" :class="getArticleColor(word.article)">
                    {{ word.article }}
                  </Badge>
                  <span class="font-semibold text-lg">{{ word.original }}</span>
                  <Button variant="ghost" size="icon" class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" @click="speak(word.original)">
                    <Volume2 class="h-3 w-3" />
                  </Button>
                </div>
                <span class="text-muted-foreground">{{ word.translation }}</span>
              </div>
            </div>
            
            <div class="flex items-center gap-4">
               <div class="flex flex-col items-end gap-0.5">
                  <div class="text-xs font-medium" 
                    :class="{ 'text-red-600 dark:text-red-400': word.nextReviewAt <= Date.now(), 'text-muted-foreground': word.nextReviewAt > Date.now() }">
                    {{ formatNextDue(word.nextReviewAt) }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    Lvl {{ word.score }}
                  </div>
                </div>
              <Button variant="ghost" size="icon" class="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all" @click="deleteWord(word.id)">
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div v-if="filteredWords.length === 0" class="text-center py-12 text-muted-foreground">
          No words found.
        </div>
      </div>
    </div>

    <ImportDialog v-if="showImportDialog" @close="showImportDialog = false" />
  </div>
</template>
