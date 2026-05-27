use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent};

struct BackendProcess(Mutex<Option<Child>>);

fn is_port_listening(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        Duration::from_secs(1),
    )
    .is_ok()
}

fn is_backend_running() -> bool {
    is_port_listening(8000)
}

fn is_mlx_running() -> bool {
    is_port_listening(8080)
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

/// Lance le serveur MLX-LM en arrière-plan détaché (le LLM tourne au-delà de la vie de l'app).
/// Ne bloque pas le démarrage de la fenêtre — l'UI affichera "Backend déconnecté" tant que
/// MLX n'a pas chargé le modèle 30B (~30-60s).
fn spawn_mlx(klody_dir: &str) {
    let script = format!("{klody_dir}/scripts/start-mlx.sh");
    if !std::path::Path::new(&script).exists() {
        eprintln!("[Klody] start-mlx.sh introuvable: {script}");
        return;
    }
    match Command::new(&script)
        .current_dir(klody_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => eprintln!("[Klody] MLX server lancé (port 8080, ~30-60s pour le modèle)"),
        Err(e) => eprintln!("[Klody] Échec lancement MLX: {e}"),
    }
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
            let klody_dir = find_klody_dir();

            if !is_mlx_running() {
                spawn_mlx(&klody_dir);
            }

            if !is_backend_running() {
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
