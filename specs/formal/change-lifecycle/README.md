# Modèle du cycle de vie d'un changement

`ChangeLifecycle.tla` spécifie l'acceptation d'un changement par le noyau : un candidat vérifié sous une
révision gelée du protocole, des contrôles qui répondent en retard, une révision du protocole, une
interruption et sa reprise, une correction dans un budget de tentatives, et G5 qui accepte sur les preuves
qu'il retient. Le modèle abstrait le noyau ; il ne reproduit pas le runtime. Un PASS porte sur le modèle sous
ses bornes, jamais sur le code qu'il décrit.

## Ce que le modèle représente

| Élément | Dans le modèle |
|---|---|
| Identités de candidat | `1..MaxAttempts` : la tentative `i` gèle soit l'arbre précédent, donc la même identité, soit un candidat d'identité `i` |
| Révisions du protocole | `1..MaxRevisions` ; une révision invalide toutes les preuves et révoque les décisions sur le candidat |
| Contrôles | `Controls`, deux au moins ; deux obligations obligatoires, `all` et `any`, portent sur eux |
| Résultats tardifs | un contrôle lancé reste en vol jusqu'à son résultat, qui peut arriver après une révision, une correction, une interruption ou une reprise |
| Interruption et reprise | `Pause` garde le statut au point de reprise, `Resume` le rétablit ; au plus `MaxInterruptions` |
| Politique | `humanPolicy`, choisie à l'état initial : G5 exige ou non une acceptation humaine (IH-10) |
| Décision humaine | seule l'action `HumanAnswer` enregistre une réponse humaine ; aucune autre sortie n'en tient lieu |

Le modèle commence au candidat de la première tentative, gelé sous la première révision : G0 à G4 le
précèdent. Une révision ramène à `qualification`, puis `Requalify` abstrait G2 et G3.

Les propriétés jugent ce sur quoi un contrôle a réellement tourné (`ran`), qu'aucune transition ne lit. Les
transitions proposent de préserver une règle ; les propriétés disent ce qui doit l'être.

## Propriétés

| Propriété | Ce qu'elle exige | Règles |
|---|---|---|
| `FreshAcceptance` | une acceptation ne repose que sur des contrôles exécutés sur le candidat accepté, sous la révision en vigueur | RM-018, RM-070, SA-034 |
| `AcceptanceNeedsObligations` | une acceptation repose sur des preuves qui satisfont chaque obligation par sa règle de combinaison ; un budget épuisé n'y change rien | RM-036, RM-019, RM-032 |
| `AttemptBudget` | jamais plus de tentatives que le budget, et l'arrêt seulement une fois le budget consommé | RM-032 |
| `HumanAcceptance` | sous une politique qui l'exige, le candidat accepté porte une acceptation humaine valide de ce candidat-là | RM-040, RM-037, SA-031 |
| `HumanProvenance` | une décision valide n'est enregistrée que par une réponse humaine : aucune étape du noyau n'en enregistre une à la place d'un humain | SA-030, RM-040 |
| `CountersNeverReset` | une reprise, une révision ou une correction ne rend aucune tentative ni interruption consommée | RM-034, RM-023 |
| `StopIsFinal` | un changement arrêté par son budget épuisé n'est jamais accepté ensuite | RM-032 |
| `Progress` | sous la seule hypothèse que le noyau et les contrôles avancent, le changement finit accepté, arrêté ou en attente d'un humain | PF-17 |

`manifest.json` relie chaque invariant obligatoire à ses règles et aux actions qui doivent le préserver, et
chaque action du modèle à la commande publique du noyau qui la réalise et au code qui l'exécute
(`change/decide.ts`, `change/apply.ts`, `invalidation.ts`, `gates/g5.ts`).
`test/v0-pure/formal-model-manifest.test.ts` confronte cette table au modèle, aux règles de
`specs/amont/specification-fonctionnelle.md` et au code du noyau.

