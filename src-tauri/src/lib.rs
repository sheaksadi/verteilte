use tauri_plugin_sql::{Migration, MigrationKind};
use flate2::read::GzDecoder;
use tauri::Manager;
use std::fs::File;
use std::io::Read;

#[derive(serde::Serialize, serde::Deserialize)]
struct DictionaryEntry {
    word: String,
    pronunciation: Option<String>,
    gender: Option<String>,
    meanings: Vec<String>,
    notes: Vec<String>,
    synonyms: Vec<String>,
    #[serde(rename = "seeAlso")]
    see_also: Vec<String>,
}

#[derive(serde::Serialize)]
struct DictionaryInfo {
    version: String,
    path: String,
    exists: bool,
    logs: Vec<String>,
}

// Ensure dictionary database exists, decompress if needed
#[tauri::command]
async fn ensure_dictionary_db(app: tauri::AppHandle, lang: String) -> Result<DictionaryInfo, String> {
    let mut logs = Vec::new();
    
    let db_filename = format!("dictionary_{}.db", lang);
    let gz_filename = format!("dictionary_{}.db.gz", lang);

    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join(&db_filename);
    
    logs.push(format!("[RUST] Checking for dictionary ({}) at: {:?}", lang, db_path));
    
    if db_path.exists() {
        logs.push("[RUST] Dictionary DB found.".to_string());
        return Ok(DictionaryInfo {
            version: "20241115".to_string(),
            path: db_path.to_string_lossy().to_string(),
            exists: true,
            logs,
        });
    }

    // Check for .gz file (downloaded by client)
    let gz_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join(&gz_filename);

    logs.push(format!("[RUST] Checking for GZ file at: {:?}", gz_path));

    if gz_path.exists() {
        logs.push("[RUST] GZ file found, decompressing...".to_string());
        
        let bytes = std::fs::read(&gz_path)
            .map_err(|e| format!("Failed to read GZ file: {}", e))?;

        let mut decoder = GzDecoder::new(&bytes[..]);
        let mut output_file = File::create(&db_path)
            .map_err(|e| format!("Failed to create DB file: {}", e))?;
        
        let bytes_written = std::io::copy(&mut decoder, &mut output_file)
            .map_err(|e| format!("Failed to decompress DB: {}", e))?;
        
        logs.push(format!("[RUST] Successfully decompressed {} bytes", bytes_written));
        
        // Optional: remove gz file after successful decompression
        // std::fs::remove_file(gz_path).ok();

        return Ok(DictionaryInfo {
            version: "20241115".to_string(),
            path: db_path.to_string_lossy().to_string(),
            exists: true,
            logs,
        });
    }

    // If we are here, neither DB nor GZ exists.
    // We return exists: false so the client knows to download it.
    logs.push("[RUST] Dictionary not found locally.".to_string());
    
    Ok(DictionaryInfo {
        version: "".to_string(),
        path: "".to_string(),
        exists: false,
        logs,
    })
}

// Search dictionary - will be called from frontend via SQL plugin directly
// This is just a helper to show structure

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_words_table",
            sql: "CREATE TABLE IF NOT EXISTS words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original TEXT NOT NULL,
                translation TEXT NOT NULL,
                article TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_spaced_repetition_fields",
            sql: "ALTER TABLE words ADD COLUMN score INTEGER NOT NULL DEFAULT 0;
                  ALTER TABLE words ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0;
                  ALTER TABLE words ADD COLUMN lastReviewedAt INTEGER NOT NULL DEFAULT 0;
                  ALTER TABLE words ADD COLUMN nextReviewAt INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        }
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:words.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![ensure_dictionary_db])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
