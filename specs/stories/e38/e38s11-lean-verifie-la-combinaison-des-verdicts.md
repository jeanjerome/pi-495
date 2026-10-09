# Lean vérifie une règle de décision stable et le TypeScript est comparé à cette référence

Story : e38s11
Epic : e38
Statut : à faire

Surface : Développement de pi-495 — pilote Lean limité
Dépendances : e38s04, e38s06


## 1. Ce que le lecteur gagne

Le développeur dispose d’une spécification Lean de la combinaison des verdicts utilisée par G5 et de preuves sur ses règles. Le périmètre comprend all_pass, any_pass, les listes vides et NOT_APPLICABLE ; il respecte la sémantique du code adopté. Le caractère obligatoire d’une exigence et les autres conditions de G5 sont traités explicitement par les tests qui enveloppent cette combinaison.

La fonction TypeScript de production n’est pas déclarée prouvée : on compare ses résultats observables à une fonction de référence Lean sur un domaine fini systématique et des cas générés. Cette expérience décide si le bénéfice justifie d’autres preuves. Lean reste un outil de développement optionnel pour les utilisateurs du produit.

## 2. Promesses

Scenario: La preuve porte sur l’énoncé approuvé
  Given les définitions et théorèmes de combinaison adoptés avant la recherche de preuve
  When les preuves sont vérifiées
  Then les énoncés sont identiques, aucun sorryAx ni axiome non autorisé n’est utilisé et la version des dépendances est conservée

Scenario: all_pass ne tolère pas un verdict bloquant
  Given une liste de verdicts évalués selon la règle all_pass
  When une valeur FAIL, INDETERMINATE ou NOT_RUN est pertinente
  Then la combinaison n’est pas PASS

Scenario: any_pass conserve sa sémantique propre
  Given une liste qui contient PASS et FAIL et une obligation déclarée any_pass
  When la combinaison est calculée
  Then le résultat de la combinaison reste PASS sans autoriser de changer une autre obligation obligatoire

Scenario: Une divergence du TypeScript est visible
  Given une variante TypeScript qui accepte une liste vide
  When la comparaison avec la référence Lean est rejouée
  Then un cas minimal démontre la divergence

## 3. Sécurité

Définitions et énoncés protégés, vérification distincte de la génération des preuves, axiomes autorisés explicitement listés. Build des preuves sous droits adaptés ; aucune validation fondée uniquement sur un exit code ou un texte « theorem proved ». Pas de changement de la règle métier pour faciliter la preuve.

## 4. Tâches

### Tâche 1 — Fixer les définitions et théorèmes

Créer `specs/formal/verdicts/` avec définitions, énoncés et table de correspondance vers `domain/gates/g5.ts`. Réutiliser l’interface publique `evaluateG5` pour les observations TypeScript ; toute extraction éventuelle de combine conserve exactement son comportement.

- Vérifie : `node --test test/v0-pure/lean-verdict-contract.test.ts`
- Tient : `test/v0-pure/lean-verdict-contract.test.ts`, « les définitions all/any, vide et NOT_APPLICABLE correspondent à la table approuvée ».
- Rouge : Aucune spécification Lean de cette décision n’existe dans le dépôt.

### Tâche 2 — Vérifier preuves et dépendances

Ajouter le projet Lean local, verrouiller la version qualifiée et contrôler les axiomes transitifs de chaque théorème. Comparer l’empreinte des énoncés protégés avant/après ; rejouer les preuves selon les mécanismes de validation officiels disponibles dans cette version. Qualifier avec preuve valide, preuve incomplète et énoncé altéré.

- Vérifie : `node --test test/v4-platform/lean-verdict-proof.test.ts`
- Tient : `test/v4-platform/lean-verdict-proof.test.ts`, « une dépendance utilisant sorry et une preuve d’un autre énoncé sont refusées ».
- Rouge : Le dépôt n’a ni chaîne de vérification Lean ni qualification de ces refus.

### Tâche 3 — Comparer la référence aux verdicts du noyau

Construire une interface de test de la référence Lean et comparer les combinaisons finies jusqu’à une borne déclarée, puis des listes plus longues générées. Tester les obligations obligatoires et facultatives via evaluateG5 avec autres conditions maîtrisées. Conserver cas et graines ; aucune revendication d’équivalence formelle.

- Vérifie : `node --test test/v4-platform/lean-verdict-differential.test.ts`
- Tient : `test/v4-platform/lean-verdict-differential.test.ts`, « le mutant qui accepte le vide est rejeté et le noyau adopté concorde sur le corpus déclaré ».
- Rouge : Les tests TypeScript ne sont pas comparés à une référence formelle indépendante.

### Tâche 4 — Recette par le parcours réel

Exécuter la preuve avec Lean réel, inspecter les axiomes et rejouer la comparaison. Introduire séparément sorry transitif, énoncé modifié et mutant TypeScript ; chacun doit être détecté par le contrôle attendu. Mesurer durée et coût d’entretien de ce seul pilote.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s11/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s11`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Aucune réécriture du noyau en Lean, aucun théorème global « pi-495 sans bug », aucun Lean requis à l’installation du produit. Une preuve de raffinement complète ferait l’objet d’une décision ultérieure.
