# Atelier musique local — 22 septembre 2026

L’atelier est accessible à `http://127.0.0.1:8018/#music`. Il ajoute un parcours de travail par morceau au Studio existant. Les liens Juridique et Médical ouvrent les lecteurs V3 et V8 existants ; leur pipeline n’a pas été remplacé.

## Fonctions livrées

- Fiches de morceaux, intentions, contexte, décisions et conversations persistantes.
- Préférences de travail explicites, communes aux prochaines demandes et modifiables par l’utilisateur.
- Structure, équilibre du mix, comparaison de traitements et analyse des documents du projet.
- Import local PDF contenant du texte, DOCX, TXT et Markdown. Les sources portent le nom du fichier et la page ou le passage.
- Import WAV, MP3, M4A, FLAC, AIFF et OGG. FFmpeg mesure la durée, la sonie intégrée, la crête vraie et la plage de sonie, sans modifier l’original. Écoute de l’original dans le navigateur.
- Références issues de trois méthodes LibraryBrain, avec contrôle des empreintes des sept passages originaux.
- Export du dossier en Markdown, avec les demandes, réponses, sources, fichiers, décisions et repères de durée.
- Brouillons conservés, envois idempotents, révisions des fiches et préférences pour empêcher l’écrasement depuis une ancienne fenêtre.

Les fonctions de référence observées chez Jef sont les dossiers, documents personnels, recherche sourcée, méthodes de travail, préférences et préparation de livrables : https://www.jef.chat/en/fonctionnalites. Cette sélection ne prouve pas les causes commerciales de son succès et ne prétend pas reproduire toutes ses fonctions.

## Architecture et données

Le service du Studio écoute uniquement sur `127.0.0.1:8018`. Les routes privées conservent la protection d’origine et l’en-tête `X-Klody-Studio: 1`. La génération utilise uniquement `http://127.0.0.1:8090/v1` et le modèle déjà disponible `unsloth/Qwen3.6-35B-A3B-MLX-8bit`, par le gestionnaire local Klody Core, sans proxy système, redirection ou repli cloud. Celui-ci réveille le worker 8080 à la demande et protège les requêtes actives contre le déchargement pour inactivité. Aucun nouvel entraînement ni téléchargement de poids.

Les données sont sous `~/Projets/KlodyModelStudio` : `music-projects.json`, `music-preferences.json`, `music-assets/<id>/`, et les dossiers de jobs existants. Chaque demande capture une copie de la fiche, des préférences et des passages retenus. Les cinq derniers échanges terminés du même morceau complètent ce contexte. Les décisions durables doivent être inscrites dans la fiche. Les réponses générées ne chargent pas d’images ou de liens externes.

Les imports passent par la file de travail existante. Maximum 60 Mo par fichier, 30 fichiers par projet et 15 minutes par fichier audio. Lecture des 100 premières pages PDF au maximum et de 200 000 caractères ; pas d’OCR. DOCX : paragraphes uniquement. La recherche sélectionne jusqu’à dix passages avec présence des fichiers représentés et trois analyses audio au maximum. Le périmètre de lecture est enregistré dans chaque réponse. Ce mécanisme lexical borné n’est pas une recherche sémantique exhaustive.

Les durées des structures sont calculées par Python, avec un tempo explicitement en noires par minute et une signature métrique. Exemples : 24 mesures de 4/4 à 90 noires/min = 64 secondes ; 28 mesures = 74,7 secondes. Le modèle exprime les formes en nombres de mesures. Une sortie contenant des secondes/minutes chiffrées est redemandée une fois puis bloquée si elle persiste. Les anciennes réponses conservent leur texte mais affichent une réserve sur leurs conversions. Un BPM déclaré n’est jamais présenté comme une analyse du fichier audio.

## Vérification et limites

Les tests ciblent la persistance, l’isolation des projets, les conflits de révision, l’idempotence, les imports réels PDF/DOCX/TXT, une sinusoïde connue mesurée par FFmpeg, la file de processus réelle, les références inconnues, le contrôle des durées, l’export et la confidentialité du rendu Markdown. Les tests navigateur couvrent le rechargement, les brouillons, la reprise d’envoi, les préférences, les imports, l’export, les liens vers les lecteurs, le mobile et les images externes interdites.

Des générations réelles ont été réalisées avec le modèle local. Elles ont révélé des réponses trop longues, des formulations musicales approximatives et une erreur de conversion mesures/secondes. Les consignes ont été resserrées et les durées confiées au code. Les réponses restent des propositions expérimentales, pas une validation de qualité musicale. Les citations autorisées et les empreintes sont contrôlées ; leur présence ne prouve pas que chaque conclusion est fidèle à la source. Les mesures globales audio ne constituent pas une écoute par l’IA : pas de détection de tonalité, de BPM, d’instruments ni de génération de musique.

Les tests du runtime médical V8, des réponses françaises et du serveur existant passent. Le test juridique `test_missing_sources_refuse_without_loading_gpu` échoue aussi dans le dépôt d’origine, avant cette modification (`ValueError: not enough values to unpack`, `legal_worker.py:46`) ; il est documenté comme échec préexistant et n’a pas été modifié.

## Installation et retour arrière

Développement isolé dans `~/Projets/klody-ui-music-assistant`, branche `feat/local-music-assistant`, depuis un instantané du checkout local déjà modifié. Seuls les fichiers de cette fonctionnalité sont reportés dans `~/Projets/klody-ui` ; les modifications préexistantes restent intactes. Le bundle natif dans `/Applications` n’a pas été remplacé : cette livraison est accessible dans le navigateur local du Studio.

Sauvegarde des fichiers remplacés et du frontend initial : `~/Projets/KlodyModelStudio/backups/music-assistant-20260922/`. Le manifeste conserve les empreintes et les anciens jobs. Le retour arrière consiste à restaurer les anciens fichiers listés et `dist`, puis à relancer uniquement `com.klody.model-studio` après vérification qu’aucun job n’est actif. Conserver les fichiers de données musicaux et les résultats. Aucun résultat existant ne doit être supprimé pour revenir à l’ancienne interface.

## Livraison Git

La branche de PR `feat/music-workspace` est construite séparément depuis `origin/main` (`9a31ce8`), dans `~/Projets/klody-ui-music-pr`. Seul le diff de l’atelier est appliqué ; les modifications locales préexistantes ne font pas partie du commit. Les corpus, fichiers importés, conversations et transcriptions des essais restent sur le Mac. Le manifeste versionné contient les identifiants et empreintes des références, sans les chemins personnels des livres ni leur texte.

Prérequis du poste : Studio existant, Klody Core sur le port 8090 avec le modèle indiqué, base LibraryBrain locale contenant les références du manifeste, Python 3.11+ avec FastAPI/Pydantic 2, FFmpeg et pdftotext. Les routes ne téléchargent pas les éléments absents et expliquent les erreurs. Les tests Python isolés nécessitent aussi httpx, FFmpeg et Poppler, et utilisent des documents et sons synthétiques. Commande : `python -m unittest discover -s studio -p 'test_music*.py' -v`. Ils ont été exécutés localement. La CI existante exécute les tests navigateur ajoutés. L’ajout d’un workflow Python séparé n’a pas été publié, l’autorisation GitHub actuelle ne disposant pas du droit `workflow`.
