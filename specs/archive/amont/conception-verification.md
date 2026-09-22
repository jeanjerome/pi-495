# Conception de la vérification — 495

**Version :** 0.1 — 16 septembre 2026  
**Statut :** proposition pour validation  
**Documents amont :** *Expression de besoins — Harness de développement logiciel*, version 1.3 du 15 septembre 2026 ; *Spécification fonctionnelle — 495*, version 0.1 du 16 septembre 2026  
**Livrable :** plan de validation et matrice **exigence → contrôle → preuve attendue**

## 1. Objet

Ce document définit comment démontrer que 495 satisfait ses exigences. Il transforme les exigences amont, les règles métier et les scénarios d’acceptation en contrôles qualifiables, fixtures reproductibles, observations, revues et décisions humaines.

Il ne choisit pas encore l’architecture interne, la bibliothèque de test, le moteur de stockage ni les composants TUI. Il fixe en revanche les propriétés que ces choix devront permettre de vérifier et les preuves minimales nécessaires à une décision de livraison.

### 1.1 Deux plans de vérification distincts

| Plan | Objet jugé | Protocole | Décision |
| --- | --- | --- | --- |
| **Vérification de 495** | Le package Pi, son noyau, ses adaptateurs, ses vues et ses artefacts | Le présent document | Qualification d’une version de 495 |
| **Vérification par 495** | Un candidat produit dans une application cible | Un protocole propre au programme, à l’incrément et au changement | G2 puis G5/G6 du changement applicatif |

Une preuve obtenue sur une fixture de 495 qualifie une capacité du harness ; elle ne prouve pas qu’une application cible particulière est conforme. Réciproquement, le passage des tests d’une application ne prouve pas que le noyau de décision, la reprise ou les permissions de 495 sont corrects.

### 1.2 Périmètre de la première qualification

La qualification P0 couvre :

- l’usage exclusif par les entrées publiques de Pi, avec le TUI comme interface de référence ;
- le noyau de décision, les gates, les invalidations et les budgets ;
- les interventions simulées et au moins deux fournisseurs ou moteurs qualifiés sans en faire dépendre la recette déterministe ;
- l’exécution de contrôles natifs dans plusieurs technologies cibles par un contrat commun ;
- la préservation Git, l’intégrité des preuves, l’interruption et la reprise ;
- la vue de revue arbre/lecteur, ses données indépendantes du TUI et ses rendus non trompeurs ;
- macOS Apple Silicon et Linux x86-64.

Les capacités P1 et P2 sont vérifiées lorsqu’elles entrent dans une livraison. Une exigence différée reste dans la matrice avec son contrôle prévu ; elle ne peut pas être déclarée satisfaite avant exécution de ce contrôle.

## 2. Principes de preuve

### 2.1 Règles

1. Une exigence obligatoire n’est satisfaite que par l’ensemble de preuves préenregistré pour sa révision.
2. Une preuve référence l’exigence, le build de 495, la fixture ou le projet, le protocole, l’environnement et le contrôle exacts.
3. Le verdict d’un contrôle appartient à l’ensemble fermé `PASS`, `FAIL`, `INDETERMINATE`, `NOT_RUN`, `NOT_APPLICABLE`.
4. `FAIL`, `INDETERMINATE` et `NOT_RUN` bloquent une obligation P0. `NOT_APPLICABLE` n’est recevable que s’il a été prévu et justifié avant l’exécution.
5. Un contrôle automatique prouve seulement la propriété qu’il observe. Une revue ne remplace pas une assertion mécanique disponible ; un test vert ne remplace pas un jugement de pertinence.
6. Tout contrôle utilisé comme autorité est lui-même qualifié par au moins un cas positif, un cas négatif ciblé et, lorsqu’il a un runner, un cas d’incident.
7. Les tests du noyau n’appellent ni modèle réel ni réseau. Les observations avec fournisseur réel forment une campagne séparée et non bloquante sauf exigence explicite de compatibilité.
8. Les contrôles portent sur un instantané figé. Toute mutation pertinente invalide les preuves dépendantes.
9. Les mêmes faits canoniques doivent donner le même verdict par TUI, RPC, JSON, print et hôte SDK Pi qualifiés.
10. Aucun score global ne compense l’échec d’une obligation.

### 2.2 Quatre moyens de preuve

| Moyen | Usage | Résultat attendu |
| --- | --- | --- |
| **Test** | Règle déterministe, contrat, transition, format, calcul, permission ou interaction simulable | Rapport structuré avec assertions, cas, résultat et artefacts |
| **Observation** | Effet réel sur processus, système de fichiers, Git, terminal, plateforme ou fournisseur | Capture factuelle horodatée et liée à l’environnement |
| **Revue** | Pertinence, proportionnalité, ergonomie, architecture, sécurité ou qualité non réductible à une assertion | Constats localisés, critères examinés, limites et conclusion par exigence |
| **Décision humaine** | Choix de valeur, acceptation de risque, dérogation ou arbitrage prévu | Identité, autorité, objet, révision, portée, motif et expiration éventuelle |

Une exigence peut requérir plusieurs moyens. Par exemple, la vue de revue exige des tests du modèle de comparaison, des snapshots de rendu, une observation dans Pi et une revue d’accessibilité au clavier.

## 3. Modèle canonique de preuve

Toutes les technologies et tous les adaptateurs produisent une enveloppe commune. Les rapports natifs peuvent être conservés comme pièces jointes, mais la décision ne lit que la représentation canonique validée.

| Champ | Contenu obligatoire |
| --- | --- |
| `evidence_id` | Identifiant immuable de la preuve |
| `requirement_refs` | Exigences et révisions couvertes |
| `control_id` / `control_version` | Contrôle exécuté et version de son interpréteur |
| `subject` | Build de 495, candidat, composant, fixture ou profil jugé |
| `protocol_revision` | Révision gelée du protocole |
| `environment_digest` | OS, architecture, Pi, package, exécutables et configuration pertinents |
| `inputs_digest` | Empreinte des entrées observées |
| `started_at` / `ended_at` | Fenêtre d’exécution |
| `verdict` | Valeur fermée du verdict |
| `facts` | Observations structurées sans conclusion libre implicite |
| `artifacts` | Rapports, journaux, snapshots, traces, corpus ou captures référencés par empreinte |
| `limits` | Troncatures, exclusions, instabilité et inconnues |
| `producer` | Exécuteur, reviewer ou humain et provenance authentifiée |
| `integrity` | Empreinte et, si nécessaire, chaînage au journal |

