# D-66: Une branche arrive sur `main` en un seul commit, et les sujets de ses commits ne sont pas relus

**Status:** Acceptée
**Date:** 2026-09-27

## Context

`CONVENTIONS.md` demandait de fusionner dans `main` « with a clean, descriptive commit », et le
script de livraison de bigpowers fusionne par `git merge --squash`. La pratique a été l'inverse :
`main` n'a aucun commit de fusion, les stories y sont arrivées commit par commit, et trois sujets qui
citent la relecture y figurent déjà.

Les messages de commit ne portent ni tour de relecture ni description du processus. Or les étapes de
relecture et de réponse commitent leurs relevés sous des sujets qui nomment le tour : sur les 43
commits de la branche de e01s03, 15 citent la relecture. Chaque tour relit le diff depuis le
précédent, donc les sujets que le tour d'avant vient d'écrire. La réponse au troisième tour les a
laissés en lisant la règle de fusion en un commit ; le quatrième tour les a déclarés à corriger en
s'appuyant sur la pratique. Tant que les étapes écrivent ces sujets, la relecture ne peut pas se
fermer sur ce point.

## Decision

Une branche arrive sur `main` en un seul commit écrasé, dont le message suit § Commit Messages.
Les commits de la branche sont un historique de travail : leurs sujets n'atteignent pas `main` et ne
sont pas un constat de relecture. La branche est gardée après la fusion.

## Consequences

`main` ne porte plus les paires rouge/vert d'une story. Le journal rouge-vert de
`specs/verifications/` les garde, en citant les commits de la branche : c'est pourquoi la branche
n'est pas supprimée, sans quoi ces empreintes finiraient par ne plus rien désigner.

Les stories déjà fusionnées commit par commit restent telles quelles.
