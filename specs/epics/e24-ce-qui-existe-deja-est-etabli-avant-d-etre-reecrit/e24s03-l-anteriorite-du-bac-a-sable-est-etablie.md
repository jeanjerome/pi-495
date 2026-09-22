STORY KEY: e24s03
TITLE:     Établir ce qui répond déjà au besoin de frontière d'exécution
TYPE:      Story
PARENT:    e24
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      S

### 1. Business narrative [draft]

Le dépôt porte 389 lignes de confinement écrites à la main : un backend Seatbelt qui génère son
profil, un backend bubblewrap qui ne qualifie sur aucune machine, un backend sans isolation qui le
dit, et un lanceur de processus. C'est la surface où l'écart avec l'écosystème est le plus grand :
la documentation de Pi traite le sujet en quatre motifs et livre deux extensions qui marchent, et
l'une d'elles est bâtie sur un paquet publié qui fait, en configuration, ce que ces lignes font en
code.

Une décision ouverte hésitait entre des backends écrits à la main, un paquet publié et une
micro-VM. Elle hésitait sans chiffres. Ce que cette story établit n'est pas l'arbitrage : c'est la
matière qui le rend possible — les candidats, leurs coûts, et ce qui les refuse aujourd'hui.

#### ADDED: relevé d'antériorité de la frontière d'exécution

**Before:** la décision nomme trois directions et aucune mesure. Ce que le dépôt écrit lui-même et
ce que l'écosystème rendrait est indiscernable, et personne ne sait ce que l'adoption coûterait ni
ce qui la refuserait.

**After:** chaque besoin de la frontière porte son verdict et son motif, chaque chiffre est mesuré
sur cette machine, et les deux obstacles qui refusent l'adoption aujourd'hui sont nommés avec la
commande qui refuse. L'arbitrage reste au propriétaire ; il ne lui manque plus la matière.

### 2. Value statement [draft]

As a propriétaire du harnais, I want savoir ce qu'un paquet publié rendrait de nos 389 lignes de
confinement, ce que son adoption coûterait et ce qui l'interdit aujourd'hui, so that la décision de
garder ou de remplacer se prenne sur des mesures plutôt que sur une préférence.

### 3. Actors and permissions [draft]

- **Propriétaire** (external) — arbitre. L'étude ne décide d'aucune adoption ; elle lui rend les
  candidats, les coûts et les obstacles.
- **Agent** (system) — conduit la recherche dans l'ordre prescrit, mesure sur la machine, écrit le
  relevé.
- **Relecteur** (external) — lit le relevé pour savoir ce qui a été cherché et ce qui a été mesuré
  sans refaire l'étude.

### 4. Trigger and preconditions [draft]

**Déclencheur :** une décision ouverte sur la frontière d'exécution, avant qu'une ligne de
confinement de plus soit écrite ou remplacée.

**Préconditions :** le paquet Pi est installé, donc `docs/containerization.md` et les extensions
d'exemple sont lisibles hors ligne ; les backends du dépôt existent et sont exécutables ; le
registre npm est joignable, parce qu'une page de dépôt n'est pas ce qui s'installe.

### 5. Main flow and business logic [draft]

1. Le besoin est écrit avant les candidats, depuis les exigences qui le posent et depuis ce que le
   port exige de forme — sept profils, un réseau en tri-état, aucun shell.
2. Les critères sont ceux de l'epic, annoncés avant d'être appliqués.
3. Les candidats sont relevés dans l'ordre : le dépôt, Pi et ses exemples, les paquets de
   l'écosystème, puis le dehors.
4. Chaque candidat est installé dans un répertoire jetable hors du dépôt, puis éprouvé par
   exécution : confinement du système de fichiers, refus réseau, verdict de qualification.
5. L'écart est chiffré sur ce qui est réellement produit — profil généré, plateformes, politique
   réseau — et non sur ce que le code source laisse supposer.
6. Ce qui refuserait l'adoption est éprouvé par la commande qui refuse.
7. Le relevé est écrit dans le périmètre, sous le besoin qu'il instruit.

### 6. Alternative flows and exceptions [draft]

- **Un candidat n'est pas éprouvable sur cette machine** — le relevé dit ce qui manque plutôt que
  de conclure. Un candidat non mesuré n'est pas un candidat écarté.
- **Une mesure contredit la précédente** — la mesure fausse est décrite avec sa cause, pas effacée.
  Une sonde qui bloque la boucle d'événements attribue au candidat un défaut qui est le sien.
- **Un obstacle est de licence et non de capacité** — il est nommé avec la porte qui refuse, et les
  issues possibles sont dites sans être choisies.
- **La capacité d'un candidat excède le besoin** — le verdict est « besoin absent », pas « adopter ».
  Une exigence interdit d'annoncer une plateforme avant recette ; la capacité ne crée pas le besoin.

### 7. Interface elements [draft]

Not applicable — l'étude ne rend rien à l'écran ; son livrable est un texte versionné.

### 8. Domain model [draft]

Le relevé porte, par besoin examiné : le besoin tel que le code le pose, le candidat ou son
absence, la source où il a été trouvé, le verdict et le motif, et la mesure qui le tient. Aucun de
ces éléments n'entre dans le domaine exécutable du harnais.

### 9. Integrations and boundaries [draft]

Les sources lues hors ligne sont `docs/containerization.md`, `docs/security.md` et les extensions
`sandbox/` et `gondolin/` du paquet Pi installé. Le registre npm est joint pour établir versions,
licences et dépendances réelles. Les candidats sont installés et exécutés dans un répertoire
jetable hors du dépôt ; aucune dépendance n'entre dans `package.json` du fait de l'étude.

### 10. Background processes [draft]

