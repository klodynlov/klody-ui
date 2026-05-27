# Klody UI

Application native macOS + web pour [Klody Code AI](https://github.com/klodynlov/klody-code-ai) —
chat avec un agent de coding local, visualisation des décisions du router et
des actions exécutées en temps réel.

> **Status** : v2.1 — light theme warm, composants v2 (router/sandbox/best-of-N/conventions),
> auto-spawn backend en mode Tauri natif.

---

## Stack

| Composant | Tech |
|---|---|
| Frontend | **React 19** + **TypeScript 5.8** |
| Styling | **Tailwind CSS 4** (utility classes + CSS vars du theme) |
| Bundler | **Vite 7** |
| Desktop | **Tauri 2** (Rust + WebView macOS) |
| Markdown | `react-markdown` |
| Communication backend | **WebSocket** (`ws://localhost:8000/api/ws`) + REST `GET /api/status` |

---

## Installation

```bash
git clone https://github.com/klodynlov/klody-ui.git
cd klody-ui
npm install
```

Prérequis :
- Node 20+
- Rust toolchain (pour Tauri) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Backend Klody Code AI lancé sur `http://localhost:8000` ([repo backend](https://github.com/klodynlov/klody-code-ai))

---

## Lancement

```bash
# Mode web — Vite dev server sur http://localhost:1420
npm run dev

# Mode app native macOS (auto-spawn du backend Python)
npm run tauri dev

# Build de production
npm run tauri build
```

L'app Tauri native **auto-spawn le backend FastAPI** au démarrage et le tue à
la fermeture (cf `src-tauri/src/lib.rs`). Plus besoin de lancer
`python api/server.py` manuellement.

Le backend est résolu via :
1. Variable d'env `KLODY_DIR` si définie
2. Sinon, sibling du dossier de l'exécutable Tauri (layout `~/Projets/klody-code-ai`)

---

## Theme — palette « exposition longue »

Couleurs warm low-saturation (lin / terra cotta / sauge / ocre) pensées pour
regarder l'app pendant des heures sans fatigue oculaire. Centralisé dans
[`src/theme.ts`](src/theme.ts) et exposé en CSS vars via `@theme` Tailwind 4
dans [`src/index.css`](src/index.css).

| Token | Couleur |
|---|---|
| `bg` | `#f7f3eb` (lin clair) |
| `text` | `#3d3530` (terre brûlée) |
| `primary` | `#a87651` (terra cotta) |
| `success` | `#7a8b5a` (olive sauge) |
| `warning` | `#c2922c` (ocre) |
| `danger` | `#a85a4f` (rust) |
| `accentViolet` / `accentCyan` / `accentAmber` | accents Klody (mauve / teal / bronze) |

---

## Composants

### Lib UI primitives ([`src/components/ui/`](src/components/ui))

Bootstrap-like en Tailwind utility classes :

- **Button** : 5 variants (`primary`, `secondary`, `ghost`, `danger`, `success`) × 3 sizes
- **Badge** : 9 tons sémantiques pour labels courts
- **Card** : 9 tons + option `borderLeft` (3px) pour les meta-events
- **Alert** : 4 tons (`info`, `success`, `warning`, `danger`) avec icône
- **Chip** : 9 tons + `onRemove` optionnel

### Composants v2 — events backend ([`src/components/v2/`](src/components/v2))

Affichent les 4 events nouveaux émis par l'orchestrator :

- **RouterChip** — badges `hard / feature / max_iter=10 / planner / best-of-N` + reasoning
- **SandboxCard** — PASS/FAIL collapsible avec stderr en monospace rouge
- **BestOfNDrawer** — N candidats repliables, winner highlight, reasoning du judge
- **ProjectPanel** — onglet Sidebar : backend (MLX/Ollama), modèle actif, MCP server, conventions auto-détectées, erreurs récurrentes

### Composants principaux

- **Header** — wordmark serif "Klody AI", status dot dynamique (MLX/Ollama), modèle tronqué, "X messages"
- **Sidebar** — 3 onglets (Sessions / Mémoire / Projet) + recherche + export Markdown par session
- **ChatPanel** — avatars circulaires `K` / `U`, bulles user à droite, Klody en flow pleine largeur (style Claude/ChatGPT), stats `⏱ Xs · ~Y tok` inline header, bouton "↑ Haut" flottant
- **InputBar** — textarea auto-resize, attachement fichier 50 Ko max, bouton primary envoyer / danger stop

---

## Architecture WebSocket

```
UI                            API (port 8000)
 │                             │
 │── connect WS ─────────────►│
 │◄── session_init ────────────│
 │◄── conventions_loaded ──────│   (project info à l'init)
 │── send {type:"chat"} ────►│
 │                             ▼
 │                          Orchestrator (thread)
 │                             │
 │◄── router_decision ─────────│   (Roadmap #4)
 │◄── best_of_n ───────────────│   (Roadmap #7, si hard)
 │◄── thinking ────────────────│
 │◄── token (×N) ──────────────│   streaming
 │◄── stream_end ──────────────│
 │◄── tool_call ───────────────│   pour chaque outil invoqué
 │◄── tool_result ─────────────│
 │◄── sandbox_check ───────────│   (Roadmap #3, auto-exec après write_file .py)
 │◄── message_stats ───────────│   (latence + tokens)
 │◄── done ────────────────────│
```

Tous les events sont typés dans [`src/hooks/useAgent.ts`](src/hooks/useAgent.ts).

---

## Notes React 19

Le `<React.StrictMode>` est **désactivé** dans [`src/main.tsx`](src/main.tsx) :
en React 19 dev, il double-monte les `useEffect`, ce qui ouvre 2 WebSockets
simultanément → messages orphelins côté serveur quand l'orchestrator pousse.

À réactiver pour le build production (où StrictMode est no-op à l'exécution).

Le hook `useAgent` utilise aussi un flag `isUnmounting` pour empêcher le
reconnect 3s automatique au moment d'un unmount volontaire (cleanup useEffect).

---

## Build production

```bash
npm run tauri build
# → src-tauri/target/release/bundle/macos/Klody.app
# → src-tauri/target/release/bundle/dmg/Klody_X.Y.Z_aarch64.dmg
```

L'app finale embarque le binaire Rust + le bundle Vite. Au lancement, elle
auto-spawn le backend Python (qui doit donc être installé sur la machine
cible — voir [klody-code-ai](https://github.com/klodynlov/klody-code-ai)).

---

## Licence

Usage personnel, non commercial.
