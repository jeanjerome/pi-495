# Unsloth Studio

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://unsloth.ai/docs/new/studio/sandboxing-in-unsloth](https://unsloth.ai/docs/new/studio/sandboxing-in-unsloth) — lu le 11 octobre 2026 — niveaux de protection
- [S2] [studio/backend/core/inference/os_sandbox.py:94-187](https://github.com/unslothai/unsloth/blob/c554fbfe22c7b914c676866dfa8c69d79a0f7779/studio/backend/core/inference/os_sandbox.py#L94-L187) — `unslothai/unsloth @ c554fbfe22c7b914c676866dfa8c69d79a0f7779` (2026-10-11T02:43:27-07:00) — contrat de lancement et trace de protection
- [S3] [studio/backend/core/inference/os_sandbox.py:1113-1248](https://github.com/unslothai/unsloth/blob/c554fbfe22c7b914c676866dfa8c69d79a0f7779/studio/backend/core/inference/os_sandbox.py#L1113-L1248) — `unslothai/unsloth @ c554fbfe22c7b914c676866dfa8c69d79a0f7779` (2026-10-11T02:43:27-07:00) — refus ou repli
- [S4] [studio/backend/core/inference/sandbox_macos.py:523-727](https://github.com/unslothai/unsloth/blob/c554fbfe22c7b914c676866dfa8c69d79a0f7779/studio/backend/core/inference/sandbox_macos.py#L523-L727) — `unslothai/unsloth @ c554fbfe22c7b914c676866dfa8c69d79a0f7779` (2026-10-11T02:43:27-07:00) — profil, environnement et préparation
- [S5] [studio/backend/core/inference/sandbox_linux.py:830-965](https://github.com/unslothai/unsloth/blob/c554fbfe22c7b914c676866dfa8c69d79a0f7779/studio/backend/core/inference/sandbox_linux.py#L830-L965) — `unslothai/unsloth @ c554fbfe22c7b914c676866dfa8c69d79a0f7779` (2026-10-11T02:43:27-07:00) — construction bubblewrap
- [S6] [studio/backend/core/inference/sandbox_probe.py:370-455](https://github.com/unslothai/unsloth/blob/c554fbfe22c7b914c676866dfa8c69d79a0f7779/studio/backend/core/inference/sandbox_probe.py#L370-L455) — `unslothai/unsloth @ c554fbfe22c7b914c676866dfa8c69d79a0f7779` (2026-10-11T02:43:27-07:00) — sondes et vérifications externes

Non lu : backend Windows, hors périmètre ; intégralité des outils Studio et de leurs appelants, non auditée. La fiche décrit le lanceur de code, pas une garantie sur tout le serveur.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Les exécutions passant par le lanceur utilisent Seatbelt sur macOS ou bubblewrap sur Linux. Studio combine cette couche avec des contrôles logiciels ; son mode de plein accès désactive les protections. Le contrat de lancement prévoit fermeture des descripteurs non transmis et arrêt des descendants. Il ne confine pas à lui seul le serveur parent. [S1, S2, S4, S5]

2. **Droits.** Le lanceur distingue `auto`, `required`, `software` et `full`. Si la capacité OS manque, `required` refuse ; `auto` peut poursuivre avec les seuls garde-fous logiciels. La trace enregistre backend, profil, empreinte de politique et limites effectives. Une approbation humaine de chaque nouveau chemin : la source ne le dit pas. [S2, S3] Le profil macOS autorise les racines nécessaires au runtime ; ses écritures visent le répertoire de travail et un temporaire privé. [S4]

3. **Refusé quoi qu'on déclare.** Dans le chemin confiné, une préparation dangereuse ou une erreur de construction reste bloquante. Un scan incomplet du répertoire refuse en `required`. Ce ne sont pas des interdictions universelles : `full` existe. [S3] Le profil macOS réinterdit l'état confidentiel de Studio après ses autorisations. Linux retire les capacités et bloque la création de nouveaux namespaces utilisateur par l'option bubblewrap ou le filtre prévu. [S4, S5]

4. **Environnement de l'hôte.** Sur macOS, retrait notamment de `DYLD_*`, `SSH_AUTH_SOCK`, `DISPLAY` et de variables graphiques ; déplacement de `HOME`, XDG et des temporaires dans des emplacements privés ; `PIP_TARGET` dans `.unsloth-packages`. `/etc/gitconfig` est traité littéralement pour éviter qu'un lien ouvre le domicile. Linux monte les racines du runtime en lecture seule et un cache de modèles partagé en écriture après validation. Politique explicite de `~/.npm` ou `~/.m2` : la source ne le dit pas. [S4, S5]

5. **Tester sous confinement.** La sonde commence par vérifier que les opérations témoins sont possibles hors confinement. Elle teste ensuite les refus, dont lecture par lien symbolique et écriture extérieure, puis examine le témoin d'écriture depuis l'extérieur. Elle exige aussi une sortie positive attendue : un échec quelconque ne suffit pas. [S6] Le profil macOS est généré par une fonction textuelle testable séparément. Un moyen d'appliquer un second profil Seatbelt différent : la source ne le dit pas. [S4]

6. **Frontière pour un bac à sable ou Docker.** Linux conserve le réseau pour les téléchargements ; ce n'est pas le mode `denied` de 495. Il restreint les nouveaux namespaces utilisateur. [S5] Daemon Docker privé ou worker extérieur pour les tests incompatibles : la source ne le dit pas.

7. **Coût.** Backend et sondes doivent être qualifiés ; racines de runtime et scan du répertoire sont à entretenir. [S3-S6] La documentation annonce environ 50 ms par appel Linux et 110 ms macOS : chiffres éditeur, non essayés ici. [S1]

**Pour 495.** Déductions :

- Reprendre trace de qualification et témoins positifs/négatifs vérifiés depuis l'extérieur. [S2, S6]
- Reprendre `required` ; écarter le repli vers une protection seulement logicielle. [S3]
- Adapter domicile et répertoires de paquets privés ; ne pas ouvrir réseau ou cache partagé sans accord. [S4, S5]
