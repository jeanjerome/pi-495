# D-14: Qualification d'une préparation de tests

**Status:** Acceptée

**Décision.** Quand la référence ne contient aucun test dans les répertoires attendus de la stack,
G2 ouvre `preparing`. Le producteur de préparation ne peut écrire que sous ces répertoires. Le
noyau qualifie la suite proposée par trois faits : périmètre respecté, suite chargeable (elle
exécute au moins un test), et **discriminante** (elle échoue sur la référence, donc détecte la
fonctionnalité absente). Le mécanisme runner/parser est qualifié séparément avec un témoin positif
trivial et un témoin négatif injecté. Une suite qui passe déjà sur la référence est conservée comme
fait mais pas adoptée comme oracle discriminant. Deux préparations infructueuses bloquent en
`capability_missing`. Les fichiers adoptés deviennent des chemins protégés dont le contenu exact
est autorisé dans le candidat.
**Motif.** PRE-03 et SA-009/SA-010 : distinguer capteur opérationnel, test discriminant et produit
conforme.
**Limite.** La discriminance sémantique (le test couvre bien l'exigence) reste une affaire de
revue humaine ; P0 ne l'automatise pas.
