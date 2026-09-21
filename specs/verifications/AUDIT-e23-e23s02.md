# Auto-revue — e23s02, la strate imposée déclarée au manifeste

| | |
|---|---|
| Périmètre | `git diff $(git merge-base main HEAD)..HEAD` |
| Conduite le | 2026-09-21 (UTC) |
| Branche | `strate-imposee-au-manifeste` |
| Mode | complet |
| Preflight au moment de la revue | vert — `npm run build && npm run check`, sortie 0, 318 tests, neuf contrôles, zéro avertissement |

Ordre de lecture par turbulence sur 90 jours, la plus agitée d'abord : `harness.ts` (31 commits,
+4), `harness.test.ts` (17, +42), `context.ts` (12, +6), `harness-fixture.ts` (10, +4/-2),
`execution.ts` (8, +3), puis les fichiers neufs, sans historique mais gros : `check-capsule.ts`
(204), `provider-system-block.test.ts` (85), `check-provider-system-block.ts` (79),
`imposed-layers.ts` (35).

## Ce que cette revue a corrigé avant de rendre son rapport

**`checkCapsule` faisait 57 lignes** — la convention en demande 4 à 20. Découpée en trois :
`checkTasks` (11), `checkTasksFile` (22), `checkCapsule` (28), chacune à un seul niveau
d'abstraction. Les quatre paramètres de contexte qui circulaient ensemble — chemin affiché,
répertoire, entrées, stories déclarées — étaient un *Data Clump* : ils portent désormais un nom,
`Capsule`. Les dix refus du contrôle ont été rejoués un par un après le découpage, et le cas sain
repasse : aucun comportement n'a bougé.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée. Rien à classer `[OK]`/`[SUS]`/`[SLOP]` ; `package.json` ne gagne que
  deux entrées de script.
- ✓ Aucun `[SLOP]`.
- ⚠ **Un motif de secret apparaît dans le diff, et ce n'en est pas un.**
  `src/domain/imposed-layers.ts` porte la chaîne `« an access token prefixed sk-ant-oat »`. C'est le
  *préfixe* des jetons d'abonnement, cité dans la condition déclarée — la même information que le
  paquet du fournisseur distribue en clair dans son propre code. Aucun jeton, aucune valeur. Signalé
  plutôt que coché en silence, parce qu'un scanner naïf s'y arrêtera et que le prochain lecteur doit
  savoir pourquoi c'est là.
- ✓ OWASP : le changement n'ouvre aucun canal et n'élargit aucune permission. Pas d'injection — la
  seule expression régulière lit un fichier local et son résultat n'est jamais exécuté ; pas
  d'authentification touchée ; pas de configuration élargie. Exposition de données : établie, pas
  supposée — le manifeste traverse jusqu'au worker mais aucun fichier de l'adaptateur ne lit
  `mandate.context`, et les octets émis sont identiques avec et sans la strate, empreinte comprise.
- ✓ Revue de sécurité conduite et écrite : `specs/security/REVIEW.md`, aucun constat à confiance
  ≥ 8, deux observations sous le seuil consignées.

## Provenance et métadonnées

- ✓ `e23s02-tasks.yaml` porte `type: feat` et `context: domain`, et chaque tâche porte `risk:`,
  `security:` et son bloc `allure:`.
- ✓ Les décisions sont référencées là où elles s'appliquent : `CTX-02, D-48` dans l'en-tête de
  `imposed-layers.ts`, du champ de `ContextManifest` et du contrôle ; `D-54` dans l'en-tête de
  `check-capsule.ts`.

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers. `this.deps.model.provider_id` lit une dépendance
  injectée, au même titre que `this.deps.policy.budgets.intervention_ms` déjà en place.
  `capsule.where` est un champ direct.

## Conformité CONVENTIONS.md

- ✓ Tout ce qui est produit va dans `specs/`. `AGENTS.md` et `CONVENTIONS.md` sont modifiés, mais ce
  sont les fichiers canoniques du dépôt, mis à jour parce que la chaîne de lint compte désormais neuf
  contrôles — pas de la documentation déposée à la racine.
