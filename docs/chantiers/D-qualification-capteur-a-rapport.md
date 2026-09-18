# Transverse D — la qualification d'un capteur qui lit le rapport d'un autre contrôle

**État :** ouvert
**Objet :** un capteur qui ne produit aucune mesure, mais lit celle qu'un autre contrôle laisse dans
le workspace, ne peut pas être qualifié dans le cycle ; G2 refuse alors tout protocole sur une cible
Maven liant JaCoCo hors profil
**Concerne l'étage 2, sans en dépendre**

## Motif

Une campagne conduite depuis Pi sur `~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture`
qualifie trois capteurs sur quatre : la suite Surefire, les frontières d'architecture dérivées des POM
et la mutation cadrée sur les classes modifiées rendent `PASS / FAIL / INDETERMINATE` sur leurs trois
témoins, réseau coupé et sous Seatbelt. Le quatrième, `coverage`, échoue, et G2 refuse de geler le
protocole :

```
control coverage: negative witness gave INDETERMINATE, expected FAIL
coverage: negative witness gave INDETERMINATE: the control does not detect the defect it claims to
cover; no JaCoCo report found at the declared report path, for 2 introduced source file(s)
```

Le capteur de couverture n'exécute aucune commande de mesure : sa commande est un `node -e ""`, et ce
qu'il lit est le rapport JaCoCo que `mvn test` a écrit dans le même workspace. Son témoin positif le
trouve, parce que le workspace positif a servi à qualifier `maven-test` juste avant. Son témoin
négatif propre reçoit un workspace neuf, où aucun contrôle producteur n'est lancé : il n'y a pas de
rapport, la mesure absente est rendue `INDETERMINATE` — le bon verdict pour une mesure qui manque —
et un témoin négatif doit rendre `FAIL`.

Ni le capteur ni le parseur ne sont en cause : ce qui manque est l'ordre. `ControlDefinition` ne
déclare aucun producteur pour le rapport qu'un capteur lit ; l'ordre est implicite dans le tableau des
contrôles, la vérification l'honore, la boucle de qualification ne le connaît pas. La campagne V4 ne
voyait pas le constat parce qu'elle exécute le contrôle producteur dans chaque workspace de témoin
avant de qualifier le capteur — exactement ce que le cycle ne fait pas.

Conséquence : aucune cible Maven dont le POM lie `jacoco:report` hors profil ne dépasse G2 depuis un
cycle. Une cible qui ne lie pas JaCoCo n'a pas de contrôle `coverage` du tout, et passe — ce qui
inverse l'incitation.

Ce constat commande aussi une campagne différée. Le cycle avec le modèle local n'a pas été relancé sur
cette cible : le parcours s'arrête à G2, avant toute intervention de production, et relever
`increment_ms`, `intervention_ms` ou `max_continuations` ne déplace pas ce mur. Le cycle réel est à
mener une fois le capteur qualifiable.

## Antériorité dans l'écosystème Pi

`pi-lens` (`github.com/apmantza/pi-lens`) résout la même question sur ses producteurs de faits :
chaque `FactProvider` déclare les clés qu'il écrit (`provides`) et celles qui doivent exister avant
qu'il tourne (`requires`), et `dispatch/fact-scheduler.ts` les ordonne topologiquement, tie-break
alphabétique, cycles détectés, les faits fournis hors de la liste étant traités comme disponibles.

Transposé ici : un contrôle déclarerait le rapport qu'il écrit et celui qu'il lit, et l'ordre — de
qualification comme de vérification — se déduirait de ces déclarations au lieu d'être l'ordre du
tableau `controls`. C'est la forme que l'étape 1 de ce travail doit décider ou écarter.

## Prompt

