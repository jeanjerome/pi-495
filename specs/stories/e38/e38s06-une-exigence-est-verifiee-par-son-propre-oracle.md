# Une exigence ne franchit la qualification que si son propre oracle a été éprouvé

Story : e38s06
Epic : e38
Statut : versée

Surface : pi-495 — préparation, G2 et obligations G5
Dépendances : e38s05


## 1. Ce que le lecteur gagne

Le propriétaire n’obtient plus une couverture implicite de toutes les exigences parce qu’un seul test de la suite est rouge, ni parce que quelques tests existants sont exécutés. Chaque exigence obligatoire possède une liaison à des observations identifiables.

Pour un nouveau comportement, la préparation observe le rouge métier attendu sur la référence, assertion par assertion ou cas isolé lorsque le runner ne distingue pas les assertions. Pour un comportement annoncé déjà satisfait, elle exécute une caractérisation pertinente qui doit passer ; aucun rouge artificiel n’est requis. La pertinence de la liaison est examinée distinctement de la capacité du runner à rendre des résultats. Cette tranche complète e13/e14 ; elle réutilise les qualifications de contrôles déjà présentes.

## 2. Promesses

Scenario: Le rouge de R1 ne prouve pas R2
  Given deux exigences nouvelles et une préparation qui ne fait échouer que le cas de R1
  When G2 évalue la préparation
  Then R2 reste non vérifiée et le protocole ne la gèle pas comme couverte

Scenario: Une affirmation sur l’existant est éprouvée sans confirmation humaine de substitution
  Given R2 déclarée satisfied_by_reference et un test pertinent qui la contredit
  When la caractérisation s’exécute
  Then la contradiction est nommée et la déclaration seule ne permet pas G2

Scenario: Un incident ne tient pas lieu de rouge métier
  Given un test qui échoue par import ou une assertion non exécutée
  When sa préparation est qualifiée
  Then elle ne devient pas une preuve discriminante de l’exigence

Scenario: Un contrôleur fiable juge une référence non conforme
  Given le contrôle de liens configurés qualifié sur ses témoins et une violation dans la référence
  When l’état des lieux est exécuté
  Then la qualification reste distincte du FAIL de conformité du projet

Scenario: Un cas JUnit nommé par sa méthode prouve l’exigence dont l’identifiant porte un tiret
  Given une exigence nouvelle « r-update-refuse-nom-pris » et un rapport Surefire dont le cas `r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser` échoue sur la référence par `org.opentest4j.AssertionFailedError`
  When la préparation est jugée sur la référence
  Then le dossier de préparation lie ce cas à « r-update-refuse-nom-pris », qualifiée `proved`, et la préparation est adoptée au lieu de laisser l’exigence `no_case`

Scenario: Une caractérisation contredite réécrite pour passer reste nommée
  Given une première préparation dont la caractérisation « R2 greet says hi » contredit R2 sur la référence, puis une préparation suivante qui la réécrit en « R2 greet says hello », qui passe sur la référence
  When G2 évalue la préparation
  Then la décision IH-04 nomme encore la contradiction de R2 par « R2 greet says hi » et le protocole n’est pas gelé avec R2 couverte par le cas réécrit

Scenario: Une caractérisation contredite réécrite en un cas qui échoue sans assertion reste nommée à côté de l’incident
  Given une première préparation dont la caractérisation « R2 greet says hi » contredit R2 sur la référence, puis une préparation suivante, adoptée sur le rouge de R1, qui la réécrit en « R2 greet says hello », qui échoue sur la référence sans assertion
  When G2 évalue la préparation
  Then la décision IH-04 nomme la contradiction de R2 par « R2 greet says hi »
  And la même décision nomme l’incident de « R2 greet says hello »
  And le protocole n’est pas gelé

## 3. Sécurité

