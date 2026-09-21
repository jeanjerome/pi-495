# D-16: Trajectoire à un incrément par défaut

**Status:** Acceptée

**Décision.** `/495 start` crée un programme avec un incrément unique. L'agrégat Programme
(DAG, jalons, éligibilité, verdict global) est implémenté et testé, mais la décomposition d'un
besoin complet en plusieurs incréments par intervention n'est pas automatisée en P0 ; elle se fait
par une trajectoire adoptée explicitement (`trajectory.adopt`).
**Conséquence.** PRG-03/PRG-04/PRG-05 sont livrés au niveau du noyau et du stockage ; le parcours
multi-incréments piloté par Pi reste à qualifier (voir STATUS).
