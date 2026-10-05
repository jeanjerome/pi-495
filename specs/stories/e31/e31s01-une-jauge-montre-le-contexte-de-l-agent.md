# Une jauge sous l'éditeur montre le contexte de l'agent pendant une intervention

Story : e31s01
Epic : e31
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui suit un changement dans le terminal de Pi ne voit aujourd'hui aucune jauge qui
bouge. L'agent travaille dans une session Pi à part, et la session où il tape `/495` n'envoie rien au
modèle : la jauge de contexte du pied de page, celle de Pi comme celle d'une extension de barre d'état,
reste à 0 % pendant qu'une intervention consomme des centaines de milliers de jetons. La ligne 495 dit
les jetons cumulés et le coût estimé, pas la place qui reste à l'agent dans sa fenêtre.

Il gagne une ligne sous l'éditeur, le temps d'une intervention, qui montre le contexte de l'agent qui
travaille : une barre, le pourcentage et les jetons rapportés à la fenêtre du modèle, tels que Pi les
compte pour la session de l'agent. C'est un défaut et non une préférence : la seule jauge à l'écran
mesure une session qui ne travaille pas, et laisse croire que rien n'est consommé.

## 2. Promesses

Scenario: L'agent rapporte le contexte de sa session après chaque réponse
  Given une intervention dont l'agent tourne sur un modèle dont Pi connaît la fenêtre de contexte
  When le modèle a rendu une réponse
  Then l'agent envoie un événement de modèle de genre `context` qui porte les jetons de contexte et la fenêtre que `getContextUsage()` de sa session rend à ce moment

Scenario: La jauge apparaît sous l'éditeur à la première réponse de l'agent
  Given une session Pi en anglais où une intervention vient de commencer, et dont l'agent n'a encore rendu aucune réponse
  And aucune ligne `Agent context` n'est affichée sous l'éditeur
  When l'agent rapporte 340 000 jetons de contexte sur une fenêtre de 1 000 000
  Then la ligne sous l'éditeur est « Agent context  ██████░░░░░░░░░░░░░░  34%   340.0k / 1.0M »

Scenario: La jauge suit chaque réponse de l'agent
  Given la jauge à 34 %
  When l'agent rapporte 520 000 jetons de contexte sur la même fenêtre
  Then la ligne sous l'éditeur est « Agent context  ██████████░░░░░░░░░░  52%   520.0k / 1.0M »

Scenario: Un contexte que Pi ne connaît plus n'est jamais montré vide
  Given la jauge à 52 %
  When l'agent rapporte un contexte dont Pi ne connaît pas les jetons, comme juste après un compactage
  Then la ligne sous l'éditeur est « Agent context  ░░░░░░░░░░░░░░░░░░░░  ?   ? / 1.0M »

Scenario: La jauge disparaît quand l'intervention se termine
  Given la jauge affichée pendant une intervention
  When l'intervention se termine, qu'elle aboutisse, échoue ou soit arrêtée
  Then aucune ligne `Agent context` n'est plus affichée sous l'éditeur, et la ligne 495 du pied de page reprend la phase, le statut et la consommation

Scenario: La jauge parle la langue de la session
  Given une session Pi en français
  When l'agent rapporte 340 000 jetons de contexte sur une fenêtre de 1 000 000
  Then la ligne sous l'éditeur est « Contexte de l'agent  ██████░░░░░░░░░░░░░░  34 %   340,0 k / 1,0 M »

## 3. Sécurité

Sans objet : la jauge ne porte que deux nombres que Pi compte pour la session de l'agent, jamais un
texte de la conversation ; rien ne sort de la machine, rien n'est écrit dans le dossier, et le
confinement de l'agent est inchangé.

## 4. Tâches

### Tâche 1 — L'agent rapporte le contexte de sa session après chaque réponse

