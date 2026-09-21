# D-18: Jalon de livraison distinct de la priorité d'exigence

**Status:** Acceptée
**Note:** l'identifiant D-18 est porté par deux décisions distinctes dans le journal d'origine ; l'autre est « Une opération déterministe n'est jamais rejouée ». Le défaut est conservé tel quel, non résolu.

**Décision.** Les marqueurs `P0`/`P1`/`P2` qualifient une exigence ; `L0`/`L1`/`L2`/`L3` qualifient
un jalon de livraison. Un jalon possède des critères que ses incréments ne portent pas
individuellement — deux plateformes, cinq entrées Pi, revues obligatoires, dossier de preuves
intègre — et son verdict est recalculé sur ces critères, jamais déduit de la somme de ses enfants.
Les critères de franchissement sont tenus dans `MILESTONES.md`.
**Motif.** Les incréments `IT-0` à `IT-4` ont pour sortie amont « parcours L0 complet » et `IT-5`
ouvre L1 ; les déclarer livrés revenait implicitement à annoncer un socle P0 dont le jalon technique
qui le précède n'est pas franchi.
**Conséquence.** « Livré » et « qualifié ici » restent des propriétés d'incrément dans `STATUS.md` ;
« franchi » devient une propriété de jalon, avec sa liste de conditions ouvertes.
