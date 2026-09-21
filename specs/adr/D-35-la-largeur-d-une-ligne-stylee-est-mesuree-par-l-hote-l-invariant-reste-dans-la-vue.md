# D-35: La largeur d'une ligne stylée est mesurée par l'hôte, l'invariant reste dans la vue

**Status:** Acceptée

**Décision.** `SurfaceOptions.fit` reçoit de l'hôte la fonction qui mesure et complète une ligne à
une largeur annoncée ; `extension/review-command.ts` y passe `truncateToWidth` de `pi-tui`, celle
que Pi emploie pour toutes ses autres surfaces. La vue garde son implémentation par défaut, qui
ignore les séquences terminales, de sorte que l'invariant — toute ligne rendue occupe exactement la
largeur demandée — tienne sans dépendre de ce que l'hôte injecte.
**Motif.** `fit` comptait les points de code de la chaîne **déjà stylée** : chaque couleur ajoute
dix caractères invisibles, si bien qu'à 120 colonnes une ligne stylée n'en occupait que 110 et que
le séparateur des deux panneaux tombait à une colonne différente selon le nombre de styles portés
par la ligne. Aucun test ne pouvait le voir : le thème `PLAIN` des tests n'émet aucune séquence.
Le constat vient d'une observation dans un vrai terminal. La règle de couches interdit à
`presentation/` d'importer un paquet Pi — une vue liée à un composant ne serait plus rendue à
l'identique en RPC, en JSON et en print (ADR-010, UX-11) —, donc la mesure entre par là où les
styles entrent déjà : l'injection depuis `extension/`.
**Conséquence.** Ce que l'hôte apporte est un raffinement — graphèmes, largeurs est-asiatiques,
hyperliens OSC 8 — et non la correction elle-même. Ce qu'il rend par ailleurs — listes, défilement,
aide clavier — reste hors de la vue tant que `chantiers/I` n'a pas tranché ce que la règle de
couches protège. `v0/review-surface` éprouve l'invariant avec un
thème qui émet de vraies séquences : toute ligne rendue occupe la largeur annoncée, et le
séparateur tient une seule colonne.
