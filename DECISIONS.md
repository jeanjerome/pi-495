# Décisions prises seul pendant l'implémentation de P0

Chaque entrée indique la décision, le motif et la conséquence. Les ADR amont (ADR-001 à ADR-018 de
la conception technique) sont considérées acceptées telles quelles ; ce fichier ne consigne que ce
qui a été tranché en plus, ou précisé, pendant la réalisation.

## D-01 — Node 24 et `node:sqlite` comme moteur de stockage

**Décision.** Le journal SQLite utilise le module intégré `node:sqlite` (`DatabaseSync`) au lieu
d'un binding natif tiers (`better-sqlite3`, `sqlite3`).
**Motif.** Pi 0.85.1 est exécuté par Node (shebang `#!/usr/bin/env node`, Node 24.21 sur la machine
de référence). Un binding natif imposerait une compilation à l'installation du package et une
matrice binaire par plateforme ; `node:sqlite` est livré avec le runtime déjà qualifié avec Pi.
**Conséquence.** `engines.node >= 24`. Une distribution Pi exécutée par Bun (binaire compilé) n'est
pas un profil qualifié ; le package le détecte au chargement et annonce `capability_missing`.

## D-02 — Tests avec `node:test` et exécution directe des `.ts`

**Décision.** Les tests utilisent le runner intégré `node --test` et s'exécutent directement sur les
sources TypeScript (type stripping natif de Node 24). `tsc` sert au typage strict et à la
construction de `dist/`. `fast-check` est utilisé pour les tests de propriétés.
**Motif.** Aucune dépendance de test à qualifier ni à distribuer ; la contrainte
`erasableSyntaxOnly` interdit `enum`, `namespace` et les propriétés de paramètres, ce qui garde
le code compatible avec jiti (chargeur de Pi) et avec le type stripping.
**Conséquence.** Les imports relatifs portent l'extension `.ts` ; `rewriteRelativeImportExtensions`
produit des `.js` dans `dist/`.

## D-03 — Répertoire de données

**Décision.** Le stockage normatif vit dans `$HARNESS495_DATA_DIR` si défini, sinon
`~/Library/Application Support/495` sur macOS et `${XDG_DATA_HOME:-~/.local/share}/495` sur Linux.
**Motif.** La conception exige un stockage hors du projet cible et résolu par un adaptateur de
plateforme ; la variable d'environnement permet les tests et les installations partagées.
**Conséquence.** Le chemin n'est jamais transmis aux workers (AT-04).

## D-04 — Backends d'isolation

**Décision.** Deux backends sont implémentés derrière `SandboxPort` : `seatbelt` (macOS,
`/usr/bin/sandbox-exec` avec un profil généré par mandat) et `bubblewrap` (Linux, `bwrap`).
Un troisième backend `unconfined` existe uniquement pour les tests V0–V2 et doit être demandé
explicitement par la politique (`isolation.allow_unconfined = true`) ; il déclare
`SEC-02`/`SEC-03` comme non satisfaites et est refusé pour tout mandat `implement`, `verify` ou
`integrate` dans un profil de production.
**Motif.** ADR-013 impose le fail closed ; `sandbox-exec` est le seul mécanisme disponible sans
installation supplémentaire sur macOS arm64, et bubblewrap est le choix courant sur Linux.
**Conséquence.** `qualify()` retourne les capacités effectivement applicables ; Linux n'a pas pu
être exécuté sur la machine de référence et reste annoncé non qualifié.

## D-05 — Worker Pi = processus enfant Node exécutant le SDK Pi

**Décision.** Une intervention lance `node <worker-main>` avec un protocole JSONL sur stdio
(ADR-007). Le worker importe `@earendil-works/pi-coding-agent` depuis le répertoire d'installation
de Pi qui héberge l'extension (résolu par `getPackageDir()` côté extension et transmis dans le
mandat), crée une session `createAgentSession` avec `ResourceLoader` explicite vide, outils
explicites, `SessionManager.inMemory`, et le modèle exact du mandat.
**Motif.** ADR-008 ; aucune découverte ambiante ; l'identité de version de Pi est celle qui charge
l'extension.
**Conséquence.** Le repli `pi --mode rpc` n'est pas implémenté en P0.

## D-06 — Diff textuel maison

**Décision.** Le modèle de comparaison implémente un diff de lignes (Myers) et une mise en
évidence intraligne par préfixe/suffixe commun, sans dépendance à `diff`.
**Motif.** Garder le domaine de revue sans dépendance de production et contrôler exactement les
segments `unchanged/old/new/intraline` exigés par la spécification.
**Conséquence.** Les renommages sont détectés par égalité de digest (certitude) ou similarité de
lignes ≥ 0,8 (hypothèse annoncée `renamed?`), jamais présentés comme certains sous le seuil.

## D-07 — Parsers de rapports P0

**Décision.** Le runner générique livre trois interpréteurs qualifiés : `exit-code` (contrat
0 → PASS, autre → FAIL, timeout/spawn error → INDETERMINATE), `node-test-json` (sortie
`--test-reporter=spec`/`tap` de `node:test` réduite au comptage), `junit-xml` (rapports Surefire /
JUnit). Tout autre format est refusé (`capability_missing`).
**Motif.** Couvrir F-TS (`node --test`) et F-JAVA (Maven Surefire) avec un contrat commun.

## D-08 — Provenance humaine

**Décision.** En TUI, une réponse via `ctx.ui.select/confirm` dans un dialogue 495 constitue
l'origine `tui_session`. En RPC, une réponse n'est acceptée que si le client s'est déclaré
qualifié via une entrée de configuration explicite (`human_origin.rpc_clients`) ; sinon la
décision reste `decision_required`. JSON et print ne produisent jamais de décision.
**Motif.** ADR-014, SA-005, SA-030.

## D-09 — Portée de l'outil conversationnel `harness495`

**Décision.** L'outil accepte les opérations `status`, `start`, `verify`, `review_summary`,
`export`, `list_pending_decisions`. Il n'accepte aucune opération `decide`, `integrate` ni
`adopt` : ces opérations n'existent que comme commandes Pi (`/495 …`).
**Motif.** ADR-009 ; un appel d'outil est une demande non fiable.

## D-10 — Licence

**Décision.** Apache-2.0 (option proposée dans ADR-08 amont), fichiers LICENSE et NOTICE fournis.