### 3.1 Constat commun multi-langages

Les analyseurs TypeScript, JavaScript, Java, Python, Rust ou autres peuvent rester spécialisés. Ils doivent toutefois normaliser leurs constats sous le même contrat :

`rule_id`, `category`, `severity`, `message`, `path`, `region`, `symbol`, `requirement_refs`, `baseline_state`, `fingerprint`, `tool`, `tool_version`, `confidence`, `raw_evidence_ref`.

Le noyau ne déduit jamais qu’une règle de même nom possède la même sémantique dans deux outils. Cette équivalence relève du profil qualifié.

## 4. Catalogue des contrôles

| ID | Contrôle | Type principal | Portée |
| --- | --- | --- | --- |
| `C-REQ` | Validation des exigences et de leur traçabilité | Test + revue | Schémas, identifiants, sources, couverture, statut |
| `C-FSM` | Modèle d’état, gates et invalidations | Tests unitaires, propriétés et modèle | Transitions, invariants, idempotence, décisions |
| `C-PRO` | Construction et qualification du protocole | Test + contre-exemple + revue | Oracles, règles de combinaison, gel, applicabilité |
| `C-EXE` | Exécution normalisée des contrôles | Contrat + intégration | Commandes, timeout, environnement, parsing, verdicts |
| `C-CAN` | Observation et identité du candidat | Test + observation | Arbre, base, non suivis, suppressions, métadonnées, fraîcheur |
| `C-AGT` | Interventions, modèles et boucle d’outils | Simulateur + contrat | Capacités, appels, sorties, budgets, annulation, délégation |
| `C-CTX` | Construction et reconstruction du contexte | Test + inspection | Manifestes, hiérarchie, compaction, séparation des rôles |
| `C-SEC` | Permissions et frontières de confiance | Adversarial + observation + revue | Moindre privilège, confinement, secrets, effets externes |
| `C-GIT` | Préservation et intégration Git | Intégration + panne injectée | Dépôt sale, revalidation, conflits, réconciliation |
| `C-EVD` | Journal, preuves, intégrité et export | Test + corruption/panne injectée | Append-only, digests, rétention, expurgation, hors ligne |
| `C-PI` | Contrat avec les entrées Pi | Contrat + bout en bout | TUI, RPC, JSON, print, SDK, sessions et décisions |
| `C-UIR` | Modèle et rendu de la revue | Test modèle + snapshot + revue UX | Arbre, lecteur, clavier, accessibilité, cas spéciaux |
| `C-EXT` | Extensions et adaptateurs | Contrat + intégration + licence | Admission, versions, chargement, profils, stacks cibles |
| `C-PRG` | Programmes, incréments et jalons | Test modèle + bout en bout | DAG, dépendances, révisions, acceptation globale |
| `C-DOC` | Sources techniques et corpus | Test de retrieval + contrat + revue | Version, provenance, pertinence, injection, fraîcheur |
| `C-ARC` | Architecture et trajectoire | Analyse + fixtures + revue | Graphe, frontières, état transitoire, dérive |
| `C-QLT` | Qualité et dette | Analyse différentielle + revue | Baseline, nouvelles violations, exceptions, réduction |
| `C-PERF` | Performance, ressources et exploitation | Mesures répétées | Latence, dispersion, mémoire, annulation, métriques |
| `C-PKG` | Distribution, plateformes et reproductibilité | Installation + SBOM/licences + matrice OS | Package Pi, dépendances, local, portabilité, versions |
| `C-HUM` | Provenance et portée des décisions humaines | Contrat + test d’autorité | Identité, rôle, révision, refus, dérogation |

Chaque contrôle possède une fiche versionnée : objectif, propriété observée, entrées, permissions, environnement, interprétation, verdicts, limites, qualification et exigences couvertes.

## 5. Corpus de fixtures

| ID | Fixture | Défauts ou propriétés contrôlés |
| --- | --- | --- |
| `F-EMPTY` | Répertoire vide autorisé | Référence vide, initialisation, première intégration |
| `F-NOHEAD` | Dépôt Git sans `HEAD`, avec fichiers utilisateur | Préservation, origine inconnue, reprise |
| `F-TS` | Petit projet TypeScript/JavaScript avec tests | Adaptateur natif, changement conforme et défauts injectés |
| `F-JAVA` | Petit projet Java avec build et architecture en couches | Seconde stack, contrôle structurel, rapports natifs |
| `F-LEGACY` | Existant sans tests fiables et avec dette connue | Caractérisation, baseline, non-aggravation, migration |
| `F-PROGRAM` | Application multi-incréments avec contrat partagé | DAG, jalons, incompatibilité inter-incréments, reprise |
| `F-PROTOCOL` | Contrôles valides, aveugles, cassés et instables | Qualification positive/négative/incident, faux verts |
| `F-AGENTS` | Fournisseurs et agents simulés scriptables | Outils inconnus, sorties invalides, timeout, repli, délégation |
| `F-PIHOST` | Hôtes simulés TUI, RPC, JSON, print et SDK | Concordance des faits, dialogue disponible ou absent |
| `F-REVIEW` | Arbre avec intact/ajout/modification/suppression/renommage | Modèle de comparaison et navigation |
| `F-SPECIAL` | Binaire, encodage invalide, symlink sortant, sous-module, conflit, permissions | Présentation honnête et confinement |
| `F-HOSTILE` | Noms, contenus, logs et pages avec séquences terminal, secrets et injections | Rendu inerte, non-divulgation, hiérarchie d’instructions |
| `F-GIT` | Branche avancée, conflit et panne aux frontières d’effet | Revalidation, atomicité, réconciliation |
| `F-EVIDENCE` | Journal valide puis preuve absente, altérée ou périmée | Intégrité, invalidation, export |
| `F-DOCS` | Deux versions incompatibles d’un framework et corpus privé | Filtrage de version, non-réponse, protection |
| `F-EXTENSIONS` | Extension admise, inconnue, mise à jour et profil composé | Chargement, qualification, compatibilité |
| `F-LARGE` | 10 000 événements, grand arbre, gros fichiers et sorties volumineuses | Bornes, pagination, streaming, annulation |

