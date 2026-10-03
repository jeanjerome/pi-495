# Un second état des lieux d'un même arbre mesure le projet à nouveau

Story : e28s07
Epic : e28
Statut : en cours

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-03T220000 du registre. Le propriétaire qui demande l'état des lieux d'un
projet (`/495 state`) — notamment celui du projet intégré, sur lequel un jalon de remédiation est jugé —
et qui refuse ce premier état des lieux ne peut aujourd'hui en obtenir un second tant que l'arbre ne
change pas : la clé sous laquelle l'état des lieux s'inscrit ne nomme que l'empreinte de la référence et
la révision, le registre des opérations est commun à tous les changements du dossier, et il refuse le
second comme une répétition du premier. Le second changement s'arrête `blocked` à sa mesure, sans preuve,
alors qu'aucun de ses contrôles n'a tourné.

Le propriétaire gagne un état des lieux mesuré à chaque demande, avec ses propres preuves, quel que soit
l'état des lieux qu'un autre changement du dossier a pris du même arbre ; une répétition reste reconnue,
mais seulement dans le changement qui a lancé la mesure.

## 2. Promesses

Scenario: Un second état des lieux du même arbre est mesuré après le refus du premier
  Given un dossier où l'état des lieux A d'un projet a été conduit jusqu'à la décision IH-10, que le propriétaire a refusée
  And un état des lieux B demandé ensuite dans le même dossier, sur le même arbre
  When B est conduit jusqu'à son jugement
  Then B inscrit les preuves de sa mesure, propose son propre survey et attend la décision IH-10
  And aucune étape de B ne nomme `OPERATION_ACTIVE`
  And le registre des opérations porte une mesure pour A et une pour B, chacune rattachée à son changement

Scenario: Une répétition reste refusée dans l'état des lieux qui a lancé la mesure
  Given l'état des lieux A, dont la mesure est inscrite au registre des opérations sous sa clé
  When une seconde opération de mesure de A est ouverte sous la même clé
  Then le registre la refuse avec le message « already holds the idempotency key », qui nomme l'opération de A

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; la clé
continue de refuser une seconde mesure dans le changement qui l'a ouverte.

## 4. Tâches

### Tâche 1 — La clé de l'état des lieux nomme le changement

L'état des lieux s'inscrit sous une clé qui nomme, outre l'empreinte de la référence et la révision, le
changement qui le lance (`surveyReference`, `src/application/phases/survey.ts`), pour qu'un second état
des lieux du dossier sur le même arbre n'atteigne pas la clé du premier. Le commentaire de
`projectOperation` (`src/adapters/storage-sqlite/ledger.ts`) dit la clé de l'état des lieux comme celle de
la vérification.

- Vérifie : `node --test test/v2-kernel/survey-key-per-change.test.ts`
- Tient : `test/v2-kernel/survey-key-per-change.test.ts`, « deux états des lieux d'un dossier sur le même arbre mesurent chacun le projet : après le refus de A, B inscrit ses preuves, propose son survey et attend IH-10, aucune étape ne nomme OPERATION_ACTIVE, le registre porte une mesure pour A et une pour B, et une seconde ouverture sous la clé de A, dans A, est refusée en nommant l'opération de A »
- Rouge : B s'arrête `blocked` en `verifying`, sans preuve ni survey, à l'étape « verifying: OPERATION_ACTIVE operation op_0023 already holds the idempotency key survey:sha256:692e45f4…85f1f4:23; op_0053 would run the same verification a second time » (sondé sur `main` à 9cc2280 avec `makeHarness`, `trackedProject`, `deliverable: "state"`, une politique sans acceptation exigée, et le refus d'IH-10 sur A avant de démarrer B)

## 5. Hors périmètre

- La clé de l'intégration, qui nomme la tête de destination et dont aucun défaut n'est inscrit.
- La mesure de l'état des lieux sans copie de la référence ni contrôle relancé quand l'arbre n'a pas
  changé : la story fait mesurer chaque demande, elle ne réutilise pas un état des lieux refusé.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13, et
  BUG-2026-10-03T233000, le thème de site que l'adoption Maven ne récupère pas.
