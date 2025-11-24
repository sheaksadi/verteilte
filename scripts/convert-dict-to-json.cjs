const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
let dictDir = '';
let outputFile = '';
let reverse = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dictDir = args[++i];
    else if (args[i] === '--out') outputFile = args[++i];
    else if (args[i] === '--reverse') reverse = true;
}

if (!dictDir || !outputFile) {
    console.error('Usage: node convert-dict-to-json.cjs --dir <path> --out <path> [--reverse]');
    process.exit(1);
}

// Resolve paths relative to cwd if not absolute
dictDir = path.resolve(process.cwd(), dictDir);
outputFile = path.resolve(process.cwd(), outputFile);

// Find index and dict files
const files = fs.readdirSync(dictDir);
const indexFilename = files.find(f => f.endsWith('.index'));
const dictFilename = files.find(f => f.endsWith('.dict'));

if (!indexFilename || !dictFilename) {
    console.error('Error: .index or .dict file not found in', dictDir);
    process.exit(1);
}

const indexFile = path.join(dictDir, indexFilename);
const dictFile = path.join(dictDir, dictFilename);

// Helper to decode Base64 to number (for dictd index format)
function decodeBase64(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = 0;
    for (let i = 0; i < str.length; i++) {
        result = result * 64 + chars.indexOf(str[i]);
    }
    return result;
}

