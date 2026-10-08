# 495 propose la carte d'architecture d'une cible Maven, chaque partie avec son style, ses rôles et ses indices, et le propriétaire l'adopte

Story : e11s01
Epic : e11
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven qui demande l'état de son architecture n'obtient aujourd'hui que ce que
ses POM déclarent : quel module peut dépendre de quel autre, et l'absence de cycle entre paquets. Rien ne
dit comment le projet est organisé. Prenons un module `domain` qui porte un modèle, des services et des
ports, et un module `infrastructure` qui les implémente. Ou encore un module `orders` construit en
hexagone à côté d'un module `admin` en couches classiques. Le noyau ne le sait pas, et n'a donc rien à
opposer au code. Pour un projet d'un seul module, il ne connaît que les cycles (`ARC-01`, `D-87`).

Avec cette story, 495 propose une carte de l'architecture. Il découpe le projet en parties et donne à
chacune son style, le rôle de chacun de ses paquets et les parties dont elle peut dépendre. Chaque élément
porte les indices qui le justifient, à leur fichier et à leur ligne. Le modèle qui la propose reçoit une
skill d'identification que 495 embarque, adaptée de deux skills publiques et datée, qui lui donne les signes
de reconnaissance de chaque style ; aucune skill du projet analysé n'est chargée. Le noyau confronte la carte au code
avant de la présenter, et nomme les paquets qu'aucune partie ne couvre. Le propriétaire l'adopte, en
demande une autre avec une remarque, ou laisse l'exigence en angle mort. Adoptée, la carte devient
l'architecture que le projet déclare. Elle est gelée avec la date de la décision et présentée dans le
rapport. La vérifier avec ArchUnit est l'objet de `e11s02`.

## 2. Promesses

Scenario: La carte proposée se présente au propriétaire
  Given un réacteur Maven dont le module `domain` porte les paquets `io.demo.domain.user`, `io.demo.domain.service` et `io.demo.domain.port`, et dont le module `infrastructure` porte `io.demo.infra`, qui implémente un port du domaine
  And une exigence d'architecture à l'état des lieux
  When l'état des lieux mesure le projet
  Then une intervention en lecture seule propose une carte de l'architecture
  And une décision demande au propriétaire s'il adopte la carte, avec trois issues : l'adopter, demander une nouvelle proposition avec une remarque, ou laisser l'exigence en angle mort
  And ses faits donnent chaque partie avec son périmètre, son style et le rôle de chacun de ses paquets, les relations permises entre parties, et chaque indice à son fichier et à sa ligne

Scenario: Le modèle reçoit la skill d'identification de 495, et aucune skill du projet
  Given un réacteur Maven qui porte une skill sous `.agents/skills/arch/SKILL.md`
  And une exigence d'architecture à l'état des lieux
  When l'intervention qui propose la carte est ouverte
  Then le manifeste de son contexte nomme la skill d'identification de 495, avec ses deux sources, leurs commits et leur date
  And sa consigne nomme, pour chacun des styles `layered`, `onion`, `simple` et `other`, ses signes de reconnaissance
  And aucune skill du projet n'est chargée

Scenario: Une architecture mixte se présente partie par partie
  Given un réacteur Maven des modules `orders`, `admin` et `shared`
  And une carte proposée où `orders` est en oignon, `admin` en couches et `shared` simple, `orders` et `admin` pouvant dépendre de `shared` et pas l'un de l'autre
  When la décision est présentée
  Then ses faits donnent les trois parties, chacune avec son propre style et ses rôles, et les deux relations permises

Scenario: Un paquet qu'aucune partie ne couvre est nommé
  Given un réacteur Maven dont le module `domain` porte aussi le paquet `io.demo.domain.legacy`
  And une carte proposée dont aucune partie ne couvre `io.demo.domain.legacy`
  When la décision est présentée
  Then ses faits nomment `io.demo.domain.legacy` comme paquet sans partie

Scenario: Une carte qui ne tient pas devant le code n'est pas présentée
  Given une carte proposée qui donne un rôle au paquet `io.demo.domain.billing`, absent des sources, ou qui cite un indice à une ligne au-delà de la fin de son fichier
  When l'état des lieux reçoit la carte
  Then aucune décision n'est demandée sur cette carte
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison qui désigne le paquet absent ou l'indice introuvable

