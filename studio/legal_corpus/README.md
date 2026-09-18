# Corpus documentaire français pour Juridique V3

Ce module étend les sources consultées par le modèle local V3. Il ne réentraîne
pas l’adaptateur et ne modifie ni ses consignes figées ni ses évaluations
historiques. La validation du V3 antérieur ne vaut pas validation de ce nouveau
périmètre documentaire. Les sources et résultats restent sur le poste.

## Sources et limites

- Les **76 codes en vigueur** du [catalogue Légifrance](https://www.legifrance.gouv.fr/liste/code?etatTexte=VIGUEUR),
  inventorié le 18 septembre 2026, proviennent des XML LEGI. Chaque article
  conserve son identifiant, sa période de validité, ses notes et son URL.
  Les versions expirées/futures restent dans les archives, hors de l’index de
  consultation daté. Les codes partiellement abrogés figurant au catalogue sont
  inclus pour leurs articles encore applicables à cette date.
- Les [fonds DILA](https://echanges.dila.gouv.fr/OPENDATA/) CONSTIT, CASS, INCA,
  CAPP et JADE apportent les décisions constitutionnelles, judiciaires et
  administratives qu’ils publient. Un stock global et tous ses correctifs
  disponibles sont appliqués dans l’ordre, y compris les suppressions.
- Le [portail de la justice administrative](https://opendata.justice-administrative.fr/)
  fournit les ZIP mensuels CE, CAA et TA. Les doublons JADE ayant le même ECLI
  cèdent la place au texte de ce portail. L’URL citée mène au ZIP officiel et le
  nom du fichier est conservé dans la provenance.
- Six jeux de données historiques de la Cour des comptes publiés sur
  [data.gouv.fr](https://www.data.gouv.fr/datasets/jurisprudence-anonymisee-de-la-cour-des-comptes-2006-2008-et-2010-2015)
  couvrent aussi les juridictions financières. Les textes exploitables HTML et
  DOCX sont importés ; les DOC binaires et les textes sans date vérifiable sont
  écartés explicitement. Leur licence **ODbL** est conservée séparément de la
  licence **Etalab 2.0** des fonds DILA/administratifs.

**Cela ne constitue pas toute la jurisprudence française.** L’accès aux décisions
judiciaires récentes exhaustives via [Judilibre/PISTE](https://www.courdecassation.fr/acces-rapide-judilibre/donnees-ouvertes-open-data-et-api)
doit être configuré séparément. Les archives financières ne couvrent pas les
publications récentes. Des décisions ne sont pas publiées en open data. CJUE et
CEDH sont exclues de ce périmètre France. Aucun secret PISTE n’est nécessaire
pour les commandes ci-dessous et aucun ne doit être commité.

## Acquisition, construction et activation

Python **3.11+**, SQLite avec FTS5 ; acquisition et import utilisent la bibliothèque
standard. Prévoir plusieurs dizaines de Go pour les archives et l’index.
Depuis `studio/`, choisir une **nouvelle** édition dans `LibraryBrainLegal/corpora` :

```sh
export LEGAL_ROOT="$HOME/Projets/LibraryBrainLegal"
export LEGAL_EDITION="$LEGAL_ROOT/corpora/20260918-france"
python -m legal_corpus.download --output "$LEGAL_EDITION"
python -m legal_corpus.administrative --output "$LEGAL_EDITION"
python -m legal_corpus.financial --output "$LEGAL_EDITION"
python -m legal_corpus.build --output "$LEGAL_EDITION" --as-of 2026-09-18 --include-administrative
# Examiner coverage.json, les rejets et des recherches réelles avant activation.
python -m legal_corpus.activate --root "$LEGAL_ROOT" --edition "$LEGAL_EDITION"
```

Les fichiers terminés sont contrôlés par SHA-256 et accompagnés d’un reçu.
Relancer l’acquisition reprend les archives vérifiées ; un transfert partiel
est retéléchargé. L’import reprend à la dernière archive validée en transaction.
`--follow-downloads` attend les reçus en cours jusqu’à une heure chacun.
`--replay-decisions` rejoue les archives DILA judiciaires/administratives après
une correction du parseur sur une édition encore en préparation.

L’import refuse de reconstruire l’édition active. L’activation vérifie les
76 codes, les nombres de documents, les archives appliquées et l’intégrité
SQLite. Elle écrit atomiquement `data/active_corpus.json` et sauvegarde le
pointeur précédent dans `snapshots/`. Sans ce pointeur, le moteur reprend
l’ancien index des trois codes, conservé intact. Pour revenir en arrière,
restaurer le pointeur sauvegardé, ou enlever le pointeur si sa valeur précédente
était `null`, service inactif. Conserver les anciennes éditions.

## Traçabilité et vérification

`coverage.json` indique les codes, articles, décisions par fonds, dates,
volumes rejetés, archives et limites connues. `index.sqlite` conserve les tables
`documents`, `applied` et `rejected`. Chaque document garde le hash de l’archive,
le fichier membre, sa source, son acquisition, sa licence et son hash de texte.
Les décisions sans numéro de pourvoi restent citables par leur identifiant
officiel ; aucun numéro n’est inventé. Les dates financières issues du document
ou de sa lecture gardent leur qualification d’origine.

Les passages de 5 500 caractères sont des tranches exactes du texte complet,
sans résumé généré. Le lecteur cite l’identifiant du passage et affiche ses
positions. La recherche utilise les références exactes puis FTS5, avec
priorité aux décisions quand la question demande de la jurisprudence.
Un extrait correspondant à une source ne prouve ni l’actualité d’une solution,
ni sa portée, ni sa pertinence pour un litige.

```sh
python -m unittest test_legal_corpus -v
```

Les tests synthétiques couvrent les dates, notes, références, suppression,
reprise, provenance, passages, filtres et refus des DTD. Ils ne mesurent pas la
qualité juridique du modèle. Les tests navigateur utilisent une API simulée.