Les fixtures sont immuables par version. Les variantes fautives sont produites par transformations déclarées ou archivées comme contre-exemples ; elles ne remplacent pas silencieusement la fixture positive.

## 6. Niveaux de validation

| Niveau | But | Dépendances autorisées | Sortie |
| --- | --- | --- | --- |
| `V0` | Schémas, fonctions pures, règles et propriétés | Aucune API Pi, aucun réseau, aucun modèle | Rapports unitaires et de propriétés |
| `V1` | Contrats de ports et adaptateurs | Simulateurs, processus locaux, fixtures | Rapports de contrat et compatibilité |
| `V2` | Intégration du noyau, stockage, exécution, Git | Dépôts temporaires et pannes injectées | Dossiers de changement complets |
| `V3` | Parcours par les entrées Pi | Pi qualifié, fournisseurs simulés | Transcriptions et preuves multicanales |
| `V4` | Système sur stacks et plateformes réelles | macOS arm64, Linux x86-64, outils natifs | Matrice de qualification signée |
| `V5` | Adversarial, UX, sécurité, performance et reprise | Environnements dédiés et reviewers | Rapports spécialisés et décisions |

Une version P0 ne peut être qualifiée sans V0 à V5 pour les contrôles qui lui sont applicables. Une panne de service externe ne rend pas V0–V3 indéterminés lorsqu’ils utilisent les simulateurs prévus.

## 7. Qualification des contrôles

Pour chaque contrôle `C-*`, la fiche de qualification contient :

1. un **témoin positif** qui doit produire `PASS` ;
2. un **contre-exemple ciblé** qui doit produire `FAIL` ;
3. un **incident de capteur** qui doit produire `INDETERMINATE` ;
4. un **cas hors périmètre préenregistré**, s’il existe, qui seul peut produire `NOT_APPLICABLE` ;
5. une vérification de stabilité ou une politique explicite d’aléa ;
6. la démonstration qu’un producteur ne peut modifier le contrôle gelé ni ses résultats ;
7. la version de l’interpréteur qui transforme les faits en verdict.

Les tests de mutation sont employés pour les règles critiques du noyau et pour un échantillon de contrôles applicatifs : supprimer une invalidation, inverser un verdict, accepter une preuve périmée ou omettre un fichier non suivi doit être détecté. Le score de mutation reste un indicateur ; seuls les mutants associés à une propriété obligatoire et non équivalents produisent un échec normatif.

## 8. Plan de validation

### 8.1 Ordre des campagnes

1. **Geler le référentiel** : versions des exigences, scénarios, contrôles, fixtures et règles de combinaison.
2. **Qualifier les capteurs** : exécuter les témoins positifs, contre-exemples et incidents.
3. **Valider le noyau** : V0, propriétés de transitions, décisions et invalidations.
4. **Valider les ports** : V1 sur exécution, dépôt, Pi, modèles, approbations et extensions.
5. **Valider la persistance et les effets** : V2 avec crashs et reprises aux frontières d’écriture.
6. **Valider les parcours Pi** : V3 sur toutes les entrées qualifiées, sans CLI 495 ni job CI de conduite.
7. **Valider les stacks et plateformes** : V4 sur `F-TS` et `F-JAVA`, puis macOS arm64 et Linux x86-64.
8. **Valider les risques transversaux** : V5 sécurité, UX, grands volumes, accessibilité et performance.
9. **Consolider** : construire la couverture exigence → preuves, signaler les absences et calculer le verdict sans modèle.
10. **Revoir et décider** : revues spécialisées exigées, puis décision humaine de qualification de la livraison.

### 8.2 Campagnes de non-régression

- Chaque changement de noyau exécute V0–V2 et les scénarios transversaux affectés.
- Chaque changement d’adaptateur exécute son contrat commun, ses fixtures natives et le profil composé.
- Chaque changement de données de revue exécute `F-REVIEW`, `F-SPECIAL`, `F-HOSTILE` et la concordance multicanale.
- Chaque changement de contrat persistant exécute les archives des versions supportées et les refus de version future.
- Chaque défaut échappé ajoute un contre-exemple sans modifier le résultat historique des anciennes campagnes.
- La campagne de qualification de livraison exécute l’ensemble P0 sur les deux plateformes, depuis le package Pi construit pour la livraison.

## 9. Matrice exigence → contrôle → preuve attendue

La colonne « Fixtures » identifie le minimum. Les scénarios `SA-*` de la spécification fonctionnelle et `REC-*` de l’expression de besoins complètent ces jeux sans remplacer les contrôles unitaires et de contrat.

