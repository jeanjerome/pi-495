# Vitesse des modèles sous la charge de 495

Ce répertoire accumule les mesures de vitesse du point d'accès que le harnais pilote. Chaque mesure
a son fichier daté ; la table de comparaison ci-dessous les met en regard.

Un banc générique répondrait à une question que 495 ne pose pas. `scripts/bench-model.ts` construit
donc ses prompts avec `buildContext`, le constructeur de contexte du produit : mêmes instructions de
confiance, mêmes artefacts adoptés, même budget
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

## Quand le banc refuse de mesurer

Il sort en code 1 sans rien écrire plutôt que de produire des lignes incomparables, et il nomme
laquelle des trois pannes il a rencontrée : point d'accès injoignable, réponse HTTP de refus — le
message du serveur est alors repris en entier —, ou flux interrompu en cours de génération.

Un contrôle préalable n'est pas possible : un modèle dont le chargement a échoué reste listé par
`/v1/models` et ne porte aucun indicateur dans l'API d'administration. Seule une requête révèle son
état, et c'est le préchauffage qui la paie.

## Ce que le banc représente mal

Mesuré le 18 septembre sur une campagne réelle : les prompts que le harnais envoie ont une médiane de
**32 878 jetons** et une pointe à 52 359, alors que le scénario `prefill` du banc en prérremplit
12 437. Le banc décrit donc une charge plus légère que la vraie, et comme le coût de lecture croît
avec la taille du morceau, il sous-estime vraisemblablement les écarts entre modèles.

Ces deux nombres ont été mesurés quand une intervention portait jusqu'à 48 Ko d'extraits du projet.
Le harnais n'en envoie plus (D-41) et le banc non plus : une intervention part maintenant d'une
invite nettement plus courte, et lit ce dont elle a besoin par ses outils, tour par tour — ce que le
scénario `agentic` décrivait déjà. Les trois lignes du 18 septembre 2026 gardent leur valeur pour
ordonner les modèles entre eux ; leur colonne « Prefill froid » n'est pas comparable à celle d'une
mesure prise après ce changement.

Un correctif possible serait d'élargir le budget d'entrée au-delà des 60 000 octets qu'une
intervention reçoit — mais ce budget est celui du produit, et le banc perdrait sa fidélité en le
dépassant. La lecture juste est donc : les chiffres du banc ordonnent les modèles, ils ne prédisent
pas les durées d'un cycle. Pour celles-ci, le journal du serveur donne une ligne par requête servie,
et c'est la source utilisée dans `../QUALIFICATION.md`.

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
| 2026-09-18 | `Qwen3.8-Flash-Next-MLX-oQ4-MTP` | `vlm` | `pi-flashnext-01` | **523 tok/s** | 30,3 tok/s | **5,9 s** | 80 % | [fiche](2026-09-18-qwen3.8-flash-next-oq4.md) |
| 2026-09-18 | `Qwen3.8-27B-oQ8e-mtp`, **ANE coupé** | `batched` (llm) | aucun (détaché) | 217 tok/s | 30,2 tok/s | 15,2 s | 80 % | [fiche](2026-09-18-qwen3.8-27b-oq8e-sans-ane.md) |

Deux lignes ne font pas forcément un A/B. Entre les deux premières, quatre variables changent
ensemble — architecture, quantification, moteur et profil —, et chaque fiche nomme lesquelles ; une
ligne dit alors ce que vaut un ensemble, jamais ce que vaut l'un de ses facteurs. La troisième est
en revanche un vrai A/B contre la première : un seul réglage y change, et elle mesure ce que vaut le
préremplissage ANE, soit **+33 %** sur un prompt froid.

L'A/B symétrique manquera toujours : le préremplissage ANE est réservé par le serveur aux
architectures `qwen3_5`, `qwen3_6` et `qwen3_8`, et l'activer sur un modèle `qwen4_exp` est refusé en
HTTP 400. Entre ces deux modèles, l'ANE reste donc confondu avec l'architecture et la
quantification, quoi qu'on mesure.

La version du serveur appartient à la comparaison autant que le modèle : une mesure prise sous une
autre version d'oMLX se note dans sa fiche.

## Machine

MacBook Pro, **Apple M4 Max** : 16 cœurs CPU (12 performance, 4 efficacité), **40 cœurs GPU**,
**128 Go de RAM**, Metal 4. macOS 27.0 (build 26A428), **oMLX 0.6.4 (2529)** sur `127.0.0.1:8000`.

Le matériel n'est pas ici une précaution de forme : la quantité de mémoire **change la géométrie du
cache de préfixe**. `scheduler.py` fixe le plancher de bloc à 4 096 jetons quand
`get_system_memory() >= 64 Go` et que NAX est absent, contre 0 — donc une cible de 2 048 — sous ce
seuil. Une mesure prise sur une machine de moins de 64 Go, ou sur une machine NAX/M5, ne décrit pas
la même granularité de cache et n'appartient pas à cette table. Voir la fiche du 18 septembre.
