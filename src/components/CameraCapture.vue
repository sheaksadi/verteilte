<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Button } from '@/components/ui/button';
import { Camera, X, RefreshCw, Zap, ZapOff } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'capture', imageData: string): void;
  (e: 'close'): void;
}>();

const videoEl = ref<HTMLVideoElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stream = ref<MediaStream | null>(null);
const error = ref<string | null>(null);
const facingMode = ref<'user' | 'environment'>('environment');
const hasFlash = ref(false);
const flashOn = ref(false);

const startCamera = async () => {
  try {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop());
    }
    
    stream.value = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: facingMode.value,
        width: { ideal: 4096 },
        height: { ideal: 2160 }
      },
      audio: false
    });
    
    if (videoEl.value) {
      videoEl.value.srcObject = stream.value;
    }

    // Check for flash support
    const track = stream.value.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    // @ts-ignore - torch is not in standard types yet
    hasFlash.value = !!capabilities.torch;
    flashOn.value = false;

    error.value = null;
  } catch (err) {
    console.error('Camera error:', err);
    error.value = 'Could not access camera. Please ensure permissions are granted.';
  }
};

const switchCamera = () => {
  facingMode.value = facingMode.value === 'user' ? 'environment' : 'user';
  startCamera();
};

const toggleFlash = async () => {
  if (!stream.value) return;
  const track = stream.value.getVideoTracks()[0];
  flashOn.value = !flashOn.value;
  
  try {
    await track.applyConstraints({
      advanced: [{ torch: flashOn.value } as any]
    });
  } catch (err) {
    console.error('Error toggling flash:', err);
    flashOn.value = !flashOn.value; // Revert on error
  }
};

const capture = () => {
  if (videoEl.value && canvasEl.value) {
    const video = videoEl.value;
    const canvas = canvasEl.value;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Flip if using front camera
      if (facingMode.value === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
      emit('capture', dataUrl);
      stopCamera();
    }
  }
};

const stopCamera = () => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop());
    stream.value = null;
  }
};

onMounted(() => {
  startCamera();
});

onUnmounted(() => {
  stopCamera();
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 bg-black/50 absolute top-0 left-0 right-0 z-10">
      <Button variant="ghost" size="icon" @click="$emit('close')" class="text-white hover:bg-white/20 rounded-full">
        <X class="h-6 w-6" />
      </Button>
      <Button variant="ghost" size="icon" @click="switchCamera" class="text-white hover:bg-white/20 rounded-full">
        <RefreshCw class="h-6 w-6" />
      </Button>
      <Button v-if="hasFlash" variant="ghost" size="icon" @click="toggleFlash" class="text-white hover:bg-white/20 rounded-full">
        <Zap v-if="flashOn" class="h-6 w-6 fill-yellow-400 text-yellow-400" />
        <ZapOff v-else class="h-6 w-6" />
      </Button>
    </div>

    <!-- Video Feed -->
    <div class="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
      <video ref="videoEl" autoplay playsinline class="w-full h-full object-cover"></video>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center p-6 text-center text-red-500 bg-black/80">
        {{ error }}
      </div>
    </div>

    <!-- Controls -->
    <div class="p-8 bg-black/50 flex justify-center items-center absolute bottom-0 left-0 right-0">
      <button @click="capture" class="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white/50 transition-all">
        <div class="h-16 w-16 rounded-full bg-white"></div>
      </button>
    </div>

    <!-- Hidden Canvas -->
    <canvas ref="canvasEl" class="hidden"></canvas>
  </div>
</template>
