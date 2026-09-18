# R4 — Revue UX et accessibilité

**État :** en attente — l'utilisateur représentatif et l'environnement manquent ; une observation
partielle dans un vrai terminal est enregistrée plus bas, avec trois constats
**Sortie exigée (§11) :** résultats des tâches, obstacles, limites et acceptabilité
**Autorité requise :** un utilisateur représentatif, dans un vrai terminal

## Pourquoi elle n'est pas conduite ici

La sortie exigée par §11 est constituée de *résultats de tâches* : quelqu'un essaie de faire
quelque chose, et on note ce qui lui résiste. Aucun test ne produit cette sortie. Un test de
composant établit qu'une largeur est respectée, qu'une touche déplace la sélection, qu'un statut est
lisible sans couleur ; il n'établit pas qu'une personne comprend ce qu'elle voit, trouve ce qu'elle
cherche, ou renonce.

Deux choses manquent, et elles sont distinctes : l'**autorité** — un utilisateur qui n'a pas écrit
l'interface — et l'**environnement** — un vrai terminal, avec sa police, ses couleurs, sa taille,
son émulateur et, pour l'accessibilité, un lecteur d'écran.

Le rendu de revue est aujourd'hui qualifié « par rendu simulé, pas par observation humaine », et
c'est exactement ce que cette revue lèverait.

## Périmètre exact

- La vue de revue TUI : `src/presentation/tui/review-surface.ts` — arbre à gauche, lecteur à droite,
  en-tête, zone de contexte, aide clavier.
- Le modèle de revue qui l'alimente : `src/application/review.ts`, `src/application/diff.ts`.
- La projection non TUI : `src/presentation/structured/review-text.ts` et
  `src/presentation/structured/text.ts`, pour print, JSON, RPC et hôte SDK.
- Les interactions humaines `IH-*` telles qu'elles se présentent à l'utilisateur : questions,
  options, effets annoncés, caractère risqué.
- La progression : statut de pied de page, messages émis, et ce qu'un utilisateur comprend de
  l'avancement d'un changement qui dure plusieurs minutes.

Hors périmètre : la lisibilité du code des cibles, qui appartient à leurs auteurs.

## Critères examinés

| Réf | Critère | Exigence amont |
| --- | --- | --- |
| R4-C01 | Le workflow complet est conduisible dans le TUI Pi, sans outil d'entrée séparé. | `UX-01` |
| R4-C02 | Les autres entrées de Pi rendent la même information, sans dialogue et sans widget. | `UX-02`, `UX-11` |
| R4-C03 | La progression est compréhensible pendant une opération longue. | `UX-03` |
| R4-C04 | Une décision est recueillie par l'hôte Pi, avec ses options et l'effet de chacune. | `UX-04` |
| R4-C05 | Le cycle de vie des sessions Pi est respecté : rechargement, bifurcation, changement de projet. | `UX-05` |
| R4-C06 | L'arborescence et les statuts sont compréhensibles **sans couleur**. | `UX-06` |
| R4-C07 | Le code et ses modifications se lisent sans préfixes de diff, sans marqueurs de patch et sans numéros de ligne, en préservant le texte source. | `UX-07` |
| R4-C08 | La navigation au clavier est complète, le focus visible, la sélection conservée, le mode étroit utilisable. | `UX-08` |
| R4-C09 | Les états comparés sont identifiés et leur actualité signalée. | `UX-09` |
| R4-C10 | Les cas particuliers — binaire, lien, sous-module, fichier trop grand, contenu terminal hostile — sont présentés sans tromper le lecteur. | `UX-10` |
| R4-C11 | L'interface est utilisable par une personne qui n'a pas écrit 495. | acceptabilité, §11 |

## Preuves disponibles

