# Rapport de qualification — machine de référence

Environnement : macOS 27.0 (Darwin), Apple Silicon arm64, Node 24.21.0, Pi 0.85.1
(`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent`), Git 2.55.0, GraalVM JDK 25,
Maven 3.9.9, modèle local `omlx/qwen3.8-27b-oq8e` (endpoint OpenAI-compatible sur 127.0.0.1:8000).

## Suites déterministes (`npm test`)

| Niveau | Fichiers | Contenu | Résultat |
| --- | --- | --- | --- |
| V0 | `test/v0/*` | contrats, noyau du changement, programme, propriétés générées (fast-check, seeds 495/496), modèle et composant de revue, extraction des sorties, lignes introduites par un candidat | passent |
| V1 | `test/v1/*` | sandbox Seatbelt/unconfined/bubblewrap dont le profil `loopback` qui se joint lui-même et aucun autre hôte, runner et parsers dont agrégation Surefire multi-module, couverture différentielle JaCoCo (constat localisé, dette antérieure nommée, mesure absente indéterminée, trois témoins), constats structurels (règles dérivées des POM et de la disposition des paquets, import interdit introduit refusé avec sa localisation, cycle préexistant classé `preexisting`, trois témoins, frontières transmises au producteur) et mutation des classes modifiées (mutant survivant sur une ligne écrite refusé avec opérateur et méthode, survivant sur une classe non touchée sans effet, dette de la classe comptée sans bloquer, budget dépassé indéterminé puis incident à G5, seuil de la cible nommé et non opposé, portée dérivée des déclarations et non lancée sur la référence, trois témoins), capteur qui lit le rapport d'un autre contrôle (ordre dérivé des rapports déclarés, cycle nommé, rapport écrit hors du protocole traité comme présent ; producteur exécuté dans chaque workspace de témoin, de sorte que le témoin négatif propre d'un capteur sans mesure y trouve un rapport à juger), superviseur de worker (protocole JSONL, abort, silence, crash), agent scripté | passent |
| V2 | `test/v2/*` | journal SQLite + CAS avec pannes injectées, workspace et candidat, cycles complets par le contrôleur, préparation dont échelle de capacité de contrôle et périmètre Maven multi-module, export, intégration Git | passent |
| V3 | `test/v3/pi-entries` | `pi -p` et `pi --mode json` réels avec agent scripté : même verdict, `decision_required` sans approbation, diagnostic de démarrage dit à chaque entrée | passent |
| V3 | `test/v3/pi-rpc-sdk` | `pi --mode rpc` réel piloté par un client JSONL, et un hôte SDK chargeant le package par `createAgentSession` : mêmes faits et mêmes verdicts que print et JSON, même empreinte de candidat, même instantané de revue, dialogue de décision par le sous-protocole UI refusé à un client non déclaré, aucun échappement terminal | passent |

Total : 256 tests, 0 échec (V0 103, V1 91, V2 55, V3 7 — et V4 hors suite par défaut). Le compte
fait ici est une transcription : l'autorité est la sortie de `npm test`.

## Contrôles de dépôt (`npm run check`)

| Contrôle | Ce qu'il tient | Résultat |
| --- | --- | --- |
| `check-layers.ts` | sens des dépendances entre couches | `layer rules satisfied` |
| `check-architecture.ts` | chaque composant déclaré au catalogue est revendiqué par un module, aucun cycle d'import, fusions nommées | `16 declared components, all claimed; 68 modules, no import cycle` ; `divergence: src/application/harness.ts carries CMP-APP, CMP-VER` |
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
avant de qualifier le capteur, ce que le cycle ne faisait pas. La section « La même cible le 18
septembre » ci-dessous transcrit la même campagne conduite après que ce constat a été clos.

L'exécution de mutation du témoin négatif sort en 1 après avoir écrit un rapport complet — le seuil
de ratio que la cible fixe sur tout ce qu'elle mute — et le capteur le nomme sans l'opposer au
candidat.

L'instantané de référence porte 3 375 entrées pour 151,6 Mo, non tronqué : `.m2/repository` (2 991
entrées) en fait partie, et c'est ce qui rend les contrôles exécutables réseau coupé : le
`maven.repo.local` déclaré par `.mvn/maven.config` est relatif au répertoire du réacteur, donc au
workspace.

### La même cible le 18 septembre : le rapport lu est déclaré, et le parcours va jusqu'à G5

`ControlDefinition` porte depuis `D-36` ce que chaque contrôle écrit dans le workspace et ce qu'il y
lit sans le produire. `mvn test` déclare `surefire-reports` et `jacoco-report`, le capteur de
couverture déclare lire le second, et la qualification exécute le producteur dans chacun de ses deux
workspaces de témoin avant de l'interroger. La même campagne scriptée, même commande et mêmes
données isolées sous Seatbelt, rend alors ceci en 58 s :

