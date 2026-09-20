# Transverse B — revues obligatoires de qualification

**État :** partiel — les six dossiers existent, trois revues sont conduites, trois attendent une
autorité ou un environnement absents
**Objet :** les six revues exigées par la conception de vérification
**Ne dépend d'aucun étage**

## Motif

`specs/archive/amont/conception-verification.md` §11 rend six revues obligatoires à la qualification d'une
livraison : fonctionnelle, architecture, sécurité, UX et accessibilité, licences et distribution,
exploitation. La règle de décision de livraison du même document en fait une condition : les
constats bloquants doivent être clos, refusés explicitement par l'autorité compétente, ou couverts
par une dérogation autorisée.

Aucune n'a été réalisée. `STATUS.md` le dit, mais aucun travail n'était ouvert pour les conduire,
alors qu'elles bloquent la qualification du socle au même titre que les exigences absentes.

Une revue obligatoire n'est valide que si le reviewer dispose d'un mandat en lecture seule, du
candidat exact, des critères, des preuves nécessaires et d'un format de constat validé. Le
mécanisme existe déjà — rôle `review`, mandat en lecture seule, arbitrage — mais il n'a jamais été
exercé avec un reviewer humain ni avec un modèle réel.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/amont/conception-verification.md sections 11 et 12,
puis la section « Ce qui n'est pas qualifié » de specs/archive/STATUS.md.

Six revues sont obligatoires : fonctionnelle, architecture, sécurité, UX et accessibilité,
licences et distribution, exploitation. Aucune n'est faite.

Ce travail n'est pas d'écrire du code. Il consiste à rendre chaque revue conduisible, puis à
conduire celles qui ne demandent pas une autorité extérieure.

Pour chacune, produis le dossier que le reviewer doit recevoir : périmètre exact, critères
examinés, preuves disponibles, format de constat, et ce que le reviewer ne peut pas conclure
faute de preuve. Le rôle review et le mandat en lecture seule existent déjà dans le code ;
vérifie si le dossier peut être produit par l'export existant ou s'il y manque des pièces.

Trois revues sont conduisibles ici et maintenant sur le dépôt 495 lui-même : architecture
(frontières, dépendances, contrats, migrations), licences et distribution (dépendances,
notices, packaging Pi, SBOM), exploitation (reprise, diagnostics, ressources, export hors
ligne). Conduis-les et enregistre leurs constats.

Trois demandent une autorité ou un environnement absents : sécurité (reviewer indépendant du
producteur), UX et accessibilité (utilisateur représentatif, terminal réel), fonctionnelle
(responsable produit). Prépare leur dossier et déclare-les en attente, avec ce qui manque
nommé.

Une revue ne remplace pas un contrôle mécanique disponible et ne transforme pas un manque de
preuve en succès : un constat que le code pourrait vérifier doit devenir un contrôle, pas un
avis.

Critères d'acceptation :
- les six dossiers de revue existent avec leurs critères et leurs preuves ;
- les trois revues conduisibles sont conduites, leurs constats enregistrés et leurs bloquants
  soit clos, soit ouverts comme travail identifié ;
- les trois autres sont déclarées en attente avec l'autorité ou l'environnement manquant ;
- specs/archive/STATUS.md reflète l'état réel de chacune.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Liste et objet des revues | `specs/archive/amont/conception-verification.md` §11 |
| Condition de livraison | `specs/archive/amont/conception-verification.md` §12, points 5 et 8 |
| Mandat de revue en lecture seule | rôle `review` de `context.ts`, profil d'exécution associé |
| Arbitrage de constats incompatibles | IH-08, G5 |
| Dossier remis au reviewer | `src/export/`, `export-service.ts` |
| Les six dossiers | `specs/archive/revues/` |

## Journal

**17 septembre 2026 — les six dossiers, trois revues conduites.**

`specs/archive/revues/` porte un dossier par revue : périmètre exact, critères rattachés à une exigence
amont, preuves disponibles avec ce que chacune établit, format de constat, et ce que le reviewer ne
peut pas conclure faute de preuve. Le format de constat est l'enveloppe canonique `Finding`,
catégorie `review`, avec trois verdicts par critère : conforme, constat, indéterminé — `indéterminé`
n'étant jamais `conforme`.

L'export existant ne produit pas ces dossiers. `exportChange` produit le dossier autonome **d'un
changement conduit par 495** ; celui qu'attend §13 pour qualifier **une livraison de 495** est un
autre objet, dont sept des douze pièces sont absentes. L'inventaire est dans
`revues/R6-exploitation.md`, critère R6-C06. De même, le rôle `review` et son mandat en lecture
seule servent un reviewer *d'un changement* ; les six revues de §11 portent sur une livraison, et le
code n'a aucune représentation de ce sujet.

Conduites sur le dépôt : architecture, licences et distribution, exploitation. Quatre constats
bloquants, tous clos, chacun par un contrôle mécanique plutôt que par un avis :

| Constat bloquant | Contrôle qui le tient désormais |
| --- | --- |
| `dist/` ne reproduisait plus les sources (18 fichiers absents, 69 différents) alors que le package y désigne son point d'entrée | `scripts/check-distribution.ts`, reconstruction et comparaison octet par octet |
| Huit des seize composants déclarés n'étaient revendiqués par aucun module | `scripts/check-architecture.ts` |
| `LICENSE` renvoyait à une adresse au lieu de porter les termes | `scripts/check-distribution.ts` |
| Les diagnostics de démarrage n'étaient dits qu'à l'entrée disposant d'un écran | `test/v3/pi-entries` |

Constats non bloquants ouverts comme travail identifié, tous rattachés à `chantiers/C` : aucune
empreinte d'archive publiée ni provenance de livraison ; aucun SBOM lisible par machine ; aucune
trace d'exécution et aucun outil de lecture de l'état hors de Pi ; workspaces orphelins et
temporaires du CAS jamais repris ; aucune politique de rétention ; la fusion `CMP-APP`/`CMP-VER`
dans `harness.ts` ; la première migration de schéma sera écrite sans témoin préalable.

En attente, avec ce qui manque nommé : sécurité (reviewer indépendant du producteur, machine Linux
pour `bwrap`, campagne adverse, et un document de modèle de menace qui n'existe pas et dont la
rédaction est une sortie de la revue), UX et accessibilité (utilisateur représentatif, terminal
réel, lecteur d'écran, et une norme d'accessibilité à nommer à l'amont ; le protocole de conduite en
cinq tâches est écrit), fonctionnelle (responsable produit ; la matrice prouve qu'aucune exigence
n'est absente, pas qu'une preuve établit ce que son exigence demande).
