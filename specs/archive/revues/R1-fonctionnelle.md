# R1 — Revue fonctionnelle

**État :** en attente — l'autorité manque
**Sortie exigée (§11) :** constats par exigence et lacunes de couverture
**Autorité requise :** le responsable produit

## Pourquoi elle n'est pas conduite ici

La revue fonctionnelle juge la concordance entre ce qui est demandé et ce qui est livré. La
première moitié — « ce qui est demandé » — n'appartient pas au producteur. Constater qu'une
exigence possède une ligne de matrice et une preuve exécutée est mécanique, et c'est fait ; juger
qu'une exigence couverte l'est *convenablement*, qu'une lacune est *acceptable*, ou qu'une capacité
absente empêche ou non de livrer, est une décision de produit.

Le dépôt peut donc démontrer que rien n'est inconnu. Il ne peut pas décider que ce qui est connu
suffit.

## Périmètre exact

- `amont/expression-besoins.md` : 93 exigences `[P0]` (85 fonctionnelles en `####`, 8 non
  fonctionnelles `NFR-01` à `NFR-08` en `###`), les scénarios `SA-001` à `SA-045` et les recettes
  `REC-01` à `REC-47`.
- `amont/specification-fonctionnelle.md` : les règles `RM-001` à `RM-086` et les interactions
  humaines `IH-*`.
- `amont/conception-verification.md` §9 (matrice exigence → contrôle → preuve attendue) et §10
  (couverture des règles et scénarios).
- `TRACEABILITY.md` : la matrice résolue, couverte et non couverte.
- `STATUS.md` : ce qui est démontré, et ce qui ne l'est pas.

Hors périmètre : la qualité de l'implémentation, sujet de [R2](R2-architecture.md), et l'ergonomie,
sujet de [R4](R4-ux-accessibilite.md).

## Critères examinés

| Réf | Critère | Exigence amont |
| --- | --- | --- |
| R1-C01 | Chaque exigence `[P0]` possède une ligne de matrice : couverte, ou explicitement non couverte. | §12 point 1 |
| R1-C02 | Pour une exigence déclarée couverte, la preuve nommée établit bien ce que l'exigence demande — et non une propriété voisine. | §12 point 1 |
| R1-C03 | Chaque règle `RM-*` est reliée à au moins un scénario, un contrôle de contrat ou une revue. | §10 |
| R1-C04 | Chaque scénario `SA-*` et chaque recette `REC-*` possède un témoin, et un contre-exemple lorsqu'il est pertinent. | §10 |
| R1-C05 | Les capacités absentes sont annoncées, et leur absence n'est masquée par aucun score agrégé. | §12 point 4 |
| R1-C06 | Le périmètre de la qualification annoncée — plateformes, entrées Pi, adaptateurs, stacks, capacités P0/P1/P2 — correspond à ce qui a réellement été exercé. | §12 point 9 |
| R1-C07 | Les lacunes de couverture sont acceptables au regard du besoin. | décision de produit |

## Preuves disponibles

| Preuve | Où | Ce qu'elle établit |
| --- | --- | --- |
| `scripts/check-traceability.ts`, branché sur `npm run check` | sortie : `85 functional + 8 non-functional [P0] requirements, all present in the matrix` | R1-C01, mécaniquement : un identifiant `[P0]` de l'amont absent des deux tables fait échouer la vérification, et les totaux annoncés par la matrice doivent correspondre à ceux de l'amont. |
| `TRACEABILITY.md` | 93 lignes réparties en deux tables | R1-C01, R1-C05 : chaque exigence nomme ses composants et ses preuves, ou est déclarée non couverte. |
| Suites V0 à V3 | `npm test` : 237 tests, 0 échec | R1-C02, R1-C03, R1-C04 : les fichiers de test portent les identifiants amont dans leurs intitulés. |
| `QUALIFICATION.md` | rapport d'exécution sur la machine de référence | R1-C06 : suites déterministes et campagnes manuelles, avec ce qui n'est pas couvert. |
| `STATUS.md`, section « Ce qui n'est pas qualifié » | | R1-C05, R1-C06. |
| Rapport d'ingénierie | `src/application/report.ts`, `/495 report` | R1-C02 : sépare ce que les contrôles ont mesuré, ce qui en a été conclu et par quelle autorité, et ce qui reste non établi. |