Les tests d’acceptation adoptés restent protégés. Le producteur ne choisit pas quels échecs retirer. Une caractérisation qu’une préparation a vue contredite sur la référence reste nommée à G2 tant que les exigences n’ont pas été révisées : une préparation suivante ne l’efface ni en retirant le cas, ni en le réécrivant pour qu’il passe ou qu’il échoue sans assertion, ni par un lecteur qui ne nomme aucun cas : la décision la nomme à côté du dernier oracle en échec ; seul le propriétaire qui prend à sa charge la décision de l’exigence la laisse franchir G2. Un lecteur incapable de localiser un cas déclare cette limite ; la couverture n’est jamais inventée à partir du compteur global.

## 4. Tâches

### Tâche 1 — Porter la liaison par exigence dans les artefacts

Étendre `src/application/preparation.ts`, `src/contracts/v1/protocol.ts` et les rapports de préparation avec les références de cas, observations attendues et obtenues, catégorie et qualification de la liaison. Versionner la lecture des anciens artefacts sans leur attribuer une preuve inexistante.

- Vérifie : `node --test test/v0-pure/requirement-verification.test.ts`
- Tient : `test/v0-pure/requirement-verification.test.ts`, « R1 et R2 gardent des observations distinctes et un ancien dossier reste lisible sans être surqualifié ».
- Rouge : `PreparationRecord.discriminant` est global et `diagnoseControlCapability` dispense toutes les exigences quand il est vrai.

### Tâche 2 — Observer et qualifier chaque cas pertinent

Adapter `phases/prepare.ts` et `verification.ts` aux cas remontés par les lecteurs de la technologie. Séparer chargement, exécution, cause métier et correspondance au besoin ; isoler l’exécution si nécessaire. Ajouter les fixtures de caractérisation vraie et fausse.

- Vérifie : `node --test test/v2-kernel/requirement-preparation.test.ts`
- Tient : `test/v2-kernel/requirement-preparation.test.ts`, « le rouge de R1 ne couvre pas R2 et une caractérisation fausse est signalée avant gel ».
- Rouge : La préparation actuelle retient `onReference === FAIL` pour la suite et la présence de tests exécutés pour l’existant.

### Tâche 3 — Faire consommer ces liaisons par G2 et G5

Adapter `phases/verification-design.ts`, `domain/gates/g2.ts`, la construction des obligations et le filtrage G5. Conserver all_pass/any_pass et les décisions humaines assignées, sans autoriser qu’un PASS étranger à la liaison suffise. Afficher les exigences encore sans oracle.

- Vérifie : `node --test test/v2-kernel/requirement-evidence-gates.test.ts`
- Tient : `test/v2-kernel/requirement-evidence-gates.test.ts`, « seules les observations des liaisons adoptées satisfont les obligations correspondantes ».
- Rouge : Les obligations actuelles regroupent des contrôles ; elles ne garantissent pas cette qualification par assertion.

### Tâche 4 — Recette par le parcours réel

