# Auto-revue — e25s04, la décision du modèle admis et sa recette

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`3b64971..b30a6d4`, puis la relecture jusqu'à `a888f48`) sous `specs/` ; puis, sur décision du propriétaire, la correction d'un défaut trouvé en relecture : `src/extension/session.ts` et trois tests de `test/v3/model-select.test.ts` (`447df46`, `3a9ef82`, `4591fe8`) ; aucun contrat |
| Conduite le | 2026-09-24 (UTC) |
| Branche | `modele-choisi-admis` |
| Mode | `--gate` |
| Preflight au moment de la revue | vert sous Node 24.21.0 — `npm run build && npm run check`, sortie 0, 452 tests |

La branche écrit d'abord des textes : `D-61`, le statut de `D-53`, la matrice de traçabilité, le relevé
des campagnes, le relevé de vérification, la section de revue de sécurité et le suivi. L'audit porte
donc sur la justesse de ce que ces textes affirment du code et des campagnes.

## Ce que cette revue a corrigé avant son rapport

- **`D-61` affirmait une garantie non vérifiée.** Elle rangeait « l'absence de secret sur une ligne
  de commande » parmi ce qui reste de SEC-05. C'est une phrase de l'exigence, pas un comportement
  relu dans le code pour cette story, et la spécification ne la cite pas. Retirée ; restent la liste
  fermée de l'environnement du worker, relue dans `src/adapters/pi-worker/supervisor.ts` (aucun
  appelant de production ne passe d'`env` supplémentaire), et l'expurgation de l'export.
- **Le relevé mêlait deux périmètres dans une phrase de coût.** 0,0758 $ couvre les deux
  interventions Anthropic, et les 20 appels et 89 229 jetons les trois. La phrase les sépare.

## Le correctif, relu

Chaque texte qui entre dans la file des diagnostics a déjà été montré à l'écran quand il y en a un :
l'annonce d'un modèle hors de la machine (`modelSelected`), les diagnostics du runtime (`announce`,
juste après leur mise en file) et l'échec de la liaison au changement (notifié en erreur). Le
correctif ne retire donc aucun texte de l'écran ; il retire la seconde notice. L'échec du runtime
n'entre pas dans la file : chaque `/495` le redit par `emit`, inchangé. En print, JSON et RPC, `emit`
n'ajoutait aucune notice : leur comportement ne change pas. Dans l'interface texte, le message de la
conversation reste, avec la notice à l'écran : ce sont les deux canaux.

## Affirmations relues contre le code

| Affirmation | Où elle est tenue |
|---|---|
| Seul le bouclage situe un modèle sur la machine ; l'incertitude le situe hors d'elle | `src/domain/policy.ts`, `locateModel` |
| Le modèle est lu au démarrage de chaque intervention | `src/extension/conduct.ts`, `selectedModel` |
| L'annonce nomme le modèle, jamais l'adresse, et se tait pour un modèle local | `src/extension/session.ts`, `modelSelected` |
| Aucune intervention n'est refusée pour sa destination | `src/application/intervention.ts` ; aucune autre lecture de `egress` dans `src/` que le refus du fichier |
| `policy.egress` fait refuser le fichier, avec son motif | `src/extension/config.ts`, `EGRESS_NO_LONGER_READ` ; observé en campagne |
| Les variables remises au worker sont `PATH`, `HOME`, `TMPDIR` | `src/adapters/pi-worker/supervisor.ts` |
| La ligne de coût ne nomme le modèle que si le coût est inconnu | `src/adapters/pi-worker/session-observer.ts`, `readSessionCost` ; observé dans les trois dossiers |
| `set_model` ne persiste pas le choix | `rpc-mode.js` et `agent-session.js`, Pi 0.87.1 ; `settings.json` relu après la campagne |

## Checklist

| Section | Verdict | Motif |
|---|---|---|
| Supply Chain & Security | PASS | Aucune dépendance ajoutée. Les fichiers de la branche, fouillés pour les adresses, les jetons et le chemin personnel du propriétaire : 0 occurrence dans les lignes ajoutées ; une seule, antérieure, dans `specs/security/REVIEW.md` (l'adresse de bouclage du modèle local, citée par la revue de e25s03). |
| Provenance & Metadata | PASS | Le relevé et le relevé de vérification citent les révisions (`698da99`, `3b64971`, `c96a05d`) et `D-60`, `D-61`. |
| Law of Demeter | PASS | Le correctif n'appelle que `this.pi` et `ctx.ui`, comme avant. |
| CONVENTIONS.md Compliance | PASS | Tout est sous `specs/` ; aucun appel `gh`. `specs/archive/TRACEABILITY.md` n'est modifié que sur des lignes existantes, SEC-05 et AGT-02, que `lint:traceability` lit et que la branche rendait fausses ; AGT-07, `[P1]`, n'y est pas ajoutée. Les messages de commit sont en anglais, sur une ligne, sans référence de story. |
| Scope | PASS | Les fichiers touchés sont ceux que la spécification liste (§20), plus les relevés et le suivi. Un seul comportement change, sur décision du propriétaire (spec §18) : dans l'interface texte, un diagnostic en file n'est plus notifié une seconde fois à l'écran quand le premier `/495` le remet. |
| Boy Scout Rule | PASS | La ligne SEC-05 de la matrice décrivait encore la liste et son refus ; elle décrit l'état d'arrivée. |
| Types and Safety | PASS | `record` est typé comme `emit` ; aucun `any`, aucun transtypage ajouté dans le code de production. Les faux contextes des tests sont transtypés comme ceux du fichier. |
| Test Coverage | PASS | Trois tests par l'interface publique (crochets de Pi et commande `/495`) : l'annonce choisie par `/model`, l'annonce à l'ouverture, un diagnostic d'ouverture ordinaire. Rouges tous trois sur le code d'avant le correctif (arbre `a888f48` sous `$HOME`), verts sur la branche. La recette est tenue par trois exécutions réelles, confirmées par le propriétaire, et le correctif par la vraie interface texte. |
| SOLID and Heuristics | PASS | `emit` se sépare en deux responsabilités : `record` pour l'entrée structurée, la notice pour l'écran. Aucun état ajouté. |
| Code Style | PASS | Fonctions courtes, retour anticipé du mode print conservé ; le commentaire de `flushDiagnostics` dit pourquoi l'écran n'est pas prévenu. |

## Laissé, et pourquoi

- **Le pilote des campagnes lit mal `gate.decided`** : son champ n'est pas celui qu'il attend, et la
  ligne s'affiche `gate undefined`. Les portes sont lues dans le compte rendu de `/495 status`, que
  le relevé cite. Le pilote est hors du dépôt, sous `~/.495-campagnes/scripts/`.

## Ce que j'ai failli sauter

J'étais tenté de marquer les sections de code « sans objet » sans relire les textes : une branche
sans code paraît sans risque. La relecture des affirmations contre le code a trouvé la garantie non
vérifiée de `D-61`.
