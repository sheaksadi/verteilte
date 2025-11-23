<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { Moon, Sun, Save, RotateCcw, Download, Upload, RefreshCw, LogOut, Trash2, Key, Database, Brain, Palette, Bug } from 'lucide-vue-next';
import type { AlgorithmSettings } from '@/lib/database';
import { DEFAULT_ALGORITHM_SETTINGS } from '@/lib/database';

const emit = defineEmits(['close', 'open-import', 'toggle-debug']);

const store = useWordStore();
const { algorithmSettings, isLoggedIn, user, isSyncing, debugInfo } = storeToRefs(store);

// --- Appearance ---
const isDarkMode = ref(document.documentElement.classList.contains('dark'));
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

// --- AI Configuration ---
const apiKey = ref(localStorage.getItem('gemini_api_key') || '');
const showApiKey = ref(false);
const saveApiKey = () => {
  localStorage.setItem('gemini_api_key', apiKey.value);
  alert('API Key saved!');
};

// --- Debug ---
const showDebug = ref(false); 

// --- Algorithm Settings ---
const localSettings = ref<AlgorithmSettings>({ ...DEFAULT_ALGORITHM_SETTINGS });
const isDirty = ref(false);
const editableIntervals = ref<{ score: number; value: number; unit: string }[]>([]);

const parseDuration = (ms: number) => {
  if (ms % (24 * 60 * 60 * 1000) === 0) return { value: ms / (24 * 60 * 60 * 1000), unit: 'days' };
  if (ms % (60 * 60 * 1000) === 0) return { value: ms / (60 * 60 * 1000), unit: 'hours' };
  if (ms % (60 * 1000) === 0) return { value: ms / (60 * 1000), unit: 'minutes' };
  return { value: ms / 1000, unit: 'seconds' };
};

const toMs = (value: number, unit: string) => {
  switch (unit) {
    case 'days': return value * 24 * 60 * 60 * 1000;
    case 'hours': return value * 60 * 60 * 1000;
    case 'minutes': return value * 60 * 1000;
    case 'seconds': return value * 1000;
    default: return value;
  }
};

const initLocalSettings = () => {
  if (algorithmSettings.value) {
    localSettings.value = JSON.parse(JSON.stringify(algorithmSettings.value));
    editableIntervals.value = [];
    const maxScore = localSettings.value.maxScore || 10;
    for (let i = 0; i <= maxScore; i++) {
      const ms = localSettings.value.intervals[i] || 0;
      const { value, unit } = parseDuration(ms);
      editableIntervals.value.push({ score: i, value, unit });
    }
  }
};

const updateInterval = (index: number, field: 'value' | 'unit', val: string | number) => {
  if (field === 'value') editableIntervals.value[index].value = Number(val);
  else editableIntervals.value[index].unit = String(val);
  isDirty.value = true;
};

const addLevel = () => {
  const nextScore = editableIntervals.value.length;
  const last = editableIntervals.value[editableIntervals.value.length - 1];
  const newValue = last ? last.value * 2 : 1;
  const newUnit = last ? last.unit : 'days';
  editableIntervals.value.push({ score: nextScore, value: newValue, unit: newUnit });
  isDirty.value = true;
};

const removeLevel = () => {
  if (editableIntervals.value.length > 1) {
    editableIntervals.value.pop();
    isDirty.value = true;
  }
};

const saveAlgorithmSettings = async () => {
  const newIntervals: Record<number, number> = {};
  editableIntervals.value.forEach(item => {
    newIntervals[item.score] = toMs(item.value, item.unit);
  });
  const newSettings: AlgorithmSettings = {
    intervals: newIntervals,
    maxScore: editableIntervals.value.length - 1,
    maxScoreBehavior: localSettings.value.maxScoreBehavior
  };
  await store.saveSettings(newSettings);
  isDirty.value = false;
};

const resetAlgorithmDefaults = () => {
  if (confirm('Reset all algorithm settings to default?')) {
    localSettings.value = JSON.parse(JSON.stringify(DEFAULT_ALGORITHM_SETTINGS));
    editableIntervals.value = [];
    const maxScore = localSettings.value.maxScore;
    for (let i = 0; i <= maxScore; i++) {
      const ms = localSettings.value.intervals[i] || 0;
      const { value, unit } = parseDuration(ms);
      editableIntervals.value.push({ score: i, value, unit });
    }
    isDirty.value = true;
  }
};

// --- Data ---
const handleExport = async () => {
  try {
    const text = store.words.map(w => `${w.original} | ${w.translation} | ${w.article || ''}`).join('\n');
    await navigator.clipboard.writeText(text);
    alert('Words exported to clipboard!');
  } catch (err) {
    console.error('Failed to export:', err);
  }
};

const handleLogout = () => {
  store.logout();
};

onMounted(() => {
  initLocalSettings();
});
</script>

