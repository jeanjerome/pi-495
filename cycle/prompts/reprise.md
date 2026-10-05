/node

Une reprise à comportement constant, {{id}} — {{titre}}, sur la branche `{{branche}}` partie de `main`
à `{{base}}`. Elle prend le chemin court de `specs/adr/D-80` : lis cette décision et `cycle/README.md`
§ Refactorings avant de commencer. Quand `npm run typecheck` est rouge, charge le skill
`typescript-magician` avant de corriger le type.

La reprise est décrite plus bas, telle que l'audit l'a écrite dans `specs/reprises.md`. Fais-la, et
rien d'autre : le reste de la liste a ses propres reprises. Les numéros de ligne datent de l'audit ; le
code fait foi. Lis le code que la reprise touche et ce qui l'appelle avant de le modifier.

**Comportement constant** veut dire : mêmes événements, mêmes artefacts, mêmes verdicts, mêmes refus,
mêmes contrats, mêmes textes destinés au propriétaire ou au modèle. Seul un échec interne qui
n'atteignait aucun de ceux-là peut gagner son contexte (une `cause`, un préfixe qui garde le texte
d'origine) ou cesser de planter sur une valeur qui n'est pas une `Error`.

Ce que l'outil vérifie après toi, sans te croire :
- la branche porte au moins un commit, et l'arbre est propre ;
- `specs/reprises.md` n'est pas modifié : l'outil l'écrit ;
- aucune ligne d'assertion de `test/` ne disparaît sans réapparaître à l'identique ailleurs : une
  assertion peut être déplacée, jamais réécrite ni retirée ; en ajouter une est permis quand la reprise
  le demande ;
- `npm run build` puis `npm run check` passent, et le nombre de tests ne baisse pas ;
- une session neuve relit ton diff et arrête la course si un comportement change ou si le diff déborde
  de la reprise.

Avant de rendre ta sortie, lance `npm run build`, puis `npm run check` sans tube, et lis son code de
sortie : il doit être vert. Un substitut automatique atteint aussi les chaînes : compare les littéraux
avant et après quand tu renommes. Garde les commentaires existants, sauf ceux que la reprise réécrit.
Commite sur la branche autant de fois que tu veux : l'outil écrase la branche en un seul commit sur
`main`. Ne pousse rien.

**Si la reprise ne peut pas se faire à comportement constant**, ou si le code la dément (le constat ne
tient plus, une story l'a déjà traitée), ne la force pas : remets la branche à `{{base}}`
(`git reset --hard {{base}}`) et rends `ecartee`, avec la raison en une phrase.

Ta sortie structurée :
- `status` : `faite` ou `ecartee` ;
- `message` : pour `faite`, le message du commit sur `main`, une ligne en anglais
  `<type>: <le comportement ou la forme obtenus>`, `refactor` quand `src/` change, `test` quand seul
  `test/` change, sans numéro de reprise ni de constat ; vide pour `ecartee` ;
- `raison` : pour `ecartee`, une phrase en français ; vide sinon ;
- `resume` : ce que tu as changé, et ce que tu as vérifié.

---

{{corps}}