- ✓ Aucun `gh issue create`, aucun appel direct à l'API GitHub, aucun `gh` ajouté.
- ✓ Messages de commit au format `<type>: <description>`, une ligne, sans référence de ticket.

## Périmètre

- ⚠ **Cette branche porte plus que la story, et c'est assumé, pas subi.** Trois ajouts sortent du
  strict énoncé d'e23s02 :
  1. `scripts/check-capsule.ts` et `D-54` — arbitrage explicite du propriétaire à la sortie de
     `plan-work`, en remplacement d'une porte du paquet d'outils qui ne peut pas juger ce dépôt.
  2. La règle « une story dite faite doit porter sa preuve » ajoutée au même contrôle pendant
     `verify-work` — réponse à un défaut découvert : la vérification du paquet qui promettait
     exactement cela ne peut structurellement pas se déclencher. C'est l'échelle *fix-or-log* de
     CONVENTIONS appliquée, pas un élargissement opportuniste.
  3. Le découpage de `checkCapsule` ci-dessus, sur un fichier ouvert par cette revue.
- ✓ Aucune fonctionnalité spéculative. `imposedLayersFor` ne connaît qu'un fournisseur ; la position
  n'a qu'une valeur possible, et aucune autre n'a été inventée « pour plus tard ».
- ✓ Aucun fichier touché hors de ce que ces trois points impliquent.

## Règle du boy-scout

- ✓ Les fichiers de production touchés sortent au moins aussi propres : `context.ts` et `harness.ts`
  ne reçoivent qu'un champ et un appel, chacun commenté par son motif.
