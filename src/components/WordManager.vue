<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, ArrowLeft, Search, Trash2, Upload, Copy, Check, Camera, X, Image as ImageIcon, Sparkles, Settings } from 'lucide-vue-next';
import { GoogleGenAI } from "@google/genai";
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { searchDictionary, searchByMeaning, levenshteinDistance, type DictionaryEntry } from '@/lib/dictionary';
import CameraCapture from './CameraCapture.vue';

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

const imagePreview = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const showCamera = ref(false);
const apiKey = ref(localStorage.getItem('gemini_api_key') || '');
const showApiKeyInput = ref(false);
const isAnalyzing = ref(false);

const detectedWords = ref<Array<{ 
  original: string; 
  translation: string; 
  article: string; 
  selected: boolean;
  status: 'new' | 'exact' | 'similar';
  similarTo?: string;
}>>([]);

const saveApiKey = () => {
  localStorage.setItem('gemini_api_key', apiKey.value);
  showApiKeyInput.value = false;
};

const analyzeImage = async () => {
  if (!imagePreview.value || !apiKey.value) return;
  
  isAnalyzing.value = true;
  detectedWords.value = [];

  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.value });
    
    // Extract base64 data (remove header)
    const base64Data = imagePreview.value.split(',')[1];

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data,
              },
            },
            { 
              text: "Analyze this image. If it contains text (like a book page), extract the most important German words and their English translations. If it's an object, identify the object in German and provide the English translation. Return ONLY a JSON array of objects with 'original', 'translation', and 'article' keys. Ensure standard German capitalization (e.g., nouns capitalized). If a word is in plural form, convert it to the singular form. Do not include markdown formatting." 
            },
          ],
        },
      ],
    });

    const text = response.text;
    if (text) {
      try {
        // Clean up markdown code blocks if present
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const words = JSON.parse(cleanText);
        if (Array.isArray(words)) {
          // Cross-check with dictionary and existing words
          const processedWords = await Promise.all(words.map(async (w: any) => {
            let article = w.article;
            let status: 'new' | 'exact' | 'similar' = 'new';
            let similarTo: string | undefined = undefined;
            let selected = true;

            // 1. Dictionary Check for Article
            try {
              const results = await searchDictionary(w.original, 1);
              const match = results.find(r => r.word.toLowerCase() === w.original.toLowerCase());
              
              if (match && match.gender) {
                if (match.gender === 'masc') article = 'der';
                else if (match.gender === 'fem') article = 'die';
                else if (match.gender === 'neut') article = 'das';
              }
            } catch (err) {
              console.error('Dictionary lookup failed for', w.original, err);
            }

            // 2. Check against existing words in store
            const lowerOriginal = w.original.toLowerCase();
            for (const existing of store.words) {
              const existingLower = existing.original.toLowerCase();
              
              if (existingLower === lowerOriginal) {
                status = 'exact';
                selected = false;
                break;
              }
              
              // Check for similarity (distance <= 2 for words > 4 chars, else 1)
              const threshold = w.original.length > 4 ? 2 : 1;
              const dist = levenshteinDistance(lowerOriginal, existingLower);
              if (dist <= threshold) {
                status = 'similar';
                similarTo = existing.original;
                // Don't break here, exact match takes precedence if found later
              }
            }

            return { ...w, article, selected, status, similarTo };
          }));

          detectedWords.value = processedWords;
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e);
      }
    }
  } catch (e) {
    console.error('AI Analysis failed:', e);
    alert('Failed to analyze image. Please check your API key.');
  } finally {
    isAnalyzing.value = false;
  }
};

const toggleWordSelection = (index: number) => {
  if (detectedWords.value[index].status === 'exact') return;
  detectedWords.value[index].selected = !detectedWords.value[index].selected;
};

const selectAllWords = () => {
  detectedWords.value.forEach(w => {
    if (w.status !== 'exact') w.selected = true;
  });
};

const deselectAllWords = () => {
  detectedWords.value.forEach(w => w.selected = false);
};

const addSelectedWords = async () => {
  const selected = detectedWords.value.filter(w => w.selected);
  for (const word of selected) {
    await store.addWord(word.original, word.translation, word.article);
  }
  // Clear detected words after adding
  detectedWords.value = [];
  clearImage();
};

const fillWord = (word: { original: string; translation: string; article: string }) => {
  newWordOriginal.value = word.original;
  newWordTranslation.value = word.translation;
  newWordArticle.value = word.article;
};

const triggerCamera = () => {
  showCamera.value = true;
};

const handleCameraCapture = (imageData: string) => {
  imagePreview.value = imageData;
  showCamera.value = false;
};

const triggerGallery = () => {
  fileInput.value?.click();
};

const handleImageUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const clearImage = () => {
  imagePreview.value = null;
  detectedWords.value = [];
  if (fileInput.value) fileInput.value.value = '';
};

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
    clearImage();
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
        <Button variant="outline" size="icon" @click="triggerCamera" class="rounded-full h-10 w-10 bg-background hover:bg-accent" title="Take Photo">
          <Camera class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="triggerGallery" class="rounded-full h-10 w-10 bg-background hover:bg-accent" title="Pick Image">
          <ImageIcon class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('open-import-dialog')" class="rounded-full h-10 w-10 bg-background hover:bg-accent" title="Import words">
          <Upload class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="showApiKeyInput = !showApiKeyInput" class="rounded-full h-10 w-10 bg-background hover:bg-accent" :class="{ 'text-primary': apiKey }" title="AI Settings">
          <Settings class="h-5 w-5" />
        </Button>
        <Button variant="outline" size="icon" @click="$emit('close')" class="rounded-full h-10 w-10 bg-background hover:bg-accent" title="Back">
          <ArrowLeft class="h-5 w-5" />
        </Button>
      </div>
    </div>

    <!-- API Key Input -->
    <div v-if="showApiKeyInput" class="mb-6 p-4 bg-card border rounded-lg shadow-sm animate-in slide-in-from-top-2">
      <label class="block text-sm font-medium mb-2">Gemini API Key</label>
      <div class="flex gap-2">
        <Input v-model="apiKey" type="password" placeholder="Enter your Gemini API key" class="flex-1" />
        <Button @click="saveApiKey">Save</Button>
      </div>
      <p class="text-xs text-muted-foreground mt-2">
        Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" class="underline hover:text-primary">Google AI Studio</a>
      </p>
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



          <!-- Image Preview -->
          <div class="md:col-span-12" v-if="imagePreview">
            <label class="text-xs font-medium text-muted-foreground mb-1.5 block ml-1">Image</label>
            <div class="flex items-center gap-4">
              <input type="file" ref="fileInput" accept="image/*" class="hidden" @change="handleImageUpload" />
              
              <div class="relative h-32 w-32 rounded-md overflow-hidden border bg-muted">
                <img :src="imagePreview" class="h-full w-full object-cover" />
                <button @click="clearImage" class="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors">
                  <X class="h-4 w-4" />
                </button>
              </div>

              <Button v-if="apiKey" @click="analyzeImage" :disabled="isAnalyzing" variant="secondary" class="h-11">
                <Sparkles class="h-4 w-4 mr-2" :class="{ 'animate-spin': isAnalyzing }" />
                {{ isAnalyzing ? 'Analyzing...' : 'Analyze Image' }}
              </Button>
            </div>

            <!-- Detected Words -->
            <div v-if="detectedWords.length > 0" class="mt-4 p-4 bg-muted/50 rounded-lg border">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-medium flex items-center gap-2">
                  <Sparkles class="h-3.5 w-3.5 text-primary" />
                  Detected Words
                </h3>
                <div class="flex gap-2 text-xs">
                  <button @click="selectAllWords" class="text-primary hover:underline">Select All</button>
                  <span class="text-muted-foreground">|</span>
                  <button @click="deselectAllWords" class="text-muted-foreground hover:text-foreground">None</button>
                </div>
              </div>
              
              <div class="flex flex-wrap gap-2 mb-4">
                <button v-for="(word, idx) in detectedWords" :key="idx"
                  @click="toggleWordSelection(idx)"
                  :disabled="word.status === 'exact'"
                  class="flex flex-col gap-0.5 px-3 py-1.5 border rounded-lg transition-all text-sm text-left relative"
                  :class="[
                    word.selected ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-input hover:bg-accent',
                    word.status === 'exact' ? 'opacity-50 cursor-not-allowed bg-muted' : '',
                    word.status === 'similar' && !word.selected ? 'border-yellow-500/50 bg-yellow-500/5' : ''
                  ]">
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                      :class="word.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'">
                      <Check v-if="word.selected" class="h-3 w-3" />
                    </div>
                    <span v-if="word.article" class="text-xs opacity-70 font-mono">{{ word.article }}</span>
                    <span class="font-medium">{{ word.original }}</span>
                    <span class="opacity-70 border-l border-current/20 pl-2 ml-1">{{ word.translation }}</span>
                  </div>
                  
                  <!-- Status Indicators -->
                  <div v-if="word.status === 'exact'" class="text-[10px] text-muted-foreground ml-6">
                    Already exists
                  </div>
                  <div v-if="word.status === 'similar'" class="text-[10px] text-yellow-600 dark:text-yellow-400 ml-6">
                    Similar to "{{ word.similarTo }}"
                  </div>
                </button>
              </div>

              <Button @click="addSelectedWords" :disabled="!detectedWords.some(w => w.selected)" class="w-full">
                <Plus class="h-4 w-4 mr-2" />
                Add {{ detectedWords.filter(w => w.selected).length }} Selected Word{{ detectedWords.filter(w => w.selected).length !== 1 ? 's' : '' }}
              </Button>
            </div>
          </div>
          <div class="hidden">
             <!-- Hidden inputs if preview is not shown -->
             <input type="file" ref="fileInput" accept="image/*" class="hidden" @change="handleImageUpload" />
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

  <CameraCapture v-if="showCamera" @capture="handleCameraCapture" @close="showCamera = false" />
</template>
