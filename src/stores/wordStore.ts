import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useNow } from '@vueuse/core';
import { getAllWords, addWord as dbAddWord, deleteWord as dbDeleteWord, updateWordReview, resetAllWords, getWordsForSync, upsertWords, getAlgorithmSettings, saveAlgorithmSettings as dbSaveAlgorithmSettings, type Word, type AlgorithmSettings } from '@/lib/database';
import { initializeDictionary, searchDictionary, searchByMeaning, type DictionaryEntry, type DictionaryInfo } from '@/lib/dictionary';

const API_URL = import.meta.env.VITE_API_URL || 'https://verteilte.joleif.dev';

export const useWordStore = defineStore('words', () => {
    // State
    const words = ref<Word[]>([]);
    const searchQuery = ref('');
    const capturedImage = ref<string | null>(null);
    const aiStrategy = ref<'all' | 'important' | 'no-common'>('important');
    const currentLanguage = ref<string>(localStorage.getItem('currentLanguage') || 'de');
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

    const algorithmSettings = ref<AlgorithmSettings | null>(null);

    const isKeepGoingMode = ref(false);
    const keepGoingWords = ref<Word[]>([]);

    // Auth State
    const user = ref<{ id: string; username: string } | null>(null);
    const token = ref<string | null>(localStorage.getItem('token'));
    const lastSyncTimestamp = ref<number>(parseInt(localStorage.getItem('lastSyncTimestamp') || '0'));
    const isSyncing = ref(false);

    // Config State
    const apiUrl = ref<string>(localStorage.getItem('apiUrl') || API_URL);

    // Getters
    const filteredWords = computed(() => {
        if (!searchQuery.value.trim()) return words.value;
        const query = searchQuery.value.toLowerCase();
        return words.value.filter(word =>
            word.original.toLowerCase().includes(query) ||
            word.translation.toLowerCase().includes(query)
        );
    });

    const now = useNow({ interval: 1000 });

    const dueWords = computed(() => {
        if (isKeepGoingMode.value) {
            return keepGoingWords.value;
        }
        return words.value.filter(word => word.nextReviewAt <= now.value.getTime());
    });

    const isLoggedIn = computed(() => !!token.value);

    // Actions
    const setApiUrl = (url: string) => {
        // Remove trailing slash if present
        const cleanUrl = url.replace(/\/$/, '');
        apiUrl.value = cleanUrl;
        localStorage.setItem('apiUrl', cleanUrl);
    };

    const loadWords = async () => {
        try {
            words.value = await getAllWords(currentLanguage.value);
            debugInfo.value.dbWordsCount = words.value.length;
            // Load settings as well
            algorithmSettings.value = await getAlgorithmSettings();
        } catch (error) {
            console.error('Failed to load words:', error);
            debugInfo.value.loadError = error instanceof Error ? error.message : String(error);
        }
    };

    const addWord = async (original: string, translation: string, article: string) => {
        const now = Date.now();
        const newWord: Omit<Word, 'id' | 'updatedAt' | 'deletedAt'> = {
            original: original.trim(),
            translation: translation.trim(),
            article: article.trim(),
            language: currentLanguage.value,
            score: 0,
            createdAt: now,
            lastReviewedAt: 0,
            nextReviewAt: now
        };

        await dbAddWord(newWord);
        await loadWords();
        if (isLoggedIn.value) sync();
    };

    const deleteWord = async (id: string) => {
        await dbDeleteWord(id);
        await loadWords();
        if (isLoggedIn.value) sync();
    };

    const updateReview = async (id: string, scoreChange: number) => {
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
        // We can trigger sync in background
        if (isLoggedIn.value) sync();
    };

    const updateReviewLater = async (id: string) => {
        if (isKeepGoingMode.value) {
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
        if (database) {
            await database.execute(
                'UPDATE words SET nextReviewAt = ?, updatedAt = ? WHERE id = ?',
                [oneMinuteFromNow, Date.now(), id]
            );
        }

        await loadWords();
        if (isLoggedIn.value) sync();
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
        if (isLoggedIn.value) sync();
    };

    const languageStatus = ref<Record<string, { exists: boolean, downloading: boolean }>>({});

    const checkAllDictionaries = async () => {
        const langs = ['de', 'es', 'fr', 'it'];
        const { initializeDictionary } = await import('@/lib/dictionary');

        for (const lang of langs) {
            try {
                // We use initializeDictionary just to check existence, but it also loads the DB if exists.
                // That's fine, but maybe we should have a lighter check?
                // For now, let's just use it. It returns info.
                // Actually, initializeDictionary sets the global db instance. We shouldn't call it for all.
                // We need a new function in dictionary.ts or just invoke the command directly here?
                // Let's invoke the command directly to avoid side effects on the active DB.
                const { invoke } = await import('@tauri-apps/api/core');
                const info = await invoke<DictionaryInfo>('ensure_dictionary_db', { lang });

                languageStatus.value[lang] = {
                    exists: info.exists,
                    downloading: languageStatus.value[lang]?.downloading || false
                };
            } catch (e) {
                console.error(`Failed to check dictionary for ${lang}:`, e);
            }
        }
    };

    const initDictionary = async () => {
        try {
            const { initializeDictionary } = await import('@/lib/dictionary');
            const info = await initializeDictionary(currentLanguage.value);

            if (info) {
                dictionaryInfo.value = info;
                debugInfo.value.dictionaryLoaded = info.exists;
                debugInfo.value.dictionaryVersion = info.version;
                debugInfo.value.dictionaryLogs = info.logs;

                // Update status for current language
                languageStatus.value[currentLanguage.value] = {
                    exists: info.exists,
                    downloading: languageStatus.value[currentLanguage.value]?.downloading || false
                };

                if (!info.exists) {
                    // Dictionary missing, trigger download
                    console.log('[Store] Dictionary missing, triggering download...');
                    downloadDictionary(currentLanguage.value);
                }
            } else {
                debugInfo.value.dictionaryLogs = ['[App] Browser mode - dictionary not available'];
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            debugInfo.value.loadError = errorMsg;
            debugInfo.value.dictionaryLogs = [`[App ERROR] ${errorMsg}`];
        }
    };

    const downloadProgress = ref<number | null>(null);
    const downloadStatus = ref<string>('');

    const downloadDictionary = async (lang: string) => {
        if (languageStatus.value[lang]?.downloading) return; // Already downloading

        try {
            // Set downloading state
            languageStatus.value[lang] = { ...languageStatus.value[lang], downloading: true };

            downloadStatus.value = 'Downloading dictionary...';
            downloadProgress.value = 0;

            const response = await fetch(`${apiUrl.value}/dictionaries/${lang}.db.gz`);
            if (!response.ok) throw new Error(`Failed to download dictionary: ${response.statusText}`);

            const reader = response.body?.getReader();
            const contentLengthHeader = response.headers.get('Content-Length');
            const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
            let receivedLength = 0;
            const chunks = [];

            if (!reader) throw new Error('Failed to get reader');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (contentLength > 0) {
                    downloadProgress.value = Math.round((receivedLength / contentLength) * 100);
                } else {
                    // Indeterminate progress
                    downloadProgress.value = -1;
                }
            }

            const blob = new Blob(chunks);
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            downloadStatus.value = 'Saving dictionary...';

            // Save to app data dir using tauri-plugin-fs
            const { BaseDirectory, writeFile, remove, exists } = await import('@tauri-apps/plugin-fs');
            await writeFile(`dictionary_${lang}.db.gz`, uint8Array, { baseDir: BaseDirectory.AppData });

            // Remove existing .db file to force re-extraction
            const dbFile = `dictionary_${lang}.db`;
            if (await exists(dbFile, { baseDir: BaseDirectory.AppData })) {
                await remove(dbFile, { baseDir: BaseDirectory.AppData });
            }

            downloadStatus.value = 'Dictionary downloaded. Initializing...';
            downloadProgress.value = null;

            // Update status
            languageStatus.value[lang] = { exists: true, downloading: false };

            // Re-initialize dictionary if it's the current one
            if (lang === currentLanguage.value) {
                await initDictionary();
            }

        } catch (e) {
            console.error('Download failed:', e);
            downloadStatus.value = `Download failed: ${e instanceof Error ? e.message : String(e)}`;
            downloadProgress.value = null;

            // Reset downloading state
            languageStatus.value[lang] = { ...languageStatus.value[lang], downloading: false };
        }
    };

    const setLanguage = async (lang: string) => {
        if (currentLanguage.value === lang) return;
        currentLanguage.value = lang;
        localStorage.setItem('currentLanguage', lang);
        await loadWords();
        await initDictionary();
    };

    // Auth Actions
    const login = async (username: string, password: string) => {
        try {
            const res = await fetch(`${apiUrl.value}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) throw new Error('Login failed');

            const data = await res.json();
            token.value = data.token;
            user.value = data.user;
            localStorage.setItem('token', data.token);

            await sync();
            return { success: true };
        } catch (e) {
            console.error(e);
            return { success: false, error: e instanceof Error ? e.message : 'Login failed' };
        }
    };

    const register = async (username: string, password: string) => {
        try {
            const res = await fetch(`${apiUrl.value}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) throw new Error('Registration failed');

            const data = await res.json();
            token.value = data.token;
            user.value = data.user;
            localStorage.setItem('token', data.token);

            await sync();
            return { success: true };
        } catch (e) {
            console.error(e);
            return { success: false, error: e instanceof Error ? e.message : 'Registration failed' };
        }
    };

    const logout = () => {
        token.value = null;
        user.value = null;
        localStorage.removeItem('token');
        localStorage.removeItem('lastSyncTimestamp');
        lastSyncTimestamp.value = 0;
    };

    const sync = async () => {
        if (!token.value || isSyncing.value) return;
        isSyncing.value = true;

        try {
            // 1. Get local changes
            const localChanges = await getWordsForSync(lastSyncTimestamp.value);

            // 2. Send to server
            const res = await fetch(`${apiUrl.value}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token.value}`
                },
                body: JSON.stringify({
                    lastSyncTimestamp: lastSyncTimestamp.value,
                    changes: localChanges
                })
            });

            if (!res.ok) {
                if (res.status === 401 || res.status === 403) {
                    logout();
                    return;
                }
                throw new Error('Sync failed');
            }

            const data = await res.json();

            // 3. Apply server changes
            if (data.changes && data.changes.length > 0) {
                await upsertWords(data.changes);
                await loadWords();
            }

            // 4. Update timestamp
            lastSyncTimestamp.value = data.timestamp;
            localStorage.setItem('lastSyncTimestamp', data.timestamp.toString());

        } catch (e) {
            console.error('Sync error:', e);
        } finally {
            isSyncing.value = false;
        }
    };

    const saveSettings = async (settings: AlgorithmSettings) => {
        await dbSaveAlgorithmSettings(settings);
        algorithmSettings.value = settings;
    };

    const loadSettings = async () => {
        algorithmSettings.value = await getAlgorithmSettings();
    };

    const checkConnection = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${apiUrl.value}/health`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                return { success: true, message: 'Connected to server' };
            } else {
                return { success: false, message: `Server returned ${res.status}` };
            }
        } catch (e) {
            if (e instanceof Error) {
                if (e.name === 'AbortError') return { success: false, message: 'Connection timed out (5s)' };
                return { success: false, message: `Connection failed: ${e.message}` };
            }
            return { success: false, message: 'Connection failed' };
        }
    };

    const pingServer = async () => {
        try {
            const res = await fetch(`${apiUrl.value}/ping`);
            if (res.ok) {
                return { success: true, message: 'Pong!' };
            } else {
                return { success: false, message: `Ping failed: ${res.status}` };
            }
        } catch (e) {
            return { success: false, message: `Ping error: ${e instanceof Error ? e.message : String(e)}` };
        }
    };

    const pingGoogle = async () => {
        try {
            // mode: 'no-cors' is important because Google doesn't allow CORS
            // We won't get a readable response, but if it doesn't throw, we have internet
            await fetch('https://www.google.com', { mode: 'no-cors' });
            return { success: true, message: 'Internet accessible' };
        } catch (e) {
            return { success: false, message: `Internet check failed: ${e instanceof Error ? e.message : String(e)}` };
        }
    };

    return {
        words,
        searchQuery,
        isLoading,
        dictionaryInfo,
        debugInfo,
        algorithmSettings,
        filteredWords,
        dueWords,
        isKeepGoingMode,
        user,
        isLoggedIn,
        isSyncing,
        apiUrl,
        loadWords,
        addWord,
        deleteWord,
        updateReview,
        updateReviewLater,
        startKeepGoingMode,
        resetWords,
        initDictionary,
        login,
        register,
        logout,
        sync,
        setApiUrl,
        saveSettings,
        loadSettings,
        checkConnection,
        pingServer,
        pingGoogle,
        capturedImage,
        aiStrategy,
        currentLanguage,
        downloadProgress,
        downloadStatus,
        setLanguage,
        downloadDictionary,
        languageStatus,
        checkAllDictionaries
    };
});
