# Le propriétaire adopte un complément à installer pour une cible Node : le réseau s'ouvre à cette seule étape, et le résultat est inspecté et conservé

Story : e12s08
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible tourne sous vitest, sans fournisseur de couverture, reçoit de `e12s05` la recommandation
d'installer `@vitest/coverage-v8`, et il ne peut que la lire : la couverture des lignes introduites (`e12s04`) reste
« non mesurée » tant qu'il n'a pas installé le fournisseur lui-même, hors de 495, puis relancé le changement. `e12s06`
lui a ouvert l'adoption pour un complément qui n'est qu'une modification de fichier, et la lui refuse ici, parce que
celui-ci demande un réseau, un arbre de dépendances et un verrou.

Après la story, la décision « aucun test ne peut juger cette exigence » lui offre aussi d'adopter ce complément. Il
répond, et 495 installe le fournisseur, à la version du vitest que la cible a déjà installé, dans une copie du projet, en ouvrant le
réseau pour cette seule étape. 495 inspecte ensuite ce que l'installation a produit et n'accepte que ce qu'il sait
expliquer : des paquets ajoutés sans rien modifier de ce qui existait. Les dépôts, l'authentification et l'intégrité des
téléchargements sont ceux de npm et de sa configuration, sur la machine et dans le projet : 495 n'y substitue pas les siens. L'arbre installé est conservé
avec le dossier, la liste des paquets ajoutés y figure, et le complément entre dans le protocole gelé comme celui de
`e12s06`, présent dans chaque copie où un contrôle tourne (`e12s07`). Il arrive dans le projet avec le candidat, à
l'intégration que le propriétaire accepte : le commit local porte `package.json` et `package-lock.json`, jamais le code
d'une dépendance. Si l'installation ou l'inspection échoue, rien n'est adopté et le dossier dit pourquoi.

## 2. Promesses

Scenario: Une cible vitest sans fournisseur de couverture reçoit une recommandation qui demande une installation
  Given une cible dont scripts.test vaut « vitest run », avec vitest et package-lock.json, sans @vitest/coverage-v8
  When la pile est détectée
  Then la recommandation de couverture porte l'installation de @vitest/coverage-v8 à la version de vitest installée, avec npm comme gestionnaire
  And elle ne porte aucune modification de fichier

Scenario: L'adoption n'est offerte que lorsque l'installation peut se faire
  Given une exigence obligatoire qu'aucun test ne discrimine après deux préparations, sur trois cibles vitest sans fournisseur : l'une avec package-lock.json, l'une avec pnpm-lock.yaml seul, l'une sans aucun verrou
  When la décision IH-04 est demandée pour chacune
  Then seule la première offre d'adopter le complément, l'option nommant le paquet, sa version et le fait que le réseau s'ouvre pour cette seule étape
  And pour chacune des deux autres, les options sont celles d'aujourd'hui et le rapport dit pourquoi le complément ne s'installe pas

Scenario: Adopter installe le fournisseur dans une copie, réseau ouvert pour cette seule étape
  Given une décision IH-04 en attente sur une cible vitest offrant l'installation
  When le propriétaire répond « adopter le complément »
  Then une commande npm s'exécute dans une copie confinée du projet, avec le réseau ouvert et les scripts d'installation désactivés, et installe la version exacte de @vitest/coverage-v8 qui est celle de vitest
  And les contrôles, les interventions et toute autre étape gardent le réseau fermé

Scenario: Le protocole gelé porte l'arbre installé et la liste des paquets
  Given une installation acceptée par l'inspection
  When la conception de la vérification reprend
  Then le protocole gelé porte comme complément adopté package.json, package-lock.json et chaque fichier ajouté sous node_modules/, chacun avec son empreinte
  And il porte la liste des paquets installés, chacun avec son nom, sa version et son intégrité
  And la conception déclare le contrôle coverage de vitest et le qualifie sur ses témoins, et le rapport ne liste plus le complément comme recommandé et non adopté

Scenario: L'inspection accepte ce que l'installation a ajouté et rien de plus
  Given une installation qui n'a modifié que package.json, package-lock.json et node_modules/, sans toucher un fichier qui existait sous node_modules/ hors `node_modules/.package-lock.json`, la copie du verrou que npm y tient et réécrit à chaque installation, et dont package.json n'a gagné que l'entrée de @vitest/coverage-v8 à la version exacte
  When 495 inspecte le résultat
  Then le résultat est accepté, avec la liste des paquets ajoutés

