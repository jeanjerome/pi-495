# Risques L0 — décision de traitement et preuve

`amont/conception-technique.md` §16 énumère dix risques, avec pour chacun un traitement envisagé et
la preuve attendue. Le jalon L0 ne se franchit pas en montrant que le code existe : il se franchit
quand **chaque ligne possède une décision écrite et la preuve qui la soutient, ou un travail ouvert
qui la porte**. Une ligne dont le code contient déjà la réponse demande quand même sa décision.

Ce document est un document de suivi. Il ne révise pas l'amont : là où l'instruction d'une ligne
montre que le traitement envisagé ne correspond pas à ce qui protège réellement, la décision le dit
et nomme ce qui tient à sa place.

Trois issues sont possibles, et une seule est employée par ligne.

| Issue | Ce qu'elle veut dire |
| --- | --- |
| **traité** | La décision est prise, elle est appliquée, une preuve exécutée la soutient. |
| **traité, résiduel nommé** | La décision est prise et appliquée ; une part du risque reste, bornée et annoncée. |
| **ouvert** | La décision est prise, mais ce qui la soutiendrait n'existe pas encore. Le travail est nommé. |

## Vue d'ensemble

| # | Risque (§16) | Issue | Preuve principale |
| --- | --- | --- | --- |
| 1 | API Pi modifiée en version 0.x | traité, résiduel nommé | `v1/platform-paths`, `v3/pi-entries`, `v3/pi-rpc-sdk` |
| 2 | `ctx.ui.custom()` insuffisant pour la revue | traité, résiduel nommé | `v0/review-surface`, `v0/review-parameters`, `v3/pi-rpc-sdk` |
| 3 | Extension tierce avec droits complets | ouvert | `v2/telemetry`, `v1/agent-port` ; inventaire absent |
| 4 | Sandbox macOS ou Linux incomplète | traité, résiduel nommé | `v1/sandbox`, campagne Linux du 17 septembre 2026 |
| 5 | SQLite ou CAS corrompu | traité, résiduel nommé | `v2/ledger`, `v2/export-integration` |
| 6 | Dépôt sale mal restitué | traité | `v2/workspace`, `v2/export-integration` |
| 7 | Sortie ou rapport volumineux | traité, résiduel nommé | `v0/review-parameters`, `v1/sandbox`, `v2/ledger` |
| 8 | Décision RPC attribuée à tort à un humain | traité | `v0/change-rules`, `v3/pi-rpc-sdk` |
| 9 | Compaction Pi perdant une obligation | traité | `v2/harness`, `v2/ledger` |
| 10 | Ancien code Python divergeant | ouvert | matrice de migration ci-dessous, caractérisation absente |

---

## 1. API Pi modifiée en version 0.x

**Traitement envisagé.** Version exacte épinglée, adaptateur unique, tests de contrat.
**Preuve attendue.** `C-PI`, V1/V3 sur chaque mode.

**Décision.** L'adaptateur unique et les tests de contrat sont retenus. L'épinglage par une version
exacte ne l'est pas : il est remplacé par une mesure plus forte, **la version de Pi fait partie de
l'identité d'environnement**, et un changement d'environnement invalide les qualifications qui en
dépendent. Une version épinglée interdit une mise à jour ; une version mesurée oblige à requalifier
ce qui en dépendait, ce que l'exigence `EXT-02` demande réellement.

**Preuve.** L'API Pi n'entre dans les sources que par deux portes — `src/extension/` et
`src/adapters/pi-worker/`. `check-layers` refuse un import Pi depuis `contracts/`, `domain/`,
`ports/`, `application/`, `presentation/` et `export/`, et `check-distribution` vérifie que tout
module externe importé par `src/` est un peer déclaré. `describeEnvironment`
(`src/application/environment.ts`) met `pi_version` dans l'empreinte d'environnement, et
`v1/platform-paths` — « component version change and dependent qualifications (EXT-02, REC-16,
RM-076) » — vérifie qu'un changement de version d'un composant invalide les qualifications
dépendantes. Le contrat avec les entrées est exercé sur les cinq : `v3/pi-entries` pour print et
JSON, `v3/pi-rpc-sdk` pour RPC et l'hôte SDK, `v0/review-surface` pour le composant TUI.

