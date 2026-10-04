# Un refus hors de sa phase dit la phase attendue sans la donner pour une action

Story : e28s11
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-28T163500 du registre. Le propriétaire qui demande à `/495` une opération
que la phase du changement n'admet pas, `/495 close q1` sur un changement en vérification ou
`/495 verify` sur un changement en clarification, lit aujourd'hui
« 495 error: INVALID_TRANSITION: operation question.close is not allowed in phase verifying (next:
expected_phase:clarifying) ». Depuis que le texte d'un refus reprend ses actions suivantes, ce
`expected_phase:clarifying` s'y présente comme une action à prendre, alors qu'aucune sous-commande de
`/495` ne s'appelle ainsi ; un client RPC, qui lit les mêmes `next_actions` dans les détails
structurés du message, reçoit la même action inexistante.

Le propriétaire et le client RPC gagnent un refus dont les actions suivantes ne nomment que ce qu'ils
peuvent faire, et dont le texte dit toujours dans quelle phase l'opération est admise. C'est un défaut
et non une préférence : une action suivante est une sous-commande à lancer, et celle-ci n'existe pas.

## 2. Promesses

Scenario: Une clôture de question hors de la clarification dit la phase attendue sans action suivante
  Given un changement en phase `verifying`
  When le propriétaire lance `/495 close q1`
  Then le message est « 495 error: INVALID_TRANSITION: operation question.close is not allowed in phase verifying; it is allowed in clarifying », sans `(next: …)`
  And les détails structurés du message portent `next_actions: []`

Scenario: Une vérification demandée hors de ses phases nomme toutes les phases qui l'admettent
  Given un changement en phase `clarifying`, arrêté sur la question q1
  When le propriétaire lance `/495 verify`
  Then le message est « 495 error: INVALID_TRANSITION: operation verification.rerun is not allowed in phase clarifying; it is allowed in deciding, reviewing, verifying », sans `(next: …)`
  And les détails structurés du message portent `next_actions: []`

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; le
noyau refuse les mêmes opérations dans les mêmes phases, seuls le texte du refus et ses actions
suivantes changent.

## 4. Tâches

### Tâche 1 — Le refus de phase nomme la phase attendue dans son texte, et aucune action suivante

`requirePhase` (`src/domain/change/decide.ts`) refuse sans action suivante, au lieu de
`expected_phase:<phases>`, et son message ajoute, après « operation <commande> is not allowed in phase
<phase> », « ; it is allowed in » suivi des phases admises, séparées par une virgule. Le texte que
`/495` affiche (`DomainError.toText()`) et les détails structurés reprennent ce refus sans autre
changement.

- Vérifie : `node --test test/v3-pi/phase-refusal.test.ts`
- Tient : `test/v3-pi/phase-refusal.test.ts`, « `/495 close q1` sur un changement en `verifying` affiche `495 error: INVALID_TRANSITION: operation question.close is not allowed in phase verifying; it is allowed in clarifying` et ses détails portent `next_actions: []` ; `/495 verify` sur un changement arrêté sur q1 en `clarifying` affiche `495 error: INVALID_TRANSITION: operation verification.rerun is not allowed in phase clarifying; it is allowed in deciding, reviewing, verifying` et ses détails portent `next_actions: []` »
- Rouge : sondé sur `main` à ee31494 avec les montages `atVerification` et `stalledOnQ1` de `test/helpers/command-fixture.ts` : `/495 close q1` affiche « 495 error: INVALID_TRANSITION: operation question.close is not allowed in phase verifying (next: expected_phase:clarifying) », détails `next_actions: ["expected_phase:clarifying"]` ; `/495 verify` affiche « 495 error: INVALID_TRANSITION: operation verification.rerun is not allowed in phase clarifying (next: expected_phase:deciding|reviewing|verifying) », détails `next_actions: ["expected_phase:deciding|reviewing|verifying"]`

## 5. Hors périmètre

- Proposer une sous-commande qui mène à la phase attendue : aucune ne fait passer un changement d'une
  phase à une autre sur demande, et en choisir une serait une décision de produit que l'entrée ne
  demande pas.
- Le refus du rôle d'une intervention hors de sa phase (« role <rôle> is not allowed in phase
  <phase> ») : il ne porte aucune action suivante et n'est pas l'objet de l'entrée.
- La traduction du texte des refus du noyau dans une session en français : ils restent en anglais,
  comme tous les refus du noyau.
- Les autres défauts ouverts du registre, dont BUG-2026-09-28T163300, dont la correction n'ajoute que
  des tests sans rouge à voir.
