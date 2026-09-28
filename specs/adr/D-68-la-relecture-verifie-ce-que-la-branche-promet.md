# D-68: La relecture vérifie ce que la branche promet, et ne cherche pas au-delà

**Status:** Acceptée
**Date:** 2026-09-28

## Context

`D-62` à `D-67` bornent ce que la relecture relit (le diff du tour), comment sa porte se ferme et ce
que devient un constat. Aucune ne borne ce qu'elle cherche. La consigne du coordinateur suit donc la
skill `request-review` : sept axes (justesse, conventions, qualité des tests, conception, cas
limites, sécurité, odeurs de code) et une rubrique « là où je veux des yeux neufs ».

La nuit du 27 au 28 septembre, le pilote a mené e01s04 puis une branche de correction de quatre
défauts. Sur 9 h 21 d'agent, la relecture et ses réponses ont pris 5 h 43, et 62 % du coût.

Au premier tour de la branche de correction, la rubrique « yeux neufs » proposait sept familles de
scénarios : deux sessions qui lisent le même changement à la même révision, une vérification qui
tourne encore dans une autre session après la pause, une pause entre deux écritures de la
vérification, les journaux écrits par une version antérieure. Les constats ont suivi la consigne.
Parmi eux : une reprise demandée pendant que les contrôles suspendus tournent encore, la clé de
vérification face à une seconde session vivante, et `/495 verify` lancé pendant la confirmation de
`/495 close`. S'y ajoutent deux changements qui partagent le même contenu candidat
(`BUG-2026-09-28T103300`) et une vérification laissée ouverte par une version antérieure
(`BUG-2026-09-28T113000`). La story disait pourtant ne présumer d'aucun bail entre sessions
(e01s04 §15, M6).

L'axe des odeurs a élargi la branche de la même façon. Un *Duplicated Code* relevé sur le drapeau de
session a conduit à refondre sa tenue sur cinq entrées : la conduite, `/495 resume`, `/495 close`,
`/495 revoke` et `/495 verify`. Le troisième tour a relu cette refonte. Son seul constat à corriger
portait encore sur deux sessions vivantes sur un même changement.

Le registre comptait 4 défauts ouverts au début de la nuit. Il en a reçu 11, dont 10 de gravité
faible, presque tous inscrits par les relecteurs, et le troisième tour en ajoute quatre. Chaque tour
trouvait un autre coin de la machine à états, parce que la consigne l'y envoyait.

## Decision

`CONVENTIONS.md` § Review, règle 8.

1. **La consigne énumère les promesses, dans les mots de leur spécification.** Pour une story, ce
   sont les scénarios de ses critères d'acceptation et les mesures de sa section sécurité. Pour une
   branche de correction, ce sont les critères d'acceptation de chaque fiche de défaut.
2. **Pour chaque promesse, le relecteur dit si le code la tient et si un test la tient.** Une
   mutation d'une ligne qui tient la promesse doit faire échouer un test. Une promesse que le code ne
   tient pas est bloquante, et une promesse qu'aucun test ne tient est à corriger. Un tour suivant
   vérifie les mêmes promesses sur son diff, ainsi que chaque constat traité.
3. **La consigne n'envoie les relecteurs nulle part ailleurs.** Elle ne propose ni scénario, ni état,
   ni entrelacement de son cru. Conventions, conception et odeurs reviennent à `audit-code`, qui
   passe avant.
4. **Un constat trouvé hors des promesses reste situé et classé selon la règle 1.**

La skill n'est pas modifiée, pour la raison que donne `D-62` : ce paquet vit hors de ce dépôt.

## Consequences

La relecture ne cherche plus de défaut sur un chemin qu'aucune promesse ne couvre. Un tel défaut
sera trouvé par la recette, par l'usage ou par une story qui en fait la promesse, ou ne sera pas
trouvé. C'est le coût accepté.

Les règles 1 à 7 ne changent pas. Un constat qu'un relecteur fait malgré tout hors des promesses
peut encore retenir la porte, s'il est introduit ou rendu atteignable par la branche.

Les mutations restent le filet que `D-63` leur confie, mais seulement sur les lignes qui tiennent
une promesse.

Conventions, conception et odeurs ne sont plus vérifiées que par `audit-code` et par les contrôles
de Preflight.

Les promesses des stories antérieures sont tenues par la suite de tests. La relecture ne cherche
plus une régression qu'aucun test ne tient. Sur e01s04, l'autocontrôle en a trouvé cinq, toutes
nées de ce que la révocation fait reculer un changement.

Une relecture vaut ce que valent les critères d'acceptation. Une promesse vague donne une relecture
vague. L'exigence de `D-63` sur la forme d'une tâche porte désormais aussi la relecture.
