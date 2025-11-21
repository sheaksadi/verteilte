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
async fn ensure_dictionary_db(app: tauri::AppHandle) -> Result<DictionaryInfo, String> {
    let mut logs = Vec::new();
    
    let db_path = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("dictionary.db");
    
    logs.push(format!("[RUST] Checking for dictionary at: {:?}", db_path));
    
    let exists = db_path.exists();
    
    if !exists {
        logs.push("[RUST] Dictionary DB not found, decompressing from assets...".to_string());
        
        // Try multiple asset paths
        let asset_paths = vec![
            "dictionary.db.gz",
            "_up_/public/dictionary.db.gz",
            "public/dictionary.db.gz",
        ];
        
        let mut asset_bytes: Option<Vec<u8>> = None;
        
        // First try asset resolver
        for path in &asset_paths {
            logs.push(format!("[RUST] Trying asset path: {}", path));
            if let Some(a) = app.asset_resolver().get(path.to_string()) {
                logs.push(format!("[RUST] ✓ Found via asset resolver: {}", path));
                asset_bytes = Some(a.bytes.to_vec());
                break;
            } else {
                logs.push(format!("[RUST] ✗ Not found: {}", path));
            }
        }
        
        // If asset resolver failed, try direct filesystem access (dev mode)
        if asset_bytes.is_none() {
            logs.push("[RUST] Asset resolver failed, trying filesystem (dev mode)...".to_string());
            
            // Try to find the file relative to the binary
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()));
            
            if let Some(base_dir) = exe_dir {
                let fs_paths = vec![
                    base_dir.join("../public/dictionary.db.gz"),
                    base_dir.join("../../public/dictionary.db.gz"),
                    base_dir.join("../../../public/dictionary.db.gz"),
                ];
                
                for fs_path in fs_paths {
                    logs.push(format!("[RUST] Trying filesystem: {:?}", fs_path));
                    if fs_path.exists() {
                        match std::fs::read(&fs_path) {
                            Ok(bytes) => {
                                logs.push(format!("[RUST] ✓ Found via filesystem: {:?}", fs_path));
                                asset_bytes = Some(bytes);
                                break;
                            }
                            Err(e) => {
                                logs.push(format!("[RUST] Error reading file: {}", e));
                            }
                        }
                    } else {
                        logs.push(format!("[RUST] ✗ Not found: {:?}", fs_path));
                    }
                }
            }
        }
        
        let bytes = asset_bytes.ok_or_else(|| {
            logs.push("[RUST ERROR] dictionary.db.gz not found in any location".to_string());
            for log in &logs {
                println!("{}", log);
            }
            format!("LOGS:{}", serde_json::to_string(&logs).unwrap_or_else(|_| "[]".to_string()))
        })?;
        
        logs.push(format!("[RUST] Loaded {} bytes ({} MB)", bytes.len(), bytes.len() / 1_000_000));
        
        // Decompress to app data directory
        logs.push("[RUST] Decompressing...".to_string());
        let mut decoder = GzDecoder::new(&bytes[..]);
        let mut output_file = File::create(&db_path)
            .map_err(|e| {
                logs.push(format!("[RUST ERROR] Failed to create DB file: {}", e));
                format!("Failed to create DB file: {}", e)
            })?;
        
        let bytes_written = std::io::copy(&mut decoder, &mut output_file)
            .map_err(|e| {
                logs.push(format!("[RUST ERROR] Failed to decompress: {}", e));
                format!("Failed to decompress DB: {}", e)
            })?;
        
        logs.push(format!("[RUST] Successfully decompressed {} bytes ({} MB)", bytes_written, bytes_written / 1_000_000));
        logs.push(format!("[RUST] Dictionary DB saved to: {:?}", db_path));
    } else {
        logs.push("[RUST] Dictionary DB already exists, using cached version".to_string());
    }
    
    logs.push("[RUST] ✓ Dictionary ready".to_string());
    
    // Print logs to stdout as well
    for log in &logs {
        println!("{}", log);
    }
    
    Ok(DictionaryInfo {
        version: "20241115".to_string(),
        path: db_path.to_string_lossy().to_string(),
        exists: true,
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
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:words.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![ensure_dictionary_db])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