Scenario: La carte adoptée est gelée et présentée
  Given la décision qui propose la carte
  When le propriétaire l'adopte
  Then le protocole gelé porte la carte, avec la date de la décision d'adoption
  And la section état des lieux du rapport présente la carte adoptée, partie par partie, en anglais et en français
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison qu'aucun contrôle ne vérifie encore la carte adoptée
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Le propriétaire demande une autre carte avec une remarque
  Given la décision qui propose la carte
  When le propriétaire demande une nouvelle proposition avec la remarque « admin est en couches, pas en oignon »
  Then une nouvelle intervention en lecture seule reçoit la remarque et propose une carte
  And une nouvelle décision la présente, avec les trois mêmes issues

Scenario: Dans Pi, demander une autre carte ouvre la saisie de la remarque
  Given la décision qui propose la carte, présentée au propriétaire dans le dialogue de Pi
  When le propriétaire choisit « propose_map_again » et saisit la remarque « admin est en couches, pas en oignon »
  Then Pi lui ouvre une saisie de texte qui demande « Votre remarque sur la carte » (« Your remark on the map » en anglais)
  And la décision enregistrée au journal porte la remarque comme texte libre
  And le contexte de la seconde intervention porte « The owner's remark: admin est en couches, pas en oignon »

Scenario: Le propriétaire laisse l'exigence en angle mort
  Given la décision qui propose la carte
  When le propriétaire choisit de laisser l'exigence en angle mort
  Then le protocole gelé ne porte aucune carte
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison que la carte proposée n'a pas été adoptée

## 3. Sécurité

L'intervention qui propose la carte tourne dans une copie de la référence, avec les seuls outils de
lecture du rôle de spécification. Elle n'écrit rien, et le réseau reste fermé. Ce qu'elle lit du projet
est une donnée : une instruction trouvée dans une source n'a aucune autorité sur elle (`D-41`). La remarque
du propriétaire, saisie dans le dialogue de Pi qui suit son choix d'une nouvelle proposition, est
enregistrée avec sa décision et lui est transmise comme le texte du propriétaire. Le noyau confronte chaque paquet et
chaque indice de la carte aux sources de la référence avant de la présenter. Une carte qui ne tient pas
n'est pas montrée au propriétaire comme si elle tenait. La carte adoptée est gelée dans le protocole. Elle
n'est jamais lue dans l'arbre analysé, et aucun fichier du projet ne peut la remplacer (`D-25`, `D-87`).
La skill d'identification est embarquée par 495, copiée à des commits nommés et attribuée dans `NOTICE` ;
aucune skill, aucun `AGENTS.md` du projet analysé n'est chargé (`D-11`). Aucun outil n'est ajouté au projet
par cette story.

## 4. Tâches

### Tâche 1 — Un état des lieux d'architecture d'une cible Maven demande une carte et la présente

Dans un état des lieux d'une cible Maven, une exigence d'architecture ouvre une intervention en lecture
seule. Celle-ci rend une carte : des parties, chacune avec son périmètre (modules ou branches de
paquets), son style parmi `layered`, `onion`, `simple` et `other`, et le rôle de chacun de ses paquets ;
les relations permises entre parties ; pour chaque élément, ses indices à leur fichier et à leur ligne.
Une décision la présente au propriétaire avec ses trois issues, telle que le modèle l'a écrite. La
confronter au code est l'objet de la tâche 3.

- Vérifie : `node --test test/v2-kernel/architecture-map-proposal.test.ts`
- Tient : `test/v2-kernel/architecture-map-proposal.test.ts`, « l'état des lieux de l'architecture d'un réacteur Maven demande au propriétaire d'adopter la carte proposée, avec trois issues et un fait par partie qui donne son périmètre, son style, ses rôles et ses indices à leur fichier et à leur ligne » et « la décision sur une carte de trois parties aux styles oignon, couches et simple donne chaque partie avec son style et les deux relations permises vers shared »
- Rouge : un état des lieux n'ouvre qu'une intervention, celle de la spécification, et ne demande que l'acceptation IH-10. L'exigence d'architecture d'un réacteur Maven y devient l'angle mort « it measures only the lines a change introduces, and the reference introduces none », sans aucune décision.

### Tâche 2 — Le modèle reçoit la skill d'identification de 495

