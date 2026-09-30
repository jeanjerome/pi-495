# Le propriétaire adopte un complément Maven : la déclaration entre au POM du candidat et le greffon est résolu dans le dépôt local de la machine

Story : e12s09
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible Maven ne lie aucun rapport JaCoCo reçoit de `e12s05` la recommandation de déclarer
`jacoco-maven-plugin` dans son POM, et il ne peut que la lire : la couverture des lignes introduites reste « non
mesurée » tant qu'il n'a pas édité son POM lui-même, hors de 495, puis relancé le changement.

Après la story, la décision « aucun test ne peut juger cette exigence » lui offre aussi d'adopter ce complément. 495
ajoute au POM la déclaration exacte du greffon, résout le greffon avec Maven, avec le réseau ouvert pour cette seule
étape, et le contrôle de couverture se déclare et se qualifie. Les fichiers téléchargés vont là où Maven les met sur
un poste de développeur : le dépôt local que Maven désigne, avec les dépôts, miroirs et identifiants que sa
configuration désigne. 495 ne choisit ni le dépôt local ni les dépôts distants, ne vérifie pas que le dépôt local
existe, et ne se substitue pas à Maven pour vérifier ce qu'il télécharge. La déclaration du POM fait partie du candidat et arrive dans le projet avec lui, à l'intégration que le
propriétaire accepte. Si la résolution échoue, rien n'est adopté et le dossier dit pourquoi.

## 2. Promesses

Scenario: Une recommandation de couverture porte la déclaration du greffon quand le POM l'accueille sans ambiguïté
  Given un pom.xml qui ne déclare pas JaCoCo et qui porte une seule section build/plugins hors profil, puis un pom.xml sans section build/plugins, puis un pom.xml dont les seuls plugins sont dans un profil ou dans pluginManagement
  When la pile de chacun est détectée
  Then la recommandation du premier porte la modification de pom.xml qui insère la déclaration de jacoco-maven-plugin 0.8.15 avec les buts prepare-agent et report, ainsi que la résolution de ce greffon avec Maven
  And celles des deux autres ne portent ni modification ni résolution, et restent un texte

Scenario: L'adoption est offerte quand la déclaration s'applique, et dit ce qu'elle écrit sur la machine
  Given une exigence obligatoire qu'aucun test ne discrimine après deux préparations, sur une cible Maven dont la recommandation porte une modification
  When la décision IH-04 est demandée
  Then l'option d'adopter le complément nomme pom.xml, le greffon et sa version, dit que le réseau s'ouvre pour cette seule étape, et dit que les fichiers téléchargés sont écrits dans le dépôt local que Maven désigne dès l'adoption et y restent si l'intégration est refusée
  And sur une cible dont la recommandation ne porte pas de modification, les options sont celles d'aujourd'hui

Scenario: L'adoption n'est pas offerte quand Maven n'annonce pas son dépôt local
  Given une cible Maven dont la recommandation porte une modification, et une commande hors ligne dans la copie qui n'annonce aucun dépôt local, ou qui échoue
  When la décision IH-04 est demandée
  Then les options sont celles d'aujourd'hui, et le rapport dit que le dépôt local de Maven n'a pu être établi
  And 495 ne se rabat sur aucun emplacement qu'il aurait supposé

Scenario: Adopter résout le greffon avec Maven, réseau ouvert pour cette seule étape
  Given une décision IH-04 en attente sur une cible Maven offrant l'adoption
  When le propriétaire répond « adopter le complément »
  Then une commande Maven s'exécute dans une copie confinée du projet dont le POM porte la déclaration, avec le réseau ouvert, la configuration Maven de la machine, et le dépôt local que Maven a annoncé pour cette copie comme seul endroit hors de la copie où elle écrit
  And elle résout le greffon et ses dépendances sans exécuter aucun but du greffon adopté
  And les contrôles, les interventions et toute autre étape gardent le réseau fermé

