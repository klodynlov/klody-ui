# Studio local des modèles

Le Studio est accessible depuis le lien « Studio des modèles » ou `#studio`.
Son API FastAPI écoute exclusivement sur `127.0.0.1:8018` et sert aussi le
frontend compilé. Les requêtes API demandent l’en-tête `X-Klody-Studio: 1` ;
les origines autorisées sont définies dans `server.py`.

Ce dépôt contient l’interface, l’orchestration et les contrôles des profils.
Les poids, corpus, documents, évaluations et projets spécialisés restent locaux.
Le registre `models.py` indique les projets attendus sous `~/Projets`.
En leur absence, le catalogue signale les modèles indisponibles. Il ne télécharge
ni n’entraîne un modèle automatiquement.

Le profil Juridique V3 peut consulter une édition documentaire séparée couvrant
les 76 codes français et plusieurs fonds de jurisprudence française. Le
[guide du corpus juridique](legal_corpus/README.md) décrit l’acquisition,
l’activation, le retour à l’ancien corpus et les limites de couverture.

Le lecteur médical V8 exige le profil évalué de `LibraryBrainMedical`, ses
artefacts et son runtime figé. Les empreintes restent vérifiées avant chaque
exécution. La traduction locale dispose de contrôles des valeurs numériques
et d’une relecture de fidélité par le modèle ; elle ne constitue pas une
validation clinique.

Sur le poste configuré :

```sh
npm run build
~/library-brain-env/bin/python studio/server.py
```

L’état est conservé dans `~/Projets/KlodyModelStudio` par défaut, ou dans
`KLODY_STUDIO_STATE`. Le moteur sérialise les travaux. Ne pas recharger le
service pendant une opération active. Les tests `test_medical_v*.py` et
`test_legal.py` vérifient les installations locales et leurs artefacts ; ils ne
sont pas des tests d’inférence utilisables sur un runner GitHub sans ces données.

## Réponses françaises

`medical_french_worker.py` enveloppe le lecteur V8 sans modifier son code figé.
Les nouvelles réponses sont traduites et vérifiées avant affichage. Le résultat
conserve `original_answer` et les sources originales avec leurs empreintes.
En cas d’échec, un message français et une action de nouvelle tentative restent
disponibles. Les anciennes réponses sont traduites à l’ouverture, dans une tâche
distincte et persistée, sans modifier leur résultat d’origine.

Le bouton « Afficher l’original » permet de comparer les deux textes. Les sources
restent toujours dans leur langue originale. Les scores du profil V8 évaluent
le lecteur documentaire d’origine, pas la qualité clinique de la traduction.

## Tests portables et validation locale

```sh
python -m pip install -r studio/requirements-test.txt
python studio/run_portable_tests.py
npm run test:e2e
```

Les tests portables utilisent un lecteur synthétique et des appels d’inférence
simulés pour contrôler l’orchestration, la fidélité numérique, les reprises et
la conservation des sources. Ils ne nécessitent ni modèles ni documents locaux.
Les tests navigateur interceptent l’API et vérifient l’affichage français par
défaut, la traduction des anciennes réponses et la reprise après échec.

Validation sur le poste équipé, le 18 septembre 2026 : 43 tests Python ciblés,
4 tests navigateur, compilation TypeScript/Vite et Tauri, puis vérification
réelle de « douleur aux oreilles » en français dans le navigateur et le bundle
natif. Les 60 résultats antérieurs étaient inchangés. Aucun document ni résultat
utilisateur n’est inclus dans ce dépôt.
