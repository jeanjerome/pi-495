# Le producteur se vérifie comme le noyau le juge, sans perdre sa préparation

Story : e03s01
Epic : e03
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui conduit une campagne paie aujourd'hui une contradiction que 495 écrit lui-même
dans le prompt du producteur. La consigne lui ordonne de lancer les contrôles avant de répondre, et
son mandat lui dit que seuls les fichiers sous les racines de test peuvent être créés ou modifiés.
Un producteur qui se vérifie autrement que par la commande exacte — un script, un journal, une liste
de sources — voit toute sa préparation refusée, tests corrects compris. Sur la cible Maven, le
18 septembre, onze fichiers de travail sous `.verify-scratch/` ont fait refuser quatre tests
discriminants : 55,7 min et 7,4 M de jetons là où un essai aurait coûté 32,5 min et 2,5 M. Celui
qui passe par `mvn test` n'est sauvé que parce que `target/` est exclu du manifeste, ce que le
prompt ne dit nulle part.

Le producteur reçoit aussi `node -e ` comme une commande à lancer — le déclencheur vide des
contrôles qui lisent un rapport ou le code —, et il se vérifie avec un autre JDK que celui des
contrôles, faute de recevoir `JAVA_HOME`. Le lecteur du dossier ne peut pas distinguer un producteur
incapable d'un producteur à qui l'on a demandé deux choses inconciliables. C'est un défaut : 495
punit l'obéissance à sa propre consigne.

## 2. Promesses

Scenario: Une préparation qui écrit hors de ses racines en plus de tests valides est adoptée
  Given une cible Maven dont l'exigence n'a aucun test, et une intervention de préparation qui écrit des tests valides sous une racine de test et un journal sous .verify-scratch/
  When la préparation est jugée
  Then la suite préparée est adoptée comme discriminante dès ce premier essai
  And le dossier nomme .verify-scratch/run.log comme écrit hors du mandat et non retenu
  And le jugement sur la référence ne porte que les fichiers retenus sous les racines de test

Scenario: Ce qui est écrit hors des racines n'est jamais adopté, même quand c'est la fonctionnalité
  Given une intervention de préparation qui écrit l'implémentation sous src/ en plus d'un test qui l'exerce
  When la préparation est jugée
  Then le test est jugé sur la référence sans l'implémentation, et adopté parce qu'il y échoue
  And l'implémentation n'est ni dans la suite adoptée ni dans l'arbre que reçoit l'implémentation

Scenario: Une préparation qui ne retient aucun test reste refusée
  Given une intervention de préparation qui n'écrit que hors des racines de test
  When la préparation est jugée
  Then elle est refusée avec la note « no test file was produced »
  And le retour au producteur nomme les chemins écrits hors du mandat

Scenario: Le mandat dit ce qui est retenu, pas où il est permis d'écrire
  Given une préparation ouverte sur une cible Maven
  When le producteur lit son objectif
  Then il lit que seuls les fichiers sous les racines de test seront retenus, et que ce qu'il écrit ailleurs pour se vérifier est ignoré
  And il ne lit plus que ces racines sont les seules où il peut créer ou modifier un fichier

Scenario: Un contrôle qui ne lance rien n'est pas présenté comme une commande
  Given un protocole Maven avec maven-test, coverage lu du rapport JaCoCo et structure lue des déclarations Java
  When une intervention prepare ou implement reçoit son contexte
  Then la consigne lui demande de lancer `mvn -B -q -o test`
  And elle nomme coverage et structure avec ce qu'ils lisent, sans leur prêter de commande

Scenario: Le producteur se vérifie dans l'environnement des contrôles
  Given une cible dont les contrôles reçoivent JAVA_HOME, LC_ALL et MAVEN_OPTS
  When une intervention prepare ou implement démarre
  Then son profil laisse passer ces variables
  And une intervention qui ne fait que lire garde le profil d'aujourd'hui

Scenario: La décision est écrite
  Given le répertoire specs/adr/
  When le lecteur cherche ce qu'une préparation retient
  Then une décision dit que le mandat borne ce qui est retenu et non ce qui est écrit, pourquoi un contrôle qui ne lance rien n'est pas présenté comme une commande, et pourquoi le producteur reçoit l'environnement des contrôles

## 3. Sécurité

