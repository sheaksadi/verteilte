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

    const isKeepGoingMode = ref(false);
    const keepGoingWords = ref<Word[]>([]);

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
        if (isKeepGoingMode.value) {
            return keepGoingWords.value;
        }
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
        // In keep going mode, we don't change the score and don't update DB
        if (isKeepGoingMode.value) {
            // Remove the word from the local keepGoingWords list
            keepGoingWords.value = keepGoingWords.value.filter(w => w.id !== id);

            // If no more words in keep going mode, exit the mode
            if (keepGoingWords.value.length === 0) {
                isKeepGoingMode.value = false;
            }
            return;
        }

        await updateWordReview(id, scoreChange);
        // The component should call loadWords after animation
    };

    const updateReviewLater = async (id: number) => {
        if (isKeepGoingMode.value) {
            // In keep going mode, "Later" just moves it to the end of the current queue or removes it?
            // Let's just move it to the end of the list so it comes up again
            const wordIndex = keepGoingWords.value.findIndex(w => w.id === id);
            if (wordIndex !== -1) {
                const word = keepGoingWords.value[wordIndex];
                keepGoingWords.value.splice(wordIndex, 1);
                keepGoingWords.value.push(word);
            }
            return;
        }

        // Set next review to 1 minute from now without changing score
        const oneMinuteFromNow = Date.now() + 60000; // 60 seconds
        const { getDatabase } = await import('@/lib/database');
        const database = await getDatabase();
        await database.execute(
            'UPDATE words SET nextReviewAt = ? WHERE id = ?',
            [oneMinuteFromNow, id]
        );
        await loadWords();
    };

    const startKeepGoingMode = async () => {
        const now = Date.now();
        // Find 5 words with closest nextReviewAt that are in the future
        const futureWords = words.value
            .filter(w => w.nextReviewAt > now)
            .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
            .slice(0, 5);

        if (futureWords.length === 0) return;

        // Deep copy to avoid affecting the main list state
        keepGoingWords.value = JSON.parse(JSON.stringify(futureWords));
        isKeepGoingMode.value = true;
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
        isKeepGoingMode,
        loadWords,
        addWord,
        deleteWord,
        updateReview,
        updateReviewLater,
        startKeepGoingMode,
        resetWords,
        initDictionary
    };
});
