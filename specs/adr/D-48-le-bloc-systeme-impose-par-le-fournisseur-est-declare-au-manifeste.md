# D-48: Le bloc système imposé par le fournisseur est déclaré au manifeste de contexte

**Status:** Acceptée
**Date:** 2026-09-21

**Décision.** Sur le chemin d'abonnement, le fournisseur écrit un premier bloc système — « You are
Claude Code, Anthropic's official CLI for Claude. » — au-dessus des instructions de 495, qui passent
en second. Le manifeste de contexte déclare ce bloc comme une contrainte **extérieure** à la
hiérarchie locale de confiance, plutôt que le profil soit refusé avec `capability_missing`.

**Motif.** Le manifeste `ctx_…` énonce ce qui a été mis devant le modèle. Une strate ajoutée à
l'insu du constructeur le rend faux, et un manifeste faux vaut moins qu'aucun manifeste : il fait
croire à une garantie qui n'existe pas. `CTX-02` porte déjà la clause selon laquelle les contraintes
imposées par un fournisseur doivent être reconnues comme extérieures à cette hiérarchie locale ;
elle n'avait jamais été éprouvée, faute de fournisseur qui en impose. La déclarer est donc le
premier exercice de la clause, et non une entorse. Refuser le profil garderait la garantie intacte
mais laisserait le modèle local seul témoin, ce que `D-46` cherche précisément à corriger.

**Conséquence.** `buildContext` connaît une strate qu'il ne compose pas, et le manifeste gagne la
capacité de nommer ce qu'il ne contrôle pas. C'est une garantie plus faible que « tout ce que le
modèle reçoit est composé ici » : l'écart est écrit ici plutôt que découvert plus tard par un
lecteur du dossier. Le fait est vérifié sur le Pi 0.86.1 installé, `dist/api/anthropic-messages.js`
lignes 818-826, et non supposé. La stabilité du bloc d'une version de fournisseur à l'autre n'est
pas établie : la mesurer, et décider ce qu'un changement de ce bloc doit produire, appartient à
`e23`.
