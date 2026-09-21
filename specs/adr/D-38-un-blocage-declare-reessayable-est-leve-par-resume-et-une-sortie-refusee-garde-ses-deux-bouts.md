# D-38: Un blocage déclaré réessayable est levé par `resume`, et une sortie refusée garde ses deux bouts

**Status:** Acceptée

**Décision.** Un blocage dont le noyau a déclaré la cause réessayable est levé par `resume`, quelle
que soit sa classe d'arrêt. Le blocage enregistre cette réessayabilité — `status.changed` porte
`retryable`, l'état projeté porte `stop_retryable` — et son détail nomme les actions que l'erreur
portait, si bien que `blocked: configuration_error — … (next: retry_specification) — resume retries
it` se lit là où l'opérateur regarde. `resume` continue de lever `execution_error` comme avant. La
reprise ne rejoue rien : elle rend le changement à la phase où il s'est arrêté, et l'étape qui a
levé l'erreur est refaite.

L'autre écriture possible — cesser de déclarer l'erreur réessayable — a été écartée. Refaire
l'intervention est exactement ce qui la résout : sur les deux occurrences mesurées, le modèle avait
fini normalement et rien dans la configuration n'était en cause.

Deux choses ne sont pas décidées avec elle. **Une sortie refusée conserve ses deux bouts** :
8 000 caractères de tête, 12 000 de queue, et la coupe écrite dans le texte avec le nombre de
caractères élidés, de sorte qu'aucun fragment conservé ne se lise comme contigu à un autre. **Un
bloc JSON tronqué n'est pas refermé par le harnais** : refermer une structure ouverte produit un
objet qui valide sans que rien ne dise qu'il est le rapport, et le recours au dernier `{` a déjà
montré qu'un sous-objet analysable au mauvais niveau déplace le diagnostic au lieu de l'éclairer.
Une réparation silencieuse d'une sortie de producteur est une décision de confiance que rien ne
contrôlerait ; la reprise, elle, coûte une intervention et rend un rapport que le modèle assume.

**Motif.** Sur `~/.495-campagnes/java-flashnext-L`, le cinquième rapport de spécification est refusé
sur son schéma après 17,3 min et 750 564 jetons ; le noyau lève `CONFIGURATION_ERROR`, la déclare
réessayable et nomme `retry_specification`, mais `resume` ne levait que `execution_error` : `/495
resume` rendait le même état à la même révision, et il ne restait qu'à ouvrir un autre changement.
Le changement a été perdu après 55,5 min de budget d'incrément et aucun gate franchi. La même cause
avait déjà tué trois changements, sur deux cibles et deux modèles. Et le dossier ne pouvait pas dire
*pourquoi* le rapport avait été refusé : seuls 20 000 caractères de tête étaient conservés, les neuf
clés y étaient présentes et bien formées, et le motif d'un refus de schéma est presque toujours dans
la queue du texte.

**Conséquence.** Une reprise est comptée là où la première intervention l'était : le budget
d'incrément `increment_ms` et les compteurs d'appels d'outils, bornée par `intervention_ms` et
`tool_calls_per_intervention` pour elle-même. Elle ne consomme aucune tentative — `attempts_used` ne
bouge que pour `implement`. Ce qui borne le nombre de reprises est ce budget d'incrément, refusé à
l'ouverture de l'intervention suivante par `BUDGET_EXHAUSTED` et `IH-07`, et le fait qu'une reprise
est un acte humain : rien ne se relance seul. `max_technical_retries` ne s'applique pas ici ; il
borne les reprises d'une *opération* à effet externe, pas celles d'une intervention.

`retryable` est absent de tout changement d'état qui n'est pas un blocage, et des blocages écrits
avant cette décision : il est lu comme faux plutôt qu'exigé d'un journal rejoué. Le texte conservé
d'une sortie refusée est plus long qu'avant d'une ligne, celle qui nomme la coupe.