- ✓ Aucun code mort, aucun bloc commenté. Le fichier temporaire du cycle rouge-vert
  (`imposed-layers.ts.impl` mis de côté pour écrire le test d'abord) vivait dans le répertoire de
  travail de session, jamais dans le dépôt.

## Types et sûreté

- ✓ Aucun `any`, aucun `@ts-ignore`, aucun `as unknown as` ajouté — vérifié sur les lignes ajoutées
  du diff.
- ✓ Un seul `as` subsiste dans le contrôle de capsule, `task.status as (typeof TASK_STATES)[number]`,
  à l'intérieur même du test qui valide cette appartenance : il ne contourne rien.
- ✓ Toute fonction publique est typée ; `ImposedLayer.position` est un littéral, pas une chaîne
  libre.

## Couverture de test

- ✓ `imposedLayersFor` : quatre cas — fournisseur connu, fournisseur qui n'impose rien, fournisseur
  jamais vérifié, identifiant vide.
- ✓ `buildContext` : champ présent et vide par défaut ; strate portée sans rejoindre les instructions
  composées ni le texte émis.
- ✓ Câblage du noyau : campagne complète en v2, chaque artefact de contexte relu depuis le journal.
- ✓ `check-provider-system-block.ts` : six cas, dont un contre le paquet réellement épinglé.
- ✗ **`check-capsule.ts` n'a aucun test automatisé.** Ses dix refus ont été éprouvés à la main, sur
  des copies abîmées, avant et après le découpage — mais rien ne les rejouera demain. C'est la
  convention du dépôt : aucun des sept autres `scripts/check-*.ts` n'est testé, chacun étant sa
  propre preuve à chaque Preflight. La convention tenait tant qu'un contrôle ne portait que des
  règles de structure ; celui-ci décide maintenant si une story peut se dire faite. **Recommandation
  au relecteur :** trancher s'il faut ouvrir la pratique d'un test par contrôle, ce qui dépasse cette
  story.
- ⚠ Les tests passent par l'interface publique, sauf un qui lit `node_modules` — le seul qui donne
  son sens au contrôle. Dépendance à l'environnement délibérée : elle est ce qui fait qu'une montée
  de version du fournisseur rend Preflight rouge.
- ✓ F.I.R.S.T par ailleurs : ~640 ms pour les six cas du contrôle, répertoire temporaire neuf par
  cas, nettoyé après, aucun ordre imposé entre eux.

## SOLID et heuristiques

- ✓ Responsabilité unique : le domaine déclare, le constructeur recopie, le noyau renseigne, le
  contrôle relève. Aucun des quatre ne fait le travail d'un autre.
- ✓ Ouvert/fermé : un fournisseur de plus est une entrée de table, sans toucher au constructeur ni au
  noyau.
- ✓ Inversion des dépendances : `imposedLayersFor` est appelée par le noyau, qui tient déjà la
  sélection de modèle ; le constructeur de contexte, lui, **reçoit** la liste et n'importe rien —
  c'est ce qui le laisse testable sans fournisseur.
- ✓ Direction des couches tenue : `domain → ports → application`. `ports/execution.ts` importe un
  type du domaine, ce que la règle autorise et que `ports/ledger.ts` faisait déjà.

## Odeurs (Fowler) — nommées

- **Data Clump** — détectée et refermée : quatre paramètres de contexte circulaient ensemble, ils
  s'appellent maintenant `Capsule`.
- **Duplicated Code** — détectée, **non refermée**. Mon `jsFiles()` est le cinquième parcours
  récursif de répertoire dans `scripts/` : `check-architecture.ts`, `check-exports.ts`,
  `check-layers.ts` et `check-distribution.ts` en portent chacun un. La part commune vaut six lignes ;
  l'extraire créerait un module partagé sous `scripts/` et toucherait quatre contrôles étrangers à
  cette story. Décision : signalée ici, pas faite maintenant. C'est une dette nommée, pas une dette
  ignorée.
- **Mysterious Name** — non. `imposed_layers`, `imposedLayersFor`, `checkVerified` disent ce qu'ils
  sont. La règle du « moins de cinq occurrences au grep » vise l'ambiguïté : `imposedLayersFor` en
  compte quinze, mais toutes désignent le même concept employé, pas un nom vague réutilisé ailleurs.
- **Feature Envy**, **Primitive Obsession**, **Message Chains**, **Middle Man** — aucune détectée.

## Style

- ✓ Fichiers neufs sous 300 lignes : 35, 79, 220.
- ⚠ **Deux fichiers touchés dépassent la borne, et la dépassaient déjà** : `context.ts` (351) et
  `harness.ts` (881). Mon diff y ajoute six et quatre lignes. Les découper est un chantier en soi,
  sans rapport avec cette story ; la règle du boy-scout demande de ne pas les salir, pas de les
  refondre à l'occasion d'un champ ajouté. Consigné plutôt que coché.
- ⚠ Trois fonctions restent au-dessus de 20 lignes après découpage : `checkCapsule` (28), `tasks`
  (26), `checkTasksFile` (22). `tasks` est un analyseur ligne à ligne que fragmenter rendrait moins
  lisible, pas plus ; les deux autres sont à un seul niveau d'abstraction. Jugement rendu, pas
  masqué.
- ✓ Retours anticipés, deux niveaux d'indentation au plus, conditions exprimées au positif sauf les
  gardes.
- ✓ Les commentaires disent pourquoi : pourquoi la strate ne rejoint pas les instructions composées,
  pourquoi une story sans spécification est admise, pourquoi une seule expression régulière tient
  trois faits à la fois.

## Drapeaux rouges — rationalisations attrapées

Trois, nommées plutôt que suivies :

1. « Le découpage de `checkCapsule`, c'est hors périmètre. » Faux : c'est un fichier que j'ai écrit
   cette session, qui violait une règle écrite du dépôt. Corrigé.
2. « Aucun autre contrôle n'a de test, donc le mien n'en a pas besoin. » La précédent est réel, mais
   il vaut pour des contrôles de structure ; celui-ci décide de l'achèvement d'une story. Reporté au
   relecteur au lieu d'être coché.
3. « Le parcours de répertoire est trop petit pour compter comme duplication. » Il l'est — et c'est
   la cinquième copie. Nommée comme dette, avec son coût de fermeture.

## Verdict

Aucun point bloquant. Un ✗ ouvert — l'absence de test automatisé sur `check-capsule.ts` — et quatre
⚠ consignés : le motif de secret qui n'en est pas un, le périmètre élargi et pourquoi, les deux
fichiers hors borne qui l'étaient déjà, et la duplication du parcours de répertoire.

Prochain pas : `request-review`, pour un second avis qui n'a pas écrit ce code.
