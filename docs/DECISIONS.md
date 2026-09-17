# Décisions prises seul pendant l'implémentation de P0

Chaque entrée indique la décision, le motif et la conséquence. Les ADR amont (ADR-001 à ADR-018 de
la conception technique) sont considérées acceptées telles quelles ; ce fichier ne consigne que ce
qui a été tranché en plus, ou précisé, pendant la réalisation.

## D-01 — Node 24 et `node:sqlite` comme moteur de stockage

**Décision.** Le journal SQLite utilise le module intégré `node:sqlite` (`DatabaseSync`) au lieu
d'un binding natif tiers (`better-sqlite3`, `sqlite3`).
**Motif.** Pi 0.85.1 est exécuté par Node (shebang `#!/usr/bin/env node`, Node 24.21 sur la machine
de référence). Un binding natif imposerait une compilation à l'installation du package et une
matrice binaire par plateforme ; `node:sqlite` est livré avec le runtime déjà qualifié avec Pi.
**Conséquence.** `engines.node >= 24`. Une distribution Pi exécutée par Bun (binaire compilé) n'est
pas un profil qualifié ; le package le détecte au chargement et annonce `capability_missing`.

## D-02 — Tests avec `node:test` et exécution directe des `.ts`

**Décision.** Les tests utilisent le runner intégré `node --test` et s'exécutent directement sur les
sources TypeScript (type stripping natif de Node 24). `tsc` sert au typage strict et à la
construction de `dist/`. `fast-check` est utilisé pour les tests de propriétés.
**Motif.** Aucune dépendance de test à qualifier ni à distribuer ; la contrainte
`erasableSyntaxOnly` interdit `enum`, `namespace` et les propriétés de paramètres, ce qui garde
le code compatible avec jiti (chargeur de Pi) et avec le type stripping.
**Conséquence.** Les imports relatifs portent l'extension `.ts` ; `rewriteRelativeImportExtensions`
produit des `.js` dans `dist/`.

## D-03 — Répertoire de données

**Décision.** Le stockage normatif vit dans `$HARNESS495_DATA_DIR` si défini, sinon `~/.495` sur
toutes les plateformes. Les anciens emplacements par défaut (`~/Library/Application Support/495`,
`${XDG_DATA_HOME:-~/.local/share}/495`, `%LOCALAPPDATA%/495`) restent résolus en lecture pour qu'un
changement commencé avant le déplacement reste reprenable ; rien n'y est plus écrit.
**Motif.** La conception exige un stockage hors du projet cible et résolu par un adaptateur de
plateforme ; la variable d'environnement permet les tests et les installations partagées. Pi
n'offre pas d'emplacement pour l'état propre d'une extension : `~/.pi/agent/` est sa configuration,
qu'il sauvegarde et migre, et y déposer un ledger en ferait un mauvais voisin.
**Conséquence.** Le chemin n'est jamais transmis aux workers (AT-04). Le répertoire étant sans
espace, les workspaces redeviennent colocalisés (`~/.495/workspaces`) au lieu d'être déportés pour
échapper à un chemin espacé.

## D-04 — Backends d'isolation

**Décision.** Deux backends sont implémentés derrière `SandboxPort` : `seatbelt` (macOS,
`/usr/bin/sandbox-exec` avec un profil généré par mandat) et `bubblewrap` (Linux, `bwrap`).
Un troisième backend `unconfined` existe uniquement pour les tests V0–V2 et doit être demandé
explicitement par la politique (`isolation.allow_unconfined = true`) ; il déclare
`SEC-02`/`SEC-03` comme non satisfaites et est refusé pour tout mandat `implement`, `verify` ou
`integrate` dans un profil de production.
**Motif.** ADR-013 impose le fail closed ; `sandbox-exec` est le seul mécanisme disponible sans
installation supplémentaire sur macOS arm64, et bubblewrap est le choix courant sur Linux.
**Conséquence.** `qualify()` retourne les capacités effectivement applicables ; Linux n'a pas pu
être exécuté sur la machine de référence et reste annoncé non qualifié.

## D-05 — Worker Pi = processus enfant Node exécutant le SDK Pi

