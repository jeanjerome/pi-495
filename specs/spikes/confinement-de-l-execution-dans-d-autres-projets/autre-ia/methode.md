# Confinement des agents de code : étude pour 495

État des sources au **11 octobre 2026**. Périmètre : **macOS et Linux**. Windows est exclu conformément à la précision du commanditaire.

Étude menée seul, sur les sources officielles, sans consulter le travail de Claude et sans délégation. Les liens de code désignent les commits lus ; les dates sont celles des commits, avec leur fuseau. Pour Pi, la révision est celle du tag **v1.0.4**. Les autres instantanés ne désignent pas nécessairement une version publiée ou celle embarquée dans un produit commercial.

Les paragraphes numérotés rapportent les sources. Les passages **Déduction**, **Pour 495** et la section finale donnent mes analyses. « La source ne le dit pas » signifie que les passages lus ne répondent pas à la question, pas que la fonctionnalité est absente du projet entier. Les références [S1], [S2], etc. sont locales à chaque fiche. Les listes de fichiers et de passages délimitent la lecture ; ce relevé n'est pas un audit exhaustif.

**Aucun backend n'a été exécuté pour cette étude.** Une assertion de test n'est pas présentée comme un résultat observé. Aucun temps de démarrage n'a été mesuré ; les chiffres éventuels restent ceux de l'éditeur.

Les incidents de 495 — configuration Git globale, lien `test-output -> .`, refus d'emboîtement de profils Seatbelt différents sur macOS 27 — viennent de la demande du commanditaire du 11 octobre 2026. Ils n'ont pas été reproduits ici. Les recommandations s'appuient sur ce contexte fourni, sans l'attribuer aux projets étudiés.
