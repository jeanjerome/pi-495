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
| IT-1 package Pi, commandes, modes | livré, qualifié ici pour TUI (composant), print, JSON ; RPC non exercé | V3 (2 parcours réels `pi -p` / `pi --mode json`), chargement par manifeste |
| IT-2 worker, sandbox, candidat | livré, qualifié ici sur macOS | V1 sandbox/runner/superviseur, intervention réelle avec le modèle local |
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

## Ce qui n'est pas qualifié, ou hors de cette machine

- Linux x86-64 : backend bubblewrap implémenté, jamais exécuté ; annoncé non qualifié.
- Mode RPC : chemins de code présents ; aucun client RPC qualifié n'a été exercé.
- Revue TUI : rendu et clavier vérifiés par tests de composant (largeur, lignes, mode étroit) ;
  la revue UX/accessibilité humaine et l'observation dans un vrai terminal restent à faire.
- Revues obligatoires (fonctionnelle, architecture, sécurité, UX et accessibilité, licences et
  distribution, exploitation) : non réalisées ; les constats automatiques existent, pas les revues
  humaines. Elles conditionnent la qualification d'une livraison — voir `chantiers/B`.
- Programme multi-incréments piloté depuis Pi (PRG-03..05, F-PROGRAM de bout en bout) : noyau
  et stockage seulement.
- Reviewers agentiques obligatoires : mécanisme livré (rôle `review`, mandat lecture seule,
  arbitrage) et testé avec l'agent scripté ; non exercé avec un modèle réel.
- Performance (NFR-04) : aucune mesure p95 ; les bornes de flux et de taille existent.
- Rétention et nettoyage des workspaces : conservés localement (P0), pas de politique de purge.
- Documentation/RAG (RAG-*), expertise (EXP-*) : non livrés ; ils ne bloquent aucun scénario P0 de
  changement simple mais restent P0 dans l'expression de besoins et sont donc annoncés absents.
- Architecture et qualité (ARC-01..04, QLT-01..03, QLT-05, CON-03), caractérisation de l'existant (PRE-04)
  et évolution de la capacité par cycle (PRE-05) : non livrés. Contrairement aux précédents, leur
  absence a un effet observable sur l'acceptation d'un changement — voir la section ci-dessus
  et `ROADMAP.md`.
- Diagnostic de capacité de contrôle (PRE-01) : l'échelle à quatre niveaux et le déclencheur de
  préparation sont livrés et exercés par `v2/preparation` ; la cartographie des assertions et des
  dépendances des contrôles n'est pas écrite, et IH-04 reste absente, si bien qu'une exigence non
  discriminable après deux préparations arrête le changement sans voie de sortie.
- Comparaison à la référence (VER-08) : livrée. Chaque contrôle s'exécute sur la référence puis sur
  le candidat dans le même environnement, le passage de référence est mémorisé par contrôle et par
  empreinte d'environnement, les constats sont classés `new` / `preexisting` / `removed`, et la
  tolérance comme la règle d'instabilité sont gelées dans le protocole à G2. Portée actuelle : G2
  exige qu'un contrôle qualifié passe sur la référence, donc aucun contrôle qualifié ne porte
  aujourd'hui de constat préexistant — la tolérance est exercée par ses contrôles et attend les
  analyseurs des étages 2 et 3 pour se déclencher dans un cycle complet.
- Portabilité (NFR-05) et observabilité (NFR-06) : la première est annoncée sans être qualifiée, la
  seconde n'est établie par aucun contrôle bien qu'aucun point de télémétrie n'existe dans les
  sources.
- Recettes non exercées sur des exigences par ailleurs couvertes : compaction forcée et reprise de
  session (CTX-04), rechargement de l'extension et bifurcation de conversation (UX-05),
  requalification déclenchée par un changement de version (EXT-02), séparation observations /
  jugements / risques résiduels dans le rapport (IMP-05). Chacune est marquée dans
  `TRACEABILITY.md`.
- Arbitrage de vérifiabilité (IH-04) : l'interaction est déclarée dans les contrats mais exclue du
  constructeur de demandes de décision ; une exigence non discriminable n'a donc pas d'issue humaine.
