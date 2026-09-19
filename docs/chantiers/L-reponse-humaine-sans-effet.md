# Transverse L — la réponse à une question matérielle, et l'exigence qui l'ignore

**État :** corrigé dans le noyau, éprouvé en campagne jusqu'au rapport de spécification ; aucun gate
franchi depuis
**Objet :** une réponse `IH-01` est enregistrée, attribuée, portée au mandat — et n'atteint pas les
exigences : le noyau réemploie le rapport de spécification écrit avant elle, puis gèle un protocole
dont l'oracle exige le contraire de ce que l'humain a décidé
**Ne dépend d'aucun étage ; il commande l'ordre devant `chantiers/F`**

## Motif

Campagne du 18 au 19 septembre 2026 sur la cible Maven multi-module avec
`Qwen3.8-Flash-Next-MLX-oQ4-MTP`, conduite de la demande à l'acceptation. Le changement
`chg_mu77jd604d4bf66034` est `accepted`, `G0…G5 PASS`, quatre contrôles verts — et il rend `400` là
où son propriétaire avait décidé `422`.

**La chaîne, telle que le journal la porte.**

| Heure | Fait |
| --- | --- |
| 17:10:50.008 | l'unique intervention `specify` finit ; son rapport porte `R1`…`R5`, cinq hypothèses et quatre questions matérielles |
| 17:10:50.19 | le noyau ouvre `Q1`…`Q4` en `IH-01` |
| 17:11:52 → 17:14:02 | les quatre réponses sont enregistrées ; `Q3` reçoit « 422 avec par exemple 'Name cannot be longer than 50 characters' » |
| 17:14:43.021 | mandat adopté à G0 |
| 17:14:43.029 | exigences adoptées à G1 |
| 18:10:40 | préparation adoptée |
| 18:11:12 | protocole gelé |
| 09:49:43 (19/09) | candidat accepté |

**Le mandat se contredit lui-même.** Adopté à G0, `mnd_mu77xww51dde0cf935` porte les quatre réponses
mot pour mot, dont « 422 ». Son objectif, dans le même artefact, dit : « en transmettant ce refus
jusqu'à la frontière HTTP (**400** + message) ».

**Les exigences sont le rapport antérieur, inchangé.** `rqs_mu77xwwg1fd4795496`, proposé 8 ms après le
mandat et adopté à G1, est le rapport du 17:10:50 — écrit avant toute réponse. Il porte `R3` : « un
refus de longueur est exposé au client par un **400** portant un message d'erreur non vide » ; son
hypothèse 2 : « ValidationException → 400 » ; son hypothèse 5 : « l'extension éventuelle à la mise à
jour est traitée comme **question ouverte, pas comme acquis** », alors que `Q1` avait été répondue
trois minutes plus tôt.

**Le protocole gèle ensuite le contraire de la décision.** La préparation adoptée écrit
`UserNameLength.feature`, qui assère `400` en égalité stricte et l'annonce dans son propre en-tête.
G2 gèle cette suite comme oracle. Le candidat lève `ValidationException`, que
`GlobalExceptionHandler` mappe sur `HttpStatus.BAD_REQUEST`. Le contrôle qui existe n'a donc pas
manqué la décision humaine : il exige activement son contraire.

**Aucun gate ne pouvait le voir.** La suite est discriminante — `FAIL` sur la référence nue —, chaque
obligation est couverte, les quatre capteurs sont qualifiés et verts. La discrimination ne dit rien
du contrat : une suite qui assère `400` échoue sur une référence sans borne de longueur exactement
comme une suite qui assère `422`.

**Le producteur n'est pas en cause.** Il avait le mandat et les exigences sous les yeux, et il a suivi
l'exigence, qui est l'artefact liant.

