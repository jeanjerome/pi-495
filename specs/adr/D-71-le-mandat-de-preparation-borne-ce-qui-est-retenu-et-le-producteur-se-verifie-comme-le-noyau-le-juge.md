# D-71: Le mandat de préparation borne ce qui est retenu, et le producteur se vérifie comme le noyau le juge

**Status:** Acceptée ; révise `D-14`
**Date:** 2026-09-28

## Contexte

Une préparation est une intervention bornée qui écrit, dans une copie de la référence, les tests
qu'aucun contrôle de la cible ne peut remplacer ; le noyau les juge sur la référence nue et les
adopte s'ils y échouent (`SA-008`, `SA-009`, `PRE-03`). Trois choses que 495 disait au producteur
de cette intervention, et à celui de l'implémentation, se contredisaient ou le trompaient.

- **Le mandat interdisait la vérification que la consigne exigeait.** La consigne ordonnait de
  lancer les contrôles gelés avant de répondre ; l'objectif du mandat disait que seuls les fichiers
  sous les racines de test pouvaient être créés ou modifiés ; et le noyau refusait toute la
  préparation dès qu'un chemin sortait de ces racines, tests corrects compris. Un producteur qui se
  vérifiait autrement que par la commande exacte du contrôle — un script, un journal, une liste de
  sources — payait sa préparation entière. Sur la cible Maven, le 18 septembre 2026, onze fichiers
  de travail sous `.verify-scratch/` ont fait refuser quatre tests discriminants, jugés `FAIL` sur
  la référence, chargeables ; la campagne a coûté 55,7 min et 7,4 M de jetons là où un seul essai
  aurait coûté 32,5 min et 2,5 M (le travail sur le mandat de préparation contradictoire, retiré de l'arbre : `git log --diff-filter=D -- specs/archive/chantiers`,
  `specs/archive/QUALIFICATION.md`). Celui qui passait par `mvn test` n'était sauvé que parce que
  `target/` est exclu du manifeste, ce que le prompt ne disait nulle part.
- **Une commande annoncée ne lançait rien.** Les contrôles qui lisent un rapport laissé par un autre
  contrôle, ou le code lui-même — `coverage` lit le rapport JaCoCo de `mvn test`, `structure` lit
  les déclarations Java — ont pour commande le déclencheur vide `node -e ""`, qui n'existe que pour
  garder un seul exécuteur. Le prompt le rendait tel quel : « `node -e ` in the workspace root
  (coverage) ». Le producteur recevait l'ordre de lancer une commande vide, et rien sur ce qui
  serait lu de son arbre.
- **Le producteur se vérifiait dans un autre environnement que celui des contrôles.** Le profil de
  toute intervention ne laissait passer que `PATH`, `HOME`, `TMPDIR` et `LANG` ; les contrôles
  reçoivent en plus `LC_ALL`, `JAVA_HOME` et `MAVEN_OPTS`. Une intervention voyait donc un autre
  JDK que celui devant lequel son travail serait jugé, et une vérification passée chez elle pouvait
  échouer chez le noyau sans qu'elle puisse le voir.

Le lecteur du dossier ne pouvait pas distinguer un producteur incapable d'un producteur à qui l'on
avait demandé deux choses inconciliables : 495 punissait l'obéissance à sa propre consigne.

## Décision

1. **Le mandat borne ce qui est retenu, pas ce qui est écrit.** Ce qu'une préparation écrit sous les
   racines de test est retenu ; ce qu'elle écrit ailleurs est ignoré et nommé dans le dossier comme
   écrit hors du mandat et non retenu, jamais refusé. Seule reste refusée une entrée sous une racine
   dont rien ne peut être retenu : une suppression, ou ce qui n'est pas un fichier. Le jugement sur
   la référence porte sur la référence nue plus les fichiers retenus, dans une copie qui n'a jamais
   vu le reste : la fonctionnalité qu'un producteur écrirait à côté de ses tests n'y est pas, les
   tests y échouent ou non pour ce qu'ils valent, et elle n'entre ni dans la suite adoptée ni dans
   l'arbre que reçoit l'implémentation. Une préparation qui ne retient aucun test reste refusée avec
   la note « no test file was produced », et le retour au producteur nomme les chemins écrits hors
   du mandat. L'objectif du mandat dit cette règle et non l'ancienne : seuls les fichiers sous les
   racines sont retenus, et ce qui est écrit ailleurs pour se vérifier est ignoré.
2. **Un contrôle qui ne lance rien n'est pas présenté comme une commande.** La consigne de
   vérification d'un rôle qui écrit ne nomme comme commandes à lancer que les contrôles qui
   exécutent quelque chose. Un contrôle dont la commande est le déclencheur vide est nommé avec ce
   qu'il lit, par son titre : « coverage (introduced-line coverage, read from the JaCoCo report of
   mvn test) ». Le déclencheur vide a un nom dans le code, et c'est ce nom que la consigne reconnaît.
3. **Le producteur reçoit l'environnement des contrôles.** Le profil des rôles `prepare` et
   `implement` laisse passer la liste de variables que les contrôles reçoivent — `PATH`, `HOME`,
   `TMPDIR`, `LANG`, `LC_ALL`, `JAVA_HOME`, `MAVEN_OPTS` —, la même constante, pour que ce qu'il
   lance pour se vérifier soit ce que le noyau lancera : même JDK, même locale, mêmes options Maven.
   Les rôles qui ne font que lire gardent le profil d'aujourd'hui.

**Ce qu'elle révise.** `D-14` disait que le producteur de préparation « ne peut écrire que sous ces
répertoires » et comptait le « périmètre respecté » parmi les trois faits qui qualifient une suite.
Le périmètre reste, mais il borne désormais ce que le noyau retient ; ce qui le sort n'est plus un
fait contre la suite. Les deux autres faits, la suite chargeable et discriminante, et le reste de
`D-14` sont inchangés.

**Motif.** Le premier point vient de la campagne du 18 septembre : le refus d'une préparation
correcte, et un second essai payé, pour un atelier de vérification que la consigne avait demandé.
Ignorer remplace refuser sans rien laisser entrer — le confinement ne change pas, l'intervention
n'écrit toujours que dans son workspace, et ce qu'elle écrit hors des racines n'atteint ni le
jugement, ni la suite adoptée, ni le candidat. Le deuxième point vient du déclencheur vide rendu
comme une commande : un producteur ne peut pas obéir à un ordre qui ne veut rien dire, et il doit
savoir ce qui sera lu de son arbre pour le préparer. Le troisième point vient de l'écart de JDK
mesuré sur la même cible : une vérification n'en est une que dans l'environnement du juge. Aucune
des trois variables ajoutées ne porte de secret sur la machine de référence, et le réseau reste
refusé à l'intervention.

## Conséquences

Chaque préparation coûte une copie de plus de la référence, celle où les fichiers retenus sont
jugés ; ce que le producteur écrit hors des racines n'est plus une raison de rejouer une
intervention. Le dossier d'une préparation nomme ce qui a été ignoré, et un lecteur qui trouve une
note « written outside the preparation mandate, not retained » lit un producteur qui s'est vérifié,
pas une faute. Le rôle `implement` n'a pas de racines imposées : ce qu'il écrit reste jugé par ses
chemins protégés comme avant. Le découpage des instructions par rôle et par phase, et la question
de savoir quels contrôles un producteur doit lancer lui-même — la mutation comprise, qui refait un
build complet — restent ouverts (`e04`).
