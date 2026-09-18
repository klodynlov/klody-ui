# Validation technique du corpus français — 18 septembre 2026

Édition locale : `LibraryBrainLegal/corpora/20260918-france`.
L’adaptateur et le prompt du Juridique V3 restent figés. Cette extension est
un corpus de consultation ; aucun entraînement n’a été lancé.

- **76/76 codes**, **165 316 articles** valides à la date choisie.
- **2 269 885 décisions** indexées et **5 079 096 passages**.
- **1 102 archives** acquises : 912 DILA, 170 administratives, 20 financières.
- **15 678 fichiers écartés** : texte, format ou métadonnées non exploitables,
  dont six fiches d’appel portant une année « 0201 » incohérente avec leur titre.
  Les originaux restent dans les archives ; les motifs sont dans `rejected`.
- Index SQLite d’environ **79 Gio** ; les archives s’y ajoutent.

| Fonds | Décisions indexées |
| --- | ---: |
| CAPP | 72 923 |
| CASS | 142 430 |
| CDBF | 205 |
| CDC | 1 349 |
| CONSTIT | 7 388 |
| CRTC | 810 |
| DCA | 124 383 |
| DCE | 39 047 |
| DTA | 948 831 |
| INCA | 387 651 |
| JADE | 544 868 |

Les 97 contrôles de recherche passent : un identifiant dans chacun des 76 codes,
sept références d’articles (civil, pénal, route, consommation, transports,
travail et commerce), un identifiant dans chacun des onze fonds de décisions,
et trois requêtes textuelles. Les recherches textuelles mesurées prennent
1,2 à 3,4 secondes sur ce poste ; il ne s’agit pas d’un benchmark de pertinence.

Deux générations locales avec les poids V3 ont fourni un extrait et une
référence correspondant exactement à la source : article 1240 du Code civil
(`LEGIARTI000032041571`) et dispositif de `JURITEXT000051151553`.
Aucune référence inattendue ni citation textuelle non retrouvée sur ces deux
cas. **Ce contrôle de fidélité ne valide pas le raisonnement juridique général.**

67 tests Python portables, 8 tests du profil V3 installé, 15 parcours Playwright,
compilation TypeScript/Vite et bundle Tauri local vérifiés. Les contrôles CI
existants couvrent Playwright et CodeQL ; les tests Python ont été exécutés
localement. Les résultats détaillés de recherche, de génération et de
conservation restent dans le dossier local `qa/`, hors Git.

Les données restent partielles : décisions judiciaires récentes exhaustives
via Judilibre/PISTE non acquises ; fonds financiers historiques limités ;
exclusions d’import. Les doublons sont traités par identifiant, puis par ECLI
entre JADE et le portail administratif ; des doublons sans correspondance
peuvent subsister. Le catalogue et le lecteur affichent ces limites.
