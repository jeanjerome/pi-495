# D-81: La surface de revue s'assemble des composants de pi-tui, et presentation/ n'importe que pi-tui

**Status:** Acceptée ; lève la réserve de `D-35` sur ce qui restait hors de la vue
**Date:** 2026-10-06

## Contexte

`D-35` a fait entrer la mesure de largeur de `pi-tui` dans la surface de revue et laissé hors de la vue
le reste de ce que Pi publie — listes, défilement, partage en panneaux, aide clavier — tant qu'il
n'était pas écrit ce que la règle de couches protège. La question posée était : est-ce le modèle de
revue ou la pureté de la surface qui garantit que la même revue se lit en TUI, en RPC, en JSON, en
print et depuis un hôte SDK (`UX-11`) ?

Le code a répondu sans que la réponse soit écrite. Le 2026-09-22, la règle `presentation` de
`scripts/check-layers.ts` a cessé de refuser les paquets Pi, et `measure.ts` et `keymap.ts` importent
depuis `pi-tui`. Mais la règle n'interdit plus rien : `presentation/` peut importer
`pi-coding-agent` et `pi-ai`, l'API de l'agent comprise, alors que son commentaire n'admet que la
bibliothèque d'affichage ; et `AGENTS.md` interdit toujours tout paquet Pi à `presentation/`. Trois
textes, trois règles.

Le corpus normatif avait déjà tranché : `expression-besoins.md` §10 dit que la surface s'assemble à
partir de `pi-tui`, et `conception-technique.md` en nomme les composants (`HStack`, `ScrollView`,
`SelectList`, `KeybindingsManager`, `MouseRegion`, `fuzzyFilter`). La documentation de Pi 1.0.4
(`docs/tui.md`) dit la même chose du côté de l'hôte : préférer ces composants à une sélection, un
défilement ou une mesure refaits, et lire les touches dans le `KeybindingsManager` injecté.

La crainte qui retenait la conversion — une surface faite de composants Pi ne s'éprouverait plus
qu'avec un harnais TUI — ne tient pas : un composant `pi-tui` rend un tableau de lignes pour une
largeur donnée et reçoit les touches par `handleInput`, sans terminal ni session. Les tests de
`v0-pure/review-surface` gardent leur forme.

## Décision

1. **Ce qui garantit `UX-11` est le modèle de revue**, `application/review.ts` et sa projection
   textuelle `presentation/structured/review-text.ts`, que toutes les entrées partagent. La surface
   TUI n'en est qu'un rendu.
2. **La surface de revue s'assemble des composants que `pi-tui` publie** pour la disposition, le
   défilement, la sélection, le clavier et la mesure, plutôt que de les refaire.
3. **`presentation/` n'importe que `pi-tui`**, la bibliothèque d'affichage. `pi-coding-agent` et
   `pi-ai` y restent interdits : ce que la surface tient de l'application Pi — le thème, les
   raccourcis réglés par l'utilisateur, le dessin d'une comparaison — entre par injection depuis
   `extension/`, comme la mesure de `D-35`.

## Conséquences

`scripts/check-layers.ts` refuse dans `presentation/` tout paquet `@earendil-works` autre que
`pi-tui`, et `AGENTS.md` dit la même règle.

La surface reste éprouvée sans Pi en marche : les tests rendent les composants à une largeur et leur
envoient des touches. Un composant qui ne rendrait rien hors de la mise en page d'un vrai TUI devra
le montrer par un test avant d'être adopté, et la story qui le rencontre dit ce qui le remplace.

Les stories de `e08` convertissent la surface ; aucune ne touche au modèle de revue.
