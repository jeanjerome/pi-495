# D-47: Prompts et contexte restent un seul epic, élargi à la phase et au modèle

**Status:** Acceptée
**Date:** 2026-09-21

**Décision.** `e04` absorbe les deux axes neufs — sélection des instructions selon la phase en
cours, et selon les capacités déclarées du modèle — au lieu qu'un second epic soit ouvert à côté.
`CTX-03` sort du différé et remonte avec lui. Aucun identifiant `CMP-*` nouveau n'est réclamé. La
position de `e04` dans l'index ne change pas. Son `job_size` passe de 5 à 7, et son WSJF de 4,0 à
2,86.

**Motif.** Un seul module est visé. `src/application/context.ts` (`CMP-CTX`) est déjà le
constructeur centralisé des invites et du contexte — « Everything an intervention is handed is
composed here and nowhere else » — déjà par rôle, déjà avec manifeste empreinté, budget d'entrée
compté et schéma de sortie. Les deux axes portent sur sa sélection, pas sur un objet nouveau :
`CTX-01` demande « rôle **et** phase » alors que `buildContext` ne reçoit que le rôle et un objectif
interpolé, et `CTX-03` nomme les skills, modèles de prompts et références documentaires comme des
ressources versionnées, c'est-à-dire la matière que ce même constructeur assemble. Deux epics
produiraient deux plans qui éditent la même fonction, chacun ignorant l'autre.

**Conséquence.** Aucune écriture n'est due au catalogue de `specs/archive/amont/conception-technique.md`
§4.1, puisqu'aucun composant n'est créé. `CTX-03` quitte la liste des exigences différées du
périmètre et devient la seule exigence non couverte que `e04` ferme. L'axe modèle reste sans objet
tant qu'un seul fournisseur est qualifié — des variantes indexées sur les capacités déclarées n'ont
rien à distinguer —, ce qui le rend tributaire de `e23` (`D-46`). Le `job_size` croît parce que
l'objet de l'epic a grandi, non pour déplacer un rang : `e04` garde la place que la ROADMAP lui
donne en le tenant pour la cause de `e03`.

**Alternative rejetée.** Séparer le corpus d'instructions du constructeur de manifeste, et en faire
un composant distinct avec son propre identifiant `CMP-*`. Elle aurait exigé une ligne au catalogue
dans le même changement, et laissé malgré tout deux plans travailler au même point d'entrée.

**Limite.** Les variantes se rattachent aux capacités déclarées d'un modèle, jamais à son nom
(`AGT-01`). Indexer sur un nom produirait une table à tenir à jour à chaque version de catalogue
d'un fournisseur, et un défaut silencieux pour tout modèle absent de la table.