**Résiduel nommé.** `peerDependencies` déclare `"*"` pour les quatre paquets Pi. Rien n'empêche
donc l'installation sous une version majeure future, où le package chargerait puis échouerait à
l'usage plutôt qu'à l'installation. L'invalidation des preuves protège les verdicts, pas le
chargement. Travail identifié : déclarer un intervalle supporté dans `peerDependencies` et refuser
au chargement une version hors intervalle, avec `capability_missing`.

## 2. `ctx.ui.custom()` insuffisant pour la revue

**Traitement envisagé.** Prototype hauteur réelle, resize, focus, retour conversation ; modèle
indépendant conservé.
**Preuve attendue.** `F-REVIEW`, `F-LARGE`, snapshots et revue clavier.

**Décision.** Le traitement est retenu tel quel, et le point qui le rend sûr est le second : **le
modèle de revue ne dépend d'aucun composant**. `ctx.ui.custom()` peut se révéler insuffisant sans
que la revue disparaisse, parce que les mêmes données sont servies aux quatre autres entrées par
`review.ts` et `review-text.ts`.

**Preuve.** L'indépendance n'est plus une convention mais un contrôle : `check-layers` refuse un
import Pi sous `presentation/`. `v0/review-model` tient le modèle ; `v0/review-surface` tient le rendu — hauteur
imposée, largeur jamais dépassée, statuts lisibles sans couleur, navigation clavier avec sélection
et focus conservés, `q` rendant la main à la conversation, alternance sous le seuil étroit.
`v0/review-parameters` ajoute `F-LARGE` : le corpus de `test/fixtures/review-corpus.ts`, la
pagination et les budgets de lecture. `v3/pi-rpc-sdk` établit que RPC, l'hôte SDK et JSON lisent le
même instantané — même `snapshot_id`, mêmes comptes, même texte — et que print, qui ne porte aucune
charge structurée, en imprime les mêmes lignes.

**Résiduel nommé.** Aucune observation humaine dans un vrai terminal n'a eu lieu. Le rendu est
vérifié par tests de composant, ce qui ne remplace ni un redimensionnement réel, ni un lecteur
d'écran, ni un jugement d'accessibilité. Le dossier est écrit et attend son autorité —
`revues/R4-ux-accessibilite.md`.

## 3. Extension tierce avec droits complets

**Traitement envisagé.** Profil fermé et inventaire de provenance des outils/extensions.
**Preuve attendue.** `C-SEC`, `C-EXT`, `F-EXTENSIONS`.

**Décision.** Le profil fermé est retenu et livré ; **l'inventaire de provenance ne l'est pas**, et
la ligne reste ouverte pour cette moitié. Les deux moitiés ne protègent pas contre la même chose :
le profil fermé protège l'intervention, l'inventaire protégerait la session hôte.

**Preuve, pour ce qui est livré.** Une intervention s'exécute dans un processus enfant confiné dont
le `ResourceLoader` est vide par construction — aucune extension, aucun skill, aucun `AGENTS.md`,
aucun thème (`src/adapters/pi-worker/worker-main.ts`) — avec `noTools: "all"` et une liste d'outils
explicite bornée au workspace. `v1/agent-port` exerce ce protocole ; `v2/telemetry` établit qu'un
changement conduit de bout en bout n'ouvre aucune connexion et ne résout aucun hôte, et qu'aucune
source ne porte de client réseau.

**Ce qui manque.** Une extension tierce chargée dans la **même session Pi** que `/495` n'est ni
inventoriée, ni annoncée. `describeEnvironment` relève la plateforme, Node, Pi, le backend
d'isolation et les outils de build ; il ne relève pas les extensions ni les outils que l'hôte
expose. La fixture `F-EXTENSIONS` — extension admise, inconnue, mise à jour, profil composé —
n'existe pas. Ce qui limite la portée du risque : l'état normatif vit hors de la session Pi, seul le
noyau écrit une gate, et l'outil conversationnel `harness495` est en lecture seule (`D-09`). Une
extension tierce peut donc observer et gêner, non décider. Travail identifié : ajouter l'inventaire
des extensions et des outils de la session à l'identité d'environnement, et écrire `F-EXTENSIONS`.

## 4. Sandbox macOS ou Linux incomplète

**Traitement envisagé.** Matrice d'attaque ; fail closed par capacité.
**Preuve attendue.** `C-SEC`, V4/V5.

