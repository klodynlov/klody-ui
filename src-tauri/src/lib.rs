use std::net::TcpStream;
use std::process::{Child, Command};
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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Relance l'API backend possédée par le LaunchAgent `com.klody.api`.
///
/// Auto-remédiation SUPERVISÉE (le cockpit se répare tout seul) : quand le front
/// n'arrive plus à reconnecter le WebSocket au-delà du palier d'escalade, il
/// appelait jusqu'ici l'humain à taper `launchctl kickstart` à la main. On le
/// fait désormais nous-mêmes. L'action est **réversible** : le service est
/// `RunAtLoad` + `KeepAlive`, `kickstart -k` ne fait que le tuer puis le
/// relaisser relancer par launchd — jamais de suppression ni d'état perdu.
///
/// Aucune entrée utilisateur n'est interpolée dans la commande (chaîne figée),
/// donc pas de surface d'injection. `gui/$(id -u)` est résolu par le shell : une
/// app GUI lancée par le Finder/launchd n'a pas d'UID fiable en variable d'env,
/// mais `id -u` le donne toujours. Chemins absolus (`/bin/launchctl`,
/// `/usr/bin/id`) car une app GUI hérite d'un `PATH` minimal.
#[tauri::command]
fn kickstart_backend() -> Result<String, String> {
    let out = Command::new("/bin/sh")
        .arg("-c")
        .arg("/bin/launchctl kickstart -k gui/$(/usr/bin/id -u)/com.klody.api")
        .output()
        .map_err(|e| format!("launchctl introuvable : {e}"))?;
    if out.status.success() {
        Ok("com.klody.api relancé".into())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() {
            format!("launchctl a échoué (code {:?})", out.status.code())
        } else {
            err
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|_app| {
            // L'app NE démarre AUCUN service : ni l'API :8000, ni le serveur MLX
            // :8080. Les deux sont possédés par des LaunchAgents (com.klody.api ;
            // core-gateway pour le worker brain MLX :8080), RunAtLoad + KeepAlive.
            //
            // Historique du bug MLX (même faille que celle déjà corrigée pour :8000) :
            // l'app faisait `if !is_mlx_running() { spawn_mlx() }` — un check de port
            // TOCTOU. Au boot à froid le worker gateway charge encore le modèle 35B
            // (~30-60 s, :8080 pas encore en écoute) → l'app lançait un SECOND MLX →
            // course sur :8080 (« Errno 48 Address already in use ») + deux modèles
            // 35B en RAM → tempête mémoire qui affamait l'API :8000, d'où le banner
            // « Backend indisponible » à CHAQUE démarrage après reboot. Owner unique
            // = LaunchAgent. Le front reconnecte le WebSocket tout seul (useAgent.ts).
            if !is_backend_running() {
                eprintln!(
                    "[Klody] API :8000 pas encore prête — gérée par le LaunchAgent \
                     com.klody.api (en cours de chargement ou déchargée). Le front \
                     reconnectera automatiquement le WebSocket."
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, kickstart_backend])
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
