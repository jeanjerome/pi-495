# Le propriétaire lit l'état des lieux, ses angles morts nommés, et l'accepte ou le refuse

Story : e29s02
Epic : e29
Statut : en cours

## 1. Ce que le lecteur gagne

Depuis e29s01, `/495 state <question>` établit l'état du projet et le range au dossier, sous la
forme d'un artefact `survey`. Le propriétaire ne le voit pourtant nulle part. Le changement se clôt
`accepted` sans lui demander son avis, alors que `D-74` veut qu'il l'accepte ou le refuse.
`/495 report` ne montre rien de l'état des lieux : ses lignes d'exigences ne comptent que les
preuves d'un candidat, et un état des lieux n'en a pas. Ce que le propriétaire a demandé n'a donc
aucun lecteur.

Deux défauts trompent aussi ce lecteur :

- L'état des lieux présente chaque contrôle gelé avec son verdict, y compris un contrôle dont la
  qualification a échoué (`BUG-2026-10-02T200000`). Par exemple, un lint qui ne détecte pas son
  témoin négatif y est affiché « PASS ».
- Au journal, la porte G2 d'un état des lieux annonce comme suite « concevoir le changement »,
  alors qu'aucun changement ne sera conçu.

Avec cette story, le propriétaire reçoit l'état des lieux avant toute clôture. Pour chaque question,
il voit le verdict des contrôles qui y répondent, les constats avec leur fichier, et les angles morts
avec leur raison. Il l'accepte, ou le refuse en disant pourquoi, et sa réponse est inscrite au
dossier. Un capteur non qualifié y est un angle mort, jamais un verdict.

## 2. Promesses

Scenario: Un état des lieux complet attend l'acceptation du propriétaire
  Given un état des lieux d'un projet Node dont la suite passe, conduit jusqu'à son `survey`
  When G5 juge l'état des lieux
  Then une décision IH-10 est demandée sur le `survey`, avec la question « Accepter cet état des lieux ? » et les seules options accepter et refuser
  And ses faits donnent, pour chaque exigence, le verdict de chaque contrôle qui la mesure ou sa raison d'angle mort
  And le changement n'est pas clos tant que le propriétaire n'a pas répondu, quelle que soit la politique d'acceptation des changements à candidat

Scenario: Le propriétaire accepte l'état des lieux
  Given un état des lieux qui attend sa décision IH-10
  When le propriétaire choisit accepter
  Then le changement est clos `accepted`, et sa décision d'acceptation est celle que le propriétaire a donnée

Scenario: Le propriétaire refuse l'état des lieux en disant pourquoi
  Given un état des lieux qui attend sa décision IH-10
  When le propriétaire choisit refuser avec le motif « la couverture manque »
  Then le changement est clos `rejected`, le motif est inscrit avec la décision au dossier, et aucune tentative ni intervention n'est ouverte

Scenario: Dans Pi, l'état des lieux se présente avant le dialogue
  Given une session Pi interactive sur un projet Node dont un test échoue
  When le propriétaire tape `/495 state où en sont les tests ?`
  Then les faits de l'état des lieux s'affichent, dont le contrôle de tests en FAIL avec le fichier du test en échec, puis le dialogue « Accepter cet état des lieux ? » s'ouvre
  And choisir refuser demande le motif du refus, et le changement est clos `rejected`
  And en mode sans écran, le changement s'arrête sur `decision_required` avec les mêmes faits

Scenario: Le rapport présente l'état des lieux
  Given un état des lieux d'un projet Node dont un test échoue et dont une exigence porte sur l'architecture
  When le propriétaire demande `/495 report`
  Then le rapport a une section état des lieux qui nomme chaque exigence avec les verdicts de ses contrôles sur la référence, chaque constat avec son fichier, et chaque angle mort avec sa raison

Scenario: Un contrôle non qualifié est un angle mort de l'état des lieux
  Given un projet dont le contrôle de lint ne détecte pas son témoin négatif, et un état des lieux qui ne demande que l'état des tests
  When le `survey` est établi
  Then le contrôle de lint y est un angle mort, avec pour raison la note de sa qualification, et aucun verdict ne lui est attribué

Scenario: La porte G2 d'un état des lieux annonce la mesure de la référence
  Given un état des lieux dont le protocole est gelé
  When G2 passe
  Then la suite que la décision de G2 annonce est la vérification, et non la conception du changement

## 3. Sécurité

Seul un humain peut accepter un état des lieux. La décision IH-10 d'un état des lieux exige une
origine humaine, comme celle d'un candidat. En mode sans écran ou sans client déclaré, la décision
reste en attente et rien n'est accepté. La story n'ouvre aucun réseau, n'écrit rien dans le projet,
ne lance aucun agent et ne change pas le confinement des contrôles.

## 4. Tâches

### Tâche 1 — G5 d'un état des lieux demande l'acceptation du propriétaire

