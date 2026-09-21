# D-42: Le référentiel de qualité du code est Biome, et deux de ses règles sont écartées avec leur motif

**Status:** Acceptée

**Décision.** Le code TypeScript du harnais est tenu par Biome 2.5.14 (biomejs.dev, `MIT OR
Apache-2.0`), preset `recommended`, adopté le 20 septembre 2026. `npm run lint:code` entre dans
Preflight. Deux règles sont désactivées dans `biome.jsonc`, chacune portant son motif à côté d'elle.
`style/noNonNullAssertion` : `tsconfig.json` active `noUncheckedIndexedAccess`, donc tout accès
indexé rend `T | undefined`, et le `!` y est l'assertion d'un invariant à l'endroit qui le connaît.
`suspicious/noTemplateCurlyInString` : les sources de cible et les invites de producteur voyagent
comme littéraux de chaîne, où `${name}` est le texte qu'un candidat doit contenir, pas une
interpolation oubliée. Le formateur reste désactivé.

**Motif.** Aucun linter n'était configuré : pas de `biome.jsonc` ni d'équivalent, Biome absent des
dépendances, et le commentaire `biome-ignore` de `worker-main.ts` visait un outil que rien
n'exécutait. Preflight tenait le typage — `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess` — et quatre contrôles maison de structure, mais aucune analyse statique
standard. La mesure d'ouverture donne 446 constats sur 134 fichiers, dont 349 pour la seule règle
`noNonNullAssertion`, soit 78 % du total et 110 dans `src/`. La retenir aurait fait de la baseline un
bruit de fond noyant les 97 autres constats, pour un gain de sûreté nul sur un arbre déjà typé
strictement ; les 27 `noTemplateCurlyInString` sont des faux positifs de même nature.

**Conséquence.** La baseline utile tombe à 71 constats, tous traités. Deux erreurs : une affectation
dans une condition de boucle, et une variable de test masquant le global `escape`. Six morceaux de
code mort, dont le port de stockage d'objets que `GitIntegrator` retenait sans jamais le lire, et une
écriture de `config` que la ligne suivante contournait en relisant `msg.config`. Le reste est
mécanique : import de type, chaînage optionnel, clés littérales. `npm run lint:code` rend zéro
constat et Preflight refusera le suivant. `scripts/check-distribution.ts` accepte désormais une
disjonction SPDX dont toutes les branches sont permissives : l'allowlist testait l'égalité exacte,
donc `MIT OR Apache-2.0` en était refusée alors que le script fabrique lui-même de telles
disjonctions depuis le champ `licenses` — tout paquet à double licence échouait, non le seul Biome.

**Limite.** Cette adoption porte sur le code du harnais et sur lui seul. Elle ne donne au noyau
aucune des capacités que `QLT-01` exige pour une cible : définir un référentiel par technologie et
par composant, exposer chaque règle et son oracle, tenir les seuils sous justification adoptée.
`QLT-01` reste absente de `TRACEABILITY.md`, et le formateur est le volet différé de l'adoption : le
code n'a jamais été formaté par un outil — médiane 37 caractères, p99 293, 327 lignes de plus de 200
caractères dans `src/` — et l'activer réécrirait 131 des 134 fichiers d'un coup.
