# PMD et CPD mesurent un réacteur Maven dont un module dépend d'un autre

Story : e28s04
Epic : e28
Statut : versée

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-10-03T060500 du registre. Le propriétaire qui demande à 495 l'état de la
qualité d'un projet Maven en plusieurs modules, et adopte le référentiel PMD que 495 lui propose, voit
aujourd'hui G2 refuser ce référentiel dès qu'un module déclare un module voisin comme dépendance : le
contrôle `pmd` lance `mvn -o pmd:pmd` sans aucune phase, Maven ne résout pas le module voisin depuis le
réacteur, ne le trouve pas hors ligne dans le dépôt local, et s'arrête avant que PMD lise une source. Le
contrôle n'est pas qualifié, et G2 s'arrête sur `capability_missing`. Or un réacteur dont les modules
dépendent les uns des autres est la forme ordinaire d'un projet Maven en plusieurs modules : le défaut
écarte de l'état des lieux de qualité presque tous les projets que ce référentiel vise.

Le propriétaire gagne un état des lieux de qualité, puis un programme de remédiation, sur un réacteur dont
un module dépend d'un autre, mesuré par PMD et CPD comme l'est un réacteur de modules indépendants.

## 2. Promesses

Scenario: PMD est qualifié sur un réacteur dont un module dépend d'un autre
  Given un réacteur Maven de deux modules, `domain` et `infrastructure`, où `infrastructure` déclare `domain` comme dépendance
  And une copie de ce réacteur où 495 a déclaré `maven-pmd-plugin` selon sa recommandation, ses greffons résolus
  When le contrôle `pmd` est qualifié par ses témoins, le réseau fermé
  Then le témoin positif est PASS, le témoin négatif est FAIL, et la qualification de `pmd` est qualifiée
  And aucune note de la qualification ne nomme une dépendance non résolue

Scenario: CPD est qualifié sur le même réacteur
  Given le même réacteur, dans la même copie
  When le contrôle `cpd` est qualifié par ses témoins, le réseau fermé
  Then le témoin positif est PASS, le témoin négatif est FAIL, et la qualification de `cpd` est qualifiée

Scenario: La passe de PMD sur la référence rapporte une violation du module qui dépend de l'autre
  Given le même réacteur, dont une classe du module `infrastructure` porte une méthode privée jamais appelée
  When le contrôle `pmd` tourne sur la copie de référence
  Then sa preuve est FAIL et porte un constat `UnusedPrivateMethod` qui nomme le fichier de cette classe sous `infrastructure/` à la ligne de la méthode

## 3. Sécurité

Le confinement ne change pas : `pmd` et `cpd` tournent toujours hors ligne, le réseau fermé, avec les POM
protégés et les seuls répertoires `target` des modules en écriture. Construire les modules avant l'analyse
écrit leurs classes sous ces mêmes répertoires `target`, et nulle part ailleurs ; les greffons que cette
construction appelle sont ceux que la résolution de l'adoption a déjà rapatriés.

## 4. Tâches

### Tâche 1 — Les buts de PMD et de CPD tournent derrière une phase qui construit les modules du réacteur

Les commandes des contrôles `pmd` et `cpd` déclarés pour un réacteur où 495 a déclaré PMD lancent leur
but dans la même invocation qu'une phase qui produit les classes des modules (au moins `compile`), pour
que Maven résolve un module voisin depuis le réacteur. Le test de `test/v1-adapters/quality-referential.test.ts`
qui fige la commande suit le changement.

- Vérifie : `node --test test/v4-platform/maven-quality-reactor.test.ts`
- Tient : `test/v4-platform/maven-quality-reactor.test.ts`, « sur un réacteur Maven dont le module infrastructure dépend du module domain, pmd et cpd sont qualifiés par leurs témoins, aucune note ne nomme une dépendance non résolue, et la passe de pmd sur la référence rapporte UnusedPrivateMethod dans le module infrastructure à la ligne de la méthode »
- Rouge : la commande `mvn -B -q -o pmd:pmd -Dpmd495.ruleset=…` sort en 1 sur « Could not resolve dependencies for project io.demo:demo-infrastructure:jar:1.0.0; dependency: io.demo:demo-domain:jar:1.0.0 (compile); Cannot access central … in offline mode » : la qualification de `pmd` est [INDETERMINATE, INDETERMINATE, non qualifiée], avec la note « positive witness gave INDETERMINATE: the analyser exited with 1 … », et la même commande sur la référence sort de même en 1, avant tout rapport (sondé sur `main` à 494d2dc avec le réacteur de `fixtureMavenHexagonal` et le sandbox de la plateforme ; `cpd` y est déjà qualifié, et les deux le sont une fois le but placé derrière `compile`)

## 5. Hors périmètre

- Un candidat dont les sources ne compilent pas : `pmd` et `cpd` échouent alors avec la compilation, comme
  le contrôle de tests le fait déjà ; leur verdict sur un tel candidat n'est pas une promesse de cette story.
- Un projet qui configure PMD lui-même : 495 ne lui propose pas de référentiel, et ses commandes ne sont pas
  les siennes.
- La liste des constats coupée à 1000, qui peut cacher le constat d'un témoin (BUG-2026-10-03T193000), et
  les autres défauts ouverts du registre, dont BUG-2026-09-27T170100, qui attend l'epic e13.
