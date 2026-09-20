# 495 — harness de développement pour Pi

495 conduit un changement logiciel depuis Pi, par gates et preuves : demande → mandat (G0) →
exigences (G1) → protocole de vérification gelé (G2) → conception (G3) → candidat produit dans un
workspace isolé (G4) → contrôles exécutés sans modèle (G5) → intégration locale (G6). Un agent
propose ; le noyau décide à partir des contrôles exécutés ; l'humain tranche par des dialogues Pi.

Le produit est un **pi-package**. Il n'expose ni CLI propre, ni service, ni job CI.

## Installation

Pré-requis : Pi 0.85.1 exécuté par Node ≥ 24 (`node:sqlite`), Git, **macOS arm64** — la seule
plateforme revendiquée, son confinement reposant sur Seatbelt. Linux n'est pas revendiqué : le
backend `bubblewrap` est écrit, aucune campagne ne le qualifie, et 495 y refuse toute intervention
productrice avec `capability_missing` plutôt que de s'exécuter sans la frontière qu'il annonce.

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
canonique dans `details.view`), print (texte ; Pi route les écritures d'extension vers stderr). Un
hôte qui embarque Pi par le SDK charge le package par son `ResourceLoader` et lie le mode qu'il
veut ; les quatre canaux structurés rendent les mêmes faits et les mêmes verdicts.

## Données et configuration

Stockage hors du projet : `$HARNESS495_DATA_DIR`, sinon `~/.495` sur toutes les plateformes. Pi
n'expose aucun emplacement pour l'état propre d'une extension — `~/.pi/agent/` est sa configuration,
qu'il sauvegarde et migre — et un chemin sans espace évite de déplacer les workspaces, que certains
outils de build refusent de lancer depuis un chemin espacé. Les workspaces vivent donc dans
`~/.495/workspaces`, sauf `$HARNESS495_WORKSPACES_DIR`. Les anciens emplacements par défaut restent
résolus en lecture lors d'une reprise ; plus rien n'y est écrit.
`config.json` accepte `policy`
(budgets, `g5_human_acceptance`, `integration_enabled`, `required_reviews`), `isolation.allow_unconfined`,
`human_origin.rpc_actor_env`, `workspace_exclusions`, `language`.

`policy.budgets` se règle selon le modèle : `intervention_ms` borne une session d'agent et
`max_continuations` dit combien de fois un producteur interrompu par cette borne reprend sur son
propre workspace, sans consommer de tentative ni perdre ce qu'il a écrit ; `increment_ms` borne
l'ensemble du changement. Un modèle local lent demande une durée plus large ou davantage de
continuations. `workspace_exclusions` ne retire que des **sorties** de build, régénérables (`target/`, `build/`,
`dist/`…). Un arbre de dépendances est une **entrée** : `node_modules/`, `.m2/`, `vendor/` ne sont
jamais exclus par défaut, car les retirer change ce que le build résout — `.mvn/maven.config` peut
même épingler le dépôt Maven dans l'arbre.

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

Toute la documentation est sous `specs/`, dont `specs/README.md` est l'index. Le corpus rédigé
avant la bascule est archivé sous `specs/archive/`, dans sa disposition d'origine : les documents
amont et normatifs dans `specs/archive/amont/`, le suivi de l'implémentation à la racine de
`specs/archive/`, et les travaux ouverts dans `specs/archive/chantiers/`.