`G0=PASS G1=PASS G2=PASS G3=PASS G4=PASS G5=PASS`, résultat `accepted`, candidat `cand_1dffd1315265`
(`sha256:1dffd13152653a46`), preuves `maven-test=PASS coverage=PASS structure=PASS mutation=PASS`,
une tentative sur trois. L'ordre que le protocole gèle — `maven-test`, `coverage`, `structure`,
`mutation` — se relit de ses déclarations et non du rang des contrôles dans un tableau.

Les quatre capteurs sur leurs trois témoins, réseau coupé :

| Contrôle | Positif | Négatif | Incident | Qualifié |
| --- | --- | --- | --- | --- |
| `maven-test` | PASS, 40 cas, 0 échec, 6 rapports (5 483 ms) | FAIL sur `witness495.NegativeWitness495Test.injectedDefectMustBeDetected`, 15 cas, 1 échec, 4 rapports (2 456 ms) | INDETERMINATE, `spawn error` (6 ms) | oui |
| `coverage` | PASS, 2 rapports, 2 fichiers introduits, 16 lignes introduites, 1 fichier mesurable, 2 lignes mesurées, 0 non couverte (36 ms) | **FAIL**, 2 rapports, 3 fichiers introduits, 23 lignes introduites, 2 fichiers mesurables, 4 lignes mesurées, 2 non couvertes, localisées à `Witness495Uncovered.java:3` (`<init>`) et `:5` (`half`) (36 ms) | INDETERMINATE, `spawn error` (6 ms) | **oui** |
| `structure` | PASS, 3 règles, 20 sources, 13 paquets, 0 violation (35 ms) | FAIL, 1 violation introduite : `domain/src/main/java/witness495/Witness495Boundary.java:3 forbidden import io.scalastic.demo.infrastructure.Witness495Forbidden` (33 ms) | INDETERMINATE, `spawn error` (6 ms) | oui |
| `mutation` | PASS, 2 classes cadrées, 2 mutants, 2 tués (2 400 ms) | FAIL, 4 classes cadrées, 4 mutants, 2 tués, 2 survivants (2 843 ms) | INDETERMINATE, `spawn error` (6 ms) | oui |

Le témoin négatif de `coverage` n'est plus un workspace vide : le producteur y a écrit ses deux
rapports JaCoCo, le capteur y trouve les quatre lignes qu'il sait mesurer, et il refuse les deux que
la suite n'exerce pas. C'est le verdict qu'un témoin négatif doit rendre, et il le rend pour la
raison qu'il revendique, nommée au fichier, à la ligne et au symbole.

Les deux passages de vérification qui suivent, référence puis candidat :

| Contrôle | Référence | Candidat |
| --- | --- | --- |
| `maven-test` | PASS, 38 cas, 5 rapports (5 500 ms) | PASS, 40 cas, 6 rapports (5 510 ms) |
| `coverage` | PASS, 0 rapport : « the candidate introduces no line JaCoCo measures » | PASS, 2 rapports, 2 fichiers introduits, 33 lignes introduites, 1 fichier mesurable, 2 lignes mesurées, 0 non couverte |
| `structure` | PASS, 3 règles, 19 sources, 12 paquets, 0 violation | PASS, 3 règles, 19 sources, 12 paquets, 0 violation |
| `mutation` | PASS, aucune exécution : « the subject introduces no class this sensor mutates » | PASS, 2 classes cadrées, 4 mutants, 2 introduits, 2 tués, 0 survivant (2 665 ms) |

Les douze risques résiduels du rapport restent ceux d'une qualification réussie : l'`INDETERMINATE`
du témoin d'incident de chaque contrôle, le seuil de ratio que la cible fixe sur tout ce que la
mutation touche, et les deux limites du passage de référence. Aucun n'est un verdict sur le candidat.

Ce que cette campagne n'établit pas, comme les deux précédentes : la production de code. Les
interventions y sont rejouées depuis `~/.495-campagnes/scripts/java-agent.json`, sans aucun appel de
modèle. Elle qualifie la chaîne de contrôles sur une cible réelle — détection, diagnostic,
préparation, qualification des capteurs, gel du protocole, vérification comparée à la référence,
acceptation —, jamais le producteur.

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

### Le cycle avec le modèle local sur la cible Maven, une fois le protocole gelable