**Décision.** Une intervention lance `node <worker-main>` avec un protocole JSONL sur stdio
(ADR-007). Le worker importe `@earendil-works/pi-coding-agent` depuis le répertoire d'installation
de Pi qui héberge l'extension (résolu par `getPackageDir()` côté extension et transmis dans le
mandat), crée une session `createAgentSession` avec `ResourceLoader` explicite vide, outils
explicites, `SessionManager.inMemory`, et le modèle exact du mandat.
**Motif.** ADR-008 ; aucune découverte ambiante ; l'identité de version de Pi est celle qui charge
l'extension.
**Conséquence.** Le repli `pi --mode rpc` n'est pas implémenté en P0.

## D-06 — Diff textuel maison

**Décision.** Le modèle de comparaison implémente un diff de lignes (Myers) et une mise en
évidence intraligne par préfixe/suffixe commun, sans dépendance à `diff`.
**Motif.** Garder le domaine de revue sans dépendance de production et contrôler exactement les
segments `unchanged/old/new/intraline` exigés par la spécification.
**Conséquence.** Les renommages sont détectés par égalité de digest (certitude) ou similarité de
lignes ≥ 0,8 (hypothèse annoncée `renamed?`), jamais présentés comme certains sous le seuil.

## D-07 — Parsers de rapports P0

**Décision.** Le runner générique livre trois interpréteurs qualifiés : `exit-code` (contrat
0 → PASS, autre → FAIL, timeout/spawn error → INDETERMINATE), `node-test-json` (sortie
`--test-reporter=spec`/`tap` de `node:test` réduite au comptage), `junit-xml` (rapports Surefire /
JUnit). Tout autre format est refusé (`capability_missing`).
**Motif.** Couvrir F-TS (`node --test`) et F-JAVA (Maven Surefire) avec un contrat commun.
**Conséquence.** INDETERMINATE est réservé à la dimension incident — erreur de lancement, timeout,
signal — c'est-à-dire aux seuls cas où une réexécution à l'identique peut répondre autrement. Une
sortie non nulle qu'aucun échec de test n'explique (erreur de compilation, plugin en échec, module
que le réacteur n'a jamais atteint) est un FAIL : c'est une propriété reproductible de l'arbre gelé,
et les lignes d'erreur du build deviennent des constats.

## D-18 — Une opération déterministe n'est jamais rejouée

**Décision.** Le budget de reprise technique n'est consommé que si la dernière observation porte un
incident et que cet incident ne s'est pas déjà reproduit à l'identique. Sinon G5 renvoie le
candidat en correction avec les constats.
**Motif.** Réexécuter un candidat gelé sous un protocole gelé est une fonction pure. Traiter tout
INDETERMINATE comme un incident dépensait les trois reprises à produire la même preuve, puis
bloquait le changement sur `execution_error` au lieu de rendre l'échec à l'agent.

## D-19 — Une intervention tronquée est suspendue, pas annulée

**Décision.** Une session arrêtée par `intervention_ms` est enregistrée `truncated`, jamais
`completed`. Tant que `max_continuations` n'est pas atteint, le producteur reprend **sur son propre
workspace**, dans la même tentative : aucun budget de tentative n'est consommé et rien n'est
reconstruit depuis la référence. Le budget d'incrément (`increment_ms`) borne l'ensemble.
**Motif.** Le plafond de durée doit borner le coût, pas détruire le travail. Une tentative repartant
d'une copie neuve de la référence perdait tout ce que la précédente avait écrit, et un candidat gelé
au milieu d'une édition était jugé comme une proposition finie.
**Conséquence.** `intervention_ms` se règle selon le modèle (`policy.budgets` dans `config.json`) :
un modèle local lent demande une durée plus large ou davantage de continuations, sans que le choix
change la sémantique.

## D-20 — Le build 495 fait partie de l'identité d'environnement

**Décision.** `environment_digest` couvre le digest de l'arbre exécuté (`dist/` une fois installé,
`src/` en développement) et la version du paquet, en plus de la plateforme, de Node, de Pi, du
bac à sable et des outils sondés.
**Motif.** Sans cela, une mise à jour du harness pendant un changement laissait l'identité
d'environnement inchangée : un protocole restait « qualifié » pour du code qui n'existait plus et
des preuves produites par deux builds se comparaient comme une seule.

## D-08 — Provenance humaine

