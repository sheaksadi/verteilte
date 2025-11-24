<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Camera, Image as ImageIcon, Sparkles, Check, X, Plus, Loader2 } from 'lucide-vue-next';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { GoogleGenAI } from "@google/genai";
import { useRouter } from 'vue-router';
import { useWordStore } from '@/stores/wordStore';
import { searchDictionary, levenshteinDistance } from '@/lib/dictionary';

import { storeToRefs } from 'pinia';

const router = useRouter();
const store = useWordStore();
const { aiStrategy } = storeToRefs(store);

const imagePreview = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isAnalyzing = ref(false);
const apiKey = localStorage.getItem('gemini_api_key') || '';

const detectedWords = ref<Array<{ 
  original: string; 
  translation: string; 
  article: string; 
  selected: boolean;
  status: 'new' | 'exact' | 'similar';
  similarTo?: string;
  category: 'common' | 'important' | 'other';
}>>([]);


const triggerCamera = () => {
  router.push('/camera');
};

// Check for captured image from store on mount
import { onActivated, onMounted } from 'vue';

const checkCapturedImage = () => {
  if (store.capturedImage) {
    imagePreview.value = store.capturedImage;
    store.capturedImage = null; // Clear it
    analyzeImage();
  }
};

onMounted(() => {
  checkCapturedImage();
});

onActivated(() => {
  checkCapturedImage();
});

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
      analyzeImage();
    };
    reader.readAsDataURL(file);
  }
};

const clearImage = () => {
  imagePreview.value = null;
  detectedWords.value = [];
  if (fileInput.value) fileInput.value.value = '';
};

