# D-44: Preflight refuse un export que rien ne lit hors de son module

**Status:** Acceptée

**Décision.** `npm run lint:exports` (`scripts/check-exports.ts`) entre dans Preflight. Il refuse
toute déclaration `export function` ou `export const` de `src/` dont le nom n'apparaît dans aucun
autre `.ts` de `src/`, `test/` ou `scripts/`. Il nomme, pour chacune, si le module s'en sert encore —
auquel cas c'est le mot-clé `export` qui est de trop — ou si rien ne la lit, auquel cas c'est la
définition. `src/contracts/` est hors portée, et les types ne sont pas jugés.

**Motif.** Biome couvre les imports morts, pas les exports morts, et rien d'autre ne le faisait. Le
défaut n'était pas théorique : `src/application/target.ts` exportait dix-huit symboles dont treize
n'étaient importés nulle part, et le balayage du reste de l'arbre en a trouvé vingt-trois autres.
Quatre n'étaient lues nulle part, pas même chez elles, et deux de ces quatre énonçaient une seconde
fois une connaissance déjà portée ailleurs : `gateOrder` redonnait l'ordre des gates que
`invalidation.ts` tient sous le nom `ORDER`, et `ACTIVE_PHASES` listait les phases actives alors que
`isActive`, juste en dessous, décide par un prédicat négatif et ne regardait jamais la liste. Deux
définitions libres de diverger en silence de celle qui fait foi.

**Portée et limites, assumées.** `src/contracts/` est exclu : ses types sont la forme publiée d'un
dossier et des schémas émis, et un type qu'aucun module ne nomme reste ce avec quoi un auditeur lit
un dossier. Seules les `function` et les `const` sont jugées : un type dans la signature d'une
fonction exportée appartient à cette signature, qu'on le nomme ou non, et distinguer les deux
demande plus qu'une lecture des déclarations. La recherche d'un lecteur est volontairement grossière
— une mention en commentaire compte —, parce qu'un contrôle qui crie au loup est un contrôle qu'on
désactive : celui-ci ne refuse qu'un nom qui n'apparaît strictement nulle part ailleurs.

**Conséquence.** La surface exportée est à zéro constat sur 145 modules. Le contrôle est éprouvé sur
trois témoins avant d'entrer dans Preflight : un export mort dont la fonction sert dans son module
est refusé et nommé comme tel, une définition que rien ne lit est refusée et nommée autrement, et
l'arbre intact passe.
