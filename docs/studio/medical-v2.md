# Lecteur médical V2 — 10 septembre 2026

Le mode médical actif utilise la base 4B pour sélectionner des identifiants.
Le logiciel affiche les unités documentaires complètes, avec leurs conditions,
leurs populations, leurs dates et leurs références. 51 unités dans 12 PDF HAS.
Aucun adaptateur LoRA actif ; le profil V1 reste conservé.

Résultat documentaire sur 24 nouvelles questions figées : 0 erreur, 18 réponses
attendues et 6 refus justifiés. Ce résultat limité ne certifie pas l’exactitude
clinique et ne garantit pas au maximum une erreur pour les futures questions.

## Validation de livraison

23 tests du projet médical et 49 tests Studio réussis ; TypeScript, Vite et
Tauri compilés. Bundle signé ad hoc, vérifié puis installé dans
`/Applications/klody-ui.app`. Base et artefacts actifs vérifiés par SHA-256.
Le moteur Studio seul a été rechargé, sans redémarrer les autres services.

Deux contrôles réels : question dans l’application sur les critères nécessaires
de dénutrition et refus via l’API locale d’une recommandation NICE absente.
Les deux résultats ont été ouverts et vérifiés dans l’application. La page
Évaluer affiche 0/24 avec 18 réponses et 6 refus, ainsi que les limites.
Les 40 tâches Studio antérieures sont inchangées ; les six modèles sont
accessibles. L’ancienne réponse médicale conserve son étiquette V1.

Preuves : `/Users/klodynlov/Projets/LibraryBrainMedical/experiments/20260910-reader-v2/native-smoke-test.json`.
Rapport documentaire : `/Users/klodynlov/Projets/LibraryBrainMedical/reports/epuration-medicale-v2.md`.

## Conservation et retour à la version précédente

L’application antérieure est sauvegardée dans
`docs/studio/backups/klody-ui-before-reader-v2-20260910.app`.
Les anciens fichiers de sélection de modèle et d’interface sont conservés dans
`LibraryBrainMedical/experiments/20260910-reader-v2/previous-integration/`.
Les moteurs `medical_model.py` et `medical_worker.py`, le profil V1 et les poids
LoRA n’ont pas été effacés. Un retour à V1 demanderait de restaurer le registre
Studio et le bundle ensemble, puis de recharger le seul moteur Studio.
