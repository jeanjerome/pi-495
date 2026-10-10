# La revue des promesses et la recette réelle alimentent l’acceptation du candidat exact

Story : e38s09
Epic : e38
Statut : versée

Surface : pi-495 — protocole de revue et recette G5
Dépendances : e38s08


## 1. Ce que le lecteur gagne

Le propriétaire obtient une revue qui relie chaque promesse au code et à son assertion, puis une recette du logiciel assemblé par son entrée réelle. La profondeur des revues et la recette attendue sont fixées avant G2 ; un avis de modèle ne devient jamais une décision humaine.

Le protocole nomme le parcours, les préconditions, l’entrée réelle, les observations, le témoin négatif, les simulations autorisées et ce qui n’est pas exercé. Un contrôle déterministe produit les faits vérifiables ; le relecteur qualifie les aspects qui demandent un jugement. G5 reste l’unique agrégateur automatique. Les mutations ciblées sont exécutées par un mécanisme autorisé sur une copie jetable.

## 2. Promesses

Scenario: Une revue verte sans recette obligatoire ne permet pas l’acceptation
  Given les tests verts et les revues approuvées mais le parcours réel non exécuté
  When G5 juge un protocole qui requiert cette recette
  Then le candidat reste non accepté et la preuve manquante est nommée

Scenario: Le parcours négatif distingue le comportement livré
  Given une recette verte du candidat et une copie privée du mécanisme de la story
  When le témoin négatif est exécuté
  Then le refus ou l’écart attendu est observé et lié à la promesse concernée

Scenario: Un avis de modèle conserve sa provenance
  Given un relecteur de recette qui approuve
  When la politique exige aussi une acceptation humaine
  Then l’avis ne satisfait pas cette décision et Pi présente la demande humaine

## 3. Sécurité

Ne pas réutiliser l’arbitrage automatique de cycle/ comme IH-10. Contrôles négatifs et mutations n’altèrent jamais le candidat jugé. Les données externes de recette sont déclarées ; aucune fermeture générale du réseau.

## 4. Tâches

### Tâche 1 — Déclarer la revue et la recette avant le gel

Étendre le protocole et le profil avec missions de revue, parcours de recette et preuves attendues. Réutiliser `required_reviews` et les combinaisons d’obligations ; les rôles sont déterminés par le risque et n’ont pas tous la même mission.

- Vérifie : `node --test test/v0-pure/acceptance-plan.test.ts`
- Tient : `test/v0-pure/acceptance-plan.test.ts`, « une recette obligatoire sans observation ni témoin négatif applicable est incomplète ».
- Rouge : Le protocole peut exiger des revues mais ne porte pas ce contrat de recette opérationnelle.

### Tâche 2 — Exécuter la recette et relier les constats

Adapter `src/application/review.ts`, `phases/review.ts` et la vérification pour référence exigence → code → assertion → observation. Passer par les exécuteurs et lecteurs existants ; enregistrer version construite, entrée utilisée et simulations.

- Vérifie : `node --test test/v2-kernel/acceptance-recipe.test.ts`
- Tient : `test/v2-kernel/acceptance-recipe.test.ts`, « une recette sur une autre révision ou un simple compte rendu sans observations ne suffit pas ».
- Rouge : La recette du cycle n’est pas encore un contrôle de recette du produit avec ces identités.

### Tâche 3 — Faire décider G5 sans affaiblir ses obligations

Relier résultats, avis et décisions aux obligations gelées. Respecter les combinaisons adoptées et l’arbitrage existant ; une limite de tours ou de coût n’efface pas un échec obligatoire.

- Vérifie : `node --test test/v2-kernel/acceptance-recipe-gate.test.ts`
- Tient : `test/v2-kernel/acceptance-recipe-gate.test.ts`, « les tests verts ne compensent pas la recette manquante et un avis ne remplace pas IH-10 ».
- Rouge : Aucune preuve de cette recette nouvelle ne participe encore à G5.

### Tâche 4 — Recette par le parcours réel

Charger l’extension construite dans Pi réel et conduire la recette positive puis négative d’une petite cible. Retirer le rapport de recette, puis remplacer son identité par celle d’un autre candidat : vérifier les deux refus. Vérifier également la demande humaine lorsque la politique l’impose.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s09/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s09`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Réduction du nombre de relecteurs de cycle/ différée jusqu’aux mesures ; aucun moteur universel de tests end-to-end, aucune prétention d’indépendance statistique entre modèles.
