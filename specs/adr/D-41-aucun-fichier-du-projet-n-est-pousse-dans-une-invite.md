# D-41: Aucun fichier du projet n'est poussé dans une invite

**Status:** Acceptée

**Décision.** Le harnais ne choisit plus les fichiers que le modèle lit. La sélection qui classait
les chemins de l'arbre sur le vocabulaire de la demande est retirée. `ContextManifest.untrusted_excerpts`
reste au contrat et au manifeste — une donnée non autoritative doit être étiquetée d'où qu'elle
vienne (CTX-05) — mais rien dans le harnais ne le remplit. Les rôles qui recevaient ces extraits
disposent de `read`, `ls`, `find` et `grep`.

**Motif.** Le classement valait « nombre de mots de la demande présents dans le chemin, moins la
profondeur divisée par cent ». Quand le vocabulaire ne rencontre pas les chemins — une demande
française sur un arbre anglais —, tout vaut zéro et c'est la profondeur qui décide : les fichiers
les moins profonds, par ordre alphabétique. Mesuré sur un arbre de 222 fichiers, pour une demande
portant sur la rétention des workspaces : six scripts de lint et de banc, quatre manifestes, et
aucun fichier du module concerné. Le prix de cette sélection est de douze extraits de 4 000 octets,
soit jusqu'à 48 Ko et de l'ordre de 12 000 jetons, quand l'invite médiane d'une intervention réelle
en compte 32 878 — plus d'un tiers de ce que le modèle lit, dépensé sur des fichiers qui ne portent
pas le code à changer, et une quarantaine de secondes de préremplissage à froid à 288 jetons/s.

**Conséquence.** Un modèle s'oriente désormais seul. Sur une cible Maven, le workspace porte
`.m2/repository` — 2 991 entrées, nécessaires pour exécuter les contrôles réseau coupé —, donc un
`find` non ciblé y rend des milliers de chemins : c'est le risque assumé de ce choix, et il n'est pas
mesuré. `scripts/bench-model.ts` n'envoie plus d'extraits, ce qui l'aligne sur le produit ; les trois
mesures du 18 septembre 2026 ont été prises avec une invite plus lourde et leur chiffre de
préremplissage n'est pas comparable à ceux qui suivront. Le scénario `agentic` du banc, qui ajoute un
fichier lu par tour, décrit désormais le régime réel mieux qu'avant. D-40 reste vrai : le texte exact
remis au modèle est enregistré, il est seulement plus court.