### 9.1 Demande, exigences et conception

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `BES-01` Enregistrer une intention | `C-REQ`, `C-EVD` | `F-TS` | Demande originale, référence résolue, révisions et export portent des identités et empreintes distinctes. |
| `BES-02` Clarifier sans inventer | `C-REQ`, `C-FSM`, `C-PI` | demande ambiguë, `F-PIHOST` | G0 reste bloquée ; question structurée persistée ; aucune exigence fabriquée. |
| `BES-03` Délimiter le changement | `C-CAN`, `C-FSM`, revue de périmètre | mutation hors périmètre de `F-TS` | Inventaire du candidat et constat localisé empêchant G4/G5. |
| `BES-04` Décomposer en incréments | `C-PRG`, `C-FSM` | `F-PROGRAM` cyclique et acyclique | Cycle localisé ; éligibilité correcte ; acceptations locales non propagées. |
| `BES-05` Versionner une réorientation | `C-REQ`, `C-FSM`, `C-EVD` | révision de règle après vérification | Ancienne décision historisée ; preuves dépendantes invalidées ; nouvelle révision attribuée. |
| `REQ-01` Structurer les exigences | `C-REQ` | documents valides et invalides | Rapport de schéma/sémantique : doublons, sources, responsable, observabilité et statuts séparés. |
| `REQ-02` Couvrir les familles de contrats | `C-REQ`, revue de couverture | matrice avec familles absente/NA/à instruire | Chaque famille possède un état explicite et une justification ; aucune omission assimilée à conforme. |
| `REQ-03` Préenregistrer le protocole | `C-PRO`, `C-FSM` | obligation sans oracle, oracle manuel assigné | G2 refuse la lacune et accepte l’assignation exploitable ; protocole gelé avant production. |
| `REQ-04` Séparer préparation et gel | `C-PRO`, `C-SEC`, `C-CAN` | `F-PROTOCOL`, tentative de baisse de seuil | Qualification distincte, écriture refusée ou détectée, révision active inchangée. |
| `REQ-05` Vérifier les liens sémantiques | `C-PRO`, revue de pertinence | test sans assertion et défaut ciblé | Revue ou contre-exemple démontre la capacité réelle ; lien syntaxique seul refusé. |
| `CON-01` Observer avant de concevoir | `C-CAN`, `C-SEC`, observation | dépôt avec script d’installation | Inventaire en lecture seule, faits/inférences séparés, aucune exécution du script. |
| `CON-02` Conception traçable | `C-REQ`, `C-ARC`, revue de conception | changement local et changement transversal | Liens exigences/composants/interfaces vérifiés ; alternatives et risques proportionnés. |
| `CON-03` Préserver les frontières | `C-ARC`, `C-EXE` | dépendance interdite dans `F-JAVA` | Graphe et constat normalisé font échouer la règle malgré les tests métier verts. |
| `CON-04` Évaluer la réutilisation | revue de conception, `C-DOC`, `C-SEC` | réseau permis/refusé | Alternatives examinées avec licence, maintenance et compatibilité ; absence de réseau visible. |
| `CON-05` Connaissance versionnée | `C-DOC`, `C-REQ` | lien cassé et API modifiée | Liens contrôlés, décision documentaire présente, révision et provenance enregistrées. |

### 9.2 Contexte, agents et modèles

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `CTX-01` Contexte par intervention | `C-CTX`, `C-EVD` | implémentation puis revue | Deux manifestes minimaux, versionnés, motivés et distincts. |
| `CTX-02` Instructions effectives | `C-CTX`, `C-SEC` | `F-HOSTILE` | Hiérarchie calculée ; consigne du dépôt sans effet sur les permissions ; conflit visible. |
| `CTX-03` Chargement progressif | `C-CTX`, `C-EXT` | skill invoqué/non invoqué | Ressources chargées à la demande et tracées ; présence sans valeur de preuve. |
| `CTX-04` Compaction | `C-CTX`, `C-PI`, `C-FSM` | compaction et nouvelle session | Obligations, décisions, exclusions et budgets reconstruits à l’identique ou arrêt explicite. |
| `CTX-05` Observation et justification | `C-CTX`, `C-SEC`, revue | producteur narratif et page injectée | Manifeste reviewer sans raisonnement du producteur ; données externes non autoritatives. |
| `AGT-01` Capacités réelles | `C-AGT`, `C-EXT` | profils compatibles/incompatibles | Diagnostic avant appel facturable ; champ non supporté refusé explicitement. |
| `AGT-02` Fournisseur et modèle explicites | `C-AGT` | deux fournisseurs simulés, endpoint local incomplet | Identifiants natifs conservés ; absence de repli ; erreur de capacité lisible. |
| `AGT-03` Boucle d’outils | `C-AGT`, `C-SEC` | `F-AGENTS` | Appels et résultats corrélés ; arguments validés ; outil inconnu sans effet. |
| `AGT-04` Rôles spécialisés | `C-AGT`, `C-SEC`, `C-CTX` | reviewer tentant deux écritures | Mandats et droits distincts ; écritures directe et indirecte bloquées. |
| `AGT-05` Délégation et concurrence | `C-AGT`, `C-FSM` | arbre au plafond et annulation | Profondeur, nombre, sous-budgets et héritage des droits respectés ; descendants arrêtés. |
| `AGT-06` Sorties de modèle | `C-AGT`, `C-REQ` | JSON invalide, statut inconnu, fausse preuve | Erreurs typées ; proposition valide distincte d’une décision ; référence inconnue refusée. |
| `AGT-07` Changement de modèle et coût | `C-AGT`, `C-EVD` | panne avec/sans repli autorisé | Frontière d’intervention, contexte transféré et coût connu/inconnu tracés ; aucun repli silencieux. |

