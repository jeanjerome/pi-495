STORY KEY: e24s01
TITLE:     Établir ce qui répond déjà aux besoins de la surface de revue
TYPE:      Story
PARENT:    e24
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      S

### 1. Business narrative [draft]

495 est une extension de Pi, et Pi existe pour qu'il n'ait pas à reconstruire. La règle est écrite
et acceptée. Elle n'avait pourtant jamais été appliquée à une surface entière : elle était née d'un
cas isolé — un contrôle qui relisait du code tiers à l'expression régulière quand Pi publiait
l'accroche qui rapportait le fait.

Le coût de ne pas regarder est mesuré. Quatre défauts d'une seule surface, la revue, ont été trouvés
en lisant ce que Pi publiait déjà : un alignement faux sur les glyphes larges, les emojis et les
accents combinants ; les touches Début, Fin, Suppr et les flèches modifiées arrivant en octets
bruts ; des noms de fichier coupés dès que le relecteur réduisait le partage ; et la hauteur du
terminal ignorée après un redimensionnement. Aucun n'aurait été vu autrement.

Ce que cette story établit n'est pas un correctif de plus : c'est le relevé, besoin par besoin, de
ce qui répond déjà. Sans lui, chaque défaut suivant se paie au même prix, un par un, et la règle
reste une intention.

#### ADDED: relevé d'antériorité de la surface de revue

**Before:** la règle nomme la documentation de Pi, la surface publiée par la version épinglée et les
paquets pairs comme les endroits où chercher, et demande que ce qui a été étudié se dise. Rien ne le
dit. Ce que 495 a écrit lui-même et ce qu'il a repris est indiscernable à la lecture, et un
relecteur qui voudrait le savoir doit refaire l'étude.

**After:** chaque besoin de la surface de revue porte son verdict et son motif — réutiliser,
s'inspirer de la forme, ou écrire — avec la source consultée. Les besoins où l'on écrit disent ce
qui a été cherché et non trouvé. Les critères sont écrits avant d'être appliqués. Le relevé vit dans
le périmètre, versionné avec lui.

### 2. Value statement [draft]

As a propriétaire du harnais, I want savoir, pour chaque besoin d'une surface, ce qui y répondait
déjà et pourquoi il a été retenu ou écarté, so that une réécriture soit une décision défendue et non
le résultat de n'avoir pas regardé.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — arbitre les verdicts que le relevé rend ; c'est la seule autorité
  qui décide d'adopter un candidat, l'étude ne faisant que les établir.
- **Agent** (system) — conduit la recherche dans l'ordre prescrit, applique les critères annoncés,
  et écrit le relevé. Il ne décide d'aucune adoption.
- **Relecteur** (external) — lit le relevé pour savoir ce qui a été cherché sans refaire l'étude.

### 4. Trigger and preconditions [draft]

**Déclencheur :** la commande d'antériorité est invoquée sur un epic avant qu'une capacité de son
périmètre soit écrite.

**Préconditions :** le paquet Pi est installé, donc sa documentation hors ligne et ses extensions
d'exemple sont lisibles sans réseau ; le périmètre et l'index des epics sont écrits ; la version
épinglée est connue, un fait annoncé par la documentation n'étant pas un fait que ce dépôt possède.

### 5. Main flow and business logic [draft]

1. Les besoins de la surface sont énumérés depuis ce que son code tient aujourd'hui, pas depuis ce
   qu'on croit qu'elle fait.
2. Les critères sont écrits avant d'être appliqués : ce que le besoin demande réellement, la
   licence, l'entretien du paquet, le poids ajouté, et ce à quoi l'adoption nous lie.
3. La recherche suit un ordre : ce dépôt, puis l'API et les paquets de Pi, puis les paquets
   construits pour Pi par d'autres, puis ce qui existe hors de cet écosystème.
4. Chaque candidat est éprouvé sur la version installée, jamais sur ce qu'une page annonce.
5. Chaque besoin reçoit un verdict — réutiliser, s'inspirer de la forme, écrire, ou « besoin
   absent » — et le motif qui le tient.
6. Le relevé est écrit dans le périmètre, sous le besoin qu'il instruit.

### 6. Alternative flows and exceptions [draft]

- **Aucun candidat ne s'applique** — le verdict est « écrire », et le relevé dit ce qui a été
  cherché et non trouvé, pour que la prochaine lecture n'ait pas à refaire le chemin.
- **Un candidat existe mais une exigence l'écarte** — le motif nomme l'exigence, pas une préférence.
  Un candidat écarté par un besoin réel n'est pas un candidat absent.
- **Un candidat existe en plusieurs forks concurrents** — le relevé les nomme tous et dit que le
  choix entre eux est une question distincte, laissée au propriétaire.
- **Un candidat est déjà adopté sans que personne l'ait écrit** — le verdict est « réutiliser, déjà
  fait », avec l'endroit où l'adoption vit. C'est le cas le plus utile à consigner : il est invisible
  au lecteur et indistinguable d'une réécriture.
- **Un candidat existe mais ne peut pas être consommé** — la manière dont il est publié fait partie
  du critère de poids, et le relevé la mesure au lieu de la supposer.

### 7. Interface elements [draft]

Not applicable — l'étude ne rend rien à l'écran ; son livrable est un texte versionné.

### 8. Domain model [draft]

Le relevé porte, par besoin examiné : le besoin tel que le code le pose, le candidat ou son absence,
la source où il a été trouvé, le verdict, et le motif. Aucun de ces éléments n'entre dans le domaine
exécutable du harnais : ce sont des données de spécification, lues par des humains.

