# D-19: Vocabulaire d'états de suivi sans effet sur la machine à états

**Status:** Acceptée
**Note:** l'identifiant D-19 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « Une intervention tronquée est suspendue, pas annulée ». Le défaut est conservé tel quel, non résolu.

**Décision.** Le suivi d'un jalon ou d'une sous-livraison emploie quatre états — non commencé, en
cours, livré non qualifié, qualifié. Ce vocabulaire est documentaire. La machine à états d'un
changement (`intake → … → closed`) et les verdicts de contrôle
(`PASS`/`FAIL`/`INDETERMINATE`/`NOT_RUN`/`NOT_APPLICABLE`) restent seuls normatifs et gelés dans les
contrats v1.
**Motif.** Deux vocabulaires d'états coexistant sans hiérarchie déclarée finissent par être
confondus dans le code ou dans les rapports.
