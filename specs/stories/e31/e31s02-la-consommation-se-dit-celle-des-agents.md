# La consommation que montre 495 se dit celle de ses agents

Story : e31s02
Epic : e31
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui suit un changement dans le terminal de Pi lit deux coûts qui se contredisent. Le pied
de page de Pi affiche `$0.000 (sub) 0.0%/1.0M (auto)` : c'est la consommation de la session où il tape
ses commandes, qui n'envoie rien au modèle. Juste en dessous, la ligne 495 affiche `495 closed/completed ·
72.0k tokens · ~$0.11 (sub)` : c'est ce que les agents de 495 ont dépensé dans leurs propres sessions.
Rien ne dit que les deux chiffres ne mesurent pas la même chose, et le second semble démentir le premier.
Le statut écrit de même `Used    72.0k tokens · ~$0.11 (sub)`.

Il gagne une ligne 495 et un statut qui disent à qui revient la dépense : les agents de 495. C'est un
défaut et non une préférence : deux montants sans sujet pour la même session font douter de l'un ou de
l'autre, et Pi n'offre pas encore aux extensions de compter leur consommation dans les totaux de la
session.

## 2. Promesses

Scenario: La ligne 495 du pied de page dit que la consommation est celle des agents
  Given une session Pi en anglais liée à un changement dont les interventions ont consommé 72 000 jetons pour environ 0,11 $ sur abonnement
  When la ligne 495 du pied de page s'affiche, pendant une intervention comme après la fin du changement
  Then elle se termine par « · agents 72.0k tokens · ~$0.11 (sub) »

Scenario: Le statut dit que la consommation est celle des agents
  Given le même changement
  When le propriétaire tape `/495 status`
  Then la ligne de consommation est « Spent by agents   72.0k tokens · ~$0.11 (sub) », alignée sur la ligne `Next`

Scenario: Avant toute intervention, rien n'est dit de la consommation
  Given un changement dont aucune intervention n'a encore consommé de jeton
  Then la ligne 495 du pied de page ne nomme pas les agents, et le statut n'a pas de ligne de consommation

Scenario: La consommation parle la langue de la session
  Given une session Pi en français et le même changement
  Then la ligne 495 se termine par « · agents 72,0 k jetons · ~0,11 $ (abonnement) »
  And la ligne de consommation du statut est « Dépensé par les agents   72,0 k jetons · ~0,11 $ (abonnement) »

## 3. Sécurité

Sans objet : la story ne change que deux libellés ; aucun montant, aucune donnée et aucun confinement ne
change, et rien ne sort de la machine.

## 4. Tâches

### Tâche 1 — Le statut nomme les agents dans sa ligne de consommation

Le libellé de la ligne de consommation de `formatStatus` (`src/presentation/structured/text.ts`) devient
« Spent by agents » en anglais et « Dépensé par les agents » en français ; la largeur des libellés suit.

- Vérifie : `node --test test/v0-pure/status-agents-consumption.test.ts`
- Tient : `test/v0-pure/status-agents-consumption.test.ts`, « le statut d'un changement dont les interventions ont consommé 72 000 jetons pour ~0,11 $ sur abonnement a la ligne `Spent by agents   72.0k tokens · ~$0.11 (sub)` en anglais et `Dépensé par les agents   72,0 k jetons · ~0,11 $ (abonnement)` en français, et un changement sans consommation n'a pas de ligne de consommation »
- Rouge : le libellé vaut aujourd'hui `Used` en anglais et `Utilisé` en français ; la ligne attendue n'existe pas

### Tâche 2 — La ligne 495 du pied de page nomme les agents

La ligne que `footer` (`src/extension/session.ts`) écrit par `ctx.ui.setStatus("495", …)` fait précéder
la consommation de « agents ».

- Vérifie : `node --test test/v3-pi/footer-agents-consumption.test.ts`
- Tient : `test/v3-pi/footer-agents-consumption.test.ts`, « une intervention dont l'agent scripté déclare 72 000 jetons et un coût sur abonnement laisse une ligne 495 qui se termine par `· agents 72.0k tokens · ~$0.11 (sub)` en anglais et `· agents 72,0 k jetons · ~0,11 $ (abonnement)` en français, et un changement sans consommation garde une ligne 495 sans `agents` »
- Rouge : `footer` écrit aujourd'hui `${head} · ${used}`, soit `495 closed/completed · 72.0k tokens · ~$0.11 (sub)`, sans `agents`

## 5. Hors périmètre

- Compter la consommation des agents dans les totaux de la session de Pi, que son pied de page affiche :
  Pi ne l'ouvre pas encore aux extensions (`SessionManager.appendUsage` existe, mais une extension ne reçoit
  qu'un gestionnaire de session en lecture seule). Une demande est rédigée pour Pi ; une story y viendra
  quand l'API existera.
- Remplacer le pied de page de Pi (`ctx.ui.setFooter`) : 495 referait l'affichage de Pi et écraserait celui
  de l'utilisateur ou de son thème.
- Le pourcentage de contexte du pied de page de Pi, qui mesure la session principale : la jauge « Agent
  context » de e31s01 montre déjà celui de l'agent.
