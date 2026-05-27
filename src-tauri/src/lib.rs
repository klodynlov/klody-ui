use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

/// Vérifie si le backend Klody répond sur le port 8000.
fn is_backend_running() -> bool {
    TcpStream::connect_timeout(
        &"127.0.0.1:8000".parse().unwrap(),
        Duration::from_secs(1),
    )
    .is_ok()
}

/// Cherche le dossier klody-code-ai :
/// 1. Variable d'environnement KLODY_DIR
/// 2. Sibling du dossier parent de l'exécutable (layout Projets/)
fn find_klody_dir() -> String {
    if let Ok(dir) = std::env::var("KLODY_DIR") {
        if std::path::Path::new(&dir).exists() {
            return dir;
        }
    }
    // Heuristique : chercher klody-code-ai dans les ancêtres du binaire
    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("klody-code-ai");
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
        }
    }
    // Fallback absolu
    "/Users/klodynlov/Projets/klody-code-ai".to_string()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            if !is_backend_running() {
                let klody_dir = find_klody_dir();

                // Préférer le python du venv
                let venv_py = format!("{klody_dir}/.venv/bin/python3");
                let python = if std::path::Path::new(&venv_py).exists() {
                    venv_py
                } else {
                    "python3".to_string()
                };

                match Command::new(&python)
                    .arg("api/server.py")
                    .current_dir(&klody_dir)
                    .spawn()
                {
                    Ok(child) => {
                        *app.state::<BackendProcess>().0.lock().unwrap() = Some(child);
                        // Laisser le serveur démarrer
                        std::thread::sleep(Duration::from_secs(3));
                    }
                    Err(e) => {
                        eprintln!("[Klody] Impossible de démarrer le backend: {e}");
                        eprintln!("[Klody] Répertoire: {klody_dir}");
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                // Arrêter proprement le backend à la fermeture de l'app
                if let Ok(mut guard) = app_handle.state::<BackendProcess>().0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                };
            }
        });
}
