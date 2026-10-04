# PMD et CPD tournent hors ligne sur un dépôt local que seule l'adoption a rempli

Story : e28s08
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-03T233000 du registre. Le propriétaire qui demande à 495 l'état de la
qualité d'un projet Maven, et adopte le référentiel PMD que 495 lui propose, voit aujourd'hui les contrôles
`pmd` et `cpd` échouer dès que le dépôt local de Maven de sa machine n'a jamais reçu le skin de site
`maven-fluido-skin` : l'adoption résout les greffons de la copie avec `resolve-plugins`, qui ne rapatrie pas
ce skin, et les buts `pmd:pmd` et `pmd:cpd`, qui rendent leur rapport avec lui, s'arrêtent hors ligne sur
« The skin does not exist … offline mode ». Les contrôles ne sont pas qualifiés et le référentiel ne mesure
rien. Le défaut ne se voit pas sur une machine où un autre projet a déjà construit un site, et frappe la
machine d'un développeur qui n'en a jamais construit : c'est l'adoption elle-même qui promet de rapatrier
ce que les contrôles adoptés utilisent hors ligne.

Le propriétaire gagne un état des lieux de qualité mesuré par PMD et CPD sur sa machine telle qu'elle est,
sans avoir à rapatrier à la main ce que 495 a omis.

## 2. Promesses

Scenario: L'adoption du référentiel PMD sur un dépôt local vide rapatrie de quoi qualifier pmd hors ligne
  Given un projet Maven dont aucun POM ne nomme `maven-pmd-plugin`, et un dépôt local de Maven vide
  When l'adoption de la recommandation PMD de 495 résout ses greffons dans une copie, avec ce dépôt local
  And le contrôle `pmd` est qualifié par ses témoins, le réseau fermé, avec ce même dépôt local
  Then la résolution de l'adoption est `resolved`
  And le témoin positif est PASS, le témoin négatif est FAIL, et la qualification de `pmd` est qualifiée
  And aucune note de la qualification ne nomme le skin de site

Scenario: CPD est qualifié hors ligne sur le même dépôt local
  Given le même projet et le même dépôt local, rempli par la seule adoption
  When le contrôle `cpd` est qualifié par ses témoins, le réseau fermé
  Then le témoin positif est PASS, le témoin négatif est FAIL, et la qualification de `cpd` est qualifiée
  And aucune note de la qualification ne nomme le skin de site

Scenario: L'adoption ne lance toujours aucun but du greffon adopté
  Given une recommandation Maven de 495
  When le plan de sa résolution est établi
  Then la commande du plan résout les greffons avec `maven-dependency-plugin` et ne nomme aucun but du greffon adopté

## 3. Sécurité

L'adoption rapatrie un artefact de plus, le skin de site que les buts de rapport de `maven-pmd-plugin`
chargent, depuis les dépôts que la configuration de Maven nomme, pendant la seule étape de résolution, qui
ouvre déjà le réseau ; il s'écrit dans le dépôt local que Maven annonce, comme les greffons, et nulle part
dans la copie : l'inspection de la résolution refuse toujours une copie où un autre fichier que `pom.xml` a
changé. Le confinement des contrôles ne change pas : `pmd` et `cpd` tournent hors ligne, le réseau fermé,
les POM protégés et les seuls répertoires `target` en écriture.

## 4. Tâches

### Tâche 1 — L'adoption de PMD rapatrie le skin de site que ses buts de rapport chargent

La commande de résolution d'une recommandation Maven rapatrie, en plus des greffons de la copie, le skin de
site que les buts `pmd:pmd` et `pmd:cpd` de la version de `maven-pmd-plugin` que 495 déclare chargent
(`org.apache.maven.skins:maven-fluido-skin:2.0.0-M9` pour la 3.28.0), sans lancer aucun but du greffon
adopté. Le test v4 part d'un dépôt local vide sous le répertoire du test, nommé à Maven par `MAVEN_ARGS`
(`-Dmaven.repo.local=…`), dans l'environnement que l'adoption passe à `askedLocalRepository` et à
`runInstall` comme dans celui des contrôles qualifiés ; il ouvre le réseau à la seule résolution, comme
l'adoption, et saute sans `mvn` sur le `PATH`. Le test de `test/v1-adapters/installation.test.ts` qui fige
le plan Maven continue de tenir le troisième scénario.

- Vérifie : `node --test test/v4-platform/maven-quality-offline.test.ts`
- Tient : `test/v4-platform/maven-quality-offline.test.ts`, « sur un dépôt local de Maven vide que seule l'adoption du référentiel PMD a rempli, la résolution est resolved, pmd et cpd sont qualifiés par leurs témoins le réseau fermé, et aucune note ne nomme le skin de site »
- Rouge : la commande du plan, `mvn -B org.apache.maven.plugins:maven-dependency-plugin:3.11.0:resolve-plugins`, sort en 0 sur un dépôt local vide, puis `mvn -B -q -o compile pmd:cpd -DminimumTokens=100` sur ce dépôt sort en 1 sur « Failed to retrieve skin artifact: The skin does not exist: Cannot access central (https://repo.maven.apache.org/maven2) in offline mode and the artifact org.apache.maven.skins:maven-fluido-skin:jar:2.0.0-M9 has not been downloaded from it before » : le témoin positif de `cpd`, et de même celui de `pmd`, n'est pas PASS et le contrôle n'est pas qualifié (sondé sur `main` à d386ea0 avec Maven 3.9.9, hors sandbox, sur un projet d'un module où `maven-pmd-plugin` 3.28.0 est déclaré ; la même résolution suivie, dans la même invocation, de `maven-dependency-plugin:3.11.0:get -Dartifact=org.apache.maven.skins:maven-fluido-skin:2.0.0-M9 -Dtransitive=false` laisse `pmd:pmd` et `pmd:cpd` sortir en 0 hors ligne)

## 5. Hors périmètre

- Les dépendances du projet lui-même sur un dépôt local vide, dont le contrôle de tests a besoin hors ligne :
  l'entrée ne porte que sur ce que les buts de PMD et de CPD déclarés par 495 utilisent.
- Un projet qui configure PMD lui-même : 495 ne lui propose pas de référentiel et ne résout rien pour lui.
- Les tests v4 de `test/v4-platform/maven-quality*.test.ts` qui réutilisent le dépôt `~/.m2` de la machine :
  ils restent tels quels, la nouvelle preuve sur un dépôt vide s'y ajoute.
- Les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13.
