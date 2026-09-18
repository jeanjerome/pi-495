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
Dans ~/Projets/495-pi-package, lis la section « Campagnes depuis Pi sur les cibles » de
docs/QUALIFICATION.md, puis la boucle de qualification de stepVerificationDesign dans
src/application/harness.ts et qualifyControlDetailed dans src/application/qualification.ts.

Deux travaux, dans cet ordre.

1. Qualifier un capteur qui lit le rapport d'un autre contrôle. Le témoin négatif propre d'un
   tel capteur reçoit un workspace neuf ; le rapport qu'il lit n'y existe pas, et il rend
   INDETERMINATE au lieu de FAIL. Décide ce qui porte la dépendance — un producteur déclaré
   dans ControlDefinition, ou les contrôles qui précèdent le capteur dans le protocole,
   exécutés dans chaque workspace de témoin avant de le qualifier — et écris-le. Toucher aux
   contrats impose `npm run contracts` et change environment_digest : ne pas engager pendant
   qu'un cycle tourne.
   Un test déterministe doit échouer avant le correctif : un capteur dont le rapport est écrit
   par un contrôle déclaré avant lui, qualifié sur ses trois témoins, sans Java ni Maven.

2. Le cycle réel sur la cible Maven, une fois l'étape 1 close. Depuis
   ~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture, données isolées, sans
   HARNESS495_ALLOW_UNCONFINED, avec JAVA_HOME en 21 et MAVEN_USER_HOME sur le cache local.
   Le modèle local conduit ~2,5 appels d'outils par minute sur cette cible : chaque
   intervention atteint le plafond intervention_ms et le cycle dépasse increment_ms. Relève
   les trois budgets ensemble dans <données>/config.json — relever intervention_ms seul ne
   fait que déplacer l'endroit où le changement meurt — et transcris le verdict, le motif
   d'arrêt et la durée depuis la sortie réelle.

Critères d'acceptation :
- un test déterministe couvre la qualification d'un capteur qui lit le rapport d'un autre
  contrôle, et échoue sur le comportement actuel ;
- la campagne scriptée sur simple-demo-hexagonal-architecture franchit G2 et son verdict de
  G5 est transcrit ;
- la campagne avec le modèle a son verdict, son motif d'arrêt et sa durée dans
  docs/QUALIFICATION.md, et ce qu'elle révèle dans docs/STATUS.md ;
- npm run check passe.
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
