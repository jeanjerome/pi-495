# Un fichier spécial ne rend pas incomplète l'observation d'un candidat

Story : e06s03
Epic : e06
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire dont le projet porte un tube nommé, un socket ou un périphérique ne peut aujourd'hui
mener aucun changement au-delà de G4. L'inventaire porte le fichier spécial avec une limite marquée
tronquée et la note « special file: not read » ; cette limite d'entrée rend incomplète l'observation
de la référence, donc celle de tout candidat, sans y ajouter de note. G4 refuse alors chaque candidat
avec `candidate observation incomplete: unknown limit`, sur `main` avant comme après e06s01 : la
recette de e06s01 l'a observé sur un projet portant `pipe.fifo`. Le candidat ne déclare plus de
suppression fantôme, mais il ne passe toujours pas, et la raison ne nomme ni le fichier ni la cause.

C'est un défaut et non une préférence : un fichier spécial n'a pas de contenu que l'inventaire
aurait laissé de côté. Son genre, son mode et son état sont observés en entier, et la revue le
présente déjà comme `special`, sans texte ni comparaison (`UX-10`). Une observation incomplète doit
désigner ce qui n'a pas été lu ; ici rien ne l'a été parce qu'il n'y avait rien à lire.

## 2. Promesses

Scenario: Un projet portant un tube nommé passe G4
  Given un projet dont la référence porte un tube nommé `pipe.fifo`
  When l'agent modifie seulement `a.txt`, puis le candidat est jugé
  Then G4 passe, aucune raison ne dit l'observation incomplète, et le changement part en vérification

Scenario: La revue d'un projet portant un tube nommé est complète et présente le tube comme spécial
  Given le candidat d'un projet dont la référence porte un tube nommé `pipe.fifo`
  When la revue est ouverte
  Then elle ne se dit pas incomplète, `pipe.fifo` y a le statut `special`, et sa page de contenu n'a pas de texte et ses métadonnées disent le genre `special`

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données, ni
chemins protégés. Le fichier spécial n'est toujours ni lu, ni recopié, ni ouvert.

## 4. Tâches

### Tâche 1 — L'entrée d'un fichier spécial ne porte plus de limite tronquée

L'inventaire porte un fichier spécial avec sa note « special file: not read », sans le marquer
tronqué : rien n'en a été omis. Un fichier au-delà de la limite de taille reste tronqué et rend
l'observation incomplète, avec sa note, comme aujourd'hui.

- Vérifie : `node --test test/v2-kernel/special-file-completeness.test.ts`
- Tient : `test/v2-kernel/special-file-completeness.test.ts`, « un projet portant un tube nommé, dont l'agent ne modifie que a.txt, passe G4 sans raison qui dise l'observation incomplète » et « la revue du candidat d'un projet portant un tube nommé ne se dit pas incomplète, et la page de pipe.fifo n'a pas de texte et ses métadonnées disent special »
- Rouge : `walkTree` porte le tube avec `limits.truncated: true` ; `includedLimits` en fait une limite de l'observation sans note, et G4 rend `candidate observation incomplete: unknown limit`

## 5. Hors périmètre

- Un fichier au-delà de la limite de taille : il reste une observation incomplète qui arrête G4 et
  nomme le fichier, comme aujourd'hui (`test/v2-kernel/workspace.test.ts`, « a file above the size
  limit is reported as a limit, not silently skipped »).
- Recréer le fichier spécial dans la copie de travail : un contrôle qui en aurait besoin ne le trouve
  pas, comme après e06s01.
- La raison « unknown limit » elle-même : la story retire le seul chemin connu qui la produit ; une
  limite d'entrée sans note qui apparaîtrait ailleurs la produirait encore.
