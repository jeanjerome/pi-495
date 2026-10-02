# La revue d'un candidat se lit dans le dossier, après intégration comme après retrait de sa copie

Story : e06s02
Epic : e06
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui rouvre la revue d'un changement intégré n'y voit plus ce que le candidat a
changé. La revue lit le côté référence dans le projet tel qu'il est au moment de la lecture, et le
côté candidat dans la copie de travail de la tentative. Après l'intégration, le projet porte le texte
du candidat : la page de changements d'un fichier modifié compare le candidat à lui-même et ne montre
aucune ligne changée, sous un statut `modified`. Et si la copie de travail n'est plus là, retirée à la
main ou par une purge à venir, le côté candidat rend `missing: workspace no longer available`.

C'est un défaut et non une préférence : les octets de chaque fichier changé sont déjà dans le
dossier, des deux côtés (`files_<candidate_id>` et `base_files_<candidate_id>`), et c'est sur eux que
la vérification recalcule les lignes introduites. La revue montre au propriétaire autre chose que ce
qui a été vérifié, et `UX-10` interdit une comparaison qui prétend à l'absence de changement.

## 2. Promesses

Scenario: Un changement intégré montre encore les lignes qu'il a changées
  Given un changement dont le candidat modifie `src/greet.js`, accepté puis intégré au projet
  When la page de changements de `src/greet.js` est lue
  Then elle porte les lignes retirées du texte de la référence et les lignes ajoutées du texte du candidat

Scenario: Un candidat se relit après le retrait de sa copie de travail
  Given un changement dont le candidat modifie `src/greet.js` et ajoute `src/extra.js`
  When la copie de travail de sa tentative est retirée, puis la revue ouverte
  Then la page de changements de `src/greet.js` porte ses lignes changées, et la page de contenu de `src/extra.js` côté candidat rend son texte

Scenario: Un fichier changé dont le dossier n'a pas les octets est dit manquant
  Given un candidat qui modifie `src/greet.js`, et un dossier où l'index `files_<candidate_id>` ne nomme pas ce chemin
  When la page de contenu de `src/greet.js` côté candidat est lue
  Then elle est `missing`, et sa note dit que le dossier n'a pas les octets de ce fichier

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données, ni
chemins protégés. La revue lit des octets que le dossier conserve déjà ; elle ne les expose à aucune
entrée qui ne les lisait pas.

## 4. Tâches

### Tâche 1 — Le côté candidat d'un fichier changé se lit dans le dossier

Pour une entrée du candidat de genre `file` dont l'état n'est pas `unchanged`, la revue lit les
octets nommés par `files_<candidate_id>` dans le magasin d'objets, et non plus la copie de travail. Un
chemin que l'index ne nomme pas rend `missing` avec une note qui le dit. Un fichier inchangé se lit
comme aujourd'hui.

- Vérifie : `node --test test/v2-kernel/review-sources.test.ts`
- Tient : `test/v2-kernel/review-sources.test.ts`, « après retrait de la copie de travail, la page de changements de src/greet.js porte ses lignes changées et la page de contenu de src/extra.js côté candidat rend son texte » et « une page de contenu côté candidat d'un fichier changé que files_ ne nomme pas est missing et sa note dit que le dossier n'a pas ses octets »
- Rouge : `readSide` lit le côté candidat dans `workspacePath(manifest.workspace_id)` ; la copie retirée, la lecture échoue et rend `missing` sans texte

### Tâche 2 — Le côté référence d'un fichier changé se lit dans le dossier

Pour une entrée de la référence que le candidat modifie, supprime ou renomme, la revue lit les octets
nommés par `base_files_<candidate_id>`, et non plus le projet.

- Vérifie : `node --test test/v2-kernel/review-sources.test.ts`
- Tient : `test/v2-kernel/review-sources.test.ts`, « après intégration, la page de changements de src/greet.js porte les lignes retirées du texte de la référence et les lignes ajoutées du texte du candidat »
- Rouge : `readSide` lit le côté référence dans `reference.project_path`, qui porte le texte du candidat après intégration ; la page de changements n'a aucun bloc

## 5. Hors périmètre

- Purger la copie de travail d'une tentative : la conservation reste locale jusqu'à un nettoyage
  explicite (`expression-besoins` § Rétention). La story rend la revue indépendante de cette copie ;
  l'agent de revue et l'intégration la lisent encore, pendant que le changement est en vol.
- Un fichier inchangé dont le projet a changé depuis la capture de la référence : ses deux côtés se
  lisent dans le projet, comme aujourd'hui, et montrent le texte actuel. Le dossier n'en garde pas les
  octets.
- Un fichier au-delà du budget de lecture : il n'a ni empreinte ni octets au dossier, et sa page reste
  `too_large`.