À chaque réponse du modèle, l'agent (`src/adapters/pi-worker/worker-main.ts`) lit `getContextUsage()`
de sa session Pi et envoie un événement `model_event` de genre `context`, qui porte les jetons (un
nombre, ou `null` quand Pi ne les connaît pas) et la fenêtre. Le type de l'événement
(`src/ports/execution.ts`) gagne ce genre. Quand Pi ne rend aucun contexte, faute de fenêtre connue,
rien n'est envoyé. Le chiffre est celui de Pi : 495 ne le recalcule pas.

- Vérifie : `node --test test/v3-pi/agent-context.test.ts`
- Tient : `test/v3-pi/agent-context.test.ts`, « une intervention dont le serveur local déclare 400 jetons pour la réponse, sur un modèle dont la fenêtre est de 128 000 jetons, envoie après la réponse un événement de modèle de genre `context` qui porte 400 jetons et une fenêtre de 128 000 »
- Rouge : l'agent n'envoie aujourd'hui que des événements de modèle de genre `text`, `thinking` et `usage` ; aucun événement de genre `context` ne figure parmi ceux de l'intervention, et l'assertion qui le cherche échoue

### Tâche 2 — La jauge s'affiche sous l'éditeur et disparaît à la fin de l'intervention

La boucle d'intervention (`src/application/intervention.ts`) remet chaque événement `context` au
harnais, qui le transmet à la session de l'extension comme il lui transmet déjà la progression. La
session (`src/extension/session.ts`) écrit la jauge par `ctx.ui.setWidget` sous l'éditeur
(`placement: "belowEditor"`) et la retire quand l'intervention se termine. La ligne compte vingt
cases, une case pleine par tranche entière de 5 %, plafonnée à vingt ; le pourcentage est arrondi à
l'entier ; les jetons et la fenêtre s'écrivent en milliers (`k`) ou en millions (`M`), à une décimale,
selon la langue de la session. L'agent scripté (`src/adapters/pi-worker/scripted-agent.ts`) gagne une
étape `context` qui émet cet événement, pour que la recette et les tests le jouent sans modèle.

- Vérifie : `node --test test/v3-pi/agent-context-gauge.test.ts`
- Tient : `test/v3-pi/agent-context-gauge.test.ts`, « une intervention dont l'agent scripté rapporte 340 000 puis 520 000 jetons sur une fenêtre de 1 000 000, puis un contexte inconnu, affiche successivement sous l'éditeur `Agent context  ██████░░░░░░░░░░░░░░  34%   340.0k / 1.0M`, `Agent context  ██████████░░░░░░░░░░  52%   520.0k / 1.0M` et `Agent context  ░░░░░░░░░░░░░░░░░░░░  ?   ? / 1.0M`, puis retire la ligne à la fin de l'intervention ; en français, la première ligne est `Contexte de l'agent  ██████░░░░░░░░░░░░░░  34 %   340,0 k / 1,0 M` »
- Rouge : aujourd'hui l'extension n'appelle jamais `ctx.ui.setWidget`, et l'agent scripté ignore une étape qu'il ne connaît pas ; aucune ligne n'est enregistrée sous l'éditeur pendant l'intervention, et l'assertion sur la première ligne échoue (à confirmer par une sonde sur `main` au moment du rouge)

## 5. Hors périmètre

- La jauge du pied de page de Pi, qui mesure la session où le propriétaire tape ses commandes : elle
  reste celle de Pi. Retirer l'extension `@reedchan/statusline` relève de la configuration du poste et
  du script d'enregistrement de la démonstration, pas de 495.
- Inscrire le contexte de l'agent au dossier : la jauge est un affichage, et la boucle d'intervention
  ne garde déjà aucun événement de modèle dans le journal.
- Un budget en jetons qui arrêterait une intervention : les budgets de 495 portent sur les tentatives,
  le temps et les appels d'outils ; en ajouter un est une décision de produit.
- Les surfaces sans interface (`--mode json`, `-p`) : elles n'ont pas de ligne sous l'éditeur.
- Le contexte de plusieurs agents à la fois : 495 ne lance qu'une intervention à la fois par session.
