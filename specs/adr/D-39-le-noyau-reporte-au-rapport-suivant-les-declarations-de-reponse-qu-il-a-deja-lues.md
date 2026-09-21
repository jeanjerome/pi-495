# D-39: Le noyau reporte au rapport suivant les déclarations de réponse qu'il a déjà lues

**Status:** Acceptée

**Décision.** Une déclaration de réponse portée par un rapport de spécification antérieur du même
changement est reportée par le noyau sur le rapport suivant, tant que celui-ci porte encore les
exigences qu'elle nomme, dont une obligatoire au moins. Le rapport le plus récent l'emporte sur les
précédents, et ce que le rapport courant déclare lui-même l'emporte sur tout. La demande le dit
réponse par réponse — « already declared, carried by R1 » ou « to declare in `answers` » — et
l'instruction du rôle `specify` n'exige plus qu'il déclare que ce qui n'est pas déjà porté.

Ce que le noyau reporte est une liaison, pas un reçu : la déclaration héritée tombe dès que le
rapport cesse de porter l'exigence qui la tenait, la réponse redevient non déclarée, et `G1` la
refuse en la nommant comme avant. Les exigences, elles, ne sont pas reportées : elles sont la
substance du rapport, et un rapport qui en abandonne une fait une déclaration qu'il faut pouvoir
lire.

**Motif.** Le mécanisme de `D-37` oblige chaque rapport à rendre compte de toute réponse déjà
enregistrée, donc à redéclarer à chaque tour l'histoire entière des décisions prises. Sur
`java-flashnext-L`, le rapport grossit à chaque réouverture et le cinquième atteint le double des
précédents avant d'être refusé sur sa sortie. Or le noyau a enregistré ces réponses et lu ces
déclarations : il les détient déjà, et rien ne justifie de les faire redire à un modèle qui les paie
en jetons et en minutes.

**Conséquence.** L'allègement porte sur le bloc `answers`, qui croissait avec le nombre de réponses,
et non sur le corps du rapport : la croissance d'un rapport de réouverture est réduite, pas
supprimée. Un rapport qui réorganise ses exigences doit déclarer à nouveau les réponses dont il
déplace la liaison, ce qui est la condition pour que la liaison reste vraie. Ce que la campagne n'a
pas encore dit est ce qu'un modèle fait de cette demande allégée : aucune n'a été reconduite depuis.
