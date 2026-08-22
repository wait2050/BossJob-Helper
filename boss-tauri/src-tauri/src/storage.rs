use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use serde_json::{Value, Map};

fn get_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|mut path| {
            path.push("storage.json");
            path
        })
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))
}

fn read_storage(path: &PathBuf) -> Map<String, Value> {
    if path.exists() {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(Value::Object(map)) = serde_json::from_str(&content) {
                return map;
            }
        }
    }
    Map::new()
}

fn write_storage(path: &PathBuf, data: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    let content = serde_json::to_string(data).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn storage_get(app: AppHandle, keys: Vec<String>) -> Result<Value, String> {
    let path = get_storage_path(&app)?;
    let storage = read_storage(&path);
    let mut result = Map::new();
    
    if keys.is_empty() {
        // Return all if no specific keys are requested (similar to some chrome APIs)
        for (k, v) in storage.iter() {
            result.insert(k.clone(), v.clone());
        }
    } else {
        for key in keys {
            if let Some(value) = storage.get(&key) {
                result.insert(key, value.clone());
            }
        }
    }
    Ok(Value::Object(result))
}

#[tauri::command]
pub fn storage_set(app: AppHandle, data: Value) -> Result<(), String> {
    let path = get_storage_path(&app)?;
    let mut storage = read_storage(&path);
    
    let map = match data {
        Value::Object(m) => m,
        Value::String(s) => {
            if let Ok(Value::Object(m)) = serde_json::from_str(&s) {
                m
            } else {
                Map::new()
            }
        }
        _ => Map::new(),
    };

    for (k, v) in map {
        storage.insert(k, v);
    }
    write_storage(&path, &storage)?;
    
    Ok(())
}

#[tauri::command]
pub fn storage_remove(app: AppHandle, keys: Vec<String>) -> Result<(), String> {
    let path = get_storage_path(&app)?;
    let mut storage = read_storage(&path);
    let mut changed = false;
    
    for key in keys {
        if storage.remove(&key).is_some() {
            changed = true;
        }
    }
    
    if changed {
        write_storage(&path, &storage)?;
    }
    
    Ok(())
}
