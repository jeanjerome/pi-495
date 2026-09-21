# D-28: Le seuil de mutation de la cible n'est pas la règle du contrôle

**Status:** Acceptée

**Décision.** Le contrôle de mutation lit son verdict dans le rapport XML, mutant par mutant, sur
les lignes introduites. Un rapport complet — l'élément fermant est présent — prouve que l'analyse
est allée à son terme ; une sortie non nulle après ce rapport est nommée dans les notes et ne change
pas le verdict. Sans rapport complet, une sortie non nulle est un `FAIL` avec les erreurs de build,
une sortie nulle accompagnée de la mention qu'aucun mutant n'a été engendré est un `PASS` explicite,
et tout le reste est `INDETERMINATE`.
**Motif.** `mutationThreshold` est un ratio sur tout ce que le moteur a muté ; `ROADMAP.md` §1 dit
ce qu'un ratio mesure — l'hygiène d'un dépôt, pas un changement. L'opposer au candidat ferait échouer
une modification à cause de la dette des lignes voisines. L'écraser par `-DmutationThreshold=0`
serait abaisser un seuil que la cible a adopté. Le rapport est écrit avant que le seuil soit évalué :
sa présence complète sépare donc les deux situations sans toucher à la configuration de la cible.
**Conséquence.** Le seuil de la cible reste sa décision, visible au dossier, jamais appliquée au
candidat. Les `pom.xml` sont protégés : l'abaisser ou exclure un mutateur reste une mutation du
protocole, refusée à G4. Le risque résiduel est un échec de plugin survenant après l'écriture du
rapport, qui serait lu comme un seuil manqué ; la note le laisse visible.
