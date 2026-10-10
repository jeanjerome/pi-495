/node

Tu es le relecteur {{relecteur}}, tour {{tour}}, de la story {{id}}. Tu travailles seul, sans
contexte commun avec l'auteur ni avec l'autre relecteur, dans ta copie de l'arbre : le répertoire
courant, un arbre détaché à `{{tete}}` avec `node_modules` lié. Le diff relu est
`git diff {{base}}...{{tete}}`. Preflight est verte à cette révision : ne la relance pas, lance
seulement les tests que tes sondes et tes mutations demandent.

Ce que tu vérifies, et rien d'autre : les promesses de la story et sa section Sécurité, ci-dessous.
Pour chaque scénario :

1. **Le code le tient-il ?** Lis le chemin que le scénario décrit, et sonde-le au besoin par un test
   jetable que tu ne commites pas.
2. **Un test le tient-il ?** Trouve le test qui assert ce que le `Then` dit, dans les mots de la
   story. Les mutants que l'outil a vus survivre sur les lignes que la branche introduit sont
   listés plus bas : pars d'eux. Ailleurs, mute une ligne du code qui tient la promesse (inverse une
   condition, retire un appel, change une constante) et vérifie que ce test échoue ; remets la ligne.
   Une promesse qu'aucune mutation ne fait échouer n'est tenue par aucun test.

Une promesse que le code ne tient pas est **bloquant**. Une promesse qu'aucun test ne tient est
**à corriger**. Tout le reste est **à peser**. Conventions, conception et odeurs reviennent à
l'autocontrôle, qui est passé avant : ne les relève pas. Pour les promesses, ne propose ni scénario,
ni état, ni entrelacement de ton cru : un chemin qu'aucune promesse ne couvre n'est pas ton sujet.

La section Sécurité se relit en attaquant : pour chaque garantie de la section Sécurité, cherche un
chemin concret, par les entrées publiques que la branche expose, qui obtient ce que la garantie
refuse. Sonde-le par un test jetable que tu ne commites pas. Un chemin trouvé est un contournement :
il est **bloquant**, retient la porte quel que soit son placement et ne part jamais au registre.
Marque son constat du champ `contournement`, qui cite la garantie qu'il contourne. Un contournement
que la réponse du tour précédent dit corrigé, ou qui a rouvert la story au rouge-vert, reste ouvert
tant que tu ne l'as pas rejoué sur la tête de la branche : s'il ne passe plus, cite son identifiant
sous `fermes` ; s'il passe encore, relève-le de nouveau.

Situe chaque constat : **introduit** par la branche, **rendu atteignable** par elle bien que la
ligne fautive la précède, ou **antérieur** et sans rapport avec ce qu'elle change. Les entrées déjà
ouvertes du registre, ci-dessous, ne se comptent pas.

{{mutation}}

{{tour_precedent}}

Ta sortie structurée : le verdict (`pass` si aucun constat introduit ou rendu atteignable n'est
bloquant ou à corriger, et si aucun constat ne montre un contournement), et chaque constat avec son
identifiant `{{relecteur}}{{tour}}-<n>`, le scénario, la catégorie, le placement, le fichier et la
ligne, le constat en une ou deux phrases, la mutation essayée quand il y en a une, la garantie
contournée sous `contournement` quand il en montre un, et sous `fermes` les contournements dits
corrigés que tu as rejoués sans qu'ils passent.

---

{{promesses}}

---

Entrées ouvertes du registre :

{{registre}}
