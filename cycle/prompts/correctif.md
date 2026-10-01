/node

Correction d'un défaut du registre, sur `main`, arbre propre. Le propriétaire a délégué à la suite la
correction des défauts ouverts dont la gravité est au moins `{{seuil}}` ; {{contexte}}. Quand
`npm run typecheck` est rouge, charge le skill `typescript-magician` avant de corriger le type.

Défauts ouverts de gravité au moins `{{seuil}}`, le plus grave d'abord, le plus ancien d'abord à
gravité égale :

{{defauts}}

Lis leurs entrées dans `specs/bugs/registry.yaml`. **Choisis le premier qui ne demande aucune décision
de produit** : sa correction est la seule qui dérive de ce qu'il attendait. Un défaut dont l'entrée
dit que sa correction ajoute un refus, un état ou un dialogue, ou qu'il faut décider entre deux
comportements, ne se corrige pas seul : nomme-le dans `a_decider`, avec la raison, et passe au
suivant. Nomme de même chaque défaut que tu écartes.

Écris pour le défaut choisi la story de correction `specs/stories/e28/e28s<NN>-<titre>.md`, `NN` étant
le prochain numéro libre de l'epic `e28` :
- l'en-tête dit `Epic : e28`, `Statut : à faire` ;
- la section 1 **cite l'identifiant de l'entrée du registre** (`BUG-…`) et dit qui gagne à ce que le
  défaut soit corrigé ;
- les promesses sont ce que l'entrée attendait (`what_expected`), en scénarios dont chaque `Then` nomme
  un artefact, un événement, un refus ou un message ;
- chaque tâche a son rouge, vérifié dans le code avant d'être écrit : le test rouge que l'entrée décrit
  (`steps_to_reproduce`, `evidence`), puis le correctif ;
- le hors-périmètre dit ce que la story ne corrige pas.
Lis `cycle/format-de-story.md`. La story corrige ce défaut et rien d'autre.

Inscris-la au plan sous l'epic `e28` : si l'entrée porte `stories: []`, remplace cette ligne par
`stories:` suivie de la ligne de la story ; sinon ajoute la ligne à la fin de la liste
(`- { id: e28sNN, status: "à faire", title: "…" }`). Lance `npm run lint:story-format` et lis son code
de sortie. Ne commite pas : l'outil le fait avec ton `message`, une ligne en anglais qui dit le
comportement que la story promet. Ne modifie aucun autre fichier, ne pousse rien.

Ta sortie :
- `status` : `ecrite` quand tu as écrit la story d'un défaut ; `aucun` quand chaque défaut restant
  demande une décision de produit ;
- `story_id`, `bug_id` (vides sauf `ecrite`), `message`, `resume` ;
- `a_decider` : les défauts écartés, chacun avec sa raison.
