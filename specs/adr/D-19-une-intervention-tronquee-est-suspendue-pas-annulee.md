# D-19: Une intervention tronquée est suspendue, pas annulée

**Status:** Acceptée
**Note:** l'identifiant D-19 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « Vocabulaire d'états de suivi sans effet sur la machine à états ». Le défaut est conservé tel quel, non résolu.

**Décision.** Une session arrêtée par `intervention_ms` est enregistrée `truncated`, jamais
`completed`. Tant que `max_continuations` n'est pas atteint, le producteur reprend **sur son propre
workspace**, dans la même tentative : aucun budget de tentative n'est consommé et rien n'est
reconstruit depuis la référence. Le budget d'incrément (`increment_ms`) borne l'ensemble.
**Motif.** Le plafond de durée doit borner le coût, pas détruire le travail. Une tentative repartant
d'une copie neuve de la référence perdait tout ce que la précédente avait écrit, et un candidat gelé
au milieu d'une édition était jugé comme une proposition finie.
**Conséquence.** `intervention_ms` se règle selon le modèle (`policy.budgets` dans `config.json`) :
un modèle local lent demande une durée plus large ou davantage de continuations, sans que le choix
change la sémantique.
