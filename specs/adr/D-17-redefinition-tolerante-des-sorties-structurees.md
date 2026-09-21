# D-17: Redéfinition tolérante des sorties structurées

**Status:** Acceptée

**Décision.** Avant validation contre le schéma de sortie, la sortie d'une intervention est
extraite du dernier bloc ```json chargeable, puis normalisée : propriétés inconnues retirées,
tableaux manquants remplacés par `[]`, booléens manquants par `false`. Un champ obligatoire
absent reste invalide.
**Motif.** Les modèles locaux ajoutent souvent un commentaire ou un champ ; refuser ces sorties
transformait chaque cycle en `configuration_error`. La normalisation n'invente aucun contenu
métier.
