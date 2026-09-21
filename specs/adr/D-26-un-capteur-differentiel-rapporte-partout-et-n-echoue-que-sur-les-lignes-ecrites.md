# D-26: Un capteur différentiel rapporte partout et n'échoue que sur les lignes écrites

**Status:** Acceptée

**Décision.** Le contrôle structurel émet un constat `blocker` pour chaque violation, où qu'elle se
trouve, et son verdict est `FAIL` seulement si l'une d'elles porte sur une ligne introduite.
`verdictUnderTolerance` est étendue en conséquence : sous `no_aggravation`, un contrôle qui échoue
sans nommer un seul constat que la référence ne porte pas déjà rend `PASS`, que son passage de
référence ait échoué ou non.
**Motif.** Les deux moitiés sont nécessaires et ne font pas double emploi. Les constats doivent être
émis des deux côtés, sinon la comparaison n'a rien à apparier et un cycle préexistant disparaîtrait
du dossier au lieu d'y figurer en `preexisting`. Le verdict, lui, doit porter sur ce que le candidat
a écrit : le témoin positif d'un capteur s'exécute sur la référence et G2 exige qu'il passe, donc un
capteur qui échoue sur la dette antérieure serait inqualifiable sur toute cible qui en porte. La
tolérance ne pouvait plus dépendre d'un passage de référence en échec, puisqu'un tel capteur passe
sur la référence tout en y nommant ce qu'il trouve.
**Conséquence.** Une violation héritée mais réécrite par le candidat — un import interdit déplacé
lors d'un reformatage — reste tolérée : elle s'apparie par empreinte, ne compte pas parmi les
constats bloquants, et le contrôle ne bloque pas. Un échec qui ne nomme aucun constat reste un
échec, et un passage de référence `INDETERMINATE` n'est toujours pas une tolérance. La divergence
qui paye une confirmation est celle que la tolérance a laissée debout, et non plus le verdict brut.
