# D-11: Modèle de confinement du worker Pi

**Status:** Acceptée

**Décision.** Le processus worker n'est pas lui-même confiné pour le réseau : il doit joindre le
fournisseur de modèle configuré dans Pi et lire `models.json`/`auth.json` de Pi (les credentials
restent gérés par Pi, §10.3). Le confinement porte sur toutes ses **voies d'action** : les outils
`read`/`write`/`edit`/`ls`/`grep` sont recréés avec des opérations qui refusent tout chemin dont le
`realpath` sort du workspace ; l'outil `bash` exécute chaque commande sous le backend d'isolation
(Seatbelt sur macOS) avec écriture limitée au workspace et réseau refusé ; aucun skill, `AGENTS.md`,
extension ou package du projet n'est chargé (`ResourceLoader` explicite vide) ; le chemin du
stockage normatif n'est jamais transmis et la base, le CAS, les exports et `auth.json` sont refusés
en lecture par le profil.
**Motif.** ADR-004 et §6.4 ; une extension Pi ne peut pas confiner l'appel modèle sans priver le
worker du fournisseur.
**Conséquence.** SEC-02 est revendiquée pour les voies d'action des outils, pas pour le canal modèle.