| Preuve | Où | Ce qu'elle établit |
| --- | --- | --- |
| Tests de composant du rendu | `test/v0/review-surface` : « never exceeds the width nor the terminal rows and shows textual statuses » | R4-C06 partiellement : les statuts sont du texte, pas seulement une couleur. |
| | « renders OLD/NEW blocks without +/- prefixes, hunk markers or line numbers, preserving literal operators » | R4-C07 partiellement. |
| | « keyboard navigation keeps selection and focus, exits on q without side effects » | R4-C08 partiellement. |
| | « below the width threshold alternates tree and reader with the same selection and all actions » | R4-C08, mode étroit. |
| | « fit truncates by visible characters » | R4-C07, troncature par caractères visibles. |
| Modèle de revue | `test/v0/review-model` | R4-C09, R4-C10 : union des chemins, statuts, renommage certain ou hypothétique, actualité du candidat, limites portées explicitement. |
| Projection textuelle | `src/presentation/structured/review-text.ts`, `test/v0/review-model` | R4-C02 : mêmes identités, statuts, portions et limites, sans widget. |
| Entrées print et JSON réelles | `test/v3/pi-entries` | R4-C02 : même verdict, vue canonique en JSON, aucun échappement terminal en mode JSON ; un diagnostic de démarrage atteint chaque entrée. |
| Décisions | `src/application/decisions.ts` | R4-C04 : chaque interaction porte sa question, ses options, l'effet de chacune et son caractère risqué, en français ou en anglais. |
| Cycle de vie | `test/v2/ledger` (« a reloaded extension and a forked conversation resolve the same change ») | R4-C05. |
| Neutralisation du contenu | `neutralize` dans `src/application/review.ts` | R4-C10 : les séquences terminales d'un contenu hostile sont rendues inertes à l'affichage, les octets conservés restant intacts. |

## Format de constat

