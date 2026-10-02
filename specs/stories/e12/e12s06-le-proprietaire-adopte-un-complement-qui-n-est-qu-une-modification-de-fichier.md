# Le propriétaire adopte un complément qui n'est qu'une modification de fichier, et la modification fait partie du candidat

Story : e12s06
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible `node --test` n'a pas de couverture reçoit, par `e12s05`, la recommandation
d'ajouter `--experimental-test-coverage` à `scripts.test`, et il ne peut que la lire : il lui faut ouvrir son
`package.json`, y faire la modification, puis relancer le changement, dont la référence est figée à son
démarrage.

Après la story, la décision « aucun test ne peut juger cette exigence » lui offre, pour un complément qui n'est
qu'une modification de fichier, une issue de plus : l'adopter. 495 applique alors la modification exacte que la
recommandation décrit, sans réseau et sans rien installer. Le protocole gelé compte le capteur de couverture
que cette modification demande, et la modification fait partie du candidat : elle arrive dans le projet avec
lui, à l'intégration que le propriétaire accepte, comme tout le reste. Adopter un complément n'est pas juger
l'exigence, qui reste à préparer, à assigner ou à réviser : la question est reposée sans cette issue quand
l'exigence reste sans juge. Les compléments qui demandent une installation, avec le réseau ouvert, sont
`e12s08` et `e12s09`.

## 2. Promesses

Scenario: Une recommandation qui n'est qu'une modification de fichier porte cette modification
  Given un package.json dont scripts.test vaut « node --test », puis un dont scripts.test vaut « node --test test/ »
  When la pile de chacun est détectée
  Then la recommandation de couverture porte la modification de package.json qui remplace la valeur de scripts.test par elle-même suivie de --experimental-test-coverage
  And une cible sans scripts.test, ou dont la recommandation demande une installation, ne porte aucune modification

Scenario: La décision d'arbitrage offre d'adopter un complément quand une modification est possible
  Given une exigence obligatoire qu'aucun test ne discrimine après deux préparations, sur une cible dont la recommandation porte une modification de fichier
  When la décision IH-04 est demandée
  Then ses options sont préparer, assigner à une revue humaine, réviser, et adopter le complément, cette dernière nommant le fichier qu'elle modifie et disant qu'elle ne juge pas l'exigence
  And sur une cible dont aucune recommandation ne porte de modification, les options sont celles d'aujourd'hui

Scenario: Adopter le complément fait entrer le capteur dans le protocole gelé
  Given une décision IH-04 en attente sur une cible node --test dont scripts.test vaut « node --test »
  When le propriétaire répond « adopter le complément »
  Then la conception de la vérification déclare le contrôle coverage et le qualifie sur ses témoins
  And le protocole gelé porte le complément adopté, avec le fichier, l'empreinte du fichier modifié et l'outil recommandé
  And le rapport ne liste plus ce complément comme recommandé et non adopté

Scenario: La modification s'applique au fichier octet pour octet, hors la valeur remplacée
  Given un package.json de deux espaces d'indentation, avec des clés avant et après scripts, et la modification recommandée
  When 495 l'applique
  Then le fichier obtenu diffère de l'ancien par les seuls octets de la valeur de scripts.test
  And si la valeur actuelle n'est pas celle que la recommandation décrit, ou si scripts.test apparaît deux fois, rien n'est appliqué et l'adoption n'est pas offerte

Scenario: La modification fait partie du candidat sans que le producteur y touche
  Given un protocole gelé qui porte un complément adopté sur package.json
  When une tentative d'implémentation s'ouvre
  Then le workspace du candidat porte le package.json modifié avant que le producteur ne lise quoi que ce soit
  And le candidat n'est pas refusé à G4 pour ce chemin protégé, et un workspace ouvert avant l'adoption n'est pas réutilisé

Scenario: Seule la modification adoptée est permise sur ce chemin protégé
  Given un complément adopté sur package.json, et deux candidats : l'un qui garde ce fichier tel que le complément l'a écrit, l'autre qui y modifie une autre ligne
  When le noyau juge chacun à G4
  Then le premier passe, le second est refusé en nommant package.json comme chemin protégé modifié

