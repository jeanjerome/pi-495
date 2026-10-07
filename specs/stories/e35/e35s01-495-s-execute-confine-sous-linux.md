# 495 s'exécute confiné sous Linux, et la documentation le dit

Story : e35s01
Epic : e35
Statut : en cours

## 1. Ce que le lecteur gagne

Le développeur qui travaille sous Linux ne peut pas utiliser 495 : le bac à sable `bubblewrap` est écrit
mais ne se qualifie jamais, par décision (`D-31`), et tout rôle confiné est refusé avec
`capability_missing`. Le README annonce macOS seul.

Il gagne un 495 qui se qualifie sous Linux quand `bwrap` peut y confiner, qui confine ce que Seatbelt
confine sous macOS, et qui conduit un vrai changement de bout en bout ; et une documentation qui dit Linux
pris en charge, testé sous arm64 (`D-84`). C'est un défaut et non une préférence : le confinement marche
sous Linux — sondé le 2026-10-07 dans une machine virtuelle d'Apple container — et seule une décision
devenue sans objet empêche de s'en servir.

## 2. Promesses

Scenario: Le bac à sable se qualifie sous Linux quand bwrap peut confiner
  Given une machine Linux dont `bwrap` crée sans privilège les espaces de noms qu'il demande
  When 495 choisit son bac à sable
  Then il choisit `bubblewrap`, qualifié, pour la plateforme `linux-<architecture>`
  And aucun rôle confiné n'est refusé pour `capability_missing`

Scenario: Sans bwrap capable de confiner, le refus nomme ce qui manque
  Given une machine Linux sans `bwrap` dans `PATH`
  Then la qualification échoue avec la raison « bwrap not found in PATH »
  Given une machine Linux dont `bwrap` sort en 1 en écrivant « bwrap: No permissions to create new namespace »
  Then la qualification échoue avec une raison qui cite ce message
  And sur macOS, `bubblewrap` échoue avec la raison « bubblewrap requires Linux »

Scenario: Le bac à sable Linux confine les écritures et les lectures protégées
  Given un profil qui accorde l'écriture dans `ws` et protège le répertoire `secret`
  When une commande confinée tente chaque accès
  Then l'écriture dans `ws` réussit
  And une écriture hors de `ws` est refusée avec `EROFS` et le fichier n'existe pas après
  And la lecture de `secret/key`, directe ou par un lien symbolique créé dans `ws`, échoue avec `ENOENT`
  And une écriture dans le répertoire personnel est refusée avec `EROFS` et n'a pas lieu

Scenario: Sous un réseau refusé, la commande n'atteint qu'elle-même
  Given un profil au réseau `denied`, puis un profil au réseau `loopback`
  When la commande ouvre un serveur sur 127.0.0.1, s'y connecte, puis tente 93.184.216.34:80
  Then elle se joint elle-même, et l'autre hôte lui répond `ENETUNREACH`
  Given un profil au réseau `allowed`
  Then une connexion à 127.0.0.1:9 échoue avec `ECONNREFUSED`, et non `ENETUNREACH`

Scenario: La suite entière passe sous Linux
  Given le dépôt copié dans une machine virtuelle Linux par `scripts/linux/test.sh`
  When la suite de tests tourne
  Then aucun test n'échoue, et les parcours par les entrées de Pi tournent sous `bubblewrap` qualifié, sans le mode non confiné

Scenario: Un vrai changement se conduit de bout en bout sous Linux
  Given une machine virtuelle Linux où Pi 1.0.4 charge 495 et parle au modèle de l'abonnement
  When les campagnes de référence npm et Maven y tournent par `scripts/linux/campagne.sh`
  Then chacune finit sur « reference campaign: no defect of the harness », le changement accepté

Scenario: La documentation dit Linux pris en charge, testé sous arm64
  Given le README
  Then il annonce macOS sur Apple Silicon et Linux, en précisant que Linux est testé sous arm64
  And il demande `bubblewrap` (`bwrap`) sous Linux, et ne range plus l'exécution sous Linux parmi le travail différé

## 3. Sécurité

