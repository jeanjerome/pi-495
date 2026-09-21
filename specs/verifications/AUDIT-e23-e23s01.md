# Audit de code — e23s01, sortie de données déclarée

| | |
|---|---|
| Mode | `--gate` |
| Conduit le | 2026-09-21 |
| Branche | `sortie-vers-le-fournisseur-declaree` |
| Périmètre | `git diff $(git merge-base main HEAD)..HEAD` |
| Verdict | **PASS** — quatre constats trouvés, quatre corrigés, Preflight vert après correction |

## Ordre de revue (churn)

| Fichier | Commits 90 j | Lignes |
| --- | --- | --- |
| `test/helpers/harness-fixture.ts` | 8 | 153 |
| `test/v1/egress.test.ts` | 6 | 274 |
| `src/domain/policy.ts` | 5 | 86 |
| `test/v2/export-integration.test.ts` | 5 | 269 |
| `src/application/intervention.ts` | 4 | 203 |
| `test/helpers/fake-worker.ts` | 4 | 89 |

## Constats, et ce qui a été fait

### ✗ → ✓ 1. Contournement du typage

`test/v1/egress.test.ts` portait `{ backend: "test" } as unknown as SandboxPort` — exactement le
motif que la liste interdit. Remplacé par un vrai `SandboxPort` dont les deux méthodes lèvent. Ce
n'est pas un stub inerte : si le refus se déplaçait après la qualification du bac à sable, ces
tests échoueraient bruyamment au lieu d'exercer un bouchon silencieux.

### ✗ → ✓ 2. Fichier poussé au-delà de 300 lignes

`test/v2/export-integration.test.ts` est passé de 287 à 338 lignes par mon ajout. Six montages de
harnais y étaient répétés à l'identique ; extraits dans `writingHarness(content, policy?)`. Le
fichier retombe à **269 lignes**, et la duplication disparaît avec la longueur.

### ✗ → ✓ 3. Duplication (Fowler : Duplicated Code)

`collect()` était identique à l'octet près entre `test/v1/agent-port.test.ts` et
`test/v1/egress.test.ts` — j'avais recopié l'existant. Extrait dans
`test/helpers/intervention-fixture.ts`, importé par les deux. Ni `fixtures.ts` (système de
fichiers) ni `change-fixture.ts` (domaine) ne couvrait un flux d'événements d'intervention.

### ✗ → ✓ 4. Fonction trop longue

`requireCapable` était passée à 26 lignes, au-delà de la borne de 20, et descendait deux niveaux
d'abstraction. Le refus de destination est extrait dans `refuseUndeclaredDestination()` : 13 lignes
pour l'une, 16 pour l'autre, chacune à un seul niveau.

## Liste, section par section

| Section | Verdict | Note |
| --- | --- | --- |
| Supply Chain & Security | **PASS** | Aucune dépendance ajoutée — rien à étiqueter. Aucun constat HIGH ≥ 8 (`specs/security/REVIEW.md`). |
| Provenance & Metadata | **PASS** | `type: feat`, `context: domain`, `risk: P0` au fichier de tâches ; §20 de la story cite D-11, D-46, D-49, D-52. |
| Law of Demeter | **PASS** | Les deux accès ajoutés — `this.deps.policy.egress`, `this.deps.model.provider_id` — sont plus courts que les voisins préexistants de la même classe. `deps` est un enregistrement de dépendances injectées, pas une chaîne d'objets étrangers. |
| CONVENTIONS.md | **PASS** | Aucun fichier hors `specs/`, `src/`, `test/`. Aucun `gh issue create`, aucun appel direct à l'API REST GitHub. |
| Scope | **PASS** | Deux fichiers de production, 40 lignes. Les refactorisations ci-dessus portent sur des fichiers ouverts pour cette story, sous règle du scout. |
| Boy Scout | **PASS** | Trois fichiers repartent plus propres qu'ils n'étaient : duplication retirée, fichier sous la borne, cast supprimé. |
| Types & Safety | **PASS** (après correction) | Plus aucun `as unknown as`, `@ts-ignore` ni `any`. |
| Test Coverage | **PASS** | `refuseUndeclaredDestination` est privée et éprouvée par trois tests à travers `requireCapable`, interface publique. F.I.R.S.T tenu ; le test à sous-processus restaure `process.env` en `finally`. |
| SOLID & heuristiques | **PASS** | Responsabilité unique rétablie par l'extraction. Règle du pas-de-côté respectée. Conditionnel exprimé au positif avec retour anticipé ; imbrication logique maximale : 1. |
| Style | **PASS** | Fonctions 13 et 16 lignes ; fichiers 86, 203, 269, 274 lignes ; noms à moins de 5 occurrences ; commentaires disant le pourquoi. |

## Sentinelles ressemblant à des secrets — signalées, non masquées

Trois chaînes en `sk-` apparaissent au diff. Aucune n'est un identifiant :

- `sk-controller-secret-do-not-leak` (`test/v1/egress.test.ts`, deux occurrences) — sentinelle que
  j'ai introduite, dont l'objet même est de prouver qu'elle **ne** fuit pas.
- `sk-abcdefghijklmnop1234` (`test/v2/export-integration.test.ts`) — sentinelle préexistante du
  montage, citée par mon assertion.

Un garde-fou de motif les signalerait. Elles sont nommées ici plutôt que laissées passer en
silence : c'est la recette de SEC-05 qui les exige.

## Rationalisation surprise en cours de route

J'ai d'abord pensé « la duplication de `collect()` fait cinq lignes, ça ne vaut pas un fichier ».
C'est la rationalisation exacte que la liste nomme. Le fichier fait huit lignes, il porte un nom
qui dit sa responsabilité, et deux tests le lisent — ce n'est pas de l'abstraction préventive,
c'est la suppression d'une duplication présente.

## Preuve

```
$ npm run build && npm run check
AUDIT_PREFLIGHT_EXIT=0
$ node --test test/v1/egress.test.ts test/v1/agent-port.test.ts
ℹ pass 17   ℹ fail 0
$ node --test test/v2/export-integration.test.ts
ℹ pass 7    ℹ fail 0
```
