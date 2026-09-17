# Statut d'implémentation

Les incréments `IT-0` à `IT-4` servent le jalon L0, `IT-5` ouvre L1 ; les critères de franchissement
et ce qui reste pour chacun sont dans `MILESTONES.md`.

Machine de référence : macOS 27 arm64, Node 24.21, Pi 0.85.1, Git 2.55, JDK 25 + Maven 3.9.9,
modèle local `omlx/qwen3.8-27b-oq8e`. Date : 17 septembre 2026.

« Livré » = code + tests passants. « Qualifié ici » = la preuve prévue par la conception de
vérification a été exécutée sur cette machine.

## Incréments

| Incrément | État | Preuves exécutées |
| --- | --- | --- |
| IT-0 contrats, noyau, stockage | livré, qualifié ici | V0 (58 tests dont propriétés générées), V2 stockage avec pannes injectées |
| IT-1 package Pi, commandes, modes | livré, qualifié ici dans les cinq entrées : TUI (composant), print, JSON, RPC, hôte SDK | V3 (`pi -p`, `pi --mode json`, `pi --mode rpc` avec client réel, hôte SDK par `createAgentSession`), chargement par manifeste |
| IT-2 worker, sandbox, candidat | livré, qualifié ici sur macOS arm64 ; Linux non revendiqué | V1 sandbox/runner/superviseur, intervention réelle avec le modèle local, refus fail closed exécuté sur Linux |
| IT-3 vérification et décision | livré, qualifié ici | V1 parsers/runner/qualification, V2 cycles complets |
| IT-4 revue et intégration | livré ; TUI qualifié par rendu simulé, pas par observation humaine | V0 modèle de revue et composant, V2 intégration Git |
| IT-5 programme, préparation, stacks | partiel : préparation livrée ; programme multi-incréments au niveau noyau ; F-JAVA qualifiée | V2 préparation, V4 Java (exécutée une fois, hors suite par défaut) |

## Ce qui est démontré

