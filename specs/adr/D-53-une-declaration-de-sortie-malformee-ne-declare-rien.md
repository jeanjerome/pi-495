# D-53: Une déclaration de sortie malformée ne déclare rien, et la destination est jugée deux fois

**Status:** Acceptée ; rendue sans objet par `D-61`
**Date:** 2026-09-21

## Contexte

`SEC-05` réclame une politique de sorties réseau. La liste des destinations vers lesquelles des
extraits et des invites ont le droit de partir est désormais lue depuis `config.json`, et opposée
avant qu'une intervention démarre. Deux questions se posent à l'écriture de ce lecteur, et aucune
n'a de réponse évidente.

## Décision

**Une déclaration malformée ne déclare rien.** Un fichier qui s'analyse mais n'est pas un objet —
une liste, un nombre, une chaîne — est traité comme un fichier illisible et non comme une
configuration absente : le lire comme absente restaurerait ce que le propriétaire vient peut-être
de retirer. Un `provider_id` plus long qu'un nom court est refusé et nommé par sa longueur, jamais
recopié : un diagnostic atteint l'affichage, les entrées structurées et, par un détail de blocage,
le dossier exporté. Pour la même raison, un refus nomme quelques destinations déclarées et compte
les autres au lieu d'énumérer la liste entière.

 Si une seule entrée est illisible — pas un objet, pas
de `provider_id`, une situation inconnue, un nom déclaré deux fois avec deux situations
contradictoires — la liste entière est abandonnée et aucune destination n'est déclarée. Un fichier
`config.json` illisible fait de même. Toute intervention est alors refusée, et chacun de ces états
est annoncé à l'ouverture de session.

**La destination est jugée deux fois.** Le refus est levé à l'ouverture de l'intervention, puis de
nouveau à l'entrée du superviseur qui démarre le worker.

## Motif

Le repli naturel — garder la déclaration par défaut — **élargit** ce que la liste autorise. Un
propriétaire qui écrit « anthropic et openai, pas omlx » et se trompe sur la seconde entrée voyait
`omlx` revenir en silence : la destination qu'il venait de retirer, réadmise par sa faute de frappe.
Garder le préfixe valide a le même défaut sous une autre forme : la liste effective n'est alors
celle que personne n'a écrite. Pour un contrôle dont l'objet est qu'une destination soit écrite
avant qu'on lui envoie quoi que ce soit, la seule direction cohérente est de ne rien déclarer.

Le second jugement est une défense, pas une médiation. Il ne peut plus garder le journal propre —
l'intervention y est déjà inscrite quand il s'exécute — il peut seulement arrêter le worker. Il vaut
parce que la méthode qu'il garde est publique sur une classe exportée, et qu'elle est la dernière
frappe avant l'adaptateur. Le dernier point réel avant que les octets partent est cet adaptateur,
qui ne reçoit aucune politique : l'y placer demanderait de lui en passer une.

## Conséquences

Le refus est **reprenable** : un blocage que personne ne peut lever perd le changement, et le
remède tient en une ligne de configuration que le propriétaire détient. Mais la déclaration est lue
une seule fois, quand le runtime est construit, et tenue par référence — une reprise dans la même
session est donc jugée contre la politique chargée **avant** l'édition, et bloque de nouveau. Le
message du refus le dit : la nouvelle déclaration prend effet dans une nouvelle session. Relire le
fichier à la reprise serait une autre story ; promettre une reprise qui ne peut pas marcher aurait
été pire que le silence.

Un `location` invalide refuse toute intervention, au même titre qu'un `provider_id` absent, et
c'est voulu. L'objection est réelle : ce champ ne décide d'aucun refus — il documente l'exposition,
il ne l'autorise pas — et une faute de frappe dedans arrête donc tout. Mais le refus ne juge pas ce
que le champ autorise : il juge si le fichier écrit par le propriétaire peut être cru quand il dit
ce qu'il a voulu dire. C'est exactement l'argument qui fonde le refus de la liste entière, et
l'appliquer à `provider_id` sans l'appliquer à `location` serait l'incohérence. Une déclaration
dont une partie est illisible n'est pas une déclaration à moitié bonne ; c'est une déclaration que
personne n'a écrite.

Le prix est assumé : `e23s04` écrira la première destination réellement hors machine, donc le
moment où ce champ sera le plus exposé à une faute de frappe. Le diagnostic nomme alors la
destination et les deux valeurs admises, à l'ouverture de session, avant qu'aucun refus ne survienne.

Le détail du blocage nomme les destinations déclarées, et le flux d'événements part au dossier
exporté : les noms des fournisseurs que l'installation a le droit de joindre voyagent avec tout
dossier remis à un tiers. Ce sont des noms de politique et non des secrets, mais le fait est
consigné plutôt que laissé à découvrir.
