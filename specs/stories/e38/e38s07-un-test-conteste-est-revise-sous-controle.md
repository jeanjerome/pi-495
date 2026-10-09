# Un test erroné se conteste et se révise sans laisser le producteur changer son juge

Story : e38s07
Epic : e38
Statut : à faire

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

## 3. Sécurité

Réutiliser les décisions authentifiées via Pi et les règles de révocation existantes. Une revue de modèle ne révoque aucune décision humaine. Aucune issue « accepter quand même » pour une obligation obligatoire non satisfaite.

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

## 5. Hors périmètre

Pas de modification des tests par l’implémenteur, pas de nouvelle classe générale d’exceptions. Toute évolution des interactions humaines doit être enregistrée dans le corpus normatif et rester compatible avec les dossiers anciens.
