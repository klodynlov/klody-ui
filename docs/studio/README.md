# Klody‑AI · Studio des modèles

Livré le 6 septembre 2026. Dans l’application Mac, ouvrir **✳ Studio des modèles**
dans la barre supérieure. Accès navigateur : <http://127.0.0.1:8018/#studio>.

## Parcours

- **Vue d’ensemble** : les deux pilotes, leur spécialité, le corpus et leur poids réel.
- **Discuter** : choisir LibraryBrain Research ou KlodyMusic, poser une question,
  consulter les extraits effectivement fournis au modèle, proposer une correction.
  Les échanges sont conservés localement ; les cinq derniers tours peuvent être
  fournis au modèle. La question est reformulée avec ce contexte avant une recherche française et anglaise.
- **Entraîner** : choisir un spécialiste, nommer le candidat, sélectionner 40,
  80 itérations ou environ une passe, lancer et consulter le suivi. L’entraînement
  repart de la base Qwen figée avec le corpus existant. Il ne s’agit pas d’un
  apprentissage continu à partir du dernier modèle. Les corrections restent en
  attente de révision ; aucun nouveau livre n’est distillé dans ce premier atelier.
- **Évaluer** : comparer les pilotes puis lancer, pour un candidat exporté, les
  mêmes tests à contexte fixé sur la base et sur ses poids. Les scores mesurent
  le contrat de réponse/citation, sans certifier l’exactitude factuelle.
- **Essayer** : depuis une version candidate, ouvrir une conversation qui charge
  précisément ses poids. Aucune promotion automatique ne remplace un pilote.

Le Studio traite une tâche GPU à la fois. Une conversation peut donc attendre la
fin d’un entraînement. Les travaux continuent lorsque la fenêtre est fermée.
Le bouton Arrêter termine le groupe de processus de l’opération. Une relance du
moteur marque les tâches inachevées comme interrompues, sans reprise silencieuse.

## Direction UI/UX

Une interface de travail, avec une typographie sobre, un fond anthracite et des
accents sauge pour Research et lavande pour Music. Le panneau de sources reste à
côté de la réponse sur bureau ; sur petite fenêtre, il s’ouvre dans une boîte de
dialogue accessible. Le lancement d’un entraînement présente le modèle, le corpus,
l’effort, l’espace disque nécessaire et la version de sortie avant l’action.

Les chiffres viennent des manifestes et rapports locaux. Les badges indiquent
explicitement le statut expérimental. Les états en attente, en cours, terminé,
annulé, interrompu et en échec sont distincts. Une erreur HTTP ne devient jamais
une notification de réussite.

## Place dans Klody‑AI

Le Studio est intégré à la même application. Les spécialistes 4B sont accessibles
par leur propre parcours documentaire. Le routeur de l’agent général n’a pas été
modifié : il ne délègue pas encore automatiquement à ces modèles.

Évolution recommandée : conserver le modèle général pour orchestrer les outils,
et lui ajouter une délégation explicite vers Research/Music, avec restitution des
preuves. Ensuite, introduire un atelier de corpus : sélection de nouveaux ouvrages,
contrôle des doublons et séparation des sources, distillation, révision des
corrections, puis validation avant entraînement. Enfin, permettre une promotion
réversible après comparaison et examen humain, avec retour à la version précédente.
Ces fonctions sont une proposition de suite, pas des boutons simulés dans la livraison.

## Architecture et exploitation

- UI : `src/components/studio/Studio.tsx` et `studio.css` ; entrée par `#studio`.
- API locale : `studio/server.py`, FastAPI sur **127.0.0.1:8018**. Elle sert aussi
  le frontend compilé. Origines autorisées explicites et en-tête requis pour l’API.
