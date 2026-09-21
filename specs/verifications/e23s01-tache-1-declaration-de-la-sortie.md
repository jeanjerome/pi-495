# e23s01 — tâche 1 : la politique porte les destinations déclarées

Conduite le 2026-09-21 sur `sortie-vers-le-fournisseur-declaree`.

## Commande de la tâche

```
$ node --test test/v1/egress.test.ts
ℹ tests 3   ℹ pass 3   ℹ fail 0
VERIFY_EXIT=0
```

Preflight complet (`npm run build && npm run check`) : sortie 0, `dist/` reconstruit depuis les
sources.

## Cycle rouge-vert

| Comportement | État à l'arrivée | Commits |
| --- | --- | --- |
| La déclaration par défaut ne porte que des destinations situées sur la machine | rouge — le champ n'existait pas | `d443466` test seul, puis `7707b18` |
| Une configuration qui nomme la politique sans nommer la liste garde la liste ; une configuration qui la nomme la remplace entièrement | **vert à l'arrivée** | test de caractérisation seul |

L'isolation du rouge a été contrôlée : `verify-tdd-red-commit.sh` rend `PASS: test-only commit
fails in isolation` sur `d443466`.

Le second comportement n'a demandé aucun code. L'étalement de `loadConfig` remplace une clé nommée
et garde une clé absente, ce qui est déjà la sémantique voulue pour une liste — au contraire de
`budgets` et `adoption`, qui portent une fusion imbriquée parce qu'un objet partiel y perdrait ses
clés sœurs. Le test fixe ce comportement au lieu de le laisser dépendre d'un détail d'écriture.

## Revue de sécurité — `security: medium`

Aucun constat nouveau sur les deux chemins touchés.

- `src/domain/policy.ts` — la liste est un champ de la politique active, configurée avant exécution
  et jamais modifiée par un producteur. Une intervention reçoit un mandat, jamais la politique.
- `src/extension/config.ts` — la liste ne se lit que depuis `config.json` du répertoire de données
  du contrôleur. Ce chemin est porté aux chemins refusés en lecture du profil de bac à sable
  (`src/extension/runtime.ts:63`), donc un producteur ne peut ni le lire ni l'écrire. Aucun fichier
  du projet cible n'élargit la liste.

## Limite relevée, non traitée

Une entrée de `config.json` qui nomme un fournisseur sans dire où il se situe produit une
destination dont la situation est indéfinie. Elle n'affaiblit pas le refus de la tâche 2, qui porte
sur l'identifiant du fournisseur, mais rend incomplet ce que le dossier dit de l'exposition.
`loadConfig` ne valide la forme d'aucun autre champ de la politique ; valider celui-ci seul serait
un traitement particulier que rien n'appuie aujourd'hui.
