# Rapport de qualification — machine de référence

Environnement : macOS 27.0 (Darwin), Apple Silicon arm64, Node 24.21.0, Pi 0.85.1
(`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent`), Git 2.55.0, GraalVM JDK 25,
Maven 3.9.9, modèle local `omlx/qwen3.8-27b-oq8e` (endpoint OpenAI-compatible sur 127.0.0.1:8000).

## Suites déterministes (`npm test`)

| Niveau | Fichiers | Contenu | Résultat |
| --- | --- | --- | --- |
| V0 | `test/v0/*` | contrats, noyau du changement, programme, propriétés générées (fast-check, seeds 495/496), modèle et composant de revue, extraction des sorties | passent |
| V1 | `test/v1/*` | sandbox Seatbelt/unconfined/bubblewrap, runner et parsers, superviseur de worker (protocole JSONL, abort, silence, crash), agent scripté | passent |
| V2 | `test/v2/*` | journal SQLite + CAS avec pannes injectées, workspace et candidat, cycles complets par le contrôleur, préparation, export, intégration Git | passent |
| V3 | `test/v3/pi-entries` | `pi -p` et `pi --mode json` réels avec agent scripté : même verdict, `decision_required` sans approbation | passent |

Total au 16 septembre 2026 : 127 tests, 0 échec.

## Campagnes manuelles

| Campagne | Commande | Résultat observé |
| --- | --- | --- |
| Intervention réelle (worker Pi + Seatbelt) | `node scripts/e2e-local-model.ts` | `completed`, sortie structurée valide, 5 appels d'outils, 40 s ; `src/greet.js` et le test modifiés dans le workspace uniquement |
| Cycle complet depuis Pi | `pi -p "/495 start Add a function shout(name)…"` (F-TS, données isolées) | `accepted`, G0…G5 PASS, `unit=PASS lint=PASS`, 1 tentative, ≈ 8 min |
| Seconde stack | `HARNESS495_RUN_JAVA=1 node --test test/v4/java-stack.test.ts` | Maven détecté, Surefire XML lu, qualification `PASS / FAIL / INDETERMINATE` sous Seatbelt |
| Chargement par manifeste | `pi -e <package> -p "/495 status"` après `npm run build` | extension chargée depuis `dist/`, réponse attendue |

Incidents rencontrés et corrigés pendant la qualification : le workspace était placé sous le
répertoire de données interdit en lecture (contrôles `INDETERMINATE`) ; `sandbox-exec` renvoie 71
quand la commande n'existe pas (désormais un incident, pas un `FAIL`) ; un bloc ```js précédant le
bloc ```json faisait échouer l'extraction de la sortie structurée.

## Non couvert sur cette machine

Linux x86-64, mode RPC avec client qualifié, observation humaine du TUI, revues obligatoires,
mesures de performance, programme multi-incréments de bout en bout. Voir `STATUS.md`.
