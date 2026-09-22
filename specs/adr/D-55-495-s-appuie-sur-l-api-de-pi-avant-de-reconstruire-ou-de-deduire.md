# D-55: 495 s'appuie sur l'API de Pi avant de reconstruire ou de déduire

**Status:** Acceptée
**Date:** 2026-09-22

## Context

`CTX-02` demande que le manifeste dise ce qui a été mis devant le modèle, y compris ce qu'un
fournisseur écrit de son propre chef au-dessus des instructions de 495. `e23s02` y a répondu en
construisant deux choses : une table de domaine qui déclare, par fournisseur, le texte imposé, sa
position et la condition de son application ; et un contrôle de Preflight qui relit le code
distribué du fournisseur pour refuser tout écart avec cette déclaration.

Les deux ont été bâtis sur une hypothèse qui n'avait pas été vérifiée : que rien ne permettait
d'obtenir le fait autrement qu'en le redisant. Elle est fausse.

Pi publie `before_provider_request`, et le documente. La page *Extensions*
(`packages/coding-agent/docs/extensions.md`, lisible au tag de chaque version) la décrit comme émise « après que la
charge utile propre au fournisseur est construite, juste avant l'envoi de la requête », et énonce
la règle de retour : « renvoyer `undefined` laisse la charge inchangée ». Le point d'émission a été
lu, et il concorde :
`pi-ai/dist/api/anthropic-messages.js` appelle `onPayload(params, model)` à la ligne qui suit
`buildParams(...)` — c'est-à-dire avec le corps de requête complet, le bloc système du fournisseur
déjà composé. Le SDK de Pi câble cet `onPayload` sur l'accroche d'extension, et `runner.js`
n'applique le retour d'un gestionnaire que s'il est défini : observer ne modifie donc pas la
requête. 495 peut s'y accrocher — `src/extension/index.ts` enregistre déjà quatre accroches, et le
worker fournit son propre chargeur de ressources, dont la liste d'extensions est vide mais nous
appartient.

Le coût de l'hypothèse est mesurable. La table doit être entretenue à la main pour chaque
fournisseur. Le contrôle lit du code tiers à l'expression régulière, ce qui a coûté une ronde de
relecture entière et deux constats bloquants. Et le §6f d'`e23s02` a dû assumer une
sur-déclaration — la strate est annoncée dès que le fournisseur est retenu, même par un chemin
d'authentification où il n'impose rien — précisément parce que 495 ne pouvait pas observer la
condition. Un fait observé l'aurait rendue inutile.

Deux réserves sont venues de la documentation elle-même, et non de la lecture du code. Pi présente
cette accroche comme « surtout utile pour déboguer la sérialisation du fournisseur et le
comportement du cache » : l'API est publique et documentée, mais l'usage qu'en ferait 495 — fonder
l'intégrité d'un dossier — dépasse ce que son auteur annonce. Et la documentation décrit le Pi le
plus récent, pas celui que ce dépôt épingle : `context_with_system` et `agent_before_settle` y
figuraient alors que la version 0.86.1 ne les portait pas. `before_provider_request`, elle, y était.
Le dépôt est passé en 0.87.0 le jour même, et les deux événements manquants y sont. L'écart s'est
donc refermé par un relèvement — ce qui illustre la règle plutôt que de l'infirmer : il était réel
au moment où l'API a été cherchée, et seule la confirmation contre la version épinglée l'a montré.

Ce n'est pas un défaut de cette story mais un défaut de réflexe : 495 est une extension de Pi, et
Pi existe pour qu'il n'ait pas à reconstruire.

## Decision

495 cherche l'API de Pi avant de bâtir la capacité, et avant de déduire de l'extérieur un fait que
Pi peut rapporter de l'intérieur.

La recherche part de la documentation — <https://pi.dev/docs/latest>, ou le même corpus dans le
dépôt de Pi sous `packages/coding-agent/docs/` — et se confirme dans la surface publiée par la
version épinglée, `@earendil-works/pi-coding-agent/dist/**/*.d.ts` et les paquets pairs. Les deux
étapes comptent : la documentation décrit le Pi le plus récent, et une API qu'elle annonce n'est pas
une API que ce dépôt possède. Ce qui est bâti sur une API dit contre quelle version elle a été
confirmée.

Là où les deux existent, le fait rapporté par Pi est la source, et ce que 495 redit ne vaut plus que
comme attente. Le code dit laquelle des deux natures porte une valeur.

Quand aucune API ne couvre le besoin, le contournement nomme, à l'endroit où il vit, ce qui a été
cherché et non trouvé — de sorte qu'il puisse être supprimé le jour où l'API arrive.

S'appuyer sur Pi ne plie pas le sens des couches : l'API reste atteinte par `extension/` ou
`adapters/pi-worker/`, et nulle part ailleurs.

La règle est écrite dans `CONVENTIONS.md` § *Pi is the host, not one dependency among others*, et
rappelée dans `AGENTS.md` § *Conventions*.

## Consequences

`e23s06` est ouverte : le dossier enregistrera la strate imposée telle que le fournisseur l'a
écrite, relevée dans la charge utile de la requête plutôt que déduite d'une table. Elle ne corrige
pas `e23s02` — elle la remplace comme source de ce que le modèle a reçu, ce qui suppose que la
déclaration existe et ait été éprouvée d'abord. Sa position dans l'epic le dit.

Ce que `e23s02` a construit garde une valeur moindre et nommée : la table devient une attente
opposable à l'observation, et `lint:provider-block` un contrôle d'écart entre les deux. Ce qu'il en
reste est tranché par `e23s06`, pas ici.

Quatre limites sont acquises avant même de commencer, et cette décision ne les efface pas. Pi passe
la charge utile sans la typer : la lire revient à dépendre de la forme du corps de requête du
fournisseur, ce qui est un couplage différent et non l'absence de couplage. Le manifeste de contexte
est écrit avant l'intervention alors que la charge utile n'existe qu'à l'émission de la requête :
déclaré et observé sont deux faits à deux instants, et où s'inscrit le second est une question de
conception ouverte. L'observation ne couvre que les requêtes que le worker de 495 émet lui-même.
Enfin, Pi annonce cette accroche comme un outil de débogage : rien ne promet la stabilité qu'un
dossier opposable demande, et `e23s06` doit dire ce qu'elle fait le jour où l'accroche change ou
disparaît.

La règle vaut au-delà de cette story. Tout endroit où 495 entretient une table, analyse un fichier
ou relit du code tiers pour établir un fait devient un candidat à relecture sous ce critère : Pi
le rapporte-t-il déjà ?
