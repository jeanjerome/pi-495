# D-03: Répertoire de données

**Status:** Acceptée

**Décision.** Le stockage normatif vit dans `$HARNESS495_DATA_DIR` si défini, sinon `~/.495` sur
toutes les plateformes. Les anciens emplacements par défaut (`~/Library/Application Support/495`,
`${XDG_DATA_HOME:-~/.local/share}/495`, `%LOCALAPPDATA%/495`) restent résolus en lecture pour qu'un
changement commencé avant le déplacement reste reprenable ; rien n'y est plus écrit.
**Motif.** La conception exige un stockage hors du projet cible et résolu par un adaptateur de
plateforme ; la variable d'environnement permet les tests et les installations partagées. Pi
n'offre pas d'emplacement pour l'état propre d'une extension : `~/.pi/agent/` est sa configuration,
qu'il sauvegarde et migre, et y déposer un ledger en ferait un mauvais voisin.
**Conséquence.** Le chemin n'est jamais transmis aux workers (AT-04). Le répertoire étant sans
espace, les workspaces redeviennent colocalisés (`~/.495/workspaces`) au lieu d'être déportés pour
échapper à un chemin espacé.
