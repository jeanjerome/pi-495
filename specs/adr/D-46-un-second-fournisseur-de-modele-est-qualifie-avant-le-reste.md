# D-46: Un second fournisseur de modèle est qualifié avant le reste du travail ouvert

**Status:** Acceptée
**Date:** 2026-09-21

**Décision.** Un epic `e23` entre à l'index du travail ouvert et se joue avant `e01`. WSJF
`(8+7+9)/2 = 12,0`, le plus élevé de l'index. Il qualifie un second fournisseur de modèle par le
chemin d'abonnement que Pi expose déjà : la recette « le même cas de contrat passe avec deux
fournisseurs qualifiés » tenue sur un parcours complet, le refus d'un profil incompatible avant une
intervention facturée doté d'un effet, les budgets d'intervention remesurés, la sortie de données
vers le fournisseur déclarée, et le bloc système imposé porté au manifeste (`D-48`).

**Motif.** Les trois campagnes qui fondent le travail sur les instructions ont tourné avec un modèle
local qui rend deux fois sur trois un rapport que le schéma `specification-report` refuse. Tant
qu'il est le seul témoin, une instruction mauvaise ne se distingue pas d'un modèle incapable. Or
`e01` établit le défaut le plus grave — un changement accepté en rendant un contrat que son
propriétaire n'avait pas décidé — et cet établissement repose sur le même témoin. L'epic ne prime
donc pas en gravité : il répare l'instrument avant que la campagne suivante s'en serve comme preuve.
Son coût est faible parce qu'aucun code n'est à écrire pour joindre le fournisseur — Pi consomme
l'abonnement par jeton OAuth présenté en Bearer, sans frapper de clé d'API — et que ce qui reste est
ce que le harnais doit porter en conséquence.

**Conséquence.** L'autorité d'ordonnancement, `specs/archive/ROADMAP.md` §5, est antérieure à cet
epic et ne couvre plus la tête de l'index ; le `wsjf_note` de `e23` le consigne. La recette d'`AGT-02`
cesse de ne tenir que par des preuves unitaires. La clause d'`AGT-01` sur le refus d'un profil avant
une intervention **facturée** reçoit un effet pour la première fois, n'en ayant aucun tant que le
modèle est gratuit. Les budgets de `src/domain/policy.ts:47` — 20 min d'intervention, 120 min
d'incrément, calibrés sur 2,5 appels d'outil par minute — sont à remesurer : avec un modèle
frontière la borne n'est plus le temps mais la fenêtre d'abonnement. Les extraits et les invites
quittent la machine, ce que `NFR-06` ne mesure pas puisqu'elle porte sur la télémétrie produit et
non sur le canal modèle ; la sortie est à déclarer sous `SEC-05`. Le bac à sable ne bouge pas : le
worker est déjà exempté de confinement réseau pour joindre le fournisseur (`D-11`).

**Limite.** `e23` ne ferme aucune exigence absente de la matrice. `AGT-01`, `AGT-02`, `CTX-02` et
`SEC-05` y sont déjà couvertes ; l'epic renforce la preuve qui les tient. Il ne porte donc pas de
clé `requirements` au périmètre, à la différence de `e10` ou `e22` qui ferment des exigences non
couvertes.