Le confinement est touché : une machine Linux devient une plateforme où les rôles confinés s'exécutent. La
qualification sonde que `bwrap` crée ses espaces de noms sans privilège, et refuse sinon en nommant la
raison (`ADR-013`) ; la matrice d'attaque de Seatbelt est éprouvée contre `bubblewrap` sous Linux. Sous
Linux, un réseau `denied` laisse le processus se joindre lui-même dans son propre espace de noms réseau, sans
qu'aucun autre hôte, ni la machine qui l'héberge, ne soit atteignable (`D-84`).

## 4. Tâches

### Tâche 1 — bubblewrap se qualifie quand il peut confiner, et la suite passe sous Linux

`BubblewrapSandbox.qualify` (`src/adapters/sandbox/backends.ts`) ne renvoie plus le refus de principe de
`D-31` : sur Linux, avec `bwrap` dans `PATH`, il lance `bwrap` sur une commande nulle avec les espaces de
noms qu'il demande ; qualifié si elle réussit, refusé sinon avec le message de `bwrap`. Un nouveau fichier
`test/v1-adapters/sandbox-linux.test.ts` éprouve sous Linux la qualification, la matrice d'attaque et le
réseau ; le test qui disait « bubblewrap never qualifies » dit le refus hors de Linux. Le banc des tests
(`test/helpers/command-fixture.ts`) ne force plus le mode non confiné sous Linux : seulement là où aucun
backend ne se qualifie.

- Vérifie : `scripts/linux/test.sh`
- Tient : `test/v1-adapters/sandbox-linux.test.ts`, « sous Linux, `bubblewrap` est qualifié pour `linux-<architecture>` ; une écriture dans `ws` réussit, hors de `ws` et dans le répertoire personnel elle échoue avec `EROFS` sans avoir lieu, `secret/key` lu directement ou par un lien échoue avec `ENOENT` ; sous `denied` et `loopback` la commande se joint et 93.184.216.34:80 répond `ENETUNREACH` ; sous `allowed` 127.0.0.1:9 répond `ECONNREFUSED` ; un `bwrap` qui sort en 1 avec « bwrap: No permissions to create new namespace » laisse un refus qui cite ce message, et sans `bwrap` dans `PATH` le refus dit « bwrap not found in PATH » » ; et la suite entière sous Linux, dont les parcours de `test/v3-pi` sous `bubblewrap`
- Rouge : `qualify` renvoie toujours `qualified: false` avec « Linux is not a claimed platform of this package » ; sous Linux, les tests de qualification échouent, et `test/v3-pi` force le mode non confiné, que le noyau refuse pour l'implémentation : 13 parcours échouent (mesuré le 2026-10-07 à `e3eb2b8`)

### Tâche 2 — Les campagnes de référence passent sous Linux

- Vérifie à la main : `scripts/linux/campagne.sh npm`, puis `scripts/linux/campagne.sh maven`
- Tient : la dernière ligne de chacune, « reference campaign: no defect of the harness », et la ligne `status completed` avec `G5 PASS`
- Rouge : sous Linux, `bubblewrap` n'est jamais qualifié, et le changement s'arrête sur `capability_missing`

### Tâche 3 — La documentation dit Linux pris en charge, testé sous arm64

Le README annonce macOS sur Apple Silicon et Linux, testé sous arm64 : le badge de plateforme, l'encart
« Available today », les prérequis du démarrage rapide (avec `bubblewrap` sous Linux), la ligne
« Platform » de la compatibilité ; et il retire l'exécution sous Linux du travail différé. Le corpus normatif
(`specs/amont/conception-verification.md`) ne nomme plus Linux x86-64 comme plateforme à qualifier, mais Linux
testé sous arm64 (`D-84`). L'epic `e35` du plan dit la décision.

- Vérifie à la main : lire ces passages, puis `npm run build` et `npm run check`, vert
- Tient : la lecture, où Linux est pris en charge et testé sous arm64, et où le README demande `bwrap`
- Rouge : le README dit « macOS on Apple Silicon » seul et « The Linux `bubblewrap` backend exists but remains unqualified and refuses productive work »

## 5. Hors périmètre

- Une machine Linux x86-64 réelle : le propriétaire tient arm64 pour la couvrir (`D-84`) ; aucune n'est
  disponible pour la mesurer.
- Linux sans espaces de noms utilisateur, comme un conteneur ordinaire : le refus le dit, et 495 ne
  cherche pas à y confiner autrement.
- Windows.
