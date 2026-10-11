# Cursor — agents cloud en VM

Signée : Codex (OpenAI, modèle GPT ; identifiant précis non exposé), le 11 octobre 2026.

Sources lues :

- [S1] [https://cursor.com/docs/cloud-agent/security](https://cursor.com/docs/cloud-agent/security) — lu le 11 octobre 2026 — frontière VM et secrets
- [S2] [https://cursor.com/docs/cloud-agent/setup](https://cursor.com/docs/cloud-agent/setup) — lu le 11 octobre 2026 — préparation, snapshots et section « Running Docker »

Non lu : hyperviseur configuré, orchestration propriétaire et tests internes, non publiés dans les sources examinées. Aucun accès à une VM Cursor n'a été utilisé.

Non essayé : installation, exécution et tests du projet. Les tests cités ont été lus, pas exécutés.

1. **Ce qui est confiné.** Chaque agent dispose d'une VM Firecracker isolée. Le travail exécuté dans cette VM est séparé de la machine du développeur ; les ressources explicitement connectées restent des accès à examiner. [S1]

2. **Droits.** L'utilisateur prépare l'environnement, ses commandes d'installation et ses secrets. Le réseau est disponible par défaut et peut être restreint. Une procédure de découverte puis d'approbation de chaque droit d'écriture n'est pas décrite. [S1, S2]

3. **Refusé quoi qu'on déclare.** La documentation expose une séparation par VM, pas une liste de chemins hôte que des règles de fichiers pourraient ouvrir. Une liste interne non dérogeable de chemins dans l'invité : la source ne le dit pas. [S1]

4. **Environnement de l'hôte.** Les secrets sont fournis à l'environnement cloud. Leur masquage vis-à-vis du modèle n'empêche pas le code de la VM de les lire lorsqu'ils lui sont injectés. L'importation de `~/.gitconfig`, `~/.npm` ou `~/.m2` de la machine locale n'est pas documentée. [S1, S2]

5. **Tester sous confinement.** La page de préparation traite les difficultés de Docker dans la couche de conteneur de l'agent. Elle ne décrit ni des tests Seatbelt, ni la preuve d'un emboîtement bubblewrap. [S2]

6. **Frontière pour un bac à sable ou Docker.** Les workflows Docker sont explicitement supportés. Pour les cas complexes, la documentation recommande notamment `fuse-overlayfs` et `iptables-legacy`, ainsi que les droits nécessaires sur Docker. La frontière extérieure reste la VM cloud. [S1, S2]

7. **Coût.** Préparer l'image, l'installation, les services et les snapshots. Les particularités Docker ajoutent de l'entretien. Aucun temps de démarrage garanti n'est donné dans les passages lus. Le système invité documenté ne qualifie pas le Seatbelt natif macOS. [S2 ; dernière phrase : déduction]

**Pour 495.** Déductions :

- Reprendre le modèle d'un environnement extérieur préparé pour les services Docker. [S1, S2]
- Conserver une image et une recette identifiées ; ne pas assimiler le masquage dans l'interface à la protection des secrets contre le code. [S1]
- Écarter cette voie Linux pour les tests qui doivent exercer réellement Seatbelt. [S2]
