<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWordStore } from '@/stores/wordStore';
import { storeToRefs } from 'pinia';
import { X, Plus, Save, RotateCcw, ArrowLeft } from 'lucide-vue-next';
import type { AlgorithmSettings } from '@/lib/database';
import { DEFAULT_ALGORITHM_SETTINGS } from '@/lib/database';

const emit = defineEmits(['close']);

const store = useWordStore();
const { algorithmSettings } = storeToRefs(store);

// Local state for editing
const localSettings = ref<AlgorithmSettings>({ ...DEFAULT_ALGORITHM_SETTINGS });
const isDirty = ref(false);

// Helper to convert ms to value/unit
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

// Editable intervals
const editableIntervals = ref<{ score: number; value: number; unit: string }[]>([]);

const initLocalSettings = () => {
  if (algorithmSettings.value) {
    localSettings.value = JSON.parse(JSON.stringify(algorithmSettings.value));
    
    // Populate editable intervals
    editableIntervals.value = [];
    const maxScore = localSettings.value.maxScore || 10;
    
    for (let i = 0; i <= maxScore; i++) {
      const ms = localSettings.value.intervals[i] || 0;
      const { value, unit } = parseDuration(ms);
      editableIntervals.value.push({ score: i, value, unit });
    }
  }
};

onMounted(() => {
  initLocalSettings();
});

const updateInterval = (index: number, field: 'value' | 'unit', val: string | number) => {
  if (field === 'value') {
    editableIntervals.value[index].value = Number(val);
  } else {
    editableIntervals.value[index].unit = String(val);
  }
  isDirty.value = true;
};

const addLevel = () => {
  const nextScore = editableIntervals.value.length;
  // Default to double the last one or 1 day
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

const save = async () => {
  // Reconstruct settings object
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
  emit('close');
};

const resetToDefaults = () => {
  if (confirm('Reset all algorithm settings to default?')) {
    localSettings.value = JSON.parse(JSON.stringify(DEFAULT_ALGORITHM_SETTINGS));
    
    // Re-populate editable intervals
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
</script>

<template>
  <div class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <Card class="w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl border-primary/20">
      <CardHeader class="flex flex-row items-center justify-between border-b pb-4">
        <div>
          <CardTitle>Algorithm Settings</CardTitle>
          <CardDescription>Customize how often you review words</CardDescription>
        </div>
        <Button variant="ghost" size="icon" @click="emit('close')">
          <X class="h-5 w-5" />
        </Button>
      </CardHeader>
      
      <CardContent class="flex-1 overflow-y-auto p-6 space-y-8">
        
        <!-- Time Buckets -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Time Buckets</h3>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="removeLevel" :disabled="editableIntervals.length <= 1">
                Remove Level
              </Button>
              <Button variant="outline" size="sm" @click="addLevel">
                <Plus class="h-4 w-4 mr-2" /> Add Level
              </Button>
            </div>
          </div>
          
          <div class="grid gap-4">
            <div v-for="(item, index) in editableIntervals" :key="item.score" 
                 class="flex items-center gap-4 p-3 rounded-lg border bg-card/50 hover:bg-card/80 transition-colors">
              <div class="w-24 font-mono font-bold text-sm text-muted-foreground">
                Score {{ item.score }}
              </div>
              
              <div class="flex-1 flex gap-2 items-center">
                <Input 
                  type="number" 
                  :model-value="item.value" 
                  @update:model-value="v => updateInterval(index, 'value', v)"
                  class="w-24"
                  min="1"
                />
                <Select :model-value="item.unit" @update:model-value="(v) => updateInterval(index, 'unit', v as string)">
                  <SelectTrigger class="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div class="text-xs text-muted-foreground w-32 text-right">
                Next review in
              </div>
            </div>
          </div>
        </div>

        <!-- Max Score Behavior -->
        <div class="space-y-4 pt-4 border-t">
          <h3 class="text-lg font-semibold">Completion Behavior</h3>
          <div class="grid gap-4 p-4 border rounded-lg bg-secondary/10">
            <div class="space-y-2">
              <Label>When a word reaches Score {{ editableIntervals.length - 1 }} (Max):</Label>
              <Select v-model="localSettings.maxScoreBehavior" @update:model-value="isDirty = true">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cap">Keep reviewing at max interval (Cap)</SelectItem>
                  <SelectItem value="archive">Stop reviewing (Archive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p class="text-sm text-muted-foreground">
              Current max interval: {{ editableIntervals[editableIntervals.length - 1]?.value }} {{ editableIntervals[editableIntervals.length - 1]?.unit }}
            </p>
          </div>
        </div>

      </CardContent>
      
      <div class="p-4 border-t bg-secondary/10 flex justify-between items-center">
        <Button variant="ghost" @click="resetToDefaults" class="text-muted-foreground hover:text-destructive">
          <RotateCcw class="h-4 w-4 mr-2" /> Reset Defaults
        </Button>
        <div class="flex gap-2">
          <Button variant="outline" @click="emit('close')">Cancel</Button>
          <Button @click="save" :disabled="!isDirty">
            <Save class="h-4 w-4 mr-2" /> Save Changes
          </Button>
        </div>
      </div>
    </Card>
  </div>
</template>
