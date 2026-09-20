# Transverse H — l'inventaire d'un arbre : sous-module, fichier spécial, et le workspace qui porte la revue

**État :** ouvert
**Objet :** deux cas que l'inventaire d'un arbre ne porte pas — un sous-module et un fichier spécial
— et un workspace dont la revue dépend sans que rien ne le réclame
**Ne dépend d'aucun étage**

## Motif

Deux candidats ont été produits sur des cibles de démonstration pour observer la surface de revue
dans un vrai terminal (`../QUALIFICATION.md`). Ce que le second porte — binaire à octets nuls,
exécutable, lien sortant, lien vers un répertoire, fichier au-delà du budget de lecture, nom et
contenu portant des séquences terminales — est rendu sans travestir le contenu : page `binary` sans
comparaison textuelle, page `symlink` avec sa cible, page `too_large` qui ne lit rien, et `neutralize`
appliqué à chaque ligne affichée. Trois choses ne tiennent pas.

**Un sous-module n'existe pas pour l'inventaire.** `ENTRY_KINDS` déclare `submodule`, et le modèle de
revue projette ce genre en `special`. Mais `walkTree` ne produit que `file`, `symlink` et `special` :
le genre est déclaré au contrat et inatteignable. Un sous-module est donc inventorié comme un
répertoire ordinaire, et son fichier `.git` — que le marcheur n'écarte qu'à la racine de l'arbre — est
lu comme du contenu de projet. La page de contenu rend `gitdir: ../../.git/modules/vendor/sub-lib`.
Deux conséquences : la frontière du sous-module est invisible au dossier, et de la plomberie Git est
présentée au lecteur comme du code du projet. `UX-10` demande explicitement l'inverse.

**Un fichier spécial est inventorié puis perdu.** `walkTree` le porte en `special`, avec la note
« special file: not read ». `createWorkspace` ne recopie que les fichiers et les liens : le tube, le
socket ou le périphérique n'existe pas dans la copie. `snapshotCandidate` compare donc un arbre qui le
porte à un arbre qui ne le porte pas, et rend `deleted special pipe.fifo` en plaçant le chemin dans
`selected_paths`. Le candidat déclare une suppression que personne n'a faite, et son empreinte en
dépend. Mesuré sur un arbre d'essai portant un tube nommé.

**Le workspace du candidat porte la revue, et rien ne le réclame.** Les workspaces de clarification,
de préparation, de revue et de témoins sont fermés avec `retention: "delete"` dans un `finally`. Celui
de chaque tentative ne l'est par aucun chemin : il survit à la clôture. Ce n'est pas qu'une dette —
`openReview` pointe le côté candidat sur ce répertoire, et `readSide` rend
`missing: workspace no longer available` s'il manque. Une politique de purge écrite sans le savoir
rendrait irrelisible tout changement clos. Mesuré : 116 Ko par tentative sur une cible de
démonstration, 151 Mo sur la cible Maven.

## Une alternative examinée et écartée : le worktree Git

`pi-dynamic-workflows` (`github.com/QuintinShaw/pi-dynamic-workflows`, `src/worktree.ts`) isole
chaque agent par `git worktree add -b pi/wf/<id> <repoRoot>/.pi/worktrees/<id> HEAD`, retourne un
objet portant `isolated: false` et un `reason` quand l'isolation échoue, et refuse de supprimer la
branche quand le retrait du worktree a échoué.

Deux raisons l'écartent ici, et elles tiennent aux propriétés que 495 revendique. Un worktree s'écrit
**dans le dépôt de la cible** — `<repoRoot>/.pi/worktrees/` —, alors que le projet de l'utilisateur
n'est jamais écrit. Et un worktree ne porte que ce que Git suit : sur la cible Maven, le cache
`.m2/repository` — 2 991 entrées, ce qui rend les contrôles exécutables réseau coupé — n'y serait
pas. La copie intégrale coûte 151 Mo par workspace ; c'est ce prix qui achète l'offline et la
non-écriture de la cible.

Ce qui reste bon à prendre : une isolation qui échoue rend une raison au lieu de se dégrader en
silence — 495 le fait déjà pour le bac à sable — et un retrait qui échoue n'autorise pas la
destruction de ce qu'il protégeait.

## Prompt

```
Dans ~/Projets/495-pi-package, lis la sous-section « Un second candidat : les cas particuliers
d'un arbre » de specs/archive/QUALIFICATION.md, puis walkTree et createWorkspace dans
src/adapters/workspace/, ENTRY_KINDS dans src/contracts/v1/candidate.ts, et openReview dans
src/application/harness.ts.

Trois travaux, indépendants.

1. Le sous-module. Décide, et écris-le : soit l'inventaire produit le genre `submodule` à la
   frontière — répertoire portant un `.git`, avec le commit pointé comme contenu observable —,
   soit le genre disparaît du contrat et la limite est annoncée. Dans les deux cas, un fichier
   `.git` de sous-module ne doit pas être présenté comme du contenu de projet. Toucher au
   contrat impose `npm run contracts` et change environment_digest.

2. Le fichier spécial. Un candidat ne doit pas déclarer une suppression que personne n'a faite.
   Décide où la vérité se rétablit — la copie qui recrée ce qu'elle sait recréer, ou la
   comparaison qui ignore ce que la copie ne peut pas porter — et écris le test qui montre
   qu'un arbre portant un tube nommé produit un candidat sans suppression fantôme.

3. Le workspace du candidat. Sa rétention est aujourd'hui implicite et porteuse : dis-la.
   Soit la revue cesse d'en dépendre — les octets du candidat sont déjà au CAS, artefact
   `files_<candidate_id>` —, soit la rétention devient une décision écrite avec sa purge et sa
   comptabilité. Tant que la revue lit le workspace, aucune purge ne peut l'emporter.

Critères d'acceptation :
- un test déterministe couvre le genre retenu pour un sous-module, et l'absence de plomberie
  Git dans le contenu présenté ;
- un test montre qu'un arbre portant un fichier spécial produit un candidat sans suppression
  fantôme ;
- la source lue par la revue pour le côté candidat est décidée par écrit, et un test montre
  qu'un changement clos reste relisible après retrait du workspace ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Genres d'entrée déclarés | `src/contracts/v1/candidate.ts`, `ENTRY_KINDS` |
| Inventaire d'un arbre | `src/adapters/workspace/walk.ts`, `walkTree` |
| Copie de référence | `src/adapters/workspace/git-workspace.ts`, `createWorkspace` |
| Comparaison candidat / référence | `src/adapters/workspace/git-workspace.ts`, `snapshotCandidate` |
| Côté candidat de la revue | `src/application/harness.ts`, `openReview` ; `src/application/review.ts`, `readSide` |
| Octets du candidat déjà conservés | artefacts `files_<candidate_id>` et `base_files_<candidate_id>` |
| Constats d'origine | `specs/archive/revues/R4-ux-accessibilite.md`, `specs/archive/revues/R6-exploitation.md` |

## Journal

**17 septembre 2026.** Ouverture. Les trois constats viennent de la préparation de deux candidats de
démonstration, conduits de la demande à l'acceptation en 2 s chacun avec un agent scripté, dont le
second porte huit cas particuliers. Six d'entre eux sont rendus correctement ; les deux qui ne le sont
pas — sous-module et fichier spécial — sont enregistrés comme constats `R4-C10`, et la rétention du
workspace comme constat `R6-C04`.
