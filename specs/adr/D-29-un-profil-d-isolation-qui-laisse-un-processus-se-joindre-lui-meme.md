# D-29: Un profil d'isolation qui laisse un processus se joindre lui-même

**Status:** Acceptée

**Décision.** `SandboxProfile.network` prend une troisième valeur, `loopback`, entre `denied` et
`allowed`. Sous Seatbelt elle ouvre `network-bind`, `network-inbound` et `network-outbound` sur
`localhost` et rien d'autre ; sous bubblewrap elle est `--unshare-net`, dont l'espace de noms ne
contient qu'une boucle locale. Le contrôle de mutation est le seul à la demander.
**Motif.** Le moteur de mutation lance des JVM ouvrières et leur parle par socket. Sous
`(deny network*)` il échoue au démarrage : le contrôle serait livré inexécutable sur la seule cible
qualifiée. `allowed` serait disproportionné — ce serait accorder l'Internet à un contrôle qui a
besoin de se joindre lui-même.
**Conséquence.** La confinement que SEC-02 annonce est conservé : aucun autre hôte n'est joignable,
ce qu'un témoin de `v1/sandbox` vérifie en se connectant à lui-même puis ailleurs. Sur Linux les
deux valeurs donnent le même isolement, l'espace de noms réseau portant sa propre boucle locale ;
la nuance entre `denied` et `loopback` n'y est donc pas observable.