**Ce n'est pas propre à cette campagne.** Le cycle du 27B (`~/.495-campagnes/java-cycle-3`) prend le
même chemin, et `QUALIFICATION.md` le décrivait déjà sans en tirer la conséquence : son quatrième
lancement est le troisième repris après la réponse `IH-01`. Or son journal donne `specify` terminé à
10:13:35, la réponse « La limite s'applique à la création et à la mise à jour. » enregistrée à
10:34:08, et les exigences adoptées à G1 **treize secondes plus tard**, à 10:34:21. Elles portent
`R1` : « Une création d'utilisateur via POST /api/users… », et aucune n'énonce le cas de la mise à
jour. La réponse n'a pas davantage atteint l'artefact là-bas.

Ce que le candidat du 27B couvre tout de même la modification tient au placement de la règle dans le
record `User`, décidé par la conception — pas à une exigence, donc pas à un contrôle. Les deux
campagnes se ressemblent jusque-là : ce qu'une réponse humaine obtient, elle l'obtient par accident
de conception. C'est le parcours nominal qui est en cause, sur deux modèles et deux cycles, et non
un incident de l'un d'eux.

## La cause, dans une condition

`stepClarify`, `src/application/harness.ts` :

```ts
if (spec && unit.state.open_questions.every((q) => !q.material || q.answer !== null)) {
    report = spec.content;                    // le rapport écrit avant les réponses
} else {
    const answered = …;                       // « Q Q3: … -> 422 … »
    const objective = `${request}\n\nAnswered questions:\n${answered.join("\n")}`;
    … runIntervention(unit, cor, "specify", objective, …)
}
```

La branche qui réinjecte les réponses dans une nouvelle spécification n'est prise que **lorsqu'une
question matérielle reste sans réponse** — l'état dans lequel le changement attend une décision et
n'avance pas. Dès que toutes les réponses sont là, le rapport antérieur l'emporte. Le chemin
`answered` → `objective` est inatteignable dans le parcours nominal.

Deux constats s'y ajoutent, qui ferment les issues de secours.

**La révision d'artefact existe et rien ne la déclenche.** `artifact.revise`, `artifact.revised` et
l'invalidation `artifact_revised` sont écrits dans `domain/change/` ; ce changement n'émet aucun de
ces événements, et aucun appelant d'`application/` ne les émet après qu'une question matérielle a
reçu sa réponse.

**L'adoption humaine des exigences n'a pas de constructeur.** `gateG1` sait rendre `INDETERMINATE`
avec `next_action: request_decision:IH-02` quand `policy.adoption.requirements` vaut `human`, mais
`IH-02` est exclue de `buildDecisionRequest` et de `requestDecision`, comme `IH-04`. Une cible qui
demanderait la relecture humaine de ses exigences arrêterait donc son changement sans voie de sortie.
Le défaut est de la même famille que celui d'`IH-04` déjà porté par `../STATUS.md`.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/chantiers/L-reponse-humaine-sans-effet.md, puis la section
« Le même cycle avec Qwen3.8-Flash-Next-MLX-oQ4-MTP » de docs/QUALIFICATION.md.

Dans le code : stepClarify dans src/application/harness.ts — la condition qui réemploie le rapport
de spécification et la branche qui construit `Answered questions:` ; la construction du mandat dans
la même méthode, qui porte open_questions avec leurs réponses ; gateG1 dans
src/domain/change/decide.ts, qui ne consulte jamais open_questions ; artifactRevise dans le même
fichier ; buildDecisionRequest dans src/application/decisions.ts, dont IH-02 est exclue.

Le dossier de la campagne est dans ~/.495-campagnes/java-flashnext : il porte les quatre
question.answered, le mandat adopté, les exigences adoptées et le protocole gelé. Cite-le plutôt
que de supposer.

Reproduis d'abord le constat sans modèle : un test au niveau de test/v2/harness où une intervention
de spécification ouvre une question matérielle, où la réponse enregistrée contredit une exigence du
même rapport, et qui échoue aujourd'hui parce que l'exigence adoptée à G1 est celle d'avant la
réponse.

