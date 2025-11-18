import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getAllWords, addWord as dbAddWord, deleteWord as dbDeleteWord, updateWordReview, resetAllWords, type Word } from '@/lib/database';
import { initializeDictionary, searchDictionary, searchByMeaning, type DictionaryEntry, type DictionaryInfo } from '@/lib/dictionary';

export const useWordStore = defineStore('words', () => {
    // State
    const words = ref<Word[]>([]);
    const searchQuery = ref('');
    const isLoading = ref(true);
    const dictionaryInfo = ref<DictionaryInfo | null>(null);
    const debugInfo = ref({
        platform: 'unknown',
        dictionaryLoaded: false,
        dictionaryVersion: '',
        loadError: '',
        dbWordsCount: 0,
        dictionaryLogs: [] as string[],
    });

    // Getters
    const filteredWords = computed(() => {
        if (!searchQuery.value.trim()) return words.value;
        const query = searchQuery.value.toLowerCase();
        return words.value.filter(word =>
            word.original.toLowerCase().includes(query) ||
            word.translation.toLowerCase().includes(query)
        );
    });

    const dueWords = computed(() => {
        const now = Date.now();
        return words.value.filter(word => word.nextReviewAt <= now);
    });

    // Actions
    const loadWords = async () => {
        try {
            words.value = await getAllWords();
            debugInfo.value.dbWordsCount = words.value.length;
        } catch (error) {
            console.error('Failed to load words:', error);
            debugInfo.value.loadError = error instanceof Error ? error.message : String(error);
        }
    };

    const addWord = async (original: string, translation: string, article: string) => {
        const now = Date.now();
        const newWord: Omit<Word, 'id'> = {
            original: original.trim(),
            translation: translation.trim(),
            article: article.trim(),
            score: 0,
            createdAt: now,
            lastReviewedAt: 0,
            nextReviewAt: now
        };

        await dbAddWord(newWord);
        await loadWords();
    };

    const deleteWord = async (id: number) => {
        await dbDeleteWord(id);
        await loadWords();
    };

    const updateReview = async (id: number, scoreChange: number) => {
        await updateWordReview(id, scoreChange);
        // We don't reload words here immediately to allow animation to finish in the component
        // The component should call loadWords after animation
    };

    const updateReviewLater = async (id: number) => {
        // Set next review to 1 minute from now without changing score
        const oneMinuteFromNow = Date.now() + 60000; // 60 seconds
        // We need to manually update this since we don't have a direct DB function for just updating time
        // But we can use the database directly or add a helper. 
        // For now, let's assume we can use a custom query or add a helper in database.ts
        // Since I cannot modify database.ts easily without seeing it, I will use the existing pattern 
        // or I might need to add a specific function to database.ts if updateWordReview doesn't support this.
        // Wait, updateWordReview takes scoreChange. 
        // Let's look at App.vue again. It uses `database.execute('UPDATE words SET nextReviewAt = ? WHERE id = ?', ...)`
        // I should probably expose a method for this in the store that calls a new method in database.ts or does the raw query if I can import getDatabase.

        // Ideally I should add `postponeWord` to database.ts, but for now I'll import getDatabase here as well.
        const { getDatabase } = await import('@/lib/database');
        const database = await getDatabase();
        await database.execute(
            'UPDATE words SET nextReviewAt = ? WHERE id = ?',
            [oneMinuteFromNow, id]
        );
        await loadWords();
    };

    const resetWords = async () => {
        await resetAllWords();
        await loadWords();
    };

    const initDictionary = async () => {
        try {
            const info = await initializeDictionary();
            if (info) {
                dictionaryInfo.value = info;
                debugInfo.value.dictionaryLoaded = true;
                debugInfo.value.dictionaryVersion = info.version;
                debugInfo.value.dictionaryLogs = info.logs;
            } else {
                debugInfo.value.dictionaryLogs = ['[App] Browser mode - dictionary not available'];
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            debugInfo.value.loadError = errorMsg;
            debugInfo.value.dictionaryLogs = [`[App ERROR] ${errorMsg}`];
        }
    };

    return {
        words,
        searchQuery,
        isLoading,
        dictionaryInfo,
        debugInfo,
        filteredWords,
        dueWords,
        loadWords,
        addWord,
        deleteWord,
        updateReview,
        updateReviewLater,
        resetWords,
        initDictionary
    };
});
