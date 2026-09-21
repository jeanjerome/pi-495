# D-20: La matrice de traçabilité porte une ligne par exigence P0

**Status:** Acceptée
**Note:** l'identifiant D-20 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « Le build 495 fait partie de l'identité d'environnement ». Le défaut est conservé tel quel, non résolu.

**Décision.** Toute exigence `[P0]`, aux deux niveaux de titre de l'expression de besoins — `####`
pour les 85 exigences fonctionnelles, `###` pour `NFR-01` à `NFR-08` — possède une ligne dans
`TRACEABILITY.md`, soit parmi les couvertes avec ses composants et ses preuves, soit parmi les non
couvertes avec l'état constaté. Une exigence couverte dont une partie de la recette n'est exercée
par aucun test porte la mention « non qualifié » et ce qui manque.
**Motif.** Dix-huit exigences `[P0]` n'apparaissaient nulle part dans la matrice. Une exigence
absente n'y est pas neutre : elle est indistinguable d'une exigence satisfaite, alors que le rôle
de la matrice est précisément de nommer ce qui n'est pas couvert.
**Conséquence.** Un contrôle exécutable doit garantir cette propriété plutôt qu'une relecture ; il
fait l'objet d'un travail ouvert dans `chantiers/`.
