# D-15: Sortie de l'extension en mode print

**Status:** Acceptée

**Décision.** En mode `pi -p`, l'extension écrit son texte sur la sortie standard du processus ;
Pi réserve la sortie standard réelle à la réponse du modèle et route les écritures des extensions
vers la sortie d'erreur. Le contenu est identique à celui des autres modes ; les scripts doivent
lire les deux flux. En JSON, la vue canonique est portée par `details.view` d'un message
`customType: "495"`.