- Chemins écrits : le confinement ne change pas, l'intervention n'écrit toujours que dans son
  workspace. Ce qu'elle écrit hors des racines de test n'est ni adopté, ni présent dans le jugement
  sur la référence, ni reporté au candidat : ignorer remplace refuser sans rien laisser entrer.
- Chemins protégés : inchangés ; le candidat reste jugé sur ses chemins protégés comme aujourd'hui.
- Environnement : les rôles qui écrivent reçoivent trois variables de plus, `JAVA_HOME`, `LC_ALL` et
  `MAVEN_OPTS`, celles que les contrôles reçoivent déjà. Aucune ne porte de secret sur la machine de
  référence, et le réseau reste refusé à l'intervention. Les rôles qui lisent sont inchangés.

## 4. Tâches

### Tâche 1 — La préparation retient ses racines et ignore le reste

Ce qu'une intervention de préparation écrit hors des racines de test est ignoré et nommé dans le
dossier, au lieu de faire refuser la préparation. Une suppression ou une entrée qui n'est pas un
fichier sous une racine reste refusée. Le test existant « a producer that implements the feature
inside the preparation, or writes outside test/, is refused » est réécrit sur le second scénario :
sa promesse s'inverse.

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « a preparation that writes a work log outside its roots beside valid tests is adopted on its first try, and the dossier names the ignored path »
- Rouge : `prepare` n'adopte la suite que si `out_of_scope` est vide ; la préparation est refusée sur « change outside the preparation mandate refused: .verify-scratch/run.log » et un second essai est ouvert

### Tâche 2 — Le mandat dit ce qui est retenu

L'objectif du mandat de préparation dit que seuls les fichiers sous les racines de test seront
retenus, et que ce qui est écrit ailleurs pour se vérifier est ignoré.

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « the preparation objective says only files under its roots are retained and anything written elsewhere is ignored »
- Rouge : `preparationMandateObjective` écrit « only files under … may be created or modified »

### Tâche 3 — Un contrôle qui ne lance rien n'est pas présenté comme une commande

La consigne de vérification d'un rôle qui écrit ne nomme comme commande à lancer que celles qui
exécutent quelque chose ; un contrôle qui lit un rapport ou le code y est nommé avec ce qu'il lit.

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « on a Maven reactor with JaCoCo, the producer is asked to run mvn -B -q -o test and told coverage and structure are read, never to run node -e »
- Rouge : `buildContext` rend « `<node> -e ` in the workspace root (coverage) » et la même chose pour structure

### Tâche 4 — Le producteur reçoit l'environnement des contrôles

Le profil des rôles `prepare` et `implement` laisse passer les variables que les contrôles de la
cible reçoivent ; celui des rôles qui lisent ne change pas.

- Vérifie : `node --test test/v2/preparation.test.ts`
- Tient : `test/v2/preparation.test.ts`, « a writing intervention's profile passes JAVA_HOME, LC_ALL and MAVEN_OPTS as the controls do, and a reading one does not »
- Rouge : `profileFor` rend `env_allowlist: ["PATH", "HOME", "TMPDIR", "LANG"]` pour tous les rôles

### Tâche 5 — La décision est écrite

`specs/adr/D-71` porte les trois décisions du dernier scénario, avec leur motif : la campagne du
18 septembre pour la première, le déclencheur vide pour la deuxième, l'écart de JDK pour la
troisième.

- Vérifie à la main : lire `specs/adr/D-71-*.md` et y trouver les trois décisions, leur motif et un statut « Acceptée »
- Tient : la lecture de la décision, « le mandat borne ce qui est retenu, pas ce qui est écrit »
- Rouge : aucune décision de `specs/adr/` ne traite du périmètre d'une préparation ni de l'environnement d'une intervention

## 5. Hors périmètre

- Le découpage des instructions par rôle et par phase, et la question de savoir quels contrôles un
  producteur doit lancer lui-même — la mutation compris, qui refait un build complet : e04.
- Une campagne avec un vrai modèle : un modèle qui monte un atelier de vérification ne se reproduit
  pas à la demande ; la recette l'exerce par un agent scripté déclaré comme tel.
- Le rôle `implement` n'a pas de racines imposées ; ce qu'il écrit reste jugé par ses chemins
  protégés, comme aujourd'hui.
