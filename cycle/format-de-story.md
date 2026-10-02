# Format de story

Une story dit ce qu'un incrément de 495 change pour celui qui le lit, ce qu'elle promet, et où
chaque promesse est tenue. Elle est écrite avant le code, avec le propriétaire, et rangée sous
`specs/stories/<epic>/<story>-<titre-court>.md`. `scripts/check-story-format.ts` la refuse quand une
section manque, sort de son rang ou change de nom, quand l'en-tête est incomplet, quand aucune
promesse n'est un scénario, ou quand une tâche ne dit pas ce qui la tient. Une story versée n'est
plus jugée : rien de neuf ne s'y écrit.

## En-tête

Un titre, puis trois lignes, avant la première section :

```
# La décision est écrite et la recette tenue par une exécution réelle

Story : e01s05
Epic : e01
Statut : à faire
```

`Statut` vaut `à faire`, `en cours` ou `versée`. L'outil du cycle le fait avancer ; la main ne
l'écrit qu'à la création.

## Sections

Cinq sections, dans cet ordre, sous ces noms exacts. Une section sans objet porte « Sans objet »
et sa raison en une ligne ; elle n'est pas supprimée.

## 1. Ce que le lecteur gagne

Un ou deux paragraphes : qui lit le dossier ou tient la commande, ce qu'il obtient que le code
d'aujourd'hui ne lui donne pas, et pourquoi c'est un défaut et non une préférence. Pas de
mécanique : la section nomme un bénéficiaire, pas une implémentation.

## 2. Promesses

Les scénarios que la relecture vérifie et que la recette rejoue, en Gherkin : `Scenario`, `Given`,
`When`, `Then`. Un scénario par comportement promis, exceptions et refus compris. Chaque `Then`
nomme un artefact, un événement, un refus ou un message : un compte ou l'absence d'erreur ne tient
une promesse que si la story l'énonce. Ce qui n'est pas ici n'est pas relu.

## 3. Sécurité

Les mesures que la story ajoute ou touche : provenance, confinement, secrets, sortie de données,
chemins protégés. « Sans objet » quand la story n'en touche aucune, avec la raison.

## 4. Tâches

Une sous-section par tâche, `### Tâche N — <titre>`, dans l'ordre où elles se font. Chaque tâche dit
ce qu'elle change, puis trois lignes :

- `Vérifie :` la commande qui la tient, entre accents graves, sans guillemets ni tube, écrite rouge au
  moment du plan parce qu'elle nomme un test qui n'existe pas encore. Une manœuvre qu'aucune commande ne conduit s'écrit `Vérifie à la main :`
  et ses étapes suivent.
- `Tient :` le fichier de test et l'assertion, dans les mots de la story.
- `Rouge :` ce que le code fait aujourd'hui qui fait échouer cette assertion. Un fichier absent, une
  erreur d'import ou de type n'est pas un rouge.

## 5. Hors périmètre

Ce que la story ne fait pas et qu'un lecteur pourrait attendre, avec la story ou l'epic qui le fera,
ou la raison de ne pas le faire.

## Exemple

```
# Une réponse révoquée est reposée

Story : e01s05
Epic : e01
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui relit un dossier voit …

## 2. Promesses

Scenario: Une réponse révoquée est reposée
  Given une réponse « 400 » à Q1
  When le propriétaire révoque la réponse
  Then une décision IH-01 repose Q1, avec les issues répondre, clore et abandonner

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni sortie de données.

## 4. Tâches

### Tâche 1 — Le noyau repose la question révoquée

Le noyau retire la réponse et …

- Vérifie : `node --test test/v2-kernel/answer-revocation.test.ts`
- Tient : `test/v2-kernel/answer-revocation.test.ts`, « une décision IH-01 repose Q1 avec ses trois issues »
- Rouge : `revokeQuestion` n'existe pas ; `pendingDecisions` rend une liste vide après la révocation

## 5. Hors périmètre

La révocation depuis une seconde session vivante : e09.
```