**Décision.** Le fail closed par capacité est retenu, appliqué et éprouvé sur les deux plateformes.
La matrice d'attaque est retenue pour macOS et **la plateforme Linux n'est pas revendiquée** : le
backend `bwrap` existe, aucune campagne ne le qualifie, et `qualify()` refuse sur toute machine.
Voir `MILESTONES.md` §3 et `D-31`.

**Preuve.** Sur macOS, `v1/sandbox` exécute la matrice : écriture hors workspace refusée, lecture
d'un chemin sensible refusée, échappement par lien symbolique refusé, écriture dans le home
refusée, réseau refusé, profil `loopback` se joignant lui-même et aucun autre hôte, réseau ouvert
seulement quand le mandat le dit.

Sur Linux, la campagne du 17 septembre 2026 (conteneur `node:24-bookworm-slim`, `linux/amd64`,
noyau linuxkit 7.0.12, `bubblewrap 0.8.0`) donne trois faits :

1. `bwrap` ne peut pas créer d'espace de noms sous le profil par défaut d'un conteneur
   (`Creating new namespace failed: Operation not permitted`), et n'y parvient qu'en `--privileged`
   — c'est-à-dire dans un environnement qui a retiré la frontière que la mesure devait constater.
2. `qualify()` refuse, la limite `sandbox:bubblewrap:not-qualified` apparaît dans la vue, et le
   changement s'arrête en `capability_missing` : le refus fail closed a lieu.
3. Le motif rendu était faux avant correction : l'échec de `bwrap` était compté comme un verdict du
   contrôle de la cible — « the runner exited with 1 without emitting a TAP summary ». Il est
   désormais un incident, `spawn error: bwrap: Creating new namespace failed`, et le témoin positif
   rend `INDETERMINATE` au lieu de `FAIL` (`D-32`, `v1/sandbox`).

**Résiduel nommé.** V5 — campagne adverse conduite par un reviewer indépendant du producteur — n'a
pas eu lieu, et la revue de sécurité attend cette autorité (`revues/R3-securite.md`). La matrice
d'attaque exécutée est celle que le producteur a écrite ; elle ne vaut pas revue adverse.

## 5. SQLite ou CAS corrompu

**Traitement envisagé.** Transactions, chaîne, sauvegarde avant migration et tests de panne.
**Preuve attendue.** `C-EVD`, `F-EVIDENCE`.

**Décision.** Transactions, chaîne et tests de panne sont retenus et livrés. La sauvegarde avant
migration est retenue **par le refus plutôt que par la copie** : il n'existe qu'une version de
schéma, et une base écrite par une version plus récente n'est pas migrée mais refusée
(`CONFIGURATION_ERROR: database schema N is newer than supported`). Une sauvegarde protège une
migration ; tant qu'aucune migration n'existe, refuser de muter est la garantie plus forte.

**Preuve.** `v2/ledger` — journal append-only, chaîne de digests, projections, pannes injectées,
magasin CAS — et `v2/export-integration`, qui vérifie un dossier exporté hors ligne. Les preuves
portent `integrity.content_digest` et `chained_to` ; une preuve dont le sujet a changé d'empreinte
est exclue (`v0/change-rules`, VER-03).

**Résiduel nommé.** Il n'existe aucune politique de purge ni de comptabilité de croissance : la
base, les objets et les exports grossissent sans borne, et `cleanupTemporaries` du CAS n'est appelé
que par un test. Une interruption avant fermeture laisse un workspace orphelin que rien ne reprend.
C'est un risque d'exploitation, pas d'intégrité, et il est enregistré comme tel dans
`revues/R6-exploitation.md`.

## 6. Dépôt sale mal restitué

**Traitement envisagé.** Snapshot complet, workspace matérialisé et intégration comparée.
**Preuve attendue.** `C-CAN`, `C-GIT`, `F-NOHEAD`.

**Décision.** Le traitement est retenu tel quel, et livré en entier.

**Preuve.** `v2/workspace` couvre les cinq situations d'entrée, dont `F-NOHEAD` — un dépôt Git sans
`HEAD` garde les fichiers de l'utilisateur inventoriés comme préexistants, sans erreur Git — et le
dépôt sale, où modifications non commitées et fichiers non suivis sont distingués du contenu
commité. Le workspace est matérialisé à part : le worker y écrit, jamais dans le projet, et le
manifeste liste ajouts, modifications, suppressions, changements de mode et de lien symbolique.
L'identité d'un candidat suit son contenu et non le nom de son workspace. `v2/export-integration`
tient l'intégration comparée : destination revalidée, conflit, réconciliation.

