# Réponses françaises par défaut — 18 septembre 2026

Le lecteur médical prépare désormais la traduction française avant de terminer une réponse. Le nouveau worker `medical_french_worker.py` enveloppe le lecteur V8 évalué sans modifier ses fichiers figés, ses sources ni son profil. Les autres spécialistes possédaient déjà une consigne de réponse en français.

Le texte anglais n’est pas publié comme réponse pendant la préparation. La traduction existante conserve ses contrôles numériques, sa relecture par le modèle et ses deux tentatives maximum. Un échec renvoie un message en français, conserve les extraits originaux et permet une nouvelle tentative. Les documents restent des données, jamais des instructions.

Le résultat contient la réponse française, la réponse originale séparée et les sources inchangées. Les anciennes réponses se traduisent automatiquement lorsqu’elles sont ouvertes dans la nouvelle interface, sans réécriture de leurs fichiers. Le bouton « Afficher l’original » reste disponible.

Validation : 43 tests Python ciblés et 4 tests navigateur avec Chrome réussis ; TypeScript/Vite et Tauri compilés. La question réelle « douleur aux oreilles » a terminé en 31,104 s, avec une réponse française et la source originale `LB:19091:1758239:paragraph1`. Affichage français vérifié dans le navigateur et l’application native installée. Les 60 réponses antérieures et toutes les modifications préexistantes hors des quatre fichiers ciblés sont intactes.

La traduction est automatique : ces tests vérifient le comportement logiciel et un exemple réel, sans constituer une validation clinique ni une nouvelle évaluation complète de la traduction. Les scores V8 existants concernent toujours le lecteur documentaire d’origine.

Le service Studio a été rechargé à vide. Le bundle natif a été signé localement, installé et rouvert sur la réponse française. L’ancienne application est conservée sous `../backups/klody-ui-before-french-default-20260918.app`, et les sources antérieures sous `../backups/french-default-20260918/`. Le patch ci-joint isole ce correctif des nombreuses modifications préexistantes non commitées du Studio.