### 9. Integrations and boundaries [draft]

Les trois sources sont sur la machine et se lisent hors ligne : les pages de documentation et les
extensions d'exemple du paquet Pi installé, les paquets pairs, et l'arbre installé sous
`node_modules`. Le registre npm est joint pour établir ce qu'un paquet publie réellement — versions,
licence, dépendances — parce qu'une page de dépôt n'est pas ce qui s'installe.

### 10. Background processes [draft]

Not applicable — l'étude est conduite à la demande, jamais sur horloge.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session ; le relevé est le rendu.

### 12. Audit and logging [draft]

**Entité auditée :** le relevé lui-même. Il est versionné avec le périmètre, donc l'historique du
dépôt porte qui l'a écrit, quand, et ce qu'il disait avant. Aucune trace d'exécution n'est produite :
l'étude n'ouvre pas d'intervention et n'écrit pas au journal des campagnes.

### 13. Solution variabilities [draft]

- **Ordre de recherche** (méthode) — ce dépôt, Pi, les paquets tiers de l'écosystème, puis le
  dehors. L'ordre est contraint : trouver chez Pi ce qu'on cherchait ailleurs coûte moins cher que
  l'inverse.
- **Critères** (méthode) — besoin réel, licence, entretien, poids, couplage. Ils sont annoncés avant
  d'être appliqués, sans quoi un critère se choisit pour justifier un verdict déjà pris.
- **Profondeur** (jugement) — proportionnée à la taille du besoin. Une étude qui coûte plus que la
  réécriture qu'elle évite a manqué son objet.

### 14. Quality attributes *NFR* [draft]

**Reproductibilité.** Chaque verdict nomme ce qui a été lu — fichier, page, version — pour qu'un
tiers puisse le contredire sans refaire la recherche. Un verdict sans source est une opinion.

**Péremption.** Le relevé décrit la version installée au jour de l'étude. Il n'est pas tenu à jour
par un contrôle ; ce qui en dépend et doit le rester est porté par un contrôle propre, story par
story.

### 15. Security and compliance *NFR* [draft]

Lire un paquet tiers ne l'exécute pas, et l'étude n'installe rien pour conclure. Quand un candidat
est éprouvé, il l'est dans un répertoire jetable hors du dépôt, et sa licence est relevée avec ses
dépendances : la liste permissive du dépôt est un critère de l'étude, pas une découverte
d'installation.

### 16. UX and accessibility *NFR* [draft]

Not applicable — l'étude ne touche aucune surface rendue à un lecteur.

### 17. Acceptance criteria [draft]

```gherkin
Scenario: chaque besoin examiné porte son verdict et son motif
  Given une surface dont les besoins sont énumérés depuis son code
  When l'étude d'antériorité est conduite
  Then chaque besoin porte un verdict parmi réutiliser, forme, écrire ou besoin absent
  And chaque verdict nomme la source lue et le motif qui le tient

Scenario: un besoin sans candidat dit ce qui a été cherché
  Given un besoin auquel aucun candidat ne répond
  When le verdict est écrit
  Then il dit ce qui a été cherché et non trouvé
  And la prochaine lecture n'a pas à refaire le chemin

Scenario: un candidat écarté nomme l'exigence qui l'écarte
  Given un candidat qui répond au besoin mais qu'une exigence interdit
  When le verdict est écrit
  Then il nomme l'exigence, et non une préférence

Scenario: un candidat publié en forks concurrents ne se tranche pas seul
  Given un candidat publié sous plusieurs scopes par des comptes distincts
  When le relevé le consigne
  Then il les nomme tous
  And il dit que le choix entre eux revient au propriétaire

Scenario: une adoption déjà faite est consignée comme telle
  Given un besoin auquel le code répond déjà en réutilisant une API de l'hôte
  When le relevé le consigne
  Then le verdict est réutiliser, déjà fait, avec l'endroit où l'adoption vit

Scenario: un candidat inconsommable est mesuré, pas supposé
  Given un candidat dont la façon d'être publié empêche la consommation
  When le critère de poids est appliqué
  Then l'empêchement est mesuré sur la machine et écrit avec son coût

Scenario: les critères précèdent leur application
  Given une étude qui commence
  When le premier verdict est écrit
  Then les critères étaient écrits avant lui
```

### 18. Out of scope [draft]

- Adopter un candidat. L'étude établit ; le propriétaire arbitre ; l'adoption est e24s02.
- Les besoins des autres surfaces : le bac à sable est e24s03, ce que Pi tient déjà est e24s04.
- Tenir le relevé à jour quand une version bouge. Ce qui doit le rester reçoit un contrôle propre.

### 19. Open questions [draft]

- Le choix entre les deux forks du paquet retenu reste ouvert ; e24s02 en a pris un et l'a écrit.
- Rien n'oblige une capacité future à passer par l'étude : la règle est écrite dans les conventions,
  aucune porte ne la tient. Faut-il qu'une porte la tienne, et que refuserait-elle exactement ?

### 20. References [draft]

- `specs/adr/D-55` — 495 s'appuie sur l'API de Pi avant de reconstruire ou de déduire.
- `specs/product/SCOPE_LATEST.yaml` — le relevé lui-même, sous l'epic e24, section `prior_art`.
- `CONVENTIONS.md` § *Pi is the host, not one dependency among others*.
- `node_modules/@earendil-works/pi-coding-agent/docs/` — les pages lues hors ligne.
