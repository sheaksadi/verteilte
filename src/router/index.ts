import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';
import WordManager from '@/components/WordManager.vue';
import AIWordAdder from '@/components/AIWordAdder.vue';
import Settings from '@/components/Settings.vue';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView,
        },
        {
            path: '/words',
            name: 'words',
            component: WordManager,
        },
        {
            path: '/add',
            name: 'add',
            component: AIWordAdder,
            // meta: { hideNav: true } // Removed, now handled by /camera
        },
        {
            path: '/camera',
            name: 'camera',
            component: () => import('@/views/CameraView.vue'),
            meta: { hideNav: true }
        },
        {
            path: '/settings',
            name: 'settings',
            component: Settings,
        },
    ],
});

export default router;