**Décision.** En TUI, une réponse via `ctx.ui.select/confirm` dans un dialogue 495 constitue
l'origine `tui_session`. En RPC, une réponse n'est acceptée que si le client s'est déclaré
qualifié via une entrée de configuration explicite (`human_origin.rpc_clients`) ; sinon la
décision reste `decision_required`. JSON et print ne produisent jamais de décision.
**Motif.** ADR-014, SA-005, SA-030.

## D-09 — Portée de l'outil conversationnel `harness495`

**Décision.** L'outil accepte les opérations `status`, `start`, `verify`, `review_summary`,
`export`, `list_pending_decisions`. Il n'accepte aucune opération `decide`, `integrate` ni
`adopt` : ces opérations n'existent que comme commandes Pi (`/495 …`).
**Motif.** ADR-009 ; un appel d'outil est une demande non fiable.

## D-10 — Licence

**Décision.** Apache-2.0 (option proposée dans ADR-08 amont), fichiers LICENSE et NOTICE fournis.

## D-11 — Modèle de confinement du worker Pi

**Décision.** Le processus worker n'est pas lui-même confiné pour le réseau : il doit joindre le
fournisseur de modèle configuré dans Pi et lire `models.json`/`auth.json` de Pi (les credentials
restent gérés par Pi, §10.3). Le confinement porte sur toutes ses **voies d'action** : les outils
`read`/`write`/`edit`/`ls`/`grep` sont recréés avec des opérations qui refusent tout chemin dont le
`realpath` sort du workspace ; l'outil `bash` exécute chaque commande sous le backend d'isolation
(Seatbelt sur macOS) avec écriture limitée au workspace et réseau refusé ; aucun skill, `AGENTS.md`,
extension ou package du projet n'est chargé (`ResourceLoader` explicite vide) ; le chemin du
stockage normatif n'est jamais transmis et la base, le CAS, les exports et `auth.json` sont refusés
en lecture par le profil.
**Motif.** ADR-004 et §6.4 ; une extension Pi ne peut pas confiner l'appel modèle sans priver le
worker du fournisseur.
**Conséquence.** SEC-02 est revendiquée pour les voies d'action des outils, pas pour le canal modèle.

## D-12 — Provenance humaine en RPC

**Décision.** En mode RPC, une réponse de décision n'est acceptée que si l'hôte a déclaré l'identité
humaine dans la variable d'environnement nommée par `human_origin.rpc_actor_env`
(`HARNESS495_RPC_HUMAN_ACTOR` par défaut). Sans elle, la décision reste `decision_required` et
l'extension l'indique.
**Motif.** Pi ne transmet aucune identité de client aux extensions ; ADR-014 interdit de déduire une
provenance humaine du seul contenu.

## D-13 — Campagnes de qualification avec agent scripté

**Décision.** `HARNESS495_SCRIPTED_AGENT=<fichier.json>` remplace le worker Pi par l'agent
déterministe `ScriptedAgent` dans le runtime de l'extension. Le diagnostic de session l'annonce.
**Motif.** V3 exige des parcours reproductibles par les entrées Pi sans fournisseur réel (C-PI,
F-PIHOST, F-AGENTS).
**Conséquence.** Ce mode n'est jamais activé sans la variable ; il est visible dans `Limites`.

## D-14 — Qualification d'une préparation de tests

