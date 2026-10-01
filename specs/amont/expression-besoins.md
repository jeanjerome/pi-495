# Expression de besoins — Harness de développement logiciel

**Version :** 1.3 — 15 septembre 2026  
**Statut :** proposition de référence pour la conception et l’implémentation  
**Nom de travail :** 495, sans dépendance des exigences à ce nom  
**Public :** responsable produit, architecte, développeurs du harness, agents d’implémentation, responsables de validation et utilisateurs techniques.

## 1. Objet et portée du document

Ce document spécifie un produit capable de créer une application, de la faire évoluer et de remettre progressivement un code existant en conformité avec un référentiel explicite d’architecture et de qualité. Il conduit aussi bien un changement localisé qu’un programme de développement comportant plusieurs cycles, en mobilisant des modèles d’IA dans un environnement contrôlé. Il constitue une expression de besoins et un support de recette. Il ne décrit pas un produit déjà réalisé et ne vaut pas validation des composants envisagés.

**Évolution 1.1 :** prise en compte explicite du dépôt vierge, des programmes applicatifs complets, de la construction des moyens de vérification dans les technologies cibles, de la préparation documentaire avec RAG éventuel, de la trajectoire architecturale, de la réduction de la dette qualité et d’une démarche d’ingénierie comparable aux pratiques attendues d’une équipe expérimentée. Les identifiants précédents sont conservés ; les nouvelles familles PRG, PRE, RAG, ARC, QLT et EXP détaillent ces besoins. BES-04 passe en P0. Les parcours, gates, artefacts et livraisons sont mis en cohérence avec ce périmètre élargi.

**Évolution 1.2 :** Pi devient le point d’entrée exclusif du produit : TUI et autres modes publics de Pi. La distribution visée est un pi-package avec extension(s), adossé à un noyau de contrôle protégé. Les exigences de CLI propre au produit, de service public autonome et de pilotage par CI sont retirées. UX-01/UX-02 sont réécrites, UX-02 passe en P0 ; UX-04/UX-05 précisent décisions et cycle de vie. Cette révision remplace les orientations d’interface des versions précédentes sans réduire les besoins de développement et de modernisation.

**Évolution 1.3 :** ajout d’une vue de revue du projet intégrée au TUI Pi : arborescence à gauche, lecteur de contenu et de modifications à droite, statuts visuels accessibles et présentation sans syntaxe de diff ni numéros de ligne. UX-06 à UX-11 précisent navigation, fidélité, références comparées et adaptation aux autres entrées Pi. Cette vue fait partie du socle P0 ; sa réalisation avec les composants publics de Pi doit être qualifiée dès L0.

Deux articles constituent le point de départ :

