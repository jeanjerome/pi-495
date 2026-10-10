# Un test erroné se conteste et se révise sans laisser le producteur changer son juge

Story : e38s07
Epic : e38
Statut : versée

Surface : pi-495 — reprise de préparation et invalidation
Dépendances : e38s06


## 1. Ce que le lecteur gagne

Le producteur peut signaler une contradiction entre un test gelé et le besoin adopté. Le noyau ouvre un examen distinct qui peut rejeter la contestation, proposer une nouvelle préparation ou demander une décision humaine si le besoin change. La correction de code reste possible sans révision du protocole.

Une contestation porte exigence, test, protocole, candidat, observation contradictoire et reproduction. Elle ne vaut jamais autorisation. Une révision approuvée repasse par qualification et gel ; les anciennes preuves et décisions affectées cessent de compter. Les essais et budgets de préparation sont explicitement bornés et journalisés.

## 2. Promesses

Scenario: Le producteur signale sans modifier les tests protégés
  Given un test gelé incompatible avec une réponse humaine adoptée
  When le producteur dépose une contestation reproductible
  Then le noyau conserve le signalement et lance un examen distinct sans donner de droit d’écriture sur le test

Scenario: Une contestation rejetée ne desserre pas le contrôle
  Given une contestation jugée infondée
  When le changement reprend
  Then le protocole et les tests restent identiques et le code doit être corrigé

Scenario: Une révision autorisée invalide les résultats périmés
  Given une nouvelle préparation qualifiée sous P2 après contestation de P1
  When une preuve ou une décision liée à P1 est présentée
  Then elle ne contribue plus à l’acceptation sous P2 et l’historique reste consultable

Scenario: Un cas que le propriétaire a fait garder n’est pas réécrit sur le seul constat d’un modèle
  Given le propriétaire a répondu « garder » à l’IH-04 sur le cas gelé contesté d’une exigence
  When le producteur conteste de nouveau ce cas sur un candidat suivant et que l’examen conclut que le test est à corriger
  Then l’objectif remis à l’examinateur porte la réponse « garder » du propriétaire sur ce cas
  And aucun événement `artifact.revised` de la préparation ni aucun second `protocol.frozen` n’est inscrit sans nouvelle réponse du propriétaire
  And une décision IH-04 est demandée au propriétaire, qui nomme le cas, sa réponse « garder » et le constat contraire de l’examen
  And la décision « garder » reste valide dans le dossier

Scenario: Un cas gardé n’est réécrit ni par la révision qu’appelle un autre cas, ni sous un protocole gelé depuis
  Given le propriétaire a répondu « garder » à l’IH-04 sur le cas gelé A d’une exigence
  And sur un candidat suivant, le producteur conteste A et un autre cas gelé B, et l’examen trouve chacun « test à corriger »
  When le noyau tire la suite de ces deux constats
  Then une décision IH-04 est demandée au propriétaire, qui nomme A, sa réponse « garder » et le constat contraire de l’examen
  And aucun événement `artifact.revised` de la préparation n’est inscrit avant la nouvelle réponse du propriétaire sur A
  When le propriétaire répond de nouveau « garder », que la préparation est écrite de nouveau pour B et gelée, puis qu’un candidat suivant voit A contesté de nouveau et trouvé « test à corriger » sous ce protocole
  Then le mandat de la préparation écrite de nouveau ne nomme pas A parmi les cas trouvés faux à écrire de nouveau
  And l’objectif remis à l’examinateur de la nouvelle contestation de A porte la réponse « garder » du propriétaire
  And ce constat sur A ne fait inscrire aucun nouvel événement `artifact.revised` ni `protocol.frozen`, et une décision IH-04 est de nouveau demandée au propriétaire sur A
  And les réponses « garder » du propriétaire restent valides dans le dossier

