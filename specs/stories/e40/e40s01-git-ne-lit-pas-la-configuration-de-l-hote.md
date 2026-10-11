# git, dans un contrôle, ne lit ni la configuration globale ni la configuration système de l'hôte

Story : e40s01
Epic : e40
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui fait juger une cible obtient le même verdict quelle que soit sa configuration git personnelle.
Aujourd'hui, un contrôle reçoit le `HOME` de l'hôte, et git y lit `~/.gitconfig` et la configuration système. Le 11
octobre, des tests de pi-495 qui commitent dans un dépôt de test ont échoué sous le contrôle : la configuration
globale du propriétaire signe chaque commit avec une clé de `~/.ssh`, que le profil interdit à juste titre de lire.
Le verdict dépendait d'un réglage du poste, pas du code du candidat (`BUG-2026-10-11T013000`, partie git).

Un contrôle lance git sans configuration globale ni système, quel que soit le réglage de l'hôte (`D-90`).

## 2. Promesses

Scenario: Un commit fait par un contrôle ne dépend pas de la signature que l'hôte configure
  Given un hôte dont la configuration git globale signe les commits avec une clé que le contrôle ne peut pas lire
  When un contrôle commite dans un dépôt de sa copie en donnant lui-même son identité
  Then le commit est fait sans signature, et l'évidence du contrôle est PASS

Scenario: Un contrôle ne voit aucun réglage git global ni système
  Given un hôte qui porte des réglages git globaux et système
  When un contrôle liste la configuration git qu'il voit, avec sa portée
  Then aucun réglage n'a la portée globale ni la portée système

Scenario: Une variable du contrôle ne rend pas à git la configuration de l'hôte
  Given un contrôle dont l'environnement déclaré ou la liste blanche pose `GIT_CONFIG_GLOBAL` sur la configuration globale de l'hôte
  When le contrôle liste la configuration git qu'il voit, avec sa portée
  Then aucun réglage n'a la portée globale ni la portée système

Scenario: Une variable de configuration git du contrôle ne fait pas relire à git la configuration de l'hôte
  Given un contrôle dont l'environnement déclaré ou la liste blanche pose `GIT_CONFIG` sur la configuration globale de l'hôte, ou un `include.path` vers elle par `GIT_CONFIG_PARAMETERS` ou `GIT_CONFIG_COUNT`
  When le contrôle liste la configuration git qu'il voit, avec son origine
  Then aucun réglage ne vient du fichier de configuration globale de l'hôte

## 3. Sécurité

Le confinement ne change pas : la clé de `~/.ssh` reste illisible, et c'est git qui ne la demande plus. Ce qu'un
contrôle reçoit de l'hôte se réduit : plus aucun réglage git global ni système, donc ni signature, ni identité, ni
`credential.helper`, ni `core.hooksPath`, ni `core.sshCommand` venus du poste. Aucune variable du contrôle, déclarée
par la technologie ou le propriétaire, ou laissée passer par sa liste blanche, ne rétablit cette lecture : l'isolement
s'applique après elles, et les variables par lesquelles git prend de la configuration (`GIT_CONFIG`,
`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT` et ses `GIT_CONFIG_KEY_n` et `GIT_CONFIG_VALUE_n`) ne parviennent plus à un
contrôle, puisqu'un `include.path` y désigne n'importe quel fichier ; `GIT_TEMPLATE_DIR` non plus, puisque `git init`
copie le fichier `config` du dossier qu'il désigne dans le dépôt créé. Le réglage local du dépôt de la copie reste lu,
comme aujourd'hui.

## 4. Tâches

### Tâche 1 — Un contrôle commite sans la signature de l'hôte