495 embarque une skill d'identification au format Agent Skills, adaptée de `architecture-blueprint-generator`
(`github/awesome-copilot`, commit `caab1f62`, MIT) et de `design-pattern-review`
(`sirius-zuo/design-pattern-skill`, commit `66d78158`, MIT), et l'attribue dans `NOTICE`. Elle donne les signes
de reconnaissance de chaque style de la carte et demande la carte dans le format de 495. L'intervention qui
propose la carte la reçoit par le chargeur de ressources de Pi, seule : aucune skill du projet n'est chargée.
Le manifeste du contexte la nomme avec ses sources, leurs commits et leur date.

- Vérifie : `node --test test/v2-kernel/architecture-map-skill.test.ts`
- Tient : `test/v2-kernel/architecture-map-skill.test.ts`, « l'intervention qui propose la carte reçoit la skill d'identification de 495, que le manifeste de son contexte nomme avec ses deux sources, leurs commits et leur date, et dont la consigne nomme les signes de reconnaissance des styles layered, onion, simple et other » et « une skill que le projet porte sous .agents/skills n'est pas chargée dans l'intervention »
- Rouge : après la tâche 1, l'intervention reçoit un chargeur de ressources sans skill (`getSkills` rend une liste vide dans `src/adapters/pi-worker/worker-main.ts`). Le manifeste de son contexte ne nomme aucune skill, et sa consigne ne nomme aucun signe de reconnaissance.

### Tâche 3 — La carte est confrontée au code avant d'être présentée

Avant de présenter la carte, le noyau vérifie que chaque paquet qu'elle nomme est déclaré par une source
principale de la référence, et que chaque indice désigne un fichier de la référence et une ligne qui y
existe. Une carte qui ne tient pas n'est pas présentée, et l'exigence devient un angle mort dont la raison
désigne ce qui manque. Une carte qui tient est présentée, avec les paquets des sources principales
qu'aucune partie ne couvre, nommés comme paquets sans partie.

- Vérifie : `node --test test/v2-kernel/architecture-map-validation.test.ts`
- Tient : `test/v2-kernel/architecture-map-validation.test.ts`, « une carte qui ne couvre pas io.demo.domain.legacy est présentée avec ce paquet nommé sans partie », « une carte qui donne un rôle à io.demo.domain.billing, absent des sources, n'est pas présentée et le survey nomme l'exigence comme angle mort en désignant ce paquet » et « une carte dont un indice cite une ligne au-delà de la fin de son fichier n'est pas présentée et le survey nomme l'indice introuvable »
- Rouge : après les tâches 1 et 2, la décision présente la carte telle que le modèle l'a écrite. Un paquet absent ou un indice introuvable y figure comme les autres, et aucun fait ne nomme un paquet sans partie.

### Tâche 4 — L'adoption gèle la carte, le refus laisse l'angle mort

À l'adoption, la carte est gelée dans le protocole avec la date de la décision. L'exigence d'architecture
reste un angle mort, dont la raison dit qu'aucun contrôle ne vérifie encore la carte adoptée. Laisser
l'exigence en angle mort ne gèle aucune carte, et la raison dit que la carte proposée n'a pas été adoptée.
Le projet n'est pas modifié.

- Vérifie : `node --test test/v2-kernel/architecture-map-adoption.test.ts`
- Tient : `test/v2-kernel/architecture-map-adoption.test.ts`, « l'adoption gèle la carte dans le protocole avec la date de la décision, le survey nomme l'exigence comme angle mort parce qu'aucun contrôle ne vérifie la carte adoptée, et le digest du projet est inchangé » et « laisser l'exigence en angle mort ne gèle aucune carte et le survey dit que la carte proposée n'a pas été adoptée »
- Rouge : après les tâches 1 à 3, la réponse du propriétaire n'a pas d'effet sur le protocole. Le protocole gelé ne porte aucune carte, et la raison de l'angle mort reste celle du contrôle structurel.

### Tâche 5 — Une nouvelle carte se demande avec une remarque

Demander une nouvelle proposition ouvre une nouvelle intervention en lecture seule. Elle reçoit la carte
précédente et la remarque du propriétaire, et sa carte est confrontée au code puis présentée avec les trois
mêmes issues.

