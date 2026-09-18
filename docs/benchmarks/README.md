# Vitesse des modèles sous la charge de 495

Ce répertoire accumule les mesures de vitesse du point d'accès que le harnais pilote. Chaque mesure
a son fichier daté ; la table de comparaison ci-dessous les met en regard.

Un banc générique répondrait à une question que 495 ne pose pas. `scripts/bench-model.ts` construit
donc ses prompts avec `buildContext`, le constructeur de contexte du produit : mêmes instructions de
confiance, mêmes artefacts adoptés, mêmes extraits de projet étiquetés non fiables, même budget
d'entrée de 60 000 octets, mêmes outils exposés par `TOOLS_FOR_ROLE`. Ce qui est chronométré est ce
qu'une intervention envoie.

## Les trois régimes, et pourquoi ils sont séparés

| Régime | Ce qu'il isole | Forme de la requête |
| --- | --- | --- |
| `prefill` | traitement du prompt, cache froid | nonce unique en tête, contexte complet d'une intervention `specify`, 32 jetons de sortie |
| `decode` | génération seule | prompt court, 768 jetons de sortie, pensée désactivée |
| `agentic` | le régime réel d'une intervention | 12 tours, un résultat d'outil ajouté par tour, préfixe stable |

Le troisième est celui qui décide du coût d'un cycle, et c'est celui qu'un banc naïf rate. La
campagne du 18 septembre 2026 a servi **88 % de ses jetons de prompt depuis le cache de préfixe**
(10,1 M sur 11,5 M) : mesurer uniquement des prompts froids décrirait une charge que le harnais
n'exécute jamais.

## Reproduire une mesure

```bash
cd ~/Projets/495-pi-package
node scripts/bench-model.ts --label "<modèle> / <profil> / <moteur>" \
     --out <fichier>.json
```

Options : `--model provider/id` (défaut : le modèle par défaut de `~/.pi/agent/settings.json`),
`--scenario all|prefill|decode|agentic`, `--repeat N` (défaut 3), `--turns N` (défaut 12).

Le point d'accès, la clé et l'identifiant de modèle sont lus dans `~/.pi/agent/models.json`, là où
pi les lit : le banc mesure ce que pi atteindrait, pas une configuration parallèle.

## Lire les chiffres

**Deux valeurs portent la comparaison** : le débit de préremplissage à froid et le débit de
génération. Les autres colonnes décrivent les conditions.

Trois pièges, tous rencontrés à la première exécution :

- un débit de génération mesuré sur 32 à 64 jetons est optimiste — trop court pour amortir le
  premier jeton. Seul le régime `decode`, sur 768 jetons, donne une valeur opposable ;
- au-dessous d'un millier de jetons à prerremplir, le temps jusqu'au premier jeton est de
  l'ordonnancement, pas du traitement de prompt. Le banc rend `null` plutôt qu'un nombre qui
  ressemblerait à une mesure ;
- le serveur impose son propre échantillonnage quand `force_sampling` est vrai : la longueur des
  réponses varie d'un passage à l'autre. D'où les répétitions et les médianes.

## Ajouter une mesure

Pour qu'une nouvelle ligne soit comparable aux précédentes :

1. garder `--repeat 3 --turns 12` et le budget d'entrée de 60 000 octets, ou dire dans le fichier ce
   qui a changé et pourquoi ;
2. conserver le JSON produit : il porte l'empreinte de configuration complète — moteur, type de
   modèle, profil actif, tous les réglages en vigueur — sans laquelle deux séries de chiffres ne
   nomment rien ;
3. écrire un fichier `AAAA-MM-JJ-<modèle>.md` sur le modèle de ceux déjà présents, et ajouter sa
   ligne à la table ci-dessous ;
4. nommer ce que la mesure n'établit pas. Une vitesse est mesurée sur une machine, un jour, avec ce
   qui était résident à ce moment-là.

## Comparaison

| Date | Modèle | Moteur | Profil | Prefill froid | Génération | TTFT `agentic` | Cache `agentic` | Détail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-18 | `Qwen3.8-27B-oQ8e-mtp` | `batched` (llm) | `profile-qwen38-01` | 288 tok/s | 29,3 tok/s | 12,5 s | 80 % | [fiche](2026-09-18-qwen3.8-27b-oq8e.md) |

Machine de référence : macOS 27 arm64, oMLX sur `127.0.0.1:8000`. Les mesures d'une autre machine
appartiennent à une autre table.
