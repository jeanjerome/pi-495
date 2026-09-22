# D-58: Ce que l'hôte rapporte de la réécriture du contexte est lu, et l'observation reste liée à la session

**Status:** Acceptée
**Date:** 2026-09-22

## Context

Deux questions étaient portées à l'arbitrage avant la première campagne facturée. Toutes deux
portaient sur une mécanique et non sur un but, et les documents de l'hôte les tranchent.

**La réécriture du contexte.** Le worker crée la session avec la compaction active et n'observe rien
de ce qu'elle produit. Les conséquences sont deux : le manifeste de contexte est scellé avant qu'un
résumé remplace une partie de la conversation, et il reste le seul mot du dossier sur ce que le
modèle tient ; et le compteur de jetons ignore ce que ce résumé a coûté, alors que la requête qui
l'écrit est facturée comme les autres. Les options posées étaient de couper le résumé, de l'observer,
ou de mesurer d'abord si le cas peut seulement survenir dans le budget d'une intervention.

La mesure est faite. Le seuil de l'hôte est `contexte > fenêtre − réserve`, la réserve valant 16 384
jetons par défaut ; sur le modèle local de cette machine, dont la fenêtre est de 131 072 jetons, la
réécriture se déclenche au-delà de 114 688. La plus longue intervention relevée au journal des
campagnes du 21 septembre 2026 porte 107 095 jetons connus. Le cas n'est donc ni théorique ni
courant : il est atteignable dans le budget d'une intervention, et ne s'est pas encore produit.

Couper le résumé rendrait le harnais moins capable : une intervention qui dépasse la fenêtre
s'arrête au lieu de continuer, et elle s'arrête d'autant plus tôt que le modèle est bavard. Mesurer
d'abord est ce que l'observation fait, puisqu'elle rend la mesure au lieu de la supposer.

**Le rythme de l'observation du format d'appels d'outils.** La question posée était de retenir le
résultat au-delà de la session, et sous quelle clé. Retenir demande une clé et une péremption, donc
de décider ce qui rend une qualification caduque — une version de modèle, un endpoint qui a changé de
serveur derrière la même adresse. Rien dans le but ne demandait cette durée de vie : l'observation
existe pour éviter qu'une intervention entière se paie pour une incapacité, et elle atteint ce but
dès qu'elle précède la première intervention de la session.

## Decision

**Ce que l'hôte rapporte de la réécriture est lu.** La session publie `compaction_start` et
`compaction_end`, et le résultat porte les jetons remplacés, une estimation de ce qui reste et
l'usage de la requête qui a écrit le résumé. Le worker lit `compaction_end`, ajoute cet usage aux
jetons connus de l'intervention, et inscrit au dossier un événement qui nomme le motif, les jetons
remplacés, les jetons restants et le coût du résumé. Une réécriture qui n'a pas eu lieu — interrompue
ou refusée — est inscrite comme telle, avec sa raison : la fenêtre qui l'a rendue nécessaire est
toujours pleine.

L'événement traverse le filtre du journal là où les événements de modèle sont écartés. Un texte de
modèle est du contenu ; une réécriture du contexte est un fait opposable, puisqu'elle contredit le
manifeste scellé au départ.

La lecture vit dans un module que l'on peut tenir hors du sous-processus, plutôt que dans le
souscripteur du worker, pour qu'un test l'oppose à une vraie session de l'hôte.

**L'observation reste liée à la session.** Une requête par couple et par session, sans clé ni
péremption. Le jour où une campagne mesurera ce que ce rythme coûte réellement sur un fournisseur
facturé, ce chiffre pourra rouvrir la question ; une durée de vie inventée avant la mesure ne le
pourrait pas.

## Consequences

Le relevé d'une campagne porte ce que l'intervention a consommé, résumé compris. Sans cette lecture,
la seule mesure que la campagne existe pour produire serait fausse d'un terme, et d'autant plus que
la conversation est longue — c'est-à-dire précisément là où le chiffre compte.

Le dossier cesse d'affirmer, par son seul manifeste, que le modèle tient ce qui lui a été remis au
départ. Ce que la strate imposée par le fournisseur est à l'entrée, la réécriture l'est en cours de
route : une modification du contexte que 495 ne compose pas et doit déclarer.

Le contrat d'événements d'intervention gagne une variante. Elle est fermée comme les autres, et ce
que l'hôte ne rapporte pas — le texte du résumé lui-même — n'y figure pas : le dossier dit qu'une
partie de la conversation a été remplacée et ce que cela a coûté, pas ce que le résumé contient.

Le coût en argent reste hors du compteur. L'hôte le rapporte pour chaque réponse, entrée, sortie et
cache détaillés ; 495 n'en lit rien. C'est un manque nommé, dû à la story qui remesure les budgets
sur un modèle frontière, et non une conséquence de cette décision.
