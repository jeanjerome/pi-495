STORY KEY: e24s04
TITLE:     Établir ce que Pi tient déjà des sujets que la décision nomme sans les avoir relus
TYPE:      Story
PARENT:    e24
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      S

### 1. Business narrative [draft]

`D-55` se termine sur une liste d'aveux : la compaction, la confiance de projet, le rendu du
lecteur, les gardes de permission, les décisions humaines et la délégation sont dans la même
position que le bac à sable — Pi les tient, chacun a son exemple livré, et aucun n'a été relu sous
le critère que la décision venait de poser. Tant que cette lecture n'est pas faite, « ce que 495
doit écrire lui-même » n'est pas connu : c'est ce qui reste une fois la lecture faite.

Le sujet du bac à sable a été traité à part, parce que l'écart y était le plus grand. Les six
autres restent, et ils n'ont pas le même profil : cinq portent du code déjà écrit qu'il s'agit de
juger, un seul — la délégation — ne porte rien encore et se regarde donc avant d'écrire.

#### ADDED: relevé d'antériorité de ce que Pi tient déjà

**Before:** six sujets sont nommés comme à relire et ne le sont pas. Le dépôt ne sait pas combien
d'accroches Pi publie, combien il en pose, ni lesquelles manquent à un besoin réel plutôt qu'à une
complétude. Les chiffres qui circulent dans le périmètre et dans la décision ne nomment pas la
version contre laquelle ils ont été mesurés.

**After:** chacun des six sujets porte son verdict et son motif, chaque décompte nomme sa version et
sa règle, les endroits où 495 établit lui-même un fait sont relus un par un, et l'écart qui coûte
aujourd'hui est nommé avec ce que son observation coûterait.

### 2. Value statement [draft]

As a propriétaire du harnais, I want savoir, sujet par sujet, ce que Pi tient déjà de ce que 495
écrit ou s'apprête à écrire, so that ce qui reste à écrire soit ce qui reste réellement, et non ce
que personne n'a pensé à chercher.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — destinataire. L'étude ne décide d'aucune adoption ni d'aucune
  réécriture ; elle lui rend l'état des six sujets.
- **Agent** (system) — conduit la lecture contre la version épinglée, mesure sur l'arbre installé,
  écrit le relevé.
- **Relecteur** (external) — lit le relevé pour savoir ce qui a été cherché, et pour ne pas
  recommencer la même lecture au prochain sujet voisin.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la liste que `D-55` laisse ouverte, avant qu'un de ces sujets soit écrit, réécrit
ou déclaré couvert.

**Préconditions :** le paquet Pi est installé, donc ses pages de documentation, ses extensions
d'exemple et ses déclarations se lisent hors ligne ; le dépôt est à sa version épinglée ; le
registre npm est joignable pour récupérer l'arbre de la version précédente, sans quoi un décompte ne
peut être comparé qu'à lui-même.

### 5. Main flow and business logic [draft]

1. Le critère est écrit avant les sujets, et il est celui de `D-55` : Pi rapporte-t-il déjà le fait
   que 495 établit ?
2. La version contre laquelle la lecture est faite est nommée, et c'est celle qui est installée —
   pas celle que la documentation décrit.
3. Les décomptes sont pris à une règle écrite, sur l'arbre installé, par une commande reproductible.
4. Chacun des six sujets reçoit le même traitement : ce que Pi en tient, ce que 495 en écrit,
   l'écart, et le verdict.
5. Les endroits où 495 entretient une table, analyse un fichier ou relit du code tiers sont relus
   sous le même critère, et le relevé nomme l'accroche ou son absence.
6. Les accroches posées sont comptées contre celles publiées, et chaque absence est jugée contre un
   besoin écrit plutôt que contre la liste.
7. Ce que l'observation d'un écart coûterait est dit à l'endroit où l'écart est nommé.

### 6. Alternative flows and exceptions [draft]

- **Un décompte antérieur ne se retrouve pas** — il est recompté à une règle écrite, sur les deux
  arbres, et corrigé là où il est écrit. Un chiffre faux laissé en place se recopie.