## 7. Sortie ou rapport volumineux

**Traitement envisagé.** Streaming, CAS, pages et limites visibles.
**Preuve attendue.** `C-PERF`, `F-LARGE`.

**Décision.** Streaming, CAS, pages et limites visibles sont retenus et livrés, et les trois
paramètres que la spécification fonctionnelle avait différés à ce jalon sont désormais fixés avec
leur protocole, leur fixture et leur critère (`D-33`). Ce qui n'est pas retenu, faute d'autorité
pour le trancher, est un seuil de performance : aucun budget de latence n'est promis.

**Preuve.** `v1/sandbox` borne la sortie d'un processus et la déclare tronquée plutôt que de la
perdre ; `v2/ledger` tient le CAS ; `v2/workspace` vérifie qu'un fichier au-dessus de la limite de
taille est rapporté comme limite et non silencieusement omis. `v0/review-parameters` tient les trois
paramètres sur la fixture `F-LARGE` de `test/fixtures/review-corpus.ts` : chargement page par page
avec ce qui n'est pas encore chargé annoncé et atteignable, fichier au-dessus du budget de lecture
typé `too_large` avec sa taille et toujours présent dans l'arbre, et aucune action de revue perdue
par le rétrécissement du terminal.

**Résiduel nommé.** `C-PERF` n'a pas été exécuté : aucune mesure p95, aucune dispersion, aucune
baseline. `NFR-04` est annoncée non mesurée dans `STATUS.md`. Les bornes existent, les temps ne sont
pas connus.

## 8. Décision RPC attribuée à tort à un humain

**Traitement envisagé.** `HumanOriginProvider` obligatoire.
**Preuve attendue.** `C-HUM`, `SA-030`, `SA-031`.

**Décision.** Le traitement est retenu tel quel et exercé sur les deux côtés : un client RPC qui ne
déclare pas d'identité n'obtient pas de dialogue, et un client qui en déclare une produit une
décision attribuée à cette identité et à cette révision.

**Preuve.** `v0/change-rules` — « human decisions (SA-005, SA-030, SA-031, RM-037, RM-040) » —
refuse une approbation forgée par une sortie d'agent et limite une approbation à la révision
affichée. `v3/pi-rpc-sdk` exerce le parcours réel : sans `HARNESS495_RPC_HUMAN_ACTOR`, le changement
s'arrête en `decision_required` et **aucun dialogue n'est ouvert** ; avec la variable, un
`extension_ui_request` de méthode `select` traverse le sous-protocole UI, la réponse est acceptée,
et `/495 report` nomme l'autorité : `[humain] alice: IH-10 accept`. `D-12` fixe le mécanisme.

## 9. Compaction Pi perdant une obligation

**Traitement envisagé.** Contexte reconstruit depuis le manifeste normatif.
**Preuve attendue.** `C-CTX`, `SA-019`.

**Décision.** Le traitement est retenu tel quel, et il est le seul possible : l'état normatif n'est
jamais dans la session Pi, donc une compaction ne peut pas le perdre. C'est `ADR-018`, et c'est ce
qui rend la ligne traitable par construction plutôt que par précaution.

**Preuve.** `v2/harness` — « obligations and budgets across a session change (CTX-04, REC-06) » —
reconstruit obligations, décisions, exclusions et budgets à l'identique après une compaction forcée
et un changement de session. `v2/ledger` — « Pi session lifecycle: reload, fork, and operations that
must not run twice (UX-05, REC-40) » — tient la seconde moitié de `SA-019` : aucune opération
confirmée n'est rejouée, et les décisions en attente sont retrouvées.

## 10. Ancien code Python divergeant

**Traitement envisagé.** Tests de caractérisation avant reprise ; aucune compatibilité supposée.
**Preuve attendue.** V0–V2 et matrice de migration.

