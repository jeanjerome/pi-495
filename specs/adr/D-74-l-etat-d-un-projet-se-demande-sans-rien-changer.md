# D-74: L'état d'un projet se demande sans rien changer

**Status:** Acceptée
**Date:** 2026-09-30

## Contexte

Le noyau ne connaît qu'un changement dont le produit est un candidat : G2 exige un contrôle, G4 et G5
jugent un candidat, G6 l'intègre. Les exigences de qualité et d'architecture (`QLT-02`, `ARC-01`)
demandent une baseline de l'existant et un diagnostic de l'architecture réellement présente. Leur
texte les place à l'intérieur d'un changement (« lorsque le changement le nécessite », « avant une
campagne de remise à niveau »), sans exiger qu'on puisse les demander seuls.

Le propriétaire a tranché le 2026-09-30 : il veut pouvoir demander l'état de son projet sans rien
changer.

## Décision

1. **Un changement peut avoir pour livrable l'état d'un projet, sans candidat.** Le propriétaire le
   demande comme il demande un changement, le dossier le conserve, et le propriétaire l'accepte ou le
   refuse.
2. **L'état d'un projet est établi par des contrôles exécutés sur la référence**, qualifiés comme les
   autres, et non par le jugement d'un modèle. Chaque écart est localisé et reproductible. Un modèle
   peut commenter ce que les contrôles ont mesuré ; il n'ajoute aucun constat.
3. **L'absence d'un analyseur n'est jamais lue comme l'absence de défaut.** Ce qu'aucun contrôle ne
   mesure est nommé comme angle mort, avec la raison.
4. **Ce livrable ne contourne aucune porte qu'il n'a pas de raison de passer.** Les portes que le
   candidat justifiait (le candidat complet, l'intégration locale) ne s'appliquent pas ; celles qui
   jugent le mandat, les exigences et la vérifiabilité des contrôles s'appliquent. La forme exacte
   des portes est celle de la première story de `e29`.

## Conséquences

`e29` porte ce changement. La baseline de `e10` et le diagnostic de `e11` en sont deux états des
lieux, et se mesurent avec le même chemin : ni l'une ni l'autre ne demande un mécanisme propre pour
être rendue.