<template>
  <div class="max-w-4xl mx-auto w-full pb-20 space-y-6">
    <div>
      <h1 class="text-3xl font-bold text-primary tracking-tight">Settings</h1>
      <p class="text-muted-foreground mt-1">Manage your preferences and application data</p>
    </div>

    <!-- Appearance -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Palette class="h-5 w-5" /> Appearance</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <Label>Dark Mode</Label>
            <p class="text-sm text-muted-foreground">Switch between light and dark themes</p>
          </div>
          <Button variant="outline" size="icon" @click="toggleDarkMode" class="rounded-full">
            <Moon v-if="isDarkMode" class="h-5 w-5" />
            <Sun v-else class="h-5 w-5" />
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- AI Configuration -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Brain class="h-5 w-5" /> AI Configuration</CardTitle>
        <CardDescription>Configure Google Gemini for image analysis</CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label>Gemini API Key</Label>
          <div class="flex gap-2">
            <Input v-model="apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="Enter your API key" class="flex-1" />
            <Button variant="ghost" size="icon" @click="showApiKey = !showApiKey">
              <Key class="h-4 w-4" />
            </Button>
            <Button @click="saveApiKey">Save</Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" class="underline hover:text-primary">Google AI Studio</a>
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Data Management -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Database class="h-5 w-5" /> Data Management</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-4">
           <!-- Sync -->
          <div class="flex items-center justify-between p-3 border rounded-lg">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-primary/10 rounded-full text-primary">
                <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isSyncing }" />
              </div>
              <div>
                <div class="font-medium">Sync</div>
                <div class="text-xs text-muted-foreground">{{ isLoggedIn ? `Logged in as ${user?.username}` : 'Not logged in' }}</div>
              </div>
            </div>
            <Button v-if="isLoggedIn" variant="outline" size="sm" @click="store.sync()">Sync Now</Button>
            <Button v-else variant="outline" size="sm" @click="store.login('test', 'test')">Login</Button> <!-- Placeholder login, ideally opens Auth dialog -->
          </div>

          <!-- Import/Export -->
          <div class="grid grid-cols-2 gap-4">
            <Button variant="outline" class="h-auto py-4 flex flex-col gap-2" @click="handleExport">
              <Download class="h-5 w-5" />
              <span>Export to Clipboard</span>
            </Button>
            <Button variant="outline" class="h-auto py-4 flex flex-col gap-2" @click="emit('open-import')">
              <Upload class="h-5 w-5" />
              <span>Import Words</span>
            </Button>
          </div>

          <Button v-if="isLoggedIn" variant="destructive" class="w-full" @click="handleLogout">
            <LogOut class="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Algorithm Settings -->
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2"><Brain class="h-5 w-5" /> Learning Algorithm</CardTitle>
        <CardDescription>Customize the spaced repetition intervals</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- Time Buckets -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">Review Intervals</h3>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" @click="removeLevel" :disabled="editableIntervals.length <= 1" class="text-destructive hover:text-destructive">
                Remove Level
              </Button>
              <Button variant="outline" size="sm" @click="addLevel">
                Add Level
              </Button>
            </div>
          </div>
          
          <div class="grid gap-3">
            <div v-for="(item, index) in editableIntervals" :key="item.score" 
                 class="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
              <div class="w-16 font-mono font-bold text-xs text-muted-foreground">
                Lvl {{ item.score }}
              </div>
              
              <div class="flex-1 flex gap-2 items-center">
                <Input type="number" :model-value="item.value" @update:model-value="v => updateInterval(index, 'value', v)" class="h-8" min="1" />
                <Select :model-value="item.unit" @update:model-value="(v) => updateInterval(index, 'unit', v as string)">
                  <SelectTrigger class="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <!-- Max Score Behavior -->
        <div class="space-y-3 pt-4 border-t">
          <Label>Completion Behavior (Max Level)</Label>
          <Select v-model="localSettings.maxScoreBehavior" @update:model-value="isDirty = true">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cap">Keep reviewing at max interval</SelectItem>
              <SelectItem value="archive">Stop reviewing (Archive)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex justify-between pt-4">
          <Button variant="ghost" size="sm" @click="resetAlgorithmDefaults">Reset Defaults</Button>
          <Button size="sm" @click="saveAlgorithmSettings" :disabled="!isDirty">Save Changes</Button>
        </div>
      </CardContent>
    </Card>
    
    <!-- Debug -->
    <Card>
        <CardHeader>
            <CardTitle class="flex items-center gap-2"><Bug class="h-5 w-5"/> Debugging</CardTitle>
        </CardHeader>
        <CardContent>
             <div class="flex items-center justify-between">
                <div class="space-y-0.5">
                    <Label>Show Debug Info</Label>
                    <p class="text-sm text-muted-foreground">Display technical details overlay</p>
                </div>
                 <Button variant="outline" @click="emit('toggle-debug')">Toggle Debug Overlay</Button>
            </div>
        </CardContent>
    </Card>

  </div>
</template>