Scenario: Le protocole gelé porte le POM modifié, et le dossier dit ce que la résolution a ajouté
  Given une résolution réussie
  When la conception de la vérification reprend
  Then le protocole gelé porte pom.xml comme complément adopté, avec l'empreinte du fichier écrit
  And le dossier conserve la sortie de Maven, qui dit ce qu'il a téléchargé
  And la conception déclare le contrôle de couverture JaCoCo et le qualifie sur ses témoins, hors ligne, et le rapport ne liste plus le complément comme recommandé et non adopté

Scenario: La déclaration s'insère dans le POM octet pour octet, hors le texte inséré
  Given un pom.xml avec des commentaires, une indentation de quatre espaces et des plugins avant la fin de la section
  When 495 applique la modification
  Then le fichier obtenu diffère de l'ancien par les seuls octets du texte inséré
  And si le texte à remplacer n'est plus présent une seule fois, rien n'est appliqué et l'adoption n'est pas offerte

Scenario: Une résolution qui échoue n'adopte rien
  Given une décision IH-04 en attente, et une résolution qui échoue, faute de réseau, parce que le dépôt configuré refuse l'accès ou parce qu'il ne connaît pas la version
  When le propriétaire répond « adopter le complément »
  Then le dossier porte le motif de l'échec, le complément reste recommandé et non adopté au rapport
  And la décision IH-04 est demandée de nouveau sans l'issue d'adoption, et ni le projet ni le POM de la copie du candidat n'ont été modifiés

Scenario: Le motif d'une résolution qui échoue est la cause que Maven écrit, pas un avertissement de la JVM
  Given une résolution Maven qui échoue et dont la sortie d'erreur ne porte que des avertissements de la JVM, tandis que sa sortie standard dit « Could not transfer artifact … Connect to 127.0.0.1:9 failed », puis la même résolution qui échoue sur un dépôt qui refuse l'accès, puis sur un dépôt qui ne connaît pas la version
  When le propriétaire répond « adopter le complément »
  Then le motif écrit au dossier et montré au propriétaire reprend la fin de la sortie standard de Maven, où figure la cause de chacun des trois échecs, et ne reprend pas l'avertissement de la JVM
  And quand Maven n'écrit rien sur sa sortie standard, le motif reprend la fin de sa sortie d'erreur

Scenario: Une résolution qui écrit ailleurs que dans le dépôt local est refusée
  Given une résolution qui a modifié un fichier de la copie autre que pom.xml
  When 495 inspecte la copie
  Then le résultat est refusé, le motif nommant le fichier, et rien n'est adopté

Scenario: Le producteur ne défait pas l'adoption en remettant le POM de la référence
  Given un complément adopté sur pom.xml, un candidat qui garde le pom.xml tel que le complément l'a écrit, et un autre dont le producteur a remis le pom.xml de la référence
  When le noyau juge chacun à G4
  Then le premier passe, et le second est refusé en nommant pom.xml comme chemin protégé altéré

Scenario: La déclaration arrive dans le projet avec le candidat, à l'intégration
  Given un candidat accepté qui porte le complément adopté, et l'intégration locale acceptée
  When le candidat est intégré
  Then le commit local contient le pom.xml avec la déclaration de jacoco-maven-plugin, et aucun autre fichier que ceux du candidat
  And le projet n'a pas été écrit avant l'intégration, et rien n'est poussé

Scenario: Une révision des exigences défait l'adoption du POM, pas les fichiers du dépôt local
  Given un complément adopté, puis une révision des exigences
  When la conception de la vérification reprend
  Then le protocole ne porte plus le complément, la recommandation est présentée de nouveau et l'adoption est offerte de nouveau
  And les fichiers résolus restent dans le dépôt local que Maven désigne

