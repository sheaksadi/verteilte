#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');

console.log('📚 Building SQLite dictionary database...\n');

// Paths
const args = process.argv.slice(2);
let inputFile = '';
let outputDb = '';
let outputGz = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--in') inputFile = args[++i];
  else if (args[i] === '--out') outputDb = args[++i];
}

if (!inputFile || !outputDb) {
  console.error('Usage: node build-dictionary-db.cjs --in <json_path> --out <db_path>');
  process.exit(1);
}

// Resolve paths
inputFile = path.resolve(process.cwd(), inputFile);
outputDb = path.resolve(process.cwd(), outputDb);
outputGz = outputDb + '.gz';

console.log(`Input: ${inputFile}`);
console.log(`Output: ${outputGz}`);

// Step 1: Read JSON
console.log('1️⃣  Reading dictionary.json...');
const jsonContent = fs.readFileSync(inputFile, 'utf-8');
console.log(`   File size: ${(jsonContent.length / 1024 / 1024).toFixed(2)} MB`);

console.log('3️⃣  Parsing JSON...');
const entries = JSON.parse(jsonContent);
console.log(`   Total entries: ${entries.length.toLocaleString()}`);

// Step 2: Create SQLite database
console.log('4️⃣  Creating SQLite database...');
if (fs.existsSync(outputDb)) {
  fs.unlinkSync(outputDb);
}

const db = new Database(outputDb);

// Create table with indexes
console.log('5️⃣  Creating schema...');
db.exec(`
  CREATE TABLE dictionary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    pronunciation TEXT,
    gender TEXT,
    meanings TEXT,
    notes TEXT,
    synonyms TEXT,
    seeAlso TEXT
  );
  
  CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  
  CREATE INDEX idx_word ON dictionary(word);
  CREATE INDEX idx_word_lower ON dictionary(LOWER(word));
`);

// Insert metadata
const version = new Date().toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run('version', version);
db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run('created_at', new Date().toISOString());
db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run('total_entries', entries.length.toString());

console.log(`   Database version: ${version}`);

// Prepare insert statement
const insert = db.prepare(`
  INSERT INTO dictionary (word, pronunciation, gender, meanings, notes, synonyms, seeAlso)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Insert all entries in a transaction
console.log('6️⃣  Inserting entries...');
const startTime = Date.now();

db.transaction(() => {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    insert.run(
      entry.word || '',
      entry.pronunciation || '',
      entry.gender || '',
      JSON.stringify(entry.meanings || []),
      JSON.stringify(entry.notes || []),
      JSON.stringify(entry.synonyms || []),
      JSON.stringify(entry.seeAlso || [])
    );

    if ((i + 1) % 50000 === 0) {
      console.log(`   Inserted ${(i + 1).toLocaleString()} / ${entries.length.toLocaleString()}`);
    }
  }
})();

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`   ✓ Inserted ${entries.length.toLocaleString()} entries in ${elapsed}s`);

// Close database
db.close();

// Step 3: Compress database
console.log('7️⃣  Compressing database...');
const dbBuffer = fs.readFileSync(outputDb);
const dbSize = dbBuffer.length;
console.log(`   Database size: ${(dbSize / 1024 / 1024).toFixed(2)} MB`);

const compressed_db = zlib.gzipSync(dbBuffer, { level: 9 });
fs.writeFileSync(outputGz, compressed_db);
console.log(`   Compressed size: ${(compressed_db.length / 1024 / 1024).toFixed(2)} MB`);

// Cleanup: remove uncompressed db
fs.unlinkSync(outputDb);

// Summary
console.log('\n✅ Done!');
console.log(`\nResults:`);
console.log(`  - Created: ${path.relative(process.cwd(), outputGz)}`);
console.log(`  - Compressed: ${(compressed_db.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`\nYou can now use this in your Tauri app!`);