## Hypothèses

`KernelAndControlsProceed` suppose que tout contrôle lancé finit par répondre, et que le noyau franchit toute
étape qui reste possible. Rien n'est supposé d'un humain : une interruption, une révision, une reprise ou une
réponse peut ne jamais venir, et une attente humaine est un état légitime. `HumansRespond` est l'hypothèse
explicite, séparée, sous laquelle une attente humaine se termine.

Aucune des deux hypothèses ne suffit seule à conclure, ni l'hypothèse du noyau complétée d'une seule moitié de
celle des humains. Sous `Spec` et la seule reprise (`assumptions/KernelAndResume.tla`), `Settles` est réfutée :
un changement peut attendre une décision humaine sans fin. Sous `Spec` et la seule réponse
(`assumptions/KernelAndAnswer.tla`), elle l'est aussi : un changement interrompu peut ne jamais reprendre. Sous
`HumansRespond` seule (`assumptions/HumansAlone.tla`), elle l'est encore : un noyau qui n'avance pas ne conclut
rien. Une équité sur la reprise ou sur la réponse glissée dans `KernelAndControlsProceed` rendrait `completed`
l'exploration qui n'en suppose que l'autre ; une hypothèse humaine qui supposerait la conclusion rendrait
`completed` celle des humains seuls.

## Explorations

Toutes portent sur le même domaine fini : `Controls = {k1, k2}`, `MaxAttempts = 2`, `MaxRevisions = 2`,
`MaxInterruptions = 1`, les deux politiques d'acceptation. Chaque manifeste approuve le modèle et sa
configuration par leur sha256, nomme les propriétés exigées, le TLC approuvé et le budget d'une exécution
(120 s, 4 Mio de sortie, un worker, 512 Mio de tas).

| Manifeste | Configuration | Issue attendue |
|---|---|---|
| `manifest.json` | `ChangeLifecycle.cfg` : les invariants, `CountersNeverReset`, `StopIsFinal`, `Progress` et `HumanProvenance` sous `Spec` | `completed` |
| `humans-respond.manifest.json` | `HumansRespond.cfg` : `Settles` sous `SpecHumansRespond` | `completed` |
| `kernel-and-resume.manifest.json` | `assumptions/KernelAndResume.cfg` : `Settles` sous `Spec` et la seule reprise | `counterexample`, une attente de décision sans fin |
| `kernel-and-answer.manifest.json` | `assumptions/KernelAndAnswer.cfg` : `Settles` sous `Spec` et la seule réponse | `counterexample`, une interruption sans fin |
| `humans-alone.manifest.json` | `assumptions/HumansAlone.cfg` : `Settles` sous `HumansRespond` seule | `counterexample`, un noyau qui n'avance pas |
| `reach-acceptance.manifest.json` | `reach/Acceptance.cfg` : la sonde `AcceptanceIsUnreachable` | `counterexample`, un chemin vers l'acceptation |
| `reach-refusal.manifest.json` | `reach/Refusal.cfg` : la sonde `RefusalIsUnreachable` | `counterexample`, un chemin vers un refus de G5 |
| `reach-human-wait.manifest.json` | `reach/HumanWait.cfg` : la sonde `HumanWaitIsUnreachable` | `counterexample`, un chemin vers une attente IH-10 |
| `reach-stop.manifest.json` | `reach/Stop.cfg` : la sonde `StopIsUnreachable` | `counterexample`, un chemin vers l'arrêt sur budget épuisé |

Une sonde dit qu'une issue est inaccessible ; le contre-exemple que TLC lui oppose est le chemin qui
l'atteint. Elle vérifie à part que les propriétés ne sont pas vraies par vacuité.

```sh
node scripts/check-formal.ts specs/formal/change-lifecycle/manifest.json --jar <tla2tools.jar>
```

