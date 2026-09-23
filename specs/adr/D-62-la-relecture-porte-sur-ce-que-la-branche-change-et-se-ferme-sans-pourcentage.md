# D-62: La relecture porte sur ce que la branche change, et se ferme sans pourcentage

**Status:** Acceptée
**Date:** 2026-09-23

## Context

Les skills bigpowers `request-review` et `respond-review` ferment une relecture quand deux
relecteurs neufs, sans contexte commun, donnent chacun un score d'au moins 94 % et aucun défaut
bloquant. Le score vaut `100 × (total − bloquants − à corriger) / total`. Chaque tour relit toute la
branche, et le plafond est de cinq tours. Les skills sont des liens vers le paquet installé
globalement : les modifier ne serait ni versionné ici, ni durable, ni propre à 495.

La story e25s01 a fait six tours sans que la porte s'ouvre :

| Tour | A / B | D'où venaient les points qui ont refusé la porte |
|---|---|---|
| 1 | 96,6 / 89,7 | Code et relevés de la story ; deux défauts de `config.json` inscrits au registre sans être tranchés |
| 2 | 96,3 / 91,7 | Un commentaire faux ; des relevés ancrés à une révision dépassée |
| 3 | 93,9 / 92 | Des tests qu'une mutation traverse ; une fuite déjà présente sur `main` ; des comptes de tests périmés |
| 4 | 96,9 / 93,75 | Un titre de test sans assertion ; le défaut du tour 1, rendu actif par la branche |
| 5 | 77,8 / 88,2 | La correction du tour 4 : le refus d'un fichier illisible et son cycle de vie |
| 6 | 60 / 88,9 | La correction du tour 5 : un échec gardé toute la session ; des défauts antérieurs à la branche |

Aucun constat corrigé n'est revenu : au sixième tour, chaque correction du cinquième tenait sous
mutation. La boucle ne venait pas de corrections oubliées. Elle avait quatre causes.

**Un défaut rendu actif par la branche a été inscrit comme antérieur.** Un `config.json` illisible
faisait perdre les arbitrages humains écrits dans le fichier. Avant la story, la liste des
destinations, vidée par le même fichier, bloquait tout par accident. En retirant la liste, la
branche rendait le défaut atteignable. Il a été inscrit au registre au premier tour, puis rouvert
au quatrième, et il a occupé les trois derniers.

**Une correction a ajouté un mécanisme sans qu'on le conçoive.** Le runtime se crée à deux endroits :
à l'ouverture de session, qui seule lie la session à son changement et annonce les diagnostics, et
à la première commande. Chaque tour a posé une garde sur un symptôme de cette double entrée : un
refus, puis un échec gardé pour la session, puis un message qui nomme `/reload`. Une question au
propriétaire sur la réparation en cours de session a marqué ce moment. Elle portait sur le mécanisme,
pas sur le but de la story.

**La porte ne pouvait pas s'ouvrir.** Un seul point « à corriger » sur seize donne 93,75 % et refuse
la porte (B, tour 4), alors qu'un point « à peser » de plus fait monter le score. Des relecteurs
neufs sur toute la branche trouvent à chaque tour un autre coin : au sixième, un tube nommé, des
réglages mal typés, le chemin du répertoire de données, tous antérieurs à la branche.

**Les relevés produisaient leurs propres constats.** `e25s01-verify.yaml`, `NFR-e25s01.json`,
`REVIEW.md` et le relevé rouge-vert citent une révision et un nombre de tests. Chaque correction les
périmait, et le tour suivant le relevait (tours 2, 3, 4 et 5).

## Decision

`CONVENTIONS.md` § Review porte cinq règles, et elles remplacent la porte et la boucle des deux
skills. Le reste des skills s'applique.

1. **Un constat est situé avant d'être traité.** Un défaut que la branche rend atteignable appartient
   à la branche, même si la ligne fautive la précède. Il se corrige, ou se tranche, dans le tour qui
   le trouve. Un défaut que la branche n'introduit pas et ne rend pas atteignable suit
   « fix-or-log » (`CONVENTIONS.md` § Discovered Defects) et ne retient pas la relecture.
2. **Une correction qui ajoute un mécanisme est conçue avant d'être posée.** Nommer où l'état naît,
   qui le lit, et combien d'entrées y mènent. Retirer une seconde entrée vaut mieux que la garder.
3. **Chaque tour relit ce qui a changé depuis le précédent.** Le premier tour relit la branche contre
   `main`. Les suivants reçoivent le diff depuis la révision relue, les constats déjà traités, et les
   entrées ouvertes du registre, qu'ils ne comptent pas.
4. **La porte se ferme sans pourcentage.** Elle passe quand aucun constat introduit ou rendu
   atteignable par la branche ne reste bloquant ou à corriger, chez l'un et l'autre relecteur. Un
   point à peser ne ferme jamais la porte.
5. **Les relevés sont ancrés une fois.** Pendant la relecture, la révision, les horodatages et le
   nombre de tests des relevés ne sont pas repris à chaque correction. Ils le sont quand la porte
   passe, ou quand le propriétaire décide. Chaque rouge est inscrit au relevé rouge-vert quand il est
   observé.

`AGENTS.md` § Agent Rules renvoie à cette section, pour que les consignes du projet l'emportent sur
celles des skills.

## Consequences

Le plafond de cinq tours reste. Une fois atteint, le propriétaire décide de la fusion ; un tour de
plus ne vaut que s'il porte sur une question nouvelle.

Une relecture qui ne voit que le diff d'un tour ne voit pas un défaut qu'une correction crée hors
de ce diff, par exemple un appelant qui dépendait de l'ancien comportement. La règle 2 le compense
en amont : la correction qui ajoute un mécanisme en nomme les lecteurs.

Un défaut antérieur trouvé en relecture n'est pas écarté. Il reçoit son entrée au registre, ou sa
correction dans un commit séparé, mais il ne rouvre pas un tour.

Les règles sont propres à 495. Si elles tiennent à l'usage, elles peuvent être proposées à l'auteur
de bigpowers.
