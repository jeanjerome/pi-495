# e25s01 — le fournisseur du modèle choisi est admis sans configuration

Conduite le 2026-09-23 sur `le-modele-choisi-est-admis`, depuis `main` à `1e7fd3e` (Preflight vert,
393 tests).

## Commandes des tâches

Relevées à `bda51c7`.

```
$ node --test test/v1/model-admitted.test.ts                 # tâches 1 et 3
ℹ tests 6   ℹ pass 6   ℹ fail 0
$ node --test test/v2/model-admitted.test.ts                 # tâche 2
ℹ tests 4   ℹ pass 4   ℹ fail 0
$ ! grep -q 'policy.egress' README.md && node --test test/v1/model-admitted.test.ts
exit=0
$ npm run build && npm run check                             # tâche 4
ℹ tests 382   ℹ pass 382   ℹ fail 0
exit=0
```

393 tests avant, 382 après : 21 tests de la liste et de son refus sont retirés, 10 sont ajoutés. Les
tests du secret sentinelle de `test/v1/egress.test.ts` restent inchangés et passent. Ils portent sur
l'environnement remis au worker et sur le texte composé pour le modèle.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| La politique ne porte aucune liste ; une clé `policy.egress`, quelle que soit sa forme, est ignorée et annoncée sans reproduire son contenu ; un fichier illisible ne refuse plus rien (remplacé depuis par la dernière ligne) | `8bf454b` — 5 échecs sur 6 | `e6492c5` |
| Un changement atteint sa première intervention avec un fournisseur que rien ne déclare, y compris sous une liste héritée qui ne nomme que `omlx` ; le journal inscrit ce fournisseur ; `run()` joint le worker | `11da7b1` — 3 échecs sur 4, motif `policy_denied` | `e6492c5` |
| Un modèle sans fournisseur reste un refus de capacité | **vert à l'arrivée** — garde de non-régression | — |
| Un fichier illisible est annoncé sans rien citer du fichier | rouge observé avant correction, non commité seul (voir plus bas) | `dcdd890` |
| Un fichier illisible, ou dont une section n'est pas un objet, arrête tout changement, sans citer son texte ni son chemin | rouge observé avant correction, non commité seul (voir plus bas) | `bda51c7` |

Les deux premiers comportements rouges ont un seul commit vert. Retirer le champ `egress` de la politique
retire du même coup la règle que le superviseur appliquait. Aucun état intermédiaire ne compile avec
l'un sans l'autre.

Le test de la tâche 2 lisait l'événement du journal sous le nom `intervention.start` : c'est le nom
de la commande, alors que le journal inscrit `intervention.started`, avec le modèle sous `event`. Le
rouge de `11da7b1` n'en dépendait pas : sa première assertion tombait sur `policy_denied`. Le
lecteur est corrigé dans `e6492c5`.

L'isolation du rouge est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt de Homebrew, pas celui-ci.

```
8bf454b (test seul)      node --test test/v1/model-admitted.test.ts  exit=1
11da7b1 (test seul)      node --test test/v2/model-admitted.test.ts  exit=1
e6492c5 (implémentation) node --test test/v1/model-admitted.test.ts  exit=0
e6492c5 (implémentation) node --test test/v2/model-admitted.test.ts  exit=0
```

Le diagnostic d'un fichier illisible reprenait le message de `JSON.parse`, qui cite un extrait du
fichier, et ce diagnostic part vers le modèle de la session. Le test « says an unreadable file is
ignored without reproducing any of its text » a été écrit d'abord et vu rouge sur l'arbre de
`0a44577`, puis commité avec le correctif dans `dcdd890` :

```
AssertionError [ERR_ASSERTION]: a diagnostic is sent to the session's model, so an excerpt of the
file would leave with it: config.json ignored: Unexpected token 'k', ..."vider_id":k7f3a9}]}}" is not valid JSON
```

Le propriétaire a tranché le 2026-09-23 qu'un fichier illisible arrête tout changement au lieu de
céder aux réglages par défaut (BUG-2026-09-23T184520). Les tests ont été écrits d'abord et vus rouges
sur l'arbre de `2a33e36`, puis commités avec le correctif dans `bda51c7` :

