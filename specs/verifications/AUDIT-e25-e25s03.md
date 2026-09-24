# Auto-revue — e25s03, la situation du modèle lue de son adresse

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`fadf8f1..ca712bb`) ; code de production : `src/domain/policy.ts`, `src/ports/execution.ts`, `src/domain/change/{commands,events,state}.ts`, `src/extension/{conduct,session,index}.ts`, et `scripts/e2e-local-model.ts` |
| Conduite le | 2026-09-24 (UTC) |
| Branche | `situation-du-modele-lue-de-son-adresse` |
| Mode | complet |
| Preflight au moment de la revue | vert à `ca712bb` sous Node 24.21.0 — `npm run build && npm run check`, sortie 0, 425 tests |

Les fichiers sont lus par turbulence sur 90 jours, le plus agité d'abord : `harness-fixture.ts` (15
commits, +7/-1), `execution.ts` (14, +3), `policy.ts` (13, +19), `state.ts` (11, +8/-1), `session.ts`
(11, +30/-2), `commands.ts` (10), `index.ts` (10, +1), `events.ts` (7), `model-select.test.ts` (7,
+243/-42), `conduct.ts` (5, +9/-3). Les deux fichiers de test neufs ferment la liste :
`model-location-journal.test.ts` (149 lignes) et `model-location.test.ts` (67).

## Ce que cette revue a corrigé avant son rapport

**Un commentaire se lisait à contresens.** Sur le champ `location` de l'événement et de l'état, le
commentaire disait « Absent from a dossier written before the location was recorded, which is not on
this machine ». La relative peut se rattacher au dossier. Or elle dit ce que vaut l'absence. Le
commentaire dit désormais que ce champ absent n'est jamais lu comme « sur la machine » (`ca712bb`).
Aucun comportement ne change.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée, rien à classer `[OK]`/`[SUS]`/`[SLOP]`.
- ✓ Aucun secret dans le diff. Les tests utilisent `not-a-secret-nothing-listens` et
  `?key=not-a-secret`, deux valeurs choisies pour qu'un test d'absence d'adresse ait quelque chose à
  chercher.
- ✓ OWASP : le changement lit une chaîne et émet un message. Il n'ouvre aucun canal et ne résout aucun
  nom. L'adresse n'est pas exposée : établi par `security-review` (`specs/security/REVIEW.md`,
  section e25s03) et confirmé sur les dossiers réels de la recette, où `nip.io`, `:8000` et la clé
  sont absents.
- ✓ Aucun constat HIGH non traité, et aucune exception à `specs/security/EXCEPTIONS.md`.

## Provenance

- ✓ La capsule porte `type: feat` et `context: domain`. Chaque tâche cite ses commits rouge et vert
  dans `specs/state.yaml`.

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers. `ctx.sessionManager.getSessionId()` et
  `ctx.model.baseUrl` lisent l'API que Pi remet à l'extension, sans la traverser plus loin.

## Conformité à CONVENTIONS.md

- ✓ Les relevés vont dans `specs/`. Aucun `gh issue create`, aucun appel direct à l'API GitHub.
- ✓ La couche est respectée : le type et la règle vivent dans `domain/`, et seul `extension/`
  lit Pi (`lint:layers` vert).

## Périmètre

- ✓ Les fichiers de production touchés sont ceux que la spec prévoit au §20. `scripts/e2e-local-model.ts`
  s'y ajoute : il construit un mandat, et le type le contraint à porter la situation.
- ✓ Aucune fonction spéculative. `selectedModel` est exporté pour que `model-location-journal.test.ts`
  l'exerce sur un contexte sans adresse (`lint:exports` le voit lu).
- ✓ Aucun échec de porte laissé de côté. Un défaut trouvé en sondant, le double démarrage de session du
  mode RPC, est corrigé dans la branche avec son test rouge (`9536fc8`, `db1173c`).

## Règle du scout

- ✓ Aucun code mort, aucun bloc commenté. Biome ne signale rien sur 177 fichiers.
- ⚠ **Laissé tel quel, et pourquoi.** La forme du modèle (`provider_id`, `model_id`,
  `thinking_level`, et maintenant `location`) est écrite en ligne à trois endroits du domaine, en plus
  de `ModelSelection` dans les ports. C'est un *Data Clump* antérieur à la branche : la branche y
  ajoute un champ, elle ne le crée pas. Le regrouper ne corrige aucun désaccord observable. Le
  compilateur a déjà refusé chaque endroit où le champ manquait, donc la duplication n'a rien laissé
  passer ici.

