# D-43: Le formateur est adopté à 120 colonnes, et l'ordre des imports n'est pas trié

**Status:** Acceptée

**Décision.** Le formateur de Biome est activé à `lineWidth: 120`, et `npm run lint:code` passe de
`biome lint` à `biome check`, qui vérifie le lint et la mise en forme du même appel. L'action
`assist/source/organizeImports` est désactivée. 123 fichiers sont reformatés en une passe.

**Motif.** D-42 différait le formateur sans savoir ce qu'il coûterait. La mesure à six largeurs le
dit : 131 fichiers et 26 110 lignes ajoutées à 80 colonnes, encore 100 fichiers à 320. Il n'existe
pas de largeur neutre. Au-delà de 200, le formateur ne laisse pas les lignes denses en place : il
recolle sur une seule ligne les signatures que le code répartissait sur six, `resolveWorkspacesDir`
la première. 120 est retenue parce que deux raisons y concordent — c'est la largeur sur laquelle
s'accordent les guides de style courants, et c'est le neuvième décile de l'arbre tel qu'il était
(p90 = 119), donc neuf lignes sur dix passaient déjà et seule la dernière décile est retouchée.

**Conséquence.** Preflight refuse désormais un fichier non formaté comme il refuse un constat de
lint. Le tri des imports reste écarté : l'arbre les groupe par couche d'architecture, ce qui donne à
lire la direction de dépendance que `check-layers.ts` impose, et un tri alphabétique disperserait ce
groupement sans rien établir. Le reformatage n'a perdu aucun commentaire — les deux lignes que le
diff montre supprimées dans `test/v2/harness.test.ts` sont ré-indentées, leur texte intact.
