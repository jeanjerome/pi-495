# Une ligne mal formée du worker est ignorée sans faire tomber le processus de Pi

Story : e30s02
Epic : e30
Statut : en cours

## 1. Ce que le lecteur gagne

L'utilisateur qui conduit un changement depuis Pi partage son processus avec le superviseur qui
écoute le worker de 495. Le superviseur lit chaque ligne du worker comme un message du protocole et
ignore déjà une ligne qui n'est pas du JSON. Une ligne qui est du JSON sans être un message valide,
par exemple `{"type":"event"}` sans son événement, est lue sans garde : l'écouteur lève une
`TypeError` que personne ne rattrape, et c'est le processus de Pi qui tombe, avec la session de
l'utilisateur et tout ce qu'elle tenait. Le superviseur promet de rendre une intervention terminée,
réussie ou en échec, jamais de faire tomber son hôte : c'est un défaut, pas une préférence.

## 2. Promesses

Scenario: Un événement sans corps est ignoré et l'intervention se termine
  Given un worker qui écrit `{"type":"event"}`, puis termine son intervention normalement
  When le superviseur relaie les événements de l'intervention
  Then les événements relayés sont `started`, `tool_started`, `tool_finished` et `completed`
  And aucune exception ne sort de l'écouteur du superviseur

Scenario: Un message JSON qui n'est pas un objet est ignoré comme une ligne illisible
  Given un worker qui écrit la ligne `null`, puis termine son intervention normalement
  When le superviseur relaie les événements de l'intervention
  Then les événements relayés se terminent par `completed`

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données. Le
worker est le code de 495 ; la garde porte sur la forme de ce qu'il écrit, pas sur sa confiance.

## 4. Tâches

### Tâche 1 — Le superviseur garde chaque message avant de le lire

Le superviseur vérifie qu'une ligne analysée est un objet dont le type est `event` et dont l'événement
est un objet avant de lire son type ; sinon il l'ignore, comme une ligne qui n'est pas du JSON. Le
worker factice des tests gagne un mode qui écrit ces lignes mal formées avant de terminer.

- Vérifie : `node --test test/v1/worker-malformed-line.test.ts`
- Tient : `test/v1/worker-malformed-line.test.ts`, « un worker qui écrit `{"type":"event"}` puis termine voit ses événements relayés `started`, `tool_started`, `tool_finished`, `completed` » et « un worker qui écrit `null` puis termine voit ses événements se terminer par `completed` »
- Rouge : l'écouteur de lignes de `PiWorkerAgent` lit `msg.event.type` sur `{"type":"event"}` et lève `TypeError: Cannot read properties of undefined (reading 'type')`, que rien ne rattrape : le test échoue sur cette exception avant que l'intervention ne se termine ; sur `null`, `msg.type` lève de même

## 5. Hors périmètre

- La validation complète de chaque événement contre le contrat des événements d'intervention : la
  story garde la forme dont la lecture dépend, pas le contenu de chaque champ.
- Les messages que le worker reçoit du superviseur.
- Les autres constats de l'audit du 2026-10-01 sur le superviseur, traités en reprises
  (`specs/reprises.md`).