Scenario: Dans un vrai Pi, adopter le greffon de couverture d'une cible Maven mène le changement à G5 avec un capteur de couverture
  Given une cible Maven sans JaCoCo, un agent scripté, déclaré comme tel, dont deux préparations ne retiennent aucun test discriminant, conduit dans un vrai Pi avec le dépôt Maven configuré sur la machine
  When le propriétaire répond « adopter le complément » à la décision IH-04, puis « assigner à une revue humaine » à la suivante
  Then le changement atteint G5 avec un contrôle de couverture JaCoCo dans son protocole, qui a tourné hors ligne, et le candidat porte le pom.xml modifié
  And un candidat dont le producteur remet le pom.xml de la référence est refusé à G4 en nommant pom.xml
  And sur la construction d'avant la story, la décision n'offre pas l'adoption d'un greffon et le protocole n'a pas de contrôle de couverture

## 3. Sécurité

- **Sortie de données.** C'est la deuxième étape de 495 qui ouvre le réseau (`D-76`, `e12s08`) : elle ne s'ouvre que
  pour la résolution du greffon, sur la réponse valide du propriétaire à la décision IH-04. 495 n'y choisit ni
  dépôt, ni miroir, ni identifiant : Maven les lit dans la configuration de la machine (`settings.xml`), comme pour
  n'importe quelle commande Maven du développeur, et un dépôt d'entreprise se traverse comme un dépôt public.
