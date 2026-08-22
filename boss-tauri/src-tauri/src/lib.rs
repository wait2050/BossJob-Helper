mod storage;

use tauri::{LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, WebviewUrl, Manager};
use tauri::window::WindowBuilder;
use tauri::webview::WebviewBuilder;

const SELECTORS_JS: &str = include_str!("../scripts/selectors.js");
const CONTENT_SEARCH_JS: &str = include_str!("../scripts/content-search.js");
const CONTENT_CHAT_JS: &str = include_str!("../scripts/content-chat.js");
const BACKGROUND_JS: &str = include_str!("../scripts/background.js");

// 布局自适应更新函数:使用真实的物理像素进行 Webview 边界分割，兼容 Windows 高 DPI (125%/150%/200%) 与窗口最大化缩放
fn layout_webviews(app_handle: &tauri::AppHandle, physical_size: PhysicalSize<u32>, scale: f64) {
    let panel_width_logical = 380.0_f64;
    let panel_width_physical = (panel_width_logical * scale).round() as u32;
    let boss_width_physical = physical_size.width.saturating_sub(panel_width_physical);

    if let Some(boss) = app_handle.get_webview("boss-webview") {
        let _ = boss.set_position(PhysicalPosition::new(0, 0));
        let _ = boss.set_size(PhysicalSize::new(boss_width_physical, physical_size.height));
    }
    if let Some(panel) = app_handle.get_webview("panel-webview") {
        let _ = panel.set_position(PhysicalPosition::new(boss_width_physical as i32, 0));
        let _ = panel.set_size(PhysicalSize::new(panel_width_physical, physical_size.height));
    }
}

#[tauri::command]
async fn navigate_to(app: tauri::AppHandle, url: String) -> Result<(), String> {
    // Get boss-webview and navigate it to the URL
    if let Some(webview) = app.get_webview("boss-webview") {
        let _ = webview.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
        Ok(())
    } else {
        Err("boss-webview not found".to_string())
    }
}

#[tauri::command]
async fn eval_in_boss(app: tauri::AppHandle, script: String) -> Result<serde_json::Value, String> {
    // 在 boss-webview 中执行 JS,通过 eval_with_callback 获取求值结果
    if let Some(webview) = app.get_webview("boss-webview") {
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let tx = std::sync::Arc::new(std::sync::Mutex::new(tx));
        webview
            .eval_with_callback(&script, move |result: String| {
                if let Ok(tx) = tx.lock() {
                    let _ = tx.send(result);
                }
            })
            .map_err(|e| format!("Eval error: {}", e))?;
        // 在阻塞线程中等待 callback 结果(超时 30s),再在 async context 中接收
        let result_str = tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(30))
                .map_err(|e| format!("eval callback 超时或失败: {}", e))
        })
        .await
        .map_err(|e| format!("任务 join 失败: {}", e))??;
        eprintln!("[eval_in_boss] callback 返回原始字符串: {:?}", result_str);
        // result_str 是 JS 求值结果的 JSON 序列化;parse 成 Value
        let parsed: serde_json::Value = serde_json::from_str(&result_str)
            .unwrap_or(serde_json::Value::String(result_str));
        Ok(parsed)
    } else {
        Err("boss-webview not found".to_string())
    }
}

#[tauri::command]
async fn inject_content_search(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("boss-webview") {
        webview.eval(CONTENT_SEARCH_JS).map_err(|e| format!("Inject error: {}", e))?;
        Ok(())
    } else {
        Err("boss-webview not found".to_string())
    }
}

#[tauri::command]
async fn inject_content_chat(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("boss-webview") {
        webview.eval(CONTENT_CHAT_JS).map_err(|e| format!("Inject error: {}", e))?;
        Ok(())
    } else {
        Err("boss-webview not found".to_string())
    }
}

#[tauri::command]
async fn inject_background(app: tauri::AppHandle) -> Result<(), String> {
    // Inject background.js (adapted) into the panel-webview context
    if let Some(webview) = app.get_webview("panel-webview") {
        webview.eval(BACKGROUND_JS).map_err(|e| format!("Inject error: {}", e))?;
        Ok(())
    } else {
        Err("panel-webview not found".to_string())
    }
}

use tauri::Emitter;

#[tauri::command]
async fn return_eval_result(app: tauri::AppHandle, result: serde_json::Value) -> Result<(), String> {
    app.emit("boss-eval-result", result).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            navigate_to,
            eval_in_boss,
            inject_content_search,
            inject_content_chat,
            inject_background,
            return_eval_result,
            storage::storage_get,
            storage::storage_set,
            storage::storage_remove
        ])
        .setup(|app| {
            let width = 1400.0_f64;
            let height = 900.0_f64;
            let panel_width = 380.0_f64;
            let boss_width = width - panel_width;

            // Create main window (no default webview)
            let window = WindowBuilder::new(app, "main")
                .title("Boss海投助手 - 桌面版")
                .inner_size(width, height)
                .min_inner_size(900.0, 600.0)
                .build()?;

            // Left: Boss Zhipin webview
            // macOS WKWebView 用 data_store_identifier(UUID) 创建持久化数据存储,cookie/localStorage 跨重启保留
            // 固定 UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
            let boss_store_id: [u8; 16] = [
                0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6, 0x78, 0x90,
                0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x90,
            ];
            let boss_webview = window.add_child(
                WebviewBuilder::new(
                    "boss-webview",
                    WebviewUrl::External("https://www.zhipin.com/web/geek/job".parse().unwrap()),
                )
                .data_store_identifier(boss_store_id)
                .initialization_script(SELECTORS_JS)
                .initialization_script(CONTENT_SEARCH_JS)
                .initialization_script(CONTENT_CHAT_JS),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(boss_width, height),
            )?;

            // Right: Sidepanel webview
            let panel_webview = window.add_child(
                WebviewBuilder::new(
                    "panel-webview",
                    WebviewUrl::App("sidepanel.html".into()),
                ),
                LogicalPosition::new(boss_width, 0.0),
                LogicalSize::new(panel_width, height),
            )?;

            // 立即使用实际窗口的 inner_size 尺寸执行物理像素级精确定位
            let initial_scale = window.scale_factor().unwrap_or(1.0);
            if let Ok(inner) = window.inner_size() {
                layout_webviews(&app.handle(), inner, initial_scale);
            } else {
                let _ = boss_webview.set_position(LogicalPosition::new(0.0, 0.0));
                let _ = boss_webview.set_size(LogicalSize::new(boss_width, height));
                let _ = panel_webview.set_position(LogicalPosition::new(boss_width, 0.0));
                let _ = panel_webview.set_size(LogicalSize::new(panel_width, height));
            }

            // 开发模式自动打开 panel-webview 的 devtools 便于调试
            #[cfg(debug_assertions)]
            {
                let _ = panel_webview.open_devtools();
            }

            // Handle window resize and scale factor changes to dynamically adjust webview sizes
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(physical_size) => {
                    if let Some(main_win) = app_handle.get_window("main") {
                        let scale = main_win.scale_factor().unwrap_or(1.0);
                        layout_webviews(&app_handle, *physical_size, scale);
                    }
                }
                tauri::WindowEvent::ScaleFactorChanged { scale_factor, new_inner_size, .. } => {
                    layout_webviews(&app_handle, *new_inner_size, *scale_factor);
                }
                _ => {}
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

