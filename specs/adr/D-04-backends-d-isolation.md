# D-04: Backends d'isolation

**Status:** Acceptée

**Décision.** Deux backends sont implémentés derrière `SandboxPort` : `seatbelt` (macOS,
`/usr/bin/sandbox-exec` avec un profil généré par mandat) et `bubblewrap` (Linux, `bwrap`).
Un troisième backend `unconfined` existe uniquement pour les tests V0–V2 et doit être demandé
explicitement par la politique (`isolation.allow_unconfined = true`) ; il déclare
`SEC-02`/`SEC-03` comme non satisfaites et est refusé pour tout mandat `implement`, `verify` ou
`integrate` dans un profil de production.
**Motif.** ADR-013 impose le fail closed ; `sandbox-exec` est le seul mécanisme disponible sans
installation supplémentaire sur macOS arm64, et bubblewrap est le choix courant sur Linux.
**Conséquence.** `qualify()` retourne les capacités effectivement applicables ; Linux n'a pas pu
être exécuté sur la machine de référence et reste annoncé non qualifié.