**Décision.** Quand la référence ne contient aucun test dans les répertoires attendus de la stack,
G2 ouvre `preparing`. Le producteur de préparation ne peut écrire que sous ces répertoires. Le
noyau qualifie la suite proposée par trois faits : périmètre respecté, suite chargeable (elle
exécute au moins un test), et **discriminante** (elle échoue sur la référence, donc détecte la
fonctionnalité absente). Le mécanisme runner/parser est qualifié séparément avec un témoin positif
trivial et un témoin négatif injecté. Une suite qui passe déjà sur la référence est conservée comme
fait mais pas adoptée comme oracle discriminant. Deux préparations infructueuses bloquent en
`capability_missing`. Les fichiers adoptés deviennent des chemins protégés dont le contenu exact
est autorisé dans le candidat.
**Motif.** PRE-03 et SA-009/SA-010 : distinguer capteur opérationnel, test discriminant et produit
conforme.
**Limite.** La discriminance sémantique (le test couvre bien l'exigence) reste une affaire de
revue humaine ; P0 ne l'automatise pas.

## D-15 — Sortie de l'extension en mode print

**Décision.** En mode `pi -p`, l'extension écrit son texte sur la sortie standard du processus ;
Pi réserve la sortie standard réelle à la réponse du modèle et route les écritures des extensions
vers la sortie d'erreur. Le contenu est identique à celui des autres modes ; les scripts doivent
lire les deux flux. En JSON, la vue canonique est portée par `details.view` d'un message
`customType: "495"`.

## D-16 — Trajectoire à un incrément par défaut

**Décision.** `/495 start` crée un programme avec un incrément unique. L'agrégat Programme
(DAG, jalons, éligibilité, verdict global) est implémenté et testé, mais la décomposition d'un
besoin complet en plusieurs incréments par intervention n'est pas automatisée en P0 ; elle se fait
par une trajectoire adoptée explicitement (`trajectory.adopt`).
**Conséquence.** PRG-03/PRG-04/PRG-05 sont livrés au niveau du noyau et du stockage ; le parcours
multi-incréments piloté par Pi reste à qualifier (voir STATUS).

## D-17 — Redéfinition tolérante des sorties structurées

**Décision.** Avant validation contre le schéma de sortie, la sortie d'une intervention est
extraite du dernier bloc ```json chargeable, puis normalisée : propriétés inconnues retirées,
tableaux manquants remplacés par `[]`, booléens manquants par `false`. Un champ obligatoire
absent reste invalide.
**Motif.** Les modèles locaux ajoutent souvent un commentaire ou un champ ; refuser ces sorties
transformait chaque cycle en `configuration_error`. La normalisation n'invente aucun contenu
métier.

## D-18 — Jalon de livraison distinct de la priorité d'exigence

**Décision.** Les marqueurs `P0`/`P1`/`P2` qualifient une exigence ; `L0`/`L1`/`L2`/`L3` qualifient
un jalon de livraison. Un jalon possède des critères que ses incréments ne portent pas
individuellement — deux plateformes, cinq entrées Pi, revues obligatoires, dossier de preuves
intègre — et son verdict est recalculé sur ces critères, jamais déduit de la somme de ses enfants.
Les critères de franchissement sont tenus dans `MILESTONES.md`.
**Motif.** Les incréments `IT-0` à `IT-4` ont pour sortie amont « parcours L0 complet » et `IT-5`
ouvre L1 ; les déclarer livrés revenait implicitement à annoncer un socle P0 dont le jalon technique
qui le précède n'est pas franchi.
**Conséquence.** « Livré » et « qualifié ici » restent des propriétés d'incrément dans `STATUS.md` ;
« franchi » devient une propriété de jalon, avec sa liste de conditions ouvertes.

## D-19 — Vocabulaire d'états de suivi sans effet sur la machine à états

**Décision.** Le suivi d'un jalon ou d'une sous-livraison emploie quatre états — non commencé, en
cours, livré non qualifié, qualifié. Ce vocabulaire est documentaire. La machine à états d'un
changement (`intake → … → closed`) et les verdicts de contrôle
(`PASS`/`FAIL`/`INDETERMINATE`/`NOT_RUN`/`NOT_APPLICABLE`) restent seuls normatifs et gelés dans les
contrats v1.
**Motif.** Deux vocabulaires d'états coexistant sans hiérarchie déclarée finissent par être
confondus dans le code ou dans les rapports.

## D-20 — La matrice de traçabilité porte une ligne par exigence P0

**Décision.** Toute exigence `[P0]`, aux deux niveaux de titre de l'expression de besoins — `####`
pour les 85 exigences fonctionnelles, `###` pour `NFR-01` à `NFR-08` — possède une ligne dans
`TRACEABILITY.md`, soit parmi les couvertes avec ses composants et ses preuves, soit parmi les non
couvertes avec l'état constaté. Une exigence couverte dont une partie de la recette n'est exercée
par aucun test porte la mention « non qualifié » et ce qui manque.
**Motif.** Dix-huit exigences `[P0]` n'apparaissaient nulle part dans la matrice. Une exigence
absente n'y est pas neutre : elle est indistinguable d'une exigence satisfaite, alors que le rôle
de la matrice est précisément de nommer ce qui n'est pas couvert.
**Conséquence.** Un contrôle exécutable doit garantir cette propriété plutôt qu'une relecture ; il
fait l'objet d'un travail ouvert dans `chantiers/`.

## D-21 — La nature d'une exigence est déclarée par la spécification, jamais devinée

**Décision.** Chaque exigence porte `satisfied_by_reference` : la référence exhibe déjà ce
comportement, ou elle ne l'exhibe pas. Le champ est produit par l'intervention de spécification, et
le noyau s'en sert pour décider si une préparation s'ouvre. Une sortie qui l'omet est normalisée à
`false`, donc vers l'ouverture d'une préparation.
**Motif.** Le noyau ne peut pas mesurer si la référence satisfait déjà une exigence : il faudrait
pour cela l'oracle dont l'absence est précisément le sujet. La distinction est pourtant décisive —
un refactoring dont l'exigence est le comportement inchangé est légitimement prouvé par une suite
verte, alors qu'un ajout de comportement ne peut l'être par aucun contrôle vert sur la référence.
Seul l'acteur qui lit la référence et rédige l'exigence peut trancher.
**Conséquence.** C'est une déclaration d'agent, donc une proposition et non une décision : le noyau
la vérifie ensuite par l'exécution, puisqu'une suite préparée pour une exigence déclarée nouvelle et
qui passe sur la référence n'est pas adoptée comme discriminante. Le défaut conservateur va vers le
travail supplémentaire, pas vers l'acceptation silencieuse.

## D-22 — Un passage sur la référence par contrôle, mémorisé par capteur et par environnement

**Décision.** À la vérification, chaque contrôle du protocole gelé s'exécute d'abord sur un
workspace reconstruit depuis l'instantané de référence, puis sur le candidat. Le passage de
référence est écrit au journal comme preuve à part entière (`subject.kind = "reference"`,
`facts.run = "reference"`) et relu au lieu d'être refait tant que le contrôle, la référence,
l'empreinte d'environnement et la révision du protocole sont les mêmes.
**Motif.** Comparer deux passages suppose qu'ils portent sur la même chose : `environment_digest`
est la condition de comparabilité, donc elle appartient à la clé. Une référence ne change pas
pendant un changement, et une tentative qui suit un refus ne doit rien coûter du côté qui n'a pas
bougé. Le journal porte déjà l'identité du capteur — commande, répertoire, environnement, arbre
observé — dans `inputs_digest` : la mémorisation n'a besoin d'aucun index de plus.
**Conséquence.** La première vérification d'un changement matérialise un workspace de plus et
exécute chaque contrôle une fois de plus ; les tentatives suivantes ne paient rien. Une révision du
protocole ou un changement d'environnement rétablit les passages, ce que l'invalidation exige déjà
pour les preuves du candidat.

## D-23 — L'identité d'un constat exclut le workspace exécuté et la ligne

**Décision.** `Finding.fingerprint` digère l'outil, la règle, le symbole, le chemin relatif et le
texte du message privé de sa localisation ; le runner retire du message le chemin absolu du
workspace et en extrait `path` et `region`. L'appariement des constats se fait ensuite en trois
passes : identité exacte, puis renommage prouvé par le manifeste (mêmes octets sous un autre nom),
puis déplacement non prouvé mais sans ambiguïté — un seul constat non apparié de chaque côté, dans
un fichier que le candidat ne porte plus.
**Motif.** Les deux passages s'exécutent dans deux répertoires : un message qui porte son chemin
absolu ne s'apparie jamais avec le même message observé de l'autre côté. Une ligne bouge dès qu'on
édite au-dessus d'elle. QLT-04 demande explicitement que déplacements et renommages ne masquent pas
une dette, ce qu'une empreinte qui contient la ligne et le répertoire ne peut pas tenir.
**Conséquence.** Un appariement ambigu n'est pas deviné : le constat du candidat reste introduit et
celui de la référence devient `removed`. Le défaut conservateur va vers le blocage, jamais vers la
disparition silencieuse d'une dette.

## D-24 — Tolérance et règle d'instabilité gelées avec le protocole

**Décision.** `Protocol.baseline` porte quatre champs gelés à G2 : l'exécution sur la référence, la
tolérance (`no_aggravation` ou `block_any`), la règle d'instabilité et le nombre de confirmations
qu'une divergence peut coûter. Sous `no_aggravation`, un contrôle qui échoue des deux côtés sans
ajouter un seul constat rend `PASS`, et `baseline.raw_verdict` conserve ce qu'il a observé ; un
constat hérité reste dans la preuve avec `baseline_state: "preexisting"` et ne compte pas parmi les
constats bloquants. Un contrôle qui échoue sur le candidat là où la référence passe paye une
confirmation sur le même candidat : si les deux réponses divergent, le verdict est `INDETERMINATE`
conservé, `limits.unstable` est vrai, et la relance technique lui est refusée.
**Motif.** Une tolérance décidée après coup n'en est pas une : c'est un verdict trouvé gênant. La
geler avec le protocole la rend opposable, et la rend lisible dans le dossier. Symétriquement, la
seule manière d'observer qu'un contrôle alterne est de l'exécuter deux fois ; ce que VER-08 interdit
n'est pas la seconde exécution mais d'adopter la plus verte des deux réponses.
**Conséquence.** Un contrôle qui échoue là où la référence passe coûte une exécution de plus avant
qu'une tentative de correction ne soit dépensée sur lui — bien moins qu'une intervention complète
suivie d'une vérification complète. `max_confirmations: 0` retire la détection sans toucher au
classement des constats.

## D-25 — Les règles d'architecture vivent dans le protocole, jamais dans l'arbre analysé

**Décision.** `ControlDefinition.structure_rules` porte les règles qu'un capteur structurel
applique : leur portée, ce qu'elles interdisent et l'énoncé qui les justifie. Elles sont gelées avec
le protocole à G2. Le producteur en reçoit les énoncés dans son contexte
(`ContextInput.boundaries`) et n'a aucun moyen de les atteindre en écriture. Elles sont dérivées de
ce que la cible déclare déjà — direction de dépendance des POM, racine de paquet disposée par chaque
module, absence de cycle — et non d'un fichier de configuration à ajouter au dépôt.
**Motif.** ARC-04 demande qu'une architecture adoptée ne reste pas une consigne dans le contexte. Un
fichier de règles dans l'arbre est un fichier que le producteur peut éditer, et une frontière que
son auteur peut déplacer n'est pas opposable ; le mettre sous `protected_paths` reviendrait à
protéger l'arbre contre lui-même, alors que le protocole est déjà l'endroit où sont gelés la
tolérance de baseline et la règle d'instabilité. Dériver les règles des déclarations de la cible
évite par ailleurs de lui imposer un format de plus pour énoncer ce que ses POM disent déjà.
**Conséquence.** Déplacer une frontière volontairement suppose une autre révision du protocole,
c'est-à-dire l'adoption que la recette d'ARC-04 exige. Un réacteur qui ne déclare aucune direction
opposable n'obtient aucune règle de frontière, et l'insuffisance rejoint `capability_missing` plutôt
qu'une convention inventée à sa place.

## D-26 — Un capteur différentiel rapporte partout et n'échoue que sur les lignes écrites

**Décision.** Le contrôle structurel émet un constat `blocker` pour chaque violation, où qu'elle se
trouve, et son verdict est `FAIL` seulement si l'une d'elles porte sur une ligne introduite.
`verdictUnderTolerance` est étendue en conséquence : sous `no_aggravation`, un contrôle qui échoue
sans nommer un seul constat que la référence ne porte pas déjà rend `PASS`, que son passage de
référence ait échoué ou non.
**Motif.** Les deux moitiés sont nécessaires et ne font pas double emploi. Les constats doivent être
émis des deux côtés, sinon la comparaison n'a rien à apparier et un cycle préexistant disparaîtrait
du dossier au lieu d'y figurer en `preexisting`. Le verdict, lui, doit porter sur ce que le candidat
a écrit : le témoin positif d'un capteur s'exécute sur la référence et G2 exige qu'il passe, donc un
capteur qui échoue sur la dette antérieure serait inqualifiable sur toute cible qui en porte. La
tolérance ne pouvait plus dépendre d'un passage de référence en échec, puisqu'un tel capteur passe
sur la référence tout en y nommant ce qu'il trouve.
**Conséquence.** Une violation héritée mais réécrite par le candidat — un import interdit déplacé
lors d'un reformatage — reste tolérée : elle s'apparie par empreinte, ne compte pas parmi les
constats bloquants, et le contrôle ne bloque pas. Un échec qui ne nomme aucun constat reste un
échec, et un passage de référence `INDETERMINATE` n'est toujours pas une tolérance. La divergence
qui paye une confirmation est celle que la tolérance a laissée debout, et non plus le verdict brut.
