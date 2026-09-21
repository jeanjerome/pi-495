# D-07: Parsers de rapports P0

**Status:** Acceptée

**Décision.** Le runner générique livre trois interpréteurs qualifiés : `exit-code` (contrat
0 → PASS, autre → FAIL, timeout/spawn error → INDETERMINATE), `node-test-json` (sortie
`--test-reporter=spec`/`tap` de `node:test` réduite au comptage), `junit-xml` (rapports Surefire /
JUnit). Tout autre format est refusé (`capability_missing`).
**Motif.** Couvrir F-TS (`node --test`) et F-JAVA (Maven Surefire) avec un contrat commun.
**Conséquence.** INDETERMINATE est réservé à la dimension incident — erreur de lancement, timeout,
signal — c'est-à-dire aux seuls cas où une réexécution à l'identique peut répondre autrement. Une
sortie non nulle qu'aucun échec de test n'explique (erreur de compilation, plugin en échec, module
que le réacteur n'a jamais atteint) est un FAIL : c'est une propriété reproductible de l'arbre gelé,
et les lignes d'erreur du build deviennent des constats.
