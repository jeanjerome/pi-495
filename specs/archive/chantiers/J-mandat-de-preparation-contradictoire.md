# Transverse J — le mandat qui interdit la vérification qu'il exige

**État :** ouvert
**Objet :** le prompt d'une intervention `prepare` ou `implement` lui ordonne de lancer les contrôles
elle-même, et son mandat lui interdit d'écrire ailleurs que dans les racines de test ; un producteur
qui se vérifie autrement que par la commande exacte du contrôle voit sa proposition refusée
**Ne dépend d'aucun étage ; la question générale dont ce cas est un symptôme est instruite par `chantiers/K`**

## Motif

Campagne du 18 septembre 2026 sur la cible Maven avec `Qwen3.8-Flash-Next-MLX-oQ4-MTP`. La première
intervention de préparation écrit quatre fichiers de test corrects — jugés `on_reference: FAIL`,
`discriminant: true`, `loadable: true` — et **onze fichiers hors mandat** :

```
.verify-scratch/RunTests.java   .verify-scratch/compile.sh   .verify-scratch/javac.log
.verify-scratch/args.txt        .verify-scratch/cp.txt       .verify-scratch/out.log
.verify-scratch/compile.log     .verify-scratch/go.sh        .verify-scratch/probe.txt
                                .verify-scratch/run.log      .verify-scratch/sources.txt
```

Un atelier de compilation monté à la main — liste de sources, chemin de classes, journaux — pour
contrôler son travail. La préparation est refusée sur ces onze chemins, et l'intervention atteint le
plafond de `tool_calls_per_intervention` en les produisant : 100 appels, 38,2 min, 6 125 866 jetons,
contre 74 appels et 2 488 865 jetons pour la campagne du 27B qui avait réussi du premier coup.

Le modèle n'a pas désobéi. Il a obéi à une consigne qui en contredit une autre.

**Le prompt exige une vérification que le mandat interdit.** `context.ts` pousse aux rôles `prepare`
et `implement`, dès qu'un contrôle est gelé :

> The kernel will judge your work by running, without you: `mvn -B -q -o test` in the workspace root
> (maven-test); … Run it yourself before you answer and keep working until it gets past compilation.

et l'objectif construit par `openPreparation` dit dans le même prompt :

> only files under `src/test/`, `domain/src/test/`, `infrastructure/src/test/` may be created or
> modified

Se vérifier impose d'écrire hors de ces trois racines. Les deux consignes ne sont pas conciliables
telles qu'elles sont écrites.

**La tolérance qui sauve un producteur est invisible depuis le prompt.** `preparedFilesFrom` refuse
tout chemin hors des racines autorisées, mais il ne parcourt que les entrées du manifeste de
candidat — et `target/` fait partie des `workspace_exclusions` par défaut. Vérifier par Maven passe
donc **par accident** : ses écritures n'apparaissent jamais. Vérifier autrement est puni. Rien dans
le prompt ne dit qu'un répertoire de travail est toléré, ni lequel.

**Une des commandes annoncées ne veut rien dire.** Le contrôle `coverage` a pour commande
`node -e ""`, un no-op qui ne fait que déclencher la lecture d'un rapport. Le prompt la rend telle
quelle : `` `node -e ` in the workspace root (coverage) ``. Le producteur reçoit l'ordre de lancer
une commande vide, ce qui le renseigne mal sur ce qu'il est censé vérifier.

**Ce qui n'est pas en cause.** L'`env_allowlist` d'une intervention — `PATH`, `HOME`, `TMPDIR`,
`LANG` — ne porte ni `JAVA_HOME` ni `MAVEN_USER_HOME`, que les contrôles reçoivent par `BASE_ENV` :
une intervention voit donc un JDK 26 là où les contrôles voient un JDK 21. L'asymétrie est réelle et
mérite d'être tranchée, mais elle n'explique pas ce refus : le README de la cible établit que son
agent de couverture lit les classes jusqu'à la version 26 et que le projet se construit inchangé.

## Ce que le constat coûte aujourd'hui

Un producteur discipliné qui se vérifie autrement que par la commande exacte perd sa proposition et,
comme ici, son budget d'appels d'outils. Deux rounds de préparation ont été nécessaires pour un
résultat qu'un seul aurait dû donner : 55,7 min et 7,4 M de jetons au lieu de 32,5 min et 2,5 M.

