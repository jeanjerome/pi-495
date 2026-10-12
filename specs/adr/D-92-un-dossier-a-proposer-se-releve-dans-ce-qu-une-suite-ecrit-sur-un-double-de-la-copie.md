# D-92: Un dossier à proposer se relève dans ce qu'une suite écrit sur un double de la copie, sous macOS comme sous Linux

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-12) ; remplace `D-90` règle 3
**Date:** 2026-10-12

## Contexte

`D-90` règle 3 fait proposer au propriétaire un dossier qu'un contrôle n'a pas pu écrire. Sous macOS, la proposition
vient des refus que le noyau publie en direct : 495 lit `log stream` pendant le contrôle, puis fait refuser un témoin
dont la lecture clôt celle des refus. Sous Linux, aucune source sûre n'existait, et la proposition devait venir de la
sortie du contrôle.

Le 12 octobre, une Preflight a rougi sur l'évidence d'un contrôle refusé en écriture : la liste des refus lus était
vide. Les essais de ce jour, sur cette machine (macOS 27.0.1), établissent que le journal du système perd ces refus :

- un second lecteur `log stream`, indépendant de 495, manque les mêmes refus ; le témoin, lui, arrive ;
- un lancement perd tous ses refus ou aucun : sur une série de vingt lancements de `node`, quatre n'ont rien publié ;
- la perte vient par périodes, plus souvent quand des lecteurs du journal s'ouvrent et se ferment en rafale, comme
  dans la suite complète ; aucune condition ne la provoque à coup sûr ;
- le système ne garde pas ces refus : `log show` ne les rend pas après coup, et aucune ligne ne signale la perte.

Le témoin ne prouve donc pas que tout a été lu, et aucun délai n'y change rien. Aucune autre source ne donne les refus
sans droits d'administrateur : le profil Seatbelt n'écrit plus de trace, son action `send-signal` ne porte aucun
chemin, et `fs_usage`, `dtrace` ou Endpoint Security demandent l'administrateur ou une autorisation d'Apple.

La proposition n'a pourtant besoin que d'une chose : les dossiers de premier niveau de la copie que la suite écrit.
Ceux-là se voient dans la copie elle-même. Lancée sur un double jetable où l'écriture est permise, la suite crée ce
dont elle a besoin. La comparaison des arborescences avant et après le dit, sans rien lire de ce que le candidat écrit
dans sa sortie. Essayé le même jour sur un clone de pi-495 : un fichier de tests lancé sous Seatbelt, seul le clone
inscriptible, laisse exactement `test-output/`.

## Décision

1. **Un dossier à proposer se relève dans la copie, pas dans un journal.** Après une préparation refusée, 495 relance
   la suite une fois sur un double jetable de la copie, où l'écriture est permise dans tout le double et nulle part
   ailleurs. Les chemins créés ou modifiés pendant ce relevé donnent les dossiers proposés, par leur premier niveau
   sous la copie.
2. **Le même relevé vaut sous macOS et sous Linux.** Sous les deux, la proposition vient de fichiers que la suite a
   réellement écrits, et non d'un texte qu'elle a produit. La proposition d'après la sortie du contrôle n'est pas
   construite.
3. **Le relevé reste confiné.** Le réseau, les lectures et les écritures hors du double restent ceux du contrôle. Le
   double est supprimé après le relevé, et rien de ce que la suite y écrit ne rejoint la préparation.
4. **Sous macOS, l'effacement est interdit pendant le relevé**, si bien qu'un dossier créé puis effacé par la suite
   reste visible. bubblewrap ne sait pas interdire le seul effacement : sous Linux, un tel dossier n'est pas relevé.
5. **Rien n'est accordé sans le propriétaire**, comme le veut `D-90`. Le relevé propose ; seule sa réponse écrit la
   configuration du contrôleur.

## Conséquences

La lecture de `log stream`, le repère posé dans le profil Seatbelt et le refus témoin disparaissent. Avec eux
disparaît la lecture qui pouvait survivre au processus qui l'avait démarrée.

L'évidence d'un contrôle ne porte plus les écritures refusées, ni par conséquent celles qui visaient un chemin hors de
la copie. Une telle écriture n'était jamais proposée (`D-76`) ; elle reste visible comme aujourd'hui, par l'erreur
qu'elle cause dans la sortie du contrôle.

Une préparation refusée coûte un lancement de plus de la suite. Une préparation retenue n'en coûte aucun.

La suite peut se conduire autrement quand elle écrit librement : elle va plus loin et peut révéler d'un coup plusieurs
dossiers, là où chaque refus l'arrêtait au premier. Sous macOS, une suite qui échoue sur son nettoyage peut s'arrêter
plus tôt et laisser un dossier non relevé, que la tentative suivante relèvera.

La story Linux qui devait proposer d'après la sortie du contrôle sort du plan. La phrase de `D-90` selon laquelle,
sous Linux, le propriétaire est la seule barrière ne vaut plus.