- Worker : `studio/worker.py`. `query_plan.py` résout la demande en contexte avec
  la base locale 4B ; `retrieve.py` recherche en français et en anglais, écarte les
  fragments de titre et conserve les seuils de pertinence existants. Un appareil
  explicitement nommé peut ajouter une recherche dans son manuel. La recherche
  et la génération MLX s’exécutent dans des processus distincts. Les sources renvoyées à l’interface sont
  celles de cette même recherche.
- État : `/Users/klodynlov/Projets/KlodyModelStudio/` (jobs, réponses, corrections,
  versions candidates et journaux). Les projets des deux modèles ne sont pas modifiés.
- Démarrage automatique : `~/Library/LaunchAgents/com.klody.model-studio.plist`.
- Runtime : `/Users/klodynlov/library-brain-env/bin/python`.

Chaque entraînement copie les scripts et le corpus figé dans son propre dossier,
vérifie les empreintes, apprend un nouvel adaptateur puis exporte ses poids.
Les données et poids restent sur le Mac. La génération n’exige aucun téléchargement.
Une version nouvelle consomme environ 4,27 Go de poids, plus ses données et rapports.

## Vérifications

- Compilation TypeScript/Vite et application Tauri réussies.
- 19 tests API et recherche : origines refusées, validation des entrées et versions,
  file bornée, annulation, persistance, interruption au redémarrage, isolement des
  versions, refus d’un corpus altéré, corrections hors du corpus d’entraînement.
- Navigation et rendu réels vérifiés à 1280 × 720 et 390 × 844 ; sources accessibles
  sur petite fenêtre ; connexion vérifiée dans l’application native installée.
- Question réelle à KlodyMusic avec trois passages renvoyés à l’interface.
- Entraînement réel de cinq itérations terminé et poids exportés dans le candidat
  `ea2b541ef49644e69f4239b5fd0ee08e` (vérification technique, pas une recommandation
  de remplacer v0.1). Son évaluation complète a été démarrée puis annulée
  volontairement après 20 réponses de base pour vérifier le bouton Arrêter. Aucun
  score complet n’est attribué à ce candidat ; une relance reprend les sorties
  dont les empreintes concordent. Les cartes v0.1 affichent les évaluations
  complètes déjà présentes dans les deux projets.

Commandes développeur :

```sh
cd /Users/klodynlov/Projets/klody-ui
npm run build
/Users/klodynlov/library-brain-env/bin/python -m unittest discover -s studio -p 'test_*.py' -v
npm run tauri build -- --bundles app
```

Une copie de l’application antérieure est conservée sous `docs/studio/backups/`.
Les modifications préexistantes du projet ont été préservées.


## Correctif de recherche du 6 septembre 2026

Le message « Je n’ai pas trouvé de passages suffisamment pertinents… » provenait
souvent du filtre avant génération, pas du modèle. La première implémentation
recherchait la phrase brute, sans la conversation ni la recherche traduite.
Elle pouvait montrer un titre ou un extrait voisin tout en bloquant la réponse.

Le Studio distingue maintenant les passages repérés et les sources acceptées.
La nouvelle recherche conserve le seuil 0,40, résout les relances, utilise des
requêtes bilingues, recherche un sujet à l’intérieur du manuel nommé et exclut
les simples fragments. Une demande d’explication ne devient pas une liste de
livres ; une demande d’ouvrages est traitée avec leurs références réelles.

Les anciens messages ne sont pas réécrits : relancer la question pour utiliser
le correctif. Les poids des modèles et le réglage global de LibraryBrain restent
inchangés. La fidélité de la réponse reste limitée par le pilote 4B et par les
passages effectivement présents ; les recherches enrichies prennent plus de temps.

## Business Pratique 4B

Le registre partagé `studio/models.py` ajoute un troisième spécialiste, dont les poids et le corpus se trouvent dans `/Users/klodynlov/Projets/BusinessPratique`. Le worker de discussion et l’API utilisent le même registre. Les vues Discuter, Entraîner et Évaluer prennent en charge ce modèle ; l’état de préparation est explicite avant export.