Décide ensuite ce qui porte la correction, et écris la décision dans docs/DECISIONS.md. Trois
formes au moins, qui ne s'excluent pas :

  - une réponse à une question matérielle rouvre la spécification : le rapport est refait avec les
    réponses dans la demande, ce que la branche `Answered questions:` sait déjà faire ; dire alors
    ce que coûte cette seconde intervention et sur quel budget elle est comptée ;
  - le noyau révise l'artefact plutôt que de le refaire, par le mécanisme artifact.revise déjà
    écrit ; dire ce qu'il révise exactement et ce qui garantit que la révision est fidèle à la
    réponse, puisque personne ne relit le texte ;
  - G1 refuse d'adopter une spécification antérieure à une réponse matérielle qu'elle ne porte pas.
    C'est le refus le plus sûr et le plus pauvre : il arrête le changement sans rien corriger, donc
    il ne vaut qu'accompagné de l'une des deux premières.

Traite aussi l'issue humaine : IH-02 est nommée par gateG0 et gateG1 et exclue du constructeur de
demandes de décision. Soit elle est construite, soit les deux gates cessent de la nommer. Décide,
avec le motif.

Enfin, dis ce qui vérifie la correction. Le principe du produit est qu'une consigne sans contrôle
est un vœu ; il vaut aussi pour une décision humaine. Une réponse matérielle qui porte un contrat
observable — un statut HTTP, un message, une borne — doit se retrouver dans une exigence, donc dans
une obligation du protocole, donc dans un contrôle. Dis comment, et ce que le harnais fait d'une
réponse qui ne porte aucun contrat observable.

Critères d'acceptation :
- un test déterministe couvre une réponse matérielle qui contredit le rapport antérieur, et échoue
  sur le comportement actuel ;
- une réponse matérielle enregistrée ne peut plus être absente de l'artefact que G1 adopte, ou son
  absence arrête le changement en le disant ;
