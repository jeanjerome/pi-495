# Références externes du projet 495

**État de la consolidation : 16 septembre 2026**  
**Objet :** regrouper les dépôts, documentations, articles, papiers et composants externes déjà cités dans les travaux de cadrage, de spécification, de vérification et de conception de 495.

Ce document est un registre de provenance, pas une liste de dépendances. Une référence peut être structurante, servir seulement de comparaison, rester à qualifier ou avoir été écartée comme solution directe. L’inclusion d’un projet ne vaut donc ni adoption ni approbation de sa licence, de son modèle économique ou de son périmètre de sécurité.

## 1. Légende

| Statut | Sens dans 495 |
| --- | --- |
| **Socle** | Référence sur laquelle une décision actuelle de 495 s’appuie directement. |
| **Structurante** | Source ayant façonné le modèle fonctionnel, la vérification ou l’architecture. |
| **Candidate** | Composant ou protocole à évaluer avant toute adoption. |
| **Comparative** | Réalisation étudiée pour ses mécanismes ou son UX, sans décision d’intégration. |
| **Historique** | Source antérieure ou projet d’origine utile pour comprendre la trajectoire de 495. |

## 2. Harness engineering et maîtrise du développement par agents

| Référence | Type | Apport pour 495 | Statut |
| --- | --- | --- | --- |
| [AI Harness Engineering: A Runtime Substrate for Foundation-Model Software Agents](https://arxiv.org/abs/2605.13357) | Papier de recherche | Isolation, gates, feedback, preuves, autorité de décision et distinction entre modèle, harness et environnement. C’est la référence théorique principale du projet. | **Structurante** |
| [Agentic Harness Engineering: Observability-Driven Automatic Evolution of Coding-Agent Harnesses](https://arxiv.org/abs/2604.25850) | Papier de recherche | Observabilité des composants, des expériences et des décisions ; chaque évolution devient une hypothèse vérifiable. À ne pas confondre avec arXiv 2605.13357. | **Structurante** |
| [Code officiel d’Agentic Harness Engineering](https://github.com/china-qijizhifeng/agentic-harness-engineering) | Dépôt GitHub | Mise en œuvre expérimentale de la boucle d’évolution observable du papier 2604.25850. | **Comparative** |
| [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) | Article | Dépôt comme base de connaissance, principes directeurs, contrôle des patterns et développement agent-first. | **Structurante** |
| [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html) | Article | *Steering loop*, feedforward, feedback et contrôles déterministes autour des agents. | **Structurante** |
| [What is a Harness?](https://earendil.com/posts/what-is-a-harness/) | Article | Définition d’un harness minimal et adaptable ; lien direct avec le choix de Pi comme hôte. | **Structurante** |
| [Vibe coding : comment garder la maîtrise du code produit par l’IA](https://scalastic.io/vibe-coding-ai-software-quality/) | Article | Lecture du génie logiciel comme système de contrôle ; oracle, harness, feedforward et feedback. | **Structurante** |
| [DeepSeek Harness — developer preview](https://www.deepseek.com/harness/en/) | Produit/documentation | Exemple de harness complet étudié dans l’état de l’art. Aucune dépendance prévue. | **Comparative** |
| [Hermes Agent — documentation](https://hermes-agent.nousresearch.com/docs/) | Documentation | Runtime d’agent, outils, skills et mémoire ; comparaison avec un agent plus intégré. | **Comparative** |
| [Hermes Agent — dépôt](https://github.com/NousResearch/hermes-agent) | Dépôt GitHub | Code source du système précédent. | **Comparative** |
| [mattpocock/skills](https://github.com/mattpocock/skills) | Dépôt GitHub | Exemple de connaissances procédurales conditionnelles livrées comme skills. | **Comparative** |
| [Finding bugs with Claude and property-based testing](https://www.anthropic.com/research/property-based-testing) | Article de recherche | Génération d’invariants et exploration de cas au-delà des exemples d’acceptation. | **Structurante** |

## 3. Pi : hôte et surface d’intégration

495 est conçu comme un package Pi en TypeScript. Il n’expose pas de CLI utilisateur propre et ne déporte pas sa conduite dans une CI. Les opérations sont accessibles par les entrées natives de Pi ; le rendu riche est réservé au TUI.

### 3.1 Projet et documentation officiels

| Référence | Apport pour 495 | Statut |
| --- | --- | --- |
| [Site officiel de Pi](https://pi.dev/) | Présentation du harness, des modes interactif, print/JSON, RPC et SDK, ainsi que de l’extensibilité. | **Socle** |
| [earendil-works/pi](https://github.com/earendil-works/pi) | Monorepo de Pi et source des contrats réellement intégrés. | **Socle** |
| [Extensions Pi](https://pi.dev/docs/latest/extensions) | Commandes, outils, événements, providers, rendu et cycle de vie d’une extension. | **Socle** |
| [SDK Pi](https://pi.dev/docs/latest/sdk) | Création et pilotage typé de sessions Pi dans les workers de 495. | **Socle** |
| [Mode RPC Pi](https://pi.dev/docs/latest/rpc) | Entrée interprocessus et intégrations non interactives ; repli interne à qualifier. | **Socle** |
| [Composants TUI Pi](https://pi.dev/docs/latest/tui) | Composants, clavier, focus, overlays et rendu différentiel nécessaires à la revue à deux panneaux. | **Socle** |
| [Sécurité Pi](https://pi.dev/docs/latest/security) | Limites du modèle de confiance de Pi et responsabilité des extensions. | **Socle** |
| [Package `@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) | API d’extension, sessions, commandes et outils. La conception actuelle a été établie sur Pi 0.85.1. | **Socle** |
| [Package `@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui) | Bibliothèque TUI utilisée par Pi et réutilisable par la vue de revue. | **Socle** |

Pour figer les hypothèses de conception, le dossier technique a également référencé la documentation du dépôt Pi au commit `aa50fe778aedb6ebeb918fc594599d12a60d8a0c` : [extensions](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/extensions.md), [SDK](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/sdk.md), [RPC](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/rpc.md), [TUI](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/tui.md), [packages](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/packages.md) et [format de session](https://github.com/earendil-works/pi/blob/aa50fe778aedb6ebeb918fc594599d12a60d8a0c/packages/coding-agent/docs/session-format.md).

### 3.2 Packages Pi examinés

| Référence | Capacité étudiée | Position actuelle |
| --- | --- | --- |
| [pi-lens](https://pi.dev/packages/pi-lens) | Diagnostics de langage, lint, typage et analyse structurelle pendant l’édition. | Source d’intégration possible ; une preuve finale doit toujours être recalculée par 495. |
| [pi-subagents](https://pi.dev/packages/pi-subagents) | Délégation, rôles et workflows scriptés. | Comparaison pour les interventions spécialisées ; l’autorité et les permissions restent gérées par 495. |
| [pi-mcp-adapter](https://pi.dev/packages/pi-mcp-adapter) | Découverte et accès à des serveurs MCP. | Candidate pour des outils distants explicitement autorisés, pas pour le noyau de confiance. |
| [pi-web-access](https://pi.dev/packages/pi-web-access) | Recherche et lecture de sources ou dépôts. | Candidate pour les interventions documentaires, avec archivage de provenance à définir. |
| [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch) | Boucle d’expériences mesurées avec conservation ou retour arrière. | Inspiration pour un parcours d’optimisation futur, borné par les gates générales. |
| [Retour de Shopify Engineering sur autoresearch](https://shopify.engineering/autoresearch) | Retour d’usage réel de la boucle d’optimisation. | Signal d’usage, pas validation des garanties de 495. |
| [pi-sandbox](https://pi.dev/packages/pi-sandbox) | Confinement de Bash et filtrage des outils de fichiers. | Backend à comparer ; insuffisant à lui seul comme frontière de sécurité. |

## 4. Revue TUI, arborescence et visualisation des changements

Ces références ont été examinées pour la vue demandée : arborescence colorée à gauche, contenu et changements lisibles à droite, sans syntaxe brute `+`/`-` ni numéros de ligne de `diff`.

| Référence | Ce qui est réutilisable ou observable | Statut |
| --- | --- | --- |
| [cmpadden/pi-diff-review](https://github.com/cmpadden/pi-diff-review) | Extension Pi de revue de diff ; navigation et intégration à la conversation. | **Comparative** |
| [Page Pi de pi-diff-review](https://pi.dev/packages/pi-diff-review) | Métadonnées du package, installation et manifeste Pi. | **Comparative** |
| [badlogic/pi-diff-review](https://github.com/badlogic/pi-diff-review) | Fenêtre native, barre latérale de fichiers, statuts Git, chargement paresseux et commentaires. | **Comparative** ; dépendances graphiques et CDN à ne pas reprendre telles quelles. |
| [`@zigai/pi-tree`](https://pi.dev/packages/%40zigai/pi-tree) | Présentation arborescente dans Pi. | **Comparative** |
| [buddingnewinsights/pi-diff](https://github.com/buddingnewinsights/pi-diff/) | Rendu de changements sous forme d’extension Pi. | **Comparative** |
| [Issue Pi #9238](https://github.com/earendil-works/pi/issues/9238) | Discussion liée aux capacités ou limites de rendu TUI rencontrées pendant l’étude. | **Historique de conception** |
| [npm `diff`](https://www.npmjs.com/package/diff) | Calcul et structuration de différences textuelles. | **Candidate** derrière un modèle de revue propre à 495. |
| [npm `simple-git`](https://www.npmjs.com/package/simple-git) | Accès programmatique à Git. | **Candidate** ; ne remplace pas le modèle d’identité du candidat. |
| [Ink](https://www.npmjs.com/package/ink) | Modèle React pour interfaces terminal. | **Comparative** ; non retenu comme socle puisque 495 s’intègre au TUI natif de Pi. |
| [Terminal Kit](https://github.com/cronvel/terminal-kit) | Widgets et primitives terminal. | **Comparative** |
| [blessed-contrib](https://github.com/yaronn/blessed-contrib) | Widgets de tableaux de bord terminaux. | **Comparative** |

## 5. Fallow et analyse de code multi-langage

### 5.1 Référence Fallow

| Référence | Apport étudié | Statut |
| --- | --- | --- |
| [fallow-rs/fallow](https://github.com/fallow-rs/fallow) | Graphe de dépendances, constats déterministes, empreintes stables, baseline, contrôle du changement et sorties structurées. | **Structurante** pour le protocole d’analyse, pas dépendance universelle. |
| [Dead code et cycles](https://docs.fallow.tools/analysis/dead-code) | Fichiers, exports, membres et dépendances inutilisés ; cycles et traces justificatives. | **Comparative** |
| [Architecture boundaries](https://docs.fallow.tools/analysis/boundaries) | Règles déclaratives de frontières et localisations précises. | **Structurante** |
| [Duplication](https://docs.fallow.tools/analysis/duplication) | Détection de clones, degrés de similarité et groupes de constats. | **Comparative** |
| [Health et complexité](https://docs.fallow.tools/explanations/health) | Agrégation de hotspots et score de santé explicable. | **Comparative** |
| [`fallow audit`](https://docs.fallow.tools/cli/audit) | Gate sur les constats introduits par un changement, avec verdict et baseline. | **Structurante** |
| [Type-aware analysis contract](https://github.com/fallow-rs/fallow/blob/main/docs/type-aware-analysis.md) | Enrichissement sémantique optionnel et preuves de résolution TypeScript. | **Structurante** pour la séparation syntaxe/sémantique. |
| [Similar-code analysis](https://github.com/fallow-rs/fallow/blob/main/docs/similar-code-analysis.md) | Analyse sémantique locale optionnelle et revue explicite des rapprochements. | **Comparative** |
| [Architecture invariants](https://github.com/fallow-rs/fallow/blob/main/docs/architecture-invariants.md) | Invariants internes protégeant la cohérence de l’analyseur. | **Comparative** |
| [Repository map](https://github.com/fallow-rs/fallow/blob/main/docs/development/repo-map.md) | Découpage des crates et frontières internes de Fallow. | **Comparative** |
| [Cargo.toml de Fallow](https://github.com/fallow-rs/fallow/blob/main/Cargo.toml) | Identification des dépendances Rust, notamment de l’écosystème Oxc. | **Source d’analyse** |
| [Parseur de Fallow](https://github.com/fallow-rs/fallow/blob/main/crates/extract/src/parse.rs) | Couplage concret de l’extraction aux syntaxes JavaScript/TypeScript. | **Source d’analyse** |

Fallow est écrit en Rust, mais son analyse statique reste liée à JavaScript/TypeScript par ses parseurs, ses règles de résolution de modules, son modèle de symboles, ses conventions de frameworks et son enrichissement TypeScript. 495 reprend donc **le format commun et le protocole de constats**, pas l’hypothèse qu’un analyseur unique puisse comprendre nativement toutes les sémantiques de langage. La partie statique open source de Fallow doit en outre être distinguée de son extension Runtime optionnelle payante.

### 5.2 Briques envisagées pour généraliser le protocole

| Référence | Rôle envisagé | Statut |
| --- | --- | --- |
| [Oxc](https://github.com/oxc-project/oxc) | Écosystème Rust de parsing et d’analyse JavaScript/TypeScript utilisé par Fallow. | **Source d’analyse** ; spécifique à cette famille de langages. |
| [Tree-sitter](https://github.com/tree-sitter/tree-sitter) | Arbres syntaxiques incrémentaux pour de nombreux langages. | **Candidate** pour l’extraction syntaxique commune, pas pour la sémantique complète. |
| [SCIP](https://github.com/scip-code/scip) | Format commun d’index de code et d’identités de symboles. | **Candidate** pour les faits inter-langages. |
| [Schéma `scip.proto`](https://github.com/scip-code/scip/blob/main/scip.proto) | Contrat sérialisé de SCIP. | **Candidate** pour un adaptateur d’indexation. |

La décision actuelle est : **adaptateurs d’analyse natifs par écosystème, enveloppe de constat commune**. L’homogénéité de 495 porte sur les identités, localisations, empreintes, niveaux de confiance, preuves et verdicts — pas sur l’imposition d’un moteur unique à tous les langages.

## 6. Spécification, conception et artefacts versionnés

| Référence | Apport pour 495 | Statut |
| --- | --- | --- |
| [GitHub Spec Kit — dépôt](https://github.com/github/spec-kit) | Workflow `Specify → Plan → Tasks → Implement`, constitution et artefacts versionnés. | **Structurante** |
| [GitHub Spec Kit — documentation](https://github.github.com/spec-kit/) | Présentation du processus et des commandes. | **Structurante** |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Dossiers de changement, propositions, spécifications, conception et tâches ; évolution des artefacts. | **Structurante** |
| [Principes du Manifeste Agile](https://agilemanifesto.org/principles.html) | Incréments utiles, adaptation et collaboration ; 495 ajoute des preuves explicites aux boucles courtes. | **Structurante** |
| [BDD — Cucumber](https://cucumber.io/docs/bdd/) | Exemples métier partagés et scénarios exécutables lorsque pertinents. | **Structurante** |
| [Gherkin](https://github.com/cucumber/gherkin) | Grammaire ouverte des scénarios d’acceptation. | **Candidate** comme format d’entrée/sortie, jamais obligatoire pour toute exigence. |
| [Cucumber Messages](https://github.com/cucumber/messages) | Enveloppes structurées pour compiler et échanger des artefacts Gherkin. | **Candidate** pour un adaptateur BDD. |
| [ADR GitHub](https://adr.github.io/) | Pratique de consignation des décisions d’architecture. | **Structurante** |
| [ADR templates](https://adr.github.io/adr-templates/) | Formats de décisions et alternatives. | **Structurante** |
| [OpenAPI Initiative — What is OpenAPI?](https://www.openapis.org/what-is-openapi) | Exemple de contrat d’interface versionné et contrôlable. | **Comparative** |

495 ne copie pas le workflow d’un de ces outils. Il combine des artefacts versionnés inspirés de Spec Kit et OpenSpec avec un graphe d’exigences, des liens vers les contrôles et des gates qui refusent une conclusion non prouvée.

## 7. Contrats, persistance, preuve et sécurité

| Référence | Apport pour 495 | Statut |
| --- | --- | --- |
| [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) | Contrats versionnés aux frontières : commandes, événements, résultats, constats et adaptateurs. | **Socle** |
| [TypeBox](https://github.com/sinclairzx81/typebox) | Définition TypeScript et génération de JSON Schema pour éviter la divergence entre types et schémas. | **Candidate retenue par l’ADR-006**, à figer par version. |
| [SQLite](https://www.sqlite.org/) | Transactions locales, projections, reprise et concurrence contrôlée. | **Socle** |
| [Git worktree](https://git-scm.com/docs/git-worktree) | Mécanisme possible pour matérialiser des espaces de travail isolés. | **Candidate** ; l’identité du candidat ne se réduit pas au worktree. |
| [SLSA](https://slsa.dev/) | Provenance, intégrité des étapes et garanties de supply chain. | **Structurante** pour la provenance, sans prétendre à une conformité SLSA actuelle. |
| [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | Exécution, évaluation et traçabilité de tâches agentiques. | **Comparative** |
| [Harbor](https://github.com/harbor-framework/harbor) | Environnements et évaluation de systèmes agents. | **Comparative** |
| [ControlArena](https://control-arena.aisi.org.uk/) | Contrôle et évaluation d’agents dans des environnements surveillés. | **Comparative** |

Le magasin d’objets adressés par contenu (CAS SHA-256), la chaîne d’empreintes des événements et le protocole JSONL de workers sont des choix propres à 495. Ils utilisent des mécanismes standards, mais aucun dépôt tiers spécifique n’a été retenu à ce stade.

## 8. Agents, providers et exécution des modèles

| Référence | Apport ou question étudiée | Statut |
| --- | --- | --- |
| [OpenAI Codex](https://github.com/openai/codex) | Agent de code, sandbox et modèle d’exécution antérieurement utilisé par 495. | **Comparative / historique** dans la nouvelle architecture centrée sur Pi. |
| [Présentation de Codex](https://openai.com/codex/) | Documentation produit citée dans les premiers README et badges. | **Historique** |
| [Claude Code](https://www.anthropic.com/claude-code) | Agent de code et exécution non interactive étudiés comme provider de Pi. | **Candidate** |
| [Claude Code CLI usage](https://docs.anthropic.com/en/docs/claude-code/cli-usage) | Options de `claude -p`, formats et modes non interactifs. | **Candidate** |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | Dépôt public de Claude Code, notamment pour le suivi des changements et incidents. | **Source de qualification** |
| [pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider) | Provider Pi appelant Claude Code CLI plutôt que l’API Anthropic directe. | **Candidate à qualifier** |
| [Conception de pi-claude-code-provider](https://github.com/chem/pi-claude-code-provider/blob/main/DESIGN.md) | Traduction entre le provider Pi, `streamSimple()` et le processus Claude Code. | **Source de qualification** |
| [Package npm `pi-claude-code-provider`](https://www.npmjs.com/package/pi-claude-code-provider) | Distribution et version du provider. | **Candidate à qualifier** |
| [Issue Claude Code #45911](https://github.com/anthropics/claude-code/issues/45911) | Élément de vérification sur les politiques ou comportements d’accès étudiés. | **Source ponctuelle** |
| [Issue Hermes Agent #79760](https://github.com/NousResearch/hermes-agent/issues/79760) | Élément comparatif cité lors de l’analyse des accès Claude. | **Source ponctuelle** |

L’usage de Claude Code CLI depuis Pi reste une intégration à qualifier, notamment au regard des conditions d’accès, de l’authentification, de la fidélité du streaming, de l’annulation, de la reprise et des permissions. Une simple compatibilité technique ne vaut pas autorisation contractuelle.

## 9. Origines et continuité du projet

| Référence | Rôle | Statut |
| --- | --- | --- |
| [CodeServo](https://github.com/jeanjerome/codeservo) | Prédécesseur de 495 ; source de certaines idées de workflow et de validation. | **Historique** |
| [HexaGlue](https://github.com/hexaglue/hexaglue) | Exemple de contrôles d’architecture, de classification et de génération guidée par un modèle. | **Comparative / historique** |
| [uv](https://docs.astral.sh/uv/) | Gestionnaire Python utilisé par la première implémentation de 495. | **Historique** depuis le passage à un package Pi TypeScript. |

## 10. Lecture synthétique : ce que 495 retient réellement

| Besoin de 495 | Références principales | Décision actuelle |
| --- | --- | --- |
| Harness comme système de contrôle | arXiv 2605.13357, OpenAI, Fowler/Böckeler, article Scalastic | Feedforward avant actuation, feedback après observation, preuves à chaque gate. |
| Hôte extensible et surfaces d’entrée | Pi, Extensions, SDK, RPC, TUI, Security | Package Pi sans CLI propre ; même noyau de décision, projections adaptées à chaque entrée. |
| Artefacts de développement | Spec Kit, OpenSpec, ADR, Gherkin | Artefacts immuables et révisés, reliés aux exigences, contrôles, objets et décisions. |
| Vérification du changement | Fallow, property-based testing | Baseline, constats stables, contrôle de l’introduit, preuves déterministes puis revue bornée. |
| Multi-langage | Fallow, Tree-sitter, SCIP | Protocole commun et adaptateurs natifs ; pas d’analyseur sémantique universel fictif. |
| Revue humaine | TUI Pi, pi-diff-review, pi-tree, pi-diff | `ReviewSnapshot` commun ; arborescence et lecteur de changements à deux panneaux en TUI. |
| Confinement et provenance | Pi Security, pi-sandbox, SLSA, Inspect AI, ControlArena | Permissions déclaratives, backend qualifié et refus fermé ; journal et objets liés par empreintes. |
| Agents et modèles | Pi providers, Codex, Claude Code, provider Claude CLI | Agents remplaçables derrière Pi ; capacités, permissions et résultats contrôlés par 495. |

## 11. Références volontairement non promues au rang de dépendances

- Les outils seulement comparés ne deviennent pas automatiquement des composants de 495.
- Les fonctions payantes ou non open source, notamment **Fallow Runtime**, ne font pas partie de la solution retenue.
- Les interfaces graphiques externes qui imposent une application séparée, un CDN ou une installation additionnelle ne satisfont pas le besoin d’intégration native à Pi.
- Les outils d’analyse propres à un langage restent derrière des adaptateurs ; leur format de sortie doit être normalisé par 495.
- Les issues GitHub sont des traces ponctuelles, non des contrats stables. Toute décision doit être confirmée par une documentation, une version ou un test de qualification.
- Les pages `latest` servent à la veille. Les décisions reproductibles doivent référencer une version, un tag ou un commit précis.

## 12. Entretien de ce registre

À chaque nouvelle référence, consigner au minimum :

1. son URL canonique et, si possible, un tag ou commit observé ;
2. la question de 495 qu’elle éclaire ;
3. le statut `Socle`, `Structurante`, `Candidate`, `Comparative` ou `Historique` ;
4. la licence et les éventuelles limites commerciales avant toute intégration ;
5. la décision ou l’ADR qui l’utilise ;
6. la date de dernière vérification.

Une référence supprimée, déplacée ou devenue incompatible doit rester traçable dans l’historique du document, avec son remplacement éventuel.
