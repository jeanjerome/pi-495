# D-01: Node 24 et `node:sqlite` comme moteur de stockage

**Status:** Acceptée

**Décision.** Le journal SQLite utilise le module intégré `node:sqlite` (`DatabaseSync`) au lieu
d'un binding natif tiers (`better-sqlite3`, `sqlite3`).
**Motif.** Pi 0.85.1 est exécuté par Node (shebang `#!/usr/bin/env node`, Node 24.21 sur la machine
de référence). Un binding natif imposerait une compilation à l'installation du package et une
matrice binaire par plateforme ; `node:sqlite` est livré avec le runtime déjà qualifié avec Pi.
**Conséquence.** `engines.node >= 24`. Une distribution Pi exécutée par Bun (binaire compilé) n'est
pas un profil qualifié ; le package le détecte au chargement et annonce `capability_missing`.