- Cycle complet réel depuis Pi : `pi -p "/495 start …"` sur F-TS avec le modèle local, sous Seatbelt,
  a produit `accepted` avec G0…G5 PASS et deux contrôles PASS (durée ≈ 8 min, dont ≈ 75 s de
  spécification et ≈ 2 min d'implémentation).
- Un producteur qui altère un test protégé échoue à G4 ; un candidat qui fait échouer la suite est
  refusé à G5 puis corrigé avec un feedback borné ; trois échecs épuisent les tentatives et
  demandent IH-07 ; deux candidats identiques déclenchent `stagnation`.
- Une approbation portée par une sortie de modèle ou un appel d'outil est refusée ; une décision
  reste attachée au candidat présenté ; l'absence de réponse ne vaut jamais approbation.
- Une preuve sur un autre candidat, une autre révision de protocole ou un autre environnement est
  rejetée à l'enregistrement ; FAIL et INDETERMINATE restent distingués ; timeout, binaire absent ou
  rapport illisible donnent INDETERMINATE. Une sortie non nulle qu'aucun échec de test n'explique
  (compilation, plugin, module non atteint) est un FAIL rendu à l'agent avec les lignes d'erreur, et
  ne consomme aucune reprise technique.
- Une intervention arrêtée par le budget de durée est enregistrée `truncated` et reprend sur son
  propre workspace dans la même tentative, jusqu'à `max_continuations` ; le travail déjà écrit
  n'est jamais reconstruit depuis la référence.
- Une étape qui échoue après avoir écrit enregistre son blocage : un changement bloqué ne peut pas
  réapparaître prêt et refaire le travail qui vient d'échouer.
- Journal chaîné SQLite + CAS : crash avant commit ou avant projection sans état incohérent ;
  altération détectée ; projection reconstruite ; export vérifiable hors ligne, expurgation déclarée.
- Workspace isolé : le projet n'est jamais écrit ; dépôts vide, sans HEAD, propre, sale et non git
  capturés ; manifeste complet (ajouts, suppressions, modes, liens, non suivis).
- Intégration Git en deux temps avec reçu ; destination avancée détectée et bloquée ; aucun push.
- Préparation de tests absents : suite proposée par un agent, qualifiée par le noyau
  (périmètre, chargeable, discriminante), protégée ensuite.
- Seconde stack : F-JAVA (Maven + Surefire) qualifiée positif/négatif/incident sous Seatbelt.
- Les cinq entrées Pi rendent les mêmes faits : un client RPC réel et un hôte SDK chargeant le
  package par `createAgentSession` conduisent le parcours de référence et s'accordent avec print et
  JSON sur l'issue, les six gates, les verdicts de preuve et l'empreinte du candidat — la même,
  parce qu'elle ne dépend que du contenu produit. La revue lit le même instantané dans les quatre
  canaux structurés : même `snapshot_id`, mêmes comptes, même texte sous l'en-tête. En RPC, aucun
  échappement terminal n'atteint le client et aucun composant `custom()` n'est demandé.
- Une décision humaine en RPC suit le mécanisme de `D-12` des deux côtés : un client qui ne déclare
  pas d'identité n'ouvre aucun dialogue et laisse le changement en `decision_required` ; un client
  qui en déclare une reçoit un `extension_ui_request`, sa réponse est enregistrée, et `/495 report`
  nomme l'autorité qui a tranché.
- La frontière d'exécution refuse fail closed sur une plateforme non revendiquée : sur Linux, la
  sélection du backend `bubblewrap` rend une qualification négative, la vue porte la limite
  `sandbox:bubblewrap:not-qualified`, et le changement s'arrête en `capability_missing`.
- Les trois paramètres de revue que l'amont avait différés sont fixés sur un corpus mesuré et
  vérifiés par leur critère : aucune action de revue ne disparaît de l'aide quelle que soit la
  largeur, un fichier plus long qu'une page se lit page après page avec ce qui reste annoncé, et un
  fichier au-dessus du budget de lecture garde son chemin, son statut et sa taille au lieu de
  disparaître.

## Préparation Maven multi-module

La détection parcourt le réacteur Maven depuis le `pom.xml` racine sans exécuter Maven. Les racines
`src/test/`, les `pom.xml` protégés et les répertoires `target` inscriptibles sont calculés pour
chaque module, et les rapports Surefire de tous les modules sont agrégés. Les ressources sous
`src/test/resources/` appartiennent au mandat de préparation tandis que les écritures sous
`src/main/` restent refusées. Une seconde intervention reçoit les motifs structurés du premier
refus. À la reprise, un mandat enregistré avec une ancienne topologie est clôt sans intervention,
puis recalculé. Les fichiers `.DS_Store` et `._*` sont exclus de tout inventaire normatif.

La régression déterministe couvre un parent sans `src/test/` racine, deux modules, une ressource de
test, une écriture de production refusée et deux rapports Surefire agrégés. L'exécution Maven réelle
multi-module sous Seatbelt reste à ajouter à la campagne V4 ; la campagne Java qualifiée existante
porte sur le fixture mono-module.

## La préparation s'ouvre sur l'absence de discrimination

G2 exige qu'un contrôle qualifié passe sur la référence, sans quoi il signalerait un défaut sur du
code sain. Il en résulte que tout contrôle qualifié est vert sur la référence, donc qu'il rend le
même verdict selon que l'exigence est satisfaite ou absente. La seule source de discrimination est
la suite préparée, dont l'adoption exige `on_reference: FAIL`.

Le déclencheur de la préparation est un diagnostic de capacité de contrôle sur l'échelle à quatre
niveaux de PRE-01 : fichier de test présent, cas découvert par la commande de test de la cible, cas
exécuté, contrôle capable de détecter le défaut visé. Une exigence qui affirme un comportement que
la référence n'a pas ouvre une préparation quel que soit le nombre de tests déjà présents ; une
exigence de comportement conservé garde la suite verte pour oracle, à condition que celle-ci exécute
réellement des cas. Le diagnostic est figé dans le protocole (`capability_diagnosis`) et dans le
mandat de préparation qu'il ouvre.

## Ce que la suite atteint sur le code introduit est mesuré

Le cas observé sur la cible Java — un candidat ajoutant 276 lignes instrumentées dont 93 ne sont
exercées par aucun test, et 44 branches non couvertes, accepté à G5 — est traité pour une cible
Maven dont JaCoCo lie son goal `report` à la phase `test` hors profil. Un contrôle `coverage` du
protocole gelé lit ce rapport, qu'aucune exécution supplémentaire ne produit, et ne juge que les
lignes que le candidat a écrites : une ligne introduite jamais exercée est un constat bloquant
localisé au fichier, à la ligne et au symbole ; une ligne exercée sur une partie de ses branches est
rapportée sans bloquer ; une ligne que le candidat n'a pas écrite est comptée comme dette antérieure
et nommée, jamais opposée au candidat. Un ratio de dépôt aurait répondu l'inverse dans les deux sens.

Il est qualifié comme les autres, avec des témoins qui lui sont propres : du code introduit et
exercé pour le témoin positif, du code introduit que rien n'appelle pour le contre-exemple, un
capteur cassé pour l'incident. Le témoin négatif partagé, un test qui échoue, ne pouvait pas servir :
une suite rouge arrête la construction avant l'écriture de la mesure.

Reste ouvert : la stack Node n'a pas de mesure de couverture, et G2 n'exige toujours pas la
discrimination — elle accepte une obligation couverte par un contrôle qualifié sans consulter le
diagnostic. Voir `chantiers/00` et `chantiers/02`.

## L'architecture adoptée est opposable, pas seulement transmise

Une conception remise au producteur dans son contexte est une instruction, soumise à la même
inférence que le code qu'elle est censée contraindre. Les frontières d'une cible Maven multi-module
sont désormais gelées dans le protocole à G2, sous forme de règles que le producteur reçoit en
énoncé et ne peut pas atteindre en écriture, puis vérifiées sur son candidat par un contrôle
`structure` du protocole gelé.

Aucune de ces règles n'est une convention de style : chacune reprend une déclaration de la cible.
Un module dont le POM ne déclare pas de dépendance sur un autre ne doit pas importer la racine de
paquet que cet autre dispose. Le module dont dépendent les autres et qui ne dépend d'aucun ne doit
pas importer un framework, qu'il ferait porter à tous. Deux paquets qui s'importent l'un l'autre
sont un seul paquet. L'adaptateur lit les déclarations `package` et `import` des sources — il ne
compile rien, ne résout aucun type et n'exécute aucun build — et rend ses constats dans l'enveloppe
`Finding` commune, catégorie `structure`, localisés au fichier, à la ligne et au paquet.

Le verdict porte sur ce que le candidat a écrit : un import interdit introduit échoue, une violation
qui était déjà là laisse le contrôle vert et apparaît au dossier en `preexisting`. C'est ce qui rend
le contrôle qualifiable sur une cible portant de la dette, puisque son témoin positif s'exécute sur
la référence. Son contre-exemple lui est propre — une source du module qui importe exactement ce que
ce module déclare ne pas dépendre —, le témoin négatif partagé, un test qui échoue, ne disant rien
d'une frontière.

Reste ouvert : la stack Node n'a pas d'adaptateur structurel, la liste des familles de framework est
gelée dans l'adaptateur de cible plutôt qu'adoptée par la cible, `src/test/java` n'est dans aucune
portée, et une frontière franchie par réflexion ou par configuration n'est pas vue. ARC-02, ARC-03
et ARC-05 restent absentes. Voir `chantiers/03`.

## Un test qui exerce une ligne sans rien en assertir n'est plus une preuve

La couverture répond à « cette ligne est-elle exercée ». Elle ne répond pas à « un test
remarquerait-il que cette ligne change ». Une cible Maven qui déclare son moteur de mutation hors
profil, avec un rapport XML à un chemin non horodaté, reçoit désormais un contrôle `mutation` du
protocole gelé qui répond à la seconde question.

Le contrôle est une commande que le protocole gèle et que le runner générique lance comme les
autres ; ce qui lui est propre est la lecture du rapport et la dérivation de sa portée. Cette portée
vient du candidat : les classes que le manifeste dit modifiées, avec le paquet lu dans la
déclaration de chaque source, sont les seules que le moteur mute. Un sujet qui n'introduit aucune
classe — le passage de référence — ne lance rien du tout. Le coût suit donc la taille du changement,
et le contrôle porte un budget propre de trente minutes, distinct de celui du contrôle de test.

Ce qui bloque est un mutant survivant sur une ligne que le candidat a écrite, nommé avec son
opérateur, sa méthode et sa ligne. Un mutant survivant ailleurs dans une classe modifiée est de la
dette de cette classe, comptée et nommée, jamais opposée au changement ; une classe non touchée
n'est pas mutée. Le `mutationThreshold` de la cible n'est pas la règle de ce contrôle : c'est un
ratio sur tout ce qui a été muté, il apparaît au dossier et ne fait échouer personne.

Le budget se comporte comme un budget doit se comporter. S'il expire avant le rapport, l'observation
est un incident : `INDETERMINATE`, jamais `FAIL`, avec la mention que la preuve due est manquante et
qu'aucun seuil n'est abaissé pour conclure sans elle. Le changement passe alors en
`resolve_incident` — une reprise technique bornée — sans qu'une tentative d'implémentation soit
dépensée. Un mutant que le moteur n'a pas su décider a le même effet, pour la même raison.

Le moteur lance des JVM ouvrières et leur parle par socket : `SandboxProfile.network` a donc une
troisième valeur, `loopback`, qui ouvre la boucle locale et rien d'autre. Un témoin s'y connecte à
lui-même puis à un autre hôte, et n'obtient le second qu'en `EPERM`.

Reste ouvert : c'est l'angle mutation de VER-04 et lui seul — propriétés, fuzzing, contrats, tests
différentiels et métamorphiques restent absents, et l'activation selon le risque du changement
n'existe pas, la configuration de la cible activant le contrôle pour tous ses changements. La portée
se limite aux sources `.java`, la stack Node n'a pas de capteur de mutation, et un mutant équivalent
bloque comme un autre : il est nommé assez précisément pour être reconnu, mais aucune liste
d'exclusion justifiée n'est gelée avec le protocole. Voir `chantiers/04`.

## Une revue qui constate ce qu'un programme sait constater n'est pas une revue

Les six revues obligatoires de `amont/conception-verification.md` §11 ont un dossier
(`revues/README.md`). Trois portent sur un sujet observable sans autorité extérieure — le dépôt
lui-même — et ont été conduites. Ce qu'elles ont trouvé et que le code pouvait vérifier est devenu
un contrôle, pas un avis.

`dist/` ne reproduisait plus les sources : dix-huit fichiers absents, soixante-neuf différents, dont
les adaptateurs de mutation et de frontières. Or `package.json#pi.extensions` désigne `dist/` : une
installation aurait chargé un package dépourvu des contrôles livrés depuis quatre commits, et une
revue de code portant sur `src/` n'en aurait rien dit. `check-distribution.ts` reconstruit désormais
les sources dans un répertoire temporaire de même profondeur et compare octet par octet ; le build
est déterministe. Le même contrôle tient l'inventaire : aucune dépendance redistribuée, quatre pairs
fournis par l'hôte et sous licence lisible, 263 packages installés tous sous licence permissive, les
schémas JSON expédiés identiques aux contrats sources, et les termes de la licence portés par le
dépôt plutôt que par une adresse.

Le catalogue de composants de la conception technique n'était rattaché à rien : huit des seize
composants déclarés n'étaient revendiqués par aucun module. `check-architecture.ts` refuse un
composant déclaré que plus aucun module ne revendique, un identifiant revendiqué que le catalogue ne
déclare pas, et tout cycle d'import ; il nomme sans les refuser les fusions de composants — une
seule aujourd'hui, `CMP-APP` et `CMP-VER` dans `harness.ts`.

Le dossier d'export affirmait être vérifiable hors ligne et décrivait en prose comment le vérifier.
Il embarque maintenant `verify.mjs` : Node et rien d'autre, aucune dépendance, aucun réseau ; il
vérifie l'empreinte du manifeste, celle de chaque fichier, l'adresse de chaque objet du CAS — un
objet qui ne hache pas vers son propre chemin sans qu'une expurgation le déclare est signalé — et
rejoue la chaîne d'événements. Enfin, les diagnostics de démarrage n'étaient annoncés que là où il y
a un écran : en print, en JSON et en RPC, une installation tournant sous un backend non qualifié ne
le disait à personne. Ils sont désormais dits une fois par canal.

Les trois autres revues demandent une autorité ou un environnement qui n'existent pas ici : un
reviewer de sécurité indépendant du producteur, un utilisateur représentatif devant un vrai
terminal, un responsable produit. Leur dossier est complet, leur conduite ne l'est pas, et ce qui
manque est nommé dans chacun.

## Ce qui n'est pas qualifié, ou hors de cette machine

- Linux x86-64 : **plateforme non revendiquée**, sans état intermédiaire. Le backend bubblewrap est
  écrit, sa qualification échoue sur toute machine, et la frontière d'exécution refuse alors tout
  rôle confiné avec `capability_missing`. Ce refus est exécuté sur Linux, pas seulement écrit : la
  campagne du 17 septembre 2026 établit que `bwrap` n'y crée d'espace de noms qu'en `--privileged`,
  que le changement s'arrête bien en `capability_missing`, et que l'échec du confinement est
  désormais rendu comme incident plutôt que comme verdict du contrôle de la cible. Voir `D-31`,
  `D-32` et `QUALIFICATION.md`.
- Revue TUI : rendu et clavier vérifiés par tests de composant (largeur, lignes, mode étroit) ;
  la revue UX/accessibilité humaine et l'observation dans un vrai terminal restent à faire. Le
  protocole de conduite est écrit — `revues/R4-ux-accessibilite.md` — et attend un utilisateur
  représentatif, un terminal réel et une norme d'accessibilité nommée à l'amont.
- Revues obligatoires : les six dossiers existent (`revues/`), avec leur périmètre, leurs critères,
  leurs preuves, leur format de constat et ce qu'un reviewer ne peut pas y conclure. Trois sont
  conduites sur le dépôt lui-même — architecture, licences et distribution, exploitation — et leurs
  constats sont enregistrés. Trois restent en attente d'une autorité ou d'un environnement absents :
  sécurité (reviewer indépendant du producteur, machine Linux, campagne adverse), UX et
  accessibilité (utilisateur représentatif, terminal réel, lecteur d'écran), fonctionnelle
  (responsable produit). Les bloquants des trois conduites sont clos ; leurs constats non bloquants
  restent ouverts comme travail identifié.
- Programme multi-incréments piloté depuis Pi (PRG-03..05, F-PROGRAM de bout en bout) : noyau
  et stockage seulement.
- Reviewers agentiques obligatoires : mécanisme livré (rôle `review`, mandat lecture seule,
  arbitrage) et testé avec l'agent scripté ; non exercé avec un modèle réel.
- Provenance des extensions tierces de la session hôte : une extension Pi chargée dans la même
  session que `/495` n'est ni inventoriée ni annoncée. L'identité d'environnement relève la
  plateforme, Node, Pi, le backend d'isolation et les outils de build, pas les extensions ni les
  outils que l'hôte expose ; la fixture `F-EXTENSIONS` n'existe pas. Ce qui borne la portée :
  l'état normatif vit hors de la session Pi, seul le noyau écrit une gate, et l'outil
  conversationnel est en lecture seule — voir `RISQUES-L0.md` §3.
- Performance (NFR-04) : aucune mesure p95 ; les bornes de flux et de taille existent.
- Ressources : tout chemin nominal supprime le workspace à sa fermeture, mais une interruption avant
  la fermeture laisse un orphelin que rien ne reprend, `cleanupTemporaries` du CAS n'est appelé que
  par un test, et la base, les objets et les exports croissent sans politique de purge ni
  comptabilité. `~/.495/logs/` est créé et reste vide : aucune trace d'exécution n'existe, et l'état
  n'est lisible par aucun outil en dehors de Pi — voir `revues/R6-exploitation.md`.
- Documentation/RAG (RAG-*), expertise (EXP-*) : non livrés ; ils ne bloquent aucun scénario P0 de
  changement simple mais restent P0 dans l'expression de besoins et sont donc annoncés absents.
- Architecture et qualité (ARC-01..03, QLT-01..03, QLT-05), caractérisation de l'existant (PRE-04)
  et évolution de la capacité par cycle (PRE-05) : non livrés. Contrairement aux précédents, leur
  absence a un effet observable sur l'acceptation d'un changement — voir les sections ci-dessus
  et `ROADMAP.md`. Ce qui est livré d'ARC-01 est la partie observable de son diagnostic : modules,
  dépendances, cycles et frontières localisés dans le code ; la comparaison entre architecture
  déclarée et architecture réalisée et le marquage des liens dynamiques n'y sont pas.
- Angles de vérification (VER-04) : l'angle mutation est livré sur une cible Maven qui déclare son
  moteur ; les profils de propriétés, de fuzzing, de contrats, de tests différentiels et
  métamorphiques, ainsi que l'activation selon le risque du changement, restent absents.
- Diagnostic de capacité de contrôle (PRE-01) : l'échelle à quatre niveaux et le déclencheur de
  préparation sont livrés et exercés par `v2/preparation` ; la cartographie des assertions et des
  dépendances des contrôles n'est pas écrite, et IH-04 reste absente, si bien qu'une exigence non
  discriminable après deux préparations arrête le changement sans voie de sortie.
- Comparaison à la référence (VER-08) : livrée. Chaque contrôle s'exécute sur la référence puis sur
  le candidat dans le même environnement, le passage de référence est mémorisé par contrôle et par
  empreinte d'environnement, les constats sont classés `new` / `preexisting` / `removed`, et la
  tolérance comme la règle d'instabilité sont gelées dans le protocole à G2. Portée actuelle : G2
  exige qu'un contrôle qualifié passe sur la référence, donc aucun contrôle qualifié ne porte
  aujourd'hui de constat préexistant sur un défaut de test — la tolérance est désormais exercée par
  le contrôle structurel, qui passe sur la référence tout en nommant les violations qu'il y trouve.
- Portabilité (NFR-05) : **non satisfaite**. Une seule plateforme est revendiquée, macOS arm64. Ce
  qui la satisferait est nommé dans `MILESTONES.md` §3 ; rien n'en est annoncé d'ici là.
- Observabilité sans surveillance imposée (NFR-06) : établie. Un changement conduit de la demande à
  l'export expurgé, sockets, DNS, `http`/`https` et `fetch` instrumentés, n'ouvre aucune connexion
  et ne résout aucun hôte, et tout ce qui s'exécute hors du processus le fait sous un profil
  `denied` ; aucune source ne porte de client réseau ni d'URL d'endpoint.
- Recettes précédemment non exercées sur des exigences par ailleurs couvertes : compaction forcée et
  reprise de session (CTX-04), rechargement de l'extension et bifurcation de conversation (UX-05),
  requalification déclenchée par un changement de version (EXT-02), séparation observations /
  jugements / risques résiduels dans le rapport (IMP-05). Les quatre sont désormais exercées ;
  `TRACEABILITY.md` nomme le contrôle qui porte chacune. La complétude de la matrice elle-même est
  tenue par `scripts/check-traceability.ts`, branché sur `npm run check` : un identifiant `[P0]` de
  l'amont absent des deux tables fait échouer la vérification.
- Rapport d'ingénierie (IMP-05) : `application/report.ts` sépare ce que les contrôles ont mesuré, ce
  qui en a été conclu et par quelle autorité, et ce qui reste non établi ; `/495 report` l'expose
  sans passer par un modèle. Portée actuelle : le rapport projette le journal d'un changement, il ne
  couvre pas encore un programme entier.
- Arbitrage de vérifiabilité (IH-04) : l'interaction est déclarée dans les contrats mais exclue du
  constructeur de demandes de décision ; une exigence non discriminable n'a donc pas d'issue humaine.
