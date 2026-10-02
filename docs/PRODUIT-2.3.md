# Klody UI 2.3 — interactions fiables

Le moteur Klody Code AI savait poser une question via `question_request`, mais
l'interface ne traitait pas cet événement. L'utilisateur ne voyait pas la carte
attendue, alors que le moteur attendait une réponse. La version 2.3 raccorde ce
parcours et fiabilise les opérations qui pouvaient afficher un résultat trompeur.

## Changements livrés

- Questions interactives : choix ou texte libre, réponse `question_response`,
  état envoyé, expiration et interruption visibles. Une carte ne soumet sa
  réponse qu'une fois ; aucun choix automatique. La saisie principale peut
  répondre à une question libre. Un changement de session attend la fin du tour,
  y compris après une demande d'arrêt.
- Opérations REST : délais bornés, contrôle du statut HTTP **et** du champ `ok`
  pour supprimer, renommer, archiver, oublier et arrêter. L'interface ne marque
  plus ces opérations réussies après un refus. Le titre normalisé du serveur
  est pris en compte.
- Transport : un envoi refusé localement conserve texte et pièces jointes ;
  les événements illisibles sont signalés ; les callbacks des anciennes
  connexions sont ignorés ; la session provisoire du handshake ne remplace pas
  celle en cours de reprise.
- Brouillons texte : stockage par session dans `sessionStorage`, restauration
  après rechargement. Ils restent dans cet onglet/webview et ne constituent pas
  une sauvegarde durable. Les pièces jointes ne sont pas persistées.
- Réglages : validation par le serveur avant changement de l'état affiché,
  une seule écriture en vol, nombres appliqués explicitement par OK/Entrée,
  fermeture et réouverture protégées contre les réponses tardives.
- Accessibilité : dialogue modal natif, focus contenu puis restauré, Échap,
  libellés accessibles, focus clavier visible et animations réduites.
- Fenêtres étroites : navigation repliable à moins de 760 px ; minimum natif
  abaissé à 600 px. La saisie respecte la composition IME.
- Stockage indisponible : son refus ne fait plus échouer le thème ou le chat.

Aucune nouvelle dépendance applicative. Pas de modification du modèle,
de l'orchestrateur ou des services en cours d'exécution.

## Vérification

- `npm run build` : TypeScript strict et bundle de production validés.
- `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_NO_VIDEO=1 npm run test:e2e -- --workers=2` :
  **29 tests passent**, dont 19 scénarios de fiabilité ajoutés.
- Les requêtes non simulées sont bloquées par les fixtures. Les tests ne parlent
  pas à la vraie API, même si elle écoute sur le port 8000.
- Comparaison sur une copie temporaire de `HEAD` avant modification : cinq
  régressions reproduites (question invisible, brouillon effacé si socket
  fermée, suppression/archivage sans erreur visible, arrêt refusé non signalé).
  Six scénarios avaient été exécutés : 5 rouges, 1 vert. Le contrôle initial
  de reprise a ensuite été renforcé pour attendre le rendu React.
- Backend associé, inchangé : **40 tests ciblés passent** (`test_ask_user.py`,
  `test_status_backend.py`, `integration/test_websocket_chat.py`). Ce n'est pas
  une exécution de toute sa suite ni un benchmark des modèles.
- `CARGO_NET_OFFLINE=true npm run tauri -- build --bundles app` : compilation
  native et bundle macOS, sans mise à niveau de dépendances.

Le protocole actuel ne possède pas d'accusé de réception persistant des messages
chat. Un `send()` réussi signifie mise en file par le navigateur, pas exécution
confirmée par le serveur. Aucune relance automatique des messages n'est ajoutée :
elle pourrait exécuter deux fois une action. Une file persistante idempotente
nécessite un contrat commun au backend et au frontend.

## Installation et retour arrière

Le bundle se trouve dans `src-tauri/target/release/bundle/macos/klody-ui.app`.
Il est construit localement ; la notarisation et le parcours sur une machine
vierge n'ont pas été validés. L'app installée dans Applications n'est pas remplacée.
Le backend local existant reste nécessaire.

Les changements source sont sur `codex/fiabilite-produit-2026-09-05`, sans commit
ni push automatique. Le code antérieur demeure dans `main`. Le bundle généré
est une sortie de build, distincte de l'installation existante.

## Étapes suivantes vers un produit distribué

| Axe | Travail restant | Critère d'acceptation proposé |
|---|---|---|
| Installation | Assistant de diagnostic, configuration portable des endpoints, contrôle versions/modèles | Installation reproductible sur un second Mac, sans modification manuelle de chemins |
| Résilience | Identifiant de requête, accusé de réception durable, reprise/rejeu idempotent, annulation par exécution | Aucune exécution doublée dans des tests de coupure avant/après réception |
| Sécurité | Revue du périmètre loopback/IPC, CSP Tauri (actuellement `null`), exposition réseau et permissions d'outils | Politique explicite et tests des scénarios de menace retenus |
| Qualité IA | Bench représentatif des usages retenus, provenance modèle, critères de qualité et refus | Résultats reproductibles par tâche, qualité mesurée indépendamment de l'interface |
| Performance | Mesurer premier token, durées p50/p95, mémoire et longues conversations | Budget publié sur un matériel de référence, avant/après au même protocole |
| Données | Sauvegarde/restauration de sessions et mémoire, migrations versionnées | Restauration testée dans un dossier indépendant avec intégrité vérifiée |
| Distribution | Signature, notarisation, mise à jour signée et retour arrière | Installation, mise à jour et récupération testées hors machine de développement |
| Produit | Choisir un segment et 3 parcours prioritaires avec utilisateurs pilotes | Usages récurrents observés et problèmes résolus, sans supposer la demande |

Ces étapes sont un backlog concret, pas des capacités annoncées comme livrées.
