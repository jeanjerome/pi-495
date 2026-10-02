# Une seule session Pi conduit un changement, et une session disparue ne le retient pas

Story : e09s01
Epic : e09
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui ouvre deux sessions Pi sur le même dossier de données, un TUI et une session
lancée en mode JSON par exemple, peut aujourd'hui faire conduire le même changement par les deux.
Rien ne l'en empêche : le journal porte une table de baux, écrite et testée, qu'aucun appelant ne
prend. Mesuré sur la révision `014cfd7` : pendant qu'une intervention tourne dans la première
session, `/495 resume` dans la seconde la clôt comme « échouée, la session s'est arrêtée » et rend le
changement prêt ; la seconde le conduit, son écriture suivante perd la course de concurrence
(`REVISION_CONFLICT`) et le changement est bloqué en `execution_error`. Pendant ce temps, le modèle de
la première session travaille toujours, pour une intervention que le dossier dit finie.

Le dossier relu ensuite affirme donc deux choses fausses : qu'une session s'est arrêtée alors
qu'elle tournait, et qu'une erreur d'exécution a arrêté le changement alors qu'il s'agit de deux
sessions qui se le disputaient. C'est un défaut et non une préférence : la conception technique
(§12.1) n'autorise qu'un seul producteur par changement, et le code ne tient pas cette règle.

## 2. Promesses

Scenario: Une seconde session ne reprend pas un changement qu'une autre conduit
  Given une première session dont une intervention tourne sur le changement
  When une seconde session sur le même dossier de données demande sa reprise
  Then la reprise est refusée avec `OPERATION_ACTIVE`, le message dit qu'une autre session Pi conduit le changement et jusqu'à quelle heure au plus tard, et l'intervention de la première session est toujours en cours dans le journal

Scenario: Aucun acte d'une seconde session n'écrit sur un changement qu'une autre conduit
  Given une première session qui conduit le changement
  When une seconde session demande d'avancer, de vérifier, de répondre à une décision, de clore ou de révoquer une question, de mettre en pause ou d'annuler
  Then chaque acte est refusé avec `OPERATION_ACTIVE`, et la révision du changement n'a pas bougé

Scenario: Un changement que plus personne ne conduit s'écrit aussitôt
  Given une première session qui a fini de conduire le changement
  When une seconde session en demande la reprise
  Then la reprise est acceptée sans attente

Scenario: Une session disparue ne retient pas le changement
  Given une première session qui s'est arrêtée sans rendre la main pendant qu'une intervention tournait
  When une seconde session demande la reprise une fois le délai de la première écoulé
  Then la reprise est acceptée et l'intervention de la première session est close comme échouée, comme aujourd'hui

Scenario: Une session qui a perdu le changement n'y écrit plus
  Given une première session dont le délai s'est écoulé sans qu'elle le renouvelle, et une seconde qui a repris le changement
  When la première tente d'écrire sur le changement
  Then son écriture est refusée avec `OPERATION_ACTIVE`, et elle ne bloque pas le changement

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données, ni
chemins protégés ; elle borne qui écrit le journal, pas ce qui y est écrit.

## 4. Tâches

### Tâche 1 — La session qui conduit un changement le tient, et une seconde est refusée

Chaque acte qui écrit sur un changement (avancer, vérifier, répondre, clore, révoquer, mettre en
pause, reprendre, annuler) prend le bail `change:<id>` au nom de sa session pour la durée de l'acte et
de la conduite qui le suit, le renouvelle tant qu'il dure, et le rend à la fin. Un bail tenu par une
autre session et non échu refuse l'acte avant toute écriture, avec `OPERATION_ACTIVE` et l'heure à
laquelle il échoit. Un bail échu se prend. La lecture (état, rapport, revue) ne prend pas de bail.

- Vérifie : `node --test test/v2-kernel/conducting-session.test.ts`
- Tient : `test/v2-kernel/conducting-session.test.ts`, « une seconde session qui reprend le changement pendant qu'une intervention de la première tourne est refusée avec OPERATION_ACTIVE, et l'intervention de la première est toujours en cours », « avancer, vérifier, répondre, clore, révoquer, mettre en pause et annuler depuis une seconde session sont refusés, et la révision du changement n'a pas bougé », « une seconde session reprend sans attendre un changement que la première a fini de conduire » et « une seconde session reprend un changement dont la première a disparu une fois son bail échu, et l'intervention de la première est close comme échouée »
- Rouge : `resume` de la seconde session clôt l'intervention de la première comme échouée et rend le changement prêt, sans rien demander ; aucun appelant ne prend de bail

### Tâche 2 — Une session qui a perdu son bail n'écrit plus

Une écriture sur le journal vérifie que sa session tient le bail du changement ; sinon elle est
refusée avec `OPERATION_ACTIVE`, et la session qui la tentait s'arrête sans écrire le blocage du
changement.

- Vérifie : `node --test test/v2-kernel/conducting-session.test.ts`
- Tient : `test/v2-kernel/conducting-session.test.ts`, « une session dont le bail a échu et a été repris par une autre voit son écriture suivante refusée avec OPERATION_ACTIVE, et le changement n'est pas bloqué par elle »
- Rouge : l'écriture de la première session, faite sur une révision dépassée, perd la course (`REVISION_CONFLICT`) et la boucle de conduite bloque le changement en `execution_error` par-dessus ce que la seconde a écrit

## 5. Hors périmètre

- Arrêter depuis une seconde session un changement qu'une autre conduit : refusé comme tout autre
  acte. Le journal ne peut pas arrêter le modèle d'un autre processus ; la session qui conduit
  s'interrompt où elle tourne, ou en fermant Pi, et son bail échoit ensuite.
- Le délai après lequel une session disparue rend le changement : une valeur fixe du noyau, sans
  réglage de configuration.
- Un seul rédacteur par programme (conception technique §12.1) : P0 conduit un changement à la fois.
- Un changement bloqué qui repassait prêt à la fin d'une intervention, première moitié de l'objet de
  l'epic : déjà tenu, un blocage clôt l'intervention qui tourne (`test/v0-pure/change-rules-decisions.test.ts`,
  « ends the running intervention when it blocks a change »).
