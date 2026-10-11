# e38 — protocole de mesure du processus renforcé

Ce dossier fixe, avant toute campagne, ce que le bilan d’e38 mesure et comment il le lit. Les
mesures sont celles que `npm run cycle -- mesures <profil>=<story>...` lit dans le dossier de chaque story
(`specs/verifications/<story>/journal.jsonl`, ou `~/.495/cycle/<story>/` tant qu’elle court) et dans
sa branche, gardée après le versement. Rien n’y est saisi à la main : un chiffre que le dossier ne
porte pas reste absent (`null`), il ne devient pas zéro.

## Les trois profils mesurés

| Profil | Ce qu’il exerce | Moyen formel |
|---|---|---|
| story simple | une promesse tenue par des exemples | aucun |
| story à états | une interaction de plusieurs états, explorée avant le code | TLA+ (TLC) |
| refactoring | un comportement constant, sans promesse à relire (`D-80`) | aucun |

Le bilan Lean d’e38s11 reste à part : son coût de mise en place ne se fond pas dans la moyenne
d’un profil.

Le profil à états se nomme `tla` et se lit dans le compagnon de la story, pas dans l’étiquette :
`cycle mesures` refuse le bilan, en nommant la story, quand une story donnée en `tla=<story>` a un
compagnon qui ne retient pas `modele-d-etats` avec un manifeste, et n’écrit alors aucune
recommandation.

## Les mesures, fixées avant campagne

| Mesure | Lecture |
|---|---|
| `duree_totale_ms` | du premier événement du journal au versement ; absente pour une story non versée |
| `duree_par_pas_ms` | le détail par pas, attentes du propriétaire comprises |
| `mediane_duree_ms` | la médiane des durées des stories versées de la série mesurée |
| `cout_usd` | la somme des coûts que les sessions ont rapportés ; absente si aucune n’en rapporte |
| `interventions` | les fois où la story a attendu le propriétaire ; une attente que l’outil tranche à sa place (arbitrage, relecture rouverte) n’en est pas une |
| `arbitrages_automate` | les accords qu’une session indépendante a donnés à sa place |
| `tours_de_relecture`, `constats_de_relecture` | les défauts découverts en relecture |
| `ecarts_de_recette` | les défauts découverts en recette, chacun renvoyant au rouge-vert |
| `incidents` | les pas bloqués et les sessions sans sortie |
| `revisions_de_tests` | les commits d’après le rouge-vert qui retirent ou réécrivent des lignes d’un test |
| `reprises_de_code` | les commits d’après le rouge-vert qui changent du code |

Une révision de test et une reprise de code ne se confondent pas : la première change ce que la
story prouve, la seconde la façon dont le code tient sa promesse. Un test ajouté pour un écart, même
dans un fichier existant, n’est pas une révision. La taille et le périmètre d’un changement se lisent sur sa branche
(`git diff --stat <base>..<branche>`), cités à côté des mesures.

## Ce que la comparaison vaut

Les dossiers des stories versées avant e38 servent de contexte, pas de témoin : leur story, leur
taille et le modèle qui les a écrites diffèrent, et un journal ancien ne porte pas toujours le coût
de ses sessions. Trois stories ne fondent aucune généralisation statistique. Une campagne n’est
répétée que si la variabilité empêche de décider.

## Ce que le bilan peut recommander

Le profil `simple` sert de référence. Pour chaque autre profil, `cycle mesures` compare ses médianes de durée et
de coût à celles du profil simple, et ses écarts de recette par story : plus coûteux sans moins de défauts
tardifs, il est réservé aux stories dont le risque le justifie ; plus coûteux avec moins de défauts tardifs, il
est gardé là où ce risque existe ; pas plus coûteux, rien ne s’oppose à l’étendre. Chaque recommandation redit
les obligations du chemin du profil, et n’en retire aucune.

Le bilan recommande par profil : généraliser, réserver un moyen aux risques qui le justifient, ou
corriger un blocage. Un moyen plus coûteux sans gain mesuré sur une story simple se réserve aux
stories dont le risque le justifie ; aucune obligation — test rejoué au rouge, relecture, recette,
Preflight — n’est retirée pour obtenir un meilleur temps.
