use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("No fue posible resolver el directorio de datos local: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("No fue posible crear el directorio de datos local: {error}"))?;

    Ok(app_data_dir)
}

fn legacy_cache_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("desktop-cache.json"))
}

fn sqlite_cache_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("desktop-cache.sqlite3"))
}

fn load_legacy_cache(app: &AppHandle) -> Result<Map<String, Value>, String> {
    let file_path = legacy_cache_file_path(app)?;
    if !file_path.exists() {
        return Ok(Map::new());
    }

    let raw = fs::read_to_string(&file_path)
        .map_err(|error| format!("No fue posible leer el cache legado: {error}"))?;

    if raw.trim().is_empty() {
        return Ok(Map::new());
    }

    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|error| format!("No fue posible interpretar el cache legado: {error}"))?;

    match parsed {
        Value::Object(map) => Ok(map),
        _ => Err("El cache legado tiene un formato invalido.".to_string()),
    }
}

fn rename_legacy_cache_file(app: &AppHandle) -> Result<(), String> {
    let source = legacy_cache_file_path(app)?;
    if !source.exists() {
        return Ok(());
    }

    let backup = app_data_dir(app)?.join("desktop-cache.migrated.json");
    if backup.exists() {
        fs::remove_file(&backup)
            .map_err(|error| format!("No fue posible reemplazar el backup del cache legado: {error}"))?;
    }

    fs::rename(&source, &backup)
        .map_err(|error| format!("No fue posible respaldar el cache legado tras migrarlo: {error}"))?;

    Ok(())
}

fn migrate_legacy_cache_if_needed(app: &AppHandle, connection: &Connection) -> Result<(), String> {
    let existing_rows: i64 = connection
        .query_row("SELECT COUNT(*) FROM desktop_cache", [], |row| row.get(0))
        .map_err(|error| format!("No fue posible revisar el cache SQLite: {error}"))?;

    if existing_rows > 0 {
        return Ok(());
    }

    let legacy_cache = load_legacy_cache(app)?;
    if legacy_cache.is_empty() {
        return Ok(());
    }

    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("No fue posible iniciar la migracion del cache legado: {error}"))?;

    for (key, value) in legacy_cache {
        let serialized_value = serde_json::to_string(&value)
            .map_err(|error| format!("No fue posible serializar un valor legado para SQLite: {error}"))?;

        transaction
            .execute(
                "INSERT OR REPLACE INTO desktop_cache (cache_key, cache_value) VALUES (?1, ?2)",
                params![key, serialized_value],
            )
            .map_err(|error| format!("No fue posible migrar una entrada de cache a SQLite: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("No fue posible confirmar la migracion del cache legado: {error}"))?;

    rename_legacy_cache_file(app)?;
    Ok(())
}

fn open_cache_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = sqlite_cache_file_path(app)?;
    let connection = Connection::open(db_path)
        .map_err(|error| format!("No fue posible abrir la base SQLite local: {error}"))?;

    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS desktop_cache (
                cache_key TEXT PRIMARY KEY,
                cache_value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            ",
        )
        .map_err(|error| format!("No fue posible inicializar el cache SQLite local: {error}"))?;

    migrate_legacy_cache_if_needed(app, &connection)?;
    Ok(connection)
}

#[tauri::command]
fn desktop_cache_get(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let connection = open_cache_db(&app)?;
    let raw_value: Option<String> = connection
        .query_row(
            "SELECT cache_value FROM desktop_cache WHERE cache_key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("No fue posible leer un valor del cache SQLite: {error}"))?;

    match raw_value {
        Some(raw) => {
            let parsed = serde_json::from_str::<Value>(&raw)
                .map_err(|error| format!("No fue posible interpretar un valor del cache SQLite: {error}"))?;
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn desktop_cache_set(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let connection = open_cache_db(&app)?;
    let serialized_value = serde_json::to_string(&value)
        .map_err(|error| format!("No fue posible serializar un valor para el cache SQLite: {error}"))?;

    connection
        .execute(
            "
            INSERT INTO desktop_cache (cache_key, cache_value, updated_at)
            VALUES (?1, ?2, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE SET
                cache_value = excluded.cache_value,
                updated_at = CURRENT_TIMESTAMP
            ",
            params![key, serialized_value],
        )
        .map_err(|error| format!("No fue posible guardar un valor en el cache SQLite: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_cache_get, desktop_cache_set])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
