# Un résultat coûteux est réutilisé seulement quand toutes ses entrées pertinentes sont identiques

Story : e38s12
Epic : e38
Statut : à faire

Surface : cycle/ puis services de vérification de pi-495
Dépendances : e38s05, e38s10


## 1. Ce que le lecteur gagne

Le conducteur évite de relancer un calcul formel inchangé tout en empêchant les réutilisations trompeuses. La première version utilise des identités conservatrices : fermeture transitive des modules, configuration, propriétés, hypothèses, mode de calcul, budgets pertinents, versions/outils, environnement et, pour les tests du programme, identité exacte du candidat et de ses entrées.

La réutilisation d’un résultat de modèle ne réutilise pas les tests du code. Les résultats dépendant de ressources externes non identifiables ne sont pas réutilisés. Les horloges et expirations sont soit explicites dans les entrées, soit réévaluées. Une preuve originale est référencée ; aucun événement de réutilisation ne prétend être une nouvelle exécution.

## 2. Promesses

Scenario: Une propriété ou un outil modifié force une nouvelle exécution
  Given un résultat terminé enregistré
  When une propriété, un module importé, l’outil ou l’environnement change
  Then la clé change et le contrôle est relancé

Scenario: Un modèle identique ne dispense pas de tester le nouveau candidat
  Given le même modèle et un arbre candidat différent
  When la vérification reprend
  Then le résultat du modèle peut être référencé mais les contrôles du programme ne sont pas repris de l’autre candidat

Scenario: Une preuve perdue ou une entrée inconnue empêche la réutilisation
  Given un objet de preuve manquant ou une dépendance externe non identifiée
  When le conducteur cherche un résultat antérieur
  Then il réexécute ou rend l’incident applicable sans annoncer un succès de cache

## 3. Sécurité

Réutiliser les mécanismes existants `reusableQualification`, `sensorDigest` et le cache de Preflight avant d’ajouter une abstraction. Conserver l’invalidation prudente actuelle ; aucun calcul automatique de périmètre indépendant n’est supposé fiable.

## 4. Tâches

### Tâche 1 — Définir les identités de réutilisation

Compléter les identités du contrôle formel et documenter les entrées stables et non réutilisables. Distinguer modèle, qualification et exécution sur candidat ; un nom de fichier ou un commit seul n’est pas une clé suffisante.

- Vérifie : `node --test test/v0-pure/formal-result-identity.test.ts`
- Tient : `test/v0-pure/formal-result-identity.test.ts`, « changer un import transitif ou une propriété change la clé, changer seulement le candidat ne conserve que le modèle ».
- Rouge : Le cache de Preflight et la réutilisation de qualification ne couvrent pas encore ces résultats formels.

### Tâche 2 — Référencer une preuve intacte sans la recopier

Adapter le service de vérification et le journal du cycle pour retrouver l’objet original, vérifier identité et intégrité, et produire un événement de réutilisation. Ne réutiliser initialement que les exécutions concluantes selon la politique ; incident et exploration interrompue ne deviennent pas verts.

- Vérifie : `node --test test/v2-kernel/formal-result-reuse.test.ts`
- Tient : `test/v2-kernel/formal-result-reuse.test.ts`, « la seconde demande cite la preuve originale et sa corruption interdit cette réutilisation ».
- Rouge : Les nouveaux contrôles formels sont relancés sans ce mécanisme explicite.

### Tâche 3 — Mesurer les exécutions évitées sans changer les verdicts

Étendre les observations du cycle : durée réellement exécutée, temps de recherche, nombre de réutilisations et motif de nouvelle exécution. Comparer le même corpus avec réutilisation activée et désactivée, sans inventer du temps économisé à partir d’une simple estimation.

- Vérifie : `node --test test/cycle/verification-reuse.test.ts`
- Tient : `test/cycle/verification-reuse.test.ts`, « activer la réutilisation ne change aucun verdict du corpus et réduit les appels effectivement observés ».
- Rouge : Le journal ne distingue pas encore ces coûts et réutilisations pour les contrôles formels.

### Tâche 4 — Recette par le parcours réel

Lancer deux fois le même contrôle, puis modifier successivement un import, une propriété, l’outil et le candidat. Constater les appels réellement évités ou relancés. Corrompre l’objet enregistré sur une copie jetable et vérifier le refus. Refaire avec une exception datée expirée.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s12/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s12`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Cache distribué, invalidation minimale prouvée par analyse d’impact, réutilisation entre environnements supposés équivalents et contournement des contrôles complets prescrits par le cycle sont exclus.
