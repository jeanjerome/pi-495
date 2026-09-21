# D-52: Une commande `verify:` s'écrit rouge, et ce qui demande une main s'écrit `verify-script:`

**Status:** Acceptée
**Date:** 2026-09-21

## Context

`slice-tasks` et `plan-work` exigent que chaque tâche porte une commande `verify:` exécutable. 495 y
avait lu l'obligation d'écrire une commande qui passe, donc de connaître le travail avant de l'avoir
conçu, donc — faute de mieux — de fabriquer une commande qui a l'air exécutable sans l'être. `D-45`
a refusé de le faire et s'est arrêté là.

La procédure dit l'inverse. `plan-work` impose que toute tâche naisse en `status: failing` et ne
bascule en `passing` qu'après que sa commande soit sortie en 0 pendant `develop-tdd` ou
`verify-work` : « never pre-mark passing at plan time ». La commande écrite au moment du plan est
donc attendue rouge.

## Decision

Une commande `verify:` nomme le test qui n'existe pas encore. `node --test test/v2/…` sur un fichier
absent est une commande exécutable qui échoue, et cet échec est le rouge du rouge-vert, pas un
défaut du plan. Ce qui serait fabriqué, c'est une commande verte par construction — `echo "ok"` —
que la documentation amont range d'ailleurs en anti-motif.

Ce qui demande une manœuvre humaine — une intervention réellement facturée, une mesure qui attend un
signal du propriétaire — s'écrit `verify-script:`, et ses étapes sont écrites dans la story. La
règle dure de `slice-tasks` ouvre explicitement cette porte ; l'emprunter est plus honnête que
d'emballer une manœuvre humaine dans une commande qui prétend la conduire.

Une commande `verify:` désigne un comportement observable, pas une étape d'implémentation. Le
comportement se connaît depuis l'exigence, avant que la conception existe : c'est ce qui rend la
commande écrivable au moment du plan.

## Consequences

Une capsule d'epic peut être écrite avant que le travail soit conçu, ce qui est le but d'un plan.
Le fichier de tâches est un journal de rouges qui deviennent verts, et son état se lit sans
interpréter : une tâche en `failing` n'est pas une tâche en retard, c'est une tâche pas encore
faite.

495 possède déjà l'essentiel du vocabulaire exécutable : `npm run check` et chacun de ses contrôles,
`npm run contracts`, `npm run test:v0` à `test:v3`. Une commande `verify:` qui s'appuie dessus est
rouge aujourd'hui pour la seule raison qui vaille — le test visé n'est pas écrit.

Le dernier paragraphe de `D-45` cesse d'être exact sur ce point : écrire un `verify:` pour du travail
non encore conçu ne produit pas un fichier qui a l'air exécutable sans l'être, à condition que la
commande soit lue comme une cible et non comme une preuve.

**Limite :** rien ne contrôle qu'une commande `verify:` est exécutable. Preflight tient le format des
stories, pas le contenu des fichiers de tâches. Une commande qui ment reste possible ; elle se
découvre au premier `develop-tdd` qui la lance.
