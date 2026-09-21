# D-30: Les témoins d'une cible Maven vivent dans un paquet

**Status:** Acceptée

**Décision.** Les six fichiers témoins écrits dans les workspaces de qualification d'une cible Maven
sont déclarés dans le paquet `witness495`, sous `src/main/java/witness495/` et
`src/test/java/witness495/`, au lieu du paquet par défaut.
**Motif.** Un moteur de mutation restreint par défaut les tests qu'il exécute aux paquets que
l'arbre de test déclare. Un test témoin hors de tout paquet n'est jamais exécuté : les mutants du
témoin positif ressortent alors `NO_COVERAGE`, le capteur échoue sur le tronc qu'il devrait laisser
passer, et sa qualification échoue pour une raison qui n'a rien à voir avec ce qu'il détecte.
**Conséquence.** Les constats des campagnes portent désormais le paquet dans leur chemin et dans
leur symbole. Le témoin structurel utilisait déjà ce paquet sous la racine de sources de son module.