### 9.3 Vérification, décision et reprise

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `VER-01` Exécuter les contrôles | `C-EXE`, `C-FSM` | agent déclarant succès sans test | Tous les contrôles obligatoires lancés par le noyau avec commande, environnement et timeout enregistrés. |
| `VER-02` Assertion ou incident | `C-EXE`, `F-PROTOCOL` | assertion fausse, binaire absent, timeout, rapport illisible | `FAIL` réservé au défaut observé ; incidents en `INDETERMINATE`, jamais verts. |
| `VER-03` Preuve liée au candidat | `C-CAN`, `C-EXE`, `C-FSM` | fichier modifié après mesure | Empreintes différentes ; preuve périmée exclue ; producteur arrêté pendant la mesure. |
| `VER-04` Angles multiples | `C-EXE`, `C-PRO` | propriétés, fuzzing, mutation | Seeds, corpus, budgets, contre-exemples et mutants exclus conservés ; interprétation bornée. |
| `VER-05` Qualifier la détection | `C-PRO` | contrôle aveugle et défaut ciblé | Témoin valide accepté, défaut détecté, capteur aveugle refusé à G2. |
| `VER-06` Revues et humains | `C-HUM`, revue de contrat | revues contradictoires, ancienne approbation | Constats complets ; arbitrage prévu ; preuve humaine limitée à l’objet et à la révision. |
| `VER-07` Performance et exploitation | `C-PERF`, revue exploitation | mesures répétées et résultat post-déploiement | Échauffement, dispersion, baseline et seuils ; obligation différée non comptée comme satisfaite. |
| `VER-08` Dette, régression, instabilité | `C-QLT`, `C-EXE` | `F-LEGACY`, test alternant | Résultats base/candidat comparables ; défauts séparés ; instabilité conservée sans relance opportuniste. |
| `DEC-01` Décisions centralisées | `C-FSM`, `C-EVD` | séquences générées et sortie agent « accepté » | Seul le noyau écrit la gate ; preuves retenues/manquantes listées ; déterminisme vérifié. |
| `DEC-02` Feedback exploitable | `C-FSM`, revue UX | échecs multiples et sortie volumineuse | Feedback borné avec exigence, attendu, observé, localisation, preuve et action ; causes non masquées. |
| `DEC-03` Limiter les tentatives | `C-FSM`, `C-AGT` | budget de tentatives, relances techniques | Compteurs séparés et persistants ; la tentative qui dépasse le budget est refusée sans décision. |
| `DEC-04` Détecter la stagnation | `C-FSM` | candidats identiques puis progrès réel | Mesure de progrès versionnée ; arrêt `stagnation` sans faux arrêt sur progrès observable. |
| `DEC-05` Suspendre et reprendre | `C-FSM`, `C-EVD`, `C-PI` | crash, compaction, changement de session | Reprise au dernier point cohérent, aucun effet confirmé rejoué, incertitude réconciliée. |
| `DEC-06` Décision et dérogation | `C-HUM`, `C-PI` | agent forgeant une approbation, rôle insuffisant | Refus des provenances invalides ; décision authentifiée, bornée, motivée et expirante si nécessaire. |

### 9.4 Sécurité, Git et preuves

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `SEC-01` Moindre privilège | `C-SEC` | matrice rôles/opérations | Chaque opération permise ou refusée selon le mandat minimal ; refus journalisés. |
| `SEC-02` Toutes les voies d’action | `C-SEC`, revue sécurité | outils directs, shell, extension, symlink | Aucune voie ne contourne la politique ; limites de plateforme documentées. |
| `SEC-03` Référentiel protégé | `C-SEC`, `C-CAN`, `C-EVD` | altération protocole/preuve | Écriture empêchée ou détectée ; gate invalidée ; événement attribué. |
| `SEC-04` Effets externes | `C-SEC`, `C-HUM` | réseau, installation, secret, push, publication | Refus par défaut ; autorisation minimale liée à l’effet, à la portée et à la durée. |
| `SEC-05` Exposition des données | `C-SEC`, `C-EVD` | secrets sentinelles dans logs/prompts | Aucun secret dans export expurgé ni contexte inutile ; retraits déclarés. |
| `GIT-01` Préserver le dépôt | `C-GIT`, `C-CAN` | `F-NOHEAD`, dépôt sale, abandon | Inventaire avant écriture et comparaison après ; fichiers initiaux intacts. |
| `GIT-02` Candidat intégral | `C-CAN`, `C-UIR` | suivis, non suivis, suppressions, renommages | Manifest complet avec origine `agent/user/mixed/unknown` seulement si observable. |
| `GIT-03` Intégrer le vérifié | `C-GIT`, `C-FSM` | `F-GIT` | Digest G5 identique à l’objet appliqué ; reçu avant/après ; aucun push/déploiement. |
| `GIT-04` Changements concurrents | `C-GIT`, `C-PRG` | worktrees/branches compatibles et conflictuels | Isolation démontrée, conflit explicite, aucun mélange de candidats ou de preuves. |
| `GIT-05` État connu | `C-GIT`, `C-EVD` | abandon et panne | Retour ou reprise documenté sans commande destructive implicite ; travail initial conservé. |
| `EVD-01` Dossier autonome | `C-EVD` | changement complet hors ligne | Export lisible sans Pi ni fournisseur, avec demande, décisions, preuves, limites et reçus. |
| `EVD-02` Journal utile | `C-EVD`, `C-FSM` | événements dupliqués et concurrents | Ordre, causalité, attribution et idempotence vérifiés ; une seule décision normative. |
| `EVD-03` Intégrité et rétention | `C-EVD` | `F-EVIDENCE` | Corruption/absence détectée ; décision courante invalidée ; politique de rétention appliquée. |

### 9.5 Expérience Pi et revue visuelle

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `UX-01` Workflow dans le TUI Pi | `C-PI`, parcours V3 | `F-PIHOST`, programme à deux incréments | Création, préparation, revue, décision, reprise et intégration accessibles sans CLI 495 ni CI. |
| `UX-02` Autres entrées Pi | `C-PI` | RPC, JSON, print, SDK | Même opération et verdict ; représentation adaptée ; aucune dépendance à un widget. |
| `UX-03` Progression compréhensible | `C-PI`, revue UX | succès, blocage, attente, incident | Phase, statut, action en cours, cause et prochaine action compréhensibles sans logs bruts. |
| `UX-04` Décisions via Pi | `C-PI`, `C-HUM` | mode interactif et non interactif | Provenance garantie ou `decision_required` persistant ; navigation sans approbation implicite. |
| `UX-05` Sessions Pi | `C-PI`, `C-EVD` | reload, fork, changement de projet | Programme et autorité résolus ; aucune opération dupliquée ; état reprenable. |
| `UX-06` Arbre et statuts | `C-UIR`, revue accessibilité | `F-REVIEW` | Union des chemins, agrégation correcte, statuts lisibles sans couleur, renommage honnête. |
| `UX-07` Lecture soignée | `C-UIR`, snapshots | modifications, indentation, `+`/`-` littéraux | Blocs ANCIEN/NOUVEAU fidèles, sans préfixes de patch, hunks ni numéros de ligne. |
| `UX-08` Navigation et contexte | `C-UIR`, observation TUI | clavier, resize, constat, retour conversation | Focus visible, sélection conservée, mode étroit complet, aucun effet d’écriture. |
| `UX-09` États identifiés et actualité | `C-CAN`, `C-UIR` | C1 consulté puis C2 produit | Référence et candidat affichés ; C1 reste figé ; C2 signalé ; bascule volontaire. |
| `UX-10` Cas particuliers | `C-UIR`, `C-SEC` | `F-SPECIAL`, `F-HOSTILE`, `F-LARGE` | Types/métadonnées/limites honnêtes ; contenu inerte ; aucune fausse comparaison textuelle. |
| `UX-11` Même information hors TUI | `C-UIR`, `C-PI` | `F-REVIEW` via cinq entrées | Identités, statuts, portions, positions et limites canoniques identiques. |