Quatre lancements le 18 septembre 2026, même commande et même cible, sans `HARNESS495_SCRIPTED_AGENT`
— c'est la production de code que cette campagne éprouve, et elle seule. Les budgets sont relevés
ensemble dans `<données>/config.json` avant le premier : `intervention_ms` 20 → 60 min,
`increment_ms` 120 → 360 min, `max_continuations` 3 → 5.

| Lancement | Verdict | Motif d'arrêt | Durée |
| --- | --- | --- | --- |
| 1 | aucun gate évalué, changement `blocked` en phase `clarifying` | `configuration_error` : `specification intervention completed with an invalid structured output` | 335 s, dont 332 s d'intervention (18 appels d'outils, 104 699 jetons connus) |
| 2 | aucun gate évalué, changement `blocked` en phase `clarifying` | même `configuration_error` | 272 s, dont 268 s d'intervention (16 appels d'outils, 77 498 jetons connus) |
| 3 | aucun gate évalué, changement `decision_required` en phase `clarifying` | `decision_pending` : `IH-01`, `dec_mu6swcar451de6e77c` | 357 s, dont 355 s d'intervention (18 appels d'outils, 94 113 jetons connus) |
| 4 | **`G0…G5 PASS`, résultat `accepted`**, candidat `cand_f882d3b9a516` | aucun : `closed / completed`, une tentative sur trois | 71 min 32 s de bout en bout, dont 20 min 33 s d'attente de la réponse humaine |

Le quatrième n'est pas un lancement de plus : c'est le troisième, repris après que la décision `IH-01`
a été répondue dans le TUI. Le changement `chg_mu6sopkhf9e51f38b0` porte donc les deux, et le dossier
tient d'un seul tenant.

**Les deux premiers lancements meurent sur `chantiers/F`, et pas de la même manière.** Au premier, le
rapport est dans un bloc annoncé `json` dont l'objet racine n'est jamais clos, arrêté à 7 002
caractères ; `extractJsonOutput` ne trouve aucun bloc analysable. Au second, il n'y a aucune clôture
de bloc du tout : le rapport est en prose suivie d'un objet JSON nu, lui aussi arrêté en cours, à
6 910 caractères. Le recours qui lit un objet nu s'ancre sur le **dernier** `{` du texte, qui tombe
alors à l'intérieur du rapport et non à sa racine : ce qui atteint la validation est l'objet
`design` imbriqué, quatre clés au lieu du schéma `specification-report`. Dans les deux cas le texte
refusé est conservé dans `output.raw` et s'exporte. Ce constat appartient à `chantiers/F` ; il n'a
pas été corrigé ici.

**Le troisième valide sa spécification et s'arrête où la conception le prévoit.** Le noyau ouvre
`IH-01` sur une question ouverte matérielle que le modèle a lui-même posée : la limite de 50
caractères s'applique-t-elle à la seule création, ou aussi à la mise à jour du nom, le placement
dans le record `User` valant pour les deux et le placement dans `UserApiService.createUser` pour la
création seule. `required_authority: "requester"`. Le changement attend, sans qu'aucun gate soit
évalué ni aucune tentative consommée.

**La réponse humaine ouvre le reste du parcours.** Répondue dans le TUI par `jeanjerome`
(`origin: tui_session`, `authentication_level: session`) — « La limite s'applique à la création et à
la mise à jour » —, elle est enregistrée sur la révision qu'elle tranchait, et le rapport
d'ingénierie la porte à côté des jugements du noyau : `[humain] jeanjerome: IH-01 answer`. C'est le
premier jugement humain inscrit au dossier d'un cycle réel.

| Étape | Durée | Appels d'outils |
| --- | --- | --- |
| `specify` | 355 s | 18 (3,0/min) |
| `prepare` | 1 948 s | 74 (2,3/min) |
| G2, quatre capteurs sur leurs trois témoins | 32 s | — |
| `implement` | 684 s | 30 (2,6/min) |
| vérification, référence puis candidat | 15 s | — |

**La préparation est ce qui coûte, et ce qui rend le reste opposable.** Les quatre exigences sont
`undiscriminated` au niveau `file_present` : G2 refuse de laisser une suite verte tenir lieu de
preuve et commande d'abord les tests qui discriminent. L'intervention en écrit quatre, sur les deux
modules, dont un scénario Cucumber et ses pas :
`domain/src/test/.../UserTest.java`, `domain/src/test/.../UserApiServiceTest.java`,
`infrastructure/src/test/.../UserFriendManagementSteps.java` et son
`.../UserFriendManagement.feature`. Le noyau les juge sur la référence nue — `on_reference: FAIL`,
`discriminant: true`, `loadable: true` — et les adopte comme oracle protégé. Le diagnostic de
capacité passe de `file_present` à `discriminating`, sans exigence non discriminée, 38 cas découverts
et 38 exécutés.

