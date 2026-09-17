# Rapport de qualification — machine de référence

Environnement : macOS 27.0 (Darwin), Apple Silicon arm64, Node 24.21.0, Pi 0.85.1
(`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent`), Git 2.55.0, GraalVM JDK 25,
Maven 3.9.9, modèle local `omlx/qwen3.8-27b-oq8e` (endpoint OpenAI-compatible sur 127.0.0.1:8000).

## Suites déterministes (`npm test`)

| Niveau | Fichiers | Contenu | Résultat |
| --- | --- | --- | --- |
| V0 | `test/v0/*` | contrats, noyau du changement, programme, propriétés générées (fast-check, seeds 495/496), modèle et composant de revue, extraction des sorties, lignes introduites par un candidat | passent |
| V1 | `test/v1/*` | sandbox Seatbelt/unconfined/bubblewrap dont le profil `loopback` qui se joint lui-même et aucun autre hôte, runner et parsers dont agrégation Surefire multi-module, couverture différentielle JaCoCo (constat localisé, dette antérieure nommée, mesure absente indéterminée, trois témoins), constats structurels (règles dérivées des POM et de la disposition des paquets, import interdit introduit refusé avec sa localisation, cycle préexistant classé `preexisting`, trois témoins, frontières transmises au producteur) et mutation des classes modifiées (mutant survivant sur une ligne écrite refusé avec opérateur et méthode, survivant sur une classe non touchée sans effet, dette de la classe comptée sans bloquer, budget dépassé indéterminé puis incident à G5, seuil de la cible nommé et non opposé, portée dérivée des déclarations et non lancée sur la référence, trois témoins), superviseur de worker (protocole JSONL, abort, silence, crash), agent scripté | passent |
| V2 | `test/v2/*` | journal SQLite + CAS avec pannes injectées, workspace et candidat, cycles complets par le contrôleur, préparation dont échelle de capacité de contrôle et périmètre Maven multi-module, export, intégration Git | passent |
| V3 | `test/v3/pi-entries` | `pi -p` et `pi --mode json` réels avec agent scripté : même verdict, `decision_required` sans approbation, diagnostic de démarrage dit à chaque entrée | passent |
| V3 | `test/v3/pi-rpc-sdk` | `pi --mode rpc` réel piloté par un client JSONL, et un hôte SDK chargeant le package par `createAgentSession` : mêmes faits et mêmes verdicts que print et JSON, même empreinte de candidat, même instantané de revue, dialogue de décision par le sous-protocole UI refusé à un client non déclaré, aucun échappement terminal | passent |

Total : 252 tests, 0 échec (V0 101, V1 89, V2 55, V3 7 — et V4 hors suite par défaut). Le compte
fait ici est une transcription : l'autorité est la sortie de `npm test`.

## Contrôles de dépôt (`npm run check`)

| Contrôle | Ce qu'il tient | Résultat |
| --- | --- | --- |
| `check-layers.ts` | sens des dépendances entre couches | `layer rules satisfied` |
| `check-architecture.ts` | chaque composant déclaré au catalogue est revendiqué par un module, aucun cycle d'import, fusions nommées | `16 declared components, all claimed; 67 modules, no import cycle` ; `divergence: src/application/harness.ts carries CMP-APP, CMP-VER` |
| `check-traceability.ts` | chaque exigence `[P0]` de l'amont possède une ligne de matrice | `85 functional + 8 non-functional [P0] requirements, all present in the matrix` |
| `check-distribution.ts` | `dist/` reproduit les sources, schémas JSON identiques aux contrats, attribution des dépendances redistribuées, licences de l'arbre installé | `0 dependencies redistributed, 4 provided by the host (MIT), 263 packages installed under 0BSD, Apache-2.0, BSD-3-Clause, BlueOak-1.0.0, ISC, MIT, Unlicense` |

## Campagnes manuelles

