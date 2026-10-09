Rédaction de la prochaine story de l'epic {{epic}}, sur `main`, arbre propre. Le propriétaire a marqué
cette epic prête à se dérouler sans lui : tu écris la story qu'il aurait écrite avec toi.

Lis `cycle/format-de-story.md`, l'entrée de l'epic dans `specs/plan.yaml` (plus bas), les stories déjà
versées de l'epic, la source que l'entrée cite, et le code que la story touchera. Une story est
courte : un bénéficiaire nommé, des promesses en scénarios dont chaque `Then` nomme un artefact, un
événement, un refus ou un message, la sécurité, des tâches dont chacune dit ce qui la tient, et un
hors-périmètre qui dit ce qu'un lecteur pourrait attendre et qui ne l'a pas. Chaque rouge se
vérifie dans le code avant d'être écrit. Une story dit le but, pas la mécanique, et découpe le
travail en la plus petite story qui livre quelque chose.

La story peut porter son compagnon de vérification (`cycle/format-de-story.md` § Compagnon de
vérification) : pour chaque promesse, l'assertion qui la tient, les interactions à examiner et les
moyens retenus ou écartés avec leur raison. La liste des stories versées, plus bas, dit pour chacune
ce que son compagnon laisse non vérifié ; ouvre le compagnon par son chemin quand il te faut le
détail. Le choix d'un moyen sert la vérification des promesses : il ne change pas le besoin, qui
reste celui du propriétaire.

**Ne décide pas au nom du propriétaire ce qui lui revient** : un choix de produit entre deux
comportements défendables, une garantie qu'aucun texte n'a posée, un catalogue à constituer. Écris la
story qui n'en a pas besoin, en nommant ce qu'elle laisse ouvert dans le hors-périmètre ; si l'epic
n'a pas de première story sans un tel choix, rends `bloque` et dis lequel.

Ta sortie :
- `complete` quand les stories déjà versées livrent l'objet de l'epic ; rien à écrire.
- `ecrite` quand tu as écrit la story `specs/stories/{{epic}}/<id>-<titre>.md`, et son compagnon si tu
  l'écris, et l'as inscrite au plan
  sous l'epic (`stories:`, `status: "à faire"`, ordre d'exécution respecté). Lance
  `npm run lint:story-format` et lis son code de sortie. Ne commite pas : l'outil le fait avec ton
  `message`, une ligne en anglais de la forme `docs: the story <id> promises that <le comportement promis>`.
- `bloque` avec ce qui manque.

Ne modifie aucun autre fichier, ne pousse rien.

Ta sortie structurée : `status`, `story_id` (vide sauf `ecrite`), `message`, `resume`.

---

## Story attendue par le plan

{{attendue}}

## L'epic dans le plan

{{epic_plan}}

## Stories déjà versées de l'epic, et ce que leur compagnon laisse non vérifié

{{versees}}