## Format de constat

Enveloppe `Finding`, catégorie `review`, `requirement_refs` obligatoirement renseigné : un constat
fonctionnel qui ne nomme pas l'exigence qu'il met en cause n'est pas exploitable. Voir
[README.md](README.md#format-de-constat).

## Ce que le reviewer ne peut pas conclure faute de preuve

- **Que la matrice dit vrai.** `check-traceability.ts` prouve qu'aucune exigence n'est *absente* de
  la matrice. Il ne prouve pas qu'une ligne déclarée couverte l'est réellement : le rattachement
  d'une preuve à une exigence est écrit à la main, et rien ne vérifie que le test nommé exerce bien
  ce que l'exigence demande. C'est la lacune centrale de ce dossier.
- **Que le corpus de fixtures est celui prévu.** §5 de la conception de vérification décrit un
  corpus de fixtures versionné avec manifeste et empreintes. `test/fixtures/` est vide : les
  fixtures sont générées par `test/helpers/fixtures.ts`, sans manifeste, sans empreinte et sans
  versionnement. Une preuve exécutée sur une fixture ne peut donc pas être rattachée à une version
  de fixture.
- **Que les rapports de campagne sont exacts.** Les totaux de `QUALIFICATION.md` sont transcrits à
  la main depuis la sortie des suites ; l'autorité reste la sortie de `npm test`, pas le document.
  Une transcription périmée n'est détectée par aucun contrôle, et ne peut pas l'être à bon compte :
  compter statiquement les cas d'une suite `node:test` n'est pas fiable.
- **Que les capacités P1 et P2 sont couvertes.** Le périmètre exercé est P0.
- **Que ce qui est absent peut être livré sans.** C'est précisément la décision que R1 demande.

## Lacunes de couverture connues, à soumettre à l'autorité

Ces éléments ne sont pas des constats de revue : ils sont déjà établis par le dépôt. Le reviewer
n'a pas à les découvrir, il a à décider ce qu'ils autorisent.

| Exigence | État | Effet observable |
| --- | --- | --- |
| `ARC-01` à `ARC-03`, `QLT-01` à `QLT-03`, `QLT-05` | non livrées | effet sur l'acceptation d'un changement |
| `PRE-04`, `PRE-05` | non livrées | idem |
| `IH-04` (arbitrage de vérifiabilité) | déclarée aux contrats, exclue du constructeur de demandes de décision | une exigence non discriminable arrête le changement sans issue humaine |
| `PRE-01` | échelle et déclencheur livrés ; cartographie des assertions absente | G2 n'exige pas la discrimination |
| `VER-04` | angle mutation seul | propriétés, fuzzing, contrats, tests différentiels et métamorphiques absents |
| `RAG-*`, `EXP-*` | non livrées | aucun scénario P0 de changement simple bloqué, mais `[P0]` à l'amont |
| `NFR-04` | aucune mesure p95 | aucun seuil de performance engageable |
| `NFR-05` | backend `bwrap` jamais exécuté | portabilité annoncée non qualifiée |
| `PRG-03` à `PRG-05` | noyau et stockage seulement | programme multi-incréments non conduit depuis Pi |
| Mode RPC | chemins de code présents | aucun client RPC qualifié exercé |

## Ce qui manque pour conduire

| Manque | Pourquoi il est bloquant | Ce qui le lèverait |
| --- | --- | --- |
| Le responsable produit | R1-C07 est une décision, pas un constat ; et §12 point 8 exige qu'une autorité humaine confirme la portée exacte de la qualification et ses limites. | La désignation de l'autorité, et sa décision sur chaque lacune ci-dessus : close, refusée explicitement, ou couverte par une dérogation. |
| Un rattachement vérifiable preuve ↔ exigence | R1-C02 reste indéterminé tant que le lien est du texte. | Que chaque preuve porte l'identifiant d'exigence dans son enveloppe `Evidence` plutôt que dans l'intitulé d'un test, de sorte qu'une exigence sans preuve rattachée soit un fait et non une relecture. Travail identifié, `chantiers/C`. |
| Un corpus de fixtures versionné | R1-C02 et §13 demandent un manifeste et des empreintes de fixtures ; il n'existe pas. | Travail identifié, `chantiers/C`. |