- Vérifie : `node --test test/v2-kernel/architecture-map-remark.test.ts`
- Tient : `test/v2-kernel/architecture-map-remark.test.ts`, « demander une nouvelle proposition avec la remarque admin est en couches, pas en oignon ouvre une seconde intervention dont le contexte porte la remarque, et une nouvelle décision présente sa carte avec les trois issues »
- Rouge : après la tâche 4, l'issue de nouvelle proposition n'ouvre aucune intervention. Aucun contexte ne porte la remarque, et aucune seconde décision n'est demandée.

### Tâche 6 — Le rapport présente la carte adoptée

La section état des lieux du rapport présente la carte adoptée et sa date d'adoption. Pour chaque partie,
elle donne son périmètre, son style, le rôle de chacun de ses paquets et les parties dont elle peut
dépendre, puis les paquets sans partie. Le texte le dit en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-report.test.ts`
- Tient : `test/v2-kernel/architecture-map-report.test.ts`, « le rapport d'un état des lieux à la carte adoptée présente sa date d'adoption, chaque partie avec son périmètre, son style, ses rôles et ses relations permises, et les paquets sans partie, en anglais et en français »
- Rouge : `surveySection`, dans `src/application/report.ts`, ne rend que les exigences, les constats, les angles morts des contrôles et le référentiel de qualité, et `formatReport` n'écrit que ceux-là. La carte gelée par la tâche 4 n'atteint pas le rapport.

### Tâche 7 — Dans Pi, la remarque est demandée au propriétaire qui veut une autre carte

Quand le propriétaire choisit, dans le dialogue de Pi, de demander une nouvelle proposition, Pi lui ouvre
une saisie de texte qui demande sa remarque sur la carte, dans la langue de la session. Le texte saisi est
enregistré comme texte libre de la décision, et la seconde intervention le reçoit comme la remarque du
propriétaire.

- Vérifie : `node --test test/v3-pi/architecture-map-remark-dialog.test.ts`
- Tient : `test/v3-pi/architecture-map-remark-dialog.test.ts`, « choisir propose_map_again depuis Pi ouvre une saisie qui demande Votre remarque sur la carte, la décision enregistrée porte la remarque admin est en couches, pas en oignon comme texte libre, et le contexte de la seconde intervention porte cette remarque »
- Rouge : dans `presentDecisions` (`src/extension/conduct.ts`), `freeTextPrompt` ne rend une invite que pour `answer`, `extend`, `refuse` et `revise`, les clés de `FREE_TEXT_PROMPTS`. Pour `propose_map_again` il rend null, bien que la décision IH-04 permette le texte libre : `ctx.ui.input` n'est jamais appelé, la décision est enregistrée avec `free_text: null`, et le contexte de la seconde intervention porte « The owner's remark: (none given) » (`src/application/context.ts`).

## 5. Hors périmètre

- Vérifier la carte adoptée sur le code, avec ArchUnit recommandé pour les règles qu'elle porte : `e11s02`.
  Cette story n'ajoute aucun outil au projet, puisque rien n'y vérifie encore la carte (`D-87` §4).
- Comparer les dépendances que les POM déclarent à celles que le code utilise, et nommer ce que la lecture
  du code ne voit pas : `e11s03`.
- Lire une architecture que le projet déclare déjà dans son code (Spring Modulith, jMolecules) : à
  ajouter à `e11s02` ou après, quand une cible en emploie.
- Garder la carte adoptée d'un changement au suivant : elle est gelée dans le protocole du changement qui
  l'adopte, comme le référentiel de qualité. La porter d'un changement à l'autre relève du programme à
  plusieurs incréments (`e10s04`).
- Proposer une carte dans un changement à candidat : seul l'état des lieux la propose dans cette story.
- La carte d'une cible Node : `e11s04`. Les deux skills sources ne couvrent pas Node, et la part Node de la
  skill d'identification y sera écrite.
- La description des données, des préoccupations transverses et du déploiement que la skill permet, comme
  lecture du modèle : `e11s03`. La revue de patterns et les anti-patterns proposés comme règles : `e11s05`.
- Corriger la carte à la main dans le dialogue : le propriétaire la corrige par une remarque, et un modèle
  écrit la nouvelle proposition.
- Rendre la remarque obligatoire : une saisie vide ou fermée reste une demande sans remarque, que le
  contexte dit « (none given) ». Demander un texte pour l'adoption ou l'angle mort, renommer les issues de
  la décision, ou changer la façon dont le noyau transmet une remarque reçue, que la tâche 5 tient déjà :
  l'écart ne porte que sur la saisie que Pi n'ouvre pas.
