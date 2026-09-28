Réponse au tour {{tour}} de la relecture de la story {{id}}, sur la branche `{{branche}}`. Les
constats des deux relecteurs sont ci-dessous, déjà situés et classés.

Pour chaque constat :

- **bloquant** ou **à corriger**, introduit ou rendu atteignable : corrige-le sur la branche, test
  d'abord quand un test manque, en commits séparés. Une correction qui ajoute un mécanisme (un état,
  un refus, un cycle de vie) est conçue avant d'être posée : dis où l'état naît, qui le lit, combien
  d'entrées y mènent ; retirer une seconde entrée vaut mieux que la garder.
- **à peser** dont la correction n'ajoute aucun comportement (un test qui manque, un relevé faux, du
  code mort) : corrige-le dans ce tour. Dont la correction ajouterait un comportement : inscris-le
  au registre `specs/bugs/registry.yaml`, nommé comme introduit par la branche quand il l'est.
- **antérieur** : inscris-le au registre s'il n'y est pas, sans le corriger ici.
- Un constat que tu contestes : dis pourquoi, avec ce que tu as lu ou sondé ; ne le corrige pas.

{{mode}}

`npm run check` doit être vert à la fin ; lis son code de sortie. Ne pousse rien. Ta sortie
structurée dit, pour chaque constat, l'action (`corrige`, `registre`, `conteste`), le commit quand il
y en a un, et le motif en une phrase.

---

{{constats}}
