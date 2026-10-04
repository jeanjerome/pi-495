# L'arrêt sur le budget de durée de l'incrément nomme ce qui le lève

Story : e28s10
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-28T163400 du registre. Le propriétaire dont le changement a consommé le
budget de durée de son incrément (`policy.budgets.increment_ms`) lit aujourd'hui dans `/495 status`
« blocked: execution_error — BUDGET_EXHAUSTED: increment duration budget exhausted », sans aucune
sortie. Une reprise rend le changement `ready`, et l'étape suivante bloque aussitôt sur le même refus :
rien ne lui dit que seul un budget relevé dans la configuration, lu par une nouvelle session, laisse le
changement repartir. L'arrêt sur le nombre d'appels d'outils, lui, le dit déjà.

Le propriétaire gagne un arrêt qui nomme ce qui le lève : le paramètre à relever et le fait qu'il ne
prend effet que dans une nouvelle session. C'est un défaut et non une préférence : un arrêt que la
reprise ne peut pas lever dans la même session, et qui ne le dit pas, fait tourner le propriétaire en
rond.

## 2. Promesses

Scenario: L'arrêt sur le budget de durée épuisé nomme le budget à relever
  Given un changement ouvert sous une configuration où `policy.budgets.increment_ms` vaut 0
  When le changement avance
  Then il s'arrête `blocked`, et la prochaine action que montre `/495 status` est « blocked: execution_error — BUDGET_EXHAUSTED: increment duration budget exhausted; a raised policy.budgets.increment_ms takes effect in a new session »

Scenario: Une reprise dans la même session retombe sur le même arrêt, qui nomme la même sortie
  Given ce changement arrêté sur son budget de durée épuisé
  When le propriétaire le reprend dans la même session et le fait avancer
  Then il s'arrête de nouveau `blocked`, et la prochaine action que montre `/495 status` nomme encore `policy.budgets.increment_ms` et « takes effect in a new session »

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; le
budget refuse toujours de lancer une intervention une fois épuisé, seul le texte du refus change.

## 4. Tâches

### Tâche 1 — Le refus du budget de durée épuisé nomme le paramètre et la nouvelle session

Le refus que lève `interventionStart` (`src/domain/change/decide.ts`) quand
`budgets.increment_ms_used` atteint `policy.budgets.increment_ms` dit, après « increment duration budget
exhausted », qu'un `policy.budgets.increment_ms` relevé prend effet dans une nouvelle session. Le détail
de l'arrêt que le harnais inscrit (`error.toText()`, `src/application/harness.ts`) et la prochaine action
de la vue le reprennent sans autre changement.

- Vérifie : `node --test test/v2-kernel/increment-budget.test.ts`
- Tient : `test/v2-kernel/increment-budget.test.ts`, « un changement sous `increment_ms: 0` s'arrête `blocked` et sa prochaine action est `blocked: execution_error — BUDGET_EXHAUSTED: increment duration budget exhausted; a raised policy.budgets.increment_ms takes effect in a new session` ; repris dans la même session et avancé, il s'arrête de nouveau et sa prochaine action nomme encore `policy.budgets.increment_ms` et `takes effect in a new session` »
- Rouge : sondé sur `main` à 7188a1a avec `makeHarness({ policy: { budgets: { increment_ms: 0 } } })`, `start` puis `advance` : la prochaine action est « blocked: execution_error — BUDGET_EXHAUSTED: increment duration budget exhausted », sans paramètre ni nouvelle session ; après `resume` et `advance` dans la même session, la même ligne revient

## 5. Hors périmètre

- La boucle elle-même : une reprise dans la même session lève toujours l'arrêt, qui revient à l'étape
  suivante. Refuser cette reprise, ou classer l'arrêt sous `budget_exhausted` plutôt qu'`execution_error`,
  ajouterait un refus ou changerait la règle de reprise ; l'entrée ne demande que l'arrêt qui dit ce qui
  le lève.
- BUG-2026-09-28T163300 : les tests des quatre arrêts qui ne nomment que l'annulation, et du retrait
  d'IH-07 de ce budget, restent à leur propre story.
- La traduction du texte de l'arrêt dans une session en français : il reste en anglais, comme le détail
  de l'arrêt sur le nombre d'appels d'outils.