Scenario: L'inspection refuse un résultat qui sort de ce cadre
  Given trois résultats d'installation : l'un qui modifie un fichier existant de node_modules/, l'un qui écrit un fichier hors de package.json, package-lock.json et node_modules/, l'un dont package.json a gagné une autre entrée que celle demandée
  When 495 inspecte chacun
  Then chacun est refusé, le motif nommant le fichier ou l'entrée fautive
  And rien n'est adopté et aucun fichier n'entre dans le protocole

Scenario: Une installation qui échoue n'adopte rien
  Given une décision IH-04 en attente, et une installation qui échoue, faute de réseau ou parce que le dépôt que npm désigne refuse la version
  When le propriétaire répond « adopter le complément »
  Then le dossier porte le motif de l'échec, le complément reste recommandé et non adopté au rapport
  And la décision IH-04 est demandée de nouveau sans l'issue d'adoption, et le projet du propriétaire n'a pas été écrit

Scenario: Le producteur ne défait pas l'arbre installé
  Given un complément adopté qui a écrit package.json, package-lock.json et node_modules/@vitest/coverage-v8/package.json, et trois candidats : l'un qui garde ces fichiers tels que le complément les a écrits, l'un qui supprime node_modules/@vitest/coverage-v8/package.json, l'un qui y modifie une ligne
  When le noyau juge chacun à G4
  Then le premier passe
  And le deuxième et le troisième sont refusés, le motif nommant node_modules/@vitest/coverage-v8/package.json comme chemin protégé altéré

Scenario: L'arbre installé arrive dans le projet, hors de l'historique
  Given un candidat accepté qui porte le complément installé, et l'intégration locale acceptée
  When le candidat est intégré
  Then le commit local contient package.json et package-lock.json et aucun chemin de node_modules/
  And node_modules/@vitest/coverage-v8 est dans le projet, et rien n'a été écrit dans le projet avant l'intégration, ni poussé

Scenario: Une révision des exigences défait l'adoption
  Given un complément installé adopté, puis une révision des exigences
  When la conception de la vérification reprend
  Then le protocole ne porte plus le complément, la recommandation est présentée de nouveau et l'adoption est offerte de nouveau

Scenario: Dans un vrai Pi, adopter le fournisseur de couverture d'une cible vitest mène le changement à G5 avec un capteur de couverture
  Given une cible vitest sans fournisseur, avec package-lock.json, et un agent scripté, déclaré comme tel, dont deux préparations ne retiennent aucun test discriminant, conduit dans un vrai Pi avec le dépôt que la configuration npm de la machine désigne
  When le propriétaire répond « adopter le complément » à la décision IH-04, puis « assigner à une revue humaine » à la suivante
  Then le changement atteint G5 avec un contrôle coverage dans son protocole, et le candidat porte package.json, package-lock.json et l'arbre installé
  And le dossier liste les paquets installés, et le nombre de fichiers de l'arbre et le temps d'ouverture d'une copie qui le porte sont relevés
  And sur la construction d'avant la story, la décision n'offre pas l'adoption d'une installation, et une cible avec pnpm-lock.yaml seul n'offre rien dans les deux constructions

## 3. Sécurité

- **Sortie de données.** C'est la première étape de 495 qui fait sortir du code vers le réseau (`D-76`). Elle ouvre le
  réseau à l'installation seule, avec un profil qui n'ouvre que le réseau : les écritures se limitent à la copie et
  au répertoire de cache que npm annonce. 495 ne choisit ni le dépôt, ni l'authentification, ni le cache : npm les lit
  dans sa configuration, celle de la machine et celle du projet, et un dépôt d'entreprise se traverse comme le dépôt
  public. 495 ne contacte rien d'autre : aucun pré-contrôle d'une base de paquets malveillants (le propriétaire l'a
  écarté le 2026-09-30) et aucun délai d'ancienneté de version (la version n'est pas choisie par 495, c'est celle de
  vitest, que le projet a déjà retenue).
