# Vérification de l’atelier musique — 22 septembre 2026

## Résultats techniques

- Build TypeScript/Vite réussi sur la branche de PR issue de `origin/main` (`9a31ce8`).
- 14 tests Python musique réussis : persistance, révisions, isolation, import réel TXT/PDF/DOCX, mesure FFmpeg d’une sinusoïde connue, conservation de l’original, file de processus, export, références et durées.
- 25 tests Python du serveur et du médical existants réussis (15 + 5 + 5).
- 21 tests navigateur réussis, sans nouvelle tentative lors du dernier passage. Le test d’import attend désormais que la fiche soit enregistrée et le sélecteur actif.
- Affichages bureau (1440 px) et mobile (390 px) examinés ; pas de débordement horizontal.

## Parcours réel sur le Mac

Le moteur Qwen3.6 35B était déchargé. Une demande par le gestionnaire local sur le port 8090 l’a réveillé et a produit une réponse terminée en 11 secondes. Le projet fictif « Démonstration — R&B à 90 BPM » contenait un brief TXT. La réponse a correctement restitué la décision d’alléger le piano pendant les phrases chantées et les trois contraintes du brief, avec la référence D1. Ce contrôle porte sur ce cas précis, pas sur la fiabilité générale du modèle.

L’export Markdown contient le brief, la réponse et sa référence. Les générations de structure ont aussi révélé une conversion mesures/secondes erronée : l’application calcule désormais séparément ces durées (24 mesures de 4/4 à 90 noires/min = 64 secondes ; 28 mesures = 74,7 secondes). Les anciennes réponses restent conservées avec une réserve visible.

Après activation, le catalogue des modèles est identique et les 80 anciens résultats ainsi que les 82 anciens jobs sont inchangés. Les empreintes et la sauvegarde de retour arrière sont conservées localement.

## Périmètre

Les tests ne prouvent pas la qualité musicale des propositions. Aucun enregistrement musical réel n’a été jugé à l’écoute dans cette validation. Le contrôle des identifiants de citation ne constitue pas une évaluation complète de fidélité. Le test juridique préexistant en échec est décrit dans le document d’installation.

Les résultats détaillés des essais, documents importés et extraits de livres restent locaux. La PR contient le code, des tests synthétiques et ce compte rendu, sans corpus ni conversations personnelles.
