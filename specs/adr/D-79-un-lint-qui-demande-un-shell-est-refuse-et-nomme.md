# D-79: Un script lint qui demande un shell est refusé et nommé

**Status:** Acceptée
**Date:** 2026-10-01

## Contexte

L'adaptateur Node lit deux scripts du `package.json`. Une commande de test qui demande un shell
(`|`, `&`, `;`, redirection, substitution) est refusée et nommée : 495 ne la lance pas, et le
changement s'arrête sur une capacité manquante (`D-72`). Le script lint suivait une autre règle : un
script à syntaxe de shell était lancé par `/bin/sh -c`, alors que l'en-tête de l'adaptateur et le
commentaire de la fonction qui le lit disaient qu'il était refusé. L'audit du code du 2026-10-01 l'a
relevé ; aucune décision écrite ne tranchait entre les deux comportements.

## Décision

Un script lint qui demande un shell est refusé et nommé, comme la commande de test : aucun contrôle
`lint` n'est déclaré, et le refus s'ajoute aux capacités manquantes de la détection, que le protocole
gelé reprend en note. Contrairement au refus d'une commande de test, il n'arrête pas le changement :
la cible garde le contrôle de ses tests. Un script lint sans syntaxe de shell garde son contrôle.

## Conséquences

Une cible dont le lint enchaîne des outils (`eslint . && prettier --check .`) perd son contrôle de
lint, et le dossier dit pourquoi. 495 ne lance plus de shell pour un contrôle qu'une cible compose.
Lancer un tel lint demanderait un shell sous le confinement : ce serait une décision nouvelle.
