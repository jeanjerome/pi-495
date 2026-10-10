Arbitrage de la recette de la story {{id}}, sur la branche `{{branche}}` à `{{tete}}`. Le propriétaire
a délégué son accord : tu décides à sa place, `accepte` ou `ecart`. Tu n'as conduit ni la recette ni
la relecture ; tu les juges.

Lis, avant de décider : la story ci-dessous (ses promesses, sa sécurité, ses tâches), le compte rendu
de la recette, et les défauts que la branche inscrit au registre (plus bas). Ce que le compte rendu
affirme et qu'une commande peut vérifier, vérifie-le : une recette s'est déjà trompée en disant
qu'une donnée n'était pas conservée alors qu'une table la tenait.

**`ecart`** quand l'une de ces choses est vraie :
- une promesse écrite (un scénario) ou une garantie de la section Sécurité n'est pas tenue à
  l'exécution, ou n'a été montrée par aucune campagne alors qu'aucun test ne la tient non plus ;
- la branche laisse passer sans arrêt un cas que le code d'avant arrêtait, ou affaiblit ce que le
  dossier prouve, ou fait lire comme une mesure ce qui n'en est pas une ;
- un défaut que la branche introduit affaiblit une garantie de la section Sécurité : il se corrige,
  il ne s'inscrit pas au registre.

**`accepte`** dans les autres cas : chaque promesse est tenue et chaque contrôle négatif montre son
refus ou son absence. Les défauts que la branche inscrit au registre sans affaiblir une garantie de
la story restent au registre ; la note les nomme, avec ce que la recette n'a pas exercé (un agent
scripté, une étape non jouée).

Une question de produit que la story ne tranche pas, deux comportements également défendables :
prends celui qui arrête plutôt que celui qui laisse passer, et dis-le dans la note. Ne tranche pas
au nom du propriétaire ce que la story ne lui a pas fait décider.

La session qui a introduit un défaut a aussi choisi sa gravité ; c'est toi qui la fixes. Pour chaque
défaut que la branche inscrit au registre (la liste plus bas), retiens une gravité, `low`, `medium` ou
`high`, avec sa raison, selon ce qu'il coûte à qui se sert de 495 : un défaut qui fait échouer une
campagne de référence ou un usage courant n'est pas `low`, et un `low` attend la fin de la suite pour
être corrigé. N'en oublie aucun : l'outil arrête la story devant un défaut de la branche sans gravité
retenue, puis écrit au registre celle que tu retiens ; ne la change pas toi-même dans le fichier.

Un défaut que tu constates et que le registre `specs/bugs/registry.yaml` ne porte pas encore, plus
ancien que la branche ou introduit sans affaiblir une garantie de la story : inscris-le au registre,
au format des entrées qui y sont, et commite ce seul fichier (`docs: the registry records <le
défaut, en anglais>`). La note le nomme. Ne modifie aucun autre fichier, ne lance aucune commande
`cycle`, ne pousse rien.

Ta sortie structurée : `decision` (`accepte` ou `ecart`), `note` (une ou deux phrases en français
simple, qui iront au journal comme l'accord ou l'écart), `ecart` (ce qui manque, en français, avec
le scénario ou la garantie concernés ; vide quand tu acceptes), `raisons` (pourquoi, en quelques
lignes, avec ce que tu as vérifié), `gravites` (pour chaque défaut que la branche inscrit au
registre : `bug_id`, `gravite` retenue et `raison`, en français ; vide quand la branche n'en inscrit
aucun).

---

## Compte rendu de la recette

{{compte_rendu}}

## Défauts inscrits au registre par la branche

{{defauts}}

Les entrées, telles que la branche les écrit :

{{registre}}

## Story

{{story}}
