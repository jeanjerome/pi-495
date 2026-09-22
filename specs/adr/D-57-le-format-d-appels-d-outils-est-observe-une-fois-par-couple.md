# D-57: Le format d'appels d'outils est observé, une fois par couple et par session

**Status:** Acceptée
**Date:** 2026-09-22

## Context

`AGT-01` demande que le harnais refuse un profil incompatible avant une intervention facturée,
« lorsque l'incompatibilité est détectable localement ». `AGT-02` ajoute qu'un endpoint local
dépourvu du format d'appels d'outils requis doit produire une erreur de capacité lisible, et que
« une compatibilité annoncée "OpenAI" ne constitue pas une preuve suffisante ».

Ce que l'hôte rapporte a été relevé sur la version épinglée, `0.87.0`. Le catalogue dit si le couple
existe et si le fournisseur est authentifié ; le modèle porte la fenêtre de contexte, le plafond de
sortie, les modalités d'entrée, le dialecte d'API, et `getSupportedThinkingLevels` en dérive les
niveaux de raisonnement acceptés. Tout cela se lit sans requête et sans réseau.

Le format d'appels d'outils n'y est pas. Ni `Model` de `pi-ai`, ni la définition de modèle que
`models.json` accepte ne portent de champ de capacité d'outils : la seule chose déclarée est le
dialecte, et un serveur compatible dans sa forme l'annonce qu'il honore les appels d'outils ou non.
Le cas n'est pas théorique — `llama.cpp` n'active les gabarits compatibles et les appels d'outils
qu'avec `--jinja`, et rien dans la déclaration ne dit lequel des deux serveurs répond.

Aujourd'hui, un endpoint qui n'appelle pas d'outil conduit l'intervention jusqu'au bout : la session
rend de la prose, la sortie structurée est refusée, et le dossier porte un échec dont la cause n'est
pas nommée. Le coût est une intervention entière.

## Decision

495 observe le format d'appels d'outils au lieu de le déduire de la déclaration ou d'en tenir une
table. L'observation est une requête, conduite par l'hôte, présentant un seul outil trivial ; la
réponse l'établit ou l'infirme selon qu'elle appelle l'outil. Son texte est fixe et ne porte rien du
projet — ni extrait, ni invite, ni chemin.

Elle n'est tentée qu'une fois les vérifications gratuites passées : un couple absent du catalogue ou
un fournisseur non authentifié ne produit aucune requête. Son résultat est tenu pour le couple, le
temps de la session : dix interventions sur le même modèle l'observent une fois.

Ce qu'une observation n'établit pas — délai dépassé, connexion refusée, erreur du fournisseur —
reste non établi, et le refus porte le message reçu. L'absence de moyen de vérifier n'est pas une
vérification réussie.

La règle ne distingue pas les fournisseurs. Un fournisseur intégré au catalogue de l'hôte est
observé comme un endpoint déclaré à la main, parce que distinguer les deux reviendrait à décider
quelles annonces 495 croit — une table de confiance, c'est-à-dire ce que `D-55` écarte.

## Consequences

Une session paie une requête minimale par modèle. Sur un fournisseur facturé, c'est le prix nommé de
la qualification, à opposer à l'intervention qu'il évite : vingt minutes et cent appels d'outils de
budget. `e23s05` remesurera les budgets sur un modèle frontière et pourra reprendre ce chiffre.

Le rythme est le sujet ouvert. Une observation par couple et par session est le choix le plus simple
qui soit honnête ; retenir le résultat au-delà de la session demanderait une clé et une péremption,
donc de décider ce qui rend une qualification caduque — une version de modèle, un endpoint qui a
changé de serveur derrière la même adresse. La question est portée à la story et due avant la
campagne.

L'observation est une sortie de données vers le fournisseur, et elle emprunte la porte que `e23s01`
a posée : la destination est jugée contre les sorties déclarées avant que la description soit
demandée, donc aucune requête ne part vers un fournisseur non déclaré.

Ce que le worker vérifiait tardivement — le couple au catalogue, l'authentification du fournisseur —
est désormais vérifié avant lancement. Le constat tardif n'est pas retiré : il devient inatteignable
en marche normale et reste le filet du cas où la configuration change entre la description et le
démarrage.

Le jour où l'hôte rapportera la capacité d'outils d'un modèle, l'observation se supprime : le module
qui la porte nomme, à l'endroit où elle vit, ce qui a été cherché et non trouvé.
