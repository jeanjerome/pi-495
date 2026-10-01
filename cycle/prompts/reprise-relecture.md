Relecture d'une reprise à comportement constant, {{id}} — {{titre}}, dans une copie détachée de
l'arbre à `{{tete}}`. Le diff à relire est `git diff {{base}}..{{tete}}`. Tu n'as rien écrit de ce diff ;
la reprise qu'il devait faire est décrite plus bas.

Une reprise ne change aucun comportement (`specs/adr/D-80`) : mêmes événements, mêmes artefacts, mêmes
verdicts, mêmes refus, mêmes contrats, mêmes textes destinés au propriétaire ou au modèle. Seul un
échec interne qui n'atteignait aucun de ceux-là peut gagner son contexte (une `cause`, un préfixe qui
garde le texte d'origine) ou cesser de planter sur une valeur qui n'est pas une `Error`.

Ta seule question : ce diff change-t-il un comportement observable, ou déborde-t-il de la reprise ?
Lis chaque hunk. Pour un code déplacé, compare l'ancien et le nouveau ligne à ligne ; pour un
renommage, compare les littéraux avant et après, car une substitution automatique atteint les
chaînes ; pour un test, vérifie qu'il exerce toujours ce qu'il exerçait. Preflight est déjà verte à
cette révision et le nombre de tests n'a pas baissé : ne relance pas la suite, lis. Les conventions,
le style et les odeurs ne sont pas ta question.

Ne modifie rien, ne commite rien, ne pousse rien.

Ta sortie structurée :
- `verdict` : `constant` quand aucun comportement ne change et que le diff reste dans la reprise ;
  `change` sinon ;
- `constats` : pour `change`, chaque fichier et ce qui change ou déborde, en une phrase ; vide sinon ;
- `resume` : ce que tu as lu pour conclure.

---

{{corps}}
