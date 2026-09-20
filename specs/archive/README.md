# Documentation de 495

Trois natures de documents, séparées parce qu'elles n'ont ni la même autorité ni le même rythme.

## `amont/` — normatif

Ce que le produit doit être. Rédigé avant l'implémentation, versionné, modifié par révision
explicite. En cas de contradiction avec un document de suivi, **c'est l'amont qui fait foi**.

| Document | Objet |
| --- | --- |
| [amont/expression-besoins.md](amont/expression-besoins.md) | Exigences (BES, REQ, VER, DEC, PRE, ARC, QLT, PRG…), scénarios, gates, recettes. Porte les marqueurs de priorité. |
| [amont/specification-fonctionnelle.md](amont/specification-fonctionnelle.md) | Comportement attendu, règles `RM-*`, interactions humaines `IH-*`. |
| [amont/conception-verification.md](amont/conception-verification.md) | Comment le produit se vérifie : suites, contrôles, critères de couverture, revues obligatoires. |
| [amont/conception-technique.md](amont/conception-technique.md) | Architecture, composants, adaptateurs, ordre d'implémentation. |
| [amont/references-externes.md](amont/references-externes.md) | Registre des références étudiées, avec leur statut et ce que 495 en retient. |

## Suivi de l'implémentation

Ce qui a été construit, dans quel état, et prouvé par quoi. Vivant : actualisé à chaque livraison.

| Document | Objet |
| --- | --- |
| [PLAN.md](PLAN.md) | Découpage en incréments du socle et organisation des répertoires. |
| [MILESTONES.md](MILESTONES.md) | Jalons L0 à L3, leurs critères de sortie et ce qui reste pour les franchir. |
| [STATUS.md](STATUS.md) | État par incrément, ce qui est démontré, limites connues, ce qui n'est pas qualifié. |
| [TRACEABILITY.md](TRACEABILITY.md) | Matrice exigence → composants → preuves, y compris les exigences non couvertes. |
| [QUALIFICATION.md](QUALIFICATION.md) | Rapport d'exécution sur la machine de référence. |
| [DECISIONS.md](DECISIONS.md) | Décisions prises pendant l'implémentation, avec motif et conséquence. |
| [RISQUES-L0.md](RISQUES-L0.md) | Les dix risques de la conception technique §16 : pour chacun, la décision de traitement retenue et la preuve qui la soutient, ou le travail qui manque. |
| [revues/](revues/README.md) | Les six revues obligatoires de qualification : le dossier de chacune, et les constats de celles qui sont conduites. |
| [MODELE-LOCAL.md](MODELE-LOCAL.md) | Installation d'oMLX et configuration du modèle local des deux côtés, oMLX et Pi, avec les pièges qui rendent un modèle inchargeable. |
| [benchmarks/](benchmarks/README.md) | Vitesse du modèle sous la charge que le harnais envoie : protocole, table de comparaison et une fiche par mesure. |

`TRACEABILITY.md` est le pont entre les deux natures : elle relie chaque exigence amont au code et
aux preuves, et nomme celles qui ne sont pas couvertes.

## `chantiers/` — travaux ouverts

Ce qui reste à faire : un fichier par étage du contrôle de l'introduit, un fichier par travail
transverse, chacun avec un prompt autonome et un journal. [ROADMAP.md](ROADMAP.md) porte la
démonstration qui les justifie et l'ordre proposé ; [chantiers/README.md](chantiers/README.md)
porte l'état d'avancement et le critère de sortie.

## Où écrire quoi

| Nature de l'information | Destination |
| --- | --- |
| Une exigence nouvelle ou révisée | `amont/`, par révision explicite |
| Un constat sur ce que le code fait réellement | `STATUS.md` |
| Une exigence devenue couverte, ou révélée non couverte | `TRACEABILITY.md` |
| Un arbitrage d'implémentation | `DECISIONS.md` |
| Un travail à engager | `chantiers/`, et une ligne dans `ROADMAP.md` s'il change l'ordre |
| Une exécution de campagne | `QUALIFICATION.md` |
| Un constat de revue obligatoire, ou ce qui manque pour la conduire | `revues/`, dans le dossier de la revue concernée |
| Un critère de franchissement de jalon, ou ce qui l'empêche | `MILESTONES.md` |
| Le traitement d'un risque de la conception technique §16 | `RISQUES-L0.md` |
