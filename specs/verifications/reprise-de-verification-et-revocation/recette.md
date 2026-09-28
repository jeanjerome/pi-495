# Recette — reprise d'une vérification coupée, et révocation

Branche `reprise-de-verification-et-revocation`, tête `0d7cd92`, versée sur `main` le 2026-09-28
après l'accord du propriétaire. Cycle de correction de quatre défauts (`BUG-2026-09-28T081300`,
`T013000`, `T025000`, `T025100`), qui en a corrigé cinq autres en chemin (`T130000` à `T130300`,
`T143500`). Conduit à la main sous les règles de `cycle/README.md`, la branche ayant été ouverte
sous le processus précédent ; ce que sa sixième relecture laissait est au registre
(`BUG-2026-09-28T163300` à `T163500`).

## Ce qui a tourné

Un vrai Pi (`pi -ne --mode rpc --no-session -e <extension>`), l'extension chargée depuis `dist/`
d'une construction par `git archive` : `~/.495-campagnes/builds/reprise-0d7cd92` pour la tête, et
`reprise-a42167a`, le `main` d'avant les correctifs, pour les contrôles négatifs. Chaque campagne
relève par `get_commands` quelle construction fournit `/495`. Les interventions sont simulées par
l'agent scripté `scripts/reprise-lent.json` (`HARNESS495_SCRIPTED_AGENT`), dont le candidat met
trente secondes à charger pour que ses contrôles puissent être coupés ; aucun modèle n'est appelé.
Pilote : `scripts/reprise-run.sh` et `scripts/reprise-drive.ts`, acceptation humaine activée.
Dossiers relus depuis SQLite (`e01s04-etat.mjs`, table `operations`) et le journal du pilote.

| Campagne | Tête `0d7cd92` | Avant `a42167a` |
|---|---|---|
| A. Pi tué pendant les contrôles du candidat, puis `/495 resume` (`reprise-a1-coupe-*`, `reprise-a2-reprise-*`) | une nouvelle vérification s'ouvre sur le même candidat gelé (clé `…:58` après `…:55`), `unit` et `lint` PASS, G5 demande IH-10 ; la vérification coupée est `cancelled`, la nouvelle `succeeded` | `blocked execution_error — OPERATION_ACTIVE … already holds the idempotency key …:0`, aucune issue nommée ; la vérification coupée est `succeeded` |
| B. `/495 pause` pendant les contrôles, puis `/495 revoke q1` (`reprise-b-pause-revoque-*`) | révocation acceptée : q1 reposée (IH-01 en attente), réponse et adoption du mandat révoquées, changement `clarifying/paused` ; la vérification fermée par la pause est `cancelled` | `OPERATION_ACTIVE: verification operation … is in progress`, `next_actions: []`, alors que rien ne tourne ; la vérification reste `running` |
| C. `/495 revoke q1` avec une confirmation retardée de 4 s, et `/495 verify` tapé pendant l'attente (`reprise-c-revoque-verify-*`) | « une opération est déjà en cours dans cette session » pour le `verify`, puis la révocation aboutit | le `verify` passe dans l'interstice (`PRECONDITION_FAILED: change is paused`), puis la révocation est refusée |

## Ce qui n'est tenu que par des tests

Non exercé dans Pi : la révocation après un repli d'intégration (`T025000`,
`test/v0/change-rules.test.ts`), la note « suite préparée » retirée des qualifications (`T025100`,
`test/v2/preparation.test.ts` ; aucune préparation ne court dans ces campagnes, et aucun des deux
protocoles ne porte de note), l'écrasement d'une révocation par le blocage d'une seconde session
(`T130000`, `test/v0/change-rules.test.ts`), et les refus qui ne nomment plus que des sous-commandes
`/495` (`T130100`, `T143500`, `test/v2/harness.test.ts`, `test/v3/model-select.test.ts`) : la tête
n'a produit aucun blocage dans ces campagnes ; l'ancienne construction, bloquée, ne nomme rien.

## Preflight

Verte à la tête de branche `37626c6` sous Node 24 (598 tests) ; `0d7cd92` ne touche que `specs/`.
Relancée sur l'arbre versé, avec les tests du cycle, le 2026-09-28 sous Node 24.21.0 : 623 tests, sortie 0.

## Accord

Recette présentée au propriétaire le 2026-09-28, acceptée le même jour : « J'accepte la recette,
verse la branche. »
