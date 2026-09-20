# Revues obligatoires de qualification

`amont/conception-verification.md` §11 rend six revues obligatoires à la qualification d'une
livraison, et §12 point 5 en fait une condition : leurs constats bloquants doivent être clos,
refusés explicitement par l'autorité compétente, ou couverts par une dérogation autorisée.

Ce répertoire porte le dossier de chacune. Un dossier est ce que le reviewer reçoit : le périmètre
exact, les critères examinés, les preuves disponibles, le format de constat, et — également
normatif — ce qu'il ne pourra pas conclure faute de preuve. Un dossier sans cette dernière section
transforme un manque de preuve en succès implicite, ce que §12 point 4 refuse.

| Revue | État | Autorité | Dossier |
| --- | --- | --- | --- |
| R1 fonctionnelle | en attente | responsable produit, distinct du producteur | [R1-fonctionnelle.md](R1-fonctionnelle.md) |
| R2 architecture | conduite le 17/09/2026 | ingénierie, sur le dépôt | [R2-architecture.md](R2-architecture.md) |
| R3 sécurité | en attente | reviewer indépendant du producteur | [R3-securite.md](R3-securite.md) |
| R4 UX et accessibilité | en attente ; observation partielle dans un vrai terminal, trois constats | utilisateur représentatif, mode étroit, lecteur d'écran, norme nommée | [R4-ux-accessibilite.md](R4-ux-accessibilite.md) |
| R5 licences et distribution | conduite le 17/09/2026 | ingénierie, sur le dépôt | [R5-licences-distribution.md](R5-licences-distribution.md) |
| R6 exploitation | conduite le 17/09/2026 | ingénierie, sur le dépôt | [R6-exploitation.md](R6-exploitation.md) |

Les trois revues conduites l'ont été sur le dépôt lui-même, qui est un objet observable sans
autorité extérieure. Les trois autres demandent une autorité ou un environnement absents : leur
dossier est prêt, leur conduite ne l'est pas. Chacune nomme dans sa section « Ce qui manque pour
conduire » l'autorité, l'environnement et l'effort attendus.

## Sujet exact

| Élément | Valeur |
| --- | --- |
| Dépôt | `495-pi-package` |
| Révision observée | `bd7c5be5cbe8d9af9b59e6e1df5bac952a65c116` (17 septembre 2026) |
| Version du package | `harness-495@0.1.0` |
| Machine d'observation | macOS 27.0 arm64, Node 24.21.0, Git 2.55.0 |

Une revue porte sur une identité, pas sur « le projet ». Un constat rendu sur une autre révision est
un constat sur un autre sujet : il est réenregistré, pas transposé. Les corrections apportées à la
suite des trois revues conduites sont nommées dans chaque dossier avec le contrôle qui les tient ;
elles sont postérieures à la révision observée.

## Conditions de validité

§11 pose qu'une revue n'est valide que si le reviewer dispose de cinq choses. Elles sont réunies
comme suit :

| Condition §11 | Réalisation |
| --- | --- |
| Mandat en lecture seule | Pour un reviewer agentique : rôle `review` de `src/application/context.ts`, profil sandbox `review` (projet inaccessible, candidat figé en lecture seule, stockage 495 inaccessible, réseau refusé). Pour un reviewer humain : accès au dépôt en lecture, aucune écriture attendue hors de son propre constat. |
| Candidat exact | La révision nommée ci-dessus. |
| Critères | Section « Critères examinés » de chaque dossier, chacun rattaché à une exigence amont. |
| Preuves nécessaires | Section « Preuves disponibles », qui nomme pour chaque preuve où elle se trouve et ce qu'elle établit. |
| Format de constat validé | Ci-dessous. |

## Format de constat

Un constat de revue emprunte l'enveloppe canonique `Finding` (`contracts/v1/finding.json`), la même
que celle des contrôles automatiques, catégorie `review`. Un reviewer humain remplit :

| Champ | Contenu |
| --- | --- |
| `rule_id` | Identifiant du critère de ce dossier, par exemple `R2-C03`. |
| `category` | `review`. |
| `severity` | `blocker`, `major`, `minor` ou `info`. Seul `blocker` conditionne la livraison. |
| `message` | L'écart, en une phrase : attendu, observé. |
| `path`, `region`, `symbol` | Localisation dans le dépôt, ou `null` si le constat ne porte pas sur un lieu. |
| `requirement_refs` | L'exigence amont concernée. |
| `baseline_state` | `new`, `preexisting`, `removed` ou `unknown`. |
| `tool`, `tool_version` | `review:<identifiant du reviewer>` et la date. |
| `confidence` | 1 pour un fait observé, moins pour une appréciation. |
| `raw_evidence_ref` | La preuve consultée, ou `null`. |

Trois verdicts par critère, et seulement trois : **conforme**, **constat** (au moins un écart), ou
**indéterminé** — la preuve nécessaire n'existe pas. `indéterminé` n'est jamais `conforme` : c'est
la valeur qui empêche un manque de preuve de passer pour un succès.

Les divergences entre reviewers restent visibles et suivent la règle d'arbitrage préenregistrée
(IH-08, G5). Un constat n'est pas effacé par un autre constat.

## Ce qu'une revue n'a pas le droit de faire

Une revue ne remplace pas un contrôle mécanique disponible. Un constat qu'un programme pourrait
rendre devient un contrôle branché sur `npm run check`, pas un avis daté qui se périme au commit
suivant. Les trois revues conduites ont produit trois contrôles à ce titre :

| Contrôle | Ce qu'il tient | Revue d'origine |
| --- | --- | --- |
| `scripts/check-architecture.ts` | Chaque composant déclaré au catalogue est revendiqué par un module ; aucun cycle d'import ; les fusions de composants sont nommées. | R2 |
| `scripts/check-distribution.ts` | `dist/` reproduit les sources ; aucune dépendance redistribuée ; chaque module externe importé est un pair déclaré et nommé au NOTICE ; licences de l'arbre installé sur liste blanche. | R5 |
| `verify.mjs` livré dans chaque dossier d'export | Le dossier se vérifie hors ligne avec Node seul : empreintes, adresses des objets, chaîne d'événements. | R6 |

## L'export existant ne suffit pas à produire ces dossiers

`src/export/export-service.ts` produit le dossier autonome **d'un changement** conduit par 495 :
journal chaîné, artefacts, preuves, décisions, objets, manifeste, vérificateur. Le dossier attendu
par §13 pour la qualification **d'une livraison de 495** est un autre objet. Ce qui manque est
nommé dans [R6-exploitation.md](R6-exploitation.md), section « Le dossier de livraison de §13 ».