Enveloppe `Finding`, catégorie `review`. Un constat d'ergonomie porte en plus, dans `message`, la
**tâche** tentée et le point de blocage : « attendu / observé » sans la tâche n'est pas exploitable
pour une interface. Voir [README.md](README.md#format-de-constat).

## Ce que le reviewer ne peut pas conclure faute de preuve

- **Que l'interface est utilisable.** Toutes les preuves existantes sont des tests de composant sur
  des données canoniques. Aucune n'observe une personne.
- **Que le rendu est correct dans un vrai terminal.** Les tests mesurent des largeurs et des lignes
  en mémoire. Police, largeur réelle des caractères est-asiatiques, émulateur, thème sombre ou
  clair, redimensionnement pendant l'affichage : rien de tout cela n'est exercé.
- **Que l'accessibilité est atteinte.** Aucune norme n'est nommée dans l'amont, aucun lecteur
  d'écran n'a été utilisé, aucun contraste n'a été mesuré. Ce qui est établi est plus étroit et doit
  être dit comme tel : les statuts sont lisibles **sans couleur**, ce qui n'est pas l'accessibilité,
  seulement l'une de ses conditions.
- **Que la progression est compréhensible.** `UX-03` est projeté par un statut de pied de page et
  des messages ; personne n'a été observé pendant les huit minutes d'un cycle réel.
- **Que le mode RPC rend la même chose.** `TRACEABILITY.md` le dit explicitement : concordance
  multicanale non exercée en RPC.

## Observation partielle dans un vrai terminal (17 septembre 2026)

Ceci n'est pas la conduite de la revue, et l'état du dossier reste « en attente » : l'observateur est
l'auteur, l'émulateur est unique, la largeur unique — environ 205 colonnes, donc jamais le mode
étroit —, aucun lecteur d'écran n'est utilisé et aucune norme n'est nommée à l'amont. Ce qui est levé
est plus étroit : trois commandes de lecture ont été rendues dans un vrai terminal sur un changement
réellement arrêté (`chg_mu5y1z75187d74d1ff`, G2 FAIL sur la qualification du capteur de couverture,
voir `../QUALIFICATION.md`), ce qui correspond à la tâche 5 du protocole proposé — lire le résultat
d'un changement refusé et dire pourquoi il l'a été — tentée par quelqu'un qui connaît le produit.

Ce qui tient. La liaison se retrouve par le répertoire courant : une session Pi neuve affiche
`495 verification_design/blocked` en pied de page avant toute commande. Les textes longs sont
enveloppés à la largeur du terminal, jamais tronqués : les trois identifiants de preuve, le chemin du
rapport JaCoCo manquant et les deux motifs de G2 sont lisibles intégralement. Le rapport rend ses
trois sections dans l'ordre et sans mélange — douze observations mécaniques nommant leur sujet
(`fixture sha256:428b3e0e9780`), trois jugements attribués au noyau, puis les risques résiduels.
Aucun diagnostic de démarrage n'est annoncé, ce qui est correct : rien d'anormal n'est à dire quand le
backend est qualifié. `/495 resume` rend le même état à la même révision, comme attendu d'un arrêt
`capability_missing`.

Trois constats.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| **R4-C03.** Le motif d'arrêt est rendu deux fois mot pour mot dans le même écran : `Motif d'arrêt`, puis `Prochaine action`, parce que `nextActionOf` rend `blocked: <stop_reason> — <stop_detail>` pour un changement bloqué. Le détail fait ici environ 500 caractères, soit six des quatorze lignes du statut occupées par le même texte, et le rapport le redonne une troisième fois en `stopped_before_the_end`. Attendu : la cause dite une fois, et une action suivante qui dit quoi faire. Observé : trois fois la même phrase, et aucune action. | `minor` | Ouvert, travail identifié — `../chantiers/G-lisibilite-etat-arrete.md` |
| **R4-C03.** La notification TUI d'une commande ne reprend que la première ligne du message. Pour `/495 status` c'est le titre du programme et le chemin du projet : la ligne la moins décisive de l'écran. Ce qui motive l'arrêt n'y figure pas. | `minor` | Ouvert, travail identifié — même fiche |
| **R4-C11.** Huit des douze risques résiduels du rapport sont les traces d'une qualification réussie : l'`INDETERMINATE` du témoin d'incident de chaque contrôle, et la note `spawn error … /nonexistent/495-broken-runner` qui l'accompagne. Ces deux faits sont précisément la preuve que le capteur sait détecter une panne de capteur. Ils portent sur le sujet `fixture`, pas sur le candidat, et la boucle qui construit les risques ne lit pas ce champ — que `controls_are_not_a_proof` utilise pourtant. Attendu : les risques résiduels du changement. Observé : quatre lignes sur douze qui le concernent, dont celle qui nomme la cause de l'arrêt. Sur un changement accepté, la proportion s'inverse sans s'améliorer : quatre traces de témoins pour un seul risque du changement. | `major` | Ouvert, travail identifié — même fiche |

Ce que cette observation ne lève pas : le mode étroit, la conduite d'un cycle réel et sa progression,
l'accessibilité, et l'acceptabilité par quelqu'un qui n'a pas écrit 495.

### La surface de revue, regardée dans un vrai terminal

Le candidat de la seconde cible de démonstration a été ouvert dans le TUI (`/495 review`). Ce que
`R4-C07` demande est tenu à l'écran : le lecteur rend « Modifications — test/shout.test.js », la
borne `1…0 → 1…11`, le bloc `NOUVEAU`, et le code sans préfixe `+`/`-`, sans marqueur de hunk et sans
numéro de ligne. L'arbre porte les statuts en texte — `M`, `A`, `D` — et un agrégat par répertoire.

Deux observations, dont un constat.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| **R4-C08.** Les deux panneaux ne sont pas alignés : le séparateur tombe à une colonne différente selon la ligne. `fit` comptait les points de code de la chaîne **déjà stylée**, or chaque couleur ajoute dix caractères invisibles. Mesuré sur le candidat, à 120 colonnes : les lignes stylées occupaient 110 colonnes, les lignes vides 120, et le séparateur apparaissait aux colonnes 37 et 47. Attendu : une ligne occupe la largeur annoncée. Observé : elle l'occupe moins d'autant que le thème la colore. | `major` | **Clos.** `fit` mesure le texte visible, l'hôte injecte sa propre mesure (`truncateToWidth` de `pi-tui`) par `SurfaceOptions.fit`, et `v0/review-surface` éprouve l'invariant avec un thème qui émet de vraies séquences : toutes les lignes occupent la largeur annoncée, le séparateur tient une colonne. Voir `D-35`. |

Ce constat est exactement ce qu'aucun test de composant ne pouvait rendre : le thème `PLAIN` des
tests n'émet aucune séquence, donc la largeur y était juste par construction. Il a fallu un vrai
thème dans un vrai terminal.

Une observation sans constat : l'arbre s'ouvre sur les chemins modifiés seuls — « changements
uniquement » est le filtre par défaut, `c` bascule vers l'arbre complet. Les cas particuliers
intacts — le lien vers un répertoire, le fichier au-delà du budget de lecture, le sous-module, le
fichier au nom hostile — ne sont donc visibles qu'après cette bascule. C'est cohérent pour une revue
de changement, et c'est à savoir pour instruire `R4-C10`.

### Deux candidats montés pour l'observation, et deux cas que l'arbre ne porte pas

Aucune cible réelle n'atteint un candidat, donc la surface de revue n'avait rien à montrer. Deux
cibles de démonstration ont été construites hors du dépôt et conduites de la demande à l'acceptation
avec un agent scripté (`QUALIFICATION.md`) : la première porte un fichier modifié et trois ajoutés,
la seconde y ajoute les cas particuliers de `R4-C10`. Ce que le modèle de revue rend pour chacun est
mesuré et transcrit là-bas ; la surface TUI passe chaque ligne affichée — titre, nom de nœud, bloc de
diff, page de contenu — par `neutralize`, donc un nom de fichier ou un contenu portant des séquences
terminales est rendu inerte sans que les octets conservés soient touchés.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| **R4-C10.** Le genre `submodule` est déclaré par `ENTRY_KINDS` et projeté en `special` par le modèle de revue, mais `walkTree` ne le produit jamais. Un sous-module est inventorié comme un répertoire ordinaire et son fichier `.git` — écarté seulement à la racine — est lu comme du contenu de projet : la page de contenu rend `gitdir: ../../.git/modules/vendor/sub-lib`. Attendu : un sous-module présenté comme tel, ou déclaré non porté. Observé : une frontière invisible et de la plomberie Git présentée comme du code. | `major` | Ouvert, travail identifié — `../chantiers/H-inventaire-cas-particuliers.md` |
| **R4-C10.** Un fichier spécial est inventorié (`special`, note « special file: not read ») mais n'est pas recopié par `createWorkspace`, qui ne traite que fichiers et liens. Mesuré sur un tube nommé : le candidat rend `deleted special pipe.fifo` et place le chemin dans `selected_paths`. Attendu : un fichier spécial présenté sans tromper le lecteur. Observé : une suppression que personne n'a faite, portée par l'empreinte du candidat. | `major` | Ouvert, travail identifié — même fiche |

## Ce qui manque pour conduire

| Manque | Pourquoi il est bloquant | Ce qui le lèverait |
| --- | --- | --- |
| Un utilisateur représentatif | La sortie exigée est un résultat de tâche ; il n'y a pas de tâche sans quelqu'un pour la tenter. | Une personne n'ayant pas écrit 495, un protocole de tâches écrit d'avance, et la consigne de ne pas l'aider. |
| Un vrai terminal | R4-C06 à R4-C10 ne sont établis qu'en mémoire. | Une session `pi` sur un cycle réel, dans au moins deux émulateurs et deux largeurs, dont une sous le seuil du mode étroit. |
| Un lecteur d'écran et une norme nommée | L'accessibilité n'est aujourd'hui ni définie ni mesurée. | Choisir la norme visée, puis l'exercer. La norme relève de l'amont : c'est une révision d'exigence, pas un constat de revue. |
| Un client RPC | R4-C02 reste indéterminé pour une entrée annoncée. | Rattaché à `chantiers/C`. |

## Protocole proposé pour la conduite

Écrit d'avance pour que le résultat soit un constat et non une impression. Cinq tâches, chacune
chronométrée, l'observateur ne répondant à aucune question pendant la tâche :

1. Démarrer un changement sur un projet inconnu et dire, sans aide, ce que 495 est en train de faire.
2. Trouver le fichier qu'un candidat a modifié, et lire la modification.
3. Répondre à une décision en disant d'abord ce que chaque option va produire.
4. Conduire la même revue en mode étroit, puis revenir à la conversation et retrouver sa sélection.
5. Lire le résultat d'un changement refusé et dire pourquoi il l'a été.

Sont notés : la tâche achevée ou non, le temps, les points de blocage, ce qui a été mal compris, et
ce que la personne a cherché sans le trouver.
