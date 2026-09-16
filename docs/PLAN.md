# Plan d'implémentation P0 — 495

Ce plan suit l'ordre recommandé par la conception technique (§18). Chaque incrément est
livré avec ses tests, sa matrice de traçabilité (`docs/TRACEABILITY.md`) et son statut
(`docs/STATUS.md`). Les décisions prises seul pendant l'implémentation sont dans `DECISIONS.md`.

## Organisation

| Répertoire | Contenu |
| --- | --- |
| `src/domain/` | Noyau pur : états, transitions, gates, invalidation, budgets, programme (DAG). Aucune I/O. |
| `src/contracts/` | Schémas TypeBox v1, validation runtime, sérialisation canonique, empreintes. |
| `src/ports/` | Interfaces hexagonales. |
| `src/application/` | Contrôleur applicatif : cas d'usage, unités de travail, idempotence. |
| `src/adapters/` | SQLite + CAS, workspace, git, exécution de contrôles, sandbox, Pi worker, adaptateurs cibles. |
| `src/presentation/` | Vues canoniques → TUI (`pi-tui`) et sorties structurées (RPC/JSON/print). |
| `src/extension/` | Factory Pi : commandes `/495 …`, outil `harness495`, événements de session. |
| `src/export/` | Dossier autonome. |
| `contracts/v1/` | JSON Schema 2020-12 générés. |
| `test/v0…v3/` | Niveaux de validation V0 (pur), V1 (ports/adaptateurs), V2 (intégration stockage/git/exécution), V3 (parcours Pi). |
| `test/fixtures/` | Corpus F-* (générés à la volée dans des répertoires temporaires). |
| `docs/` | Plan, statut, traçabilité, qualification, guide d'utilisation. |

## Incréments

| Incrément | Contenu | Sortie attendue |
| --- | --- | --- |
| IT-0 | Contrats v1, noyau (FSM, gates, invalidation, budgets, DAG), stockage SQLite/CAS, chaîne d'événements, pannes injectées | V0 complet, V2 stockage |
| IT-1 | Package Pi, commandes `/495 start status resume verify export decide review integrate`, outil `harness495`, liaison de session, modes TUI/RPC/JSON/print | Même état et même verdict dans les entrées Pi |
| IT-2 | Superviseur d'intervention (Pi SDK dans un processus enfant), agent simulé scriptable, sandbox fail-closed, workspace isolé, capture de référence (5 cas), manifeste de candidat | Frontière d'exécution et préservation Git |
| IT-3 | Runner générique de contrôles, parsers, preuves canoniques, qualification (+/−/incident), G2→G5 sans modèle, feedback borné, tentatives, décisions humaines avec provenance | Changement accepté / refusé / indéterminé avec dossier |
| IT-4 | Modèle de revue (union des arbres, ANCIEN/NOUVEAU, pages), composant TUI deux panneaux + mode étroit, intégration Git G6, destination avancée, réconciliation | Parcours complet |
| IT-5 | Programme : DAG, jalons, phase `preparing`, dépôt vide/sans HEAD, adaptateur TS et Java par le runner générique, export expurgé | Capacité P0 dans la limite déclarée dans STATUS |

## Ce qui est hors de portée de cette machine

- Linux x86-64 : non exécutable ici ; le backend `bwrap` est implémenté mais non qualifié (annoncé `capability_missing`).
- Revue UX/accessibilité et revue sécurité humaines : les contrôles automatiques sont livrés, les revues obligatoires restent à réaliser par une personne.
