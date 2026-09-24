# D-61: Le modèle choisi dans Pi est admis, et sa situation est observée

**Status:** Acceptée ; remplace la déclaration obligatoire des destinations, rend `D-53` sans objet
**Date:** 2026-09-24

## Contexte

`SEC-05` réclame une politique de sorties réseau. Pour le canal modèle, `e23s01` l'avait écrite comme
une liste `policy.egress` dans `config.json` : chaque destination vers laquelle des extraits et des
invites pouvaient partir y était nommée et située, sur la machine ou hors d'elle, et une intervention
dont le fournisseur n'y figurait pas était refusée. `D-53` réglait ce qu'une liste malformée
déclarait.

Cette liste demandait une seconde fois un consentement déjà donné. Choisir un modèle avec `/model`,
c'est déjà accepter de lui envoyer ce que la session contient. Et elle ne bornait que le canal de
495 : l'agent de Pi joint le même fournisseur dans la même session, sans la lire. Son défaut, `omlx`,
était la configuration d'une seule machine : tout autre utilisateur était refusé au premier
`/495 start`, et le README consacrait une étape du démarrage à contourner ce refus.

Le propriétaire a décidé le 2026-09-23 qu'il n'y a plus de configuration de modèle dans
`config.json`, puis le 2026-09-24 que ce fichier est validé contre un schéma strict. Les stories
`e25s01`, `e25s02`, `e25s03` et `e25s05` l'ont mis en œuvre ; cette décision dit l'état d'arrivée.

## Décision

**Le modèle choisi dans Pi est admis.** Son fournisseur n'a pas à être écrit ailleurs, et aucune
intervention n'est refusée au motif de sa destination. `config.json` ne porte plus aucune
configuration de modèle.

**`config.json` est validé contre un schéma strict.** Le schéma est le contrat
`contracts/v1/harness-config.json`, fermé à chaque niveau. Une clé qu'il ne nomme pas fait refuser
le fichier, et `policy.egress` en est une : une liste restée dans un fichier existant arrête tout
changement, avec un motif qui dit que la liste n'est plus lue, sans la reproduire. Le refus nomme
l'emplacement des écarts, jamais leur valeur. Il est levé par la correction du fichier suivie d'un
rechargement de Pi (`/reload`) ou d'une nouvelle session.

**Le modèle est lu au démarrage de chaque intervention**, dans le contexte de la commande, et non
une fois à l'ouverture de session. Un modèle choisi par `/model` vaut pour l'intervention suivante ;
une intervention en cours garde celui avec lequel elle a démarré.

**Sa situation est observée, pas déclarée.** Elle est lue de l'adresse que Pi tient pour le modèle.
Seule une adresse de bouclage — `localhost`, `127.0.0.0/8`, `::1` — le situe sur la machine. Une
adresse absente, illisible, ou un nom qui ressemble seulement au bouclage le situe hors d'elle : un
doute s'annonce au lieu de se taire. La situation est inscrite au journal à chaque démarrage
d'intervention, avec le fournisseur et le modèle, sans l'adresse.

**Un modèle hors de la machine est annoncé, sans rien bloquer**, à l'ouverture de session et à
chaque changement de modèle. L'annonce nomme le fournisseur et le modèle, jamais l'adresse, qui peut
porter un jeton ou un chemin privé. Un modèle sur la machine n'est pas annoncé.

**Sur le canal modèle, la politique de sorties réseau de `SEC-05` est le choix du modèle dans
Pi.** Il n'existe plus de seconde autorisation. Le reste de `SEC-05` ne change pas : la liste fermée
des variables d'environnement remises au worker (`PATH`, `HOME`, `TMPDIR`), l'expurgation de
l'export, et l'absence de secret sur une ligne de commande.

## Motif

Pi tient le catalogue des modèles et l'adresse de chacun (`D-55`). Une liste que 495 maintient à
côté redit un fait que l'hôte connaît, et diverge dès que l'utilisateur change de modèle ou que Pi
change d'adresse. L'adresse lue est un fait mesuré ; la situation écrite dans une liste était une
croyance. Qui veut restreindre les modèles joignables le fait dans Pi, qui les connaît et qui borne
aussi son propre agent.

Refuser la liste restée dans un fichier plutôt que l'ignorer tient à ce qu'elle a été écrite par
quelqu'un qui croyait qu'elle bornait les destinations. L'ignorer en silence, ou en l'annonçant
seulement, laisserait partir des extraits vers un fournisseur qu'il pensait exclu. Le refus le lui
dit avant qu'aucune intervention ne démarre.

Lire le modèle à chaque intervention suit le parcours du premier usage : on ouvre Pi, on choisit
son modèle, puis on lance `/495 start`. Lu une seule fois à l'ouverture, il aurait joint un modèle
que l'utilisateur venait de quitter.

## Conséquences

`D-53` est rendue sans objet : il n'y a plus de liste à déclarer, bien ou mal. Ce qui en reste est
qu'un `config.json` illisible ou invalide arrête toujours tout changement. Le motif n'est plus de ne
pas élargir une liste de destinations ; c'est de ne pas remettre au noyau un arbitrage que le
fichier réservait peut-être à un humain.

Ce qu'un modèle distant reçoit sort de la machine sans autre déclaration que son choix dans Pi. Le
dossier en garde la trace : la situation de chaque intervention au journal, et le modèle réellement
joint dans la ligne de coût de sa fin, que le worker écrit à partir du modèle qu'il a résolu.

Trois limites restent :

- Une extension de la session qui redéfinit l'adresse d'un fournisseur fait lire à 495 une adresse
  que le worker ne joint pas. Elle n'est pas mesurée.
- Une adresse de réseau local privé est située hors de la machine. C'est exact au sens strict, et
  l'annonce qu'elle provoque est voulue.
- La section `<cwd>` que Pi ajoute à l'invite de 495, et qui part chez le fournisseur avec chaque
  requête, reste une question ouverte du propriétaire. Elle porte sur les données qui sortent, pas
  sur la destination admise.
