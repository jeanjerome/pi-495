# Rayon d'impact — e23s01, la sortie de données vers le fournisseur est déclarée

Établi avant l'écriture du plan, sur l'arbre au commit `124f149`, Preflight vert.

## Cible

Trois symboles existants, aucun composant neuf.

| Symbole | Fichier | Nature du changement |
| --- | --- | --- |
| `ActivePolicy` | `src/domain/policy.ts:22` | un champ de plus : la liste des destinations vers lesquelles des extraits et des invites ont le droit de partir |
| `loadConfig` | `src/extension/config.ts:24` | fusionne le champ comme il fusionne déjà `budgets` et `adoption`, sans quoi une configuration partielle vide la liste en silence |
| `InterventionSupervisor.requireCapable` | `src/application/intervention.ts:78` | refuse une destination non déclarée, là où la méthode refuse déjà un bac à sable non qualifié et un modèle indisponible |

Aucun identifiant `CMP-*` nouveau : la déclaration appartient au noyau de domaine (`CMP-DOM`) et le
refus au superviseur d'intervention (`CMP-INT`), tous deux déjà au catalogue.

## Dépendants

`ActivePolicy` est lu en onze points, tous en lecture seule d'un champ existant. Un champ ajouté ne
les touche pas ; ils sont listés parce que c'est ce qui rend l'ajout sûr, pas parce qu'il faut les
modifier.

- `src/extension/config.ts:10,35` — construit la politique depuis `config.json`. **Seul point à modifier.**
- `src/application/intervention.ts:29` — porte `deps.policy` ; y lit les budgets. **Point du refus.**
- `src/application/harness.ts:75`, `src/application/verification.ts:55`, `src/application/phases/phase.ts:45` — transportent la politique.
- `src/domain/gates/g2.ts:18`, `src/domain/gates/g5.ts:21`, `src/domain/change/decide.ts:34,80` — lisent `baseline`, `adoption`, `budgets`, `integration_enabled`.

`requireCapable` : appelé depuis les phases qui ouvrent une intervention. Le refus hérite du chemin
d'erreur existant — `DomainError`, code `POLICY_DENIED`, catégorie `policy` (`src/domain/errors.ts:14,42`),
traduit en motif d'arrêt `policy_denied` par `src/application/harness.ts:422`. Rien de neuf à câbler.

## Stories touchées

- `e23s01` — celle-ci.
- `e23s03` — « le refus d'un profil incapable a un effet avant une intervention facturée » édite la
  **même méthode**. Les deux refus se posent au même endroit et dans le même ordre : la destination
  d'abord, la capacité ensuite. À planifier en connaissance de celui-ci.
- `e23s04` — la campagne à deux fournisseurs ajoute une destination à la liste déclarée ici. C'est
  l'ordre voulu par la capsule : déclarer avant d'ouvrir.

## Couverture de test

| Fichier | Ce qu'il couvre aujourd'hui | Effet attendu |
| --- | --- | --- |
| `test/v2/telemetry.test.ts:143` | affirme que **tout** profil refuse le réseau | doit continuer à passer inchangé — c'est le contrôle qui prouve que la déclaration n'est pas logée dans le profil de bac à sable |
| `test/v1/sandbox.test.ts` | confinement réseau `denied` / `loopback` / `allowed` | inchangé ; la déclaration n'est pas du confinement |
| `test/v1/agent-port.test.ts:77` | protocole du superviseur, fabrique un mandat | voisin le plus proche du refus |
| `test/v2/export-integration.test.ts:35,80` | sentinelle `sk-…`, expurgation, signalement | s'étend à la moitié export de la recette |
| `test/v2/harness.test.ts` | parcours complets ouvrant des interventions | **exposé** : une liste par défaut vide refuserait tout et rendrait la suite rouge |
| `test/v1/egress.test.ts` | n'existe pas | à écrire |

**Lacune :** rien aujourd'hui n'observe le canal modèle. L'exemption de confinement du worker tient
à une omission — `src/adapters/pi-worker/supervisor.ts:63` démarre le processus sans passer par
`SandboxPort` — et aucun test ne dit que cette omission est voulue.

## Risque : moyen

Peu d'appelants et un chemin d'erreur déjà en place, mais le choix de la liste par défaut décide si
la suite entière reste verte : une liste vide refuse toute intervention, une liste trop large rend
la déclaration sans effet. C'est la seule décision réellement ouverte du plan.
