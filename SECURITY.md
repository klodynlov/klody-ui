# Politique de sécurité

## Versions supportées

Seule la branche `main` reçoit des correctifs de sécurité. Les anciennes
versions ne sont pas maintenues — utiliser le `HEAD` de `main`.

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique** pour une vulnérabilité de sécurité.

Utiliser le canal privé GitHub :

1. Aller sur https://github.com/klodynlov/klody-ui/security/advisories
2. Cliquer sur **"Report a vulnerability"**
3. Décrire le problème : impact, étapes de reproduction, version concernée

J'accuse réception sous **72h** et publie le correctif + l'advisory dans
les **30 jours** quand la vulnérabilité est confirmée.

## Périmètre

Klody UI est l'application Tauri + React + WebSocket qui consomme
[`klody-code-ai`](https://github.com/klodynlov/klody-code-ai) (backend).

Sont considérés comme vulnérabilités :

- **XSS** dans le rendu Markdown ou le code des previews.
- **Insecure IPC Tauri** : un message renderer → core qui exposerait
  des opérations hors capabilities déclarées.
- **CORS / WS** : un site tiers qui pourrait piloter le backend Klody via
  la WS sans CSRF token.
- **Stockage local non chiffré** de tokens / sessions sensibles.
- **Auto-spawn backend** : tout chemin d'exécution arbitraire au démarrage
  natif Tauri.

## Bonnes pratiques pour les contributeurs

- **Commits signés** : configurer GPG ou SSH signing
  (`git config commit.gpgsign true`).
- **Pas de secrets en clair** : utiliser `.env` (gitignored) ou des secrets
  GitHub Actions.
- **Capabilities Tauri** : revue obligatoire pour toute extension de
  `src-tauri/capabilities/*.json`.
- **CSP** : ne pas relâcher la `Content-Security-Policy` dans
  `src-tauri/tauri.conf.json` sans justification.

## Repo jacking

Le compte GitHub `klodynlov` est l'unique propriétaire des dépôts officiels :

- https://github.com/klodynlov/klody-code-ai
- https://github.com/klodynlov/klody-ui

Tout fork ou clone hébergé ailleurs n'est pas un release officiel.
