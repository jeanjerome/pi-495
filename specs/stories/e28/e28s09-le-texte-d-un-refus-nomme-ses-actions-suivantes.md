# Le texte d'un refus du noyau nomme les actions qui en sortent

Story : e28s09
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-28T103200 du registre. Le propriétaire qui conduit un changement depuis
l'interface texte de Pi lit un refus du noyau comme `495 error: CODE: message` : les actions qui en
sortent (`pause`, `resume`, `cancel`) ne voyagent que dans les détails structurés du message, qu'un
client RPC ou JSON lit et qu'un écran ne montre pas. Une révocation refusée parce qu'une intervention
tourne ne dit pas que la pause est le chemin ; un `/495 verify` refusé sur un changement arrêté ne dit
pas si la reprise le lève ou si seule l'annulation en sort.

Le propriétaire gagne, à l'écran, ce que le canal structuré porte déjà : le texte du refus nomme ses
actions suivantes sous la forme `(next: …)` que le détail d'un arrêt montre déjà dans `/495 status`.
C'est un défaut : le noyau nomme ces actions pour celui qui doit agir, et celui qui lit l'écran est
celui-là.

## 2. Promesses

Scenario: Une révocation refusée nomme la pause dans son texte
  Given un changement dont la question Q1 est répondue et sur lequel une intervention tourne
  When le propriétaire demande `/495 revoke q1`
  Then le message affiché est « 495 error: OPERATION_ACTIVE: intervention <id> is running (next: pause) »
  And les détails du message portent toujours `next_actions: ["pause"]`

Scenario: Une commande refusée sur un changement arrêté nomme ses sorties dans son texte
  Given un changement arrêté `execution_error` dans sa vérification
  When le propriétaire demande `/495 verify`
  Then le message affiché est « 495 error: PRECONDITION_FAILED: change is blocked: execution_error (next: resume, cancel) »

Scenario: Un refus sans action suivante garde son texte
  Given un changement dont la question Q1 est répondue
  When le propriétaire demande `/495 revoke not-a-question`
  Then le message affiché est « 495 error: UNKNOWN_REFERENCE: question not-a-question does not exist », sans `(next:`

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; le
texte d'un refus ne gagne que les noms d'actions que ses détails portent déjà.

## 4. Tâches

### Tâche 1 — Le refus d'un acte sur une question nomme ses actions suivantes

Le texte qu'émet `actOnQuestion` (`src/extension/command.ts`) quand le noyau refuse une révocation ou une
clôture ajoute `(next: <actions>)` quand l'erreur en porte, et rien sinon. Le texte se construit comme le
détail d'un arrêt (`src/application/harness.ts`, la branche qui bloque sur l'erreur d'une étape) : une
seule fonction sert les deux.

- Vérifie : `node --test test/v3-pi/refusal-next-actions.test.ts`
- Tient : `test/v3-pi/refusal-next-actions.test.ts`, « une révocation refusée pendant qu'une intervention tourne affiche `495 error: OPERATION_ACTIVE: intervention <id> is running (next: pause)` et ses détails portent `next_actions: ["pause"]` ; une révocation d'une question inconnue affiche `495 error: UNKNOWN_REFERENCE: question not-a-question does not exist`, sans `(next:` »
- Rouge : sondé sur `main` à 1ca5674 avec `stalledOnQ1` puis un `intervention.started` ajouté au journal par `appendChange`, `/495 revoke q1` affiche « 495 error: OPERATION_ACTIVE: intervention int_probe is running », sans `(next: pause)`, alors que ses détails portent `next_actions: ["pause"]`

### Tâche 2 — Le refus d'une sous-commande nomme ses actions suivantes

Le texte qu'émet le gestionnaire de `/495` (`registerCommand495`, `src/extension/command.ts`) quand une
sous-commande lève une `DomainError` ajoute de même `(next: <actions>)` quand l'erreur en porte.

- Vérifie : `node --test test/v3-pi/refusal-next-actions.test.ts`
- Tient : `test/v3-pi/refusal-next-actions.test.ts`, « `/495 verify` sur un changement arrêté `execution_error` dans sa vérification affiche `495 error: PRECONDITION_FAILED: change is blocked: execution_error (next: resume, cancel)` »
- Rouge : sondé sur `main` à 1ca5674 avec le montage `atVerification` de `test/v3-pi/resume.test.ts` et un `change.block` `execution_error`, `/495 verify` affiche « 495 error: PRECONDITION_FAILED: change is blocked: execution_error », sans `(next: resume, cancel)`

## 5. Hors périmètre

- BUG-2026-09-28T163500 : le refus de phase nomme `expected_phase:<phase>`, qu'aucune sous-commande
  n'offre ; ce nom paraîtra désormais aussi dans le texte, et sa correction reste à sa propre story.
- La traduction des noms d'actions dans une session en français : le texte reprend les noms des
  sous-commandes `/495`, comme le détail d'un arrêt le fait déjà.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13.
