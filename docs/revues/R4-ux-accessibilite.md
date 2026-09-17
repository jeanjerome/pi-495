# R4 — Revue UX et accessibilité

**État :** en attente — l'utilisateur représentatif et l'environnement manquent
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