- **Intégrité des téléchargements.** Elle est celle que Maven et les dépôts configurés apportent (sommes de
  contrôle, signatures, politique du dépôt d'entreprise). 495 n'ajoute aucune vérification sur les artefacts
  téléchargés et ne refuse pas une résolution que Maven accepte. Le propriétaire a choisi le 2026-09-30 de laisser
  cette vérification aux outils et aux dépôts. Maven, à sa configuration par défaut, ne compare que des sommes
  SHA-1 et se contente d'avertir en cas d'écart : une machine qui veut plus le règle dans sa configuration Maven.
- **Écriture hors du projet, avant l'intégration.** Le dépôt local que Maven désigne est écrit dès l'adoption, avant
  que le propriétaire accepte l'intégration, et ce qui y est écrit y reste si le candidat est refusé, si les
  exigences sont révisées ou si l'adoption est défaite. C'est le fonctionnement normal du dépôt local de Maven, et le
  propriétaire le sait avant de répondre : l'option le dit. La résolution n'écrit rien d'autre hors de la copie, et
  l'inspection refuse un résultat qui a modifié un fichier de la copie autre que `pom.xml`.
- **Le dépôt local est celui de Maven, jamais celui de 495.** 495 ne le choisit pas, n'a pas d'emplacement par défaut
  et ne vérifie pas qu'il existe. Le confinement doit recevoir un chemin à permettre en écriture : 495 le lit dans la
  réponse de Maven (une commande hors ligne, dans la copie, sans greffon, qui annonce le dépôt local en tenant compte
  de la configuration de la machine et de celle du projet) et le remet tel quel au confinement. Quand Maven ne
  l'annonce pas, l'adoption n'est pas offerte : 495 ne se rabat sur aucun emplacement supposé. 495 ne relève pas le
  contenu du dépôt local.
- **Ce qui s'exécute réseau ouvert.** Maven et `maven-dependency-plugin`, à la version que le catalogue fixe, qui
  résout les greffons sans en exécuter aucun but. Le code du greffon adopté ne s'exécute qu'à la qualification et
  aux contrôles, réseau fermé, dans le confinement de la cible. Quand la résolution échoue, le motif du dossier est la
  fin de ce que Maven écrit sur sa sortie standard, où il dit la cause (réseau, accès refusé, version inconnue), et non
  de sa sortie d'erreur, où la JVM écrit ses avertissements : 495 n'interprète ni ne nomme aucune cause lui-même.
- **Provenance.** Le greffon, sa version et le texte inséré sont une donnée de l'adaptateur : aucun modèle, aucun
  contenu du projet ne les choisit.
- **Chemin protégé.** `pom.xml` reste protégé. La seule modification permise est celle dont l'empreinte est celle du
  fichier que le complément a écrit (mécanisme de `e12s06`) : le producteur ne peut ni la défaire ni la prolonger.
  La recette le vérifie sur cette cible.
- **Rien n'est écrit dans le projet avant l'intégration** que le propriétaire accepte : la modification du POM se
  fait dans des copies. Les fichiers du dépôt local n'entrent jamais dans le projet.

## 4. Tâches

### Tâche 1 — Le contrat accepte le gestionnaire Maven

`e12s08` a donné à une recommandation un champ d'installation (paquet, version, gestionnaire). Le gestionnaire peut
valoir `maven`. `npm run contracts` régénère le contrat publié.

- Vérifie : `node --test test/v0/contracts.test.ts`
- Tient : `test/v0/contracts.test.ts`, « given a recommendation installing with maven, then the schema accepts it, and given one installing with npm, then it still accepts it »
- Rouge : le schéma d'une recommandation refuse le gestionnaire `maven`, qui n'est pas dans la liste des gestionnaires

### Tâche 2 — Maven décrit la déclaration du greffon et sa résolution

La recommandation de couverture d'une cible Maven porte, quand le POM racine a une seule section `build/plugins` hors
profil et hors `pluginManagement`, la modification qui insère la déclaration de JaCoCo (texte exact qui n'apparaît
qu'une fois, remplacé par lui-même suivi de la déclaration) et la résolution du greffon avec Maven ; sinon elle ne
porte que du texte.

- Vérifie : `node --test test/v1/recommendations.test.ts`
- Tient : `test/v1/recommendations.test.ts`, « given a POM with one build plugins section, then the coverage recommendation carries the insertion of jacoco-maven-plugin 0.8.15 and its resolution with maven, and given none, or plugins only in a profile or in pluginManagement, then it carries neither »
- Rouge : la recommandation de couverture d'une cible Maven ne porte que du texte dans `change` : aucun champ ne décrit la modification du POM ni la résolution

### Tâche 3 — La déclaration s'insère dans le POM octet pour octet, ou pas du tout

La fonction qui applique la modification d'une recommandation sait aussi remplacer, dans `pom.xml`, un texte exact
présent une seule fois par ce même texte suivi de la déclaration, et rend le texte obtenu, ou rien quand le texte
n'est pas présent exactement une fois.

- Vérifie : `node --test test/v1/recommendations.test.ts`
- Tient : `test/v1/recommendations.test.ts`, « given a pom.xml with comments and four-space indentation, then the edited text differs from the original by the inserted declaration only, and given the anchor absent or present twice, then nothing is applied »
- Rouge : `applyScriptsTestEdit` ne lit que `scripts.test` d'un `package.json` et rend rien pour un `pom.xml`

### Tâche 4 — La résolution se planifie, et son résultat s'inspecte

Une fonction pure rend la commande Maven qui résout les greffons de la copie, à la version de `maven-dependency-plugin`
que le catalogue fixe et sans exécuter de but du greffon adopté. Une deuxième lit, dans la sortie de la commande hors
ligne qui l'annonce, le dépôt local de Maven, ou rend qu'il n'est pas établi. Une troisième inspecte la copie avant et après : elle
n'accepte qu'un `pom.xml` modifié comme la modification le voulait, et refuse tout autre fichier de la copie touché en
nommant le fichier.

- Vérifie : `node --test test/v1/installation.test.ts`
- Tient : `test/v1/installation.test.ts`, « given a maven recommendation, then the plan resolves the plugins of the copy with the pinned dependency plugin and runs no goal of the adopted plugin, given the output announcing a local repository, then that path is read as is, and given none, then it is not established, and given a copy where a file other than pom.xml changed, then the inspection refuses naming it »
- Rouge : le plan d'installation de `e12s08` ne connaît que npm, et rien ne lit un dépôt local dans une sortie de Maven ni n'inspecte un `pom.xml` : une résolution Maven ne se planifie ni ne s'inspecte

### Tâche 5 — L'étape s'exécute réseau ouvert et n'écrit hors de la copie que dans le dépôt local que Maven a annoncé

Avant l'étape, la commande hors ligne `mvn -X -o -B validate` s'exécute dans la copie, sans réseau ni écriture hors
d'elle, et son annonce du dépôt local est lue. L'étape de résolution de `e12s08` accepte alors le plan Maven : profil
qui ouvre le réseau, écrit la copie et ce chemin, remis tel quel, et laisse à Maven lire sa configuration. 495 ne relève
pas le contenu du dépôt : la sortie de Maven est conservée au dossier. Quand Maven n'annonce rien, l'étape ne s'exécute
pas. Les contrôles gardent le profil sans réseau.

- Vérifie : `node --test test/v1/installation.test.ts`
- Tient : `test/v1/installation.test.ts`, « given a maven plan and a copy whose maven announces a local repository, then the step runs with the network allowed and writes only the copy and that path as announced, and keeps maven's output, given no announcement, then the step does not run, while a control profile still denies the network »
- Rouge : le profil de l'étape n'écrit que la copie et un cache d'installation npm : Maven ne peut écrire dans son dépôt local, et aucun code n'interroge Maven sur ce dépôt

### Tâche 6 — L'option d'adoption est offerte pour une cible Maven, et dit ce qu'elle écrit sur la machine

L'ensemble des compléments adoptables compte ceux dont la modification de `pom.xml` s'applique et dont Maven annonce le
dépôt local ; le texte de l'option nomme le fichier, le greffon et sa version, dit que le réseau s'ouvre pour cette
seule étape, et que les fichiers téléchargés sont écrits dans le dépôt local que Maven désigne dès l'adoption et y
restent si l'intégration est refusée. Sinon l'option n'est pas offerte et le rapport dit le motif.

- Vérifie : `node --test test/v2/verifiability-arbitration.test.ts`
- Tient : `test/v2/verifiability-arbitration.test.ts`, « given a Maven target whose recommendation carries an applicable edit, then the decision offers to adopt the complement, its effect naming pom.xml, the plugin and version, the network and the local repository, and given a target whose edit does not apply or whose maven announces no local repository, then the options are today's and the report gives the reason »
- Rouge : `adoptableFiles` ne compte pas les recommandations d'une cible Maven : la décision de couverture n'offre jamais l'adoption

### Tâche 7 — L'adoption applique, résout, inspecte et gèle

Quand le propriétaire adopte, la conception applique la modification à `pom.xml` dans sa copie, exécute la résolution,
inspecte la copie, conserve le `pom.xml` dans le magasin d'objets, déclare le complément adopté et garde la sortie de
Maven au dossier, puis relit la pile : le contrôle JaCoCo se déclare et se qualifie. Une résolution qui échoue ou une
inspection qui refuse n'adopte rien : le dossier porte le motif, le complément reste recommandé et non adopté, et la décision est
reposée sans l'issue d'adoption.

- Vérifie : `node --test test/v2/verifiability-arbitration.test.ts`
- Tient : `test/v2/verifiability-arbitration.test.ts`, « given the answer adopt the complement on a Maven target, then the protocol carries pom.xml as an adopted complement, the record keeps maven's output and the JaCoCo control is declared qualified, and given a failing resolution or a refused inspection, then nothing is adopted, the record gives the reason and the decision is asked again without the adoption »
- Rouge : la réponse d'adoption applique les modifications de la seule famille `package.json` : sur une cible Maven elle ne résout rien, le protocole ne porte aucun complément et aucun contrôle de couverture ne se déclare

### Tâche 8 — La recette dans un vrai Pi, avec le dépôt Maven de la machine

La recette conduit une cible Maven sans JaCoCo, dans un vrai Pi, avec un agent scripté déclaré comme tel, jusqu'à G5 en
adoptant le complément. Elle lit la sortie de Maven conservée au dossier. Ses contrôles négatifs : un candidat
dont le producteur remet le `pom.xml` de la référence (refusé à G4), la construction d'avant la story (l'adoption
n'est pas offerte), et un POM dont les plugins sont tous dans un profil (l'adoption n'est pas offerte).

- Vérifie à la main : créer la cible de recette hors du dépôt, dans `~/.495-campagnes`, avec un POM sans JaCoCo ; lancer la campagne scriptée dans un vrai Pi jusqu'à la décision IH-04 et répondre « adopter le complément » ; lire le dossier, où le protocole porte le POM et la sortie de Maven au dossier, où le contrôle de couverture est qualifié hors ligne et où le changement atteint G5 ; rejouer avec un producteur qui remet le POM de la référence, puis sur la construction d'avant la story, puis avec un POM dont les plugins sont dans un profil
- Tient : `specs/verifications/`, « la preuve de la recette de e12s09 » nomme le dossier lu, la sortie de Maven et les trois contrôles négatifs
- Rouge : sur la construction d'avant la story, la décision n'offre pas l'adoption d'un greffon et le protocole n'a pas de contrôle de couverture

### Tâche 9 — Le motif d'une résolution Maven qui échoue est la cause que Maven écrit sur sa sortie standard

Quand la commande de résolution d'un plan Maven sort en erreur, le motif rendu par `runInstall` reprend la fin de la
sortie standard de Maven, et la fin de sa sortie d'erreur seulement quand la sortie standard est vide. Pour npm, qui
écrit ses erreurs sur la sortie d'erreur, le motif reste celui d'aujourd'hui. Le test joue un faux Maven qui écrit un
avertissement de la JVM sur la sortie d'erreur et sa cause sur la sortie standard, pour les trois causes : réseau
injoignable, accès refusé, version inconnue.

- Vérifie : `node --test test/v1/installation.test.ts`
- Tient : `test/v1/installation.test.ts`, « given a maven resolution that fails with a JVM warning on its error output and its cause on its standard output, then the reason carries the cause for an unreachable network, a refused access and an unknown version and not the warning, given an empty standard output, then the reason carries the error output, and given npm failing on its error output, then the reason is still that output »
- Rouge : `runInstall` compose le motif avec `tail(observed.stderr) || tail(observed.stdout)` : l'avertissement de la JVM rend la sortie d'erreur non vide, donc le motif d'un Maven en échec est cet avertissement et ne contient jamais « Could not transfer artifact » écrit sur la sortie standard

## 5. Hors périmètre

- La mutation (PIT), son greffon JUnit 5 dont la compatibilité avec JUnit 6 n'est pas établie, et la correction d'une
  déclaration PIT existante : une story à part, après celle-ci vérifiée par une exécution réelle.
- Un POM sans section `build/plugins` unique hors profil et hors `pluginManagement` : la recommandation reste un texte.
- Un `surefire` qui configure lui-même `argLine` sans `@{argLine}` : l'agent de JaCoCo n'est pas attaché, aucun rapport
  n'est écrit et le capteur ne se qualifie pas. C'est l'issue prévue : le dossier dit que le capteur n'est pas qualifié,
  et le complément reste adopté.
- Une vérification des artefacts téléchargés par 495 (signatures, sommes de contrôle, liste blanche de dépôts) : le
  propriétaire l'a confiée à Maven et aux dépôts configurés.
- Défaire l'écriture du dépôt local (nettoyage des fichiers résolus) après un refus, une révision ou une
  annulation : le dépôt local est celui de la machine, et le propriétaire le nettoie comme n'importe quel dépôt Maven.
- Un dépôt qui demande un mot de passe interactif ou un agent d'authentification : la résolution échoue et le dossier
  porte le motif.
- Un projet multi-modules : la déclaration s'insère dans le POM racine si son `build/plugins` l'accueille, et le rapport
  JaCoCo de chaque module est celui que le contrôle lit déjà ; la lecture agrégée d'un réacteur n'est pas examinée ici.
- Nommer une cause : 495 ne classe pas l'échec (réseau, accès, version) et ne traduit pas ce que Maven écrit ; le motif est la fin de sa sortie, telle quelle. Le motif d'un échec de la commande qui annonce le dépôt local, et celui d'un échec de npm, ne changent pas.
