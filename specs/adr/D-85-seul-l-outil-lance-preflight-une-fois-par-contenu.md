# D-85: Seul l'outil du cycle lance Preflight, une fois par contenu, et les tests tournent en parallèle

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-07)
**Date:** 2026-10-07

## Contexte

Une story lançait Preflight de six à huit fois, à huit minutes chacune : la session de chaque pas la
lançait avant de rendre sa sortie, puis l'outil la relançait sans croire la session, et le début d'un pas
la relançait sur la tête que la fin du pas précédent venait de vérifier. Sur e32s01, 32 minutes de
Preflight par l'outil, plus celles des sessions, pour 87 minutes de cycle. Les tests tournaient un fichier
à la fois depuis la création du dépôt, sans raison écrite ; lancée en parallèle le 2026-10-07, la suite
entière passe en 100 secondes au lieu de huit minutes, deux fois de suite, sans un échec.

## Décision

1. **Dans une session que l'outil lance, la session ne lance pas Preflight.** Elle lance ce que son
   changement touche : les tests concernés, le contrôle de types, le lint.
2. **L'outil lance Preflight à la fin de chaque pas, et une seule fois par contenu.** Le contenu est ce
   que Preflight lit — le code, les manifestes du paquet, le README, NOTICE et LICENSE, le corpus normatif,
   les stories — sous une version de Node. Un commit qui ne touche rien de cela (une décision, le plan, le
   registre, un dossier de recette), un versement écrasé qui garde le même contenu, ou le début d'un pas
   sur la tête vérifiée à la fin du précédent ne la relancent pas. Les contenus verts sont gardés à côté
   des journaux des stories, d'une story à la suivante.
3. **Une Preflight rouge après une session part à une session de correction**, avec les échecs que
   l'outil a lus, au plus deux fois, avant que le pas ne bloque. Là où aucune session n'a écrit la tête — la
   base d'une story, le versement, une reprise — elle bloque aussitôt.
4. **Les tests tournent en parallèle**, un processus par fichier.

## Conséquences

Une Preflight rouge que la session aurait vue se voit maintenant à la fin du pas, par l'outil, et coûte une
session de correction au lieu d'un blocage. Un test qui partagerait un état avec un autre se verrait en
parallèle par un échec instable : il se corrige pour posséder son état, il ne repasse pas en série.
