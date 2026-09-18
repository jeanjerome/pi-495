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

## Campagnes depuis Pi sur les cibles de `~/Projets/495-workspace/cibles/`

Trois campagnes conduites le 17 septembre 2026 depuis l'entrée Pi, `pi -ne --mode json --no-session
-e src/extension/index.ts "/495 …"` lancé dans le répertoire de la cible, données isolées sous
`~/.495-campagnes/`, jamais `HARNESS495_ALLOW_UNCONFINED` : les trois portent
`sandbox:seatbelt:qualified`. Seules deux cibles du répertoire sont adressables par la détection de
`application/target.ts` — `greeter` (shell) et `python-demo` rendent `capability_missing`, aucun
adaptateur ne reconnaissant leur pile.

| Campagne | Agent | Verdict | Motif d'arrêt | Durée |
| --- | --- | --- | --- | --- |
| `node-demo` | modèle local `omlx/qwen3.8-27b-oq8e` | aucun gate évalué, changement `blocked` en phase `clarifying` | `configuration_error` : `specification intervention completed with an invalid structured output` | 261 s, dont 260 s d'intervention |
| `node-demo` | agent scripté | G0 PASS, G1 PASS, **G2 FAIL** | `capability_missing` : `control unit: positive witness gave FAIL, expected PASS` | 3 s |
| `simple-demo-hexagonal-architecture` | agent scripté | G0 PASS, G1 PASS, **G2 FAIL** | `capability_missing` : `control coverage: negative witness gave INDETERMINATE, expected FAIL` | 30 s |

Les deux campagnes sous agent scripté n'appellent aucun modèle : les interventions sont rejouées
depuis un fichier JSON. Elles ne qualifient donc pas la production de code, seulement la chaîne qui
l'encadre — détection de pile, diagnostic de capacité, préparation, qualification des capteurs,
G0 à G2 — sur une cible réelle.

### `node-demo` avec le modèle local : l'intervention de spécification n'est pas exploitable

L'intervention `specify` se termine d'elle-même après 259,5 s, 4 appels d'outils et 38 659 jetons
connus — événement terminal `completed`, `output_valid: false` — mais sa sortie structurée ne valide
pas le schéma `specification-report`. Le noyau lève `CONFIGURATION_ERROR`, le changement est bloqué en
phase `clarifying`, aucun gate n'est évalué et aucune tentative n'est consommée.

Le texte refusé est conservé au dossier : la trace de l'intervention porte `output.raw`, et l'export
la rend adressable dans le CAS. La cause s'y lit : le rapport de 7 314 caractères finit par un bloc
de code annoncé `json`, écrit sur une seule ligne de 4 770 caractères et tronqué d'une accolade
fermante, dont l'objet racine n'est jamais clos. `extractJsonOutput` ne trouve donc aucun bloc
analysable, et rien ne récupère un rapport par ailleurs complet — objectif, faits, quatre exigences
avec leurs critères et une conception exécutable.

`/495 resume` rend en 1 s le même état, à la même révision : `resume` ne lève le blocage que pour
`execution_error`, et l'erreur est classée `configuration_error` alors que le noyau la déclare
réessayable et nomme `retry_specification` comme action suivante. Aucune entrée Pi n'expose cette
action : le changement reste bloqué. Son dossier s'exporte et se vérifie tout de même
(`42 files, 370 991 bytes, 0 redactions, verify: ok`). Ce que cette campagne ouvre est dans
`chantiers/F`.

### `node-demo` avec l'agent scripté : le contrôle `unit` ne passe pas sur la référence

Le parcours va plus loin : G0 PASS, G1 PASS, une préparation ouverte sur l'absence de discrimination,
un test écrit sous `tests/`, jugé `FAIL (discriminant)` sur la référence nue, puis la qualification du
seul contrôle détecté.

| Témoin | Verdict | Faits |
| --- | --- | --- |
| positif | FAIL | `exit_code=1`, 3 cas, 1 passant, 2 échouants : `tests/agenda.test.ts`, `tests/slot.test.ts` (107 ms) |
| négatif | FAIL | 4 cas, 1 passant, 3 échouants, dont le défaut injecté |
| incident | INDETERMINATE | `spawn error: sandbox-exec: execvp() of '/nonexistent/495-broken-runner' failed` |

Le capteur détecte bien le défaut qu'il revendique, mais il ne passe pas sur la référence, et G2
refuse de geler un protocole sur un contrôle non qualifié. Deux causes indépendantes se cumulent, et
la sortie conservée les nomme :

- l'adaptateur node déclare `unit` comme `node --test --test-reporter=tap` et ne lit jamais
  `scripts.test` ; la cible est en vitest, et ses deux fichiers de test importent `vitest` ;
- le texte TAP conservé dit `ERR_MODULE_NOT_FOUND ... node_modules/vitest/dist/index.js`. Les
  exclusions de workspace sont appariées segment par segment : un motif d'un seul segment terminé par
  `/`, comme `dist/`, exclut ce nom à n'importe quelle profondeur. La copie de travail perd donc le
  `dist/` de chaque dépendance, et un import nu vers un paquet dont l'entrée y réside n'y résout
  plus.

L'instantané de référence de cette cible porte 788 entrées pour 22,2 Mo, dont 761 sous
`node_modules/` — qui n'est pas exclu — et trois fichiers dépassent la taille digestible : la revue
les rend en `unknown` et l'instantané est marqué tronqué. Les deux causes de l'arrêt et la sémantique
des exclusions sont reprises dans `chantiers/E`.

### `simple-demo-hexagonal-architecture` avec l'agent scripté : trois capteurs sur quatre se qualifient

La détection rend quatre contrôles sur ce réacteur multi-module, sans capacité manquante :
`maven-test`, `coverage` (JaCoCo lie `report` hors profil), `structure` (trois règles dérivées des POM
et de la disposition des paquets) et `mutation` (PITest déclaré hors profil, rapport XML, chemin
stable). La préparation est ouverte, le test JUnit écrit sous `domain/src/test/` est `FAIL
(discriminant)` sur la référence nue, puis les quatre capteurs sont éprouvés sur leurs témoins, tout
réseau coupé et sous Seatbelt :

| Contrôle | Positif | Négatif | Incident | Qualifié |
| --- | --- | --- | --- | --- |
| `maven-test` | PASS, 40 cas, 0 échec, 6 rapports (5 482 ms) | FAIL sur `witness495.NegativeWitness495Test.injectedDefectMustBeDetected`, 15 cas, 1 échec (2 436 ms) | INDETERMINATE, `spawn error` (6 ms) | oui |
| `coverage` | PASS, 2 rapports, 16 lignes introduites, 1 fichier mesurable, 2 lignes mesurées, 0 non couverte (33 ms) | **INDETERMINATE**, 0 rapport : `no JaCoCo report found at the declared report path, for 2 introduced source file(s)` | INDETERMINATE, `spawn error` | **non** |
| `structure` | PASS, 3 règles, 20 sources, 13 paquets, 0 violation | FAIL, 1 violation introduite : `domain/src/main/java/witness495/Witness495Boundary.java:3 forbidden import io.scalastic.demo.infrastructure.Witness495Forbidden` | INDETERMINATE, `spawn error` | oui |
| `mutation` | PASS, 2 classes cadrées, 2 mutants, 2 tués (2 380 ms) | FAIL, 4 mutants dont 2 survivants localisés à `Witness495Unasserted.java:5` avec leur opérateur (2 859 ms) | INDETERMINATE, `spawn error` | oui |

Le capteur de couverture ne lit aucune mesure de son cru : il lit le rapport que `mvn test` laisse
dans le workspace. Son témoin négatif reçoit un workspace neuf où ce contrôle producteur n'est jamais
exécuté, donc aucun rapport ; la mesure absente est rendue `INDETERMINATE`, ce qui est le bon verdict
pour une mesure qui manque, mais un témoin négatif doit rendre `FAIL`. La qualification échoue, G2
refuse, et le parcours s'arrête avant G3 sur toute cible Maven qui lie JaCoCo hors profil. La
campagne V4 ne le voyait pas : elle exécute le contrôle producteur dans chaque workspace de témoin
avant de qualifier le capteur, ce que le cycle ne fait pas.

L'exécution de mutation du témoin négatif sort en 1 après avoir écrit un rapport complet — le seuil
de ratio que la cible fixe sur tout ce qu'elle mute — et le capteur le nomme sans l'opposer au
candidat.

L'instantané de référence porte 3 375 entrées pour 151,6 Mo, non tronqué : `.m2/repository` (2 991
entrées) en fait partie, et c'est ce qui rend les contrôles exécutables réseau coupé : le
`maven.repo.local` déclaré par `.mvn/maven.config` est relatif au répertoire du réacteur, donc au
workspace.

### Ce que les trois campagnes disent des commandes et du cycle réel

`/495 status`, `/495 review`, `/495 report` et `/495 export` répondent sur un changement arrêté :
le rapport sépare les douze observations mécaniques des trois jugements de gate et des risques
résiduels, en nommant chaque capteur non qualifié et chaque `INDETERMINATE` dont rien n'est conclu ;
l'export d'un changement bloqué est produit et se vérifie (`85 files, 1 611 309 bytes, 0 redactions,
verify: ok` sur la cible Maven ; `56 files, 415 400 bytes` sur `node-demo`). `/495 verify` refuse avec
`INVALID_TRANSITION: operation verification.rerun is not allowed in phase verification_design`, ce
qui est la bonne réponse en l'absence de candidat. La liaison se retrouve par le répertoire courant :
les commandes suivantes sont lancées dans une session Pi neuve, sans session enregistrée.

### Un candidat à regarder : cycle complet sur une cible de démonstration

Aucune des deux cibles réelles n'atteint un candidat, donc la surface de revue n'a rien à montrer
sur elles. Une cible de démonstration a été construite hors du dépôt pour lever cet obstacle
d'observation : un projet Node minimal — `greet(name)`, sa suite `node:test`, un lint qui refuse
`var` dans tout fichier de `src/` — sur lequel le même parcours est conduit avec un agent scripté.

Résultat, en 2 s : `G0=PASS G1=PASS G2=PASS G3=PASS G4=PASS G5=PASS`, résultat `accepted`, candidat
`cand_d1e8fa465e17`, preuves `unit=PASS lint=PASS`, une tentative sur trois. Le parcours traverse
donc les neuf étapes, préparation comprise : les deux capteurs se qualifient sur leurs trois témoins,
le test préparé échoue sur la référence nue puis est adopté, le candidat est gelé sans altérer de
chemin protégé — le fichier de test préparé est le seul ajout sous `test/`, et il est reconnu comme
tel —, les contrôles s'exécutent sur la référence puis sur le candidat, et G5 accepte. La revue porte
`1786aef50b → cand_d1e8fa465e17`, instantané frais et complet : un fichier modifié, trois ajoutés,
quatre intacts, sans limite.

Ce que cela n'établit pas : la production de code, encore une fois rejouée depuis un fichier. Ce que
cela établit : la chaîne au-delà de G2 — conception, gel du candidat, vérification comparée à la
référence, acceptation — fonctionne depuis l'entrée Pi dès que l'adaptateur atteint la cible. Les
deux arrêts ci-dessus sont donc bien des constats sur la détection et sur la qualification d'un
capteur, pas sur le cycle.

### Un second candidat : les cas particuliers d'un arbre

Une seconde cible de démonstration porte ce qu'une revue ne doit pas travestir : un binaire à octets
nuls, un exécutable, un lien symbolique qui sort de l'arbre, un lien vers un répertoire, un
sous-module Git, un fichier de 3 Mo — au-dessus du budget de lecture de 2 Mo, sous la limite
d'inventaire de 8 Mo —, un fichier dont le **nom** porte une séquence d'échappement terminal, et un
fichier dont le **contenu** en porte, avec cloche et retour chariot.

Le même parcours avec un agent scripté : `G0` à `G5` en PASS, résultat `accepted`, candidat
`cand_8d3b02d87121`, `unit=PASS lint=PASS`, 6 appels d'outils, 2 s. L'instantané de revue est frais
et complet, sans limite : 11 intacts, 3 ajoutés, 3 modifiés, 1 supprimé. Ce que le modèle de revue
rend pour chacun, mesuré :

| Chemin | Statut | Page |
| --- | --- | --- |
| `src/greet.js` | modifié | `text`, un bloc OLD/NEW réel |
| `bin/data.bin` | modifié | `binary`, aucun bloc, « no textual comparison for binary content » |
| `docs/hostile-content.txt` | modifié | `text` ; la surface TUI passe chaque ligne par `neutralize`, donc échappement, cloche et retour chariot sont rendus inertes sans altérer les octets conservés |
| `escape-link` | supprimé | `symlink`, aucun bloc, « no textual comparison for symlink content » |
| `src-link` | intact | `symlink`, cible `src` |
| `assets/large.txt` | intact | `too_large`, 3 145 688 octets, aucune ligne lue |
| `vendor/sub-lib/.git` | intact | `text`, une ligne : `gitdir: ../../.git/modules/vendor/sub-lib` |

Deux cas de `UX-10` ne sont pas portés par l'inventaire, et la mesure le montre.

Le **sous-module** n'existe pas comme tel : `ENTRY_KINDS` déclare `submodule` et le modèle de revue
le projette en `special`, mais `walkTree` ne produit jamais ce genre. Un sous-module est inventorié
comme un répertoire ordinaire, et son fichier `.git` — que le marcheur n'écarte qu'à la racine — est
lu comme du contenu de projet. La frontière du sous-module est donc invisible au dossier.

Le **fichier spécial** disparaît de la copie. Mesuré sur un arbre d'essai portant un tube nommé :
`walkTree` l'inventorie en `special` avec la note « special file: not read », mais `createWorkspace`
ne recopie que les fichiers et les liens. Le tube n'existe donc pas dans le workspace, et
`snapshotCandidate` rend `deleted special pipe.fifo` en le plaçant dans `selected_paths` : le
candidat déclare une suppression que personne n'a faite.

Un troisième fait, observé en préparant ces deux candidats : le workspace du candidat n'est supprimé
par aucun chemin. Les workspaces de clarification, de préparation et de témoins le sont dans un
`finally` ; celui de chaque tentative survit à la clôture du changement, et c'est lui que la revue lit
du côté candidat — `readSide` rend `missing: workspace no longer available` s'il manque. La rétention
est donc porteuse de la relisibilité, en même temps qu'elle est une ressource que rien ne réclame :
116 Ko ici, mais 151 Mo par tentative sur la cible Maven.

Ces trois faits sont portés par `chantiers/H`. Ce que l'observation de la surface a ouvert sur les
primitives que l'hôte rend déjà — mesure d'une ligne stylée, composants de liste et de défilement —
est porté par `chantiers/I`.

### Ce que la même campagne rend dans un vrai terminal

Le changement arrêté de la cible Maven a été relu dans le TUI Pi, à environ 205 colonnes :
`/495 status`, `/495 report`, `/495 resume`. Rien n'est tronqué — les trois identifiants de preuve,
le chemin du rapport JaCoCo manquant et les deux motifs de G2 se lisent intégralement, enveloppés à
la largeur du terminal ; le pied de page porte `495 verification_design/blocked` dès l'ouverture,
avant toute commande, la liaison étant retrouvée par le répertoire courant ; aucun diagnostic de
démarrage n'est annoncé, ce qui est correct sous un backend qualifié. Trois écarts de lisibilité en
sont sortis, enregistrés comme constats dans `revues/R4-ux-accessibilite.md` et repris dans
`chantiers/G` : le motif d'arrêt rendu trois fois, dont une sous le titre « prochaine action » qui ne
dit alors aucune action ; la notification de commande qui reprend la première ligne du message, soit
le titre du programme ; et huit des douze risques résiduels du rapport qui sont les traces d'une
qualification réussie — l'`INDETERMINATE` du témoin d'incident de chaque contrôle et sa note de
binaire absent — portés sur le sujet `fixture` et non sur le candidat.

La surface de revue elle-même a été ouverte sur le candidat de la seconde cible de démonstration.
Ce que `UX-07` demande tient à l'écran — en-tête, borne de modification, bloc `NOUVEAU`, code sans
préfixe de diff, sans marqueur de hunk et sans numéro de ligne —, et un défaut de rendu en est
sorti : les deux panneaux n'étaient pas alignés. `fit` comptait les points de code de la chaîne déjà
stylée, or chaque couleur ajoute dix caractères invisibles ; mesuré à 120 colonnes, les lignes
stylées en occupaient 110, les lignes vides 120, et le séparateur apparaissait aux colonnes 37 et 47.
Aucun test de composant ne pouvait le voir : le thème utilisé par les tests n'émet aucune séquence,
si bien que la largeur y était juste par construction. Le constat est clos par un contrôle — `fit`
mesure désormais le texte visible, la mesure de l'hôte (`truncateToWidth` de `pi-tui`) est injectée
par `SurfaceOptions.fit`, et `v0/review-surface` éprouve l'invariant sous un thème qui émet de vraies
séquences ; après correction, les 24 lignes rendues occupent 120 colonnes et le séparateur tient une
seule colonne. Voir `D-35` et `revues/R4-ux-accessibilite.md`.

Cette observation ne conduit pas la revue UX et accessibilité : l'observateur est l'auteur, la
largeur est unique et au-dessus du seuil du mode étroit, et aucun lecteur d'écran n'a servi.

Le cycle avec le modèle n'a pas été relancé sur la cible Maven avec des budgets relevés. Le parcours
s'y arrête à G2, avant toute intervention de production : les deux seules interventions qui
précèdent sont `specify` et `prepare`, et relever `increment_ms`, `intervention_ms` ou
`max_continuations` ne déplace pas ce mur. Ce qui l'ouvrirait est dans `chantiers/D`.

## Revues obligatoires

Trois des six revues de `amont/conception-verification.md` §11 ont été conduites le 17 septembre
2026 sur la révision `bd7c5be5` : architecture, licences et distribution, exploitation. Leurs
constats sont dans `revues/`. Les trois autres — sécurité, UX et accessibilité, fonctionnelle —
possèdent leur dossier et attendent une autorité ou un environnement absents de cette machine. `R4`
porte en plus une observation partielle dans un vrai terminal, avec trois constats, ce qui ne la
conduit pas : l'observateur est l'auteur.

## Non couvert sur cette machine

Observation humaine du TUI par quelqu'un d'autre que l'auteur, et dans le mode étroit — trois
commandes de lecture ont été relues dans un vrai terminal, rien de plus. Revue de sécurité
indépendante et campagne adverse V5, revue
fonctionnelle par le responsable produit, mesures de performance (`C-PERF`), programme
multi-incréments de bout en bout, inventaire des extensions de la session hôte (`F-EXTENSIONS`).
Cycle complet sur une cible réelle : le parcours s'arrête à G2 sur les deux cibles qu'un adaptateur
reconnaît, pour deux raisons distinctes établies ci-dessus ; le seul cycle mené de la demande à
l'acceptation l'a été sur la fixture F-TS. Voir `STATUS.md` et `RISQUES-L0.md`.

Linux x86-64 n'y figure plus : la plateforme n'est pas revendiquée (`D-31`), ce qui est une décision
et non une couverture manquante. Ce qui la revendiquerait est nommé dans `MILESTONES.md` §3.
