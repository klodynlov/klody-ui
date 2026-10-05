# Médical V8 — disponibilité rétablie le 17 septembre 2026

Le catalogue affichait « en préparation » car trois composants partagés de LibraryBrain avaient changé depuis l’évaluation V8 : prompt_builder.py, retriever.py et generator.py. Les poids, le profil V8, les sources et les artefacts d’évaluation étaient intacts.

Les 25 fichiers Python de LibraryBrain enregistrés dans le profil sont maintenant copiés dans `LibraryBrainMedical/runtime/reader-v8/library-brain`. Chaque copie correspond exactement à son empreinte d’origine. Les versions de prompt_builder et retriever proviennent du commit 3990eae ; generator a été reconstitué en retirant uniquement l’ajout ultérieur des métadonnées de sources, puis vérifié par son SHA-256 d’origine. Le contrôle des empreintes est conservé : une copie absente ou altérée bloque le lecteur. La configuration utilisateur continue à être lue par un lien vers le config.yaml existant.

Le profil active ces imports dans les processus de réponse et de traduction. Le catalogue vérifie les fichiers sans changer les imports du serveur. Les dépendances déjà chargées depuis un autre emplacement sont refusées. Le worker, le profil et le code médical évalués restent identiques ; LibraryBrain conserve ses mises à jour.

L’interface distingue désormais « indisponible » d’une préparation et montre la cause réelle. L’API renvoie également cette cause. Le service Studio a été rechargé à vide, les 60 opérations antérieures sont inchangées. Le site et l’application native sont mis à jour ; la session native ouverte n’a pas été fermée.

Validation : 39 tests Python réussis et un test navigateur de panne/rétablissement avec conservation du brouillon. TypeScript, Vite et Tauri compilés ; application signée ad hoc et signature vérifiée. Recherche réelle « Préeclampsie » terminée, source LB:15106:1695864:paragraph1 : empreinte du texte correcte et copie exacte du passage indexé. Réponse et bouton d’envoi vérifiés dans le Studio.

Limite du passage de tests : le contrôle de compatibilité de l’ancien V7 échoue déjà sur ses dépendances partagées modifiées. Il reste hors de cette réparation V8 et a été exclu du passage ciblé ; aucune disponibilité de V7 n’est revendiquée.

Preuves et patch : `/Users/klodynlov/Projets/LibraryBrainMedical/experiments/20260917-v8-availability-fix/`.
Sauvegarde native : `docs/studio/backups/klody-ui-before-v8-availability-20260917.app`.
Sources originales des trois fichiers modifiés : `experiments/20260917-v8-availability-fix/before/` dans le projet médical. Pour un retour complet, restaurer ces fichiers, les anciens assets dist et le bundle sauvegardé, puis recharger uniquement le service Studio lorsqu’il est inactif. Les dépendances isolées sont additives et peuvent rester présentes.
