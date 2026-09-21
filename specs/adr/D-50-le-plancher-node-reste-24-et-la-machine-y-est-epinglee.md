# D-50: Le plancher Node reste 24, et la machine de référence y est épinglée

**Status:** Acceptée
**Date:** 2026-09-21

**Décision.** `engines.node` reste `>=24.0.0` et `@types/node` reste borné à `^24`, alors que trois
versions de Node sont installées sur la machine. C'est la machine qui est alignée sur le plancher et
non le plancher sur la machine : `~/.zshenv` épingle `/opt/homebrew/opt/node@24/bin`, de sorte que
tout shell zsh — interactif ou non — résout Node 24.21.

**Motif.** `node: process.version` alimente `EnvironmentFacts`, donc `environment_digest`
(`src/application/environment.ts:127`), au même titre que `pi_version`. Or la version que la machine
présentait dépendait de la façon dont le processus était lancé : `.zshenv`, lu par tout shell zsh,
épinglait node@22, tandis que `.zshrc`, lu des seuls shells interactifs, épinglait node@24. Un
lancement hors terminal rendait donc 22.23.2 et un lancement depuis un terminal 24.21.0, pour une
même campagne sur une même machine — deux empreintes d'environnement pour un seul poste. Node 22 est
de surcroît sous le plancher déclaré, et n'offre `node:sqlite` qu'en API expérimentale, ce que `D-01`
écartait précisément en exigeant Node 24.

Monter `@types/node` à 26 aurait typé le harnais contre un runtime plus récent que le plancher
annoncé. Le typecheck est la seule chose qui empêche une fonction absente de Node 24 d'entrer dans le
code ; il aurait cessé de le faire sans qu'aucun contrôle le signale.

**Conséquence.** Les deux bornes sont couplées : `@types/node` suit le plancher de `engines`, jamais
la dernière version publiée. Les monter suppose de monter `engines` d'abord, ce qui restreint qui
peut installer le paquet. `/opt/homebrew/bin/node` sert un Node 26.9 et l'emporte partout où
l'épinglage de `.zshenv` est contourné — c'est le cas dans le shell d'outil de Claude Code, où il
faut préfixer `PATH` à la main lorsque la version de Node compte pour ce qui est mesuré.

**Limite.** L'épinglage vit hors du dépôt, dans la configuration de shell du propriétaire. Aucun
contrôle de Preflight ne le vérifie, et une machine neuve ne l'hérite pas : c'est une condition
d'environnement, pas une propriété du paquet.
