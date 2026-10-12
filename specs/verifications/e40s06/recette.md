# Recette — un contrôle que le propriétaire déclare hors confinement

Story `e40s06`, branche `e40s06`, menée le 12 octobre 2026 sans l'outil du cycle, sur décision du propriétaire : rouge
avant le code tâche par tâche, deux relecteurs indépendants, recette réelle, versement à la main après son accord.

## Arbitrages du propriétaire, avant le code

- L'adoption est le réglage `"unconfined": true` qu'il écrit dans `config.json` ; aucune question dans Pi.
- Seul un contrôle qu'il déclare (`policy.project_controls`) peut le porter ; un contrôle détecté reste confiné.

## Rouge-vert

| Tâche | Rouge (commit du test seul) | Vert |
|-------|-----------------------------|------|
| 1 — gel avec le protocole | `the control the controller's configuration declares unconfined is frozen so…` : `actual: []`, attendu `['sandbox-tests']` | `7aefe0ac` |
| 2 — l'exécuteur et l'évidence | `the declared control writes outside its copy` : `actual: false` | `f2c550fd` |
| 3 — le verdict G5 | `g5.reasons` : `[]`, attendu la raison qui nomme `unit` | `634af4e0` |

Preflight verte à `634af4e0` (1798 tests, 0 échec), puis à `024054d5` (1801 tests, 0 échec) après les tests de la
relecture.

## Relecture

Deux relecteurs indépendants, en parallèle, sur `main...e40s06`, bornés aux quatre scénarios et à la section sécurité
attaquée. Aucun bloquant, aucun contournement, rien à corriger. Trois suggestions, toutes des tests, appliquées en un
tour (`024054d5`) : G5 nomme aussi le contrôle sur FAIL (une mutation de la ligne le fait rougir, vérifié) ; un contrôle
détecté sous le même identifiant qu'un contrôle déclaré hors confinement reste confiné ; `loadConfig` charge la
déclaration. Pas de second tour : aucun constat sur le code.

## Recette réelle

Vrai Pi 1.0.4 en RPC, extension chargée depuis un build de la révision, agent scripté déclaré
(`HARNESS495_SCRIPTED_AGENT=e38s09-agent-ok.json`, aucun modèle appelé), cible greet, `/495 start add shout and whisper
beside greet`. Banc : `~/.495-campagnes/scripts/e40s06-{preparer.sh,configs.mjs,run.sh,lire.mjs}`. Le contrôle déclaré
`sandbox-tests` ajoute une ligne à `~/.495-campagnes/e40s06-dehors/marques.log`, hors de la copie et hors de ce que
Seatbelt laisse écrire, puis applique son propre profil Seatbelt par `sandbox-exec`, comme un test de pi-495 qui démarre
un bac à sable.

| Campagne | Build | Config | Résultat lu au dossier |
|----------|-------|--------|------------------------|
| `e40s06-hors1` | tête `024054d5` | `sandbox-tests` avec `"unconfined": true` | Protocole figé : `sandbox-tests` `unconfined=true`, `unconfined_control_ids=["sandbox-tests"]`. Évidences sur la référence et le candidat : PASS, `sandbox=unconfined`, note « ran outside confinement, by the owner's decision », stdout `NESTED-SANDBOX-OK`. Deux lignes écrites dans `marques.log`, une par copie. `unit`, détecté, reste `sandbox=seatbelt`. G5 PASS, raison « declared control sandbox-tests ran outside confinement, by the owner's decision ». |
| `e40s06-confine1` (témoin négatif) | tête `024054d5` | même contrôle sans `unconfined` | Évidences `sandbox=seatbelt`, `exit_code=1`, stderr « marques.log: Operation not permitted » : aucune ligne écrite, le second profil jamais atteint, aucune note, G5 sans raison. G5 PASS pourtant : l'échec, commun à la référence, est toléré comme constat préexistant (VER-08) — défaut antérieur, inscrit `BUG-2026-10-12T222000`. |
| `e40s06-mainhors1` (témoin négatif) | `main` `da706ebc` | `sandbox-tests` avec `"unconfined": true` | `CONFIGURATION_ERROR` : `main` refuse la clé ; aucun changement ne démarre. Le motif est vide — défaut antérieur, inscrit `BUG-2026-10-12T222500`. |

## Campagnes de référence, à la tête `b18c523f`

La branche touche l'exécuteur et G5. Sous `anthropic/claude-sonnet-5-5`, réflexion `high` :

- `npm run campagne -- npm` (`~/.495/campagnes/npm-20261012T202134`) : « no defect of the harness ». G5 FAIL sur la
  mutation du candidat, au budget de trois tentatives : travail du modèle, non jugé.
- `npm run campagne -- maven` : un premier essai (`maven-20261012T202609`) s'arrête à G3, le plan du modèle écrivant le
  test protégé `UserRegistryTest.java` ; `design` change ce refus en `execution_error` au lieu de renvoyer la conception
  au modèle — défaut antérieur, inscrit `BUG-2026-10-12T224500`. Le second essai est vert, G0 à G5 PASS, « no defect of
  the harness ».

## Ce que la recette n'a pas exercé

- Linux : l'exécuteur choisit le bac à sable par la définition, sans distinguer la plateforme ; aucune campagne sous
  bubblewrap.
- Le G5 d'un relevé de l'existant (hors périmètre de la story).