- [S1 — Vibe coding : comment garder la maîtrise du code produit par l’IA](https://scalastic.io/vibe-coding-ai-software-quality/), Jean-Jérôme Lévy, 31 août 2026.
- [S2 — What is a Harness?](https://earendil.com/posts/what-is-a-harness/), Earendil, 20 août 2026.

Le premier motive le contrôle du changement ; le second explicite le substrat d’exécution et l’autonomie de l’utilisateur. La couverture thématique des deux textes figure en section 18. Les exigences détaillées ci-dessous sont des propositions originales de produit et de recette : les articles ne prescrivent ni ces identifiants, ni ces états, ni ces contrats, ni les valeurs de configuration retenues.

Les articles servent de justification, pas de spécification transitive. Un agent chargé d’implémenter ce document ne doit pas traiter un exemple, un commentaire ou une future modification d’une source web comme une nouvelle obligation. Une évolution du besoin passe par une nouvelle révision explicite de ce document.

### 1.1 Conventions normatives

**DOIT** indique une obligation dans le périmètre de livraison où elle est prévue. **DEVRAIT** indique une recommandation dont un écart demande une justification. **PEUT** indique une capacité optionnelle. Chaque exigence numérotée possède un critère de recette ; les critères doivent être déclinés en tests et preuves pendant la conception.

| Priorité | Signification |
| --- | --- |
| P0 | Nécessaire à la première livraison permettant un changement accepté et intégré sous contrôle. |
| P1 | Nécessaire à la cible produit complète ; report possible après cette première livraison. |
| P2 | Extension optionnelle ; absence explicitement annoncée, sans dégrader les obligations P0/P1. |

La priorité produit ne constitue pas une sévérité de défaut et ne permet pas de contourner une exigence obligatoire du projet cible. Toute capacité indisponible mais requise par un changement bloque ce changement, même si son implémentation est prévue plus tard.

### 1.2 Décisions et hypothèses de départ

- Produit local et open source, installé et utilisé dans Pi ; aucune plateforme SaaS du harness n’est nécessaire. Le TUI est l’expérience interactive de référence et les autres entrées publiques de Pi doivent accéder aux mêmes opérations selon leurs capacités.
- Applications cibles indépendantes du langage du harness. Un premier adaptateur générique de commandes précède les intégrations spécialisées.
- Pi est l’hôte utilisateur retenu. Un pi-package en TypeScript avec extension(s) est recommandé ; SDK et communications entre processus sont des choix internes à qualifier en section 17.
- Le noyau de décision reste indépendant des API Pi et des packages. Les extensions communautaires sont facultatives tant que leur utilité et leur compatibilité ne sont pas démontrées.
- Les conditions commerciales d’un fournisseur de modèles sont distinctes de la licence du harness. Une configuration entièrement locale doit être possible avec un moteur et un modèle compatibles.
- Les installations de dépendances sont prises en charge par une procédure reproductible du produit ; aucune collection de plugins à installer manuellement sur chaque poste ne constitue un prérequis implicite.

L’entrée par Pi est une contrainte adoptée du demandeur. Les détails internes restent à qualifier et ne prescrivent pas une réécriture immédiate d’un existant Python.

Dans ce document, « sans CLI propre » signifie qu’aucune commande autonome de type `495 ...` ni programme séparé n’est requis pour utiliser le produit. Le lancement de Pi et ses modes natifs restent ceux de Pi. Les accès RPC/SDK de Pi servent ses autres interfaces ; ils ne constituent pas une API publique autonome du harness. Aucun usage du harness comme job de CI n’est à fournir. Les outils de build, commandes et tests nécessaires à l’application restent utilisables en interne ; l’exclusion concerne le point d’entrée du harness, pas les outils qui vérifient le code cible.

## 2. Finalités, périmètre et acteurs

### 2.1 Résultats attendus

Le produit doit produire soit un changement accepté avec un dossier de preuves, soit un arrêt explicable et reprenable. Il doit permettre d’identifier ce qui a été demandé, tenté, observé et décidé, et sur quelle version du logiciel.

À l’échelle d’une application, il doit également établir l’état de départ, une cible explicite et une trajectoire : capacités fonctionnelles à livrer, moyens de contrôle à construire, documentation à acquérir, architecture à préserver ou transformer, défauts qualité à éliminer. « À l’état de l’art » signifie ici des pratiques et outils pertinents, datés et justifiés pour ce projet ; cela ne désigne ni une architecture universelle ni l’adoption systématique de la technologie la plus récente.

Les résultats à mesurer sont : le taux d’acceptation indépendante, les défauts échappés après intégration, le coût d’un changement accepté, le nombre de reprises humaines, le délai de traitement, les échecs d’environnement et les régressions structurelles. Une hausse du nombre de lignes générées ou du taux de réussite déclaré par un agent n’est pas un indicateur de qualité suffisant.

### 2.2 Périmètre fonctionnel

Le produit couvre l’accueil d’une demande, la clarification, la spécification, le protocole de vérification, la conception, l’implémentation, les contrôles, les revues, la correction, la décision humaine, l’intégration Git, le rapport, la reprise et l’amélioration du dispositif de développement.

Il doit supporter un projet existant documenté ou non, un dépôt Git vierge sans commit, un répertoire vide explicitement autorisé à être initialisé, une correction, une évolution fonctionnelle, une refactorisation, une modernisation architecturale et une optimisation mesurable. La préparation du squelette applicatif et de ses moyens de contrôle fait partie du produit. La livraison en production constitue une action externe distincte de l’intégration ; elle n’est jamais implicite.

Le programme peut porter sur une application entière. Il est alors réalisé par incréments fonctionnels et par incréments de préparation ou de remise à niveau. La réussite d’une étape de préparation ne vaut pas livraison fonctionnelle, et l’acceptation de plusieurs incréments ne vaut pas automatiquement acceptation de l’application complète.

### 2.2.1 Matrice des situations d’entrée

| Situation | Travail préparatoire attendu | Résultat à établir |
| --- | --- | --- |
| Dépôt vierge | Cadrage du produit, choix de stack et d’architecture, squelette, chaîne de build et contrôles initiaux. | Socle reproductible puis premières tranches fonctionnelles acceptées. |
| Existant avec contrôles suffisants | Inventaire, mesure de référence, qualification des contrôles et analyse d’impact. | Évolution sans régression ni dégradation des règles adoptées. |
| Existant sans contrôles suffisants | Caractérisation des comportements, ajout d’infrastructures et de tests discriminants. | Capacité de vérifier les changements avant les modifications à risque. |
| Existant hors standards | Diagnostic d’architecture et qualité, référentiel cible, exceptions temporaires et trajectoire. | Réduction vérifiée des écarts par incréments, sans régression métier. |
| Technologies peu documentées dans le contexte du modèle | Acquisition et qualification de sources officielles, recherche ciblée, exemples exécutables. | Contexte technique utilisable et API vérifiées sur les versions réellement utilisées. |
| Besoin applicatif complet | Décomposition en capacités, dépendances, jalons et critères globaux. | Application évaluée dans son ensemble, obligations restantes explicitement suivies. |

Ces situations se combinent : un existant peut être à la fois mal testé, éloigné des standards et fondé sur une technologie inconnue du modèle.

Ne sont pas promis : absence de défauts, convergence garantie, déterminisme des générations, indépendance statistique des modèles, équivalence des fournisseurs, preuve formelle de toute propriété, sécurité absolue ou fonctionnement hors ligne des services distants.

### 2.3 Acteurs et responsabilités

| Acteur | Responsabilité | Autorité |
| --- | --- | --- |
| Demandeur | Exprimer la valeur, les contraintes et les exemples attendus. | Préciser ou réviser le besoin. |
| Responsable du changement | Accepter le périmètre, les risques et les décisions métier. | Autoriser les étapes humaines configurées et l’intégration. |
| Mainteneur du projet | Définir les règles et contrôles adaptés à la cible. | Approuver les politiques dans son périmètre. |
| Responsable du programme | Piloter la cible applicative, les jalons et les obligations transversales. | Adopter les changements de trajectoire dans le mandat global. |
| Référent de discipline | Évaluer les choix relevant d’une expertise particulière. | Avis justifié ou approbation requise par la politique ; pas d’autorité hors de sa portée. |
| Agent producteur | Proposer des artefacts et modifier un espace autorisé. | Aucune autorité d’acceptation du changement. |
| Agent de revue | Produire des constats à partir d’un contexte dédié. | Jugement consultatif, éventuellement requis par une gate. |
| Noyau du harness | Appliquer les politiques, calculer les gates et gérer l’état. | Seul auteur des décisions automatiques normatives. |
| Exécuteur de contrôles | Lancer les vérifications et produire des observations. | Attester l’exécution, pas reformuler les critères. |
| Administrateur local | Configurer moteurs, isolation, secrets et distribution. | Installer des composants approuvés. |

Une même personne peut cumuler plusieurs rôles. Une séparation de rôles d’agents ne crée pas à elle seule une séparation de permissions ni un oracle indépendant.

## 3. Modèle de fonctionnement et invariants

### 3.1 Trois boucles articulées

| Boucle | Entrée | Autorité de poursuite | Sortie |
| --- | --- | --- | --- |
| Exécution agentique | Mission, contexte, outils, budgets. | Le moteur exécute les actions proposées dans les limites imposées. | Candidat, résultat structuré, événements ou erreur. |
| Contrôle du changement | Candidat et référentiel de vérification. | Le noyau applique les gates à des preuves indépendamment collectées. | Accepter, corriger, demander une décision ou arrêter. |
| Amélioration du harness | Défauts, incidents et évaluations comparées. | Le mainteneur accepte une évolution évaluée du dispositif. | Nouvelle politique, nouveau contrôle ou nouveau contexte versionné. |

La première boucle peut finir alors que le changement reste refusé. La troisième ne peut modifier rétroactivement le critère qui juge une tentative en cours.

### 3.2 Invariants non négociables

1. Une sortie du modèle ne peut écrire directement l’état « accepté » ou « intégré ».
2. Une décision porte sur un ensemble identifié : candidat, exigences, protocole, politiques et environnement.
3. Une preuve manquante, périmée ou inexploitable ne vaut jamais succès.
4. Un agent producteur ne peut modifier silencieusement les contrôles protégés qui déterminent son acceptation.
5. Une session de revue obligatoire utilise un contexte et des permissions explicitement préparés.
6. Une capacité non supportée est déclarée ; aucune substitution de modèle, de permission ou de contrôle n’est silencieuse.
7. Les tentatives, appels d’outils et délégations ont des budgets finis.
8. Le travail utilisateur et les effets externes sont préservés ; une reprise ne répète pas aveuglément une action.
9. Une configuration ou un package modifié entraîne une nouvelle empreinte d’exécution.
10. L’utilisateur conserve l’accès à ses artefacts et à ses rapports sans fournisseur particulier.

### 3.3 Vocabulaire de référence

| Terme | Sens dans ce document |
| --- | --- |
| Harness | Produit qui fournit l’exécution agentique et organise le contrôle du changement. |
| Moteur | Composant exécutant la conversation modèle-outils ; Pi est le premier candidat. |
| Changement | Unité suivie par le cycle de gates ; dans un programme, chaque incrément est conduit comme un changement distinct. |
| Intervention | Mission bornée confiée à un rôle avec un contexte, un profil et un budget. |
| Programme | Ensemble durable d’objectifs applicatifs réalisé par plusieurs incréments et jugé à ses jalons. |
| Incrément préparatoire | Travail livrant une capacité nécessaire : socle, documentation, tests ou infrastructure de vérification. |
| Baseline | État de référence mesuré, conservé avec candidat, environnement, règles et limites. |
| Référentiel cible | Ensemble adopté de standards contextualisés ; distinct de la simple mesure de l’existant. |
| RAG | Recherche de ressources dans un corpus puis injection de passages pertinents dans le contexte du modèle. |
| Tentative | Production d’un candidat dans un cycle de correction ; distincte d’une relance réseau. |
| Oracle | Moyen de déterminer si une observation satisfait un critère : assertion mécanique, revue ou décision humaine identifiée. |
| Contrôle | Procédure exécutée ou examen requis produisant une observation et un verdict selon son contrat. |
| Preuve | Enregistrement vérifiable de l’observation sur un objet identifié ; ne signifie pas nécessairement démonstration formelle. |
| Gate | Décision de passage qui applique une politique aux preuves et obligations courantes. |
| Protocole gelé | Révision adoptée des méthodes et critères, non modifiable par l’intervention productrice. |
| Candidat | Instantané complet des modifications proposées, avec identité indépendante du nom de branche. |
| Acceptation | Conformité établie au protocole courant dans son périmètre annoncé. |
| Intégration | Application confirmée du candidat vérifié à une destination Git autorisée. |
| Confinement | Restriction effective des accès par une frontière d’exécution ; distincte d’une consigne textuelle. |
| Profil qualifié | Combinaison de composants, versions, capacités et permissions ayant passé sa recette. |

## 4. Catalogue des exigences fonctionnelles

### 4.1 Demande, périmètre et incréments

#### BES-01 — Enregistrer une intention [P0]

Le système DOIT accepter une demande textuelle ou un fichier UTF-8, associé à un dépôt et à une référence de départ explicites. Il doit créer un identifiant de changement et conserver la demande initiale sans l’écraser lors des reformulations.

**Recette :** importer une demande, la reformuler puis exporter le dossier ; le texte initial, le dépôt, la référence résolue et les deux révisions restent identifiables.

#### BES-02 — Clarifier sans inventer [P0]

Le système DOIT distinguer faits fournis, hypothèses, questions et décisions. Une ambiguïté affectant le résultat attendu, les permissions ou l’acceptation doit provoquer une décision explicite ; une hypothèse réversible de faible portée peut être proposée avec son impact.

**Recette :** une demande ambiguë sur une règle métier ne produit pas une exigence validée par simple reformulation ; en mode non interactif, l’exécution s’arrête avec la question structurée.

#### BES-03 — Délimiter le changement [P0]

Le système DOIT enregistrer objectifs, hors-périmètre, composants visés, interfaces affectées, risques et dépendances. Le périmètre autorisé doit être distinct d’une simple liste de fichiers présumés : un changement transversal doit pouvoir être décrit et justifié.

**Recette :** une modification hors périmètre est détectée à l’observation du candidat et empêche son acceptation tant qu’une révision du périmètre n’a pas été approuvée.

#### BES-04 — Décomposer en incréments [P0]

Le système DOIT permettre des incréments possédant chacun un résultat vérifiable, un protocole, des dépendances et une clôture. Ce résultat peut être fonctionnel, préparatoire ou lié à une remise à niveau. Les dépendances doivent être acycliques ; l’acceptation d’un incrément ne valide pas automatiquement ses successeurs ni le programme entier.

**Recette :** refuser un cycle de dépendances et empêcher le démarrage d’un incrément dont un prédécesseur obligatoire est bloqué ; un incrément indépendant reste exécutable.

#### BES-05 — Versionner une réorientation [P0]

Le système DOIT traiter toute modification du besoin comme une révision avec auteur, raison et analyse d’impact. Les décisions et preuves dépendant d’une définition modifiée doivent perdre leur validité courante sans disparaître de l’historique.

**Recette :** changer une règle après une première validation conserve cette validation comme historique, invalide son usage courant et exige les vérifications affectées avant acceptation.

### 4.2 Exigences, contrats et protocole de vérification

#### REQ-01 — Structurer les exigences [P0]

Chaque exigence DOIT avoir un identifiant stable, une révision, un énoncé observable, une justification, une catégorie, un caractère obligatoire ou facultatif, des sources et un responsable. Son statut de définition doit être distinct de son verdict de satisfaction.

**Recette :** le validateur refuse les identifiants dupliqués, les références absentes et une exigence obligatoire sans critère d’acceptation ; une exigence facultative demeure visible dans le rapport.

#### REQ-02 — Couvrir les familles de contrats [P0]

Le modèle de données DOIT représenter les catégories produit, domaine, API, architecture, qualité, tests, sécurité, performance et exploitation, ainsi que des catégories supplémentaires enregistrées explicitement. Chaque famille doit être applicable, non applicable avec justification, ou encore à instruire.

**Recette :** une famille non évaluée n’est pas assimilée à « conforme ». Le rapport distingue notamment une performance mesurée d’une performance hors périmètre.

#### REQ-03 — Préenregistrer le protocole [P0]

Avant l’implémentation, chaque exigence obligatoire DOIT être reliée à un ou plusieurs moyens de vérification, une règle de combinaison et un comportement en cas d’échec ou d’indétermination. Le protocole doit référencer commandes, données, seuils, environnements, revues et décisions humaines nécessaires.

**Recette :** le démarrage d’une implémentation est refusé si une exigence obligatoire n’a pas de vérification exploitable. Un moyen manuel est recevable s’il est explicite et assigné.

#### REQ-04 — Séparer préparation et gel des contrôles [P0]

Un agent PEUT proposer et implémenter des tests ou des règles pendant une intervention de préparation dédiée. Le système DOIT distinguer proposition, exécution de préparation, qualification et adoption. Les contrôles adoptés deviennent inaccessibles en écriture au producteur de l’implémentation qu’ils jugent ; leurs modifications ultérieures ouvrent une révision et imposent une nouvelle qualification. Le gel protège les critères d’acceptation, pas tous les tests du projet : les tests supplémentaires du producteur restent possibles, avec leur provenance et leur statut explicites.

**Recette :** demander au producteur d’abaisser un seuil ou de supprimer un test protégé échoue ; une demande de modification produit un artefact de proposition sans modifier le protocole actif.

#### REQ-05 — Vérifier les liens sémantiques [P1]

Le système DOIT permettre d’expliquer pourquoi un contrôle vérifie une exigence, quelles situations il couvre et quelles limites demeurent. La présence d’un lien valide syntaxiquement ne doit pas suffire à prouver la pertinence du contrôle.

**Recette :** un test sans assertion métier, relié à une exigence métier, est soumis à une revue de pertinence ou à une qualification par contre-exemple ; le lien seul ne passe pas la gate du protocole.

### 4.3 Conception et connaissance du projet

#### CON-01 — Observer l’existant avant de concevoir [P0]

Le système DOIT relever structure, langages, commandes disponibles, interfaces, documentation et état Git. Il doit distinguer éléments observés, éléments inférés et capacités non vérifiées, sans exécuter de script de dépôt avant l’autorisation correspondante.

**Recette :** sur un dépôt comportant un script d’installation, la découverte en lecture seule décrit ce script sans l’exécuter ; les limites d’inspection sont consignées.

#### CON-02 — Proposer une conception traçable [P0]

Le système DOIT produire une proposition reliant chaque exigence aux composants et interfaces concernés, avec choix envisagés, alternatives utiles et risques. Pour une petite modification, une conception courte doit suffire ; son volume n’est pas un critère de réussite.

**Recette :** une correction localisée peut franchir la gate de conception avec un document bref, tandis qu’une nouvelle dépendance non justifiée est signalée.

#### CON-03 — Préserver et vérifier les frontières [P0]

Le système DOIT permettre d’associer une règle architecturale à une explication et à une vérification exécutable lorsque celle-ci existe. La règle adoptée doit couvrir la direction des dépendances et les interfaces concernées, y compris les contournements identifiés.

**Recette :** une fixture cible introduisant une dépendance interdite entraîne un échec observable même si ses tests fonctionnels passent.

#### CON-04 — Évaluer la réutilisation [P1]

Avant de créer un composant ou d’ajouter une dépendance, le système DOIT permettre la recherche d’une solution existante dans le projet puis, si autorisé, dans des sources externes. La décision doit considérer adéquation, maintenance, licence, installation, compatibilité et coût d’exploitation.

**Recette :** une proposition de nouvelle bibliothèque comprend les solutions existantes examinées et les raisons d’adoption ou de rejet ; l’absence de réseau est déclarée et non compensée par une référence inventée.

#### CON-05 — Maintenir une connaissance versionnée [P1]

Le système DOIT organiser les instructions, décisions d’architecture, guides, exemples et contrats avec des points d’entrée courts et des liens contrôlables. Une modification touchant un comportement documenté doit entraîner une décision sur la mise à jour documentaire.

**Recette :** un lien documentaire cassé est signalé ; une API changée sans décision de mise à jour du contrat ou de la documentation bloque les obligations documentaires configurées.

### 4.4 Contexte, instructions et skills

#### CTX-01 — Construire un contexte par intervention [P0]

Le système DOIT préparer un contexte adapté au rôle et à la phase, avec manifeste des documents, extraits, versions, empreintes et raisons d’inclusion. Les contraintes obligatoires doivent être identifiées séparément des informations exploratoires.

**Recette :** une intervention d’implémentation et une revue reçoivent deux manifestes distincts ; les éléments inclus sont retrouvables dans le dossier selon la politique de confidentialité.

#### CTX-02 — Maîtriser les instructions effectives [P0]

Le système DOIT appliquer une hiérarchie documentée : politique d’exécution du propriétaire, mandat du changement, instructions du rôle, connaissances du projet, données externes. Une instruction de rang inférieur ne peut élargir les permissions. Les contraintes imposées par un fournisseur doivent être reconnues comme extérieures à cette hiérarchie locale.

**Recette :** un fichier de dépôt demandant d’ignorer une interdiction de réseau ne modifie ni la politique effective ni l’exécution ; un conflit de consignes est visible.

#### CTX-03 — Charger progressivement les ressources [P1]

Le système DOIT prendre en charge les skills, modèles de prompts et références documentaires comme ressources versionnées, chargées au besoin. Un skill peut guider une action ou fournir un outil, mais sa seule présence ne constitue aucune preuve de conformité.

**Recette :** une compétence non invoquée ne charge pas tout son contenu ; une compétence conseillant un test n’autorise pas l’acceptation si l’exécuteur n’a pas fourni la preuve requise.

#### CTX-04 — Préserver les obligations pendant la compaction [P0]

Le système DOIT définir un budget de contexte et pouvoir reconstruire les contraintes actives après réduction ou remplacement d’une session. Un résumé de modèle ne peut être la seule copie des exigences, des décisions et des budgets restants.

**Recette :** forcer une compaction ou ouvrir une nouvelle session restitue les mêmes révisions normatives et les budgets restants ; les incertitudes d’estimation de tokens sont explicites.

#### CTX-05 — Séparer observation et justification [P0]

Une revue indépendante DOIT recevoir la demande, les critères, le candidat et les preuves nécessaires, sans recevoir par défaut le raisonnement narratif du producteur. Les sources web et les sorties d’outils doivent être marquées comme données non autoritatives ; leurs instructions ne peuvent devenir des règles d’exécution.

**Recette :** le manifeste de revue exclut les justifications du producteur, sauf ajout motivé ; une injection dans une page ou un log ne change pas les outils autorisés.

### 4.5 Modèles et interventions agentiques

#### AGT-01 — Décrire les capacités réelles [P0]

Chaque moteur DOIT annoncer ses capacités : outils, streaming, annulation, sessions, paramètres de raisonnement, limites connues et forme des résultats. Le harness doit refuser un profil incompatible avant une intervention facturée lorsque l’incompatibilité est détectable localement.

**Recette :** un modèle sans capacité nécessaire est refusé avant lancement ; un champ non supporté n’est ni ignoré ni converti arbitrairement.

#### AGT-02 — Choisir explicitement fournisseur et modèle [P0]

L’utilisateur DOIT pouvoir sélectionner le fournisseur, l’identifiant du modèle et ses paramètres natifs par rôle. Le système doit permettre des fournisseurs distants et un endpoint local compatible effectivement qualifié. Une compatibilité annoncée « OpenAI » ne constitue pas une preuve suffisante.

**Recette :** le même cas de contrat passe avec deux fournisseurs qualifiés ; un endpoint local dépourvu du format d’appels d’outils requis produit une erreur de capacité lisible.

#### AGT-03 — Piloter la boucle d’outils [P0]

Le moteur DOIT pouvoir itérer sur les appels proposés par le modèle. Le harness doit contrôler chaque action avant exécution, vérifier ses arguments et attribuer un identifiant à l’appel et à son résultat. Une action inconnue ou mal formée doit être refusée.

**Recette :** une réponse simulée contenant un outil inconnu n’exécute aucune commande ; les appels permis et leurs résultats sont corrélés, y compris lors d’un résultat en erreur.

#### AGT-04 — Définir des rôles spécialisés [P0]

Le système DOIT supporter au minimum préparation, implémentation et revue, avec mandats, contexte et droits distincts. Un rôle en lecture seule ne doit disposer ni d’écriture indirecte par shell ni de correction automatique cachée.

**Recette :** le rôle de revue tente une écriture par un outil direct puis par une commande ; les deux sont bloquées, et la revue reste exploitable.

#### AGT-05 — Borne de délégation et concurrence [P1]

Le système DOIT pouvoir exécuter des interventions parallèles dont les espaces et responsabilités sont compatibles. Le parent attribue des sous-budgets, une profondeur maximale et un plafond cumulatif ; un enfant ne peut élargir ses droits ni ignorer une annulation du changement.

**Recette :** un arbre de délégation atteint son plafond sans créer de nouveaux enfants ; l’arrêt du parent arrête ses descendants et préserve leurs résultats partiels.

#### AGT-06 — Qualifier les sorties de modèle [P0]

Le système DOIT valider les résultats attendus par un schéma versionné et des contrôles sémantiques. Un JSON bien formé affirmant « tout est conforme » reste une déclaration d’agent tant qu’il ne référence pas des preuves vérifiées par le noyau.

**Recette :** refuser une référence de preuve inconnue et un statut non autorisé ; distinguer erreur de format, résultat incomplet et proposition valide sans décision d’acceptation.

#### AGT-07 — Changement de modèle et coût [P1]

Le système DOIT permettre de changer de modèle entre interventions, ou en cours de session si le moteur le supporte, en enregistrant la frontière et le contexte retransmis. Un repli sur un autre fournisseur exige une politique explicite. Les tokens et coûts sont consignés quand disponibles, sinon marqués inconnus.

**Recette :** une indisponibilité sans repli autorisé arrête l’intervention ; avec repli autorisé, le nouveau fournisseur et les données transférées apparaissent dans le dossier.

### 4.6 Vérifications et oracles

#### VER-01 — Exécuter les contrôles obligatoires [P0]

Le noyau DOIT déclencher les contrôles du protocole sans dépendre du choix du modèle. Il doit supporter une commande et ses arguments séparés, un répertoire, une politique d’environnement, un timeout, un profil d’accès et une règle explicite d’interprétation du résultat.

**Recette :** un producteur simulé omet tout test et déclare sa tâche terminée ; le noyau exécute néanmoins tous les contrôles obligatoires avant de statuer.

#### VER-02 — Distinguer assertion et incident d’exécution [P0]

Chaque contrôle DOIT distinguer réussite, défaut constaté et impossibilité de conclure. Les erreurs d’installation, timeouts, pertes de processus, rapports illisibles et sorties tronquées nécessaires au verdict ne doivent pas être assimilés à des défauts fonctionnels ni à un succès.

**Recette :** une assertion fausse produit FAIL ; un binaire manquant ou un timeout produit INDETERMINATE avec motif technique. Les deux empêchent une gate obligatoire de passer.

#### VER-03 — Relier les preuves au candidat exact [P0]

Une exécution de contrôle DOIT porter sur un instantané identifié, avec protocole et environnement enregistrés. Les producteurs doivent être arrêtés ou exclus de cet instantané pendant la mesure. Les contrôles qui modifient des fichiers doivent utiliser un espace jetable ou produire un nouveau candidat à revérifier.

**Recette :** modifier un fichier après la mesure invalide l’utilisation de cette preuve pour le nouveau candidat ; un formateur ne modifie pas silencieusement le candidat accepté.

#### VER-04 — Multiplier les angles de vérification [P1]

Le système DOIT permettre des profils de tests d’acceptation, propriétés, fuzzing, mutation, contrats, tests différentiels et métamorphiques. L’activation dépend du risque du changement. Les seeds, corpus, budgets, mutants exclus et justifications doivent être conservés quand applicables.

**Recette :** reproduire un contre-exemple de propriété ou de fuzzing ; identifier un mutant survivant sans présenter automatiquement un score inférieur à 100 % comme un défaut, notamment en présence de mutants équivalents.

#### VER-05 — Qualifier la détection [P1]

Le système DOIT permettre d’éprouver un contrôle sur un candidat intentionnellement incorrect ou un cas négatif connu. Les tests écrits par l’agent producteur doivent être identifiés comme tels et ne doivent pas constituer l’unique fondement d’une affirmation d’indépendance.

**Recette :** un contrôle insensible à un défaut ciblé échoue à sa qualification ; une couverture élevée sans assertion suffisante ne suffit pas à valider le protocole.

#### VER-06 — Encadrer les revues et décisions humaines [P0]

Une revue DOIT produire des constats par exigence : observation, localisation, justification, gravité et limites. Un désaccord entre revues ne se résout pas automatiquement par majorité. Une preuve humaine doit identifier l’acteur, l’objet examiné et sa révision.

**Recette :** deux revues contradictoires entraînent la règle d’arbitrage enregistrée ; une approbation d’une ancienne révision est refusée pour le candidat courant.

#### VER-07 — Mesurer performance et exploitation [P1]

Le système DOIT supporter des mesures répétées avec échauffement, référence, dispersion et seuils définis par projet, ainsi que l’import de résultats d’intégration, de logs et de métriques d’exploitation. Un contrôle prévu après déploiement doit être distingué des conditions d’acceptation préintégration.

**Recette :** une mesure isolée bruitée ne permet pas de déclarer une amélioration significative ; une obligation qui ne peut être vérifiée qu’en production conserve son statut différé et son responsable, sans être comptée comme déjà satisfaite.

#### VER-08 — Distinguer défaut préexistant, régression et instabilité [P0]

Le système DOIT pouvoir exécuter les contrôles pertinents sur la référence initiale et sur le candidat dans des environnements comparables. Un défaut préexistant reste visible ; sa tolérance doit être prévue par une politique explicite qui interdit l’aggravation. Un contrôle instable doit être identifié et traité selon une règle préenregistrée, sans relances jusqu’au premier vert.

**Recette :** une fixture ayant un défaut ancien et un défaut nouveau produit deux constats distincts ; le nouveau défaut bloque. Un test alternant réussite et échec ne devient pas conforme parce qu’une relance a réussi ; son indétermination est conservée selon la politique.

### 4.7 Décisions, feedback et reprise

#### DEC-01 — Centraliser les décisions de gate [P0]

Le noyau DOIT calculer les transitions à partir d’une politique versionnée et de preuves valides. Chaque décision doit nommer les exigences évaluées, les motifs et les actions permises ensuite. Seules les interfaces du noyau peuvent écrire l’état normatif.

**Recette :** falsifier une réponse d’agent ou un fichier de session Pi avec un statut « accepté » ne change pas l’état du changement ; le même jeu de faits et la même politique produisent la même décision.

#### DEC-02 — Produire un feedback exploitable [P0]

Le système DOIT transmettre les écarts utiles : attendu, observé, localisation, contre-exemple, contrôle et action attendue. Le feedback doit être borné, expurgé selon la politique et relié aux preuves complètes accessibles au rôle autorisé.

**Recette :** un log volumineux ne remplace pas le contexte entier ; l’agent reçoit la cause de l’échec et une référence au rapport, avec indication de troncature éventuelle.

#### DEC-03 — Limiter les tentatives [P0]

Le système DOIT distinguer correction du candidat et nouvelle tentative d’exécution technique. Les plafonds de corrections, relances techniques, durée et appels d’outils doivent être appliqués par le contrôleur. Un timeout n’autorise pas une relance illimitée.

**Recette :** après épuisement du budget, aucune nouvelle invocation ne démarre ; le rapport différencie corrections épuisées et incident technique persistant.

#### DEC-04 — Détecter la stagnation [P1]

Le système DOIT repérer des candidats identiques, des constats répétés ou des alternances récurrentes et proposer arrêt, révision du besoin, revue ou changement de stratégie. Une absence d’amélioration ne doit jamais être masquée par une reformulation du rapport.

**Recette :** trois candidats de même empreinte avec les mêmes échecs déclenchent le seuil de stagnation configuré sans consommer tout le budget par défaut.

#### DEC-05 — Suspendre et reprendre [P0]

Le système DOIT persister l’état aux frontières d’effets et permettre une reprise après interruption. Il doit revalider configuration, références, disponibilité des preuves et actions incertaines avant de continuer. Un simple historique conversationnel ne constitue pas l’état de reprise.

**Recette :** tuer le processus pendant un contrôle puis reprendre conserve l’identifiant du changement, marque la mesure interrompue et la relance si nécessaire sans réintégrer un commit déjà intégré.

#### DEC-06 — Décision humaine et dérogation [P0]

Le système DOIT demander une décision uniquement lorsque la politique ou l’incertitude l’exige, avec alternatives et conséquences. Une dérogation doit être typée, bornée, motivée et attachée à une révision. Elle ne transforme pas une preuve FAIL en PASS ; elle révise le périmètre ou la politique puis entraîne un nouveau calcul.

**Recette :** l’approbation d’un risque laisse le défaut original visible et génère une nouvelle décision ; les invariants de protection de l’autorité ne sont pas contournables par une dérogation d’agent.

### 4.8 Outils, permissions et isolation

#### SEC-01 — Appliquer le moindre privilège [P0]

Toute intervention DOIT recevoir un profil explicite de lecture, écriture, réseau, commandes, secrets et effets externes. L’absence de permission vaut refus. Les profils des contrôles et des agents doivent être indépendants.

**Recette :** un outil d’édition autorisé dans le workspace ne peut écrire dans le dossier de preuves ; un contrôleur peut lire ses résultats sans exposer ses secrets au producteur.

#### SEC-02 — Confiner toutes les voies d’action [P0]

Le système DOIT utiliser une frontière d’exécution effective pour les fichiers, sous-processus et accès réseau dans son profil sécurisé. L’interception d’appels ou la séparation de processus seules ne suffisent pas. Les outils personnalisés, MCP, extensions, enfants et liens symboliques doivent être inclus dans le modèle de menace.

**Recette :** vérifier les refus par écriture directe, commande, lien symbolique, outil personnalisé et processus enfant ; une voie non confinée requise rend le profil non qualifié et bloque son usage sécurisé.

#### SEC-03 — Protéger le référentiel de décision [P0]

Les politiques, protocoles gelés, secrets du contrôleur et preuves normatives DOIVENT être hors des droits d’écriture du producteur et des extensions exécutées avec lui. Les scripts de validation dans le dépôt peuvent être proposés ou modifiés mais leur adoption nécessite une étape distincte.

**Recette :** altérer une copie locale d’un test d’acceptation ne change pas le contrôle protégé exécuté ; les deux versions sont distinguées.

#### SEC-04 — Contrôler les effets externes [P0]

Les outils DOIVENT déclarer leurs effets : lecture, mutation locale, réseau, mutation distante ou publication. Les actions d’envoi, de déploiement, de push ou de modification d’un service doivent respecter une autorisation explicite, persistante dans son périmètre et vérifiée au moment de l’effet.

**Recette :** une permission de lire une issue n’autorise pas à la commenter ; une autorisation déjà valide n’entraîne pas des demandes répétitives, et une autorisation révoquée interdit l’appel suivant.

#### SEC-05 — Réduire l’exposition de données [P0]

Le système DOIT permettre une liste explicite des variables d’environnement et secrets transmis, une politique de sorties réseau et l’expurgation des rapports. Il doit éviter les secrets dans les lignes de commande et conserver les règles de rétention choisies.

**Recette :** injecter un secret sentinelle dans l’environnement contrôleur puis dans une sortie d’outil ; il n’apparaît ni dans le contexte non autorisé ni dans l’export public, et la suppression est signalée sans divulgation.

### 4.9 Git, intégration et préservation du travail

#### GIT-01 — Préserver le dépôt utilisateur [P0]

Le système DOIT inspecter fichiers modifiés, index, fichiers non suivis et référence de départ avant l’exécution. Pour un dépôt avec historique, il crée par défaut un espace de travail séparé depuis une référence résolue ; l’inclusion de modifications locales existantes nécessite un choix explicite et un instantané. Pour un dépôt sans commit, il emploie la référence de contenu vide ou l’instantané initial explicitement défini par PRG-01, sans supposer que HEAD existe ni qu’un worktree Git peut être créé normalement.

**Recette :** un dépôt sale reste inchangé après une tentative échouée ; aucun nettoyage, stash ou reset implicite ne détruit le travail initial.

#### GIT-02 — Observer l’intégralité du candidat [P0]

Le système DOIT inventorier ajouts, modifications, suppressions, renommages, permissions, liens, fichiers binaires et dépendances modifiées. Un candidat doit être identifiable même avant commit, y compris pour les fichiers non suivis inclus.

**Recette :** une modification de bit exécutable ou un nouveau fichier non suivi autorisé modifie l’identité du candidat et apparaît dans le rapport.

#### GIT-03 — Intégrer le résultat vérifié [P0]

Le système DOIT distinguer acceptation et intégration. Avant intégration, il vérifie l’autorisation, l’identité du candidat, l’absence de producteurs actifs et l’état de la destination. Une fusion ou un rebase produisant un nouvel arbre nécessite les vérifications affectées, intégralement par défaut.

**Recette :** l’avancement concurrent de la branche cible empêche une intégration silencieuse ; un conflit résolu produit un nouveau candidat contrôlé avant clôture intégrée.

#### GIT-04 — Coordonner plusieurs changements [P1]

Le système DOIT gérer des verrous ou baux par ressource critique, sans supposer qu’une réservation textuelle de fichier suffit. Les fusions de travaux parallèles doivent être traitées comme une nouvelle combinaison à vérifier.

**Recette :** deux changements acceptés séparément mais incompatibles ensemble ne peuvent être intégrés avec leurs seules preuves individuelles.

#### GIT-05 — Revenir à un état connu [P0]

Le système DOIT permettre l’abandon d’un espace de tentative et préparer un retour arrière explicite après intégration. Une action distante ou un déploiement ne doit pas être présenté comme annulé par un simple revert Git.

**Recette :** l’abandon supprime uniquement les ressources attribuées au changement ; un retour arrière après intégration produit une opération traçable et indique les effets externes restant à traiter.

### 4.10 Preuves, historique et interfaces

#### EVD-01 — Conserver un dossier autonome [P0]

Le dossier DOIT contenir demande, artefacts adoptés, manifestes, résultats de contrôles, constats, décisions, environnement et identité du candidat. L’accès aux données doit rester possible sans compte fournisseur ni session Pi active.

**Recette :** ouvrir un export hors ligne permet de déterminer pourquoi le changement a été accepté ou bloqué, sans rejouer une inférence.

#### EVD-02 — Journaliser les événements utiles [P0]

Le système DOIT enregistrer événements ordonnés, identifiants de corrélation, auteur, horodatage, entrée/sortie de phase, interventions et effets. Les corrections sont des événements supplémentaires ; l’historique normatif n’est pas réécrit silencieusement.

**Recette :** après un incident, reconstituer l’ordre des décisions et relier chaque contrôle à son lancement et à son candidat ; un événement reçu en double ne crée pas deux décisions.

#### EVD-03 — Contrôler l’intégrité et la rétention [P0]

Les artefacts DOIVENT être adressés par identité et empreinte de contenu. Un manifeste lie les preuves à leurs décisions. Une suppression selon la politique de rétention doit indiquer que la vérifiabilité ultérieure est réduite. Un hash local n’est pas présenté comme une attestation contre l’administrateur de la machine.

**Recette :** remplacer un rapport par un autre contenu est détecté ; un export expurgé indique les éléments retirés sans se présenter comme une copie intégrale.

#### UX-01 — Conduire tout le workflow dans le TUI Pi [P0]

Le système DOIT rendre accessibles dans le TUI Pi les opérations créer un programme, inspecter, diagnostiquer, préparer, exécuter, vérifier sans inférence, interrompre, reprendre, décider, intégrer et exporter. L’utilisateur doit pouvoir fournir son besoin dans Pi, sélectionner les artefacts et suivre le programme sans changer d’application ni utiliser un CLI du harness. Des commandes internes à Pi, formulaires, messages et composants visuels peuvent déclencher ces opérations. La syntaxe exacte sera définie dans la spécification d’interface.

**Recette :** dans le TUI Pi, partir d’un besoin, préparer les tests, réaliser deux incréments, inspecter les preuves, répondre à une décision, reprendre puis intégrer ; aucune commande autonome ni job CI n’est nécessaire. La vérification seule est accessible sans appel au modèle.

#### UX-02 — Supporter les autres entrées de Pi [P0]

Les mêmes opérations et règles métier DOIVENT être accessibles par les modes publics de la version Pi qualifiée : TUI, RPC, JSON, print et intégration SDK chargeant le package. L’extension doit adapter les entrées/sorties aux capacités de l’hôte et ne jamais dépendre d’un composant visuel pour prendre une décision normative. Une entrée en langage naturel peut formuler une demande ; son interprétation ne peut contourner les contrats d’opération, permissions ou gates. Aucune autre interface autonome du harness n’est à créer.

**Recette :** lancer la même opération avec les mêmes faits depuis le TUI et depuis chacun des autres modes Pi qualifiés produit le même verdict, avec représentation adaptée. Un mode sans capacité de dialogue restitue une décision en attente et permet la reprise ultérieure dans Pi, sans approbation implicite.

#### UX-03 — Montrer une progression compréhensible [P0]

L’utilisateur DOIT voir phase, intervention, contrôles en cours, écarts, budget restant et prochaine action. Les erreurs doivent distinguer problème du candidat, du besoin, de configuration, de fournisseur et d’environnement. Les entrées et sorties humaines doivent fonctionner en français et en anglais.

**Recette :** un utilisateur peut expliquer l’arrêt à partir du rapport sans lire les logs techniques ; une entrée contenant accents ou caractères non latins reste intacte à l’export.

#### UX-04 — Recueillir les décisions via l’hôte Pi [P0]

Le système DOIT utiliser les moyens de dialogue disponibles dans Pi, en liant la décision à son auteur, sa portée et la révision affichée. Une réponse de modèle ou un appel d’outil du producteur ne peut se faire passer pour une approbation humaine. Quand le mode Pi ne permet pas de recueillir une réponse, la demande doit être persistée et retournée sous une forme exploitable ; l’exécution s’arrête au point sûr avec `decision_required`.

**Recette :** une approbation simulée dans une sortie d’agent ne modifie pas la décision ; une vraie réponse dans Pi approuve uniquement la révision présentée. En print/JSON sans dialogue, aucune fenêtre n’est attendue et aucun défaut de réponse ne vaut acceptation.

#### UX-05 — Respecter le cycle de vie des sessions Pi [P0]

Le package DOIT gérer chargement, rechargement, changement de session ou de projet, branchement d’une session, fermeture et reprise. L’identité du programme doit rester distincte de celle de la conversation Pi. Une autre session ne peut ni reprendre silencieusement un travail ni en démarrer un second exemplaire concurrent ; le lien et l’autorité sur le programme sont vérifiés.

**Recette :** recharger l’extension ou bifurquer une conversation pendant un programme n’exécute pas deux fois un contrôle ou une intégration. La session suivante retrouve un état cohérent, ses décisions en attente et les opérations actives ou interrompues.

#### UX-06 — Voir tout ce que le candidat a touché [P0]

Le relecteur DOIT pouvoir constater l’étendue exacte d’un candidat, sans jamais confondre « non
montré » avec « inchangé ». Tout chemin de la référence ou du candidat est atteignable, y compris un
fichier supprimé, consultable là où il se trouvait. L’état de chaque chemin — intact, ajouté,
modifié, supprimé, renommé — se lit sans dépendre de la couleur. Un renommage incertain se présente
comme incertain. Le périmètre affiché et ses exclusions sont explicites : un fichier ignoré, exclu ou
illisible n’est jamais rendu comme intact. Un état agrégé sur un répertoire ne fait pas disparaître
le détail de ses descendants. Cet état décrit une différence entre deux références, jamais une
qualité ni un auteur.

La présentation qui porte tout cela appartient au TUI de Pi et à sa conception ; l’exigence porte sur
ce que le relecteur peut établir, pas sur la disposition qui le lui montre.

**Recette :** ouvrir un projet comportant chacune des catégories, dont un répertoire entièrement
supprimé et un renommage avec modification. Tous les chemins attendus sont accessibles, les états des
parents concordent avec ceux de leurs descendants, et la lecture reste compréhensible sans couleur.
Restreindre la vue aux seuls changements puis revenir à la vue complète rend les fichiers intacts
visibles de nouveau.

#### UX-07 — Lire le code tel qu’il est écrit [P0]

Le relecteur DOIT pouvoir lire le contenu d’un fichier et ce qui y a changé, en retrouvant exactement
les caractères du source. Aucun habillage de comparaison ne se confond avec le code : un `+` ou un
`-` qui appartient au programme reste un caractère du programme. Ancien et nouveau texte sont
distinguables sans recourir à la couleur. Le contexte inchangé reste atteignable, et tout repli est
annoncé et réversible. Un fichier ajouté montre son contenu, un fichier supprimé montre l’ancien et
son état, un fichier intact se montre sans décoration de changement, et un renommage sans
modification n’invente aucun changement textuel.

Le rendu — coloration, mise en évidence, forme de la comparaison — relève du TUI de Pi et de la
conception d’interface, qui choisissent les moyens de tenir ce que cette exigence demande.

**Recette :** comparer des fichiers avec ajout, suppression, remplacement partiel, changement
d’indentation et opérateurs littéraux `+`/`-`. Le lecteur distingue ancien et nouveau texte, conserve
exactement les caractères source, et permet de consulter le contexte complet. Un langage inconnu
reste lisible en texte simple.

#### UX-08 — Mener une revue sans rien engager [P0]

Une revue DOIT se mener entièrement au clavier, et ne jamais rien engager. Consulter, parcourir,
chercher, replier, quitter la vue : aucun de ces gestes ne vaut approbation, modification, staging ou
intégration, et aucun ne touche le projet, l’index Git ou une décision. Le relecteur atteint la revue
depuis le suivi d’un incrément, son dossier de preuves ou un constat localisé, et la quitte pour la
conversation puis y revient sans perdre où il en était. Aucune opération de revue ne disparaît parce
que le terminal est étroit. Les chemins longs, les accents et les caractères non latins ne décalent
pas la sélection ni n’altèrent le code.

Les gestes, leurs raccourcis, le partage de largeur et le comportement en terminal étroit relèvent de
la conception d’interface et des capacités du TUI de Pi.

**Recette :** effectuer une revue uniquement au clavier, ouvrir un fichier depuis un constat,
parcourir plusieurs modifications, revenir à la conversation et retrouver la sélection initiale.
Réduire puis réagrandir le terminal sans perdre la référence comparée ni masquer une action
indispensable. Aucun de ces gestes ne modifie le projet ni une décision.

#### UX-09 — Comparer des états identifiés et signaler leur actualité [P0]

La vue DOIT afficher les identités de la référence et du candidat examinés ainsi que la portée de comparaison : incrément, cycle ou programme. L’utilisateur doit pouvoir comparer le candidat à sa base, à un candidat précédent conservé ou à la référence initiale du programme lorsqu’elle est disponible. Un dépôt sans commit doit être comparable à une référence vide explicite. Les fichiers non suivis retenus dans le candidat doivent être inclus. Les changements utilisateur préexistants doivent rester distinguables à partir de l’état initial ; l’origine inconnue ou mixte ne doit pas être attribuée arbitrairement à un agent.

Le suivi des travaux en cours doit utiliser des instantanés cohérents et annoncer la disponibilité d’un état plus récent. Une revue liée à une décision reste attachée au candidat exact présenté : aucune actualisation silencieuse ne remplace son contenu. Le passage à un nouveau candidat signale les preuves ou décisions devenues non applicables conformément aux règles d’invalidation. « Modifié », « vérifié » et « accepté » sont des informations distinctes. Aucun modèle d’IA n’est nécessaire pour calculer ou afficher cette comparaison.

**Recette :** comparer un dépôt vierge, un dépôt avec travail utilisateur préexistant et deux cycles successifs ; vérifier la base annoncée et les chemins inclus. Pendant une revue, faire produire un nouveau candidat : la vue annonce sa disponibilité, conserve la révision examinée et n’étend pas une approbation à la nouvelle révision. La consultation fonctionne sans appel au modèle.

#### UX-10 — Présenter les cas particuliers sans tromper le lecteur [P0]

La vue DOIT indiquer explicitement les fichiers binaires, contenus non décodables, changements de permissions, liens symboliques, sous-modules et conflits lorsqu’ils existent dans le périmètre observé. En l’absence de comparaison visuelle adaptée, elle présente le type, le statut et les métadonnées disponibles sans simuler un diff textuel ni prétendre à l’absence de changement. Un lien symbolique est présenté comme un lien et ne permet pas une lecture hors du périmètre autorisé. Les changements d’espaces, de fin de ligne ou d’encodage doivent rester détectables ; toute option qui les masque est signalée.

Les grands arbres et fichiers doivent être chargés progressivement, avec bornes de ressources, progression et annulation. Une limite, une troncature, une erreur de lecture ou une comparaison incomplète doit être visible et ne peut donner un statut « intact ». Les contenus et chemins provenant du projet sont des données non fiables : caractères de contrôle et séquences terminal doivent être rendus inertes, sans altérer les sources conservées. Le lecteur ne doit jamais exécuter le contenu consulté.

**Recette :** ouvrir un corpus avec binaire, fichier volumineux, lien sortant, permissions modifiées, fins de ligne différentes, sous-module, conflit et séquences terminal malveillantes. Les limites et différences sont explicites, aucune lecture non autorisée ni commande n’est exécutée, et la navigation ou l’annulation reste disponible. Les volumes et budgets sont fixés dans la qualification NFR-04.

#### UX-11 — Exposer la même information de revue aux autres entrées Pi [P0]

Le système DOIT permettre d’établir les mêmes faits sur un candidat depuis n’importe quelle entrée Pi qualifiée, sans composant visuel. Un client qui n’a pas de TUI obtient de quoi reconstruire une vue équivalente à ses propres capacités, et le mode print rend une lecture suivie plutôt qu’un patch brut. Les données de revue ne dépendent d’aucun composant d’affichage : c’est ce qui rend la comparaison indépendante de l’hôte qui la consulte.

L’ouverture de la vue TUI, l’accès aux données et la consultation d’une comparaison ne doivent exiger ni application autonome, ni CLI propre au harness, ni CI. L’absence de composants visuels dans une entrée Pi ne doit pas changer la comparaison ou le verdict. Une extension communautaire peut contribuer au rendu après qualification ; le besoin ne dépend pas de la présence d’un package non qualifié.

**Recette :** consulter le même candidat dans le TUI et dans les autres modes Pi qualifiés ; comparer références, statuts, contenus, portions changées et limites. Les faits concordent et chaque sortie est adaptée à son hôte ; aucune entrée sans TUI n’attend un widget ou une action impossible.

### 4.11 Extensions et adaptateurs

#### EXT-01 — Déclarer un contrat d’extension [P0]

Une extension DOIT déclarer identité, version, licence, provenance, capacités, dépendances, permissions, effets, paramètres et modes supportés. Elle ne doit pouvoir devenir obligatoire qu’après qualification ; son absence doit être détectée avant l’étape qui en dépend.

**Recette :** un package configuré avec une capacité absente bloque le précontrôle ; une extension facultative indisponible produit une dégradation explicite sans modifier une gate obligatoire.

#### EXT-02 — Maîtriser chargement et mise à jour [P0]

Le harness DOIT utiliser une sélection explicite de composants et versions verrouillées. Les extensions découvertes dans le dépôt cible ne doivent pas être chargées automatiquement comme code de confiance. Les mises à jour s’effectuent hors d’une tentative et déclenchent la qualification correspondante.

**Recette :** ajouter un fichier d’extension au dépôt cible n’exécute aucun code au prochain démarrage ; changer une version modifie l’empreinte d’environnement et invalide les qualifications dépendantes.

#### EXT-03 — Adapter les technologies cibles [P0]

Un adaptateur de projet DOIT pouvoir décrire découverte, préparation, build, vérifications, collecte de rapports et nettoyage, sans imposer le langage du harness. Un adaptateur générique de commandes doit être livré ; aucun accès aux classes internes du noyau ne doit être requis.

**Recette :** réaliser le même parcours de changement sur deux fixtures de langages distincts avec le même noyau, en ne changeant que les contrats d’adaptation.

#### EXT-04 — Intégrer Pi derrière un port [P0]

L’adaptateur moteur Pi DOIT utiliser ses API publiques qualifiées pour démarrer, observer, arrêter et reprendre une intervention lorsque cette capacité est supportée. Les types métier et l’état de gate ne doivent dépendre ni des messages Pi ni du format de ses sessions. Cette indépendance interne doit rester compatible avec l’entrée utilisateur exclusivement assurée par Pi.

**Recette :** remplacer Pi par un moteur simulé permet de tester toutes les décisions sans inférence ; remplacer une session Pi ne fait pas perdre l’état normatif du changement.

#### EXT-05 — Réutiliser et partager des profils [P1]

Le système DOIT permettre de distribuer des ensembles de règles, skills, outils et adaptateurs avec version, documentation et configuration. Les secrets, historiques privés et permissions personnelles ne doivent pas être inclus implicitement.

**Recette :** installer un profil sur un environnement neuf permet de reconstruire ses capacités déclarées ; l’export ne contient ni credentials ni grants personnels.

### 4.12 Amélioration du harness et optimisation

#### IMP-01 — Analyser les défauts échappés [P1]

Le système DOIT relier un incident à un changement et permettre d’identifier une cause candidate : besoin, contexte, outil, contrôle, gate, environnement ou politique. Une cause proposée par un LLM reste une hypothèse jusqu’à qualification.

**Recette :** un défaut après intégration ouvre une action d’amélioration liée au dossier initial, sans effacer son verdict historique ni affirmer une causalité non vérifiée.

#### IMP-02 — Renforcer le dispositif par changement séparé [P1]

Une évolution du harness DOIT être traitée comme un changement versionné avec test de non-régression et évaluation sur les classes de défauts visées. Elle ne doit pas être automatiquement promue par l’agent qui l’a proposée.

**Recette :** une nouvelle règle élimine le défaut témoin sans faire échouer les cas valides de référence ; sa promotion conserve auteur, version et résultats comparatifs.

#### IMP-03 — Comparer modèles et configurations [P1]

Le système DOIT permettre des campagnes comparables sur un corpus défini, avec référence du code, budgets, modèles et contrôles enregistrés. Il doit mesurer succès indépendamment vérifié, durée, coût disponible et reprises humaines ; les cas de qualification et d’évaluation doivent être distingués.

**Recette :** deux configurations sont comparées sur les mêmes entrées ; les dépenses inconnues et les variations d’environnement sont visibles, et une configuration moins chère n’est pas proclamée équivalente sur une seule exécution.

#### IMP-04 — Optimiser une métrique sous contraintes [P2]

Le système PEUT exécuter des expériences avec métrique principale, contraintes secondaires et règle de conservation définies avant les essais. Les critères, données d’évaluation et limites de durée doivent être protégés ; améliorer la métrique ne dispense pas des autres gates.

**Recette :** une optimisation accélérant un traitement mais altérant son résultat est rejetée ; un candidat amélioré seulement dans la marge de bruit n’est pas déclaré gagnant sans la règle statistique prévue.

#### IMP-05 — Préserver le jugement de l’ingénieur [P0]

Le système DOIT rendre modifiables et explicables les règles de travail, permettre inspection et interruption, et fournir les éléments nécessaires à une décision humaine. Il ne doit pas présenter une revue probabiliste comme une démonstration ni une réussite des contrôles comme une absence absolue de défauts.

**Recette :** le rapport sépare observations mécaniques, jugements et risques résiduels ; l’utilisateur peut interrompre le changement et récupérer ses artefacts sans dépendre d’un modèle.

### 4.13 Création d’application et programmes de développement

#### PRG-01 — Prendre en charge un dépôt vierge [P0]

Le système DOIT distinguer dépôt avec historique, dépôt Git sans commit et répertoire à initialiser. Pour une base vide, il doit enregistrer un état de référence vide explicite et les fichiers éventuellement déjà présents, puis préparer le premier candidat sans dépendre d’un HEAD existant. Initialisation Git, choix de branche et première intégration doivent être compris dans le mandat.

**Recette :** sur un dépôt Git sans commit, créer, vérifier puis intégrer un premier socle ; interrompre avant intégration laisse l’état initial intact. Un fichier préexistant dans un répertoire à initialiser n’est ni écrasé ni omis du diagnostic.

#### PRG-02 — Qualifier un socle applicatif [P0]

Pour une application nouvelle, le système DOIT proposer une stack, ses versions, un squelette d’architecture, une chaîne de build et les moyens de vérification initiaux à partir des contraintes du besoin. Il doit produire un incrément de socle dont la recette porte sur installation, compilation ou chargement, démarrage minimal si pertinent et fonctionnement de la chaîne de tests. Ce socle ne vaut pas acceptation des fonctionnalités futures.

**Recette :** reconstruire le socle dans un environnement propre, exécuter un test témoin et un cas négatif ; le dossier indique explicitement que les exigences fonctionnelles non implémentées restent en attente.

#### PRG-03 — Piloter un programme parent [P0]

Le système DOIT représenter un besoin global, ses capacités, exigences parentes, incréments, dépendances et jalons. Chaque obligation globale doit être affectée à un ou plusieurs incréments, à une vérification globale ou à une décision explicite de périmètre. Les incréments doivent être bornés et vérifiables ; un document décrivant une application entière ne doit pas être transmis comme une unique mission d’implémentation non décomposée.

**Recette :** traiter une demande comprenant plusieurs fonctionnalités et un socle commun en au moins trois incréments reliés ; une exigence globale non affectée bloque l’adoption du plan de programme.

#### PRG-04 — Réviser et reprendre la trajectoire [P0]

Le système DOIT persister l’avancement du programme au-delà des sessions et permettre de réordonner ou redécouper les incréments après un retour d’expérience. Les changements de dépendance, architecture, documentation, environnement ou contrat partagé doivent provoquer une analyse d’impact sur les incréments futurs et sur les résultats globaux. Les budgets sont distincts par programme, incrément et intervention.

**Recette :** après deux incréments intégrés, reprendre dans une nouvelle session puis modifier un contrat partagé : les incréments affectés sont réévalués, les autres ne sont pas rejoués sans raison et les budgets consommés restent comptabilisés.

#### PRG-05 — Accepter l’application dans son ensemble [P0]

Le système DOIT distinguer acceptation d’un incrément, acceptation d’un jalon et acceptation du programme. Cette dernière exige une évaluation du candidat intégré complet : exigences parentes, parcours de bout en bout, contrats entre composants, critères architecturaux et qualité applicables. Un programme ne peut être terminé si des obligations subsistent sans décision explicite de révision du besoin.

**Recette :** deux fonctionnalités acceptées isolément mais incompatibles dans un parcours complet empêchent l’acceptation du jalon ; le rapport de programme montre l’obligation non satisfaite même si tous les incréments affichent une clôture individuelle.

### 4.14 Construction des moyens de vérification dans la cible

#### PRE-01 — Diagnostiquer la capacité de contrôle [P0]

Le système DOIT dresser une cartographie des contrôles existants : technologies, exécution effective, environnements, comportements couverts, assertions, angles morts, instabilité et dépendances. Il doit distinguer un fichier de test présent, un test découvrable, un test exécuté et un contrôle capable de détecter le défaut visé.

**Recette :** sur un dépôt contenant des tests ignorés par sa commande de test et aucun test d’autorisation, le diagnostic signale ces deux insuffisances sans les convertir en couverture satisfaisante.

#### PRE-02 — Installer et développer les contrôles adaptés [P0]

Le système DOIT pouvoir planifier puis faire réaliser une intervention dédiée à l’ajout des frameworks de test, runners, configurations, fixtures, générateurs de données, services de test et contrôles structurels nécessaires. Il doit utiliser les technologies et conventions de l’application lorsque pertinent ; le langage du harness ne doit pas imposer celui des tests. Les tests unitaires, d’intégration, e2e, de mutation et de fuzzing peuvent employer des outils différents au sein du même projet.

**Recette :** sur deux fixtures de stacks distinctes sans tests, le harness crée et exécute des suites adaptées via leurs outils natifs, sans exiger une réécriture dans le langage de son noyau. Une dépendance externe est préparée par le profil d’exécution et reste déclarée.

#### PRE-03 — Séparer qualification du capteur et conformité du produit [P0]

Avant l’implémentation métier qu’il doit contrôler, le système DOIT établir que le moyen de vérification démarre, atteint l’assertion attendue et discrimine au moins les cas de référence pertinents. Un test d’une fonctionnalité absente peut légitimement échouer : cet échec attendu ne doit pas empêcher le gel du protocole si le test est qualifié. Une erreur d’import ou un runner cassé ne constitue pas une preuve de discrimination métier.

**Recette :** un test d’acceptation échoue pour la règle métier attendue sur un squelette et réussit sur une fixture positive ; G2 peut passer tandis que G5 reste bloquée. Le même test échouant seulement à charger ses dépendances ne permet pas de franchir G2.

#### PRE-04 — Caractériser l’existant sans consacrer ses défauts [P0]

Pour un existant peu testé, le système DOIT pouvoir créer des tests de caractérisation et des jeux de référence avant une transformation. Il doit distinguer comportement observé et comportement voulu ; les captures, snapshots ou sorties de référence doivent être expurgés et examinés pour ne pas adopter un bug existant comme exigence nouvelle.

**Recette :** un comportement observé contraire à une règle métier est enregistré comme écart à corriger, tandis que les comportements légitimes deviennent des non-régressions ; un snapshot contenant des données sensibles n’est pas adopté en l’état.

#### PRE-05 — Faire évoluer la capacité de vérification par cycle [P0]

À chaque incrément, le système DOIT compléter la couverture nécessaire et qualifier les contrôles nouveaux ou modifiés avant de les utiliser comme autorité d’acceptation. L’infrastructure de tests doit être reproductible en local et dans l’environnement d’intégration retenu. Le système doit isoler données et ressources de test, vérifier leur nettoyage et conserver un corpus de contre-exemples réutilisables.

**Recette :** l’ajout d’un stockage persistant entraîne la préparation des tests d’intégration et de leurs données avant la validation du code ; la suite peut être relancée dans un environnement propre sans état résiduel ni accès à la production.

### 4.15 Acquisition documentaire et RAG éventuel

#### RAG-01 — Identifier un besoin de connaissance technique [P0]

Le système DOIT pouvoir déclencher une phase documentaire à partir d’une technologie nouvelle, d’un changement de version, d’un manque de références, d’erreurs d’API ou d’une demande utilisateur. Il ne doit pas prétendre mesurer directement ce qu’un modèle « connaît ». Il doit enregistrer les questions techniques à résoudre et décider si une lecture ciblée, une recherche dans des fichiers ou un RAG est justifié.

**Recette :** face à un framework inconnu du corpus du projet, le plan prévoit les questions d’usage et la documentation correspondante ; une page suffisante est fournie directement sans imposer une infrastructure d’indexation.

#### RAG-02 — Constituer un corpus officiel et versionné [P0]

Le système DOIT pouvoir récupérer documentation officielle, guides, manuels, exemples, notes de migration et code source correspondant aux versions utilisées. Il doit conserver origine, version ou tag, date, empreinte et droits d’utilisation pertinents. Les références communautaires sont distinguées. Une documentation indisponible, ambiguë ou incompatible doit rester signalée.

**Recette :** un projet utilisant la version N d’un framework reçoit les références de N ; une page consacrée à N+1 est exclue ou explicitement marquée. Un corpus préalablement acquis peut être utilisé hors ligne, sous réserve de ses droits et de son état de fraîcheur enregistré.

#### RAG-03 — Retrouver des passages pertinents et traçables [P1]

Lorsque le volume ou la diversité du corpus le justifie, le système DOIT pouvoir indexer et interroger ses ressources avec filtres de produit, version et type de document. Le mécanisme peut être lexical, sémantique ou hybride ; aucune base vectorielle ni fournisseur d’embeddings n’est obligatoire. Chaque passage injecté doit référencer sa source exacte et respecter le budget de contexte.

**Recette :** sur un corpus de deux versions incompatibles, des questions témoins retrouvent les passages attendus de la bonne version, avec liens vérifiables ; une question sans réponse donne « non trouvé » plutôt qu’un extrait arbitraire présenté comme pertinent.

#### RAG-04 — Vérifier l’utilisation de la documentation [P0]

Les agents DOIVENT pouvoir rattacher un choix technique à ses sources. Le système doit confronter les usages d’API importants à des exemples exécutables, au compilateur, au typage ou à des tests de contrat selon la stack. Un résultat de recherche ou une citation ne constitue pas une preuve que le code généré est correct.

**Recette :** un agent propose une méthode absente de la version installée malgré une citation plausible ; le contrôle technique la rejette et le feedback conserve l’écart entre documentation choisie et API réelle.

#### RAG-05 — Maintenir et protéger le corpus [P1]

Le système DOIT versionner les mises à jour du corpus et, si utilisé, de l’index et de sa configuration. Une mise à niveau de dépendance entraîne la réévaluation des références concernées. L’accès aux corpus privés suit les droits de la session ; instructions contenues dans pages ou code source restent des données. Une extension de recherche ne peut transmettre un corpus à un service non autorisé.

**Recette :** après changement majeur d’une dépendance, les références périmées sont signalées et ne sont plus injectées comme actuelles ; un document privé et une instruction malveillante de ce corpus ne franchissent pas les frontières prévues.

### 4.16 Architecture existante, cible et trajectoire

#### ARC-01 — Évaluer l’architecture réellement présente [P0]

Le système DOIT produire, lorsque le changement le nécessite, un diagnostic des modules, responsabilités, dépendances, cycles, interfaces, données et frontières de déploiement observables. Il doit comparer architecture déclarée et architecture réalisée, indiquer ses angles morts et justifier ses conclusions par des localisations dans le code et les configurations.

**Recette :** sur une fixture dont la documentation annonce des couches indépendantes mais dont le code contient un cycle, le diagnostic montre le cycle et la divergence ; un lien découvert uniquement par configuration dynamique est marqué avec sa méthode d’observation.

#### ARC-02 — Préconiser une architecture adaptée au besoin [P0]

Le système DOIT pouvoir recommander conservation, ajustement ou transformation de l’architecture selon fonctionnalités, criticité, performances, exploitation, taille et contraintes d’équipe. Les alternatives doivent expliciter bénéfices, complexité, coût de migration et risques. Aucune architecture hexagonale, microservices ou autre style ne doit être imposée à tous les projets.

**Recette :** une petite application peut conserver une structure simple ; une application dont une contrainte ne peut être satisfaite dans l’organisation actuelle reçoit une alternative justifiée par cette contrainte, et non par une préférence de style du modèle.

#### ARC-03 — Réaliser une migration architecturale progressive [P0]

Le système DOIT traduire une cible adoptée en étapes avec contrats de transition, frontières de coexistence, stratégie de compatibilité et retour arrière. Chaque étape doit avoir des critères adaptés à l’état transitoire ; les règles cibles incompatibles avec cet état ne doivent pas être désactivées sans portée ni échéance.

**Recette :** déplacer progressivement un accès aux données vers une frontière dédiée préserve les interfaces promises et retire les exceptions au fur et à mesure ; une nouvelle utilisation du chemin ancien interdit par le plan est rejetée.

#### ARC-04 — Contraindre la génération par l’architecture active [P0]

Chaque intervention productrice DOIT recevoir la version applicable de la conception, les frontières autorisées et les règles transitoires éventuelles. Le système doit vérifier les effets structurels du code généré ; une architecture adoptée ne doit pas rester seulement une consigne dans le contexte.

**Recette :** un candidat fonctionnel plaçant une responsabilité dans un module interdit échoue au contrôle prévu ; un changement volontaire de frontière nécessite une révision architecturale adoptée avant de pouvoir être accepté.

#### ARC-05 — Suivre la dérive et la réalisation de la cible [P1]

Le système DOIT maintenir un historique des écarts architecturaux sur les versions intégrées, avec preuves, exceptions et avancement des étapes de migration. Il doit déclencher une réévaluation aux jalons ou changements significatifs, sans recomposer automatiquement l’architecture après chaque petite modification.

**Recette :** la fin d’une migration est refusée si une ancienne dépendance subsiste, même lorsque les incréments annoncés sont clos ; le rapport distingue cible atteinte sur un sous-ensemble et conformité de toute l’application.

### 4.17 Qualité du code et remise aux standards

#### QLT-01 — Adopter un référentiel de qualité contextualisé [P0]

Le système DOIT permettre de définir les conventions, seuils et contrôles pertinents par technologie et composant : lisibilité, complexité, duplication, typage, erreurs, tests, dépendances, sécurité et documentation. Les recommandations dites « état de l’art » doivent être sourcées et datées lors de leur adoption, avec raisons d’application ou de non-applicabilité. Une dernière version disponible n’est pas automatiquement obligatoire.

**Recette :** le profil adopté expose chaque règle et son oracle ; des seuils arbitraires proposés par un agent restent à justifier. Les contraintes métier, de sécurité et de performance ne sont pas remplacées par un score qualité global.

#### QLT-02 — Établir une baseline de qualité exploitable [P0]

Avant une campagne de remise à niveau, le système DOIT mesurer l’existant avec le profil adopté et localiser les écarts, leur gravité, leur étendue et la fiabilité des mesures. Il doit distinguer code propriétaire, code généré, dépendances et composants hors périmètre. Les constats non mesurables mécaniquement sont attribués à une revue avec leurs limites.

**Recette :** une fixture comportant duplication, complexité excessive et code tiers produit une baseline séparant ces périmètres ; l’absence d’un analyseur n’est pas interprétée comme l’absence de défaut.

#### QLT-03 — Planifier une réduction explicite de la dette [P0]

Le système DOIT permettre un programme de remise aux standards, même sans nouvelle fonctionnalité. Les écarts sont traduits en incréments priorisés selon risque, valeur, dépendances et coût, avec objectifs mesurables, obligations de non-régression et critères d’arrêt. Une réécriture générale n’est pas la réponse par défaut.

**Recette :** un dépôt hors standards reçoit un plan distinguant sécurisation des comportements, réduction de la dette et transformation structurelle ; chaque incrément peut être jugé sur un résultat observable.

#### QLT-04 — Empêcher la dégradation et les contournements [P0]

Le système DOIT gérer des règles pour le code nouveau ou modifié et des tolérances identifiées pour la dette antérieure, avec non-aggravation et objectifs de réduction. Les exclusions, suppressions, annotations de silence et modifications de seuils nécessitent une justification adoptée. Une amélioration ailleurs ne peut compenser automatiquement une nouvelle violation obligatoire ; déplacements et renommages ne doivent pas masquer une dette.

**Recette :** un candidat diminue un total de constats mais introduit une nouvelle violation interdite : il est refusé. Renommer un fichier ou ajouter une suppression au linter ne fait pas disparaître le constat sans décision enregistrée.

#### QLT-05 — Démontrer la remise en conformité [P0]

Le système DOIT comparer l’état courant à la baseline et au référentiel cible, en conservant les versions de règles. Un jalon de remise aux standards doit préciser écarts supprimés, écarts restants, exceptions temporaires et contrôles de non-régression. Les exceptions ont un propriétaire et une échéance ou condition de sortie ; elles ne doivent pas survivre automatiquement à la disparition de leur justification.

**Recette :** une application n’est annoncée conforme que dans le périmètre effectivement contrôlé ; une exception devenue inutile est détectée et retirée, tandis qu’un écart restant obligatoire empêche la clôture de l’objectif global.

### 4.18 Exigence d’ingénierie et expertise transversale

#### EXP-01 — Examiner toutes les disciplines applicables [P0]

Pour un programme ou un changement significatif, le système DOIT déterminer les disciplines à examiner : adéquation au besoin, domaine, architecture, données, API, sécurité, confidentialité, fiabilité, performance, tests, chaîne de livraison, exploitation, maintenabilité, documentation et expérience utilisateur. Accessibilité, internationalisation et contraintes réglementaires sont ajoutées selon le produit. Chaque domaine doit être traité, déclaré non applicable avec motif ou signalé comme restant à instruire.

**Recette :** un projet stockant des données personnelles et exposant une interface publique ne peut adopter son cadrage en omettant protection des données, sécurité ou UX ; un utilitaire sans interface utilisateur peut justifier la non-applicabilité de certains critères visuels.

#### EXP-02 — Argumenter les choix avec proportionnalité [P0]

Le système DOIT exiger, pour les décisions importantes, les contraintes, alternatives raisonnables, références techniques, bénéfices, coûts, risques, impacts de compatibilité et moyens de validation. La simplicité, la réutilisation et le coût de maintenance doivent être considérés. Des choix locaux réversibles peuvent recevoir une justification courte ; la sophistication ou le nombre d’agents ne constituent pas des critères d’expertise.

**Recette :** une introduction de service distribué sans besoin établi est contestée lors de la revue de conception ; une solution simple satisfaisant les exigences peut être retenue sans inventer un dossier disproportionné.

#### EXP-03 — Mobiliser et vérifier les expertises nécessaires [P0]

Le système DOIT associer les risques à des moyens d’analyse appropriés : règles automatiques, documentation officielle, expérimentation, revue spécialisée ou décision humaine. Il peut mobiliser plusieurs rôles d’agents sans supposer qu’un rôle nommé « senior » garantit la compétence. Les désaccords et zones non maîtrisées doivent être explicités et traités selon la politique d’arbitrage.

**Recette :** pour une migration de données, le dossier contient les vérifications d’intégrité, de compatibilité et de reprise nécessaires ; un avis d’agent sans observation ni source ne suffit pas à lever une incertitude critique.

#### EXP-04 — Évaluer la qualité de la démarche et du résultat [P0]

Le système DOIT confronter ses recommandations et réalisations à des critères adoptés, des cas de référence et, lorsque nécessaire, une revue experte humaine. Il doit mesurer les défauts, décisions contestées et reprises pour faire évoluer ses profils. Il ne doit pas revendiquer une équivalence générale avec une équipe senior sur la seule base de prompts de rôle ou de contrôles verts.

**Recette :** une évaluation sur des fixtures de conception, sécurité, qualité et exploitation révèle les choix inadéquats et leurs preuves ; un résultat est présenté avec son périmètre validé et ses limites, pas comme universellement « expert ».

## 5. Exigences non fonctionnelles

### NFR-01 — Reproductibilité de l’environnement [P0]

Le produit DOIT fournir une installation versionnée, un diagnostic préalable et un inventaire des dépendances. Une exécution enregistre versions du harness, de Pi, des packages, des exécutables de contrôle et profil système. Un changement doit pouvoir être revérifié avec cet environnement ou produire la liste exacte des éléments non reconstructibles.

L’installation utilisateur doit passer par le mécanisme de packages de Pi. Les dépendances et éventuels processus auxiliaires du produit sont gérés par cette distribution, avec les autorisations d’installation nécessaires ; aucune seconde application interactive ni commande de démarrage autonome n’est requise.

**Recette :** une installation neuve reconstitue un profil verrouillé ; l’absence d’une dépendance système est détectée avant appel au modèle. Une nouvelle version n’est jamais téléchargée automatiquement pendant une tentative.

### NFR-02 — Distribution open source et fonctionnement local [P0]

Le code du produit et ses dépendances obligatoires redistribuées DOIVENT relever de licences open source compatibles avec la distribution retenue, avec inventaire de licences et notices. Le produit ne doit exiger ni compte éditeur ni serveur de contrôle distant. Les services et modèles optionnels doivent annoncer séparément licences, coûts et conditions d’accès.

**Recette :** sur un réseau fermé avec modèle local et outils préinstallés, exécuter le parcours de référence, inspecter le rapport et exporter les données sans connexion au service du harness. Cette recette ne prétend pas rendre une API distante disponible hors ligne.

### NFR-03 — Robustesse et cohérence transactionnelle [P0]

L’écriture d’une décision DOIT être atomique ou récupérable. Après une panne, le système doit distinguer effet non commencé, effet terminé et effet incertain. Il ne doit pas promettre une sémantique « exactement une fois » pour un service externe qui ne la fournit pas.

**Recette :** injecter une panne avant et après chaque effet du parcours de référence ; la reprise n’accepte jamais un état partiel et demande une réconciliation pour un effet externe incertain.

### NFR-04 — Objectifs de réactivité et de ressources [P0]

Les budgets DOIVENT être configurables et appliqués. L’utilisateur garde la main : un état local se rend sans attente perceptible, une annulation demandée est émise puis honorée, et un processus contrôlé ne survit pas à sa terminaison. Une sortie volumineuse ne fait perdre aucune de ces trois garanties. Les durées qui leur donnent corps sont des valeurs de configuration, écrites au §12 et à qualifier : tenir la garantie est l’exigence, la durée n’en est que le réglage du jour. Ces garanties excluent un fournisseur qui ne garantit pas l’annulation de son calcul ou de sa facturation.

**Recette :** mesurer ces délais sur une machine de référence documentée, sous une charge d’événements représentative et sans appel distant pour le test de statut. Tester des sorties volumineuses : elles sont stockées en flux et le contexte injecté respecte sa borne, sans accumulation intégrale en mémoire. Ce qui est mesuré est le respect du réglage en vigueur, jamais une performance promise par le document.

### NFR-05 — Portabilité qualifiée [P0]

La première livraison DOIT être qualifiée sur macOS Apple Silicon et Linux x86-64, avec profils d’isolation documentés par plateforme. Les capacités supplémentaires, notamment Windows, ne doivent être annoncées qu’après recette. Les contrôles des projets cibles peuvent avoir leurs propres restrictions de plateforme.

**Recette :** le parcours P0 passe sur les deux plateformes ; un contrôle spécifique à un OS produit un diagnostic préalable sur l’autre, pas une promesse de portabilité implicite.

### NFR-06 — Observabilité sans surveillance imposée [P0]

Le produit DOIT produire des logs locaux exploitables et des métriques d’exécution ; l’envoi de télémétrie externe est désactivé par défaut. Les coûts indisponibles restent inconnus. Les exports doivent pouvoir masquer code, prompts et données sensibles selon un profil explicite.

**Recette :** une exécution instrumentée ne contacte aucun endpoint de télémétrie du produit sans activation ; un export expurgé conserve la compréhension du verdict et annonce ses limites.

### NFR-07 — Testabilité et maintenabilité [P0]

Le noyau DOIT être testable sans réseau ni modèle réel à l’aide de moteurs simulés et d’exécuteurs de fixture. Ses dépendances doivent respecter une règle architecturale exécutable empêchant l’import de Pi depuis le domaine des exigences et décisions.

**Recette :** le corpus de gates passe hors ligne ; un import interdit de Pi fait échouer le contrôle architectural du harness. Les invariants de transition sont testés sur des séquences générées, pas uniquement sur le parcours heureux.

### NFR-08 — Évolutivité des contrats [P0]

Les formats persistés et API publiques DOIVENT être versionnés. Une version majeure inconnue est refusée sans mutation ; une migration conserve la provenance et permet récupération de l’original. La rétrocompatibilité annoncée est vérifiée sur des fixtures archivées.

**Recette :** ouvrir un dossier d’une version future ne le modifie pas ; migrer une ancienne version puis comparer ses décisions historiques préserve leurs identités et significations.

## 6. Cycle de vie du changement

### 6.1 État composé

Le modèle sépare **phase métier**, **statut d’exécution** et **résultat**. « Suspendu » n’est pas une phase métier et « contrôle en erreur » n’est pas un candidat refusé.

| Champ | Valeurs de référence proposées |
| --- | --- |
| Phase | `intake`, `clarifying`, `specifying`, `verification_design`, `preparing`, `designing`, `implementing`, `verifying`, `reviewing`, `deciding`, `integrating`, `closed`. |
| Statut | `ready`, `running`, `paused`, `decision_required`, `blocked`, `completed`, `cancelled`. |
| Résultat courant | `pending`, `accepted`, `rejected`, `integrated`, `abandoned`. |
| Motif d’arrêt | `user_cancelled`, `budget_exhausted`, `attempts_exhausted`, `stagnation`, `configuration_error`, `capability_missing`, `execution_error`, `evidence_missing`, `policy_denied`, `integration_conflict`, `decision_pending`. |

Ces vocabulaires sont fermés à l’intérieur d’une version de schéma. Les informations complémentaires sont portées par des détails structurés ; elles ne créent pas de nouveaux états implicites.

### 6.2 Transitions et règles d’entrée

| Phase terminée | Passage normal | Condition | Retour ou arrêt |
| --- | --- | --- | --- |
| Accueil | Clarification | Dépôt et demande identifiés. | Configuration invalide : bloqué. |
| Clarification | Spécification | G0 passée. | Question matérielle : décision requise. |
| Spécification | Protocole de vérification | G1 passée. | Exigence incohérente : révision. |
| Protocole | Conception ou préparation | G2 passée pour la conception adoptée ; préparation bornée autorisée si moyens manquants. | Vérification insuffisante : préparer les contrôles, documenter ou arbitrer. |
| Préparation | Protocole | Livrable préparatoire qualifié et adopté. | Échec de préparation : correction bornée ou arrêt ; aucune implémentation métier non vérifiable. |
| Conception | Implémentation | G3 passée. | Choix bloquant : réviser conception ou besoin. |
| Implémentation | Vérification | G4 passée. | Candidat hors contrat : nouvelle tentative bornée. |
| Vérification | Revue ou décision | Contrôles terminés. | Incident : relance technique bornée ; défaut : correction. |
| Revue | Décision | Revues requises disponibles. | Désaccord : arbitrage prévu. |
| Décision | Clôture acceptée ou intégration | G5 passée. | Sinon correction, décision humaine ou arrêt. |
| Intégration | Clôture intégrée | G6 passée. | Destination modifiée : nouveau candidat ; conflit : bloqué. |

La conception et le protocole peuvent se compléter avant l’implémentation. Une conception qui change la vérifiabilité invalide G2 et doit repasser cette gate. Une exécution limitée à la spécification peut se terminer sans prétendre qu’un changement logiciel est accepté.

La suspension, l’interruption et les incidents peuvent intervenir dans toute phase. La reprise repart du dernier point cohérent et ne saute aucune condition d’entrée. La clôture d’un changement rejeté conserve son dossier ; une reprise explicitement autorisée ouvre un nouveau cycle de tentative, avec budgets enregistrés et preuves revalidées.

### 6.3 Préparation explicite et amorçage des contrôles

La phase `preparing` peut produire un squelette, un corpus documentaire, des tests, des règles d’architecture ou un environnement de vérification. Elle est conditionnelle : le système réutilise une capacité déjà qualifiée lorsque ses versions et son périmètre restent valides. Son absence n’est acceptable que si les préconditions de l’incrément sont déjà satisfaites.

Pour éviter un cercle où aucun test ne peut être écrit tant que les tests n’existent pas, cette phase possède un mandat limité adopté après G0/G1 : fichiers autorisés, capacités à créer, contrôles d’amorçage disponibles, budget et autorité d’adoption. Le noyau vérifie d’abord le périmètre, l’intégrité des fichiers protégés et les sorties structurées ; la capacité nouvellement construite est ensuite éprouvée sur des cas positifs/négatifs ou par une revue explicite. Si cette qualification reste insuffisante, la capacité n’est pas adoptée.

Le producteur de préparation peut écrire les futurs contrôles dans son espace, sans pouvoir adopter sa propre proposition. Après qualification, le contrôleur les fige et les rend disponibles à l’exécuteur. Une intervention distincte commence alors l’implémentation métier avec les droits appropriés. Des esquisses de conception peuvent être réalisées pour préparer les interfaces testées ; l’adoption de la conception reste soumise à G3.

Trois verdicts sont distingués : **capacité de test opérationnelle**, **test discriminant qualifié** et **application conforme**. Les deux premiers peuvent être établis alors que la fonctionnalité à développer échoue encore au test. Les contrôles dont la compilation dépend de contrats applicatifs absents doivent d’abord être qualifiés sur une fixture de référence ou après création d’un squelette minimal explicitement identifié ; une erreur de compilation accidentelle ne vaut pas défaut métier détecté.

### 6.4 Orchestration au niveau du programme

Le programme parent maintient un graphe d’incréments et des jalons avec critères globaux. Il choisit les incréments prêts à partir des dépendances et capacités requises, puis délègue leur exécution au cycle décrit ci-dessus. Les phases d’un programme ne sont pas confondues avec celles d’une session Pi.

Après intégration d’un incrément, l’état applicatif de référence avance. Les connaissances réutilisables, mesures de qualité, contrats et décisions adoptées sont conservés ; les preuves anciennes ne sont réutilisées que si elles portent encore sur les mêmes objets pertinents. Les changements de contrat ou de version déclenchent les invalidations définies. Le programme peut s’arrêter à un jalon intermédiaire sans être déclaré terminé.

Une fiche de jalon comporte son candidat intégré, ses exigences globales, les incréments contributeurs, ses contrôles d’ensemble, son verdict et les obligations restantes. Une acceptation de programme est recalculée sur cette fiche ; elle n’est pas la simple somme des statuts des enfants.

## 7. Gates et politique de décision

### 7.1 Référentiel de gates proposé

Les numéros ci-dessous sont propres à cette expression de besoins et ne reprennent pas nécessairement ceux d’une implémentation antérieure.

| Gate | Objet | Conditions minimales de passage | Preuves |
| --- | --- | --- | --- |
| G0 — Mandat | Demande exploitable. | Objectif, périmètre, hypothèses et décisions matérielles identifiés. | Demande et décisions humaines éventuelles. |
| G1 — Exigences | Référentiel explicite. | Identifiants valides, critères observables, obligations distinguées. | Rapport de schéma et contrôle de cohérence. |
| G2 — Vérifiabilité | Protocole exploitable. | Couverture de chaque obligation, capacité de contrôle opérationnelle, tests discriminants qualifiés ou décision humaine assignée, règles gelées. Le produit peut encore échouer aux tests. | Matrice exigence-vérification, rapport de préparation, qualification et empreinte du protocole. |
| G3 — Conception | Plan exécutable. | Liens aux exigences, architecture active et cible distinguées, risques et disciplines applicables traités ; documentation suffisante, droits et budgets compatibles. | Conception, revues requises, référentiels architecture/qualité, diagnostic d’environnement. |
| G4 — Candidat | Résultat recevable. | Identité calculée, diff complet, périmètre respecté, contrôles protégés intacts. | Inventaire et rapport d’observation du candidat. |
| G5 — Acceptation | Obligations satisfaites. | Toutes les vérifications requises valides ; revues et décisions satisfaisantes ; règles de non-dégradation et objectifs de remise à niveau respectés ; aucun producteur actif sur le candidat. | Dossier consolidé, mesures avant/après et décision du noyau. |
| G6 — Intégration | Livraison dans Git. | Autorisation, destination vérifiée, intégration effective du résultat contrôlé. | Références avant/après, contrôles de la combinaison intégrée, reçu d’intégration. |

Une gate PEUT contenir des contrôles mécaniques et des jugements humains ou de modèle. Le noyau rend déterministe l’application de la politique aux faits enregistrés ; cela ne rend pas déterministes la production de ces faits ni le jugement d’un modèle.

### 7.2 États des vérifications

| Verdict | Définition | Effet sur une obligation |
| --- | --- | --- |
| PASS | Critère effectivement satisfait sur l’objet identifié. | Peut contribuer au passage. |
| FAIL | Critère effectivement contredit. | Bloque le passage. |
| INDETERMINATE | Observation insuffisante ou exécution non concluante. | Bloque le passage sans prétendre constater un défaut. |
| NOT_RUN | Vérification prévue non exécutée. | Bloque le passage. |
| NOT_APPLICABLE | Non-applicabilité justifiée dans le protocole adopté. | Exclue du calcul, justification conservée. |

Un skip de framework de test ne devient pas automatiquement NOT_APPLICABLE. L’adaptateur doit produire une interprétation explicite du rapport. Un code de sortie nul ne prouve que ce que le contrat du contrôle lui attribue.

### 7.3 Algorithme minimal de décision

Pour chaque gate, le noyau doit :

1. Vérifier identités, versions, intégrité et droits d’auteur des preuves.
2. Déterminer les obligations applicables selon le protocole adopté.
3. Appliquer la règle de combinaison de chacune : par défaut, tous les contrôles obligatoires doivent passer. Une alternative doit être préenregistrée avec son périmètre.
4. Refuser les preuves périmées, résultats incomplets et contrôles non exécutés.
5. Appliquer les exigences de revue et d’arbitrage sans convertir un vote en vérité.
6. Écrire une décision avec motifs, preuves retenues et ignorées, prochaine action autorisée et révisions évaluées.

FAIL et INDETERMINATE interdisent tous deux de passer, mais demandent des traitements différents. Si les deux coexistent, le rapport conserve les deux ; il ne masque pas l’incertitude derrière un unique échec global.

### 7.4 Invalidation

| Changement observé | Invalidation par défaut |
| --- | --- |
| Exigence ou interprétation métier modifiée | G1 et gates dépendantes. |
| Contrôle, seuil, corpus ou combinaison modifié | G2 et preuves/gates dépendantes. |
| Conception modifiant le périmètre ou un contrat | Gates concernées à partir de G1/G2/G3 selon impact. |
| Fichier du candidat modifié | G4, mesures et revues dépendantes, G5/G6. |
| Modèle changé | Nouvelle intervention identifiée ; pas d’effacement des mesures valides du candidat inchangé. |
| Version d’outil de vérification ou environnement changé | Qualification et mesures affectées. |
| Branche de destination avancée | G6 ; puis G4/G5 si nouvel arbre d’intégration. |
| Preuve perdue ou corrompue | Gates qui l’utilisent. |
| Politique ou autorisation révoquée | Toute opération future concernée et décision non encore appliquée. |
| Corpus documentaire, version de framework ou règles architecturales changés | Analyse d’impact sur conception, contexte et contrôles ; invalidation des décisions effectivement fondées sur les références devenues incompatibles. |
| Référentiel qualité ou baseline recalculée | Nouvelle série de mesures comparable ; aucune disparition silencieuse des anciens écarts. |
| Contrat partagé ou ordre d’incréments modifié | Dépendances et critères de jalon affectés ; réévaluation du candidat global. |

Une invalidation sélective nécessite une preuve d’indépendance ; à défaut, le système invalide conservativement les étapes aval.

### 7.5 Adoption des artefacts et portée de l’autonomie

Le propriétaire configure une politique d’adoption avant l’exécution. Celle-ci indique quelles propositions peuvent être adoptées automatiquement après contrôles, lesquelles nécessitent une revue et lesquelles nécessitent une décision humaine. L’adoption automatique est une action du noyau prévue par cette politique, jamais une autoapprobation déclarée par le producteur.

| Objet | Politique de départ proposée |
| --- | --- |
| Reformulation sans changement de sens | Adoption automatique si aucune question matérielle n’est ouverte. |
| Décision métier ambiguë ou nouvelle autorisation externe | Décision humaine, sauf mandat préalable suffisamment précis. |
| Exigences et conception | Adoption après contrôles configurés ; revue requise selon risque. |
| Protocole d’acceptation | Adoption par le noyau après vérification de couverture et qualification exigée ; arbitrage humain si pertinence non établie. |
| Élargissement de permissions | Autorité propriétaire du profil ; aucune décision autonome d’un agent. |
| Nouvelle extension ou modification du harness | Qualification et adoption par son mainteneur dans un changement distinct. |

L’absence de confirmation humaine à chaque étape ne doit pas devenir une absence de contrôle. Inversement, le système doit réutiliser un mandat valide et éviter de demander plusieurs fois une même permission dans la même portée.

## 8. Artefacts et contrats de données

### 8.1 Principes communs

Les noms de fichiers et la technologie de stockage restent des choix d’architecture. Les contrats suivants définissent les informations à conserver. Les exemples de noms sont indicatifs et ne doivent pas être interprétés comme des API déjà existantes.

Chaque artefact normatif possède : `schema_version`, `id`, `revision`, `created_at`, `producer`, `change_id`, références des entrées, empreinte de contenu et classification de confidentialité. Les dates utilisent UTC ; les durées sont explicites ; un champ inconnu ne doit pas être confondu avec une valeur zéro.

Les références associent au minimum identifiant et révision, complétés par l’empreinte quand elle existe. L’identité du candidat doit inclure les fichiers non suivis retenus et les métadonnées pertinentes ; un nom de branche ne suffit jamais.

### 8.2 Objets métier

| Objet | Informations minimales | Propriétaire de l’écriture normative |
| --- | --- | --- |
| Demande | Texte original, contexte, auteur, dépôt, base Git, objectifs. | Contrôleur à partir de l’entrée humaine. |
| Incrément | Valeur, dépendances, périmètre, phases, budgets. | Contrôleur après adoption. |
| Programme applicatif | Besoin global, exigences parentes, graphe d’incréments, jalons, budgets et obligations restantes. | Orchestrateur après adoption du mandat global. |
| Diagnostic initial | Nature du dépôt, maturité des contrôles, architecture réalisée, qualité, lacunes documentaires et disciplines à instruire. | Observateurs et revues identifiés. |
| Plan de préparation | Capacités absentes, interventions, tests d’amorçage, qualification et adoption. | Contrôleur. |
| Corpus documentaire | Questions, sources officielles, versions, licences, empreintes, extraits et index éventuel. | Gestionnaire documentaire après contrôle de provenance. |
| Référentiel architectural | Architecture observée, cible, règles actives/transitoires, décisions et plan de migration. | Contrôleur après adoption. |
| Référentiel qualité | Règles, métriques, baseline, objectifs, exceptions, échéances et non-aggravation. | Contrôleur après adoption. |
| Fiche de jalon | Candidat intégré, critères globaux, preuves d’ensemble, verdict et obligations restantes. | Noyau au niveau programme. |
| Exigence | Énoncé, catégorie, obligation, critère, source, liens de vérification. | Contrôleur ; agent autorisé à proposer. |
| Protocole | Contrôles, seuils, corpus, combinaisons, arbitrages, qualification, révision gelée. | Contrôleur après adoption. |
| Conception | Composants, interfaces, alternatives, décisions, impacts. | Contrôleur après adoption. |
| Manifeste de contexte | Ressources, empreintes, ordre, rôle, exclusions, transformations et budget. | Préparateur de contexte de confiance. |
| Mandat d’intervention | Rôle, objectif, candidat d’entrée, outils, moteur/modèle, droits, budget, schéma de sortie. | Orchestrateur. |
| Candidat | Base, arbre ou manifeste, diff, workspace, provenance, producteurs actifs. | Observateur de confiance. |
| Comparaison de revue | Références et empreintes avant/après, portée, union des chemins, statuts, renommages et incertitudes, portions textuelles, métadonnées, limites et actualité. | Observateur de confiance ; projection de présentation sans autorité de décision. |
| Exécution de contrôle | Définition, candidat, environnement, durée, code de sortie, rapport, statut. | Exécuteur de contrôles. |
| Constat | Exigence, attendu, observé, localisation, gravité, type d’oracle, limites. | Producteur du constat identifié. |
| Décision de gate | Politique, entrées, verdict, motifs, auteur, action suivante. | Noyau exclusivement. |
| Décision humaine | Identité, objet/version, choix, motif, portée, expiration éventuelle. | Interface authentifiée et contrôleur. |
| Reçu d’intégration | Destination avant/après, candidat, méthode, preuves, effet confirmé. | Intégrateur. |
| Action d’amélioration | Incident, cause hypothétique, correctif du dispositif, évaluation, promotion. | Mainteneur et contrôleur. |

### 8.3 Contrats de ports à implémenter

| Port | Opérations attendues | Garanties à tester |
| --- | --- | --- |
| Moteur d’agent | Capacités, démarrer, événements, interrompre, état, terminer ; reprise si supportée. | Identifiants, pas de fin implicite, erreurs typées, annulation des descendants. |
| Gestionnaire de contexte | Préparer, borner, reconstruire, exporter le manifeste. | Contraintes conservées, sources identifiées, aucun chargement ambiant non autorisé. |
| Exécuteur de contrôles | Préparer un instantané, lancer, annuler, collecter, nettoyer. | Résultat lié à l’objet mesuré, timeout, logs complets selon rétention. |
| Politique de décision | Valider le protocole, évaluer les preuves, déterminer transition et invalidation. | Fonction testable sur des faits, sans appel au modèle. |
| Espace de travail | Créer, observer, figer, comparer, fermer. | Préservation du travail initial et inventaire complet. |
| Consultation de revue | Inventorier les chemins, comparer des références, lire les versions, paginer et localiser les changements. | Lecture seule, instantané cohérent, chemins autorisés, erreurs et limites explicites ; données communes aux entrées Pi. |
| Intégrateur Git | Préparer combinaison, vérifier destination, intégrer, confirmer ou réconcilier. | Aucune intégration d’un candidat non vérifié. |
| Stockage de preuves | Écrire, lire, vérifier intégrité, exporter, appliquer rétention. | Révisions conservées, écritures récupérables, accès contrôlés. |
| Décision utilisateur | Adapter le dialogue aux entrées Pi, enregistrer, vérifier validité. | Révision et provenance humaine contrôlées ; suspension explicite sans dialogue. |
| Adaptateur cible | Découvrir, préparer, déclarer contrôles et parsers, nettoyer. | Indépendance du langage et effets déclarés. |
| Orchestrateur de programme | Décomposer, ordonnancer, reprendre, réviser et évaluer les jalons. | Couverture globale, propagation d’impacts et budgets hiérarchiques. |
| Préparateur de capacités | Diagnostiquer les lacunes, préparer les outils/tests et qualifier les capteurs. | Distinction entre qualification du contrôle et succès du candidat. |
| Gestionnaire documentaire | Acquérir, versionner, rechercher, citer ; indexer si nécessaire. | Provenance, bonne version, droits, absence de résultat non masquée. |
| Analyse architecture/qualité | Mesurer, comparer, proposer une cible, suivre écarts et exceptions. | Baselines comparables, constats localisés, conformité limitée au périmètre mesuré. |

Les schémas machine définitifs seront créés lors du premier incrément d’implémentation, avec exemples valides et invalides. Ce document n’impose pas un langage de schéma précis ; JSON Schema constitue une option adaptée aux frontières publiques. Les types TypeScript seuls ne valident pas les données reçues à l’exécution.

## 9. Parcours opérationnels de référence

### 9.1 Fonctionnalité nouvelle sur un projet existant

1. Depuis Pi, l’utilisateur sélectionne ou confirme le dépôt, la base et sa demande via les interactions du package.
2. Le système inspecte l’existant, pose uniquement les questions matérielles et enregistre les décisions.
3. Les exigences et moyens de vérification sont proposés puis adoptés.
4. La conception identifie interfaces, réutilisations et impacts ; les contrôles préparatoires sont qualifiés.
5. Le producteur travaille dans un espace autorisé avec un mandat borné.
6. L’observateur fige le candidat ; les contrôles obligatoires et revues configurées s’exécutent.
7. Le noyau accepte ou transmet un écart précis à corriger.
8. Une fois accepté, le candidat est exporté ou intégré selon l’autorisation, puis le rapport est émis.

### 9.2 Bug avec risque d’erreur d’interprétation

Le système recherche une reproduction issue du signalement ou d’une donnée indépendante, puis un cas négatif discriminant. Si le besoin ne permet pas de distinguer comportement voulu et comportement actuel, la clarification reste ouverte. Une correction qui satisfait uniquement des tests écrits après coup par le même producteur ne suffit pas à déclarer l’oracle indépendant.

### 9.3 Refactorisation à comportement constant

Le protocole définit les comportements à préserver et les mesures visées, avec comparaison de référence si utile. Un changement d’API ou une dépendance supplémentaire est explicitement évalué. Les améliorations de structure ne peuvent compenser une régression fonctionnelle obligatoire.

### 9.4 Vérification sans agent

Depuis une entrée Pi, l’utilisateur désigne un candidat et un protocole adopté. L’opération déterministe du package exécute l’observation et les contrôles disponibles sans appel d’inférence ; cela ne nécessite pas un CLI séparé. Si une revue de modèle est obligatoire mais absente, le résultat indique son absence ; le mode sans agent n’efface pas cette obligation.

### 9.5 Optimisation expérimentale

L’utilisateur définit métrique, contraintes et budget. Le système établit une référence, exécute des expériences, conserve ou rejette leurs résultats selon le protocole et termine au budget ou à la condition d’arrêt. Les meilleurs candidats repassent les gates normales avant intégration. Ce parcours peut utiliser un package spécialisé après qualification.

### 9.6 Apprentissage après incident

Un défaut échappé est relié à son changement. Une proposition ajoute ou corrige une connaissance, une règle ou un capteur. Le dispositif modifié est évalué contre le défaut connu et des cas valides, puis adopté dans une révision séparée. Les décisions historiques conservent leur contexte initial.

### 9.7 Application complète à partir d’un dépôt vierge

Le demandeur fournit l’expression de besoins d’une application comprenant une interface, une API, des règles métier et un stockage. Le système crée un programme parent et établit les disciplines applicables, la stack et l’architecture proposées. Il identifie les documents techniques nécessaires aux versions retenues et construit un plan de préparation.

Un premier incrément livre le squelette, le build et les outils de test. Des incréments suivants réalisent des tranches fonctionnelles, avec tests de domaine, d’intégration et de bout en bout adaptés. Les contrôles et corpus évoluent par révision ; les décisions du programme persistent entre sessions. Un dernier jalon vérifie les parcours complets, la sécurité, les performances et les obligations d’exploitation applicables. La présence d’un premier commit ou d’une application qui démarre n’est pas la fin du programme.

### 9.8 Remise à niveau d’un existant sans tests fiables

Le diagnostic relève une dette qualité, une architecture mal respectée et une couverture insuffisante. Le harness commence par identifier les comportements à préserver et les zones à risque. Il prépare les moyens de test natifs, crée des tests de caractérisation et les confronte aux règles métier connues.

La baseline conserve les défauts déjà présents. Un plan sépare protection contre les régressions, correction des défauts, migration architecturale et harmonisation des conventions. Le code nouveau respecte immédiatement les règles adoptées ; la dette ancienne fait l’objet d’exceptions localisées et d’objectifs de réduction. À chaque étape, le système vérifie comportement, structure et qualité, puis actualise l’avancement vers la cible. Il peut terminer un incrément sans prétendre que toute l’application est déjà conforme.

### 9.9 Framework peu maîtrisé et documentation à acquérir

Le diagnostic identifie les versions réellement utilisées, les questions non résolues et les erreurs d’API éventuelles. Une intervention rassemble la documentation officielle, les guides de migration, exemples et sources utiles. Les ressources sont qualifiées et versionnées. Une lecture directe suffit pour un corpus court ; un mécanisme de recherche indexée n’est adopté que si nécessaire.

Chaque intervention reçoit les passages utiles avec leurs références. Les API importantes sont confirmées par compilation, typage ou tests sur l’environnement réel. Une citation ne lève pas une erreur de compatibilité. Le corpus peut être réutilisé à l’incrément suivant ; une mise à niveau de framework déclenche sa réévaluation.

### 9.10 Programme mixte : fonctionnalités et modernisation

Un besoin global peut combiner une nouvelle fonctionnalité avec l’extraction d’un composant, la réduction de duplication et la correction d’une vulnérabilité. Le graphe distingue les dépendances réelles : certaines mises à niveau précèdent la fonctionnalité ; d’autres peuvent suivre ou rester indépendantes. Le responsable du programme adopte la trajectoire et les risques transitoires.

Les jalons vérifient à la fois la valeur livrée et les objectifs de mise aux standards. Une amélioration moyenne de qualité ne masque pas une faille nouvelle ; une architecture transitoire ne devient pas permanente sans décision explicite. Un retour humain peut réviser l’ordre des incréments sans effacer la trace des obligations initiales.

### 9.11 Revue visuelle d’un incrément ou du programme

Depuis Pi, l’utilisateur ouvre la revue et choisit sa portée ainsi que la référence de comparaison. Il parcourt le projet et l’état de chaque fichier, et lit le fichier retenu — son contenu comme ce qui y a changé, par mise en forme. Il peut afficher seulement les changements, revenir aux fichiers intacts, inspecter un fichier supprimé, suivre un renommage et ouvrir un constat au bon endroit. Les fichiers ajoutés par les agents, ceux modifiés avant leur intervention et les origines indéterminées restent identifiables lorsque les observations le permettent.

L’utilisateur parcourt les modifications sans marqueurs de patch ni numéros de ligne, puis revient au dossier de preuves. S’il prend une décision, celle-ci concerne exclusivement la révision examinée. Si les agents ont poursuivi le travail entre-temps, Pi propose explicitement de consulter le nouveau candidat ; la revue précédente reste liée à son instantané. Un terminal étroit permet d’alterner arbre et lecteur, et un autre client Pi obtient les mêmes faits avec une présentation adaptée.

## 10. Positionnement de Pi

### 10.1 Pi comme hôte et point d’entrée

Le produit prend la forme d’un pi-package installé dans Pi. Son extension fournit les interactions et déclenche les opérations du noyau. Le TUI est l’expérience interactive de référence ; les autres entrées de Pi doivent utiliser le même contrat fonctionnel. Il n’existe ni CLI propre au harness, ni service public indépendant, ni mode de pilotage par CI à livrer.

Les extensions Pi peuvent ajouter des commandes, outils et interactions. La documentation distingue les capacités d’interface des modes TUI, RPC, JSON et print ; il faut donc adapter la présentation sans changer les décisions. Le SDK est aussi une voie d’intégration de Pi dans un hôte, à qualifier avec le chargement du package. [Extensions Pi](https://pi.dev/docs/latest/extensions), [RPC Pi](https://pi.dev/docs/latest/rpc), [SDK Pi](https://pi.dev/docs/latest/sdk).

### 10.2 Architecture recommandée, à qualifier

Le package comprend une extension d’entrée Pi, des ressources éventuelles et un accès interne au noyau. Le noyau possède les exigences, programmes, gates et preuves. Des interventions productrices confinées et un exécuteur de contrôles évaluent le code cible. Les éventuels processus auxiliaires sont démarrés, supervisés et arrêtés par le produit ; l’utilisateur n’a pas à les lancer séparément.

| Responsabilité | Affectation proposée |
| --- | --- |
| Entrées, commandes internes, interactions et affichage | Extension du produit dans l’hôte Pi. |
| Programme, préparation et trajectoire de modernisation | Orchestrateur interne du harness. |
| Exigences, protocole, gates et budgets globaux | Noyau indépendant des composants d’affichage. |
| Conversations, modèles, outils et sessions d’intervention | Pi et son adaptateur interne. |
| Diagnostics pendant l’écriture | Extensions qualifiées dans l’intervention autorisée. |
| Contrôles d’acceptation | Exécuteur du harness sur un candidat identifié. |
| Frameworks de tests et règles propres à la stack | Outils de la cible, préparés et appelés par ses adaptateurs. |
| Architecture, qualité et documentation | Services internes et rôles dédiés ; adoption par le noyau. |
| Isolation | Frontière système ou conteneur qualifié. |
| Rapport et reprise | Stockage normatif interne ; consultation et opérations depuis Pi. |

L’extension d’entrée est un composant de confiance, distinct des interventions productrices. Elle ne doit pas exécuter dans l’hôte de confiance un code arbitraire proposé par le modèle avec les permissions du noyau. Les commandes ordinaires de Pi, le shell, les écritures directes et les autres extensions doivent être inclus dans la qualification des frontières ; un panneau TUI ne constitue pas une isolation.

La documentation indique que les extensions Pi peuvent exécuter du code avec les permissions de leur processus. Les extensions chargées dans l’hôte de confiance font donc partie de la base de confiance ; on ne peut prétendre protéger le noyau d’un plugin hostile ayant les mêmes accès sans frontière supplémentaire. [Permissions des extensions](https://pi.dev/docs/latest/extensions).

### 10.3 Variantes internes recevables

- **Noyau TypeScript séparé et interventions Pi confinées :** option de référence à qualifier ; communication interne typée et accès protégés.
- **Noyau dans le processus de l’extension :** recevable uniquement si le profil de confiance et l’isolation effective satisfont les exigences ; un import de bibliothèque ne crée pas une frontière de sécurité.
- **Composant Python réutilisé en interne :** possible si le package gère son cycle de vie et son installation, sans CLI utilisateur séparé.
- **SDK ou RPC Pi pour les interventions :** choix internes ; ils ne modifient pas l’entrée utilisateur, qui reste Pi.

Le port moteur et le noyau demeurent testables avec des doubles hors ligne. Leur indépendance technique n’implique pas de proposer une application autonome à l’utilisateur. Une future substitution interne de composant ne peut supprimer l’intégration Pi adoptée sans révision explicite du besoin.

### 10.4 Matrice des entrées Pi

| Entrée Pi | Présentation attendue | Traitement d’une décision humaine |
| --- | --- | --- |
| TUI | Dialogues et commandes internes, progression, preuves, arbre du projet à gauche et lecteur de modifications à droite ; navigation clavier et adaptation à la largeur. | Recueil explicite lié à la révision affichée. |
| RPC Pi | Opérations et événements via les mécanismes publics de Pi ; présentation par son client. | Dialogue si le client le supporte ; sinon décision persistée en attente. |
| Mode JSON Pi | Résultats et événements exploitables, sans dépendance au rendu terminal. | Retour structuré de la demande ; arrêt au point sûr si aucune réponse humaine n’est disponible. |
| Mode print Pi | Résultat textuel concis avec état et références du dossier. | Décision en attente explicitée, reprenable dans un mode Pi interactif. |
| Hôte utilisant le SDK Pi | Package chargé et opérations accessibles par les mécanismes Pi de cet hôte. | Selon capacités de dialogue et provenance des entrées garanties par l’hôte. |

Cette matrice exprime le comportement requis, pas une promesse de widgets identiques. Les composants TUI ne doivent pas être requis en RPC, print ou JSON. Les autres entrées publiques ajoutées par une future version Pi doivent être examinées lors de sa qualification ; aucune compatibilité future n’est annoncée sans test.

Ce que la revue doit établir est une exigence produit ; la surface qui l’affiche s’assemble à partir de `pi-tui`, qui publie les composants de disposition, de défilement, de sélection, de clavier et de mesure de largeur, ainsi que la neutralisation des séquences terminal. Ce qui reste à écrire est le modèle de comparaison, qui demeure séparé de tout moteur de rendu. ADR-17 vérifie sur la version Pi retenue quels composants couvrent le besoin et ce qui manque, avant d’écrire ce qui manquerait.

L’accès aux opérations déterministes, dont vérifier, consulter l’état et reprendre une décision, ne doit pas dépendre du bon vouloir du modèle. L’extension fournit des chemins explicites dans Pi ; une demande conversationnelle peut les compléter, sans être l’unique moyen de contrôle.

## 11. Packages Pi candidats

Cette liste est une présélection documentaire consultée le 15 septembre 2026. Elle ne constitue ni une certification communautaire, ni une preuve d’audit, ni un engagement de compatibilité. Les versions ci-dessous sont des observations de catalogue, pas un verrou de dépendances recommandé sans test. Tous les packages listés déclarent une licence MIT dans les sources consultées ; les dépendances, services et conditions de redistribution doivent être qualifiés séparément.

| Candidat et source | Apport documenté | Emploi proposé | Limite à vérifier |
| --- | --- | --- | --- |
| [pi-lens](https://pi.dev/packages/pi-lens), 4.1.6 | Diagnostics de langage, linters, typage et analyse structurelle pendant l’édition. | Feedback rapide dans l’intervention d’implémentation. | Corrections automatiques et suppression/différé de diagnostics incompatibles avec une preuve finale non recontrôlée. |
| [pi-subagents](https://pi.dev/packages/pi-subagents), 0.68.0 | Délégation, rôles et workflows scriptés. | Réutiliser la mécanique d’interventions spécialisées si le pilotage externe convient. | Délégation non obligatoire par simple installation ; rôle reviewer pouvant corriger ; vérifier plafonds et permissions héritées. |
| [pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter), 2.34.0 | Accès MCP à la demande et configuration par API. | Connecter uniquement les serveurs utiles au rôle. | Contrôler découverte, credentials, outils directs et proxifiés, effets distants et composition avec l’isolation. |
| [pi-web-access](https://pi.dev/packages/pi-web-access), 0.29.0 | Recherche, lecture de sources et dépôts. | Recherche documentaire et préparation de conception. | Définir fournisseurs, transferts, repli, archivage des sources et comportement sans interface. |
| [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch), version à verrouiller | Expériences mesurées, journal, conservation ou retour arrière. | Parcours d’optimisation P2 ou source d’inspiration. | Boucle autonome à borner ; protéger métriques et contrôles ; faire repasser les gates générales. |
| [pi-sandbox](https://pi.dev/packages/pi-sandbox), 0.6.8 | Confinement Bash et filtrage des outils de fichiers. | Candidat comparatif pour le profil d’exécution. | Son README décrit des ouvertures dans l’exemple navigateur ; ne pas l’adopter comme unique frontière sans recette complète. |

`pi-autoresearch` bénéficie d’un retour d’utilisation publié par [Shopify Engineering](https://shopify.engineering/autoresearch). Cela constitue un signal d’usage sur des optimisations, pas une validation des exigences de ce harness.

### 11.1 Protocole d’admission d’un package

Pour être retenu, un package doit disposer d’un dossier contenant :

1. Besoin satisfait et alternative envisagée, y compris l’absence de package.
2. Version exacte, origine, empreinte, licence et dépendances transitives pertinentes.
3. Modes essayés : TUI, RPC, JSON, print et hôte SDK de Pi chargeant le package, avec décisions, annulation et reprise ; les processus internes sont qualifiés séparément.
4. Outils exposés, lectures/écritures, accès réseau, processus et chargements automatiques.
5. Résultat des essais d’annulation, de reprise, de budget, de logs et de permissions.
6. Compatibilité en combinaison avec les autres packages sélectionnés et la version Pi.
7. Stratégie d’arrêt, de désactivation et de remplacement en cas de dégradation.

Un succès dans le TUI Pi ne prouve pas le fonctionnement dans ses autres modes d’entrée. Un hook qui fonctionne seul peut interagir avec un autre remplacement d’outil. Ces compositions doivent être testées comme un profil complet.

### 11.2 Politique initiale proposée

La référence de recette utilise Pi avec le package du produit et sans package communautaire optionnel. `pi-lens` est le premier candidat à essayer pour le feedback, `pi-mcp-adapter` et `pi-web-access` sont activés par besoin, `pi-subagents` est comparé à des sessions directement pilotées par le noyau, et `pi-autoresearch` reste spécialisé. Le choix d’isolation précède toute déclaration de sécurité et ne dépend pas de la popularité d’un package.

### 11.3 Affectation aux besoins de préparation et de modernisation

`pi-web-access` peut participer à l’acquisition des sources ; sa disponibilité ne prouve pas qu’un corpus versionné et un RAG conformes à RAG-01 à RAG-05 existent. Un composant d’indexation peut être ajouté après comparaison avec une recherche simple ; aucun package RAG précis n’est adopté dans ce document.

`pi-lens` peut fournir des observations techniques, mais ne remplace ni le diagnostic architectural global ni le référentiel qualité adopté. `pi-subagents` peut exécuter des rôles de préparation ou d’expertise si leurs droits et budgets sont qualifiés. Aucun de ces packages ne dispense de créer les tests et configurations dans la technologie cible lorsqu’ils manquent.

Le harness garde donc la propriété du programme, des cibles architecturales et qualité, des baselines, des corpus documentaires et des plans de préparation. Les packages apportent des capacités remplaçables, évaluées par les mêmes contrats.

## 12. Configuration et valeurs proposées

La configuration effective doit être exportable sous forme canonique, après résolution des profils. Un fichier de projet ne peut élargir une politique supérieure. Les secrets sont référencés, jamais inclus dans l’export standard.

| Domaine | Paramètres à représenter | Valeur initiale proposée |
| --- | --- | --- |
| Projet | Dépôt, référence de base, adaptateur, chemins admis. | Référence explicitement résolue, ou état initial vide/instantané explicite pour un dépôt sans commit. |
| Programme | Exigences globales, incréments, jalons, budgets cumulés. | Graphe adopté ; plafonds explicites de durée et d’incréments avant lancement automatique. |
| Préparation | Capacités nécessaires, lacunes, mandat, essais positifs/négatifs. | Réutiliser les capacités qualifiées ; construire et qualifier celles qui manquent. |
| Documentation | Sources, versions, questions, droits, stratégie de recherche, index éventuel. | Lecture/recherche ciblée ; RAG selon besoin démontré. |
| Architecture | État observé, cible, règles actives, transitions, exceptions. | Conserver l’existant si adapté ; transformer sur justification adoptée. |
| Qualité | Profil par technologie, baseline, écarts, objectifs, suppressions autorisées. | Non-aggravation et conformité du code nouveau ; dette antérieure explicitement suivie. |
| Corrections | Nombre maximal de nouveaux candidats par incrément. | 3 tentatives d’implémentation au total par incrément ; les préparations ont leurs budgets distincts, inclus dans le budget du programme. |
| Incidents techniques | Relances d’une opération identique, backoff. | 2 relances maximum, sans doubler un effet incertain. |
| Exécution | Durée d’intervention, durée par incrément, durée du programme, appels d’outils. | 20 min/intervention, 120 min/incrément, 100 appels/intervention ; budget de programme établi selon son plan et modifiable par décision. |
| Réactivité | Retour d’état local, émission du signal d’annulation, grâce avant terminaison forcée. | 1 s au 95e percentile, 2 s, 10 s de grâce ; ces trois réglages donnent corps aux garanties de NFR-04. |
| Délégation | Concurrence, profondeur, plafond cumulé. | Séquentiel en P0 ; en P1 : 2 simultanés, profondeur 1, 8 enfants maximum par changement. |
| Contexte | Taille d’injection, réserve de sortie, ressources obligatoires. | Feedback 64 Kio maximum ; contexte adapté à la capacité déclarée du modèle. |
| Modèles | Fournisseur, identifiant exact, paramètres et repli. | Aucun repli implicite ; catalogue explicite du déploiement. |
| Contrôles | Commande, interprétation, durée, ressources, rapports. | Timeout obligatoire ou plafond global hérité ; pas de shell implicite. |
| Intégration | Destination et autorisation. | Désactivée en l’absence de mandat d’intégration. |
| Réseau | Domaines, services, téléchargements, télémétrie. | Refus par défaut ; autorisations minimales explicites. |
| Rétention | Rapports, sorties brutes, sessions, données personnelles. | Conservation locale jusqu’à nettoyage explicite en P0 ; politique affinée avant déploiement d’équipe. |

Ces valeurs sont des points de départ originaux pour une première qualification. Elles ne sont ni imposées par les articles ni présentées comme optimales. Le compteur de corrections n’est pas remis à zéro par un changement de modèle, une compaction ou une reprise. Une augmentation de budget est un événement autorisé et visible.

Les contrôles coûteux tels que mutation ou fuzzing peuvent recevoir un budget spécifique. Si le budget empêche de produire une preuve obligatoire, le changement reste indéterminé ; le système n’abaisse pas son seuil pour terminer.

Une capacité requise par un incrément P0 ne peut être écartée au motif que son intégration avancée est prévue en P1. Le produit peut alors utiliser un adaptateur générique ou une procédure qualifiée disponible ; sinon il bloque avec la capacité manquante. Ainsi, l’orchestration générique de tests natifs est P0, tandis que des intégrations spécialisées pour mutation, fuzzing ou indexation documentaire peuvent être livrées ensuite. Les essais de fuzzing, e2e ou mutation ne sont pas déclarés déterministes par leur seul nom : seeds, environnement, résultats attendus et instabilité doivent être maîtrisés et documentés.

## 13. Recette du harness

### 13.1 Niveaux de vérification

La qualification associe des tests du noyau hors ligne, des contrats d’adaptateurs, des fixtures adverses et un nombre borné de parcours réels avec Pi. Les modèles simulés permettent de reproduire les fautes et sorties mensongères ; les essais réels vérifient l’intégration sans constituer la seule preuve des gates.

Pour chaque exigence, la recette doit conserver : identifiant de test, révision du besoin, fixture, action, attendu, oracle du test, résultat, environnement et preuve. Une exigence n’est achevée que lorsque son critère est vérifié ; écrire le code correspondant ne suffit pas.

### 13.2 Corpus minimal de scénarios transversaux

| ID | Scénario | Attendu essentiel | Exigences principales |
| --- | --- | --- | --- |
| REC-01 | Changement simple conforme sur deux technologies. | Acceptation puis intégration exactes, dossier complet. | BES-01, CON-02, EXT-03, GIT-03, EVD-01. |
| REC-02 | Producteur annonce le succès sans exécuter les tests. | Contrôles lancés par le noyau, verdict fondé sur leurs résultats. | VER-01, AGT-06, DEC-01. |
| REC-03 | Implémentation et tests partagent une mauvaise interprétation. | Cas négatif indépendant met le candidat en défaut. | REQ-03, VER-05, CTX-05. |
| REC-04 | Producteur tente de supprimer un test ou réduire un seuil. | Refus de mutation du protocole et événement explicite. | REQ-04, SEC-03. |
| REC-05 | Contrôle absent, timeout ou rapport illisible. | INDETERMINATE, aucune acceptation automatique. | VER-02, AGT-01, DEC-03. |
| REC-06 | Compaction puis changement de session. | Contraintes et budgets identiques après reconstruction. | CTX-04, DEC-05. |
| REC-07 | Agent de revue tente une correction via shell ou extension. | Écriture bloquée et constat exploitable. | AGT-04, SEC-02. |
| REC-08 | Crash pendant mesure ou immédiatement après un effet Git. | Reprise cohérente et aucune duplication d’effet. | DEC-05, NFR-03, GIT-03. |
| REC-09 | Branche cible avance après acceptation. | Revalidation du nouvel arbre ou conflit explicite. | GIT-03, GIT-04. |
| REC-10 | Révision du besoin après mesures réussies. | Invalidation de toutes les preuves concernées. | BES-05, DEC-01. |
| REC-11 | Page ou log contient une instruction malveillante. | Aucun élargissement de permissions. | CTX-02, CTX-05, SEC-01. |
| REC-12 | Fournisseur indisponible et autre modèle disponible. | Pas de repli sans mandat ; repli autorisé tracé. | AGT-02, AGT-07. |
| REC-13 | Cascade de délégations et annulation globale. | Plafonds respectés et descendants arrêtés. | AGT-05, DEC-03. |
| REC-14 | Rapport de preuve altéré ou manquant. | Détection et décision invalide pour l’acceptation courante. | EVD-03, VER-03. |
| REC-15 | Optimisation rapide mais comportement dégradé. | Candidat rejeté malgré métrique améliorée. | IMP-04, VER-07. |
| REC-16 | Package tente chargement ambiant ou accès hors périmètre. | Chargement refusé ou accès confiné. | EXT-01, EXT-02, SEC-02. |
| REC-17 | Aucun réseau, modèle local et environnement préparé. | Parcours local complet ; fonctionnalités distantes déclarées indisponibles. | NFR-02, AGT-02. |
| REC-18 | Deux revues contradictoires. | Arbitrage prévu, aucune validation à la majorité implicite. | VER-06, DEC-06. |
| REC-19 | Test de propriété, fuzzing et mutant ciblé. | Contre-exemples conservés ; capacité de détection évaluée. | VER-04, VER-05. |
| REC-20 | Défaut échappé puis renforcement du harness. | Évolution distincte évaluée sur corpus de régression. | IMP-01, IMP-02, IMP-03. |
| REC-21 | Exigence humaine en mode print/JSON de Pi sans décision disponible. | Décision persistée, sortie adaptée et reprise dans le TUI Pi ; aucune attente infinie. | BES-02, UX-02, UX-04, DEC-06. |
| REC-22 | Dépôt sale, tentative abandonnée. | Travail initial intégralement préservé. | GIT-01, GIT-05. |
| REC-23 | Dépendance architecturalement interdite, tests métier verts. | Refus sur contrôle structurel. | CON-03, REQ-02. |
| REC-24 | Export expurgé et lecture hors ligne. | Dossier compréhensible, aucun secret sentinelle. | SEC-05, EVD-01, NFR-06. |
| REC-25 | Dette préexistante et contrôle instable. | Régression distinguée ; aucun passage obtenu par relances opportunistes. | VER-08, VER-02, DEC-03. |
| REC-26 | Dépôt vide sans HEAD, initialisation interrompue puis reprise. | Socle vérifié, fichiers initiaux préservés, première intégration correcte. | PRG-01, PRG-02, GIT-01. |
| REC-27 | Expression de besoins d’une application entière. | Décomposition traçable, reprise multi-session et vérification globale aux jalons. | BES-04, PRG-03, PRG-04, PRG-05. |
| REC-28 | Deux stacks sans moyens de test. | Préparation de suites natives et exécution propre ; aucun langage de test imposé par le noyau. | PRE-01, PRE-02, EXT-03. |
| REC-29 | Test métier qualifié mais fonctionnalité absente. | G2 peut passer, G5 échoue ; une panne du runner ne passe pas G2. | PRE-03, REQ-04, VER-02. |
| REC-30 | Tests de caractérisation d’un existant comportant un bug connu. | Comportements légitimes protégés ; bug non adopté comme nouvelle règle. | PRE-04, PRE-05, VER-08. |
| REC-31 | Corpus officiel de deux versions de framework. | Bonne version retrouvée, absence de réponse signalée, API erronée rejetée. | RAG-01, RAG-02, RAG-03, RAG-04. |
| REC-32 | Mise à jour du framework et corpus privé. | Références réévaluées ; aucune fuite ni instruction externe adoptée. | RAG-05, CTX-05, SEC-05. |
| REC-33 | Architecture déclarée différente du code réel. | Diagnostic localisé, alternatives proportionnées et choix justifié. | ARC-01, ARC-02, EXP-02. |
| REC-34 | Migration architecturale sur plusieurs incréments. | Contrats de transition vérifiés, nouvelle dérive bloquée et cible finale contrôlée. | ARC-03, ARC-04, ARC-05. |
| REC-35 | Remise aux standards sans fonctionnalité nouvelle. | Baseline, plan et réduction démontrée des écarts ; comportement préservé. | QLT-01, QLT-02, QLT-03, QLT-05. |
| REC-36 | Renommage, suppression de diagnostic et score global amélioré. | Aucun camouflage de dette ni compensation d’une nouvelle violation obligatoire. | QLT-04, QLT-05. |
| REC-37 | Projet exposant des données et nécessitant une migration. | Disciplines pertinentes couvertes, choix argumentés, intégrité et reprise vérifiées. | EXP-01, EXP-02, EXP-03, EXP-04. |
| REC-38 | Programme complet utilisé uniquement depuis le TUI Pi. | Création, préparation, preuves, décisions, interruption, reprise et intégration accessibles sans outil d’entrée séparé. | UX-01, UX-03, PRG-05. |
| REC-39 | Même opération via TUI, RPC, JSON, print et hôte SDK de Pi. | Verdict identique sur les mêmes faits ; sorties adaptées et décision en attente sans dialogue. | UX-02, UX-04, DEC-01. |
| REC-40 | Rechargement de package, bifurcation de conversation et changement de projet Pi. | Identité de programme et autorité vérifiées, aucune exécution dupliquée ; aucune approbation humaine forgée par le modèle. | UX-04, UX-05, DEC-05. |
| REC-41 | Arbre comprenant fichiers intacts, ajoutés, modifiés, supprimés et renommés. | Union des chemins complète dans le périmètre annoncé, suppression consultable et statuts compréhensibles sans couleur ; aucune certitude de renommage inventée. | UX-06, UX-07. |
| REC-42 | Modification partielle, indentation, opérateurs littéraux et contexte replié. | Rendu ancien/nouveau lisible sans préfixes de diff, marqueurs de patch ni numéros de ligne ; texte source fidèle et contexte dépliable. | UX-07. |
| REC-43 | Revue au clavier, constat localisé, redimensionnement et retour à la conversation. | Focus visible, navigation complète, sélection conservée, mode étroit utilisable ; aucun effet d’écriture ou d’approbation. | UX-08, UX-04. |
| REC-44 | Dépôt sans commit, fichiers non suivis et travail utilisateur préexistant. | Référence vide ou initiale explicite, candidat complet et origine des changements présentée sans attribution abusive. | UX-09, GIT-01, GIT-02. |
| REC-45 | Nouveau candidat produit pendant une revue humaine. | Instantané examiné conservé, nouveauté signalée, changement de version explicite et invalidations respectées. | UX-09, VER-03, UX-04. |
| REC-46 | Gros fichiers, binaires, liens, sous-modules, conflits et contenu terminal hostile. | Métadonnées et limites honnêtes, lecture confinée et inerte, affichage borné et annulable. | UX-10, SEC-01, NFR-04. |
| REC-47 | Même comparaison consultée depuis chaque entrée Pi qualifiée. | Identités et différences identiques, rendu adapté et disponible sans modèle ; aucun composant TUI imposé aux modes sans affichage. | UX-09, UX-11, UX-02. |

Ces scénarios complètent les critères unitaires attachés à chaque exigence ; ils ne les remplacent pas. Les fonctionnalités P1/P2 ne sont exécutées dans la recette d’une livraison que si elles sont incluses, mais leur absence reste annoncée.

### 13.3 Indicateurs et méthode d’évaluation

| Indicateur | Définition opérationnelle | Précaution |
| --- | --- | --- |
| Taux d’acceptation | Changements satisfaisant les gates / changements éligibles lancés. | Publier aussi les blocages et exclusions. |
| Défauts échappés | Défauts rattachés à des changements intégrés sur une fenêtre définie. | Distinguer gravité et délai de détection. |
| Coût par accepté | Coûts connus de tous les essais / changements acceptés. | Inclure échecs ; signaler la part inconnue. |
| Intervention humaine | Décisions et temps humain nécessaires par changement. | Une baisse obtenue en supprimant des gates n’est pas un progrès comparable. |
| Détection | Défauts de fixtures effectivement repérés. | Corpus tenu à l’écart des seules optimisations de prompts. |
| Faux rejets | Cas valides refusés par le dispositif. | Les suivre avec les défauts échappés. |
| Stabilité | Distribution des résultats sur répétitions comparables. | Aucun succès unique présenté comme garantie. |
| Reprise | Arrêts injectés récupérés sans perte ou double effet. | Tester avant/après les frontières critiques. |
| Couverture du programme | Obligations globales disposant d’un incrément ou d’une vérification de jalon. | Affectation ne signifie pas satisfaction. |
| Capacité de vérification | Contrôles opérationnels et qualifiés pour les risques identifiés. | Distinguer fichiers présents, tests exécutés et défauts détectables. |
| Trajectoire qualité | Écarts supprimés, nouveaux et restants par règle et périmètre. | Pas de compensation globale masquant une violation obligatoire. |
| Trajectoire architecturale | Frontières cibles réalisées et exceptions transitoires restantes. | Conserver les versions du référentiel. |
| Qualité documentaire | Questions témoins retrouvant une source pertinente de la bonne version. | Ne pas assimiler similarité d’un passage à vérité de la réponse. |
| Qualité des décisions | Décisions justifiées et acceptées à la revue, reprises et erreurs observées. | Évaluer la proportionnalité ; ne pas mesurer le nombre de rôles « experts ». |

## 14. Sécurité et frontières de confiance

Les éléments suivants sont considérés comme non fiables pour modifier l’autorité du harness : texte de demande importé, contenu du dépôt cible, pages web, sorties d’outils, résultats de modèles et code d’extensions exécuté dans le processus d’intervention. Ils peuvent fournir des données ou des propositions ; seuls les points d’adoption contrôlés modifient le référentiel normatif.

Les acteurs de confiance sont explicitement configurés : propriétaire des politiques, noyau, gestionnaire des preuves et mécanisme d’isolation. Le modèle de menace inclut une instruction malveillante indirecte, un outil qui écrit par une voie alternative, un package qui charge du code ambiant, un changement concurrent et une falsification de résultat par le producteur.

Dans la distribution intégrée à Pi, l’hôte d’entrée et les extensions de contrôle approuvées font partie de cette base de confiance. Les extensions et outils exécutés dans les interventions productrices restent confinés. La qualification doit vérifier qu’un outil ordinaire de la session hôte ne donne pas au modèle une voie d’écriture sur les politiques ou preuves protégées ; si le profil ne garantit pas cette séparation, il ne peut revendiquer SEC-02/SEC-03. Une demande d’opération par le modèle n’est jamais assimilée à un événement humain de l’hôte.

Le produit ne prétend pas résister à un administrateur système hostile qui contrôle le stockage, le noyau et ses clés. Une signature ou une attestation externe pourrait étendre le modèle, mais elle est optionnelle et ne doit pas être suggérée par le seul mot « preuve ».

Les scripts de build et de tests du projet sont eux-mêmes du code à exécuter avec un profil limité. Les permissions de l’exécuteur ne doivent pas être plus larges par commodité que ce qui est nécessaire. Un contrôle nécessitant un service distant doit déclarer données envoyées, credentials utilisés et nettoyage éventuel.

Une source externe peut évoluer. Lorsqu’elle justifie une décision, le dossier conserve URL, date de consultation, version si connue et extrait ou empreinte autorisés. Un résumé généré ne remplace pas la source ; les droits d’archivage et les données sensibles doivent être respectés.

## 15. Découpage proposé en livraisons

### L0 — Qualification technique, sans promesse produit

Valider un pi-package avec ses entrées TUI, RPC, JSON, print et SDK, puis sessions contrôlées, annulation, contexte, moteur simulé, confinement, rapport et packaging. Le prototype démontre un cycle complet depuis Pi, sans interface autonome du produit. Qualifier aussi un prototype de revue assemblé sur les composants de `pi-tui` : parcours du projet, comparaison mise en forme, navigation clavier, largeur contrainte et données exploitables depuis les autres entrées Pi. Fixer un corpus représentatif de grands arbres et fichiers ainsi que des budgets d’affichage mesurables ; vérifier l’absence de blocage de la session Pi. Livrer un rapport de qualification avec versions testées et limitations.

**Sortie :** décision argumentée sur l’intégration et la frontière d’exécution. Un échec ne réduit pas les exigences ; il conduit à adapter la solution ou à choisir un autre moteur.

### L1 — Socle produit P0 et parcours de référence

Livrer un pi-package utilisable dans le TUI et les autres entrées de Pi, conduisant un programme séquentiel et ses incréments avec diagnostic initial, demande, exigences, préparation, protocole gelé, conception, implémentation Pi, contrôles indépendants, revue configurée, reprise, intégration et dossier exportable. Couvrir dépôt vierge et existant, tests natifs à construire, documentation ciblée, référentiel architectural et qualité, ainsi qu’un parcours de remise à niveau. La revue intégrée arbre/lecteur, ses statuts accessibles, sa fidélité aux versions comparées et son adaptation aux autres entrées Pi font partie de cette livraison. Toutes les exigences P0 s’appliquent ; aucun package optionnel n’est nécessaire pour la recette de référence.

L’élargissement de la version 1.1 fait de L1 un jalon de capacité produit plus large qu’un simple prototype de changement. Il peut être construit en sous-livraisons : noyau et incrément unitaire ; préparation et dépôt vierge ; programme séquentiel ; diagnostic et remise à niveau. Ces étapes n’autorisent pas à annoncer toutes les capacités P0 avant leur recette.

**Sortie :** critères P0 vérifiés, parcours sur deux technologies, application neuve réalisée en plusieurs incréments et existant remis à niveau sur un périmètre explicite, macOS et Linux qualifiés, aucun défaut ouvert remettant en cause les invariants de la section 3.

### L2 — Généralisation P1

Ajouter enrichissement documentaire avancé, indexation RAG si justifiée, suivi architectural longitudinal, analyse approfondie de pertinence des contrôles, intégrations spécialisées de test, concurrence bornée et comparaison de modèles. Les contrats internes restent communs aux entrées Pi ; aucune API autonome du produit n’est prévue. Les incréments dépendants séquentiels et la préparation élémentaire font déjà partie de L1. Qualifier les packages retenus un par un puis ensemble.

**Sortie :** tous les critères P1 vérifiés et aucune régression P0. Les fonctionnalités non réalisées restent explicitement hors de la livraison annoncée.

### L3 — Expérimentation et surfaces optionnelles

Ajouter optimisation expérimentale P2, qualification d’autres hôtes ou interfaces utilisant Pi, autres systèmes d’exploitation, mécanismes d’attestation renforcée et adaptateurs distants selon besoin démontré. Aucune interface web ou messagerie autonome du harness n’est prévue.

**Sortie :** protocole spécifique par extension de périmètre ; les gates générales restent applicables.

## 16. Règles pour l’implémentation à partir de ce document

L’équipe ou l’agent d’implémentation doit, pour chaque incrément :

1. Sélectionner les identifiants d’exigences traités et leurs dépendances ; annoncer celles qui ne le sont pas.
2. Définir les schémas, interfaces et fixtures nécessaires avant de produire le comportement.
3. Conserver le noyau testable sans modèle réel et les règles architecturales exécutables.
4. Préférer un composant existant qualifiable lorsqu’il satisfait le contrat ; documenter les écarts avant de l’étendre.
5. Implémenter les cas d’échec, d’interruption et d’invalidation en même temps que le parcours nominal.
6. Exécuter les critères de recette correspondants et produire une matrice exigence → test → preuve.
7. Ne modifier un critère jugé inadapté que par une proposition de révision, avec impact et décision enregistrés.
8. Mettre à jour la documentation des capacités réelles, du packaging et des limites.
9. Pour un besoin global, maintenir le programme parent, ses obligations, sa trajectoire architecturale et qualité et ses critères de jalon.
10. Avant la production métier, qualifier les moyens de vérification et les ressources techniques manquantes ; ne pas contourner cette préparation en demandant seulement à l’agent de « bien tester » ou de « travailler comme un senior ».

**Définition de terminé :** exigence implémentée, test discriminant réussi, effets et permissions conformes, erreurs documentées, preuve conservée, absence de régression des invariants, statut mis à jour dans la matrice. Une démonstration réussie dans une session interactive ne suffit pas.

L’implémentation ne doit pas transformer les recommandations TypeScript/Pi en dépendances du modèle métier. Elle doit également éviter de développer une plateforme multi-agent, une UI web ou un système de mémoire général avant que les besoins identifiés ne l’exigent. Le RAG, s’il est retenu, répond aux questions techniques du projet et reste proportionné au corpus et aux résultats de sa qualification.

## 17. Décisions à instruire et hypothèses non bloquantes

Le document est exploitable pour démarrer L0 et préparer L1. Les décisions suivantes ont une option proposée et un moment de résolution ; elles ne demandent pas de suspendre toute conception.

| ID | Décision | Option de départ | Preuve attendue avant adoption |
| --- | --- | --- | --- |
| ADR-01 | Structure interne du pi-package. | Extension TypeScript, noyau séparé si nécessaire, interventions Pi confinées. L’entrée par Pi est déjà adoptée. | Prototype L0 : modes Pi, événements, annulation, décisions et packaging. |
| ADR-02 | Frontière d’exécution. | Processus Pi confiné ; noyau et preuves hors de ses droits. | REC-07, REC-11, REC-16 sur les plateformes supportées. |
| ADR-03 | Stockage normatif. | Formats ouverts et journal récupérable ; fichiers ou base embarquée. | Pannes injectées, export et migration NFR-03/NFR-08. |
| ADR-04 | Schémas publics. | JSON Schema versionné aux frontières. | Validation d’exemples valides/invalides et évolution compatible. |
| ADR-05 | Bibliothèque de machine à états. | Choix après prototype du noyau ; aucune dépendance obligatoire présumée. | Tests de transitions et invariants générés. |
| ADR-06 | Délégation. | Sessions directement pilotées ; comparer pi-subagents en L2. | Contrôle des budgets, droits, revues et annulation. |
| ADR-07 | Diagnostics dans Pi. | Essai pi-lens, maintien des contrôles finaux indépendants. | Compatibilité TUI/autres entrées Pi et absence d’effets non autorisés. |
| ADR-08 | Distribution et licence propre. | Pi-package open source et dépendances internes gérées ; Apache-2.0 candidate pour le produit. | Installation depuis Pi, inventaire de licences et notices, aucun lancement auxiliaire demandé à l’utilisateur. |
| ADR-09 | Politiques de modèles et coûts. | Identifiants explicites, paramètres natifs, aucune équivalence inventée. | Contrats sur deux fournisseurs et endpoint local. |
| ADR-10 | Rétention et équipe. | Données locales contrôlées par le propriétaire en L1. | Profil d’export et d’effacement ; exigences d’équipe avant usage partagé. |
| ADR-11 | Organisation du programme et des jalons. | Graphe d’incréments séquentiels en L1, critères globaux distincts. | REC-27 et reprise après révision de contrat partagé. |
| ADR-12 | Préparation des tests natifs. | Adaptateur générique plus profils par stack, qualification positive/négative. | REC-28, REC-29, REC-30. |
| ADR-13 | Recherche documentaire et RAG. | Corpus versionné, lecture/recherche simple d’abord ; index selon besoin. | REC-31, REC-32 et questions témoins sur la pertinence des passages. |
| ADR-14 | Baselines architecture et qualité. | Constats par règle et composant, exceptions bornées, cibles contextualisées. | REC-33 à REC-36 ; non-régression métier. |
| ADR-15 | Profils d’expertise et profondeur de revue. | Disciplines et risques applicables, analyses spécialisées sans nombre fixe d’agents. | REC-37 et revue de proportionnalité des décisions. |
| ADR-16 | Adaptation des interactions aux modes Pi. | Opérations communes, composants TUI adaptés, réponses et décisions persistées dans les autres modes. | REC-38 à REC-40, provenance des approbations et absence de dépendance à un widget. |
| ADR-17 | Réalisation de la revue arbre/lecteur dans Pi. | Surface assemblée sur les composants publiés par `pi-tui`, données de comparaison indépendantes du rendu, ancien/nouveau distinguables sans syntaxe de patch ; ce que `pi-tui` ne couvre pas est établi avant d'être écrit. | L0 : API publiques Pi, focus, raccourcis, styles accessibles, seuil de largeur, grands volumes et sorties adaptées ; REC-41 à REC-47 pour la recette produit. |

La liste exacte de modèles, les versions verrouillées des packages, les outils de vérification par technologie et les valeurs finales de performance sont résolus par qualification. Ils ne peuvent être déduits de leur seule présence dans un catalogue.

## 18. Couverture des deux articles

La table suivante indexe les thèmes des articles ; elle ne reproduit pas leurs développements. Le reste du document opérationnalise ces thèmes par des choix de produit et de recette proposés.

### 18.1 Article Scalastic

Source : [S1 — article complet](https://scalastic.io/vibe-coding-ai-software-quality/).

| Section / thème | Exigences et sections correspondantes |
| --- | --- |
| 1. Oracle et autoévaluation | REQ-04, VER-05, VER-06, DEC-01. |
| 2. Contraintes observables et contrats | REQ-01 à REQ-03 ; section 7. |
| 3. Architecture exécutable | CON-03, NFR-07. |
| 4. Guidage et feedback ; jugement | CTX-01 à CTX-05, VER-01, VER-06, DEC-02. |
| 5. Propriétés, fuzzing, mutation, complémentarité | VER-04, VER-05 ; REC-19. |
| 6. Vérification conçue avant production | REQ-03 à REQ-05 ; G2. |
| 7. Connaissance organisée dans le dépôt | CON-05, CTX-03, CTX-04. |
| 8. Rôles et contextes séparés | AGT-04, CTX-05, SEC-02. |
| 9. Environnement et économie des modèles | AGT-01 à AGT-07, EXT-04, IMP-03. |
| 10. Renforcement après erreur | IMP-01, IMP-02 ; parcours 9.6. |
| 11. Système de contrôle | Section 3, DEC-01 à DEC-06, section 7. |
| 12. Responsabilité de l’ingénieur | IMP-05, acteurs section 2.3. |
| 13. Maîtrise durable de la production | Ensemble des invariants ; sections 13 et 16. |
| Exploitation et contraintes transversales | REQ-02, VER-07, NFR-01 à NFR-08. |

Les anecdotes, chiffres de tiers, ressources bibliographiques et analogies pédagogiques de S1 ne deviennent pas des exigences. En particulier, le document ne généralise pas l’idée qu’un résultat de test est toujours reproductible : il exige l’identification de l’environnement, des aléas et de l’indétermination.

### 18.2 Article Earendil

Source : [S2 — What is a Harness?](https://earendil.com/posts/what-is-a-harness/).

| Thème | Exigences et sections correspondantes |
| --- | --- |
| Environnement logiciel de l’agent | Section 3, AGT-03, EXT-04. |
| Instructions système | CTX-02, CTX-04. |
| Outils disponibles et appels | AGT-03, SEC-01, SEC-04. |
| Boucle agentique | AGT-03, DEC-03 ; section 3.1. |
| Adaptation aux modèles | AGT-01, AGT-02, AGT-07. |
| Liberté de fournisseur | AGT-02, EVD-01, NFR-02. |
| Appropriation locale et historique | EVD-01 à EVD-03, NFR-06. |
| Personnalisation et partage | EXT-01, EXT-02, EXT-05. |
| Interfaces multiples | UX-01, UX-02. |
| Neutralité et open source | NFR-02, EXT-04 ; section 10. |

Les exemples d’email ou de tableur illustrent la généralité d’un harness ; ils n’imposent pas une messagerie ou un tableur dans ce produit de développement. L’autonomie laissée au modèle est bornée ici par les permissions et les budgets du mandat. Les déclarations promotionnelles et les métaphores ne constituent pas des garanties techniques.

## 19. Sources techniques et règle de fraîcheur

Sources consultées le 15 septembre 2026, en complément de S1 et S2 :

- [S3 — Pi SDK](https://pi.dev/docs/latest/sdk) : intégration programmatique.
- [S4 — Pi RPC](https://pi.dev/docs/latest/rpc) : contrôle depuis un processus externe.
- [S5 — Pi Extensions](https://pi.dev/docs/latest/extensions) : outils et événements.
- [S6 — Pi Security](https://pi.dev/docs/latest/security) : périmètre de sécurité à qualifier.
- [S7 — pi-lens](https://pi.dev/packages/pi-lens).
- [S8 — pi-subagents](https://pi.dev/packages/pi-subagents).
- [S9 — pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter).
- [S10 — pi-web-access](https://pi.dev/packages/pi-web-access).
- [S11 — pi-autoresearch](https://github.com/davebcn87/pi-autoresearch).
- [S12 — Retour Shopify sur autoresearch](https://shopify.engineering/autoresearch).
- [S13 — pi-sandbox](https://pi.dev/packages/pi-sandbox).

Les pages `latest`, catalogues npm et branches Git évoluent. Avant une implémentation, la qualification doit retenir un tag ou une version exacte, enregistrer les dépendances et vérifier les API réellement exposées. Le présent document ne remplace pas cette étape par une affirmation de compatibilité.

## 20. Couverture des précisions de périmètre — version 1.1

Les exigences de cette section proviennent des précisions du demandeur dans la présente discussion. Elles étendent les deux articles par des obligations de produit, sans être attribuées à leurs auteurs.

| Cas demandé | Exigences nouvelles ou renforcées | Traduction opérationnelle |
| --- | --- | --- |
| 1. Existant ou dépôt vierge | PRG-01, PRG-02, CON-01, GIT-01. | Diagnostic du point de départ ; bootstrap et première intégration sans HEAD. |
| 2. Besoin nécessitant plusieurs cycles | BES-04, PRG-03 à PRG-05. | Programme parent, incréments, budgets, jalons et acceptation globale. |
| 3. Tests dans les technologies cibles, à mettre en place si absents | PRE-01 à PRE-05, EXT-03, REQ-04. | Phase de préparation autorisée ; qualification, gel puis utilisation des contrôles. |
| 4. Documentation officielle et RAG éventuel | RAG-01 à RAG-05. | Acquisition versionnée, recherche proportionnée et vérification des API. |
| 5. Architecture de l’existant et du code produit | ARC-01 à ARC-05, CON-03. | Diagnostic, cible argumentée, migration progressive et contrôles structurels. |
| 6. Qualité de l’existant et du code produit | QLT-01 à QLT-05, VER-08. | Référentiel contextualisé, baseline, réduction de dette et non-aggravation. |
| 7. Démarche attendue d’experts seniors | EXP-01 à EXP-04. | Disciplines applicables couvertes, arbitrages argumentés, simplicité et preuves. |

**Résultat attendu de l’implémentation :** un outil capable de construire une application et d’amener un existant vers des standards explicitement adoptés, par une succession de préparations et d’incréments vérifiables. Il doit rendre les décisions explicables, les écarts visibles et la progression mesurable, tout en permettant de remplacer les composants agentiques sans perdre le contrat métier.

## 21. Périmètre d’accès adopté — version 1.2

| Précision du demandeur | Conséquence normative |
| --- | --- |
| Utilisation dans le TUI Pi | Interface interactive de référence, workflow complet dans Pi — UX-01. |
| Utilisation dans les autres entrées Pi | TUI, RPC, JSON, print et hôte SDK qualifiés, mêmes gates avec rendu adapté — UX-02/UX-04. |
| Aucun CLI propre au produit | Retrait de la commande autonome comme point d’entrée ; commandes internes à Pi possibles. |
| Aucun pilotage par CI | Aucun job ou workflow CI de conduite du harness à fournir ; REC-21 porte désormais sur les modes Pi sans dialogue. |
| Produit intégré, contrôle préservé | Pi-package en façade, noyau normatif indépendant et frontières de confiance qualifiées — section 10. |

Cette révision remplace les anciennes orientations de CLI autonome et de CI. Elle ne modifie pas la capacité d’exécuter les outils de développement de la cible ni les exigences de construction d’applications, de préparation des tests, de documentation, d’architecture, de qualité et d’expertise transversale.


## 22. Revue visuelle du projet adoptée — version 1.3

| Précision du demandeur | Conséquence normative |
| --- | --- |
| Arborescence à gauche, comme dans un explorateur de code | Vue intégrée au TUI Pi, répertoires dépliables, sélection et filtre de changements — UX-06, UX-08. |
| Coloration/mise en forme des fichiers modifiés, supprimés et intacts | États explicites et accessibles sans couleur, complétés par ajouts et renommages ; état agrégé des répertoires — UX-06. |
| Contenu et modifications à droite | Lecteur de contenu et comparaison avec coloration syntaxique, styles ancien/nouveau et contexte accessible — UX-07. |
| Rendu agréable sans les signes ou numéros de la commande diff | Aucun préfixe de diff, marqueur de patch ou numéro de ligne dans la présentation ; caractères réels du code conservés — UX-07. |
| Consultation cohérente pendant plusieurs cycles | Références sélectionnables, instantanés identifiés, état récent signalé et décisions attachées à la bonne révision — UX-09. |
| Utilisation dans Pi et ses autres entrées | Données de revue communes, adaptation aux capacités d’affichage et aucun outil d’entrée autonome — UX-11. |

La référence à VSCodium exprime une organisation de lecture et une qualité de présentation. Elle n’ajoute pas une obligation d’éditeur complet, de terminal intégré, de débogueur ou de modification interactive du code. Le périmètre demandé est la visualisation et la revue, accessible dès L1. La faisabilité de l’agencement exact dans Pi doit être établie en L0 ; une limitation technique constatée appelle une adaptation documentée de la solution, pas le retrait silencieux de cette exigence.