`node --test test/v4-platform/change-model.test.ts` lance ces huit explorations avec le TLC réel ; il se
déclare sauté, avec la raison, quand le jar ou Java manque (`specs/formal/fixtures/tlc/README.md`).

## Mutants et contre-exemples conservés

Un mutant est un noyau volontairement faux, rangé sous `mutants/` hors du modèle adopté : il étend
`ChangeLifecycle` d'une transition fautive et s'explore sous les invariants et le domaine de l'exploration
adoptée. Il doit violer la propriété qu'on lui désigne, et celle-là seule ; sa trace normalisée, chaque
action nommée par son opérateur, est conservée sous `counterexamples/`, liée à cette propriété.

| Mutant | Transition fautive | Propriété violée | Trace |
|---|---|---|---|
| `mutant-stale-proof.manifest.json` | `ResumeAdoptingRuns` : à la reprise, les contrôles encore en vol sont adoptés sous la révision en vigueur | `FreshAcceptance` | `counterexamples/stale-proof.json` |
| `mutant-accept-exhausted.manifest.json` | `AcceptWhenExhausted` : G5 échoué et budget épuisé, le changement est clos accepté au lieu d'être arrêté | `AcceptanceNeedsObligations` | `counterexamples/accept-exhausted.json` |
| `mutant-forged-acceptance.manifest.json` | `ResumeRecordingAcceptance` : à la reprise d'une attente IH-10, le noyau enregistre lui-même l'acceptation demandée | `HumanProvenance` | `counterexamples/forged-acceptance.json` |

La trace de preuve périmée lance les deux contrôles sous P1, révise le protocole vers P2, regèle le même
candidat, interrompt, reprend par la transition fautive, reçoit les deux résultats P1 et laisse G5 accepter
sur eux. `node --test test/v4-platform/change-model-mutants.test.ts` explore chaque mutant avec le TLC réel,
vérifie la propriété violée et la trace conservée, et vérifie qu'un mutant syntaxiquement faux rend `error`,
jamais la violation attendue. Une trace ne change qu'avec le modèle ou le mutant ; elle se régénère alors avec
`exploreManifest` et `normalisedTrace` (`test/helpers/check-formal.ts`).

## Ce que le modèle laisse de côté

- les verdicts `INDETERMINATE` et `NOT_RUN` d'un contrôle : ils bloquent G5 comme `FAIL` mais appellent une
  résolution d'incident plutôt qu'une correction ;
- les revues requises, l'arbitrage IH-08, l'environnement de vérification, la stagnation ;
- l'extension de budget IH-07 : un changement arrêté par son budget le reste ;
- l'intégration Git (G6) et tous les autres états de pi-495.

## Constats à arbitrer

Écarts relevés entre le texte normatif et le noyau en écrivant le modèle. Le modèle suit le noyau ; aucune
règle n'a été modifiée.

1. **Les preuves d'un candidat remplacé restent valides.** La table de
   `specs/amont/specification-fonctionnelle.md` §6.4 invalide « G4, mesures, revues, G5 et G6 » quand un
   fichier du candidat change. `invalidationFor` (`src/domain/invalidation.ts`, cause `candidate_replaced`)
   n'invalide ni preuves ni revues : G5 les écarte par l'empreinte du candidat. `FreshAcceptance` tient dans
   le modèle, mais une correction qui gèle un arbre identique retrouve les preuves de l'ancien candidat,
   ce que la lettre de §6.4 exclut. À trancher : l'identité du candidat fait-elle foi, ou la règle ?
2. **Une révision lève une pause sans reprise.** `artifact.revise` est accepté sur un changement en pause
   (`requireActive`), et l'événement `artifact.revised` remet le statut à `ready`
   (`src/domain/change/apply.ts`) : le point de reprise est abandonné sans `change.resume`. PF-17 fait
   repartir le changement du dernier point cohérent à la reprise ; le texte ne dit pas si une révision en
   tient lieu.
