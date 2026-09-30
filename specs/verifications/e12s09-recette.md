# La preuve de la recette de e12s09 — adopter le greffon de couverture d'une cible Maven, dans un vrai Pi

| | |
|---|---|
| Conduite le | 2026-09-30 (UTC), de 18:13 à 18:26 |
| Build | `dist/` construit à `3545e58` (`~/.495-campagnes/builds/e12s09-3545e58`), extension chargée dans `pi --mode rpc` (Pi 0.87.1, Node 24.21.0, Maven 3.9.9 via mvnvm) ; la construction d'avant est celle de `333bdb3` (`builds/e12s09-avant-333bdb3`) |
| Agent | **scripté, déclaré comme tel** (`HARNESS495_SCRIPTED_AGENT`, `scripts/e12s09-maven-sans-discriminant.json`) : deux préparations qui ne retiennent qu'un test sans pouvoir discriminant, puis une implémentation de `shout`. Aucun modèle n'est appelé |
| Bac à sable | Seatbelt réel de la machine, non simulé ; Maven réel, dépôt Central réel, configuration `~/.m2/settings.xml` de la machine |
| Cible | `~/.495-campagnes/cible-e12s09` : un POM à une seule section `build/plugins`, sans JaCoCo, JUnit 5.10.2 et Surefire 3.2.5 ; dépôt git d'un commit |
| Pilote | `e12s08-drive.ts` (stderr de Pi en direct), enchaîné par `e12s08-rc3-run.sh` ; dossiers relus en lecture seule par `scripts/e12s09-lire.mjs` depuis `state.sqlite` et le magasin d'objets |
| Commandes | `/495 start add shout(name) returning the greeting in upper case`, puis `/495 resume` ; réponses aux dialogues dans l'ordre : `adopt`, `adopt_complement`, `assign_review`, `accept` |