| Campagne | Commande | Résultat observé |
| --- | --- | --- |
| Intervention réelle (worker Pi + Seatbelt) | `node scripts/e2e-local-model.ts` | `completed`, sortie structurée valide, 5 appels d'outils, 40 s ; `src/greet.js` et le test modifiés dans le workspace uniquement |
| Cycle complet depuis Pi | `pi -p "/495 start Add a function shout(name)…"` (F-TS, données isolées) | `accepted`, G0…G5 PASS, `unit=PASS lint=PASS`, 1 tentative, ≈ 8 min |
| Seconde stack | `HARNESS495_RUN_JAVA=1 node --test test/v4/java-stack.test.ts` | Maven détecté, Surefire XML lu, qualification `PASS / FAIL / INDETERMINATE` sous Seatbelt ; le contrôle de couverture qualifié sur ses propres témoins et le rapport JaCoCo réel, constat bloquant localisé au fichier et à la ligne |
| Mutation réelle sur les classes modifiées | même commande, second scénario du fichier | PITest lancé hors ligne sous Seatbelt avec un profil `loopback`, scopé aux deux classes témoins ; qualification `PASS / FAIL / INDETERMINATE` ; les quatre mutants de la classe assertie tués, ceux de la classe appelée sans assertion survivants et localisés au fichier, à la ligne et à la méthode ; aucun mutant hors portée ; ≈ 8 s |
| Chargement par manifeste | `pi -e <package> -p "/495 status"` après `npm run build` | extension chargée depuis `dist/`, réponse attendue |
| Architecture opposable sur une cible réelle | contrôle `structure` du protocole gelé, exécuté sur `~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture` et sur des copies modifiées | trois règles dérivées des POM et de la disposition des paquets ; référence `PASS`, 19 sources, 12 paquets, aucune violation ; un import de `io.scalastic.demo.infrastructure` ajouté dans `domain` rend `FAIL` avec le fichier et la ligne, classé `new`, bloquant ; un cycle préexistant entre quatre paquets de `domain` laisse le contrôle `PASS` et apparaît en `preexisting`, non bloquant |
| Capacité de contrôle d'une cible réelle | `node scripts/diagnose-capability.ts ~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture` | Maven multi-module, 5 classes de test reconnues, niveau `file_present` ; préparation ouverte pour un ajout de comportement, non ouverte pour un comportement conservé |
| Refus fail closed sur Linux | conteneur `node:24-bookworm-slim` `linux/amd64`, noyau linuxkit 7.0.12, `bubblewrap 0.8.0` : `test/v1/sandbox.test.ts` puis `pi --mode json -p "/495 start …"` sans `HARNESS495_ALLOW_UNCONFINED` | `bwrap` ne crée pas d'espace de noms sous le profil de conteneur par défaut (`Operation not permitted`) et n'y parvient qu'en `--privileged` ; la qualification du backend échoue, la vue porte `sandbox:bubblewrap:not-qualified`, et le changement s'arrête en `capability_missing`. Avant correction, l'échec de `bwrap` ressortait en `FAIL` du contrôle de la cible (« the runner exited with 1 without emitting a TAP summary ») ; il est désormais `INDETERMINATE` avec `spawn error: bwrap: Creating new namespace failed` |

Incidents rencontrés et corrigés pendant la qualification : le workspace était placé sous le
répertoire de données interdit en lecture (contrôles `INDETERMINATE`) ; `sandbox-exec` renvoie 71
quand la commande n'existe pas (désormais un incident, pas un `FAIL`) ; un bloc ```js précédant le
bloc ```json faisait échouer l'extraction de la sortie structurée.

## Revues obligatoires

Trois des six revues de `amont/conception-verification.md` §11 ont été conduites le 17 septembre
2026 sur la révision `bd7c5be5` : architecture, licences et distribution, exploitation. Leurs
constats sont dans `revues/`. Les trois autres — sécurité, UX et accessibilité, fonctionnelle —
possèdent leur dossier et attendent une autorité ou un environnement absents de cette machine.

## Non couvert sur cette machine

Observation humaine du TUI, revue de sécurité indépendante et campagne adverse V5, revue
fonctionnelle par le responsable produit, mesures de performance (`C-PERF`), programme
multi-incréments de bout en bout, inventaire des extensions de la session hôte (`F-EXTENSIONS`).
Voir `STATUS.md` et `RISQUES-L0.md`.

Linux x86-64 n'y figure plus : la plateforme n'est pas revendiquée (`D-31`), ce qui est une décision
et non une couverture manquante. Ce qui la revendiquerait est nommé dans `MILESTONES.md` §3.
