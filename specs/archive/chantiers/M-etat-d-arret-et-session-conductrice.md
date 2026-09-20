# Transverse M — l'état d'arrêt d'un changement, et la session qui le conduit

**État :** ouvert
**Objet :** un changement bloqué repasse à `ready` sans que rien ne le débloque, et deux sessions
conduisent le même changement sans qu'aucun bail ne soit pris
**Ne dépend d'aucun étage**

## Motif

Campagne `~/.495-campagnes/java-flashnext-L2`, 19 septembre 2026, cible Maven multi-module avec
`Qwen3.8-Flash-Next-MLX-oQ4-MTP`. Les deux constats sont apparus ensemble et tiennent à la même
question : qui conduit un changement, et ce que son état dit de lui.

**Un changement bloqué se débloque de lui-même.** `apply.ts` projette `intervention.finished` ainsi :

```ts
case "intervention.finished":
    s.interventions = s.interventions.map(…);
    s.status = "ready";
```

Sans condition. Une intervention restée `running` après l'arrêt d'une session est close par `resume`,
et cette clôture fait passer le changement de `blocked` à `ready` **sans émettre `change.unblock`**.
Trois conséquences, toutes observées dans le journal de la campagne. Les gardes de `changeUnblock`
— tentatives épuisées, effet d'intégration incertain — sont contournées, puisque la commande n'est
jamais soumise. La branche de `resume` qui lève un blocage n'est jamais atteinte, l'état n'étant
déjà plus bloqué quand elle est évaluée. Et `stop_reason`, `stop_detail` et `stop_retryable` gardent
leur valeur : le changement a tourné pendant dix minutes en affichant `status=running`
`stop=execution_error retryable=true`, motif d'un blocage que personne n'avait levé.

Un journal rejoué donne donc un état où le statut et le motif d'arrêt se contredisent, et la lecture
d'un dossier y croit.

**Aucun bail n'est jamais pris.** `acquireLease`, `renewLease`, `releaseLease` et `currentLease` sont
déclarés au port du journal et écrits dans l'adaptateur SQLite, avec la table `leases`, le scope
`change:<id>`, un propriétaire unique et une reprise après expiration. Aucun appelant en dehors de
`test/v2/ledger.test.ts` : l'exclusion est écrite et jamais demandée.

Deux sessions Pi ont conduit `chg_mu8k6f3k537d7f5266` en même temps — un TUI et une invocation en
mode JSON sur le même `HARNESS495_DATA_DIR`. Toutes deux ont lancé une intervention `specify` sur le
même changement. Ce qui les a arrêtées est la concurrence optimiste du journal : la seconde écriture
a rendu `REVISION_CONFLICT: aggregate … is at revision 65, expected 63`, que `advance` a classé en
`execution_error` et qui a **bloqué le changement**. La table `leases` est restée vide du début à la
fin.

`UX-05` demande qu'une autre session ne puisse « ni reprendre silencieusement un travail ni en
démarrer un second exemplaire concurrent ». Ce qui tient aujourd'hui, c'est qu'aucune des deux
écritures concurrentes ne corrompt le journal ; ce qui ne tient pas, c'est qu'un second conducteur
est admis jusqu'à l'écriture, y consomme une intervention de modèle, et que le prix de la collision
est payé par le changement.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/chantiers/M-etat-d-arret-et-session-conductrice.md, puis
la section « La reprise d'une sortie refusée, et le report des réponses » de specs/archive/QUALIFICATION.md.

Dans le code : apply.ts dans src/domain/change/, cas intervention.finished ; changeUnblock et
block dans src/domain/change/decide.ts ; resume et advance dans src/application/harness.ts ;
acquireLease / renewLease / releaseLease dans src/ports/ledger.ts et
src/adapters/storage-sqlite/ledger.ts ; la table leases dans src/adapters/storage-sqlite/schema.ts.

Le dossier de la campagne est dans ~/.495-campagnes/java-flashnext-L2 : il porte les deux
REVISION_CONFLICT, l'intervention orpheline close par resume, et la suite d'événements où un
changement tourne en portant encore un stop_reason. Cite-le plutôt que de supposer.

Deux travaux.

1. Ce qu'une intervention finie dit du statut. Écris d'abord le test qui échoue : un changement
   bloqué dont l'intervention est close ne doit pas devenir prêt sans qu'un déblocage ait été
   décidé, et son motif d'arrêt ne doit pas survivre à une reprise. Décide ensuite lequel des
   deux porte la correction — la projection cesse de statuer sur un changement bloqué, ou
   resume clôt puis débloque explicitement — et écris pourquoi. Le critère est qu'aucun chemin
   ne rende `ready` un changement dont changeUnblock aurait refusé la levée.

2. Le conducteur d'un changement. Décide si l'exclusion écrite doit être prise, et à quel grain :
   le changement, le programme, ou l'intervention. Si elle est prise, dis ce qu'une session
   seconde reçoit — un refus nommé, pas un REVISION_CONFLICT — et ce qu'il advient d'un bail dont
   le porteur est mort. Si elle ne doit pas l'être, dis ce qui tient UX-05 à sa place, et retire
   le code mort.

Critères d'acceptation :
- un test déterministe couvre un changement bloqué dont l'intervention est close, et échoue sur
  le comportement actuel ;
- un changement qui tourne ne porte plus le motif d'arrêt d'un blocage non levé ;
- la décision sur le bail est écrite, quelle qu'elle soit, et le code mort n'y survit pas ;
- npm run build puis npm run check passent.
```

## Critères d'acceptation

- un test déterministe couvre un changement bloqué dont l'intervention est close, et échoue sur le
  comportement actuel ;
- un changement qui tourne ne porte plus le motif d'arrêt d'un blocage non levé ;
- la décision sur le bail est écrite, quelle qu'elle soit, et le code mort n'y survit pas ;
- `npm run build` puis `npm run check` passent.

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Statut rendu prêt par la fin d'une intervention | `src/domain/change/apply.ts`, `intervention.finished` |
| Gardes de la levée d'un blocage | `src/domain/change/decide.ts`, `changeUnblock` |
| Clôture d'une intervention orpheline | `src/application/harness.ts`, `resume` |
| Classement d'un conflit de révision | `src/application/harness.ts`, `advance` (catch) |
| Exclusion écrite et jamais prise | `src/ports/ledger.ts` ; `src/adapters/storage-sqlite/ledger.ts` ; `src/adapters/storage-sqlite/schema.ts`, table `leases` |
| Dossier de la campagne | `~/.495-campagnes/java-flashnext-L2` |

## Journal

**19 septembre 2026.** Ouverture. Les deux constats viennent de la campagne `java-flashnext-L2`,
conduite pour éprouver la reprise d'une sortie structurée refusée. Le déblocage silencieux a été vu
en cherchant par quoi un changement était reparti : le journal ne portait aucun `change.unblock`, et
la remise à `ready` venait de la clôture de l'intervention. La collision de sessions a été provoquée
par l'opérateur — un TUI ouvert pendant qu'une invocation en mode JSON conduisait le même changement
—, ce qui n'ôte rien au fait qu'aucun bail n'a été pris ni au prix payé par le changement.
