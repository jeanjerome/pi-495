# D-31: Linux x86-64 n'est pas une plateforme revendiquée

**Status:** Acceptée

**Décision.** Le backend `bubblewrap` reste dans les sources, et sa qualification échoue sur toute
machine, y compris une machine Linux munie de `bwrap`. La raison en est nommée dans le résultat :
`Linux is not a claimed platform of this package`. Il n'y a pas d'état intermédiaire entre
« qualifié » et « non revendiqué » ; la sélection d'un backend non qualifié refuse tout rôle confiné
avec `capability_missing`.
**Motif.** `MILESTONES.md` §7 pose qu'une campagne exécutée une fois qualifie cette exécution, pas
la combinaison de pile et de plateforme. La seule machine Linux disponible est un conteneur, où
`bwrap` ne crée d'espace de noms qu'en `--privileged` — c'est-à-dire dans un environnement qui a
retiré la frontière que la mesure devait constater. Qualifier là serait mesurer le confinement dans
un contexte qui n'en a plus.
**Conséquence.** Les sorties annoncées ne mentionnent plus Linux comme plateforme supportée.
`NFR-05` est non satisfaite et déclarée telle. Le code du backend est conservé parce qu'il est le
point de départ de la campagne qui le qualifierait, et il reste exercé par `v1/sandbox` sur ce
qu'un test peut établir sans Linux : son refus.