Scenario: Un cas gardé ne se conteste pas sous un nom que le protocole gelé ne lie pas à l’exigence
  Given le propriétaire a répondu « garder » à l’IH-04 sur le cas gelé A d’une exigence, que l’obligation gelée de cette exigence lie à sa préparation
  When sur un candidat suivant, le producteur conteste sous cette exigence un cas dont le nom diffère de celui de A et que l’obligation gelée ne porte pas
  Then le noyau refuse la contestation par un refus qui nomme ce cas comme absent des cas gelés de l’exigence, et aucun événement `contestation.filed` n’est inscrit pour elle
  And aucune intervention d’examen n’est lancée sur ce cas, et aucun événement `artifact.revised` de la préparation ni second `protocol.frozen` n’est inscrit
  And la décision « garder » reste valide dans le dossier

## 3. Sécurité

Réutiliser les décisions authentifiées via Pi et les règles de révocation existantes. Une revue de modèle ne révoque aucune décision humaine et n’en annule pas l’effet : un cas que le propriétaire a fait garder n’est réécrit, ni la préparation qui le gèle révisée, que sur une nouvelle réponse du propriétaire. La réponse « garder » vaut pour l’exigence et le cas quel que soit le protocole gelé depuis, et la préparation qui gèle un cas gardé n’est pas révisée pour un autre cas contesté tant qu’un constat contraire sur le cas gardé attend la réponse du propriétaire. Une contestation ne porte que sur un cas que l’obligation gelée lie à l’exigence qu’elle nomme : le noyau refuse toute autre, si bien qu’un cas gardé ne se conteste pas sous un nom voisin qui échapperait à la réponse « garder ». Aucune issue « accepter quand même » pour une obligation obligatoire non satisfaite.

## 4. Tâches

### Tâche 1 — Définir la contestation et ses issues

Étendre les contrats de rapports, commandes et événements du changement pour un signalement typé. Relier chaque objet à ses identités et à une reproduction ; distinguer correction du test, changement du besoin et contestation infondée.

- Vérifie : `node --test test/v0-pure/verification-contestation.test.ts`
- Tient : `test/v0-pure/verification-contestation.test.ts`, « une contestation incomplète ou relative à un autre protocole ne modifie aucun droit ».
- Rouge : Le workflow ne porte pas de parcours explicite de contestation du juge gelé par le producteur.

### Tâche 2 — Orchestrer un examen distinct et borné

Brancher l’examen dans les phases du changement en réutilisant interventions, budgets et décisions existants. Le relecteur produit un constat ; le noyau choisit la suite selon la politique ; le propriétaire tranche seulement ce qui change son besoin ou une décision réservée.

- Vérifie : `node --test test/v2-kernel/verification-contestation.test.ts`
- Tient : `test/v2-kernel/verification-contestation.test.ts`, « le signalement seul ne rouvre pas les tests et l’examen épuisé s’arrête avec une issue explicite ».
- Rouge : Les reprises actuelles ne proposent pas cette sortie qualifiée d’un test erroné.

### Tâche 3 — Requalifier et invalider avant reprise

Réutiliser `invalidationFor` et l’historique append-only pour G1 si le besoin change, sinon préparation/G2. Étendre le modèle et le replay de e38s03/e38s04 avec P1 contesté, P2 adopté et résultat tardif P1.

- Vérifie : `node --test test/v2-kernel/verification-revision.test.ts`
- Tient : `test/v2-kernel/verification-revision.test.ts`, « P2 doit être requalifié et une preuve P1 reçue après reprise reste inapplicable ».
- Rouge : L’invalidation générique existe ; ce parcours de contestation ne l’exerce pas aujourd’hui.

### Tâche 4 — Recette par le parcours réel