Not applicable — l'étude est conduite à la demande, jamais sur horloge.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session ; le relevé est le rendu.

### 12. Audit and logging [draft]

**Entité auditée :** le relevé. Versionné avec le périmètre, l'historique du dépôt porte qui l'a
écrit, quand, et ce qu'il disait avant. Aucune trace d'exécution n'est produite : l'étude n'ouvre
pas d'intervention et n'écrit pas au journal des campagnes. C'est délibéré — exécuter un candidat
change `environment_digest`, et le faire pendant une campagne rendrait celle-ci non transférable.

### 13. Solution variabilities [draft]

- **Profondeur de la mise à l'épreuve** (jugement) — un candidat se mesure par exécution quand la
  machine le permet, par lecture de ce qu'il publie sinon. Les deux sont écrits comme tels.
- **Frontière du besoin** (méthode) — l'étude vise la frontière que 495 pose autour d'un contrôle,
  pas celle qu'un opérateur poserait autour de sa session. Un motif qui isole tout le processus
  répond à une autre question.

### 14. Quality attributes *NFR* [draft]

**Reproductibilité.** Chaque chiffre nomme ce qui l'a produit — version installée, commande,
sortie. Un chiffre sans commande est une impression.

**Péremption.** Le relevé décrit les versions installées au jour de l'étude. Les commandes de
vérification cherchent une affirmation et jamais un nombre : une remesure garde les phrases et
change les nombres, et une porte accrochée au nombre périmerait sans que rien ait faibli.

### 15. Security and compliance *NFR* [draft]

Un candidat de confinement ne s'éprouve qu'en l'exécutant, ce qui est l'inverse d'une lecture
inerte. L'exécution a lieu dans un répertoire jetable hors du dépôt, sur des cibles choisies pour
être refusées — une écriture hors périmètre, une lecture de `~/.ssh`, une sortie réseau. Les
licences de l'arbre installé sont relevées avec le candidat : la liste permissive du dépôt est un
critère de l'étude, pas une découverte d'installation.

### 16. UX and accessibility *NFR* [draft]

Not applicable — l'étude ne touche aucune surface rendue à un lecteur.

### 17. Acceptance criteria [draft]

```gherkin
Scenario: le besoin est écrit avant les candidats
  Given une frontière d'exécution dont les exigences et le port posent les contraintes
  When l'étude commence
  Then le besoin est écrit avant que le premier candidat soit nommé
  And il porte ce que le refus capability_missing suppose de la frontière

Scenario: un candidat est éprouvé sur la version installée
  Given un candidat publié au registre
  When il est relevé
  Then il est installé hors du dépôt et exécuté
  And ses refus sont observés plutôt que déduits de son code

Scenario: un candidat non éprouvable dit ce qui manque
  Given un candidat dont un prérequis est absent de la machine
  When le verdict est écrit
  Then il nomme le prérequis manquant
  And il ne conclut pas à l'écart du candidat

Scenario: l'écart est chiffré sur ce qui est réellement produit
  Given un backend écrit à la main et un candidat qui répond au même besoin
  When l'écart est relevé
  Then il porte le profil réellement généré par chacun
  And la capacité que l'un a et que l'autre n'a pas

Scenario: un obstacle à l'adoption nomme la porte qui refuse
  Given un candidat qu'une règle du dépôt interdirait
  When l'obstacle est écrit
  Then il nomme la commande qui refuse
  And les issues possibles sont dites sans être choisies

Scenario: une mesure fausse est corrigée avec sa cause
  Given une première mesure qui attribue au candidat un défaut de la sonde
  When la sonde est corrigée
  Then le relevé porte la mesure juste et la cause de la fausse

Scenario: l'arbitrage n'est pas rendu par l'étude
  Given des candidats relevés et des coûts chiffrés
  When le relevé est clos
  Then il dit ce que chaque réponse coûterait
  And il laisse la décision au propriétaire
```

### 18. Out of scope [draft]

- Adopter un candidat, ou écrire l'ADR qui le porterait. La mesure sous Apple Container est la
  condition de l'arbitrage et n'appartient pas à cette story.
- Modifier `src/adapters/sandbox/`. L'étude ne touche aucun code.
- Ajouter une dépendance au dépôt. Les candidats sont installés hors de lui.
- Qualifier Linux. `NFR-05` reste infermable ; l'étude dit seulement quel candidat la refermerait.

### 19. Open questions [draft]

- `GPL-2.0` entre-t-il sur la liste permissive du dépôt, ou la dépendance qui la porte est-elle
  rédhibitoire ? C'est une décision de licence, pas un réglage de contrôle.
- Un adaptateur qui enveloppe un candidat peut-il tenir « Never uses a shell », ou faut-il
  reconstruire l'appel à partir du profil que le candidat génère ?
- La mesure sous Apple Container change-t-elle la réponse, et que devient `D-33` si un conteneur
  gère lui-même ce que le dépôt fixe ?

### 20. References [draft]

- `specs/adr/D-55` — 495 s'appuie sur l'API de Pi avant de reconstruire ou de déduire.
- `specs/product/SCOPE_LATEST.yaml` — le relevé lui-même, sous l'epic e24, section `prior_art`.
- `specs/archive/amont/expression-besoins.md` — `SEC-01`, `SEC-02`, `SEC-05`, `NFR-05`.
- `src/ports/execution.ts` — `SandboxPort`, `SandboxProfile`, `QualificationResult`.
- `src/adapters/sandbox/backends.ts`, `src/adapters/sandbox/process.ts` — les 389 lignes en cause.
- `node_modules/@earendil-works/pi-coding-agent/docs/containerization.md` et `docs/security.md`.
- `node_modules/@earendil-works/pi-coding-agent/examples/extensions/sandbox/`, `gondolin/`.