La recherche Business couvre plusieurs catégories par identifiants de livres : Business, Management, Économie, Entrepreneuriat, Logistique, Leadership, Leadership development et Coaching. Une catégorie sans livres donne un résultat vide, sans élargissement silencieux. Les requêtes SQL utilisent des paramètres. Le comportement Research et le filtre Musique restent disponibles.

Le choix de l’intensité d’adaptation du pilote Business utilise exclusivement la validation. Voir `BusinessPratique/reports/release_selection.json` et les résultats finaux `reports/comparison.json`, `reports/grounding_summary.json`. Les versions créées ensuite dans le Studio suivent son entraînement LoRA standard et demandent leur propre évaluation ; elles ne reprennent pas automatiquement cette sélection d’intensité.

Vérifications de l’intégration : 21 tests Python du Studio et 15 tests du contrat Business réussis. Compilation TypeScript/Vite réussie. Contrôle de la fenêtre de 1280 × 720 : barre latérale, sélecteur Business et saisie accessibles sans débordement du conteneur principal. La barre latérale compacte tient compte du troisième modèle.

Essais Business terminés : proposition de valeur et tarification avec passages retrouvés, abstention sur le chiffre d’affaires non fourni. La sortie Business autorise 1 200 tokens ; les autres spécialistes gardent 700. Le worker conserve désormais le motif de fin et signale une limite de longueur atteinte. Voir `BusinessPratique/reports/integration_review.json` pour les réserves factuelles.

## KlodyCode / IA 4B

Le quatrième spécialiste utilise `/Users/klodynlov/Projets/KlodyCode` et filtre les catégories Informatique, Intelligence_artificielle, IA, AI et GitHub. La discussion peut aussi traiter une spécification de fonction ou un bloc de code fourni explicitement : `studio/code_context.py` conserve le texte et les identifiants, sans détour par la recherche documentaire. Une demande de modification directement liée peut reprendre le code de la conversation. Ce mode ne lit ni n’exécute les fichiers d’un dépôt personnel.

L’interface identifie ce mode comme « Votre code et consignes ». Les blocs de code ont un défilement horizontal pour préserver leur indentation. Les questions documentaires suivent toujours le plan de recherche bilingue et les seuils de pertinence existants. La sortie Code dispose de 1 600 tokens et le worker signale une limite atteinte.

L’évaluation Python est indépendante du score de citations. Le catalogue expose `code_metrics` depuis `reports/code_comparison.json` et ne marque pas KlodyCode évalué tant que ces résultats manquent. Les versions candidates du Studio exécutent aussi `code_benchmark.py` lors de leur évaluation ; leurs corpus et exercices sont figés par empreinte. La sélection multi-candidats du pilote reste une étape distincte de l’entraînement standard proposé par l’atelier.

Vérifications avant entraînement : 29 tests Python du Studio et 23 tests KlodyCode réussis, compilation TypeScript/Vite et application macOS réussies. Contrôle visuel de la carte bleue et des quatre spécialistes dans l’application native ; état de préparation lu depuis le processus réel. Les résultats finaux et les essais de discussion doivent être lus dans les rapports KlodyCode, pas déduits de cette compilation.

Résultat final KlodyCode : 695 exemples d’apprentissage, 87 itérations et export MLX autonome de 4,27 Go. Sur 98 questions réservées : 44,9 % de consignes/citations respectées contre 38,8 % pour la base. Fidélité automatique : 29/33 contre 27/33. Python : 6/12 exercices pour les deux modèles, après correction tracée du contrôleur de la variable `_`, sans régénération des réponses.

Le candidat à 50 % n’atteint pas les critères de gain global de validation. Le Studio l’affiche **À améliorer**, y compris dans l’évaluation et la conversation. Les résultats finaux ne servent pas à rechoisir ses poids.

