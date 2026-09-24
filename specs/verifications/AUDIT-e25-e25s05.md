# Auto-revue — e25s05, config.json validé par un schéma

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`770c7a9..eb9676c`, puis la correction jusqu'à `57cd3b3`) ; code de production : `src/contracts/v1/config.ts`, `src/contracts/validate.ts`, `src/contracts/registry.ts`, `src/extension/config.ts`, `src/extension/session.ts` (un commentaire), et le contrat émis `contracts/v1/harness-config.json` |
| Conduite le | 2026-09-24 (UTC) |
| Branche | `config-validee-par-un-schema` |
| Mode | complet |
| Preflight au moment de la revue | vert à `57cd3b3` sous Node 24.21.0 — `npm run build && npm run check`, sortie 0, 449 tests |

Classés par nombre de commits sur 90 jours, le fichier de production le plus retouché du diff est
`src/extension/config.ts` (19 commits), lu en premier. Viennent ensuite `README.md` (21) et
`src/extension/session.ts` (16), dont le diff ne change qu'un commentaire.

## Ce que cette revue a corrigé avant son rapport

Deux défauts du nommage des clés inconnues dans un refus. Aucun ne laisse passer un fichier, aucun ne
reproduit une valeur. Sondés sur le code, puis corrigés en deux temps : les tests en rouge seuls
(`6e5401b`), puis la correction (`57cd3b3`).

- **Plusieurs clés non citables comptaient pour un seul écart.** La liste des écarts fusionnait les
  textes identiques. Or deux clés non identifiant sous la même section donnent le même texte. Quatre
  clés `"a b"`, `"c d"`, `"e f"` et `"g h"` sous `policy` donnaient une seule ligne, sans
  `and 3 more`, alors que la spec (§5, étape 6) compte les écarts au-delà des trois premiers. Le
  validateur ne rend jamais deux écarts au même pointeur sous le même mot-clé (mesuré), donc la
  fusion ne retirait que ces doublons. Elle est retirée.
- **Une clé qui contient `/` masquait la clé inconnue qu'elle désigne.** Chaque clé inconnue était
  rangée sous ses deux pointeurs, échappé et brut. Le pointeur brut de `budgets/x` sous `policy` est
  celui d'une clé `x` sous `policy.budgets`. Sous la copie de TypeBox du dépôt, qui échappe,
  `{"policy":{"budgets/x":1,"budgets":{"x":1}}}` ne nommait jamais `policy.budgets.x`, et l'ordre des
  clés dans le fichier décidait du résultat. Un écart prend désormais la clé dont le pointeur échappé
  est le sien, et le pointeur brut seulement à défaut, pour la copie de Pi.

Rouge rejoué dans un arbre détaché à `6e5401b` : 2 échecs sur 20 dans `test/v1/config-schema.test.ts`.
Un test v3 ajouté place le même cas sous la copie de Pi. Il passe avant et après, puisque cette copie
donne le même pointeur aux deux clés. Sans le repli sur le pointeur brut, il échoue, comme le test v3
de la clé `sk-q8v2x7/token`.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée, rien à classer `[OK]`/`[SUS]`/`[SLOP]`.
- ✓ Aucun secret dans le diff. `sk-q8v2x7` et `sk-ant-api03-SECRET` sont des marqueurs de test,
  cherchés pour prouver leur absence du refus.
- ✓ OWASP : le changement lit un fichier local et émet un refus. Dans les refus sondés, aucune valeur
  écrite n'apparaît, quelle que soit la forme de l'écart. `__proto__` et `constructor` sont refusés
  comme clés inconnues, et la fusion ne reçoit qu'un fichier accepté (`specs/security/REVIEW.md`,
  section e25s05).
- ✓ Aucun constat HIGH non traité, et aucune exception à `specs/security/EXCEPTIONS.md`.

## Provenance

- ✓ La capsule porte `type: feat` et `context: integration`, et cite ADR-006 et D-52.

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers.

## Conformité à CONVENTIONS.md

- ✓ Les relevés vont dans `specs/`. Aucun `gh issue create`, aucun appel direct à l'API GitHub.
- ✓ Le contrat vit dans `contracts/`, la lecture dans `extension/` (`lint:layers` vert).

## Périmètre

- ✓ Les fichiers touchés sont ceux du §20 de la spec. `src/extension/session.ts` ne change qu'un
  commentaire, qui citait le diagnostic de `policy.egress` retiré. `test/v2` et `test/v3` sont
  adaptés au refus de `policy.egress`, qui remplace son diagnostic.
- ✓ Aucune fonction spéculative.

## Règle du scout

- ✓ `section()` et le diagnostic de `policy.egress` ignorée sont retirés, sans code mort. Biome ne
  signale rien sur 180 fichiers.
- ✓ La variable `unknown`, qui portait le nom d'un type TypeScript, s'appelle désormais `unnamed`,
  et le paramètre de `unknownKey` s'appelle `found`.

## Types et sûreté

- ✓ Aucun `any`, `@ts-ignore` ou `eslint-disable` ajouté. Le `as unknown as T` de `session.ts`
  précède la branche.
- ⚠ Trois conversions de type restent : `params.allowedValues as string[]` et
  `schema as { properties? }` dans `config.ts`, `error as {…}` dans `validate.ts`. Elles lisent des
  structures de TypeBox que ses types publics n'exposent pas. `expectation` rend un texte fixe pour un
  mot-clé qu'elle ne connaît pas.

## Couverture des tests

- ✓ Le contrat : 8 tests (`test/v1/config-schema.test.ts`), dont les quatre cas du registre.
- ✓ La lecture : 9 tests, dont un sur l'absence de toute valeur écrite, sur chaque forme d'écart.
- ✓ L'exemple du README : 3 tests.
- ✓ Dans un vrai Pi : 4 tests (`test/v3/config-refused.test.ts`), dont deux sous la copie de TypeBox
  de Pi avec une clé qui contient `/`.
- ✓ Chaque correction a son test de régression, vu rouge seul.

## SOLID et heuristiques

- ✓ `unknownKeys` relève les clés, `take` attribue un écart à une clé, `unknownKey` écrit le texte, et
  `deviations` compose le refus.
- ✓ Le schéma est la seule description du fichier. La lecture, le refus et le contrat publié en
  découlent (spec §8).

## Style

- ✓ Les fonctions ajoutées font de 3 à 18 lignes. `loadConfig` en fait davantage, comme sur `main`,
  et la branche le raccourcit.
- ⚠ `test/v1/config-schema.test.ts` fait 327 lignes. CONVENTIONS.md ne fixe pas de plafond pour les
  tests, et d'autres fichiers de test dépassent 300 lignes. Le couper changerait la commande de
  vérification des tâches 1, 2 et 5.
- ⚠ Une clé citable de 40 caractères peut ressembler à un préfixe de clé d'API
  (`sk-ant-api03-…`). Elle est citée, comme la spec le veut (6b). C'est une décision du propriétaire,
  pas un défaut.

## Rationalisations repérées

- « Le second défaut ne touche pas Pi aujourd'hui » : c'est vrai sous la copie 1.3.27. Mais le
  résultat dépendait de l'ordre des clés dans le fichier, et Pi changera de copie un jour. Corrigé,
  avec un test qui garde le repli.
- J'ai d'abord cru la commande de la tâche 2 en échec. La cause était ma boucle de mesure : sous
  zsh, `$c` n'est pas découpé, et `node --test` cherchait un seul fichier au nom des deux. Lancée
  telle qu'écrite dans la capsule, elle sort en 0, dix fois sur dix.

## Verdict

PASS après correction. Suite : `request-review`.