**Décision.** « Aucune compatibilité supposée » est retenu et tenu : aucune source, aucun contrat,
aucune exigence de ce package ne dérive de l'implémentation Python, et `references-externes.md`
classe déjà son gestionnaire de paquets comme historique. « Tests de caractérisation avant reprise »
n'a pas lieu d'être appliqué, parce **qu'aucune reprise n'a eu lieu** : le package TypeScript est
écrit depuis un amont réécrit, pas traduit depuis le Python. La matrice de migration attendue est
donc rendue ici sous la forme qu'elle peut réellement prendre — une correspondance de domaines, pas
de fonctions — et la ligne reste **ouverte** tant que les domaines qu'elle laisse sans équivalent
n'ont pas reçu leur décision.

**État de l'existant.** `~/Projets/495-archives/495`, révision `dd70ff5`, 88 fichiers Python,
35 905 lignes dont une trentaine de modules de test. Il n'est pas installé, pas exécuté, pas
importé.

| Domaine Python | Lignes | Équivalent dans ce package | Décision |
| --- | --- | --- | --- |
| `workflow/` — étapes, documents, reprise | 2 956 | `application/harness.ts`, `domain/`, `contracts/v1/` | Réécrit sur une machine à états contractuelle ; aucun comportement repris |
| `interface/` — CLI, rendu, rapport | 2 747 | `extension/`, `presentation/` | **Abandonné** : le produit n'a pas de CLI propre (`expression-besoins.md` §3) |
| `agents/` — catalogue de modèles, clients Claude Code et Codex | 1 702 | `adapters/pi-worker/` | **Abandonné** : le modèle et son coût viennent de l'hôte Pi, pas d'un catalogue publié par le paquet |
| `execution/` — contrôles, environnement, intégration, processus, workspace | 934 | `adapters/execution/`, `adapters/git/`, `adapters/workspace/`, `adapters/sandbox/` | Réécrit ; le confinement passe de profils de système de fichiers à des backends plateforme (`ADR-013`) |
| `phases/` — gating, intervention, feedback | 848 | `domain/`, `application/qualification.ts` | Réécrit ; les gates deviennent G0–G6 avec preuves liées au candidat |
| `documents.py`, `schemas/`, `serialization.py`, `contract.py` | 1 244 | `contracts/v1/`, `contracts/digest.ts` | Réécrit ; vocabulaires fermés et versionnés, validation à l'exécution |
| `events.py` | 337 | `adapters/storage-sqlite/` | **Renversé** : les événements Python étaient éphémères et sans effet sur les décisions ; ici le journal est la source de vérité |
| `configuration.py`, `vocabulary.py`, `composition.py`, `model.py`, `errors.py` | 1 242 | `extension/config.ts`, `contracts/v1/common.ts`, `domain/errors.ts` | Réécrit |
| `prompting/facts.py` | 193 | `application/context.ts` | Réécrit ; manifeste de contexte avec budget et troncatures déclarées |

**Ce qui manque pour clore.** Deux domaines sont marqués « abandonné » sans qu'une exigence amont
l'acte : le catalogue de modèles et son arithmétique de coût. `AGT-07` demande que le coût d'un
changement de modèle soit tracé, connu ou inconnu ; ce package le laisse à l'hôte. L'exigence relève
de L2 (`MILESTONES.md` §5), donc rien n'est bloqué aujourd'hui, mais la décision d'abandon doit être
vérifiée avant de l'ouvrir. Travail identifié : établir que ce que Pi rapporte suffit à `AGT-07`, ou
rouvrir le catalogue. Aucun test de
caractérisation n'est prévu : il n'y a rien à conserver dont un test dirait la forme.

---

## Ce que ce document laisse ouvert

| Ligne | Travail identifié |
| --- | --- |
| 1 | Déclarer un intervalle Pi supporté dans `peerDependencies` et refuser au chargement hors intervalle |
| 3 | Inventorier extensions et outils de la session hôte dans l'identité d'environnement ; écrire `F-EXTENSIONS` |
| 4 | V5 et `revues/R3-securite.md` : reviewer indépendant, campagne adverse |
| 5 | Politique de purge et comptabilité de croissance — `revues/R6-exploitation.md` |
| 7 | `C-PERF` : mesures p95, dispersion, baseline (`NFR-04`) |
| 10 | Vérifier que le coût rapporté par l'hôte satisfait `AGT-07`, ou rouvrir le catalogue de modèles |
| 2 | `revues/R4-ux-accessibilite.md` : observation humaine, terminal réel, lecteur d'écran |
