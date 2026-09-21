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

L'isolation du rouge a été contrôlée à la main, et non par `verify-tdd-red-commit.sh` : ce script
fait `cd` vers son propre répertoire, qui est sous `/opt/homebrew`, lui-même dépôt git de Homebrew.
Son `PASS` portait sur un commit de Homebrew et ne disait rien de ce dépôt. Le contrôle réel, par
arbre de travail détaché sur le commit de test seul :

```
d443466 (test seul)      node --test test/v1/egress.test.ts  exit=1
7707b18 (implémentation) node --test test/v1/egress.test.ts  exit=0
```

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

## Limite relevée, fermée depuis

Une entrée de `config.json` qui nommait un fournisseur sans dire où il se situe produisait une
destination de situation indéfinie, et cette preuve concluait que valider ce champ seul serait un
traitement particulier que rien n'appuyait. La relecture croisée a conclu l'inverse : `readEgress`
refuse désormais la déclaration entière pour cette entrée, et `D-53` porte le motif. L'autre côté du même choix — un `location` invalide refuse
tout alors que ce champ n'autorise rien — a été porté au propriétaire et tranché dans le même sens :
le refus juge si le fichier peut être cru, pas ce que le champ autorise.