- **Le besoin est déjà fermé plus bas que l'accroche** — le verdict est « besoin absent », et le
  relevé dit par quoi il est fermé, sans quoi la question se rouvrira au prochain passage.
- **L'accroche existe mais n'est pas atteignable là où le besoin vit** — l'endroit est dit. Une
  accroche d'extension et un événement de session ne sont pas au même endroit, et c'est celui qui
  s'applique qui est retenu.
- **Un écart est lu et non exécuté** — il est écrit comme une lecture, avec la mesure qui le
  trancherait. Une lecture annoncée comme une mesure coûte une réfutation.
- **Un contournement légitime ne dit pas ce qui a été cherché** — c'est un manquement à `D-55`, il
  est relevé comme tel, et il se corrige là où le contournement vit.

### 7. Interface elements [draft]

Not applicable — l'étude ne rend rien à l'écran ; son livrable est un texte versionné.

### 8. Domain model [draft]

Le relevé porte, par sujet examiné : ce que Pi tient et où, ce que 495 écrit et où, le verdict, et
le motif qui le tient. Il porte en outre trois décomptes, chacun avec sa règle et sa version. Aucun
de ces éléments n'entre dans le domaine exécutable du harnais.

### 9. Integrations and boundaries [draft]

Les sources lues hors ligne sont les pages de `docs/`, les extensions d'`examples/extensions/` et
les déclarations de `dist/**/*.d.ts` du paquet Pi installé, ainsi que ses paquets pairs. Le registre
npm est joint une fois, pour récupérer l'arbre de la version précédente et comparer les décomptes.
Aucune dépendance n'entre dans `package.json` du fait de l'étude, et aucun code du dépôt n'est
modifié — les seules écritures hors du relevé sont les corrections des chiffres qu'il a trouvés
faux.

### 10. Background processes [draft]

Not applicable — l'étude est conduite à la demande, jamais sur horloge.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session ; le relevé est le rendu.

### 12. Audit and logging [draft]

**Entité auditée :** le relevé. Versionné avec le périmètre, l'historique du dépôt porte qui l'a
écrit, quand, et ce qu'il disait avant. Aucune trace d'exécution n'est produite : l'étude n'ouvre
pas d'intervention et n'écrit pas au journal des campagnes. Les corrections qu'elle apporte à des
chiffres antérieurs sont visibles dans le même commit que le relevé qui les motive.

### 13. Solution variabilities [draft]

- **Profondeur de la mise à l'épreuve** (jugement) — un sujet se mesure par exécution quand la
  machine le permet, par lecture des déclarations de la version épinglée sinon. Les deux sont
  écrits comme tels, et une lecture ne se présente jamais comme une mesure.
- **Frontière du sujet** (méthode) — l'étude vise le besoin que 495 pose, pas la capacité que Pi
  offre. Une capacité qui excède le besoin rend « besoin absent », jamais « adopter ».

### 14. Quality attributes *NFR* [draft]

**Reproductibilité.** Chaque décompte nomme la règle qui l'a produit et l'arbre sur lequel il a été
pris. Un décompte sans règle ne se vérifie pas ; il se recopie, ce que cette story a mesuré trois
fois.

**Péremption.** Le relevé décrit la version installée au jour de l'étude. Les commandes de
vérification cherchent une affirmation et jamais un nombre : une remesure garde ses phrases et
change ses chiffres.

### 15. Security and compliance *NFR* [draft]

L'étude ne lance aucun candidat et n'ouvre aucune frontière : elle lit des déclarations et des
exemples déjà installés, et récupère une archive publiée dans un répertoire jetable hors du dépôt.
Elle touche en revanche deux sujets de sécurité par leur description — la confiance de projet et les
gardes de permission — et le verdict y est écrit avec ce qui ferme le besoin, jamais avec le seul
constat qu'une accroche n'est pas posée.

### 16. UX and accessibility *NFR* [draft]

Not applicable — l'étude ne touche aucune surface rendue à un lecteur.

### 17. Acceptance criteria [draft]