Le second round, une fois le refus rendu au modèle avec les onze chemins, n'a écrit aucun fichier
hors périmètre — le feedback fonctionne. Mais il a fallu le payer.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/chantiers/J-mandat-de-preparation-contradictoire.md, puis
dans le code : l'instruction poussée aux rôles prepare et implement dans src/application/context.ts
(buildContext, la branche `The kernel will judge your work by running`), l'objectif construit par
openPreparation dans src/application/harness.ts, preparedFilesFrom dans
src/application/preparation.ts, et workspace_exclusions dans src/extension/config.ts.

Reproduis d'abord le constat sans modèle : un test au niveau de test/v2/preparation qui monte une
préparation dont l'intervention écrit un fichier de travail hors des racines autorisées — un
script, un journal — en plus de tests corrects, et qui échoue aujourd'hui parce que la préparation
est refusée alors que ses tests sont valides.

Décide ensuite ce qui porte la tolérance, et écris la décision dans specs/adr/. Deux formes
au moins :

  - le mandat énonce ce qui est RETENU plutôt que ce qui est PERMIS — « seuls les fichiers sous ces
    racines seront adoptés ; ce que tu écris ailleurs est ignoré » — et preparedFilesFrom cesse de
    refuser, se contentant de ne retenir que le périmètre ;
  - ou le mandat nomme explicitement un répertoire de travail toléré, ajouté aux exclusions de
    workspace, et le prompt le dit.

La première rend le prompt cohérent sans rien ajouter au contrat ; la seconde garde le refus comme
garde-fou mais demande de maintenir une liste. Dans les deux cas, ce que le producteur peut écrire
doit se lire dans le prompt, et non dépendre d'une exclusion de workspace qu'il ne peut pas
connaître.

Traite aussi la commande vide : un contrôle dont la commande est un no-op ne doit pas être présenté
au producteur comme une commande à lancer. Soit le contexte l'omet, soit il dit ce que le contrôle
lit au lieu de ce qu'il exécute.

L'asymétrie d'environnement — JAVA_HOME et MAVEN_USER_HOME absents de l'env_allowlist d'une
intervention alors que les contrôles les reçoivent — est à trancher, pas forcément à corriger :
écris la décision, avec son motif.

Vérifie sur la cible réelle en lançant une campagne neuve : la préparation doit être adoptée du
premier coup. Celle de ~/.495-campagnes/java-flashnext est close et acceptée, elle ne se reprend
plus ; son dossier reste lisible et porte les onze chemins refusés du premier round.

npm run build avant npm run check.
```

## Critères d'acceptation

- un test déterministe couvre une préparation dont l'intervention écrit hors des racines autorisées
  en plus de tests valides, et échoue sur le comportement actuel ;
- ce qu'un producteur peut écrire se lit dans le prompt, sans dépendre d'une exclusion de workspace ;
- aucun contrôle dont la commande est un no-op n'est présenté au producteur comme une commande à
  lancer ;
- la décision sur l'environnement d'une intervention est écrite, quelle qu'elle soit ;
- `npm run build` puis `npm run check` passent.

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Instruction de vérification poussée au producteur | `src/application/context.ts`, `buildContext` |
| Objectif du mandat de préparation | `src/application/harness.ts`, `openPreparation` |
| Refus des chemins hors périmètre | `src/application/preparation.ts`, `preparedFilesFrom` |
| Exclusions qui rendent `target/` invisible | `src/extension/config.ts`, `workspace_exclusions` |
| Commande no-op du capteur de couverture | `src/application/target.ts`, contrôle `coverage` |
| Environnement d'une intervention | `src/application/harness.ts`, `profileFor` |

## Journal

**18 septembre 2026.** Ouverture. Le constat vient de la campagne Flash-Next sur la cible Maven,
transcrite dans `../QUALIFICATION.md` : première préparation refusée sur onze fichiers hors mandat,
plafond d'appels d'outils atteint en les produisant, seconde préparation adoptée après que le refus
a nommé les chemins. La contradiction entre l'instruction de vérification et le mandat a été lue
dans le code, et la tolérance accidentelle de `target/` vérifiée dans `preparedFilesFrom` et les
exclusions par défaut.

**19 septembre 2026.** La campagne Flash-Next est allée jusqu'à l'acceptation après reprise, mais
elle n'apporte rien à cette fiche : la reprise n'a rejoué que l'implémentation, aucune préparation
n'a tourné. Les deux rounds de préparation restent ceux du 18 septembre, et le constat est inchangé.
La vérification sur cible réelle demande donc une campagne neuve, que le dossier clos ne remplace
pas.
