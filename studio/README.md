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