G5 d'un état des lieux complet ne passe plus seul. Il demande une décision IH-10 dont le sujet est
le `survey`, quelle que soit `g5_human_acceptance`. Sa question est « Accepter cet état des lieux ? »,
ses options sont accepter et refuser (avec motif), et ses faits sont tirés du `survey`. Accepter clôt
le changement `accepted`, avec la décision pour acceptation. Refuser le clôt `rejected` et inscrit
le motif, sans correction ni nouvelle tentative. Dans Pi, le dialogue existant présente ces faits
puis la question.

- Vérifie : `node --test test/v2-kernel/state-survey-acceptance.test.ts test/v3-pi/state-acceptance.test.ts`
- Tient : `test/v2-kernel/state-survey-acceptance.test.ts`, « G5 d'un état des lieux demande IH-10 sur le survey avec les seules options accepter et refuser et un fait par exigence, même quand la politique n'exige pas l'acceptation », « accepter clôt l'état des lieux accepted avec la décision du propriétaire » et « refuser avec un motif clôt l'état des lieux rejected, inscrit le motif et n'ouvre aucune tentative » ; `test/v3-pi/state-acceptance.test.ts`, « /495 state sur un projet dont un test échoue affiche le contrôle de tests en FAIL avec le fichier du test puis ouvre le dialogue Accepter cet état des lieux ? ; refuser demande le motif et clôt rejected ; sans écran le changement s'arrête sur decision_required avec les mêmes faits »
- Rouge : `judgeSurvey` évalue G5 sur le `survey` sans `decision_id`, G5 passe et le changement se clôt `accepted`. Aucune décision n'est en attente, et le dialogue ne s'ouvre jamais.

### Tâche 2 — Le rapport présente l'état des lieux

`engineeringReport` lit le `survey` adopté ou proposé d'un état des lieux. Le rapport, en texte comme
en structure, porte une section état des lieux : chaque exigence avec les verdicts de ses contrôles
sur la référence ou sa raison d'angle mort, chaque constat avec son fichier, et chaque contrôle
angle mort avec sa raison.

- Vérifie : `node --test test/v2-kernel/state-survey-report.test.ts`
- Tient : `test/v2-kernel/state-survey-report.test.ts`, « le rapport d'un état des lieux d'un projet dont un test échoue et dont une exigence porte sur l'architecture nomme chaque exigence avec ses verdicts, le fichier du test en échec et l'angle mort d'architecture avec sa raison »
- Rouge : `engineeringReport` ne lit aucun `survey`. Ses lignes d'exigences ne retiennent que les preuves dont le sujet est le candidat, et un état des lieux n'en a aucun. Le rapport ne nomme donc ni le fichier du test en échec ni l'angle mort.

### Tâche 3 — Un contrôle non qualifié est un angle mort

`surveyOf` nomme angle mort tout contrôle gelé dont la qualification a échoué. La raison est la note
de sa qualification, et aucun verdict ne lui est attribué. Une exigence ne peut pas en dépendre : G2
refuse déjà une obligation qui nomme un contrôle non qualifié.

- Vérifie : `node --test test/v2-kernel/state-survey-unqualified.test.ts`
- Tient : `test/v2-kernel/state-survey-unqualified.test.ts`, « dans l'état des lieux d'un projet dont le lint ne détecte pas son témoin négatif, le contrôle lint est un angle mort avec la note de sa qualification et ne porte aucun verdict »
- Rouge : `surveyReference` exécute tous les contrôles du protocole, et `surveyOf` en reprend chaque verdict. Sur `trackedProject(fixtureTs)`, le `survey` porte `{ control_id: "lint", verdict: "PASS", blind_spot: null }` alors que la qualification de `lint` est `qualified: false` (`BUG-2026-10-02T200000`).

### Tâche 4 — G2 d'un état des lieux annonce la vérification

La décision de G2 d'un état des lieux qui passe annonce `verify` comme suite. Celle d'un changement à
candidat annonce toujours `design_change`.

- Vérifie : `node --test test/v0-pure/state-survey-g2-next.test.ts`
- Tient : `test/v0-pure/state-survey-g2-next.test.ts`, « G2 d'un état des lieux qui passe annonce verify, et G2 d'un changement à candidat annonce design_change »
- Rouge : `evaluateG2` rend `next_action: "design_change"` sur un PASS, quel que soit le livrable du changement.

## 5. Hors périmètre

- Reprendre un état des lieux refusé avec le motif du propriétaire, comme une spécification
  rouverte : le refus clôt le changement, et le propriétaire en demande un nouveau.
- Présenter l'état des lieux dans l'écran de revue d'un candidat : il n'y a pas de fichier changé à
  comparer.
- La nature d'une exigence, déduite de la catégorie que le modèle écrit : une catégorie mal choisie
  donne un angle mort au lieu d'une mesure, jamais l'inverse. La rendre plus sûre suppose un
  vocabulaire fermé des natures, qui viendra avec `e10` et `e11` quand elles en ajouteront.
- Un changement à candidat sur un projet dont un test échoue (`BUG-2026-10-02T200100`) : corrigé à
  la fin de l'epic, par la phase des défauts.
