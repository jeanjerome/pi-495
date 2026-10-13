# D-93: Le producteur se joint lui-même, pour lancer le contrôle de mutation qui le juge

**Status:** Acceptée (décision du propriétaire, 2026-10-13) ; complète `D-29`
**Date:** 2026-10-13

## Contexte

`D-29` donne au profil d'isolation une valeur `loopback`, que « le contrôle de mutation est le seul à demander ». Le
noyau juge le candidat par ce contrôle, et le producteur est prévenu qu'il doit lancer lui-même ce que le noyau
lancera. Or le bac à sable du producteur fermait tout le réseau : Stryker y échouait au démarrage, `EPERM` sur
`listen`, et chaque tentative notait que la mutation de son candidat n'était pas vérifiée. Il corrigeait sans voir les
mutants survivants, qu'il ne pouvait ni lancer ni connaître avant G5. Sur la campagne de référence npm, les trois
tentatives ont échoué sur les mêmes quatre mutants.

## Décision

Le rôle producteur (`implement`) reçoit le profil `loopback`. Les autres rôles gardent le réseau fermé : le préparateur,
le spécifieur, l'observateur et les relecteurs n'ont aucun contrôle de mutation à lancer pour se vérifier.

## Motif

Le producteur écrit du code que le noyau exécute ensuite sous `loopback`, sans personne pour le relire, pendant le
contrôle de mutation. Ce que son terminal peut joindre pendant la session, le code qu'il écrit le joint déjà pendant
le contrôle : la boucle locale de la machine et aucun autre hôte. Lui accorder `loopback` n'ouvre donc pas un accès
que son code n'a pas, il l'ouvre plus tôt. L'autre voie, lui montrer les mutants survivants sans lui laisser lancer
l'outil, demande au noyau de lancer la mutation entre deux sessions du producteur : un cycle de plus par tentative,
pour un résultat que le producteur obtient seul en quelques secondes.

## Conséquence

Pendant sa session, le terminal du producteur peut parler aux services qui écoutent sur la machine (un serveur de
développement, une base locale, le serveur du modèle local), alors qu'il ne le pouvait pas. Aucun hôte hors de la
machine n'est joignable, ce que `D-29` et `SEC-02` garantissent et que les tests du bac à sable vérifient. Sous Linux
rien ne change : l'espace de noms réseau ne contient qu'une boucle locale, dans les deux profils. Pour revenir en
arrière, `profileFor` (`src/application/intervention.ts`) rend `denied` à tous les rôles ; le producteur retrouve
alors un contrôle de mutation qu'il ne peut pas lancer.