async function convert() {
    console.log(`Starting dictionary conversion...`);
    console.log(`Dir: ${dictDir}`);
    console.log(`Out: ${outputFile}`);
    console.log(`Mode: ${reverse ? 'REVERSE (Target -> Source)' : 'NORMAL (Source -> Target)'}`);

    const indexContent = fs.readFileSync(indexFile, 'utf-8');
    const dictFd = fs.openSync(dictFile, 'r');
    const dictSize = fs.statSync(dictFile).size;

    const lines = indexContent.split('\n');

    // For reverse mode: map TargetWord -> [SourceWords]
    // For normal mode: list of { word, meanings... }
    const entriesMap = new Map(); // Used for reverse mode
    const entriesList = []; // Used for normal mode

    console.log(`Found ${lines.length} lines in index.`);

    let count = 0;
    for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split('\t');
        if (parts.length < 3) continue;

        const headword = parts[0];

        // Filter out metadata entries
        if (headword.startsWith('00database')) continue;

        const offsetStr = parts[1];
        const lengthStr = parts[2];

        try {
            const offset = decodeBase64(offsetStr);
            const length = decodeBase64(lengthStr);

            if (offset + length > dictSize) {
                continue;
            }

            const buffer = Buffer.alloc(length);
            fs.readSync(dictFd, buffer, 0, length, offset);
            const definition = buffer.toString('utf-8').trim();

            if (reverse) {
                // Reverse Mode: headword is Source (English), definition contains Target (Spanish)
                // We want Target -> Source

                // Parsing heuristic for FreeDict eng-spa:
                // Format often: "1. word1, word2 2. word3 ..."
                // or just "word1, word2"

                // Split by newlines to process line by line
                const defLines = definition.split('\n');
                const targetWords = new Set();

                for (const defLine of defLines) {
                    // Look for lines that start with a number (e.g. "1. ") or just text
                    // But exclude lines that look like English definitions (often start with Capital letter and end with dot, or contain "A ...")
                    // This is fuzzy.

                    // Better heuristic:
                    // In eng-spa, the Spanish words are often comma separated at the start of numbered lines.
                    // e.g. "1. perro, can\nA mammal..."

                    let cleanLine = defLine.trim();

                    // Remove leading "1. ", "2. " etc
                    cleanLine = cleanLine.replace(/^\d+\.\s*/, '');

                    // If line is empty or looks like phonetic info (starts with / or [), skip
                    if (!cleanLine || cleanLine.startsWith('/') || cleanLine.startsWith('[')) continue;

                    // Split by comma
                    const potentialWords = cleanLine.split(/[;,]/);

                    for (const potWord of potentialWords) {
                        let w = potWord.trim();
                        // Filter out long sentences (likely definitions)
                        if (w.includes(' ') && w.split(' ').length > 4) continue;
                        // Filter out words with only symbols
                        if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(w)) continue;

                        // Remove trailing dot if present
                        w = w.replace(/\.$/, '');

                        if (w) targetWords.add(w);
                    }
                }

                for (const targetWord of targetWords) {
                    if (!entriesMap.has(targetWord)) {
                        entriesMap.set(targetWord, new Set());
                    }
                    entriesMap.get(targetWord).add(headword);
                }

            } else {
                // Normal Mode: headword is Source (German), definition is Target (English)
                // Format: Word /phonetic/ <grammar> Meaning

                let pronunciation = '';
                let gender = '';
                const meanings = [];
                const notes = [];
                const synonyms = [];
                const seeAlso = [];

                const defLines = definition.split('\n');

                for (let i = 0; i < defLines.length; i++) {
                    let line = defLines[i].trim();
                    if (!line) continue;

                    // Check for header info in the first line (or any line that looks like a header)
                    // But usually, the DICT format puts the headword and phonetic in the first line
                    if (i === 0) {
                        const phoneticMatch = line.match(/\/([^\/]+)\//);
                        if (phoneticMatch) {
                            pronunciation = phoneticMatch[1];
                            // Remove it from line to process rest
                            line = line.replace(phoneticMatch[0], '').trim();
                        }

                        const grammarMatch = line.match(/<([^>]+)>/);
                        if (grammarMatch) {
                            const tags = grammarMatch[1];
                            if (/\b(masc|m)\b/.test(tags)) gender = 'masc';
                            else if (/\b(fem|f)\b/.test(tags)) gender = 'fem';
                            else if (/\b(neut|n)\b/.test(tags)) gender = 'neut';

                            // Remove it
                            line = line.replace(grammarMatch[0], '').trim();
                        }

                        // Remove the headword if it's repeated at the start
                        if (line.toLowerCase().startsWith(headword.toLowerCase())) {
                            line = line.substring(headword.length).trim();
                        }
                    }

                    // Parse specific fields
                    if (line.startsWith('Note:')) {
                        notes.push(line.replace(/^Note:\s*/i, '').trim());
                    } else if (/^Synonyms?:/i.test(line)) {
                        const syns = line.match(/\{([^}]+)\}/g);
                        if (syns) {
                            synonyms.push(...syns.map(s => s.replace(/[{}]/g, '').trim()));
                        }
                    } else if (line.startsWith('see:')) {
                        const refs = line.match(/\{([^}]+)\}/g);
                        if (refs) {
                            seeAlso.push(...refs.map(r => r.replace(/[{}]/g, '').trim()));
                        }
                    } else {
                        // Meaning line
                        // Clean up tags
                        let cleaned = line
                            .replace(/<[^>]+>/g, '') // Remove <tags>
                            .replace(/\[[^\]]+\]/g, '') // Remove [tags]
                            .replace(/\s+/g, ' ')
                            .trim();

                        if (cleaned) {
                            // Split by comma respecting quotes
                            const parts = cleaned.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

                            for (let part of parts) {
                                part = part.trim();
                                if (!part) continue;

                                // Check if it's an example: "..." - ...
                                if (/^"[^"]+"\s*-\s*.+/.test(part)) {
                                    notes.push(part);
                                } else {
                                    meanings.push(part);
                                }
                            }
                        }
                    }
                }

                entriesList.push({
                    word: headword,
                    pronunciation: pronunciation,
                    gender: gender,
                    meanings: meanings,
                    notes: notes,
                    synonyms: synonyms,
                    seeAlso: seeAlso
                });
            }

            count++;
            if (count % 5000 === 0) {
                console.log(`Processed ${count} entries...`);
            }
        } catch (e) {
            console.error(`Error processing entry "${headword}":`, e);
        }
    }

    fs.closeSync(dictFd);

    let finalEntries = [];
    if (reverse) {
        console.log(`Reverse mode: Converting map to list...`);
        for (const [word, meaningsSet] of entriesMap) {
            finalEntries.push({
                word: word,
                meanings: Array.from(meaningsSet),
                notes: [],
                synonyms: [],
                seeAlso: []
            });
        }
    } else {
        finalEntries = entriesList;
    }

    console.log(`Writing ${finalEntries.length} entries to ${outputFile}...`);
    fs.writeFileSync(outputFile, JSON.stringify(finalEntries, null, 2));
    console.log('Conversion complete!');
}

convert();