### 9.6 Extensions, amélioration et programmes

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `EXT-01` Contrat d’extension | `C-EXT`, `C-REQ` | manifeste valide/invalide | Identité, version, provenance, licence, capacités, permissions, effets et modes validés. |
| `EXT-02` Chargement et mise à jour | `C-EXT`, `C-SEC` | `F-EXTENSIONS` | Extension du dépôt non chargée ; mise à jour hors tentative ; qualification invalidée. |
| `EXT-03` Technologies cibles | `C-EXT`, `C-EXE` | `F-TS`, `F-JAVA` | Même contrat canonique, outils natifs distincts, verdicts et constats normalisés. |
| `EXT-04` Pi derrière un port | `C-PI`, contrôle architectural | faux hôte Pi et import interdit | Domaine testable sans Pi ; API publiques seules utilisées ; événements traduits sans fuite d’autorité. |
| `EXT-05` Profils partageables | `C-EXT`, `C-SEC` | export/import de profil | Versions et dépendances résolues ; aucun secret, historique privé ou permission personnelle. |
| `IMP-01` Défauts échappés | `C-EVD`, revue causale | défaut lié à un candidat historique | Lien complet vers protocole historique ; hypothèse de cause explicite ; aucune réécriture. |
| `IMP-02` Renforcement séparé | `C-PRO`, `C-QLT` | défaut cible + cas valides + régression | Nouveau changement et nouvelle révision ; meilleure détection sans faux rejets disproportionnés. |
| `IMP-03` Comparer les modèles | `C-AGT`, `C-PERF` | corpus tenu à l’écart, répétitions | Mandat/budgets identiques ; succès, instabilité, reprises et coûts connus/inconnus comparables. |
| `IMP-04` Optimiser sous contraintes | `C-PERF`, `C-FSM` | candidat rapide mais incorrect | Métrique améliorée mesurée, contrainte échouée, candidat rejeté, seuil inchangé. |
| `IMP-05` Jugement de l’ingénieur | revue de gouvernance, `C-HUM` | décisions critiques et incertitudes | Limites exposées ; responsabilité et arbitrages attribués ; aucune prétention d’expertise universelle. |
| `PRG-01` Dépôt vierge | `C-PRG`, `C-GIT` | `F-EMPTY`, `F-NOHEAD` | Référence initiale explicite, socle préparatoire, interruption/reprise et première intégration exactes. |
| `PRG-02` Socle applicatif | `C-PRG`, `C-PRO`, `C-PKG` | socle positif et incomplet | Build, tests, structure, configuration et exploitation qualifiés avant incréments métier dépendants. |
| `PRG-03` Programme parent | `C-PRG`, `C-REQ` | `F-PROGRAM` | Objectifs globaux affectés à des incréments/jalons ; mission monolithique refusée. |
| `PRG-04` Réviser la trajectoire | `C-PRG`, `C-EVD` | contrat partagé modifié après deux incréments | Impact calculé ; seuls éléments dépendants réévalués ; budgets conservés. |
| `PRG-05` Accepter l’ensemble | `C-PRG`, `C-EXE`, revue globale | incréments verts mais e2e incompatible | Verdict de jalon recalculé sur le candidat intégré ; obligation globale restante bloque. |

### 9.7 Préparation des contrôles et connaissance documentaire

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `PRE-01` Diagnostiquer les contrôles | `C-PRO`, `C-EXE` | tests présents mais non découverts | Cartographie séparant présence, découverte, exécution, assertions, instabilité et angles morts. |
| `PRE-02` Développer les contrôles | `C-EXT`, `C-PRO` | `F-TS`, `F-JAVA` sans tests | Suites natives préparées et exécutées par contrat commun ; dépendances déclarées, aucune techno imposée. |
| `PRE-03` Capteur vs produit | `C-PRO` | fonctionnalité absente, fixture positive, runner cassé | G2 passe pour le capteur discriminant ; G5 échoue sur le produit ; panne reste indéterminée. |
| `PRE-04` Caractériser sans consacrer | `C-PRO`, `C-SEC`, revue métier | `F-LEGACY` avec bug et secret | Comportements légitimes protégés, bug maintenu comme écart, snapshot expurgé avant adoption. |
| `PRE-05` Évolution par cycle | `C-PRO`, `C-EXE` | stockage ajouté, état résiduel | Contrôles qualifiés avant autorité ; données isolées et nettoyées ; contre-exemples réutilisables. |
| `RAG-01` Besoin documentaire | `C-DOC`, revue de plan | technologie inconnue, corpus court/long | Questions enregistrées ; stratégie proportionnée ; absence de prétention sur la connaissance du modèle. |
| `RAG-02` Corpus officiel | `C-DOC`, `C-EVD` | `F-DOCS` | Origine, version, date, empreinte et droits ; versions incompatibles distinguées ; usage hors ligne. |
| `RAG-03` Retrieval traçable | `C-DOC` | questions témoins et sans réponse | Passage pertinent de la bonne version avec source ; `non trouvé` sur absence ; budget respecté. |
| `RAG-04` Usage de la documentation | `C-DOC`, `C-EXE` | API plausible mais absente | Choix sourcé puis compilation/typage/test rejette l’API inexistante ; écart conservé. |
| `RAG-05` Maintenir/protéger le corpus | `C-DOC`, `C-SEC` | upgrade, corpus privé, injection | Références périmées invalidées ; aucun envoi non autorisé ; instructions traitées comme données. |

