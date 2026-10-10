# Un contournement de la section Sécurité retient la porte de la relecture

Story : e39s01
Epic : e39
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire apprend en relecture, et non après la recette, qu'une garantie de la section Sécurité d'une story se
contourne. Sur `e38s06` et `e38s07`, quatre contournements de la garantie « le producteur ne change pas son juge »
n'ont été vus qu'à la recette, et chacun a coûté un aller-retour complet : la consigne des relecteurs leur interdit
de chercher un chemin que la story n'écrit pas (`D-68`), et un constat placé avant la branche part au registre même
quand il contredit la section Sécurité, comme la faille de G4 trouvée par `e38s08`.

Pour la seule section Sécurité, les relecteurs cherchent désormais un contournement, et un contournement retient la
porte quel que soit son placement (`D-89`). Les promesses restent relues comme avant.

## 2. Promesses

Scenario: Le relecteur cherche un contournement de chaque garantie de la section Sécurité
  Given une story dont la section Sécurité porte une garantie
  When l'outil ouvre un tour de relecture
  Then l'invite de chaque relecteur lui demande, pour chaque garantie de cette section, un chemin concret, par les entrées publiques que la branche expose, qui obtient ce que la garantie refuse
  And la même invite lui interdit toujours de proposer un scénario de son cru pour les promesses

Scenario: Un contournement retient la porte quel que soit son placement
  Given un tour dont un constat montre un contournement d'une garantie de la section Sécurité, placé avant la branche ou classé à corriger
  When l'outil trie le tour
  Then la porte est refusée et le constat va à la réponse du tour, pas au registre

Scenario: Un contournement que le dernier tour laisse ne part jamais au registre
  Given le dernier tour de relecture, qui laisse un contournement non corrigé
  When l'outil clôt la relecture
  Then le contournement est rendu comme une promesse non tenue, au propriétaire ou au rouge-vert en mode automatique, et le registre ne le reçoit pas

## 3. Sécurité

Une garantie de la section Sécurité d'une story ne se contourne pas sans que la relecture retienne la porte : aucun
contournement relevé par un relecteur ne part au registre, et la réponse d'un tour ne peut pas le classer ailleurs.

## 4. Tâches

### Tâche 1 — L'invite du relecteur cherche le contournement

Ajouter à `cycle/prompts/relecteur.md` la recherche d'un contournement pour chaque garantie de la section Sécurité,
et à la sortie structurée du relecteur la marque d'un constat qui montre un contournement, avec la garantie qu'il
contourne. Garder pour les promesses l'interdit de tout scénario de son cru. Mettre `cycle/README.md` § Review au
même texte.

- Vérifie : `node --test test/cycle/relecteur-securite.test.ts`
- Tient : `test/cycle/relecteur-securite.test.ts`, « l'invite du relecteur demande un contournement de chaque garantie de la section Sécurité et garde l'interdit pour les promesses »
- Rouge : `cycle/prompts/relecteur.md` ne demande aucun contournement ; il dit seulement de ne proposer ni scénario, ni état, ni entrelacement de son cru.

### Tâche 2 — Un contournement retient la porte

Faire que `trier` (`cycle/src/relecture.ts`) refuse la porte sur un contournement et l'envoie à la réponse, quel que
soit son placement ou sa catégorie.

- Vérifie : `node --test test/cycle/relecture-contournement.test.ts`
- Tient : `test/cycle/relecture-contournement.test.ts`, « un contournement placé avant la branche retient la porte et va à la réponse, pas au registre »
- Rouge : `trier` range tout constat placé `anterieur` parmi les antérieurs, destinés au registre, et laisse passer la porte.

### Tâche 3 — Le dernier tour rend le contournement comme une promesse non tenue

Faire que `apresDernierTour` (`cycle/src/relecture.ts`) rende un contournement au propriétaire, comme une promesse
que le code ne tient pas, et ne l'envoie jamais au registre.

- Vérifie : `node --test test/cycle/relecture-dernier-tour.test.ts`
- Tient : `test/cycle/relecture-dernier-tour.test.ts`, « après le dernier tour, un contournement classé à corriger va au propriétaire et non au registre »
- Rouge : `apresDernierTour` n'envoie au propriétaire que les constats `bloquant` ; un contournement classé `a_corriger` ou placé `anterieur` part au registre.

## 5. Hors périmètre

Chercher des scénarios au-delà de la section Sécurité : `D-68` tient pour les promesses. La recette et l'arbitrage
gardent leurs règles. Lancer la mutation pour les relecteurs : `e39s02`.
