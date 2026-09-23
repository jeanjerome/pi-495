# D-60: La strate imposée est observée dans la requête, et la déclaration devient une attente

**Status:** Acceptée
**Date:** 2026-09-23

## Context

Le manifeste de contexte nomme ce qu'un fournisseur écrit au-dessus des instructions de 495. Ce
qu'il nomme vient d'une table du domaine, qui dit ce que 495 a lu un jour dans le paquet du
fournisseur (`D-48`). Le contrôle de Preflight qui devait tenir cette table à jour a été retiré : il
lisait du code tiers avec des expressions, et le silence d'un motif passait pour une absence. `D-55`
a posé la règle qui s'applique ici : un fait que Pi rapporte vaut mieux qu'un fait que 495 redit.

Trois faits ont été établis contre Pi 0.87.0, par lecture puis par exécution.

- **Seule `before_provider_request` porte le bloc.** `pi-ai/dist/api/anthropic-messages.js` ajoute
  le bloc d'abonnement dans `buildParams`, au moment où il sérialise la requête.
  `context_with_system` passe avant, et ne le voit donc jamais.
- **Observer ne modifie rien.** Un gestionnaire qui ne renvoie rien laisse la charge inchangée. Un
  gestionnaire qui lève une erreur est écarté, et la charge part inchangée
  (`ExtensionRunner.emitBeforeProviderRequest`). Sur un point d'accès de substitution, le corps reçu
  est le même avec et sans observateur.
- **Pi ajoute sa propre section à l'invite de 495.** Il la termine par le répertoire de travail de
  la session, en chemin absolu (`buildSystemPromptSections`). Ni la table ni le manifeste ne le
  disaient. Le texte que le dossier garde comme « remis au modèle » ne la contient pas. Ce fait a
  été trouvé à la première exécution, et non à la lecture.

## Decision

**L'observation est la source de ce que le modèle a reçu.** Le worker charge une extension, et une
seule : un observateur de `before_provider_request`. Pi 0.87.0 n'exporte pas
`loadExtensionFromFactory`, donc c'est le chargeur de Pi qui l'héberge. Toute découverte y est
coupée, et les réglages restent ceux, en mémoire, du worker. Une extension posée dans le projet ou
dans le répertoire de l'agent n'est pas chargée : un test le prouve contre un témoin qui, lui, la
charge.

**L'observateur sépare les deux parts sans rien redire de Pi.** Il demande à l'hôte l'invite qu'il a
composée pour la requête (`ctx.getSystemPrompt()`), et la repère dans la charge utile. Ce qui
l'entoure est ce que le fournisseur a écrit. Ce qu'elle contient en plus des instructions de 495 est
ce que l'hôte a ajouté. Deux formes de requête sont lues : les messages Anthropic et les complétions
compatibles OpenAI. Toute autre forme est inscrite comme non observée, avec sa raison.

**Le fait observé s'inscrit à la fin de l'intervention.** Le manifeste est scellé avant
l'intervention, et une requête n'existe qu'à son envoi. L'observation voyage donc comme un événement
d'intervention, comme la réécriture du contexte (`D-58`). La fin d'intervention la porte au journal,
à côté du coût. Seule une requête qui diffère de la précédente y ajoute une entrée.

**La déclaration devient une attente.** La table reste, et chaque observation lui est opposée. Le
dossier porte la concordance, ou chaque écart par son type : attendu et non observé, avec la
condition déclarée ; observé et non attendu, avec sa position ; instructions de 495 introuvables. La
part de l'hôte n'est opposée à rien, parce que la table parle des fournisseurs. Aucun écart n'arrête
une intervention.

**La sur-déclaration reste.** La strate est toujours déclarée dès que le fournisseur est retenu,
avec sa condition. Sur un chemin où elle n'est pas imposée, l'écart « attendu et non observé »
l'affiche, la condition à côté. Déduire le chemin d'authentification pour ne plus sur-déclarer
coûterait un fait de plus à redire, pour un gain que l'écart donne déjà.

**Le contrôle du paquet du fournisseur n'a plus de raison d'être.** Il devait voir un changement du
bloc entre deux versions du fournisseur. L'observation voit ce changement, sur la version réellement
installée, dès la première requête. La branche `controle-du-bloc-fournisseur` ne sera pas fusionnée.

**Pi présente l'accroche comme un outil de débogage, et 495 ne lui suppose aucune stabilité.** Sur
la version épinglée, sa disparition fait échouer la vérification de types. Sur une autre version
installée, une session dont aucune requête n'atteint l'observateur est inscrite comme non observée,
avec sa raison. Une forme de requête inconnue l'est aussi. Aucune de ces pertes ne se lit comme
« rien d'imposé ».

## Consequences

Le dossier dit ce qui est parti vers le fournisseur, et sépare ce qu'a écrit chaque auteur : 495,
l'hôte et le fournisseur. Jusqu'ici, il disait ce que 495 avait composé, et ce que 495 croyait savoir
du fournisseur.

Le couplage change de nature, il ne disparaît pas. 495 dépend désormais de la forme de deux corps de
requête. Le prochain fournisseur qualifié sera inscrit comme non observé tant que son corps ne sera
pas lu, et c'est visible au premier dossier.

Pi envoie au fournisseur le chemin absolu de l'espace de travail, avec chaque invite. C'est désormais
écrit au dossier. Rien ici ne l'empêche : dire si ce chemin doit quitter la machine est une décision
sur les données qui sortent, pas sur l'observation.

Deux limites restent. D'abord, la lecture de Pi n'établit pas si l'écriture d'un résumé de
compaction passe par l'accroche. Ensuite, le fournisseur renomme aussi les outils sur le chemin
d'abonnement, et ce renommage n'est pas inscrit.