```
node --test test/v1/model-admitted.test.ts   2 échecs sur 6
  ✖ refuses an unreadable file instead of running under the defaults, without reproducing any of its text
  ✖ refuses a file it cannot open without naming where it lies
node --test --test-name-pattern="a startup diagnostic" test/v3/pi-entries.test.ts   1 échec sur 1
  AssertionError [ERR_ASSERTION]: print mode announces the unreadable diagnostic
```

Le cas v3 vu rouge ne portait pas encore l'agent scripté ni l'assertion qu'aucun identifiant de
changement n'est affiché : ils ont été ajoutés avant le correctif, pour qu'un démarrage que le refus
laisserait passer n'appelle aucun modèle.

Deux contrôles négatifs tiennent les tests resserrés à `67740c4`, par mutation injectée puis
retirée :

```
liste d'admission rétablie sur anthropic, omlx, scripted   node --test test/v2/model-admitted.test.ts  3 échecs sur 4
valeur d'une clé policy.egress chaîne recopiée au diagnostic  node --test test/v1/model-admitted.test.ts  1 échec sur 6
```

Le fournisseur des tests v2 était `anthropic`, que la table des strates imposées de 495 nomme : la
première mutation laissait alors passer les 9 tests de la story.

## Revue de sécurité — tâches 1 et 2, `security: high`

Aucun constat nouveau sur les chemins touchés.

- `src/extension/config.ts` — le diagnostic est une chaîne constante. Il ne reproduit ni la clé
  ignorée ni son contenu, et un test le vérifie avec un nom de fournisseur qu'aucun défaut ne porte.
  La clé est retirée avant l'étalement de `policy`, donc elle ne reste pas dans la politique active.
  Les autres réglages sont lus comme avant. Un fichier illisible, ou dont une section n'est pas un
  objet, lève `CONFIGURATION_ERROR` et aucun changement ne tourne ; le refus ne cite ni le texte du
  fichier (BUG-2026-09-23T173000, corrigé dans `dcdd890`) ni son chemin, et les arbitrages humains
  qu'il porte ne passent pas au noyau (BUG-2026-09-23T184520, corrigé dans `bda51c7`).
- `src/domain/policy.ts` — la situation n'y garde aucun type. `EgressLocation`, qui n'avait plus
  de lecteur, est retiré ; e25s03 introduit le sien quand il la lit de l'adresse du modèle.
- `src/application/intervention.ts` — `requireCapable` juge encore le bac à sable et les capacités
  du modèle. `harness.ts` l'appelle avant de soumettre `intervention.start`, dont le journal inscrit
  `intervention.started`. Rien n'est engagé pour
  une intervention refusée.
- Environnement du worker et constructeur de contexte : non touchés. Les tests du secret sentinelle
  passent.

**Contrôle retiré, comme la story le prévoit :** le refus d'une destination non déclarée. Un modèle
distant choisi dans Pi reçoit des extraits sans déclaration préalable. L'annonce de ce cas
appartient à e25s03, et D-61 (e25s04) consigne le retrait.

## Ce qui n'est pas établi ici

Seules des exécutions scriptées sont conduites ici. La recette de `e25s01-verify.yaml` a tenu le
premier `/495 start` réel sans fichier de configuration, sous un fournisseur autre que `omlx`, mais
servi sur la machine. Aucun fournisseur distant n'a été joint : ce cas appartient à la recette de
e25s04.

## État final

`npm run build && npm run check` est vert à `bda51c7` avec 382 tests. L'assertion sur la politique
du noyau, que le type garantit déjà, est retirée, et le test des entrées Pi porte aussi le diagnostic
d'une clé `policy.egress` ignorée. Retirer l'émission de ce diagnostic fait échouer ce test en mode
texte. Le fournisseur admis dans les tests v2 n'est nommé nulle part dans 495, chaque forme
malformée de la clé est annoncée mot pour mot comme une liste, et un fichier illisible arrête tout
changement par un refus qui ne cite ni son texte ni son chemin.