**G2 gèle le protocole en 32 s, et c'est là que le capteur à rapport se qualifie pour la première
fois dans un cycle conduit par un modèle.** L'ordre gelé — `maven-test`, `coverage`, `structure`,
`mutation` — se lit des déclarations : `maven-test` écrit `surefire-reports` et `jacoco-report`,
`coverage` déclare lire le second et n'écrit rien. Les quatre capteurs rendent
`PASS / FAIL / INDETERMINATE` sur leurs trois témoins, le témoin négatif de `coverage` compris.

**Le candidat ne touche que ce qu'il doit.** `cand_f882d3b9a516` porte cinq chemins : le fichier de
production `domain/src/main/java/.../user/domain/User.java` et les quatre tests préparés. La règle
est dans le constructeur compact du record — donc création et mise à jour, ce que la décision
humaine avait tranché —, sous la forme d'une constante `MAX_NAME_LENGTH = 50` et d'un `throw
ValidationException` qui reprend le mécanisme déjà utilisé par la validation de nom existante.

| Contrôle | Référence | Candidat |
| --- | --- | --- |
| `maven-test` | PASS, 38 cas, 5 rapports (5 592 ms) | PASS, 46 cas, 0 échec, 5 rapports (4 999 ms) |
| `coverage` | PASS, 0 rapport : « the candidate introduces no line JaCoCo measures » | PASS, 2 rapports, 5 fichiers introduits, 121 lignes introduites, 1 fichier mesurable, 2 lignes mesurées, 0 non couverte |
| `structure` | PASS, 3 règles, 19 sources, 12 paquets, 0 violation | PASS, 3 règles, 19 sources, 12 paquets, 0 violation |
| `mutation` | PASS, aucune exécution : « the subject introduces no class this sensor mutates » | PASS, 2 classes cadrées, 4 mutants, 2 introduits, 2 tués, 0 survivant |

Les deux lignes que le candidat ajoute sont donc exercées **et** leurs mutants tués. C'est ce que
l'échelle du contrôle de l'introduit cherche à obtenir : un G5 qui dit quelque chose, plutôt qu'un
vert obtenu par absence de mesure.

**Ce que les budgets ont réellement fait.** Un seul des trois relèvements porte : `prepare` dure
32,5 min, donc sous l'ancien plafond de 20 min il aurait été coupé vers le 46ᵉ appel d'outil et repris
en continuation. Les deux autres ne sont pas exercés — la durée d'intervention cumulée est de 49,8
min, sous l'ancien `increment_ms` de 120 min, et aucune intervention n'est `truncated`, donc
`max_continuations` ne sert pas. Le rythme observé est de 2,3 à 3,0 appels d'outils par minute selon
le rôle, et ce que le modèle dépense se compte autant en jetons — 77 000 à 105 000 pour un seul
rapport de spécification — qu'en minutes.

**Ce que ce coût annonce pour une demande moins simple.** La demande ici est minimale : deux lignes
de production dans un constructeur compact, une constante et un `throw`. Elle coûte pourtant 51 min
de machine et 122 appels d'outils. Le budget qui va céder en premier n'est aucun des trois relevés,
c'est celui qui ne l'a pas été : `tool_calls_per_intervention`, laissé à 100, dont la préparation a
déjà consommé **74 sur la demande la plus simple qui soit**. À 2,3 appels par minute, une préparation
qui atteint le plafond de 100 est coupée vers 43 min — avant le plafond de durée de 60 min, qui
cesse donc d'être la contrainte active. Ce qui suit se déduit : une demande portant sur plusieurs
exigences ou plusieurs modules fait tronquer la préparation, la reprise consomme une continuation,
et c'est là que `max_continuations` et `increment_ms` commencent à compter — cinq continuations de
43 min approchent les 360 min du plafond d'incrément pour la seule préparation. Ces trois budgets
n'ont pas été éprouvés par cette campagne ; ils ont seulement été mis hors du chemin d'une demande
qui ne les atteignait pas.

Ce que cette campagne établit : sur une cible Maven réelle, avec un modèle local et sous Seatbelt, le
parcours va de la demande à l'acceptation en produisant du code — les tests qui discriminent, puis
l'implémentation qu'ils jugent — et la seule intervention humaine est celle que la conception prévoit,
sur une question que le modèle a posée. Ce qu'elle n'établit pas : la reproductibilité, puisque deux
lancements sur quatre sont morts avant tout gate sur `chantiers/F` ; ni le passage à l'échelle, la
demande éprouvée étant la plus petite possible.

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
