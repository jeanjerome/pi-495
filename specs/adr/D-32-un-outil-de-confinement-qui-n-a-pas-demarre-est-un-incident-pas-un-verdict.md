# D-32: Un outil de confinement qui n'a pas démarré est un incident, pas un verdict

**Status:** Acceptée

**Décision.** Quand `sandbox-exec` ou `bwrap` échoue avant d'exécuter la commande, l'observation
devient un `spawn_error` avec `exit_code: null`, donc un incident rendant `INDETERMINATE`, au lieu
du code de sortie de l'outil. Les deux backends passent par la même fonction, `startupIncident`.
**Motif.** Sur Linux, l'échec de `bwrap` ressortait en « le runner a quitté avec 1 sans émettre de
résumé TAP » : le refus fail closed avait bien lieu, mais il accusait le harnais de test de la
cible d'un défaut qui était celui de la machine. Un lecteur y aurait cherché un bug qui n'existait
pas.
**Conséquence.** `RM-016` est respectée dans les deux sens : une restriction qui ne peut être
garantie ne produit pas de mesure, et une mesure absente n'est pas comptée comme un échec. Le
discriminant est la sortie standard d'erreur, que l'outil de confinement est seul à avoir écrite
quand la commande n'a pas démarré.
