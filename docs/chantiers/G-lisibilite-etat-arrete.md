# Transverse G — la lisibilité de l'état d'un changement arrêté

**État :** ouvert
**Objet :** ce qu'un écran dit d'un changement arrêté : la cause répétée trois fois, la notification
qui reprend la ligne la moins décisive, et des risques résiduels qui sont pour deux tiers les traces
d'une qualification réussie
**Ne dépend d'aucun étage**

## Motif

Première observation dans un vrai terminal, sur un changement réellement arrêté à G2
(`chg_mu5y1z75187d74d1ff`, cible Maven, voir `../QUALIFICATION.md`). Rien n'est tronqué, les trois
sections du rapport tiennent, la liaison se retrouve par le répertoire courant. Trois écarts sortent
malgré tout de la tâche « lire le résultat d'un changement refusé et dire pourquoi il l'a été », et
les trois portent sur le tri de l'information, pas sur son exactitude.

**La cause, trois fois.** `nextActionOf` rend `blocked: <stop_reason> — <stop_detail>` pour un
changement bloqué, si bien que `Motif d'arrêt` et `Prochaine action` portent le même texte, mot pour
mot. Ce texte fait ici environ 500 caractères : six des quatorze lignes du statut sont la même
phrase. Le rapport la redonne une troisième fois sous `stopped_before_the_end`. Un champ nommé
« prochaine action » qui répète la cause ne dit aucune action.

**La notification, sur la ligne la moins utile.** `emit` notifie `text.split("\n")[0]`. Pour
`/495 status`, cette première ligne est le titre du programme et le chemin du projet ; ce qui motive
l'arrêt n'y est pas.

**Les risques résiduels d'un capteur, comptés comme ceux du changement.** Douze risques résiduels sont
rendus, dont huit sont produits par la qualification elle-même : l'`INDETERMINATE` du témoin
d'incident de chaque contrôle, et la note `spawn error … /nonexistent/495-broken-runner` qui
l'accompagne. Ces deux faits sont la preuve que le capteur détecte une panne de capteur — leur
absence serait le risque. Leur sujet est `fixture`, pas `candidate` ; la boucle qui construit les
risques ne lit pas `subject_kind`, alors que le risque `controls_are_not_a_proof` du même fichier
l'utilise déjà. Sur cet écran, les quatre lignes qui concernent vraiment le changement — dont celle
qui nomme la cause de l'arrêt — sont noyées dans les huit autres.

Le même compte sur un changement **accepté** — cycle complet sur la cible de démonstration, deux
contrôles qualifiés, `unit=PASS lint=PASS` — donne cinq risques résiduels dont quatre sont ces mêmes
traces de témoins ; le seul qui porte sur le changement est `controls_are_not_a_proof`. La section des
observations mécaniques, elle, nomme correctement ses trois sujets : six exécutions sur `fixture`,
deux sur `reference`, deux sur `candidate`. La distinction existe donc déjà dans les données.

Aucun de ces trois écarts n'est un défaut de mesure : ce sont trois décisions de projection.

## Prompt

```
Dans ~/Projets/495-pi-package, lis la section « Observation partielle dans un vrai terminal »
de docs/revues/R4-ux-accessibilite.md, puis nextActionOf dans src/application/views.ts,
formatStatus dans src/presentation/structured/text.ts, emit dans src/extension/index.ts, et
engineeringReport dans src/application/report.ts.

Trois travaux, indépendants.

1. La prochaine action d'un changement bloqué. Décide ce que ce champ doit porter — l'action
   atteignable, ou rien s'il n'y en a aucune — et fais en sorte que la cause soit dite une
   fois. Le rapport garde son `stopped_before_the_end` : c'est un document lu seul.

2. La notification d'une commande dans le TUI. Elle doit porter la ligne décisive de l'écran,
   pas la première. Dis ce qui est décisif pour chaque commande plutôt que de choisir une
   ligne par index.

3. Les risques résiduels. Un fait observé sur un témoin de qualification n'est pas un risque
   résiduel du changement : c'est l'inverse, c'est la preuve que le capteur répond. Sépare les
   deux en lisant le sujet de la preuve, sans faire disparaître ce qui doit rester dit — un
   capteur non qualifié reste un risque, et l'`INDETERMINATE` d'un contrôle sur le candidat
   aussi. Le rapport est lu sans modèle et sans Pi : ce qu'il retire d'une section doit
   rester trouvable dans une autre.

Critères d'acceptation :
- un test déterministe sur un changement bloqué montre la cause dite une fois et une action
  suivante qui n'est pas la cause ;
- un test montre qu'un rapport dont tous les contrôles sont qualifiés ne porte aucun risque
  résiduel issu d'un témoin, et qu'un capteur non qualifié en porte toujours un ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Action suivante d'un changement bloqué | `src/application/views.ts`, `nextActionOf` |
| Rendu du statut | `src/presentation/structured/text.ts`, `formatStatus` |
| Notification TUI d'une commande | `src/extension/index.ts`, `emit` |
| Construction des risques résiduels | `src/application/report.ts`, `engineeringReport` |
| Sujet d'une preuve | `src/contracts/v1/evidence.ts`, `subject.kind` |
| Constats d'origine | `docs/revues/R4-ux-accessibilite.md` |

## Journal

**17 septembre 2026.** Ouverture. Les trois constats viennent de la première observation dans un
vrai terminal, à environ 205 colonnes, sur `/495 status`, `/495 report` et `/495 resume`. Ils sont
enregistrés dans le dossier `R4`, qui reste en attente : l'observateur est l'auteur, le mode étroit
n'est pas exercé et aucun lecteur d'écran n'a servi.

**19 septembre 2026.** Le constat se reproduit sur la campagne Flash-Next, et en plus net : sur les
douze lignes de risques résiduels du rapport d'un changement **accepté**, onze ne portent pas sur le
candidat — quatre témoins d'incident, quatre messages de capteur volontairement cassé, un
contre-exemple de mutation, deux passages de référence — et la seule qui parle du changement est
`controls_are_not_a_proof`.

Deux points nouveaux s'y ajoutent. D'abord une ligne **dit le contraire du fait mesuré** : « control
coverage: the candidate introduces no line JaCoCo measures » est portée par le passage de référence,
dont le sujet est la référence, alors que le contrôle a mesuré 2 lignes sur le candidat sans porter
aucune limite. Le mot « candidate » dans une limite de référence induit la conclusion inverse.
Ensuite, les observations mécaniques affichent le digest de la référence comme sujet des douze
témoins, si bien que témoin positif, contre-exemple et incident d'un même contrôle sont
indiscernables et que des `FAIL` et `INDETERMINATE` attendus se lisent comme des échecs.

Ces deux points débordent le cadre d'origine de la fiche, qui portait sur l'état d'un changement
**arrêté** : ils se produisent sur un changement abouti, et c'est là qu'ils coûtent le plus, puisque
le rapport est alors ce qu'un lecteur oppose à un candidat accepté.