## Types et sûreté

- ✓ Aucun `any`, `@ts-ignore` ou `eslint-disable` dans le code de production.
- ✓ Les `as unknown as` n'apparaissent que dans les tests, pour tenir un faux Pi, comme
  `session-start-twice.test.ts` et la version de `model-select.test.ts` sur `main`.

## Couverture des tests

- ✓ `locateModel` : 19 tests (`test/v1/model-location.test.ts`), pour le bouclage, les imitations,
  l'absence, le vide et l'illisible.
- ✓ L'inscription et l'export : 5 tests (`test/v2/model-location-journal.test.ts`), dont une adresse
  sentinelle cherchée dans tout le journal et tout le magasin.
- ✓ L'annonce : 4 tests dans `test/v3/model-select.test.ts`, dont trois dans un vrai `pi --mode rpc`.
- ✓ Le correctif du double démarrage a son test de régression, vu rouge seul.
- ⚠ Deux cas de la spec ne sont couverts par aucun test : 6h (aucun modèle à l'ouverture) et 6k (le
  même modèle choisi à nouveau). Ce sont des chemins où rien n'est annoncé. La garde
  `if (!model …) return` tient 6h, et 6k est une propriété de Pi, qui n'émet pas `model_select`.
  Ils sont déclarés dans `e25s03-verify.yaml` (`known_limits`).

## SOLID et heuristiques

- ✓ `locateModel` est une fonction pure du domaine, à une seule responsabilité.
- ✓ `ExtensionSession.modelSelected` réutilise la file des diagnostics d'ouverture au lieu d'ouvrir
  un second canal (spec §8).
- ⚠ **Dépendance d'ordre, sûre aujourd'hui.** `openRuntimeAt` remplace la file (`this.pending = …`)
  au lieu d'y ajouter. L'annonce de l'ouverture n'est pas perdue, parce que `openedAt` appelle
  `openRuntimeAt` avant `modelSelected`. Un `model_select` reçu avant `session_start` serait effacé.
  Pi 0.87.1 n'en émet pas : `setModel` et le cycle suivent l'ouverture. Aucun comportement observable
  ne le contredit, donc rien n'est changé.
  *Contredit par la relecture, et corrigé.* Une extension chargée avant 495 qui choisit un modèle
  dans son propre `session_start` émet `model_select` avant l'ouverture de 495 (`preset.ts` des
  exemples de Pi). L'annonce était alors dite deux fois à l'écran. Depuis `0bf0707`, un choix reçu
  avant l'ouverture n'est pas dit, et l'ouverture lit le modèle de `ctx.model`. La file ne dépend
  plus de l'ordre des événements.

## Style

- ✓ Les fonctions touchées font de 3 à 12 lignes, à un seul niveau d'abstraction.
- ⚠ `test/v3/model-select.test.ts` fait 524 lignes, pour 323 sur `main`. CONVENTIONS.md ne fixe pas
  de plafond pour les tests, et 16 fichiers de test dépassent 300 lignes. Le couper changerait la
  commande de vérification de la tâche 3.
- ✓ Les noms sont spécifiques : `locateModel` et `ModelLocation` n'ont pas d'homonyme.

## Rationalisations repérées

- « Le *Data Clump* est antérieur » : c'est vrai, mais la branche l'a alourdi. Je l'ai laissé parce
  qu'aucun défaut n'en découle ici, pas parce qu'il est ancien.
- « Un commentaire, ce n'est pas du code » : j'ai failli le laisser. Or il documente une règle de
  lecture (6j), et un lecteur qui le prend à contresens écrit un défaut.

## Verdict

PASS. Suite : `request-review`.

## Révision relue

La relecture passe à `c17215f`. Preflight y est verte sous Node 24.21.0, avec 426 tests, le
2026-09-24 à 10:30 UTC. `test/v3/model-select.test.ts` porte désormais 5 tests de l'annonce, dont
celui du flux 6l.