Essais réels : recherche RAG avec six passages ; abstention sur les tests d’un dépôt non fourni ; fonction Python et modification en conversation vérifiées sur six cas exécutés après correction du format de spécification. Un refus initial et une sortie répétitive intermédiaire sont conservés dans les rapports. Le worker utilise désormais les consignes d’entraînement pour les demandes de fonction Python et interrompt explicitement les répétitions de balises invalides. Les autres langages restent dans leur contexte d’origine. Le Studio n’exécute pas automatiquement les programmes proposés.

Vérification finale : 34 tests du Studio, 26 tests du modèle et utilisation CLI réussis ; interface native installée, exemple Python et scores finaux contrôlés. Le détail et les empreintes sont dans `docs/studio/klodycode-verification.json`.


## Juridique V3 (10 septembre 2026)

Dans Klody AI, ouvrir **Studio des modèles → Juridique V3 → Discuter**.
Le spécialiste charge directement la base Qwen3 4B 8 bits et le LoRA V3 de
`/Users/klodynlov/Projets/LibraryBrainLegal/profiles/lora-v3-experimental.json`.
Aucune fusion ni copie de plusieurs gigaoctets n’est nécessaire. Le worker dédié
`studio/legal_worker.py` utilise l’index juridique local et les consignes du
profil évalué, avec génération déterministe (500 tokens, contexte maximal de
10 000 tokens sans découpe silencieuse d’article). Il suit la file unique du
Studio, avec annulation, journal, réponses sauvegardées et corrections à revoir.
Les questions sont indépendantes, comme dans le pilote CLI ; il faut redonner
le contexte utile à chaque question.

Les codes pénal, de procédure pénale et de la route sont exportés le
7 septembre 2026. **Le Code civil est absent.** Les sources affichent le numéro
d’article, le texte fourni au modèle, les dates et la page du PDF. L’audit des
extraits vérifie la correspondance textuelle, sans certifier le raisonnement.

Le catalogue vérifie l’identité de la base, le SHA-256 du LoRA et celui des
consignes. Un profil altéré ne permet pas de charger silencieusement un autre
modèle. La page Évaluer expose la revue des 30 questions réservées : V3
26 conformes / 1 fragile / 3 incorrectes, base 26 / 2 / 2, V2 21 / 5 / 4.
Il s’agit d’une revue de l’agent, sans validation par un juriste. Les critères de
sélection restent non atteints : la V3 est intégrée pour essai expérimental.
Le bouton d’entraînement générique est désactivé pour ce spécialiste ; son
pipeline dédié reste dans LibraryBrainLegal.

Validation de l’intégration : 42 tests Studio réussis, compilation TypeScript,
Vite et bundle Tauri ; test MLX réel lancé depuis l’application installée sur
R415-5 avec la citation exacte et la source page 460. Les détails et empreintes
sont conservés dans `docs/studio/legal-v3-verification.json`.
L’application antérieure est conservée dans
`docs/studio/backups/klody-ui-before-legal-v3-20260910.app`.


## Traduction française médicale — 12 septembre 2026

Dans une réponse du lecteur médical, cliquer **Traduire en français**, puis **Afficher l’original** pour comparer. Les anciennes réponses documentaires sont compatibles. La traduction est locale et sauvegardée séparément ; l’original reste dans le panneau des sources. Le bouton **Annuler la traduction** est disponible pendant l’opération. En cas d’échec du contrôle, l’original reste affiché.

Les titres bibliographiques et les références restent dans leur forme d’origine. La traduction automatique peut encore altérer un terme spécialisé ; elle n’hérite pas du score de lecture V8. [Validation et limites de cette livraison](/Users/klodynlov/Projets/LibraryBrainMedical/reports/traduction-francaise-20260912.md).

API : `POST /api/medical/translate` avec `{"job_id":"identifiant de la réponse"}` et l’en-tête `X-Klody-Studio: 1`. L’opération est une tâche `translate`, suivie avec `/api/jobs/{id}`, annulable avec `/api/jobs/{id}/cancel`. Le cache dépend de l’empreinte du résultat original et du code du traducteur.
