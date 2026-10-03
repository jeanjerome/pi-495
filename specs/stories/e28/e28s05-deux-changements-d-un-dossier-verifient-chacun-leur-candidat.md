# Deux changements d'un dossier vérifient chacun leur candidat, même identique

Story : e28s05
Epic : e28
Statut : en cours

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-03T134500 du registre. Le propriétaire qui conduit plusieurs changements
dans un même dossier — les incréments d'un programme, ou une demande reprise après qu'un premier
changement a été clos — voit aujourd'hui le second bloqué à sa vérification dès que son candidat est
identique à celui d'un changement précédent, au même nombre d'événements : la clé sous laquelle la
vérification s'inscrit ne nomme que le candidat et la révision, le registre des opérations est commun à
tous les changements du dossier, et il refuse la vérification du second comme une répétition de celle du
premier. Le changement s'arrête sur `execution_error`, sans preuve, alors qu'aucune de ses vérifications
n'a tourné.

Le propriétaire gagne un second changement vérifié comme le premier, avec ses propres preuves, quel que
soit le candidat qu'un autre changement du dossier a produit ; une répétition reste reconnue, mais
seulement dans le changement qui a lancé la vérification.

## 2. Promesses

Scenario: Le second changement d'un dossier vérifie un candidat identique à celui du premier
  Given un dossier où le changement A a été conduit jusqu'à sa clôture, accepté, sur un candidat qui réécrit `src/greet.js`
  And un changement B ouvert ensuite dans le même dossier, sur le même projet, dont le producteur écrit le même `src/greet.js`
  When B est conduit jusqu'à sa vérification
  Then B inscrit les preuves de sa vérification et se clôt accepté
  And aucune étape de B ne nomme `OPERATION_ACTIVE`
  And le registre des opérations porte une vérification pour A et une pour B, chacune rattachée à son changement

Scenario: Une répétition reste refusée dans le changement qui a lancé la vérification
  Given le changement A, dont la vérification est inscrite au registre des opérations sous sa clé
  When une seconde opération de vérification de A est ouverte sous la même clé
  Then le registre la refuse avec le message « already holds the idempotency key », qui nomme l'opération de A

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; la clé
continue de refuser une seconde vérification dans le changement qui l'a ouverte.

## 4. Tâches

### Tâche 1 — La clé de la vérification nomme le changement

La vérification s'inscrit sous une clé qui nomme, outre le candidat et la révision, le changement qui la
lance (`src/application/phases/verify.ts`), pour qu'un second changement du dossier dont le candidat est
identique n'atteigne pas la clé du premier. Le commentaire de la clé et celui de `projectOperation`
(`src/adapters/storage-sqlite/ledger.ts`) suivent le changement.

- Vérifie : `node --test test/v2-kernel/verification-key-per-change.test.ts`
- Tient : `test/v2-kernel/verification-key-per-change.test.ts`, « deux changements d'un dossier dont les candidats sont identiques vérifient chacun le leur : B inscrit ses preuves et se clôt accepté, aucune étape ne nomme OPERATION_ACTIVE, le registre porte une vérification pour A et une pour B, et une seconde ouverture sous la clé de A, dans A, est refusée en nommant l'opération de A »
- Rouge : B s'arrête `blocked` sur `execution_error`, sans preuve, à l'étape « verifying: OPERATION_ACTIVE operation op_0030 already holds the idempotency key verify:sha256:d062943d…ac051:37; op_0065 would run the same verification a second time » (sondé sur `main` à 0936f94 avec `makeHarness`, `trackedProject` et un producteur qui écrit le même `src/greet.js` pour A puis pour B)

## 5. Hors périmètre

- La clé de l'état des lieux (`survey:<digest de la référence>:<révision>`), qui a la même forme et bloque
  un second état des lieux du même arbre : BUG-2026-10-03T220000, inscrit à part au registre.
- La clé de l'intégration, qui nomme la tête de destination et dont aucun défaut n'est inscrit.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13.
