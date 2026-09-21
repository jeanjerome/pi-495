# D-34: L'entrée SDK est un chargement, pas un cinquième mode

**Status:** Acceptée

**Décision.** Le critère « le même package exercé dans les cinq entrées Pi » compte l'hôte SDK comme
une manière de **charger** le package, non comme un mode de présentation. Pi n'expose que quatre
modes d'extension — `tui`, `rpc`, `json`, `print` — et un hôte SDK choisit celui qu'il lie.
`test/helpers/sdk-host.ts` est cet hôte : il charge l'extension par un `DefaultResourceLoader`
plutôt que par la découverte du binaire `pi`, et lie le mode `json`.
**Motif.** Chercher un mode `sdk` dans `ExtensionMode` ne donne rien, et la question restait de
savoir ce que la cinquième entrée devait démontrer. Ce qui la distingue est le chemin de
chargement : un hôte tiers qui embarque Pi ne passe ni par le CLI ni par les réglages de
l'utilisateur.
**Conséquence.** `v3/pi-rpc-sdk` compare quatre canaux sur les mêmes faits, et l'empreinte du
candidat — dérivée de son seul contenu — est la même dans les quatre. La concordance n'est donc pas
une ressemblance de texte mais une égalité d'identités.