- la décision sur IH-02 est écrite, quelle qu'elle soit ;
- npm run build puis npm run check passent.
```

## Critères d'acceptation

- un test déterministe couvre une réponse matérielle qui contredit le rapport antérieur, et échoue
  sur le comportement actuel ;
- une réponse matérielle enregistrée ne peut plus être absente de l'artefact que G1 adopte, ou son
  absence arrête le changement en le disant ;
- la décision sur `IH-02` est écrite, quelle qu'elle soit ;
- `npm run build` puis `npm run check` passent.

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Réemploi du rapport de spécification | `src/application/harness.ts`, `stepClarify` |
| Réponses réinjectées, branche inatteignable | `src/application/harness.ts`, `stepClarify`, `Answered questions:` |
| Mandat porteur des réponses | `src/application/harness.ts`, `stepClarify`, construction de `Mandate` |
| Adoption des exigences sans consulter les réponses | `src/domain/change/decide.ts`, `gateG1` |
| Révision d'artefact écrite et jamais déclenchée | `src/domain/change/decide.ts`, `artifactRevise` ; `src/domain/invalidation.ts` |
| `IH-02` nommée par les gates et exclue du constructeur | `src/application/decisions.ts`, `buildDecisionRequest` ; `src/application/harness.ts`, `requestDecision` |
| Dossier de la campagne | `~/.495-campagnes/java-flashnext` |

## Journal

**19 septembre 2026, après-midi.** Campagne `~/.495-campagnes/java-flashnext-L`, même cible et même
modèle que le constat, détaillée dans `../QUALIFICATION.md`. Ce qu'elle établit : le champ `answers`
requis ne coûte pas de reprise sur quatre rapports d'affilée ; la réponse « 422 » atteint l'objectif
et les exigences du rapport dès la première réouverture, `R3-contrat-http-400` cédant la place à
`req-422-contract` ; les huit réponses finissent déclarées et liées à des exigences obligatoires ; et
le contrôle attrape une liaison morte — `r-threshold-trimmed` déclaré `r-threshold-trimbed` — qui
aurait laissé une décision portée par rien.

Ce qu'elle a démenti : deux règles écrites au banc. La borne de réouverture, plafond de deux choisi
d'avance, arrêtait une spécification qui progressait — elle est devenue une borne de progression. La
condition de G1, qui exigeait que *chaque* exigence nommée soit obligatoire, refusait un rapport qui
en nommait une de plus à côté de trois obligatoires — elle exige désormais que toutes existent et
qu'au moins une soit obligatoire. Aucune des deux n'était visible sur les suites déterministes.

Ce qu'elle laisse ouvert, et qui appartient à ce chantier :

- **aucun gate franchi.** Le cinquième rapport casse sur une sortie structurée refusée et le
  changement est perdu (`F`). Que les exigences adoptées à G1, le protocole gelé à G2 et les
  contrôles portent réellement le contrat décidé reste non mesuré sur une cible réelle ;
- **la spécification ne converge pas** sur cette cible avec ce modèle, et `IH-01` n'offre que
  *répondre* ou *abandonner le changement* : rien ne permet à un humain de déclarer qu'une question
  n'est plus matérielle et de faire décider avec ce qui est acquis. `q-mutation-floor` demandait si
  la garde devait être verrouillée par des tests unitaires aux deux bornes — ce que `prepare` produit
  et ce que G2 gèle ;
- **le rapport grossit à chaque réouverture**, puisqu'il doit porter toutes les réponses déjà
  déclarées et les exigences qu'elles engendrent. C'est ce qui conduit le cinquième dans le mur, et
  c'est un coût propre au mécanisme retenu. Une piste tient au noyau plutôt qu'au modèle : il a
  enregistré les réponses et lu les déclarations du rapport précédent, donc il peut les reporter
  lui-même et ne demander au rapport suivant que les réponses nouvelles ;
- **une sortie refusée ne conserve que sa tête**, 20 000 caractères, quand le motif du refus est dans
  sa queue : le dossier ne peut pas dire pourquoi ce rapport a été refusé. À verser à `F`.

**19 septembre 2026.** Correction, écrite en `D-37`. `stepClarify` ne réemploie plus un rapport qui
a posé une question matérielle et ne déclare rien de sa réponse : il relance une intervention
`specify` avec les réponses dans la demande, par la branche `Answered questions:` jusque-là
inatteignable, une fois par passage en `clarifying` et au plus deux fois par changement.
`RequirementsDocument` porte un bloc `answers` — question et réponse recopiées du journal, liaison
aux exigences déclarée par le rapport — et `gateG1`, qui ne consultait jamais `open_questions`, y
refuse une réponse absente, altérée, observable sans exigence porteuse, ou portée par une exigence
non obligatoire que G2 laisserait passer sans obligation. `artifact.revise` reste inutilisé : réviser
fidèlement une exigence, c'est réécrire une phrase que personne ne relit. `IH-02` est construite,
demandée par les deux gates et liée à l'empreinte de l'artefact adopté ; un refus bloque le
changement avec son motif. Quatre tests déterministes de `test/v2/harness` tiennent l'ensemble ; les
deux premiers échouent sur le comportement d'avant — le rapport est réemployé et le changement va
jusqu'à `closed` avec la réponse perdue.

Ce qui reste : aucune campagne n'a été reconduite depuis, donc ce qu'un modèle fait réellement du
bloc `answers` n'est pas mesuré.

**19 septembre 2026.** Ouverture. Le constat vient de la reprise de la campagne Flash-Next, conduite
jusqu'à l'acceptation ce jour-là et transcrite dans `../QUALIFICATION.md`. Il a été lu dans le
dossier : les quatre `question.answered`, le mandat qui porte « 422 » à côté d'un objectif qui dit
« 400 », les exigences adoptées 41 s après la dernière réponse et identiques au rapport écrit
40 minutes plus tôt, puis le scénario Cucumber gelé qui compare le corps en égalité stricte. Aucun
événement `artifact.revised` n'existe dans ce changement.