```gherkin
Scenario: chacun des six sujets porte son verdict
  Given les sujets que D-55 nomme sans les avoir relus
  When le relevé est clos
  Then chacun porte ce que Pi en tient, ce que 495 en écrit et le verdict
  And le motif du verdict est écrit à côté de lui

Scenario: un décompte nomme sa version et sa règle
  Given un nombre d'accroches, de pages ou d'exemples
  When il est écrit
  Then la version de l'arbre sur lequel il a été pris est nommée
  And la règle qui a servi à compter est nommée

Scenario: un décompte antérieur faux est corrigé là où il est écrit
  Given un chiffre du périmètre ou d'une décision qui ne se retrouve pas
  When il est recompté sur les deux arbres
  Then la correction est portée à l'endroit où le chiffre vivait
  And le relevé dit ce qui a été recompté et comment

Scenario: une absence d'accroche est jugée contre un besoin
  Given une accroche publiée que 495 ne pose pas
  When le verdict est écrit
  Then il dit quel besoin écrit la réclamait, ou qu'aucun ne la réclame

Scenario: un besoin fermé plus bas que l'accroche le dit
  Given un sujet où Pi offre une accroche et où 495 ferme le besoin autrement
  When le verdict est écrit
  Then il nomme ce qui ferme le besoin
  And il ne conclut pas à un défaut au motif que l'accroche n'est pas posée

Scenario: un écart lu se présente comme une lecture
  Given un écart établi sur les déclarations de la version épinglée
  When il est écrit
  Then il dit qu'il est lu et non exécuté
  And il nomme la mesure qui le trancherait

Scenario: ce que l'observation coûterait est dit avec l'écart
  Given un écart dont la correction toucherait un contrat
  When il est écrit
  Then le prix est nommé au même endroit
  And il est laissé à l'epic qui porte le besoin
```

### 18. Out of scope [draft]

- Poser une accroche, observer une compaction ou écrire la délégation. Ce que l'étude conclut qu'il
  faut écrire appartient à l'epic qui porte le besoin.
- Modifier `src/`. Les seules écritures sont le relevé et les chiffres qu'il a trouvés faux.
- Trancher ce que devient `src/domain/imposed-layers.ts`. `e23s06` porte cette question.
- Reprendre le contrôle du bloc fournisseur depuis sa branche, ou décider s'il revient.
- Retirer ou faire émettre l'événement `checkpointed` que rien ne produit.

### 19. Open questions [draft]

- Où s'inscrit l'observation d'une compaction dans un dossier dont le manifeste de contexte est
  scellé avant l'intervention ? C'est la même question que `D-55` laisse ouverte pour la strate
  imposée, et les deux se répondent probablement ensemble.
- La délégation reprend-elle la forme de l'exemple livré — un processus par enfant, contexte isolé,
  sortie structurée — ou celle du superviseur que 495 possède déjà ? Le second volet de `D-55`
  demande la forme de ce qui existe ; ici deux formes existent.
- `src/domain/imposed-layers.ts` reste une attente que rien ne confronte tant que son contrôle vit
  sur une autre branche. Est-ce l'état voulu jusqu'à `e23s06`, ou une porte à remettre ?

### 20. References [draft]

- `specs/adr/D-55` — 495 s'appuie sur l'API de Pi avant de reconstruire ou de déduire ; la liste
  laissée ouverte à la fin de ses conséquences est l'objet de cette story.
- `specs/adr/ADR-014`, `ADR-018`, `D-08`, `D-12` — provenance humaine et frontière entre la session
  Pi et le journal 495.
- `specs/product/SCOPE_LATEST.yaml` — le relevé lui-même, sous l'epic e24, section `prior_art`.
- `specs/archive/amont/expression-besoins.md` — `AGT-05`, `CTX-02`.
- `src/extension/index.ts`, `src/extension/session.ts`, `src/adapters/pi-worker/worker-main.ts`,
  `src/adapters/platform/paths.ts`, `src/domain/imposed-layers.ts`, `src/ports/execution.ts`.
- `node_modules/@earendil-works/pi-coding-agent/docs/compaction.md` et `docs/security.md`.
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/` — `subagent/`, `handoff.ts`,
  `project-trust.ts`, `permission-gate.ts`, `entry-renderer.ts`, `custom-compaction.ts`.
