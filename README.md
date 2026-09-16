# 495 — harness de développement pour Pi

495 conduit un changement logiciel depuis Pi, par gates et preuves : demande → mandat (G0) →
exigences (G1) → protocole de vérification gelé (G2) → conception (G3) → candidat produit dans un
workspace isolé (G4) → contrôles exécutés sans modèle (G5) → intégration locale (G6). Un agent
propose ; le noyau décide à partir des contrôles exécutés ; l'humain tranche par des dialogues Pi.

Le produit est un **pi-package**. Il n'expose ni CLI propre, ni service, ni job CI.

## Installation

Pré-requis : Pi 0.85.1 exécuté par Node ≥ 24 (`node:sqlite`), Git, macOS arm64 (Seatbelt) ; Linux
x86-64 avec `bwrap` est implémenté mais non qualifié.

```bash
npm run build
pi install /chemin/vers/495-pi-package
```

Pour un essai sans installation : `pi -e /chemin/vers/495-pi-package`.

## Utilisation depuis Pi

| Commande | Effet |
| --- | --- |
| `/495 start <demande>` | Capture la référence du projet courant, crée le programme et conduit le changement jusqu'à une décision, un blocage ou la clôture. |
| `/495 status` | Phase, statut, gates, tentatives, preuves, décisions en attente, prochaine action. |
| `/495 resume` | Reprend depuis le dernier point cohérent. |
| `/495 decide` | Présente les décisions en attente (IH-01, IH-07, IH-08, IH-10, IH-11, IH-12) et enregistre la réponse. |
| `/495 review [chemin\|cand_id]` | Revue arbre/lecteur (TUI) ou résumé textuel (autres modes). |
| `/495 verify` | Réexécute les contrôles gelés sur le candidat figé, sans inférence. |
| `/495 integrate` | Demande l'intégration locale après G5 (si la politique l'autorise). |
| `/495 export [--redact]` | Dossier autonome et vérifiable hors ligne dans `<données>/exports/`. |
| `/495 pause`, `/495 cancel`, `/495 bind [id]`, `/495 unbind` | Cycle de vie de la liaison session ↔ changement. |

L'outil conversationnel `harness495` donne au modèle un accès en lecture (`status`,
`list_pending_decisions`, `review_summary`, `export`, `verify`, `start`). Il ne peut ni décider,
ni adopter, ni intégrer.

Modes Pi : TUI (dialogues et vue de revue), RPC (dialogues via le sous-protocole UI ; une décision
humaine exige `HARNESS495_RPC_HUMAN_ACTOR`), JSON (messages `customType: "495"` avec la vue
canonique dans `details.view`), print (texte ; Pi route les écritures d'extension vers stderr).

## Données et configuration

Stockage hors du projet : `$HARNESS495_DATA_DIR`, sinon `~/Library/Application Support/495`
(macOS) ou `${XDG_DATA_HOME:-~/.local/share}/495` (Linux). `config.json` y accepte `policy`
(budgets, `g5_human_acceptance`, `integration_enabled`, `required_reviews`), `isolation.allow_unconfined`,
`human_origin.rpc_actor_env`, `workspace_exclusions`, `language`.

Variables d'environnement : `HARNESS495_INTEGRATION=1`, `HARNESS495_HUMAN_ACCEPTANCE=1`,
`HARNESS495_LANGUAGE=en`, `HARNESS495_ALLOW_UNCONFINED=1` (tests uniquement ; refuse ensuite toute
intervention productrice), `HARNESS495_SCRIPTED_AGENT=<json>` (campagnes sans modèle).

## Développement

```bash
npm run check          # typage strict, tests V0–V3, règle d'imports entre couches
npm run test           # node --test sur les sources TypeScript
npm run contracts      # régénère contracts/v1/*.json
HARNESS495_RUN_JAVA=1 node --test test/v4/java-stack.test.ts   # F-JAVA (JDK + Maven)
node scripts/e2e-local-model.ts                                   # intervention réelle avec le modèle Pi
```

Documents : `docs/PLAN.md`, `docs/STATUS.md`, `docs/TRACEABILITY.md`, `docs/QUALIFICATION.md`,
`DECISIONS.md`. Les documents amont (expression de besoins, spécification fonctionnelle,
conception de la vérification, conception technique) sont à la racine.