Poser, dans l'environnement que `GenericControlRunner.profileFor` (`src/adapters/execution/runner.ts`) donne à tout
contrôle, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null` et `GIT_CONFIG_NOSYSTEM=1`. Le test donne au
contrôle un `HOME` dont le `.gitconfig` porte une identité, `commit.gpgsign = true`, `gpg.format = ssh` et une clé
absente. Le contrôle lance `git commit --allow-empty` avec son identité passée par `-c`, dans un dépôt de sa copie.

- Vérifie : `node --test test/v1-adapters/control-git-signature.test.ts`
- Tient : `test/v1-adapters/control-git-signature.test.ts`, « sous un hôte qui signe ses commits avec une clé absente, un contrôle commite dans un dépôt de sa copie et son évidence est PASS »
- Rouge : `profileFor` rend `env: control.env` ; git lit le `.gitconfig` du `HOME` transmis, tente de signer, échoue sur la clé absente, et l'évidence est FAIL.

### Tâche 2 — Aucune portée globale ni système, même par une variable du contrôle

Le test fait lister au contrôle `git config --list --show-scope`, dans deux cas. Dans le premier, sous un `HOME` qui
porte un `.gitconfig`. Dans le second, sous un contrôle dont `env` pose `GIT_CONFIG_GLOBAL` sur ce même fichier et
dont la liste blanche laisse passer `GIT_CONFIG_GLOBAL` et `GIT_CONFIG_SYSTEM`. Les variables de l'isolement sont
posées après celles du contrôle.

- Vérifie : `node --test test/v1-adapters/control-git-scopes.test.ts`
- Tient : `test/v1-adapters/control-git-scopes.test.ts`, « la configuration git qu'un contrôle voit n'a aucune entrée de portée globale ni système, même quand son environnement déclaré ou sa liste blanche pose GIT_CONFIG_GLOBAL »
- Rouge : la sortie porte les entrées `global` du `.gitconfig` transmis, et les entrées `system` de la configuration système de git sur cette machine.

### Tâche 3 — Aucune variable de configuration git ne fait relire la configuration de l'hôte

`profileFor` retire de l'environnement déclaré et de la liste blanche du contrôle toute variable dont le nom commence par
`GIT_CONFIG`, et `GIT_TEMPLATE_DIR`, avant de poser l'isolement. Le test fait lister au contrôle `git config --list --show-origin` sous un
contrôle qui déclare `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_0=include.path` et `GIT_CONFIG_VALUE_0` sur le `.gitconfig` de
l'hôte, sous un autre qui déclare `GIT_CONFIG_PARAMETERS` avec le même `include.path`, sous un autre qui déclare
`GIT_CONFIG` sur ce fichier, et sous un contrôle dont la liste blanche laisse passer ces variables posées par l'hôte ;
puis il fait initialiser au contrôle un dépôt sous un `GIT_TEMPLATE_DIR` déclaré, et sous un autre laissé passer, qui
désigne le dossier du `.config/git/config` de l'hôte.

- Vérifie : `node --test test/v1-adapters/control-git-scopes.test.ts`
- Tient : `test/v1-adapters/control-git-scopes.test.ts`, « aucune variable de configuration git que le contrôle déclare ou laisse passer ne lui fait relire la configuration globale de l'hôte, pas même par include.path »
- Rouge : `profileFor` transmet `control.env` et `control.env_allowlist` tels quels ; git suit l'`include.path` de la portée de commande et liste `user.name=host` et `user.email`, d'origine `file:` le `.gitconfig` de l'hôte.

## 5. Hors périmètre

- **L'identité git.** Un test de cible qui commite en comptant sur l'identité de l'hôte échouera, avec le message de
  git qui le dit. Il doit donner son identité, comme le font ceux de pi-495 : toute la suite de pi-495, 1 254 tests,
  passe sous `GIT_CONFIG_GLOBAL=/dev/null` et `GIT_CONFIG_NOSYSTEM=1`, essai du 11 octobre.
- **L'étape d'installation** garde la configuration de l'hôte : l'outil y lit ses dépôts, ses miroirs et ses
  identifiants (`D-76`).
- **Les commandes de l'agent**, hors contrôle, ne changent pas.
- **Le dossier personnel et le temporaire** restent ceux d'aujourd'hui (`D-90`).
- **Un réglage git passé par la commande du contrôle** (`git -c …`) reste lu : il est écrit dans la définition figée du
  contrôle, non pris dans l'environnement.
- **Les dossiers inscriptibles d'un contrôle** relèvent de e40s02, la partie Seatbelt de `BUG-2026-10-11T013000` reste
  au registre.
