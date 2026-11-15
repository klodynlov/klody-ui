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

## Réponses structurées vérifiées

`grounded_answer.py` est le moteur de réponse de Juridique, Médical et Business &
Finance (`legal_grounded_worker.py`, `medical_grounded_worker.py`,
`library_grounded_worker.py`). Le modèle local 35B, appelé par la passerelle
`:8090`, ne rédige plus librement :

1. il résout la question avec la conversation (relances, fautes de frappe,
   langage courant) et propose des pistes de recherche ;
2. la recherche reste celle de chaque spécialiste (corpus juridique activé,
   lecteur médical V8, seuils LibraryBrain) ;
3. il écrit 1 à 5 affirmations, chacune avec un extrait recopié de sa source ;
4. le programme vérifie chaque extrait dans la source citée, refuse tout
   chiffre absent de cette source (en chiffres ou en lettres), puis fait relire
   chaque affirmation contre son seul extrait. Ce qui échoue est retiré ; s'il
   ne reste rien, la réponse est une abstention expliquée.

La tolérance de comparaison couvre l'espacement, la typographie et les dégâts
d'extraction PDF (ligatures perdues, mots coupés), jamais un chiffre. Le texte
« ce que les sources ne disent pas » est remplacé par une phrase neutre s'il
contient un chiffre absent des sources. Cette garantie est documentaire : elle
ne valide ni l'actualité d'un texte ni son application à une situation.

En juridique, les articles pressentis par le modèle ne sont que des pistes : le
programme lit le texte réel, dans le code nommé, et suit une fois les renvois
(« l'amende prévue pour les contraventions de la quatrième classe »). En
médical, les questions de prise en charge peuvent s'appuyer sur les ouvrages de
référence en plus des publications HAS datées ; posologies et « dernière
recommandation » restent exclues. Les anciens moteurs (`legal_worker.py`,
`medical_french_worker.py`, `worker.py`) et leurs profils figés sont conservés.

`KLODY_STUDIO_SOURCE=system` classe les appels d'un banc hors de l'usage
interactif dans le journal de la passerelle.

## Fiches officielles Service-Public

Business & Finance lit aussi les fiches pratiques de Service-Public.gouv.fr
(DILA), publiées en open data sous Licence Ouverte 2.0 : la bibliothèque contient
des ouvrages, peu de règles françaises à jour sur l'épargne, le crédit ou la
fiscalité des placements. `public_guides.py` construit un index séparé, en
lecture seule ; la base LibraryBrain n'est pas touchée.

```sh
python public_guides.py build --output "$ROOT/corpora/<édition>/edition" \
    --archive particuliers=<vosdroits-latest.zip> --archive entreprendre=<vosdroits-latest.zip> \
    --theme "Argent - Impôts - Consommation"
python public_guides.py activate --root "$ROOT" --edition "$ROOT/corpora/<édition>/edition"
```

`$ROOT` est le projet du spécialiste (`~/Projets/BusinessPratique`). Les archives
viennent de `lecomarquage.service-public.gouv.fr` (adresses dans
`public_guides.DOWNLOAD`) ; rien n'est téléchargé automatiquement. Le manifeste
garde l'adresse, le nom, la date et l'empreinte de chaque archive, comme la
licence le demande ; chaque passage porte l'adresse et la date de sa fiche.

Sans édition activée, le spécialiste répond depuis la bibliothèque seule. Pour
revenir en arrière, supprimer `data/active_public_guides.json`. Une fiche dit la
règle à sa date de mise à jour : reconstruire une édition pour la rafraîchir.
Les fiches passent avant les ouvrages dans les sources proposées au modèle, et
restent soumises aux mêmes contrôles d'extrait et de chiffres.

### Doctrine fiscale (BOFiP)

Le même module indexe, dans une édition séparée, la doctrine fiscale en vigueur
(BOFiP-Impôts, DGFiP, même licence), à partir de l'export « publications en
vigueur » de data.economie.gouv.fr :

```sh
python public_guides.py build-doctrine --output "$ROOT/corpora/<édition>/edition" \
    --export <bofip-vigueur.jsonl> --download-url <adresse de l'export> --series IR --series RPPM
python public_guides.py activate --root "$ROOT" --edition "$ROOT/corpora/<édition>/edition" --name tax_doctrine
```

Chaque édition a son pointeur (`data/active_public_guides.json`,
`data/active_tax_doctrine.json`) ; un spécialiste lit celles que son entrée de
`models.py` déclare. Les fiches pratiques passent d'abord. La doctrine est longue
et technique : deux passages au plus, et seulement d'un document dont le titre
nomme le sujet — sans cela « action » ramenait « action en recouvrement ». Les
numéros de paragraphe (10, 20…) sont retirés du texte : ils compteraient comme
des chiffres que la source « contient ». Les « Actualités » et les séries de
procédure ne sont pas indexées.

Aucun spécialiste ne déclare `tax_doctrine` pour l'instant. Mesuré le 2026-11-15
sur 40 questions de finance et de fiscalité avec Business & Finance : la doctrine
n'est citée que deux fois, une réponse y gagne (report d'imposition d'un apport
de titres), une autre y perd (assurance-vie), les fiches pratiques répondant déjà
au reste. La recherche par mots-clés classe mal ces textes longs. L'édition se
construit et s'active, mais reste hors des réponses tant qu'elle ne fait pas mieux.

Trois garde-fous accompagnent ces fiches :

- un ouvrage n'est pas daté : un montant ou un taux (`€`, `%`) qui en vient est
  affiché avec un avertissement, et il est écarté quand une fiche datée répond
  dans la même réponse (vu : « 18 %, seuil 25 730 € » d'un manuel de 2008) ;
- une demande de désigner un titre ou un moment d'achat (« quelle action acheter
  demain ? ») est refusée avant toute recherche (`no_personal_pick`) ;
- une fiche « à situations » (PEA classique, PME-ETI, jeune) est indexée situation
  par situation : son corps n'est pas sous `<Texte>` mais sous `<ListeSituations>`.

La recherche ne lemmatise pas : « plus-values » ne trouve pas « plus-value ».
Élargir aux pluriels a été essayé et retiré, le classement se dégradait (la
fiche Livret A sortait des six premières pour « plafond du livret A »).

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