Scenario: Le producteur ne défait pas l'adoption en remettant le fichier de la référence
  Given un complément adopté sur package.json, et un candidat dont le producteur a réécrit dans son workspace le package.json d'origine, octet pour octet
  When le noyau juge ce candidat à G4
  Then l'événement gate.decided G4 est FAIL, avec le motif « protected path altered by the producer: package.json »
  And le candidat n'est pas accepté, et aucun commit d'intégration n'est produit sans le complément que le protocole gelé porte

Scenario: La modification arrive dans le projet avec le candidat, à l'intégration
  Given un candidat accepté par le propriétaire qui porte le complément adopté, et l'intégration locale acceptée
  When le candidat est intégré
  Then le commit local de la branche contient le package.json avec --experimental-test-coverage dans scripts.test
  And rien n'a été écrit dans le projet avant l'intégration, et rien n'est poussé

Scenario: Une révision des exigences défait l'adoption
  Given un complément adopté, puis une révision des exigences
  When la conception de la vérification reprend
  Then le protocole n'en porte plus, la recommandation est présentée de nouveau et l'adoption est offerte de nouveau

Scenario: Adopter un complément ne juge pas l'exigence
  Given un complément adopté et une exigence que le nouveau capteur ne rend pas jugeable
  When la conception de la vérification atteint de nouveau l'arbitrage
  Then la décision IH-04 est demandée de nouveau, sans l'issue d'adoption puisque le complément est en place

Scenario: Dans un vrai Pi, adopter le drapeau de couverture mène le changement à G5 avec un capteur de couverture
  Given une cible dont scripts.test vaut « node --test » et un agent scripté, déclaré comme tel, dont deux préparations ne retiennent aucun test discriminant, conduit dans un vrai Pi
  When le propriétaire répond « adopter le complément » à la décision IH-04, puis « assigner à une revue humaine » à la suivante
  Then le changement atteint G5 avec un contrôle coverage dans son protocole, et le candidat porte package.json modifié
  And sur la construction d'avant la story, la décision n'offre pas l'adoption et le protocole n'a pas de contrôle coverage

## 3. Sécurité

- **Provenance.** La modification est une donnée de l'adaptateur, décrite par la recommandation ; aucun modèle
  ne la propose, aucun contenu du projet ne la choisit. Elle ne s'applique que sur la réponse valide du
  propriétaire à la décision IH-04, par le dialogue de Pi, comme les autres réponses.
- **Chemin protégé.** `package.json` reste protégé. La seule modification permise est celle dont l'empreinte est
  celle du fichier que le complément a écrit : le producteur ne peut ni la défaire ni la prolonger. Un candidat
  dont `package.json` est redevenu, octet pour octet, celui de la référence a défait l'adoption : il est refusé à
  G4 en nommant `package.json`, comme celui qui y modifie une autre ligne, et non accepté sans le complément que
  le protocole gelé porte. L'exception disparaît avec la réponse qui l'a permise.
- **Rien n'est écrit dans le projet avant l'intégration** que le propriétaire accepte. Aucun réseau, aucune
  installation, aucun fichier autre que celui que la modification nomme.
- La modification remplace une valeur exacte du fichier, hors laquelle il reste octet pour octet ce qu'il était,
  pour que le diff que le propriétaire lit à l'acceptation ne montre que cette ligne.

## 4. Tâches

### Tâche 1 — Le contrat porte la modification et le complément adopté