const analyzeImage = async () => {
  if (!imagePreview.value) return;
  
  if (!apiKey) {
    alert('Please set your Gemini API Key in Settings first.');
    return;
  }
  
  isAnalyzing.value = true;
  detectedWords.value = [];

  try {
    const ai = new GoogleGenAI({ apiKey });
    
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
              text: `Analyze this image. Extract ALL unique ${store.currentLanguage === 'de' ? 'German' : store.currentLanguage === 'es' ? 'Spanish' : store.currentLanguage === 'fr' ? 'French' : store.currentLanguage === 'it' ? 'Italian' : 'German'} words found in the text.
              For each word, determine its category: 
              'common' (stop words, basic vocabulary and very common words), 
              'important' (words central to understanding the text), or 
              'other' (everything else). 
              Return ONLY a JSON array of objects with 'original', 'translation', 'article', and 'category' keys. 
              Ensure standard capitalization. If a word is in plural form, convert it to the singular form. 
              Do not include markdown formatting.
              Keep in mind, these words are use as vocabulary to be learned.`
            },
          ],
        },
      ],
    });

    const text = response.text;
    if (text) {
      try {
        // Find the JSON array in the response
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        
        if (start === -1 || end === -1) {
          throw new Error('No JSON array found in response');
        }

        const jsonStr = text.substring(start, end + 1);
        const words = JSON.parse(jsonStr);
        if (Array.isArray(words)) {
          // Cross-check with dictionary and existing words
          const processedWords = await Promise.all(words.map(async (w: any) => {
            let article = w.article || '';
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
              }
            }

            return { ...w, article, selected, status, similarTo, category: w.category || 'other' };
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

const filteredDetectedWords = computed(() => {
  if (aiStrategy.value === 'all') return detectedWords.value;
  if (aiStrategy.value === 'no-common') return detectedWords.value.filter(w => w.category !== 'common');
  if (aiStrategy.value === 'important') return detectedWords.value.filter(w => w.category === 'important');
  return detectedWords.value;
});

const toggleWordSelection = (word: any) => {
  if (word.status === 'exact') return;
  word.selected = !word.selected;
};

const selectAllWords = () => {
  filteredDetectedWords.value.forEach(w => {
    if (w.status !== 'exact') w.selected = true;
  });
};

const deselectAllWords = () => {
  filteredDetectedWords.value.forEach(w => w.selected = false);
};

const addSelectedWords = async () => {
  const selected = filteredDetectedWords.value.filter(w => w.selected);
  for (const word of selected) {
    await store.addWord(word.original, word.translation, word.article);
  }
  // Clear detected words after adding
  detectedWords.value = [];
  clearImage();
  alert(`Added ${selected.length} words!`);
};
</script>

<template>
  <div class="max-w-4xl mx-auto w-full pb-20">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-primary tracking-tight">AI Word Add</h1>
      <p class="text-muted-foreground mt-1">Snap a photo or upload an image to extract German words</p>
    </div>

    <!-- Main Action Area -->
    <div v-if="!imagePreview" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card class="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group" @click="triggerCamera">
        <CardContent class="flex flex-col items-center justify-center p-12 text-center h-64">
          <div class="bg-primary/10 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
            <Camera class="h-10 w-10 text-primary" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Take Photo</h3>
          <p class="text-muted-foreground">Capture text from a book or object</p>
        </CardContent>
      </Card>

      <Card class="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group" @click="triggerGallery">
        <CardContent class="flex flex-col items-center justify-center p-12 text-center h-64">
          <div class="bg-secondary/50 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
            <ImageIcon class="h-10 w-10 text-secondary-foreground" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Upload Image</h3>
          <p class="text-muted-foreground">Choose from your gallery</p>
        </CardContent>
      </Card>
    </div>

    <!-- Strategy Selection (Initial) -->
    <div v-if="!imagePreview" class="mt-8">
      <h3 class="text-lg font-semibold mb-4">Extraction Strategy</h3>
      <RadioGroup v-model="aiStrategy" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="flex items-start space-x-2 border rounded-lg p-4 cursor-pointer transition-colors"
             :class="aiStrategy === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-accent'"
             @click="aiStrategy = 'all'">
          <RadioGroupItem value="all" id="r-all" class="mt-1" />
          <div class="grid gap-1.5">
            <Label htmlFor="r-all" class="font-semibold cursor-pointer">All Words</Label>
            <p class="text-sm text-muted-foreground">Extract every single German word found in the image.</p>
          </div>
        </div>
        <div class="flex items-start space-x-2 border rounded-lg p-4 cursor-pointer transition-colors"
             :class="aiStrategy === 'important' ? 'border-primary bg-primary/5' : 'hover:bg-accent'"
             @click="aiStrategy = 'important'">
          <RadioGroupItem value="important" id="r-important" class="mt-1" />
          <div class="grid gap-1.5">
            <Label htmlFor="r-important" class="font-semibold cursor-pointer">Most Important</Label>
            <p class="text-sm text-muted-foreground">Extract only key words central to the meaning.</p>
          </div>
        </div>
        <div class="flex items-start space-x-2 border rounded-lg p-4 cursor-pointer transition-colors"
             :class="aiStrategy === 'no-common' ? 'border-primary bg-primary/5' : 'hover:bg-accent'"
             @click="aiStrategy = 'no-common'">
          <RadioGroupItem value="no-common" id="r-no-common" class="mt-1" />
          <div class="grid gap-1.5">
            <Label htmlFor="r-no-common" class="font-semibold cursor-pointer">No Common Words</Label>
            <p class="text-sm text-muted-foreground">Extract all words except common stop words.</p>
          </div>
        </div>
      </RadioGroup>
    </div>

    <!-- Analysis View -->
    <div v-else class="space-y-6">
      <div class="relative rounded-lg overflow-hidden border bg-muted/30 max-h-[400px] flex justify-center">
        <img :src="imagePreview" class="max-w-full max-h-[400px] object-contain" />
        <Button size="icon" variant="destructive" class="absolute top-4 right-4 rounded-full shadow-lg" @click="clearImage">
          <X class="h-5 w-5" />
        </Button>
        
        <!-- Loading Overlay -->
        <div v-if="isAnalyzing" class="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
          <Loader2 class="h-12 w-12 text-primary animate-spin mb-4" />
          <p class="text-lg font-medium animate-pulse">Analyzing image...</p>
        </div>
      </div>

      <!-- Detected Words -->
      <Card v-if="detectedWords.length > 0">
        <CardContent class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold flex items-center gap-2">
              <Sparkles class="h-4 w-4 text-primary" />
              Detected Words ({{ filteredDetectedWords.length }})
            </h3>
            
            <!-- Strategy Selection -->
            <div class="flex items-center gap-2">
                <select v-model="aiStrategy" class="text-xs border rounded px-2 py-1 bg-background">
                    <option value="all">All Words</option>
                    <option value="important">Most Important</option>
                    <option value="no-common">No Common</option>
                </select>
            </div>
            <div class="flex gap-2 text-sm">
              <button @click="selectAllWords" class="text-primary hover:underline">Select All</button>
              <span class="text-muted-foreground">|</span>
              <button @click="deselectAllWords" class="text-muted-foreground hover:text-foreground">None</button>
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <button v-for="(word, idx) in filteredDetectedWords" :key="idx"
              @click="toggleWordSelection(word)"
              :disabled="word.status === 'exact'"
              class="flex flex-col gap-1 p-3 border rounded-lg transition-all text-left relative hover:shadow-sm"
              :class="[
                word.selected ? 'bg-primary/5 border-primary ring-1 ring-primary' : 'bg-card border-input hover:bg-accent',
                word.status === 'exact' ? 'opacity-50 cursor-not-allowed bg-muted' : '',
                word.status === 'similar' && !word.selected ? 'border-yellow-500/50 bg-yellow-500/5' : ''
              ]">
              <div class="flex items-start justify-between w-full">
                <div>
                   <span v-if="word.article" class="text-xs text-muted-foreground font-mono block mb-0.5">{{ word.article }}</span>
                   <span class="font-bold text-base">{{ word.original }}</span>
                </div>
                <div class="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1"
                  :class="word.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'">
                  <Check v-if="word.selected" class="h-3 w-3" />
                </div>
              </div>
              <div class="text-sm text-muted-foreground border-t border-border/50 pt-1 mt-1 w-full">
                {{ word.translation }}
              </div>
              
              <!-- Status Indicators -->
              <div v-if="word.status === 'exact'" class="absolute top-2 right-2 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                Exists
              </div>
              <div v-if="word.status === 'similar'" class="text-[10px] text-yellow-600 dark:text-yellow-400 mt-1">
                Similar to "{{ word.similarTo }}"
              </div>
            </button>
          </div>

          <Button @click="addSelectedWords" :disabled="!filteredDetectedWords.some(w => w.selected)" class="w-full h-12 text-lg">
            <Plus class="h-5 w-5 mr-2" />
            Add {{ filteredDetectedWords.filter(w => w.selected).length }} Selected Word{{ filteredDetectedWords.filter(w => w.selected).length !== 1 ? 's' : '' }}
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- Hidden inputs -->
    <input type="file" ref="fileInput" accept="image/*" class="hidden" @change="handleImageUpload" />
  </div>
</template>