- **Intégrité des téléchargements.** Elle est celle que npm et les dépôts configurés apportent (intégrité du verrou,
  politique du dépôt d'entreprise). 495 n'ajoute aucune vérification sur l'origine des paquets et ne refuse pas une
  installation que npm accepte : le propriétaire a confié cette vérification aux outils et aux dépôts (2026-09-30).
- **Provenance.** Le paquet et sa version sont une donnée de l'adaptateur : le paquet est nommé par le catalogue et la
  version est celle de vitest, lue dans la référence. Aucun modèle, aucun contenu du projet ne les choisit. L'étape
  ne s'exécute que sur la réponse valide du propriétaire à la décision IH-04.
- **Ce que l'installation peut atteindre malgré les scripts désactivés.** Les scripts d'installation ne s'exécutent
  pas. Le code des paquets installés s'exécutera plus tard, quand les contrôles de la cible chargent vitest et son
  fournisseur : à ce moment le réseau est fermé et le confinement des contrôles s'applique, comme pour tout code de
  la cible. Le propriétaire lit la liste des paquets installés avant d'accepter l'intégration.
- **Inspection.** Sur une cible Node dont le gestionnaire est npm, un résultat d'installation n'est accepté que
  s'il ne touche que `package.json`, `package-lock.json`, des fichiers de `node_modules/` qui n'existaient pas et `node_modules/.package-lock.json`, la copie du verrou que npm y tient et réécrit à chaque installation, et si
  `package.json` n'a gagné que l'entrée du paquet demandé, à la version exacte : ces bornes disent ce qui entre dans le
  candidat, non d'où viennent les paquets. pnpm, yarn et bun ne sont pas pris en charge : ils sont refusés en le
  disant.
- **Chemin protégé.** Tout l'arbre installé est un complément adopté : à G4 le producteur ne peut ni retirer un de ses
  fichiers, ni en modifier un, ni en ajouter un qu'un complément n'a pas écrit, sur toute cible. Le fichier qu'un
  complément a écrit et que le candidat n'a plus est refusé comme celui qu'il a modifié.
- **Rien n'est écrit dans le projet avant l'intégration** que le propriétaire accepte : l'installation se fait dans une
  copie. L'arbre installé arrive dans le projet avec le candidat, mais l'intégrateur ne l'indexe jamais (`e12s07`) :
  le code d'une dépendance n'entre pas dans l'historique du propriétaire.

## 4. Tâches

### Tâche 1 — Le contrat porte l'installation recommandée et les paquets installés

Une recommandation peut porter une installation (le paquet, la version, le gestionnaire), et le protocole gelé peut
porter la liste des paquets installés (nom, version, intégrité). Les deux champs sont optionnels : un protocole ou
un diagnostic gelé avant la story reste valide. `npm run contracts` régénère le contrat publié.

- Vérifie : `node --test test/v0-pure/contracts.test.ts`
- Tient : `test/v0-pure/contracts.test.ts`, « given a recommendation carrying an install and a protocol carrying installed packages, then the schema accepts them, and given neither, then it still accepts the protocol and the diagnosis »
- Rouge : le schéma d'une recommandation refuse un champ `install`, et celui du protocole refuse un champ `installed_packages`, comme propriétés inconnues

### Tâche 2 — Node décrit l'installation du fournisseur de couverture de vitest

La recommandation de couverture d'une cible vitest sans fournisseur porte l'installation de `@vitest/coverage-v8` à
la version de vitest installée, avec le gestionnaire npm, en plus du texte d'aujourd'hui, et aucune modification de
fichier.

- Vérifie : `node --test test/v1-adapters/recommendations.test.ts`
- Tient : `test/v1-adapters/recommendations.test.ts`, « given a vitest target without a coverage provider, then the coverage recommendation carries the install of @vitest/coverage-v8 at the installed vitest version with npm, and no file edit »
- Rouge : la recommandation de couverture d'une cible vitest ne porte que du texte dans `change` : aucun champ ne décrit le paquet, la version ni le gestionnaire

### Tâche 3 — L'installation se planifie, ou se refuse en disant pourquoi

Une fonction pure lit la liste des fichiers de la référence et rend soit la commande npm à exécuter (options
explicites : sans scripts d'installation, version exacte, dépendance de développement, sans audit ni message de
financement), soit le motif du refus : un verrou d'un autre gestionnaire, aucun `package-lock.json`.

- Vérifie : `node --test test/v1-adapters/installation.test.ts`
- Tient : `test/v1-adapters/installation.test.ts`, « given package-lock.json alone, then the plan is the npm command for the exact version, and given pnpm-lock.yaml, yarn.lock, bun.lock or no lock, then the plan is a refusal naming the file or its absence, and given a .npmrc, then the plan is still the npm command »
- Rouge : aucun code ne décide d'un gestionnaire de paquets : une cible avec un verrou pnpm ou sans verrou n'est distinguée d'aucune autre, et l'adoption d'une installation ne se refuse pour aucun motif

### Tâche 4 — L'inspection du résultat accepte l'ajout et refuse le reste

Une fonction pure compare l'inventaire de la copie avant et après l'installation, avec le `package.json` avant et après,
et rend soit la liste des paquets ajoutés (lue dans le verrou), soit le motif du refus qui nomme le fichier ou l'entrée fautive.

- Vérifie : `node --test test/v1-adapters/installation.test.ts`
- Tient : `test/v1-adapters/installation.test.ts`, « given an install that only added files, then the inspection returns the added packages, and given a modified existing node_modules file, a file outside package.json, package-lock.json and node_modules, or another entry in package.json, then it refuses naming the culprit »
- Rouge : aucune inspection n'existe : rien ne compare les fichiers ni `package.json` avant et après une installation, et un résultat qui modifie un fichier de `node_modules/` ne peut être refusé

### Tâche 5 — L'étape d'installation s'exécute confinée, réseau ouvert et lui seul

Avant l'étape, `npm config get cache` s'exécute dans la copie, hors ligne, et dit le répertoire de cache de npm en
tenant compte de la configuration de la machine et de celle du projet. La couche d'exécution exécute alors la commande
du plan dans la copie, avec un profil de confinement qui ouvre le réseau et n'écrit que dans la copie et ce répertoire,
remis tel quel ; npm lit lui-même sa configuration et son authentification. 495 ne choisit pas le cache, n'a pas
d'emplacement par défaut et ne vérifie pas qu'il existe. Les contrôles gardent le profil sans réseau.

- Vérifie : `node --test test/v1-adapters/installation.test.ts`
- Tient : `test/v1-adapters/installation.test.ts`, « given a plan, then the install runs under a profile allowing the network, writing only the copy and the cache directory as npm announced it, and a control profile still denies the network »
- Rouge : aucun appelant ne pose le profil `allowed` : toute commande d'une cible s'exécute avec le réseau fermé, aucun code n'interroge npm sur son cache et aucun code n'exécute d'installation

### Tâche 6 — L'option d'adoption est offerte quand le plan est une commande, et nomme le réseau

L'ensemble des compléments adoptables compte ceux dont l'installation se planifie ; l'option d'adoption nomme le
paquet, sa version et le fait que le réseau s'ouvre à cette seule étape. Quand le plan est un refus, l'option n'est
pas offerte et le rapport dit le motif.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given three vitest targets, one with package-lock.json, one with only pnpm-lock.yaml and one with no lock, then only the first offers to adopt the complement, naming the package, its version and the network, and the report gives the reason for the other two »
- Rouge : `adoptableFiles` ne compte que les recommandations qui portent une modification de fichier : une recommandation d'installation n'offre jamais l'adoption

### Tâche 7 — G4 refuse le fichier d'un complément que le candidat n'a plus

Un fichier qu'un complément a écrit, absent de la référence, et que le candidat ne contient plus, est un chemin
protégé altéré, nommé dans le motif du refus.

- Vérifie : `node --test test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/node-stack.test.ts`, « given a complement that wrote a file absent from the reference, then a candidate that no longer holds that file is refused naming it, and one that keeps it as written passes »
- Rouge : `protectedPathsChanged` ne relit que les fichiers de complément présents dans le candidat tels que la référence les a : un fichier ajouté par le complément puis supprimé par le producteur n'apparaît nulle part, et le candidat passe

### Tâche 8 — L'adoption installe, inspecte, conserve et gèle

Quand le propriétaire adopte une installation, la conception exécute l'étape dans sa copie, inspecte le résultat,
conserve chaque fichier ajouté dans le magasin d'objets, déclare package.json, package-lock.json et ces fichiers
comme compléments adoptés avec la liste des paquets, puis relit la pile : le contrôle coverage se déclare et se
qualifie. Une installation qui échoue ou une inspection qui refuse n'adopte rien : le dossier porte le motif, le
complément reste recommandé et non adopté, et la décision est reposée sans l'issue d'adoption. Le rapport liste les
paquets installés.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given the answer adopt the complement on a vitest target, then the protocol carries package.json, package-lock.json and the added node_modules files as complements with the installed packages and declares the coverage control qualified, and given a failing install or a refused inspection, then nothing is adopted, the record gives the reason and the decision is asked again without the adoption »
- Rouge : la réponse d'adoption n'écrit que les modifications de fichier des recommandations : sur une cible vitest, elle n'installe rien, le protocole ne porte aucun complément et aucun contrôle coverage ne se déclare

### Tâche 9 — L'arbre installé arrive dans le projet à l'intégration, hors du commit

Le candidat qui porte le complément installé est intégré : `package.json` et `package-lock.json` entrent dans le
commit local, `node_modules/` est copié dans le projet et jamais indexé.

- Vérifie : `node --test test/v2-kernel/export-integration.test.ts`
- Tient : `test/v2-kernel/export-integration.test.ts`, « given an accepted candidate carrying an installed complement, then the local commit holds package.json and package-lock.json and no node_modules path, and the installed provider is in the project »
- Rouge : aucun test ne porte un `node_modules/` à la racine du projet à l'intégration avec un candidat qui installe (défaut `T201000`) : le comportement de l'intégrateur sur cet arbre n'est observé nulle part

### Tâche 10 — La recette dans un vrai Pi, avec le vrai dépôt de paquets

La recette conduit une cible vitest sans fournisseur, avec `package-lock.json`, dans un vrai Pi, avec un agent
scripté déclaré comme tel, jusqu'à G5 en adoptant l'installation, puis relève le nombre de fichiers de l'arbre et le
temps d'ouverture d'une copie qui le porte. Le contrôle négatif rejoue une cible avec pnpm-lock.yaml seul (l'adoption n'est
pas offerte) et la construction d'avant la story (l'adoption d'une installation n'est pas offerte).

