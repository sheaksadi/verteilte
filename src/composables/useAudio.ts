import { ref } from 'vue';
import { useWordStore } from '@/stores/wordStore';

export function useAudio() {
    const store = useWordStore();
    const isPlaying = ref(false);
    const audioCache = new Map<string, string>(); // In-memory cache for blob URLs

    // Helper to sanitize filenames
    const getFilename = (text: string) => `audio_${text.replace(/[^a-z0-9äöüß]/gi, '_')}.wav`;

    const playBlob = async (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise<void>((resolve, reject) => {
            isPlaying.value = true;
            audio.onended = () => {
                isPlaying.value = false;
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.onerror = (e) => {
                isPlaying.value = false;
                URL.revokeObjectURL(url);
                console.error("Audio playback error", e);
                reject(e);
            };
            audio.play().catch(e => {
                isPlaying.value = false;
                reject(e);
            });
        });
    };

    const playAudio = async (text: string) => {
        if (!text || isPlaying.value) return;

        try {
            // 1. Check local file system (Tauri only)
            try {
                const { BaseDirectory, exists, readFile } = await import('@tauri-apps/plugin-fs');
                const filename = getFilename(text);

                if (await exists(filename, { baseDir: BaseDirectory.AppData })) {
                    console.log(`[Audio] Playing from file system: ${filename}`);
                    const data = await readFile(filename, { baseDir: BaseDirectory.AppData });
                    const blob = new Blob([data], { type: 'audio/wav' });
                    await playBlob(blob);
                    return;
                }
            } catch (e) {
                // Ignore FS errors (e.g. not in Tauri or permission issues)
                console.debug('[Audio] FS check failed, falling back to network', e);
            }

            // 2. Fetch from server
            console.log(`[Audio] Fetching from server: ${text}`);
            const baseUrl = store.serverUrl || 'http://verteilte.joleif.dev';
            const cleanBase = baseUrl.replace(/\/$/, '');
            const fetchUrl = `${cleanBase}/tts?text=${encodeURIComponent(text)}`;

            const response = await fetch(fetchUrl);
            if (!response.ok) throw new Error('TTS fetch failed');

            const blob = await response.blob();

            // 3. Save to file system (Tauri only)
            try {
                const { BaseDirectory, writeFile } = await import('@tauri-apps/plugin-fs');
                const filename = getFilename(text);
                const buffer = await blob.arrayBuffer();
                await writeFile(filename, new Uint8Array(buffer), { baseDir: BaseDirectory.AppData });
                console.log(`[Audio] Saved to file system: ${filename}`);
            } catch (e) {
                console.debug('[Audio] Failed to save to FS', e);
            }

            await playBlob(blob);

        } catch (e) {
            console.error(`Failed to play audio for "${text}":`, e);
            isPlaying.value = false;
        }
    };

    const inFlightPrefetches = new Set<string>();

    const prefetchAudio = async (texts: string[]) => {
        if (texts.length === 0) return;

        // Filter out texts we are already fetching
        const uniqueTexts = texts.filter(t => !inFlightPrefetches.has(t));
        if (uniqueTexts.length === 0) return;

        // Mark as in-flight
        uniqueTexts.forEach(t => inFlightPrefetches.add(t));

        // Run in background with a small delay to let UI render
        setTimeout(async () => {
            try {
                // Filter out texts we already have on disk
                const neededTexts: string[] = [];

                try {
                    const { BaseDirectory, exists } = await import('@tauri-apps/plugin-fs');

                    for (const text of uniqueTexts) {
                        // Yield to UI thread occasionally
                        await new Promise(r => setTimeout(r, 0));

                        const filename = getFilename(text);
                        try {
                            if (!(await exists(filename, { baseDir: BaseDirectory.AppData }))) {
                                neededTexts.push(text);
                            }
                        } catch (e) {
                            // If exists fails, assume we need it (or skip to be safe? let's skip to avoid errors loop)
                            console.debug(`[Audio] FS check failed for ${text}`, e);
                        }
                    }
                } catch (e) {
                    // If FS check fails globally, assume we need all
                    neededTexts.push(...uniqueTexts);
                }

                if (neededTexts.length === 0) {
                    uniqueTexts.forEach(t => inFlightPrefetches.delete(t));
                    return;
                }

                console.log(`[Audio] Bulk prefetching ${neededTexts.length} items`);

                const baseUrl = store.serverUrl || 'http://verteilte.joleif.dev';
                const cleanBase = baseUrl.replace(/\/$/, '');

                const response = await fetch(`${cleanBase}/tts/bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts: neededTexts })
                });

                if (!response.ok) throw new Error('Bulk TTS fetch failed');

                const data = await response.json();
                const results = data.results as { text: string, audio: string | null }[];

                const { BaseDirectory, writeFile } = await import('@tauri-apps/plugin-fs');

                for (const result of results) {
                    if (result.audio) {
                        try {
                            const filename = getFilename(result.text);
                            // Convert base64 to Uint8Array
                            const binaryString = atob(result.audio);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }

                            await writeFile(filename, bytes, { baseDir: BaseDirectory.AppData });
                            console.log(`[Audio] Bulk saved: ${filename}`);
                        } catch (e) {
                            console.error(`[Audio] Failed to save bulk item ${result.text}`, e);
                        }
                    }
                    // Yield again
                    await new Promise(r => setTimeout(r, 0));
                }

            } catch (e) {
                console.error('[Audio] Bulk prefetch failed:', e);
            } finally {
                uniqueTexts.forEach(t => inFlightPrefetches.delete(t));
            }
        }, 100);
    };

    const deleteAudio = async (text: string) => {
        try {
            const { BaseDirectory, remove, exists } = await import('@tauri-apps/plugin-fs');
            const filename = getFilename(text);

            if (await exists(filename, { baseDir: BaseDirectory.AppData })) {
                await remove(filename, { baseDir: BaseDirectory.AppData });
                console.log(`[Audio] Deleted from file system: ${filename}`);
                return true;
            }
            return false;
        } catch (e) {
            console.error(`[Audio] Failed to delete audio for "${text}":`, e);
            return false;
        }
    };

    return {
        isPlaying,
        playAudio,
        prefetchAudio,
        deleteAudio
    };
}
