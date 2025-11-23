<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useWordStore } from '@/stores/wordStore';
import CameraCapture from '@/components/CameraCapture.vue';

const router = useRouter();
const store = useWordStore();

const handleCapture = (imageData: string) => {
  store.capturedImage = imageData;
  router.push('/add');
};

const handleClose = () => {
  router.push('/add');
};
</script>

<template>
  <div class="h-full w-full bg-black">
    <CameraCapture @capture="handleCapture" @close="handleClose" />
  </div>
</template>