- Vérifie à la main : créer la cible de recette hors du dépôt, dans `~/.495-campagnes`, avec vitest installé sans fournisseur de couverture ; lancer la campagne scriptée dans un vrai Pi jusqu'à la décision IH-04 et répondre « adopter le complément » ; lire le dossier, où le protocole porte les compléments et la liste des paquets, où le contrôle `coverage` est qualifié et où le changement atteint G5 ; relever le nombre de fichiers de l'arbre et le temps d'ouverture d'une copie ; rejouer avec une cible dont le verrou est pnpm-lock.yaml seul, puis sur la construction d'avant la story
- Tient : `specs/verifications/`, « la preuve de la recette de e12s08 » nomme le dossier lu, les paquets installés, la mesure et les deux contrôles négatifs
- Rouge : sur la construction d'avant la story, la décision n'offre pas l'adoption d'une installation et le protocole n'a pas de contrôle `coverage`

## 5. Hors périmètre

- Un pré-contrôle du paquet auprès d'une base publique de paquets malveillants, et un délai d'ancienneté avant d'installer
  une version récente : le propriétaire les a écartés le 2026-09-30 pour cette story, la version étant celle de vitest
  que le projet a déjà retenue. Ils se rouvrent avec un catalogue qui fixe lui-même des versions.
- Un gestionnaire autre que npm (pnpm, yarn, bun) et un projet sans `package-lock.json` : refusés en le disant.
- Une vérification par 495 de l'origine ou de l'intégrité des paquets, du dépôt utilisé ou de l'authentification : le
  propriétaire l'a confiée à npm et aux dépôts configurés.
- Un complément Maven, déclaré au POM et résolu dans le dépôt local de la machine : `e12s09`.
- Stryker, qui demande le profil `loopback` et se lance depuis l'arbre installé : `e12s10`.
- L'installation d'un autre paquet que `@vitest/coverage-v8` : le catalogue n'en nomme pas d'autre à installer
  (mocha et jest : 495 ne lit pas leur couverture).
- Un `node_modules/` sous un paquet d'espace de travail (`packages/a/node_modules/`) : le chemin protégé et l'installation
  sont ceux de la racine du projet.
- Le passage du même paquet de développement à une version plus récente une fois adopté, et défaire l'adoption après
  l'intégration : le propriétaire les fait comme toute modification de son dépôt.
- Le fournisseur `istanbul` : le contrôle le préfère après `v8` s'il est installé, mais 495 n'installe que `v8`.
