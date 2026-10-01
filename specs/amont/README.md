# Le texte normatif de 495

Ce que le produit doit être. Rédigé avant l'implémentation, versionné, modifié par révision
explicite. En cas de contradiction avec un autre document, **c'est ce répertoire qui fait foi**.

| Document | Objet |
| --- | --- |
| [expression-besoins.md](expression-besoins.md) | Exigences (BES, REQ, VER, DEC, PRE, ARC, QLT, PRG…), scénarios, gates, recettes. Porte les marqueurs de priorité. |
| [specification-fonctionnelle.md](specification-fonctionnelle.md) | Comportement attendu, règles `RM-*`, interactions humaines `IH-*`. |
| [conception-verification.md](conception-verification.md) | Comment le produit se vérifie : suites, contrôles, critères de couverture, revues obligatoires. |
| [conception-technique.md](conception-technique.md) | Architecture, composants, adaptateurs, ordre d'implémentation. |
| [references-externes.md](references-externes.md) | Registre des références étudiées, avec leur statut et ce que 495 en retient. |

Un contrôle de Preflight lit ces documents, et ne peut refuser une régression que parce qu'ils sont
tenus à la main : `scripts/check-architecture.ts` lit le catalogue de `conception-technique.md` §4.1.

## Où écrire quoi

| Nature de l'information | Destination |
| --- | --- |
| Une exigence nouvelle ou révisée | ce répertoire, par révision explicite |
| Un composant nouveau | une ligne au catalogue de `conception-technique.md` §4.1, dans le même changement |
| Un arbitrage d'implémentation | `specs/adr/` |
| Un travail à engager | `specs/plan.yaml` |
