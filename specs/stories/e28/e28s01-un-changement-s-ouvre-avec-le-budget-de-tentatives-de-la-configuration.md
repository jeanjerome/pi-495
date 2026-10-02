# Un changement s'ouvre avec le budget de tentatives que la configuration fixe

Story : e28s01
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-23T155707 du registre. L'utilisateur qui écrit
`policy.budgets.max_attempts` dans le `config.json` du répertoire de données lit aujourd'hui
`Tentatives: 0/3` à l'ouverture de son changement, et le changement s'arrête sur
`attempts_exhausted` après trois tentatives, quelle que soit la valeur écrite. Le README promet que
`policy.budgets` règle les tentatives, comme il règle les six autres bornes, qui, elles, arrivent à
l'exécution. L'utilisateur qui plafonne les tentatives pour borner la dépense d'un modèle facturé au
jeton n'obtient pas le plafond qu'il a écrit : c'est un défaut, pas une préférence.

## 2. Promesses

Scenario: Un changement s'ouvre avec le budget de tentatives de la configuration
  Given une politique active dont `budgets.max_attempts` vaut 2
  When le noyau décide la création d'un changement
  Then l'événement `change.created` porte `max_attempts` à 2
  And l'état du changement porte `budgets.max_attempts` à 2 et `attempts_used` à 0

Scenario: Le budget configuré est celui que la session rouverte relit
  Given un changement ouvert sous une politique dont `budgets.max_attempts` vaut 2
  When une autre session ouvre le même registre d'événements
  Then l'état relu porte `budgets.max_attempts` à 2
  And la vue d'état du changement annonce `Tentatives: 0/2`

Scenario: Un registre écrit avant que l'événement ne porte le budget se rejoue à trois
  Given un événement `change.created` sans champ `max_attempts`
  When l'état est reconstruit depuis cet événement
  Then l'état porte `budgets.max_attempts` à 3, la borne par défaut du noyau

Scenario: Une extension de budget part du budget configuré
  Given un changement ouvert sous une politique dont `budgets.max_attempts` vaut 2
  When le propriétaire accorde une extension d'une tentative par la décision IH-07
  Then l'événement `budget.extended` porte `new_max_attempts` à 3

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; elle
fait seulement porter à l'événement de création une borne que la configuration valide déjà.

## 4. Tâches

### Tâche 1 — L'événement de création porte le budget de tentatives de la politique

`decide` écrit `max_attempts` de la politique active dans l'événement `change.created` ; `apply` le
lit pour initialiser `budgets.max_attempts`, et retombe sur la borne par défaut du noyau quand
l'événement n'en porte pas, pour que les registres déjà écrits se rejouent comme avant.

- Vérifie : `node --test test/v0-pure/change-rules.test.ts test/v2-kernel/harness.test.ts`
- Tient : `test/v0-pure/change-rules.test.ts`, « un changement s'ouvre avec le budget de tentatives de la politique : l'événement `change.created` et l'état portent 2, et une extension IH-07 d'une tentative écrit `new_max_attempts` à 3 » et « un `change.created` sans `max_attempts` se rejoue à 3 » ; `test/v2-kernel/harness.test.ts`, « un changement démarré sous `max_attempts` à 2 porte 2 dans l'événement du registre, une session rouverte relit 2 et la vue d'état annonce `Tentatives: 0/2` »
- Rouge : `decide` écrit `change.created` sans champ de budget et `apply` initialise `budgets.max_attempts` depuis `DEFAULT_POLICY` : sous une politique à 2, l'événement ne porte pas `max_attempts`, l'état porte 3, l'extension écrit `new_max_attempts` à 4 et la vue annonce `Tentatives: 0/3`

## 5. Hors périmètre

- Les changements déjà ouverts : leur événement `change.created` ne porte pas le budget, ils gardent
  la borne par défaut de 3 au rejeu, quelle que soit la configuration d'aujourd'hui.
- Un changement dont la configuration change après l'ouverture : il garde le budget de son ouverture.
- Les six autres bornes de `policy.budgets`, qui atteignent déjà l'exécution par la politique active.
- Les autres défauts ouverts du registre.
