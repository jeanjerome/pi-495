# Auto-revue — e01s01, un rapport qui défait une liaison sans rien demander rouvre la spécification

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`bdebd23..595fd5a`, puis la correction `4892a6d`) ; code de production : `src/application/phases/clarify.ts`, `src/domain/change/state.ts` |
| Conduite le | 2026-09-25 |
| Branche | `rapport-rouvre-la-specification` |
| Mode | complet |
| Preflight au moment de la revue | verte à `595fd5a`, puis à `4892a6d`, sous Node 26.9.0 — `npm run build && npm run check`, sortie 0, 469 tests |

Classement par nombre de commits sur 90 jours : `test/v2/harness.test.ts` (23),
`src/domain/change/state.ts` (15), `test/helpers/harness-fixture.ts` (15), puis
`src/application/phases/clarify.ts` (6). Les fichiers de production ont été lus en premier.

## Ce que cette revue a corrigé avant son rapport

Deux écarts, sans effet sur le comportement, corrigés dans `4892a6d` :

- **Un champ que plus rien ne lit.** `SpecificationReportView` se présente comme « ce que la règle de
  réouverture lit d'un rapport ». Or `answersTheReportIgnores` ne filtre plus sur les questions
  posées, et `questions` n'était plus lu nulle part. Le champ est retiré. Les appelants passent un
  `SpecificationReport` complet, et le typage structurel l'accepte toujours.
- **Un assistant de test copié mot pour mot.** `rounds`, dans `test/v2/specification-reopening.test.ts`,
  reprenait les 25 lignes du `rounds` de `test/v2/harness.test.ts`. Les deux suites passent désormais
  par `specificationRounds` de `test/helpers/harness-fixture.ts`, qui écrit `GOOD_GREET` au lieu des
  deux copies locales de `RIGHT`. Les attendus des tests restent les mêmes.

Au premier passage après la correction, Preflight a refusé `dist/`, qui n'était plus reconstruit
depuis la source (`lint:distribution`, `state.d.ts`). Elle est verte après `npm run build`.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée.
- ✓ Aucun secret dans le diff. Aucune occurrence de `sk-`, `ghp_` ou `AKIA`.
- ✓ OWASP : le changement ne lit aucune entrée externe nouvelle. La boucle de réouverture est bornée
  par les réponses enregistrées : chaque tour doit porter une réponse qu'aucun rapport antérieur ne
  portait, donc l'ensemble `before` grossit à chaque tour. Un modèle qui oscille ne peut donc pas
  consommer d'interventions sans fin (6c le vérifie).
- ✓ Aucun constat HIGH (section e01s01 de `specs/security/REVIEW.md`). Aucune exception n'est
  nécessaire, et `specs/security/EXCEPTIONS.md` n'existe pas.

## Provenance

- ✓ `e01s01-tasks.yaml` porte `type: fix` et `context: domain`. Les étapes citent `60c2c34` (rouge)
  et `ada5ada` (vert).

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers. `clarify` passe par `ctx.artifacts` et
  `ctx.workspace`, comme avant.

## Conformité à CONVENTIONS.md

- ✓ Les relevés vont dans `specs/`. Aucun `gh issue create`, aucun appel direct à l'API GitHub.
- ✓ La règle reste dans `domain/`, et son application dans `application/phases/`
  (`lint:layers` est vert).

## Périmètre

- ✓ Le code de production touché est celui de la spec : le prédicat de `answersTheReportIgnores`, la
  borne de `specificationStanding` et le jugement dans `clarify` du rapport tout juste obtenu.
- ✓ Le changement d'attendu de `harness.test.ts` (3 → 4 interventions) est celui que la spec annonce.
- ✓ Aucune fonction spéculative.

## Règle du scout

- ✓ `clarify` perd 40 lignes. L'écriture d'un rapport devient `writeSpecification`, et le filtre des
  questions à poser, lu deux fois, devient `questionsToAsk`.
- ✓ Aucun code mort après correction. Aucun code commenté.

## Types et sûreté

- ✓ Aucun `any`, `@ts-ignore`, `eslint-disable` ni `as unknown as` ajouté.
- ⚠ `r.output as SpecificationReport` reste, déplacé tel quel. Il suit un `Value.Check` sur le même
  schéma.

## Couverture des tests

- ✓ 6a, 6b, 6c et 6e ont chacun un test dans `test/v2/specification-reopening.test.ts`, passé par
  l'interface publique du harnais (`start`, `advance`, `answerDecision`), avec le vrai registre et
  le vrai espace de travail.
- ✓ La correction a son test de régression, vu rouge seul à `60c2c34` (3 échecs sur 4 en isolation).
- ✓ F.I.R.S.T : chaque test crée son dépôt et son harnais temporaires, et `afterEach` les supprime.
  Rien ne dépend de l'ordre des tests.

## SOLID et heuristiques

- ✓ `writeSpecification` lance une intervention et propose son rapport. `clarify` décide s'il faut
  réécrire. `specificationStanding` reste pure.
- ✓ Le commentaire de `specificationStanding` dit pourquoi la borne se mesure contre tous les
  rapports, et non contre le seul précédent.

## Style

- ⚠ `writeSpecification` fait 40 lignes, au-delà des 20 visées. C'est le bloc que `clarify` portait
  déjà, déplacé tel quel. Le couper séparerait l'ouverture et la fermeture de l'espace de travail de
  leur `try/finally`.
- ⚠ `clarify` dépasse toujours 20 lignes. La branche le raccourcit.
- ⚠ `src/domain/change/state.ts` fait 430 lignes, et dépassait déjà 300 sur `main`.
- ✓ `questionsToAsk`, `writeSpecification` et `specificationRounds` sont uniques dans le dépôt.

## Rationalisations repérées

- « Le champ `questions` ne coûte rien » : il décrit une lecture qui n'a plus lieu, et le prochain
  lecteur croirait la règle encore liée aux questions posées. Retiré.
- « Copier l'assistant garde le nouveau fichier autonome » : les deux copies auraient divergé au
  premier changement du script d'implémentation. Factorisé.
- Preflight a tourné sous Node 26.9.0, et non sous le 24.21.0 des étapes précédentes. Le plancher
  déclaré (≥24) n'a pas été rejoué dans cette revue.

## Verdict

PASS après correction. Suite : `request-review`.
