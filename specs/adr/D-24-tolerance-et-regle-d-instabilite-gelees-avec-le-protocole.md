# D-24: Tolérance et règle d'instabilité gelées avec le protocole

**Status:** Acceptée

**Décision.** `Protocol.baseline` porte quatre champs gelés à G2 : l'exécution sur la référence, la
tolérance (`no_aggravation` ou `block_any`), la règle d'instabilité et le nombre de confirmations
qu'une divergence peut coûter. Sous `no_aggravation`, un contrôle qui échoue des deux côtés sans
ajouter un seul constat rend `PASS`, et `baseline.raw_verdict` conserve ce qu'il a observé ; un
constat hérité reste dans la preuve avec `baseline_state: "preexisting"` et ne compte pas parmi les
constats bloquants. Un contrôle qui échoue sur le candidat là où la référence passe paye une
confirmation sur le même candidat : si les deux réponses divergent, le verdict est `INDETERMINATE`
conservé, `limits.unstable` est vrai, et la relance technique lui est refusée.
**Motif.** Une tolérance décidée après coup n'en est pas une : c'est un verdict trouvé gênant. La
geler avec le protocole la rend opposable, et la rend lisible dans le dossier. Symétriquement, la
seule manière d'observer qu'un contrôle alterne est de l'exécuter deux fois ; ce que VER-08 interdit
n'est pas la seconde exécution mais d'adopter la plus verte des deux réponses.
**Conséquence.** Un contrôle qui échoue là où la référence passe coûte une exécution de plus avant
qu'une tentative de correction ne soit dépensée sur lui — bien moins qu'une intervention complète
suivie d'une vérification complète. `max_confirmations: 0` retire la détection sans toucher au
classement des constats.