```
Dans ~/Projets/495-pi-package, lis d'abord docs/chantiers/D-qualification-capteur-a-rapport.md,
puis la section « Campagnes depuis Pi sur les cibles » de docs/QUALIFICATION.md. Dans le code :
la boucle de qualification de stepVerificationDesign (src/application/harness.ts),
qualifyControlDetailed (src/application/qualification.ts), ControlDefinition
(src/contracts/v1/protocol.ts) et test/v4/java-stack.test.ts, qui lance le contrôle producteur
dans chaque workspace de témoin avant de qualifier le capteur — ce que le cycle ne fait pas.

État de départ, à reproduire avant de toucher quoi que ce soit. Depuis le répertoire de la
cible, données isolées, sans HARNESS495_ALLOW_UNCONFINED, stdin fermée (en --mode json sans -p,
pi attend l'EOF de stdin et ne rend rien si on l'oublie) :

  cible=~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture
  cd $cible
  JAVA_HOME="$(/usr/libexec/java_home -v 21)" MAVEN_USER_HOME="$cible/.mvn/home" \
  HARNESS495_DATA_DIR=~/.495-campagnes/java-d \
  HARNESS495_SCRIPTED_AGENT=~/.495-campagnes/scripts/java-agent.json \
  pi -ne --mode json --no-session -e ~/Projets/495-pi-package/src/extension/index.ts \
     "/495 start Refuse la creation d'un utilisateur dont le nom depasse 50 caracteres" < /dev/null

Attendu aujourd'hui, en une trentaine de secondes : G0 PASS, G1 PASS, G2 FAIL, arrêt sur
capability_missing, « control coverage: negative witness gave INDETERMINATE, expected FAIL ;
no JaCoCo report found at the declared report path, for 2 introduced source file(s) ». Les trois
autres capteurs — maven-test, structure, mutation — se qualifient sur leurs trois témoins.

Deux travaux, dans cet ordre.

1. Qualifier un capteur qui lit le rapport d'un autre contrôle.

   Écris d'abord le test qui échoue : un capteur dont le rapport est écrit par un contrôle
   déclaré avant lui, qualifié sur ses trois témoins, sans Java ni Maven — le niveau de
   test/v1/control-runner est le bon. Il doit échouer sur le comportement actuel, pour la
   raison exacte du constat : le témoin négatif propre reçoit un workspace neuf, le rapport
   n'y existe pas, la mesure absente est rendue INDETERMINATE, et un témoin négatif doit
   rendre FAIL.

   Décide ensuite ce qui porte la dépendance, et écris la décision dans docs/DECISIONS.md :
   un producteur déclaré dans ControlDefinition — ce que fait pi-lens pour ses producteurs de
   faits, `provides` / `requires` et un ordonnanceur topologique avec détection de cycle, voir
   clients/dispatch/ dans github.com/apmantza/pi-lens — ou les contrôles qui précèdent le
   capteur dans le protocole, exécutés dans chaque workspace de témoin avant de le qualifier.
   Dans les deux cas, l'ordre doit être lisible dans le protocole gelé, pas dans l'ordre d'un
   tableau.

   Deux précautions. Toucher aux contrats impose `npm run contracts`, change
   environment_digest et invalide le protocole d'un changement en cours : ne rien engager
   pendant qu'un cycle tourne. Et `npm run build` avant `npm run check`, sans quoi le contrôle
   de distribution refuse un dist/ qui ne reproduit plus les sources.

   Vérifie enfin sur la cible réelle : la même campagne scriptée doit franchir G2 et aller
   jusqu'à G5. Transcris son verdict depuis la sortie, pas de mémoire.

2. Le cycle réel sur la même cible, une fois l'étape 1 close.

   Le modèle local (omlx/qwen3.8-27b-oq8e) conduit ~2,5 appels d'outils par minute sur cette
   cible : chaque intervention atteint le plafond intervention_ms de 20 min, et un cycle
   complet dépasse increment_ms. Relève les trois budgets ensemble dans <données>/config.json —
   policy.budgets.increment_ms, intervention_ms, max_continuations — parce que relever
   intervention_ms seul ne fait que déplacer l'endroit où le changement meurt. Dis avant de
   lancer les valeurs retenues et ce que tu attends d'elles.

   Ne monte pas HARNESS495_SCRIPTED_AGENT pour cette campagne : c'est la production de code
   qu'elle doit éprouver. Une campagne sous agent scripté qualifie la chaîne de contrôles,
   jamais le producteur, et doit être présentée comme telle.

   Si le changement meurt sur une sortie structurée invalide, c'est chantiers/F et non ce
   travail : note-le et relance, ne corrige pas en passant.

Où écrire quoi, quand c'est fini : la campagne et ses chiffres dans docs/QUALIFICATION.md, ce
qu'elle révèle du produit dans docs/STATUS.md, la décision dans docs/DECISIONS.md, l'état des
exigences dans docs/TRACEABILITY.md (VER-05, PRE-03, QLT-04 y portent aujourd'hui la mention
« partiel » qui renvoie ici), le journal de cette fiche et sa ligne dans chantiers/README.md.
Si l'ordre des travaux change, une ligne dans docs/ROADMAP.md ; si le critère de sortie L1 n°2
bouge, une ligne dans docs/MILESTONES.md.

Critères d'acceptation :
- un test déterministe couvre la qualification d'un capteur qui lit le rapport d'un autre
  contrôle, et échoue sur le comportement actuel ;
- la campagne scriptée sur simple-demo-hexagonal-architecture franchit G2 et son verdict de
  G5 est transcrit depuis la sortie réelle ;
- la campagne avec le modèle a son verdict, son motif d'arrêt et sa durée dans
  docs/QUALIFICATION.md, et ce qu'elle révèle dans docs/STATUS.md ;
- aucune campagne conduite sous agent scripté n'est présentée comme qualifiant la production ;
- npm run build puis npm run check passent.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Boucle de qualification et témoins propres | `src/application/harness.ts`, `stepVerificationDesign` |
| Trois témoins d'un capteur | `src/application/qualification.ts`, `qualifyControlDetailed` |
| Absence de producteur déclaré | `src/contracts/v1/protocol.ts`, `ControlDefinition` |
| Contrôle producteur lancé à la main avant la qualification | `test/v4/java-stack.test.ts` |
| Mesure absente jamais lue comme couverture | `src/adapters/execution/parsers.ts`, `parseJacoco` |
| Budgets du cycle réel | `src/domain/policy.ts`, `<données>/config.json` |

## Journal

**17 septembre 2026.** Ouverture. Le constat vient d'une campagne de 30 s depuis l'entrée Pi sur la
cible Maven, agent scripté : G0 PASS, G1 PASS, G2 FAIL, arrêt sur `capability_missing`. Les faits
transcrits — verdicts et faits des douze runs de témoins, dont les 40 cas de la suite de référence,
la violation de frontière localisée au fichier et à la ligne, les deux mutants survivants localisés
avec leur opérateur — sont dans `../QUALIFICATION.md`.