### 9.8 Architecture, qualité et expertise

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `ARC-01` Architecture réelle | `C-ARC`, observation | docs en couches mais cycle réel | Graphe/localisations démontrent le cycle, divergence et angles morts. |
| `ARC-02` Architecture adaptée | revue architecture, `C-REQ` | petite application et contrainte incompatible | Alternatives proportionnées, coûts/risques explicites, aucune architecture universelle imposée. |
| `ARC-03` Migration progressive | `C-ARC`, `C-PRG` | `F-LEGACY` multi-incréments | Contrats transitoires, coexistence, retour arrière et échéance des exceptions vérifiés. |
| `ARC-04` Génération contrainte | `C-ARC`, `C-CTX`, `C-CAN` | responsabilité placée dans module interdit | Mandat contient règles actives ; constat structurel bloque ; changement de frontière exige révision. |
| `ARC-05` Dérive et cible | `C-ARC`, `C-EVD` | dépendance ancienne restante au jalon | Historique des écarts et exceptions ; cible partielle distinguée de la conformité globale. |
| `QLT-01` Référentiel contextualisé | `C-QLT`, revue qualité | deux composants/stacks | Règles, seuils, sources, dates, raisons et oracles explicites ; score global non substitutif. |
| `QLT-02` Baseline exploitable | `C-QLT` | `F-LEGACY` avec code tiers/généré | Constats localisés par périmètre, gravité et fiabilité ; absence d’analyseur signalée. |
| `QLT-03` Réduction de dette | `C-QLT`, `C-PRG` | campagne sans fonctionnalité | Incréments priorisés, objectifs mesurables, non-régression et critères d’arrêt. |
| `QLT-04` Non-dégradation | `C-QLT`, `C-CAN` | nouvelle violation, renommage, suppression linter | Nouvelle violation bloque malgré score amélioré ; contournement et dette déplacée détectés. |
| `QLT-05` Remise en conformité | `C-QLT`, `C-PRG` | baseline, cible, exception expirée | Différentiel supprimé/restant, versions de règles, propriétaire/échéance ; clôture bloquée si nécessaire. |
| `EXP-01` Disciplines applicables | `C-REQ`, revue multidisciplinaire | projet données personnelles/API publique | Chaque discipline traitée, justifiée NA ou à instruire ; omissions critiques bloquantes. |
| `EXP-02` Choix proportionnés | revue de conception | service distribué injustifié et solution simple | Contraintes, alternatives, bénéfices, coûts, risques et vérification ; profondeur adaptée au risque. |
| `EXP-03` Expertises nécessaires | `C-PRO`, revues spécialisées, `C-HUM` | migration de données | Vérifications d’intégrité/compatibilité/reprise ; avis non étayé insuffisant ; désaccord arbitré. |
| `EXP-04` Démarche et résultat | campagne de benchmark + revue humaine | corpus conception/sécurité/qualité/exploitation | Défauts, reprises et décisions contestées mesurés ; périmètre validé et limites publiés. |

### 9.9 Exigences non fonctionnelles

| Exigence | Contrôles | Fixtures | Preuve attendue |
| --- | --- | --- | --- |
| `NFR-01` Environnement reproductible | `C-PKG`, `C-EVD` | installation neuve, dépendance absente | Package Pi versionné, inventaire complet, diagnostic avant modèle, aucun update pendant tentative. |
| `NFR-02` Open source et local | `C-PKG`, revue licences, `C-SEC` | réseau fermé et modèle local | SBOM/notices compatibles ; parcours et export locaux sans serveur de contrôle ni compte éditeur. |
| `NFR-03` Cohérence transactionnelle | `C-EVD`, `C-GIT`, pannes injectées | crash avant/après chaque effet | État ancien ou nouveau cohérent ; effet incertain explicitement réconcilié ; aucun « exactly once » inventé. |
| `NFR-04` Réactivité et ressources | `C-PERF` | `F-LARGE` | Les trois garanties de NFR-04 tenues au réglage en vigueur (§12) ; streaming et mémoire bornée. |
| `NFR-05` Portabilité qualifiée | `C-PKG`, V4 | macOS arm64, Linux x86-64, contrôle OS-spécifique | Même parcours P0 ; profils d’isolation documentés ; incompatibilité diagnostiquée avant exécution. |
| `NFR-06` Observabilité locale | `C-EVD`, `C-SEC` | exécution instrumentée, export expurgé | Logs/métriques locaux, aucun endpoint de télémétrie par défaut, coûts inconnus marqués, limites d’export. |
| `NFR-07` Testabilité/maintenabilité | V0–V2, `C-ARC`, `C-AGT` | moteurs simulés, import Pi interdit | Corpus hors ligne sans modèle ; règle d’import échoue ; invariants testés sur séquences générées. |
| `NFR-08` Contrats évolutifs | `C-REQ`, `C-EVD`, `C-EXT` | archives anciennes et version future | Version majeure future refusée sans mutation ; migration conserve original, provenance et décisions. |

## 10. Couverture des règles et scénarios fonctionnels

La matrice des exigences est complétée par les suites suivantes :

| Suite | Références | Contrôles dominants | Critère de couverture |
| --- | --- | --- | --- |
| `S-INTAKE` | `SA-001` à `SA-007` | `C-REQ`, `C-PRG`, `C-GIT`, `C-PI` | Création, vide/sans HEAD, ambiguïté, DAG et indépendance |
| `S-PROTOCOL` | `SA-008` à `SA-014` | `C-PRO`, `C-EXE`, `C-SEC` | Préparation, discrimination, gel, exécution et incidents |
| `S-LOOP` | `SA-015` à `SA-021` | `C-FSM`, `C-AGT`, `C-GIT`, `C-EVD` | Tentatives, modèles, rôles, reprise et intégration |
| `S-REVIEW` | `SA-022` à `SA-029` | `C-UIR`, `C-CAN`, `C-PI`, `C-SEC` | Arbre, rendu, clavier, snapshot, cas spéciaux, multicanal |
| `S-DECISION` | `SA-030` à `SA-036` | `C-HUM`, `C-FSM`, `C-EVD`, `C-QLT` | Autorité, portée, causes, dette, arbitrage et export |
| `S-PROGRAM` | `SA-037` à `SA-045` | `C-SEC`, `C-PRG`, `C-EXT`, `C-PERF` | Injection, global, migration, Pi, extensions et amélioration |
| `S-TRANSVERSE` | `REC-01` à `REC-47` | Tous selon matrice amont | Chaque scénario possède au moins un témoin et un contre-exemple lorsque pertinent |