Une recommandation peut porter une modification de fichier (le chemin, la valeur actuelle, la valeur voulue), et
le protocole gelé peut porter les compléments adoptés (le chemin, l'empreinte du fichier écrit, le type de test
et l'outil). Les deux champs sont optionnels : un protocole ou un diagnostic gelé avant la story reste valide.
`npm run contracts` régénère le contrat publié.

- Vérifie : `node --test test/v0-pure/contracts.test.ts`
- Tient : `test/v0-pure/contracts.test.ts`, « given a recommendation carrying a file edit and a protocol carrying an adopted complement, then the schema accepts them, and given neither, then it still accepts the protocol and the diagnosis »
- Rouge : le schéma d'une recommandation refuse un champ `edit`, et celui du protocole refuse un champ `complements`, comme propriétés inconnues

### Tâche 2 — Node décrit la modification de `scripts.test`

Pour une cible `node --test` dont `scripts.test` existe, la recommandation de couverture porte la modification qui
suffixe la valeur par `--experimental-test-coverage`. Sans `scripts.test`, ou pour une recommandation qui demande
une installation, elle n'en porte aucune.

- Vérifie : `node --test test/v1-adapters/recommendations.test.ts`
- Tient : `test/v1-adapters/recommendations.test.ts`, « given scripts.test node --test and node --test test/, then the coverage recommendation carries the edit suffixing the value, and given no scripts.test or a vitest provider to install, then it carries none »
- Rouge : la recommandation de couverture d'une cible node:test ne porte que du texte : aucun champ ne décrit la modification que le propriétaire devrait faire

### Tâche 3 — La modification s'applique octet pour octet, ou pas du tout

Une fonction pure applique la modification à un `package.json` : elle remplace la valeur de `scripts.test` par la
valeur voulue et rend le texte obtenu, ou rien quand la valeur actuelle n'est pas celle que la modification
décrit ou que la clé apparaît deux fois.

- Vérifie : `node --test test/v0-pure/complement.test.ts`
- Tient : `test/v0-pure/complement.test.ts`, « given a package.json of two-space indentation with keys before and after scripts, then the result differs from the original by the bytes of the scripts.test value only », « given a current value the edit does not describe, then nothing is applied » et « given scripts.test appearing twice, then nothing is applied »
- Rouge : aucun module n'applique une modification à un fichier de la cible : le noyau n'écrit aucun fichier du projet ni de ses copies en dehors des fichiers préparés

### Tâche 4 — La décision offre d'adopter quand une modification est possible

Le constructeur de demandes de décision reçoit, pour IH-04, les compléments adoptables, et ajoute l'issue « adopter
le complément » qui nomme le fichier modifié et dit qu'elle ne juge pas l'exigence. Sans complément adoptable, les
options sont celles d'aujourd'hui.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an IH-04 on a target whose recommendation carries an edit, then the options are prepare, assign_review, revise and adopt_complement naming package.json and saying it does not judge the requirement, and without an adoptable complement the options are those of today »
- Rouge : `buildDecisionRequest` ne connaît pour IH-04 que les trois options `prepare`, `assign_review` et `revise`, quelle que soit la cible

### Tâche 5 — Adopter fait entrer le capteur et le complément dans le protocole

Sur la réponse valide « adopter le complément », la conception de la vérification applique la modification à la
copie où elle détecte la pile, range le fichier écrit dans le magasin d'objets, déclare et qualifie le contrôle que
la modification demande, et gèle le protocole avec le complément adopté. Le rapport ne liste plus ce complément
comme recommandé et non adopté.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts test/v0-pure/engineering-report.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an IH-04 answered adopt_complement on a node --test target, then the frozen protocol declares the coverage control, carries the adopted complement with the file and its digest, and G2 passes » ; `test/v0-pure/engineering-report.test.ts`, « given a protocol carrying an adopted complement, then the report does not list it as recommended and not adopted »
- Rouge : `designVerification` ne lit aucune réponse d'adoption : la détection se fait sur la référence nue, le contrôle coverage n'est jamais déclaré pour une cible node:test, et le protocole ne porte aucun complément

### Tâche 6 — La modification fait partie du candidat

L'ouverture d'une tentative d'implémentation écrit dans le workspace du candidat les fichiers des compléments du
protocole gelé, comme elle écrit les fichiers préparés ; un workspace ouvert avant l'adoption n'est pas réutilisé.

- Vérifie : `node --test test/v2-kernel/harness.test.ts`
- Tient : `test/v2-kernel/harness.test.ts`, « given a frozen protocol carrying an adopted complement, then a new attempt's workspace carries the modified package.json before the producer reads anything, and a workspace opened before the adoption is not reused »
- Rouge : `implement` ne remet dans le workspace que les fichiers de la préparation adoptée, si bien que le `package.json` du candidat est celui de la référence et que le contrôle coverage n'a aucun fichier à lire

### Tâche 7 — Seule la modification adoptée est permise sur `package.json`

À G4, un chemin protégé dont le fichier a l'empreinte du complément adopté n'est pas une modification refusée ; toute
autre modification de ce fichier l'est.

- Vérifie : `node --test test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/node-stack.test.ts`, « given an adopted complement on package.json, then a candidate keeping that file as the complement wrote it is allowed, and one modifying another line is refused naming package.json »
- Rouge : `protectedPathsChanged` ne reçoit que les fichiers de la préparation : `package.json` modifié par le complément est refusé comme chemin protégé altéré, et le candidat ne passe pas G4

### Tâche 8 — Une révision des exigences défait l'adoption

La réponse d'adoption suit le sort des autres réponses à IH-04 : une révision des exigences la révoque, le protocole
suivant ne porte plus le complément et la recommandation est présentée de nouveau.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an adopted complement then a revision of the requirements, then the next protocol carries none, the recommendation is presented again and adoption is offered again »
- Rouge : aucune réponse d'adoption n'existe : la révision n'a rien à révoquer, et un complément écrit au protocole survivrait à la réponse qui l'a permis

### Tâche 9 — Adopter ne juge pas l'exigence

Quand l'exigence reste sans juge après l'adoption, la décision est reposée sans l'issue d'adoption, puisque plus aucun
complément adoptable ne manque.

- Vérifie : `node --test test/v2-kernel/verifiability-arbitration.test.ts`
- Tient : `test/v2-kernel/verifiability-arbitration.test.ts`, « given an adopted complement and a requirement the new sensor does not make judgeable, then IH-04 is asked again with prepare, assign_review and revise only »
- Rouge : les options d'IH-04 sont fixes et aucune réponse ne modifie la cible : la question reposée offrirait les mêmes issues, dont une adoption déjà faite

### Tâche 10 — Le producteur ne défait pas l'adoption en remettant le fichier de la référence

À G4, un fichier de complément adopté que le candidat ne change pas par rapport à la référence est refusé comme chemin
protégé altéré : le complément est absent du candidat, et le protocole gelé le porte. Le fichier gardé tel que le
complément l'a écrit reste permis.

- Vérifie : `node --test test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/node-stack.test.ts`, « given an adopted complement on package.json, then a candidate whose package.json is unchanged from the reference is refused naming package.json, and one keeping the file as the complement wrote it is still allowed »
- Rouge : `protectedPathsChanged` ne juge que les entrées dont `baseline_state` n'est pas `unchanged` : un `package.json` remis à la référence octet pour octet n'est ni dans `changed` ni dans `altered`, si bien que `altered` reste vide au lieu de nommer `package.json`, et que `evaluateG4` rend PASS

## 5. Hors périmètre

- Un complément qui demande une installation, avec le réseau ouvert : l'arbre installé se conserve et se remet sans
  réseau, un gestionnaire de paquets se détecte, un verrou se vérifie. C'est `e12s08` pour Node. Le fournisseur de
  couverture de vitest n'est donc pas adoptable ici.
- Un complément Maven, qui demande une ligne du POM et des jars dans le dépôt local de la machine : `e12s09`.
- Une modification qui ajoute une clé absente (une cible sans `scripts.test`) : elle dépend de la mise en forme du
  fichier et n'est pas offerte ; la recommandation reste un texte.
- Des chemins protégés qui suivent le besoin de chaque phase en général : cette story ne lève la protection que pour
  l'empreinte exacte d'un complément adopté. Une règle plus large se rouvre avec l'installation.
- Défaire un complément adopté après l'intégration : le propriétaire le défait comme toute modification de son
  dépôt.
- Les fichiers de la préparation adoptée : l'écart ne porte que sur le fichier d'un complément que le producteur
  remet à la référence ; le sort d'un fichier préparé qu'il défait n'est pas examiné ici.
- Le refus explicite d'un complément : refuser, c'est choisir une autre issue ; le rapport dit déjà que le complément
  n'est pas adopté (`e12s05`).
