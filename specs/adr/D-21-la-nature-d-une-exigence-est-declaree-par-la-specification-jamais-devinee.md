# D-21: La nature d'une exigence est déclarée par la spécification, jamais devinée

**Status:** Acceptée

**Décision.** Chaque exigence porte `satisfied_by_reference` : la référence exhibe déjà ce
comportement, ou elle ne l'exhibe pas. Le champ est produit par l'intervention de spécification, et
le noyau s'en sert pour décider si une préparation s'ouvre. Une sortie qui l'omet est normalisée à
`false`, donc vers l'ouverture d'une préparation.
**Motif.** Le noyau ne peut pas mesurer si la référence satisfait déjà une exigence : il faudrait
pour cela l'oracle dont l'absence est précisément le sujet. La distinction est pourtant décisive —
un refactoring dont l'exigence est le comportement inchangé est légitimement prouvé par une suite
verte, alors qu'un ajout de comportement ne peut l'être par aucun contrôle vert sur la référence.
Seul l'acteur qui lit la référence et rédige l'exigence peut trancher.
**Conséquence.** C'est une déclaration d'agent, donc une proposition et non une décision : le noyau
la vérifie ensuite par l'exécution, puisqu'une suite préparée pour une exigence déclarée nouvelle et
qui passe sur la référence n'est pas adoptée comme discriminante. Le défaut conservateur va vers le
travail supplémentaire, pas vers l'acceptation silencieuse.