| Campagne | Dossier | Changement | Issue |
|---|---|---|---|
| `e12s09-final-r1-adopter` | `~/.495-campagnes/e12s09-final-r1-adopter` | `chg_muofmr4r4e073e5f64` | accepté, G0 à G5 `PASS` |
| `e12s09-final-n1-g4-pom-reference` | `~/.495-campagnes/e12s09-final-n1-g4-pom-reference` | `chg_muofnxe6fad71d7b5d` | G4 `FAIL`, arrêt sur stagnation |
| `e12s09-final-n3-profil` | `~/.495-campagnes/e12s09-final-n3-profil` | `chg_muofp0l1b78e3c8b71` | accepté sans adoption |
| `e12s09-final-n2-avant` | `~/.495-campagnes/e12s09-final-n2-avant` | `chg_muofpw0r6a7e8f574c` | accepté sans adoption (construction d'avant) |
| `e12s09-r2b-depot-vide` | `~/.495-campagnes/e12s09-r2b-depot-vide` | — | accepté, dépôt local vide (voir plus bas) |

## Campagne verte — `e12s09-final-r1-adopter`

- **L'option est offerte.** La deuxième décision IH-04 (après deux préparations sans test discriminant)
  porte `prepare`, `assign_review`, `revise` et `adopt_complement`. L'option se lit : « Adopter le
  complément (modifie pom.xml ; résout org.jacoco:jacoco-maven-plugin 0.8.15, réseau ouvert pour cette
  seule étape) », et son effet dit que les fichiers téléchargés sont écrits dès l'adoption dans le dépôt
  local que Maven désigne — `/Users/jeanjerome/.m2/repository`, tel que Maven l'annonce — et y restent si
  l'intégration est refusée.
- **Le protocole gelé** porte les contrôles `maven-test`, `coverage` et `structure`, tous trois
  `network: denied`, tous trois qualifiés (`positive=PASS negative=FAIL`). Le complément adopté est
  `pom.xml` (`coverage` / `org.jacoco:jacoco-maven-plugin`), empreinte `sha256:b12c91c16bc8…`, dont l'objet
  du magasin se relit à la même empreinte : il déclare `jacoco-maven-plugin` avec les buts `prepare-agent` et
  `report`. Aucun paquet installé (`installed_packages` absent).
- **Le dossier conserve la sortie de Maven** : deux enregistrements `resolution_*` de 383 lignes chacun
  (la conception de la vérification reprend deux fois, et la résolution se rejoue à chaque reprise), qui
  listent les greffons résolus dont `org.jacoco:jacoco-maven-plugin:jar:0.8.15`. Le dépôt local de la machine
  portait déjà ce greffon : cette sortie ne montre aucun téléchargement.
- **Le capteur de couverture a tourné hors ligne.** Preuve du candidat, contrôle `coverage` : `FAIL`,
  « `Greeter.java:11` introduced line never exercised by the suite in `io.h495.Greeter.shout` » — c'est la
  mesure attendue, le test préparé n'appelle pas `shout`. La porte G5 passe après l'acceptation humaine de
  l'exigence assignée à la revue.
- **Le candidat porte `pom.xml` modifié** (`pom.xml(modified)`, `Greeter.java(modified)`) ; le projet de la
  cible n'a pas été écrit (`git status` vide, un seul commit).

## Dépôt local vide — `e12s09-r2b-depot-vide`

Même campagne avec `MAVEN_OPTS=-Dmaven.repo.local=~/.495-campagnes/m2-e12s09`, un dépôt local de 12 Mo qui ne
porte pas JaCoCo. Maven annonce ce chemin ; 495 le permet en écriture pour la résolution seule ; le
confinement du reste n'y touche pas.

- La sortie conservée au dossier dit ce que Maven a téléchargé : 1857 lignes, **737 fichiers téléchargés
  depuis Central dont 9 de JaCoCo**, en tête `jacoco-maven-plugin-0.8.15.pom` puis `.jar` ; le dépôt fait
  80 Mo ensuite. La reprise suivante de la conception retrouve tout en local : 383 lignes, aucun téléchargement.
- Les contrôles, hors ligne, trouvent le greffon dans ce même dépôt : `coverage` qualifié, G5 atteint.

## Contrôles négatifs

1. **Le producteur remet le `pom.xml` de la référence** (`e12s09-final-n1-g4-pom-reference`,
   `scripts/e12s09-implement-pom-reference.json`). Le protocole est le même (complément `pom.xml` adopté et
   qualifié) ; le candidat ne porte que `Greeter.java`, et **G4 : `FAIL` — `protected path altered by the producer:
   pom.xml`**, à la première tentative et à la seconde.
2. **Un POM dont les plugins sont tous dans un profil** (`e12s09-final-n3-profil`, cible
   `cible-e12s09-profil`). La recommandation de couverture reste un texte ; la décision IH-04 ne porte pas
   `adopt_complement` (0 occurrence dans la sortie du pilote) ; le protocole n'a que `maven-test` et
   `structure`.
3. **La construction d'avant la story** (`e12s09-final-n2-avant`, build `333bdb3`). Sur la même cible et le
   même script, la décision ne porte pas `adopt_complement` (0 occurrence) et le protocole n'a pas de contrôle
   `coverage`.

## Ce que la recette a montré que les tests n'avaient pas vu

- **Un dépôt local qui ne porte pas encore le greffon arrêtait l'adoption.** La première campagne à dépôt vide
  (`e12s09-r2-depot-vide`) a refusé l'adoption avec « Maven did not announce its local repository » : la
  commande d'annonce, rejouée dans la copie dont le POM déclare déjà le greffon, échoue hors ligne avant de
  dire où est le dépôt. Les faux Maven des tests annonçaient toujours le dépôt. Corrigé : le dépôt local est
  demandé à la copie telle que la référence l'a, avant que le POM déclare quoi que ce soit, et remis tel
  quel à l'étape de résolution ; un test rejoue ce cas avec un Maven à dépôt froid.
- **La déclaration se cherchait dans la première section `<plugins>` du fichier**, y compris celle d'un
  `pluginManagement` ou d'un profil placée avant celle du `build`, et refusait un POM qui garde JaCoCo dans un
  profil. Corrigé avant la recette par des tests sur des POM de cette forme.

## Ce que la recette n'établit pas

- Aucun modèle n'a tourné : l'agent est scripté. La recette établit le chemin de l'adoption, pas la qualité
  des préparations ou de l'implémentation qu'un modèle produirait.
- La résolution se rejoue, réseau ouvert, à chaque reprise de la conception de la vérification tant que la
  réponse d'adoption vaut (deux enregistrements dans la campagne verte). Elle ne télécharge plus rien quand le
  dépôt local est à jour.
- Un `surefire` qui configure lui-même `argLine` sans `@{argLine}` n'a pas été exercé (hors périmètre).
- Les fichiers résolus restent dans le dépôt local de la machine ; rien ne les retire après un refus de
  l'intégration.