Dans Pi réel, conduire un changement à deux exigences avec une seule couverte, constater le blocage de la seconde, compléter la préparation et finir. Rejouer le cas existant de liens configurés sur référence non conforme. Exécuter les campagnes Node et Maven requises par le cycle.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s06/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s06`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

### Tâche 5 — Lier un cas à l’exigence dont l’identifiant ne peut pas s’écrire tel quel dans son nom

Un nom de méthode Java ne peut pas porter de tiret, et Surefire n’écrit dans son rapport que ce nom, sans le `@DisplayName`. La liaison d’un cas à une exigence lit donc l’identifiant comme un mot entier du nom du cas, son tiret pouvant y être écrit en tiret bas, pour qu’une cible JUnit dont les identifiants portent un tiret franchisse la préparation.

- Vérifie : `node --test test/v0-pure/requirement-verification.test.ts`
- Tient : `test/v0-pure/requirement-verification.test.ts`, « un cas Surefire nommé r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser, en échec par assertion sur la référence, prouve l’exigence r-update-refuse-nom-pris ».
- Rouge : `namesRequirement` (`src/application/preparation.ts`) cherche l’identifiant littéral, tiret compris, entre deux caractères non alphanumériques : `requirementOracles` ne lie aucun cas à « r-update-refuse-nom-pris » sur `com.example.UserServiceTest.r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser` et rend `no_case`, si bien que `prepare` n’adopte pas la préparation.

### Tâche 6 — Garder nommée une caractérisation contredite qu’une préparation suivante réécrit

Une contradiction vue sur la référence par une préparation des exigences en vigueur continue de priver l’exigence de son oracle quand une préparation suivante lui donne une caractérisation qui passe, comme elle le fait déjà quand le cas est retiré.

- Vérifie : `node --test test/v2-kernel/requirement-preparation.test.ts`
- Tient : `test/v2-kernel/requirement-preparation.test.ts`, « une caractérisation contredite reste nommée à G2 et n’est pas gelée comme couverte quand une préparation suivante la réécrit pour qu’elle passe ».
- Rouge : `undecidedRequirements` (`src/application/preparation.ts`) passe à l’exigence suivante dès que l’oracle de la dernière préparation est `proved`, avant de consulter `refuted` : avec R2 contredite par « R2 greet says hi » puis prouvée par « R2 greet says hello », `diagnoseControlCapability` rend `undiscriminated_requirements` vide et aucune note, et G2 gèle R2 sur le cas réécrit.

### Tâche 7 — Nommer la contradiction reportée à côté du dernier oracle en échec

Une contradiction vue sur la référence par une préparation des exigences en vigueur est nommée dans la décision IH-04 à côté du dernier oracle en échec de l’exigence, quel que soit ce que la préparation suivante a fait du cas : un cas réécrit qui échoue sans assertion (`incident`) ou un lecteur qui ne nomme aucun cas (`unlocatable`) n’en tient plus lieu.

- Vérifie : `node --test test/v2-kernel/requirement-preparation.test.ts`
- Tient : `test/v2-kernel/requirement-preparation.test.ts`, « une caractérisation contredite reste nommée à G2 à côté de l’incident quand une préparation suivante la réécrit en un cas qui échoue sans assertion ».
- Rouge : `failedOracle` (`src/application/preparation.ts`) rend le dernier oracle dès qu’il a trouvé un cas et échoué (`incident`, `contradicted` ou `unlocatable`), sans consulter `refuted`, et `undecidedRequirements` n’écrit qu’une note par exigence : avec R2 contredite par « R2 greet says hi » puis `incident` sur « R2 greet says hello » dans la préparation adoptée sur le rouge de R1, les faits de IH-04 portent « R2: its cases fail on the reference without an assertion, which proves nothing about it: "R2 greet says hello" failed otherwise » et ne nomment pas « R2 greet says hi ».

## 5. Hors périmètre

Caractérisation exhaustive de tout legacy, fuzzing général et nouvelle politique de baseline sont hors périmètre. Ne pas remplacer `witnessFindings` déjà livré ni réécrire e11s09.

La lecture du `@DisplayName` JUnit est hors périmètre : Surefire ne l’écrit pas dans son rapport sans une configuration du projet cible, que 495 ne modifie pas. Un identifiant qui est le préfixe d’un autre (« r-update » et « r-update-refuse ») reste lié comme aujourd’hui. Aucun examen ne permet de lever une contradiction sans le propriétaire : seule sa décision, ou une révision des exigences, la lève ; la contestation d’un test déjà gelé est l’objet d’e38s07.

Nommer la contradiction reportée à côté de l’incident ne change ni le gel, qui refuse déjà R2, ni le texte des notes d’incident et de contradiction, ni le nombre de contradictions reportées par exigence, qui reste d’une. Le cas préparé qui lit la source du code sous test et échoue sous Stryker est un autre défaut, hors de cet écart.