Les règles `RM-001` à `RM-086` sont testées au niveau V0 par tables de décision et propriétés. Chaque règle doit être reliée à au moins un scénario, un contrôle de contrat ou une revue. Pour les invariants de sécurité et de décision, une couverture de ligne ne suffit pas : les mutations critiques correspondantes doivent être tuées.

## 11. Revues obligatoires de qualification

| Revue | Périmètre | Sortie exigée |
| --- | --- | --- |
| Revue fonctionnelle | Concordance besoins, spécification, règles, scénarios et preuves | Constats par exigence et lacunes de couverture |
| Revue d’architecture | Frontières noyau/Pi/adaptateurs, sens des dépendances, testabilité | Graphe observé, écarts et risques résiduels |
| Revue sécurité | Permissions effectives, confinement, secrets, extensions, chaîne d’approvisionnement | Modèle de menace mis à jour et constats localisés |
| Revue UX/accessibilité | TUI, clavier, terminal étroit, statut sans couleur, modes non TUI | Résultats des tâches, obstacles, limites et acceptabilité |
| Revue licences/distribution | Code, dépendances redistribuées, notices, packaging Pi | Inventaire et compatibilité des licences |
| Revue exploitation | Reprise, diagnostics, ressources, logs, export et support hors ligne | Procédure éprouvée et risques opérationnels |

Une revue obligatoire n’est valide que si le reviewer dispose d’un mandat en lecture seule, du candidat exact, des critères, des preuves nécessaires et d’un format de constat validé. Les divergences restent visibles et suivent la règle d’arbitrage préenregistrée.

## 12. Règle de décision de livraison

Une version de 495 peut être qualifiée pour un niveau de livraison donné uniquement si :

1. toutes les exigences applicables à ce niveau possèdent une ligne de matrice et des preuves valides ;
2. tous les contrôles utilisés comme autorité ont une qualification courante ;
3. toutes les suites P0 applicables passent sur macOS arm64 et Linux x86-64 ;
4. aucun `FAIL`, `INDETERMINATE` ou `NOT_RUN` obligatoire n’est masqué par un score agrégé ;
5. les revues obligatoires sont présentes et leurs constats bloquants sont clos, explicitement refusés ou couverts par une dérogation autorisée ;
6. le build, le package Pi, les sources revues et les artefacts testés possèdent la même identité de livraison ;
7. le dossier autonome peut être vérifié hors ligne et son intégrité est valide ;
8. l’autorité humaine prévue confirme la portée exacte de la qualification et ses limites.

Le résultat publié indique séparément : `qualified`, `not_qualified` ou `indeterminate`, les plateformes, entrées Pi, adaptateurs, stacks, capacités P0/P1/P2 et restrictions effectivement couvertes.

## 13. Artefacts produits

La campagne de qualification produit au minimum :

- le manifeste du référentiel gelé ;
- le catalogue versionné des contrôles et leurs fiches de qualification ;
- le manifeste et les empreintes des fixtures ;
- les rapports V0 à V5 dans le format canonique ;
- la matrice de couverture résolue avec liens vers les preuves ;
- les constats et décisions des revues obligatoires ;
- la matrice plateformes × entrées Pi × profils × stacks ;
- les rapports d’intégrité, de licences, de sécurité, de performance et d’accessibilité ;
- le verdict final et ses limites ;
- un export autonome et expurgé destiné à la publication ou à l’audit.

## 14. Critères de complétude avant conception technique

La conception de vérification est prête à alimenter la conception technique lorsque :

1. chaque exigence amont possède un contrôle et une preuve attendue dans la matrice ;
2. les contrats canoniques de preuve, constat et verdict sont acceptés ;
3. les frontières entre tests, observations, revues et décisions humaines sont acceptées ;
4. le corpus minimal de fixtures et sa stratégie de versionnement sont acceptés ;
5. les contrôles critiques à qualifier par contre-exemple et mutation sont identifiés ;
6. les campagnes V0 à V5 et leur ordre sont acceptés ;
7. les plateformes, entrées Pi et stacks de la première qualification sont confirmées ;
8. les règles de décision et d’indétermination ne laissent aucun succès implicite ;
9. la vue de revue possède une stratégie de preuve couvrant modèle, rendu, interaction et accessibilité ;
10. les décisions restant techniques sont explicitement reportées sans réduire une propriété à vérifier.

## 15. Décisions à porter dans la conception technique

| Sujet | Contrainte de vérification déjà acquise |
| --- | --- |
| Frameworks et organisation des tests | V0–V5 doivent rester exécutables localement et sans modèle pour V0–V3. |
| Représentation persistée des preuves | Contrat versionné, intégrité, lecture hors ligne et migration testable. |
| Simulateurs de Pi et de fournisseurs | Scripts déterministes couvrant streaming, outils, erreur, timeout, annulation et reprise. |
| Moteur de propriétés et de panne | Séquences reproductibles, seeds conservées, réduction des contre-exemples. |
| Rendu TUI et snapshots | Données canoniques indépendantes ; snapshots complétés par tests sémantiques et revue clavier. |
| Isolation macOS/Linux | Même matrice d’attaque, capacités et limites explicites par plateforme. |
| Stockage des corpus volumineux | Streaming, pagination, troncature visible et empreintes stables. |
| Format des rapports natifs | Pièces jointes possibles, mais normalisation obligatoire avant décision. |
| Seuils finaux de performance | Mesurés sur machines de référence documentées avant engagement de livraison. |