Dans Pi réel, présenter un test volontairement contradictoire sur une cible jetable : constater le signalement, le refus d’écriture directe, la révision indépendante, le nouveau gel et la reprise. Rejouer une contestation infondée qui ne change rien. Conserver la provenance des décisions.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s07/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s07`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

### Tâche 5 — Un cas gardé par le propriétaire n’est pas réécrit sans lui

Quand une réponse « garder » valide de l’IH-04 porte sur le même cas gelé de la même exigence, l’examen d’une nouvelle contestation de ce cas reçoit cette réponse, et un constat `test_correction` ne révise pas la préparation : il repasse par le propriétaire en IH-04, dont la réponse « garder » n’est ni révoquée ni contournée.

- Vérifie : `node --test test/v2-kernel/verification-revision.test.ts`
- Tient : `test/v2-kernel/verification-revision.test.ts`, « un cas que le propriétaire a fait garder n’est pas réécrit sur le constat d’un modèle : l’examinateur reçoit sa réponse et le constat contraire lui est reposé en IH-04 ».
- Rouge : après « garder », une seconde contestation du même cas sur un candidat différent est déposée comme nouvelle (`fileReported` ne filtre que le candidat et le protocole), l’examinateur reçoit `contestationObjective` qui ne dit rien de la réponse du propriétaire, et `settleFindings` révise la préparation dès qu’un constat vaut `test_correction` (`src/application/phases/contestation.ts`, avant toute lecture des IH-04) ; la réponse « garder » ne couvre pas cette contestation, son sujet étant lié à l’identifiant de la première (`needSubject`). Constaté sur un changement scripté (examen `requirement_change`, « garder », puis examen `test_correction` sur un candidat qui diffère d’une ligne) : `artifact.revised` de la préparation « contestation … found the frozen case … wrong », un second `protocol.frozen`, aucune IH-04 demandée sur ce constat, et la décision « garder » toujours valide.

### Tâche 6 — Un cas gardé n’est réécrit ni par la révision d’un autre cas ni sous un protocole gelé depuis

La réponse « garder » de l’IH-04 se lit sur l’exigence et le cas, quel que soit le protocole de la contestation qui l’a obtenue. Quand un cas gardé et un autre cas sont trouvés tous deux « test à corriger » sur un même candidat, le constat sur le cas gardé est reposé au propriétaire en IH-04 avant toute révision de la préparation ; la préparation écrite de nouveau ensuite ne reçoit pas le cas gardé parmi les cas trouvés faux. Le test du noyau conduit un changement à deux cas contestés d’une même exigence, dont un gardé.

- Vérifie : `node --test test/v2-kernel/verification-revision.test.ts`
- Tient : `test/v2-kernel/verification-revision.test.ts`, « deux cas contestés dont un gardé : la révision qu’appelle l’autre attend la réponse du propriétaire, ne lui fait pas réécrire le cas gardé, et sous le protocole gelé ensuite le constat contraire sur le cas gardé lui est reposé en IH-04 ».
- Rouge : `settleFindings` (`src/application/phases/contestation.ts`) révise la préparation sur le premier constat `test_correction` dont le cas n’est pas gardé, sans attendre l’IH-04 que demanderait le constat sur le cas gardé : sur A gardé et B tous deux « test à corriger », un `artifact.revised` « contestation … found the frozen case "B" wrong » est inscrit et aucune IH-04 n’est demandée sur A. La préparation écrite de nouveau reçoit de `foundWrongNotes` chaque constat `test_correction` du protocole gelé, qui ne lit ni les IH-04 ni le cas gardé : son mandat dit de A « was examined and found wrong … Write it again ». Enfin `keptBy` ne cherche la réponse « garder » que parmi les contestations de même `protocol_id` et de même révision, alors que la préparation révisée gèle un protocole d’identité nouvelle : sous ce protocole, l’objectif de l’examinateur de A ne porte plus la réponse du propriétaire, et un constat `test_correction` sur A inscrit un nouvel `artifact.revised` puis un nouveau `protocol.frozen`, sans IH-04, la décision « garder » restant valide. Constaté par un changement scripté à deux cas de R1, A gardé : les deux révisions successives, et le second mandat de préparation qui nomme A et B comme trouvés faux.

### Tâche 7 — Une contestation ne porte que sur un cas gelé de l’exigence qu’elle nomme

Le noyau refuse de classer une contestation dont le cas n’est pas parmi les cas que l’obligation gelée de l’exigence nommée lie à sa préparation, en nommant ce cas dans le refus ; elle n’est ni examinée ni suivie d’aucune révision. Un cas gardé contesté de nouveau sous un nom voisin ne contourne ainsi ni la réponse « garder » remise à l’examinateur, ni l’IH-04 reposée avant toute révision, ni son absence des cas à écrire de nouveau. Le test du noyau conduit le changement de la tâche 5 jusqu’à « garder », puis fait contester par le producteur, sur le candidat suivant, « R1 shout upper-cases the greeting! » sous R1.

- Vérifie : `node --test test/v2-kernel/verification-revision.test.ts`
- Tient : `test/v2-kernel/verification-revision.test.ts`, « un cas gardé contesté de nouveau sous un nom que l’obligation gelée ne porte pas est refusé par le noyau : ni examen, ni révision de la préparation, ni second protocole, et la réponse « garder » reste valide ».
- Rouge : `contestationIssues` (`src/domain/change/contestation.ts`) vérifie que l’exigence est une obligation du protocole gelé et que le contrôle cité la juge, mais ne lit jamais `obligation.oracle.cases` : un cas absent de la suite passe. `reproductionOf` (`src/application/phases/contestation.ts`) retient l’exécution en échec du contrôle de l’exigence dont `passed_cases` ne contient pas ce nom, où un nom inconnu de la suite ne figure jamais, et `contestationIssues` tient la reproduction pour acquise sur ce même critère : `contestation.filed` est inscrit. `keptBy` ne retrouve la réponse « garder » que sur un `case_name` identique : l’objectif de l’examinateur ne la porte pas, et `settleFindings`, sans cas gardé dans `kept`, révise la préparation sur le constat `test_correction` (`artifact.revised` « contestation … found the frozen case "R1 shout upper-cases the greeting!" wrong »), puis un second `protocol.frozen` est inscrit, sans IH-04 reposée, la décision « garder » restant valide. Constaté à la recette de e38s07 (dossier e38s07-fondee-tete) : la contestation de « R1 shout keeps the comma », cas qu’aucune suite gelée ne porte, a été classée, examinée et trouvée `test_correction` alors que l’obligation R1 du protocole gelé ne lie que « R1 shout upper-cases the greeting ».

## 5. Hors périmètre

Pas de modification des tests par l’implémenteur, pas de nouvelle classe générale d’exceptions. Toute évolution des interactions humaines doit être enregistrée dans le corpus normatif et rester compatible avec les dossiers anciens.

L’écart sur le cas gardé n’inclut pas : d’interdire au producteur de contester de nouveau un cas gardé, ni de borner ces contestations répétées autrement que par le budget de tentatives existant ; de changer ce que fait un nouveau constat `unfounded` ou `requirement_change` sur un cas gardé, qui renvoie déjà à la correction du code ou au propriétaire ; de rendre révocable la réponse « garder » par une autre voie que les règles de révocation existantes ; ni de toucher les IH-04 posées sur un relevé, un référentiel de qualité ou une carte d’architecture.

L’écart sur un cas gardé contesté avec un autre n’inclut pas : de comparer d’un protocole à l’autre le contenu du cas gardé pour refuser une préparation qui le changerait malgré son mandat, le cas étant protégé par l’IH-04 reposée avant toute révision et par son absence des cas à écrire de nouveau ; de changer ce que fait la réponse « réviser » du propriétaire sur le cas gardé, qui repasse déjà par G1 ; de lier la réponse « garder » à un autre cas ou à une autre exigence que ceux qu’elle nomme ; ni de réordonner l’examen des contestations d’un même candidat.

L’écart sur un cas contesté sous un nom que l’obligation gelée ne porte pas n’inclut pas : de rapprocher deux noms voisins pour étendre la réponse « garder » à un cas qu’elle ne nomme pas, le refus de la contestation suffisant ; d’inscrire dans une preuve les cas qu’elle a vus échouer, pour que la reproduction nomme un cas observé en échec plutôt qu’absent des cas réussis ; de vérifier qu’un `examiner_id` désigne une intervention de relecture distincte du producteur ; ni de restreindre une contestation sous une obligation gelée qui ne lie aucun cas, faute de préparation qui ait prouvé l’exigence : le noyau n’a alors aucune liste à lui opposer et la reçoit comme aujourd’hui.
