# Les traces du modèle deviennent des tests reproductibles du noyau réel

Story : e38s04
Epic : e38
Statut : à faire

Surface : Tests de pi-495 — pont modèle/implémentation
Dépendances : e38s03


## 1. Ce que le lecteur gagne

Les contre-exemples cessent d’être de simples illustrations : un adaptateur rejoue les actions par les interfaces réelles du noyau et compare les observations utiles après chaque étape. Les identités abstraites sont traduites en références concrètes par cet adaptateur, jamais assimilées à des chemins ou commandes.

Les traces des mutants deviennent des séquences adverses que le noyau corrigé doit refuser ; on ne lui demande pas de reproduire leur état fautif. Des traces valides établissent aussi que le pont permet les opérations autorisées. `fast-check`, déjà présent dans les dépendances, complète le corpus par des séquences bornées et reproductibles.

## 2. Promesses

Scenario: La séquence de preuve tardive est rejouée sur le noyau
  Given une trace lancer P1, réviser P2, interrompre, reprendre, recevoir P1, accepter
  When l’adaptateur la rejoue par les commandes du noyau
  Then le noyau refuse l’acceptation appuyée sur P1 et le test nomme la propriété protégée

Scenario: Une trace inconnue n’est pas sautée
  Given une action abstraite que l’adaptateur ne sait pas traduire
  When la trace est chargée
  Then le test échoue avec cette action et aucun résultat de conformité n’est annoncé

Scenario: Une séquence générée reste reproductible
  Given une exécution de tests par propriétés qui trouve un écart
  When le cas est réduit
  Then le dossier conserve la graine, le chemin de réduction, les versions et la séquence minimale

## 3. Sécurité

Les tests écrivent dans des stores temporaires et ne commandent aucun Git réel sans copie jetable. Le mapping d’actions est explicite et fermé. Les assertions portent sur les résultats publics, événements et refus, non sur les champs privés.

## 4. Tâches

### Tâche 1 — Normaliser les traces et écrire le mapping

Créer `test/support/formal-traces.ts` avec un format versionné d’actions et d’observations. Définir ce qui est observable et les étapes internes ignorées par abstraction ; refuser une action absente du mapping. Réutiliser les fixtures des tests du noyau.

- Vérifie : `node --test test/v0-pure/formal-trace-format.test.ts`
- Tient : `test/v0-pure/formal-trace-format.test.ts`, « une action inconnue et une trace dépourvue de propriété sont refusées ».
- Rouge : Le dépôt ne relie pas les traces d’un modèle aux commandes du noyau.

### Tâche 2 — Rejouer traces valides et séquences adverses

Ajouter `test/v2-kernel/formal-traces.test.ts`, puis les cas reprise, nouvelle révision et résultat tardif. Appeler le vrai décideur et le stockage de test ; conserver une correspondance stable entre étape et constat.

- Vérifie : `node --test test/v2-kernel/formal-traces.test.ts`
- Tient : `test/v2-kernel/formal-traces.test.ts`, « P1 reçu après reprise ne satisfait pas une obligation sous P2, tandis que P2 valide permet la poursuite ».
- Rouge : Les tests existants ne sont pas liés à ce corpus partagé ; l’omission d’une action n’est pas détectée par un replay.

### Tâche 3 — Générer des séquences avec fast-check

Ajouter des commandes à préconditions explicites et des générateurs bornés dans `test/v2-kernel/change-properties.test.ts`. Persister les cas réduits utiles ; ne pas revendiquer l’exhaustivité de cette campagne aléatoire.

- Vérifie : `node --test test/v2-kernel/change-properties.test.ts`
- Tient : `test/v2-kernel/change-properties.test.ts`, « une graine rejouée produit les mêmes actions et un défaut injecté est réduit en séquence conservée ».
- Rouge : La dépendance fast-check existe, mais aucun pont à ce modèle et à ses traces n’est présent.

### Tâche 4 — Recette par le parcours réel

Exécuter les traces sur le noyau réel. Sur une copie jetable, retirer la garde d’identité ciblée et vérifier l’échec du test correspondant ; remettre le code et vérifier le vert. Rejouer une graine archivée et vérifier le même résultat.

- Vérifie à la main : exécuter le parcours décrit ci-dessus et conserver les observations dans `specs/verifications/e38s04/` par l’outil du cycle. Appliquer également la recette réelle et les campagnes exigées par `cycle/README.md` pour la surface touchée.
- Tient : dossier de recette de `e38s04`, observations positives et négatives liées aux promesses et à la révision testée.
- Rouge : sur le point de départ, le parcours nouveau décrit dans les promesses n’est pas disponible de bout en bout ; établir ce constat avant réalisation, sans compter une erreur d’import ou l’absence d’un fichier de test comme un rouge métier.

## 5. Hors périmètre

Aucun générateur universel de tests depuis TLA+, aucune preuve de raffinement du TypeScript. Cette story réalise la tranche « séquences du noyau » d’e36, pas tout le fuzzing multistack.
