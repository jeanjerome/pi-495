# Un fichier spécial et un sous-module sont inventoriés tels qu'ils sont

Story : e06s01
Epic : e06
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire qui relit le candidat d'un projet portant un tube nommé y lit aujourd'hui une
suppression que personne n'a faite. Mesuré sur la révision `272ba64`, sur un dépôt propre portant
`pipe.fifo` : la référence l'inventorie en `special`, la copie de travail ne le recrée pas, et le
candidat rend `deleted special pipe.fifo`, le place dans `selected_paths` et en tire son empreinte. Un
candidat que l'agent n'a pas touché se présente donc comme un changement, et l'intégration d'un tel
candidat supprimerait le tube du projet.

Le même propriétaire, sur un projet portant un sous-module, ne voit pas la frontière du sous-module
et lit de la plomberie Git comme du code du projet : la référence inventorie `vendor/sub-lib/.git`
en `file`, dont le contenu est `gitdir: ../../.git/modules/vendor/sub-lib`, et le genre `submodule`
que le contrat déclare n'est jamais produit. La conception technique (§9.1) dit l'inverse : le `.git`
ne fait pas partie du contenu applicatif, et les sous-modules et fichiers spéciaux sont inventoriés
explicitement (`UX-10`).

Les fichiers d'un sous-module appartiennent à un autre dépôt : celui du projet n'en retient que le
commit pointé, et un commit du projet ne peut pas les porter. 495 les traite pourtant en contenu du
projet. L'agent peut en modifier un, les contrôles passent sur ce texte, et l'intégration ne peut pas
le livrer : `git add` refuse le chemin (`fatal: Pathspec 'vendor/sub-lib/lib.txt' is in submodule
'vendor/sub-lib'`, mesuré sur un dépôt d'essai), après que le fichier a été recopié dans le projet.
Le changement est vérifié sur du code qu'il ne livre pas.

## 2. Promesses

Scenario: Un fichier spécial que l'agent n'a pas touché n'est pas une suppression
  Given un projet dont la référence porte un tube nommé `pipe.fifo`
  When le candidat d'une copie de travail où l'agent n'a rien fait est observé
  Then l'entrée `pipe.fifo` du candidat est `special` et `unchanged`, et `selected_paths` est vide

Scenario: La plomberie Git d'un sous-module n'est pas du contenu du projet
  Given un projet portant un sous-module `vendor/sub-lib`, dont le `.git` est un fichier qui pointe dans le dépôt parent
  When la référence est capturée et sa copie de travail créée
  Then aucune entrée de la référence n'est sous `vendor/sub-lib/.git`, et la copie de travail ne porte pas `vendor/sub-lib/.git`

Scenario: Un dépôt imbriqué ne fait pas entrer son répertoire Git dans l'inventaire
  Given un projet portant un répertoire `nested/` qui est lui-même un dépôt Git, avec son répertoire `.git`
  When la référence est capturée
  Then aucune entrée de la référence n'est sous `nested/.git`

Scenario: La frontière d'un sous-module est inventoriée avec son commit
  Given un projet portant un sous-module `vendor/sub-lib` extrait à un commit
  When la référence est capturée
  Then elle porte une entrée `submodule` au chemin `vendor/sub-lib` qui nomme ce commit, et les fichiers du sous-module restent inventoriés comme fichiers

Scenario: Un candidat qui touche un sous-module est refusé avant la vérification
  Given un projet portant un sous-module `vendor/sub-lib`
  When l'agent modifie, ajoute ou supprime un fichier sous `vendor/sub-lib/` dans la copie de travail, puis le candidat est jugé
  Then G4 échoue avec une raison qui nomme le chemin touché et le sous-module `vendor/sub-lib`, aucune vérification du candidat n'est lancée, et le projet n'est pas modifié

Scenario: Un candidat qui laisse le sous-module intact passe G4
  Given un projet portant un sous-module `vendor/sub-lib`
  When l'agent modifie seulement `a.txt` à la racine, puis le candidat est jugé
  Then l'entrée `submodule` de `vendor/sub-lib` est `unchanged` dans le candidat, et aucune raison de G4 ne nomme le sous-module

Scenario: La revue présente un sous-module comme tel
  Given le candidat d'un projet portant un sous-module `vendor/sub-lib`
  When la page de contenu de `vendor/sub-lib` est lue côté candidat
  Then elle ne simule pas de texte, ses métadonnées disent le genre `submodule` et nomment le commit

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données, ni
chemins protégés. Elle retire de l'inventaire et de la copie de travail des fichiers de plomberie Git,
elle n'en ajoute aucun.

## 4. Tâches

### Tâche 1 — Le candidat ne déclare pas la suppression d'un fichier que la copie ne peut pas porter

La copie de travail ne recrée ni tube, ni socket, ni périphérique. L'observation du candidat porte
inchangée une entrée `special` de la référence dont le chemin est absent de la copie de travail ; un
chemin que l'agent a occupé par autre chose reste un changement de genre.

- Vérifie : `node --test test/v2-kernel/tree-special-cases.test.ts`
- Tient : `test/v2-kernel/tree-special-cases.test.ts`, « un projet portant un tube nommé donne, sans action de l'agent, un candidat dont l'entrée pipe.fifo est special et unchanged et dont selected_paths est vide »
- Rouge : `snapshotCandidate` compare la référence à une copie qui ne porte pas le tube, et `diffEntries` rend `deleted special pipe.fifo`, placé dans `selected_paths`

### Tâche 2 — Aucun `.git` sous la racine n'est inventorié ni recopié

L'inventaire écarte une entrée nommée `.git` à toute profondeur, fichier ou répertoire, et non plus
seulement à la racine ; la copie de travail, qui recopie l'inventaire, ne la porte donc plus.

- Vérifie : `node --test test/v2-kernel/tree-special-cases.test.ts`
- Tient : `test/v2-kernel/tree-special-cases.test.ts`, « la référence d'un projet portant un sous-module n'a aucune entrée sous vendor/sub-lib/.git et sa copie de travail ne porte pas vendor/sub-lib/.git » et « la référence d'un projet portant un dépôt imbriqué n'a aucune entrée sous nested/.git »
- Rouge : `walkTree` n'écarte que `.git` à la racine ; il inventorie `vendor/sub-lib/.git` en `file` et descend dans `nested/.git`

### Tâche 3 — La frontière d'un sous-module est une entrée `submodule` qui nomme son commit

Un répertoire sous la racine qui porte un `.git` est inventorié une fois en `submodule`, à son
chemin, avec le commit qu'il a extrait, sans changer le contrat ; ses fichiers restent inventoriés
comme aujourd'hui. Le candidat porte inchangée la frontière de la référence tant que son répertoire
existe dans la copie de travail. La revue rend la page de cette entrée sans texte, avec le genre et le
commit dans ses métadonnées.

- Vérifie : `node --test test/v2-kernel/tree-special-cases.test.ts`
- Tient : `test/v2-kernel/tree-special-cases.test.ts`, « la référence d'un projet portant un sous-module a une entrée submodule à vendor/sub-lib qui nomme le commit extrait, et vendor/sub-lib/lib.txt reste un fichier », « un candidat qui ne modifie que a.txt garde l'entrée submodule de vendor/sub-lib unchanged » et « la page de contenu de vendor/sub-lib côté candidat n'a pas de texte et ses métadonnées disent submodule et le commit »
- Rouge : `walkTree` ne produit jamais le genre `submodule` : `vendor/sub-lib` n'a pas d'entrée, seuls ses fichiers en ont

### Tâche 4 — G4 refuse un candidat qui touche un sous-module

Un chemin que le candidat change sous un sous-module de la référence, fichier modifié, ajouté ou
supprimé, ou la frontière elle-même, fait échouer G4 avec une raison qui nomme le chemin et le
sous-module. Le changement suit la voie d'un G4 en échec, correction ou rejet, comme pour un chemin
protégé ; le candidat n'est ni vérifié ni intégré.

- Vérifie : `node --test test/v2-kernel/tree-special-cases.test.ts`
- Tient : `test/v2-kernel/tree-special-cases.test.ts`, « un candidat qui modifie vendor/sub-lib/lib.txt échoue à G4 avec une raison qui nomme ce chemin et le sous-module vendor/sub-lib, aucune vérification n'est lancée et le projet est inchangé », et de même pour un fichier ajouté sous vendor/sub-lib/ et pour vendor/sub-lib/lib.txt supprimé, « un candidat qui ne modifie que a.txt passe G4 sans raison qui nomme le sous-module »
- Rouge : `evaluateG4` ne juge que la complétude, les chemins protégés et le périmètre du mandat ; un candidat qui modifie `vendor/sub-lib/lib.txt` passe G4 et part en vérification

## 5. Hors périmètre

- Recréer un tube nommé dans la copie de travail : Node n'a pas d'appel pour le faire, et un socket ou
  un périphérique ne se recrée pas ; un contrôle qui aurait besoin du tube ne le trouve pas, comme
  aujourd'hui.
- Livrer une modification d'un sous-module, en commitant dans son dépôt puis en déplaçant le commit
  que le projet pointe : 495 n'écrit que dans le dépôt du projet. Un changement qui doit corriger la
  bibliothèque se fait dans le dépôt de celle-ci.
- Empêcher l'agent d'écrire sous un sous-module dans sa copie de travail, ou l'en prévenir avant
  qu'il produise : les fichiers y restent recopiés pour que les contrôles compilent et testent, et
  l'agent apprend la règle par le refus de G4.
- Lire le sous-module depuis la copie de travail : la copie ne porte pas son `.git`, donc ni son
  historique ni `git` dans ce répertoire.
- Les deux côtés de la revue lus depuis le dossier plutôt que depuis le projet et la copie de
  travail : e06s02.
