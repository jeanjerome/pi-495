# R2 — Revue d'architecture

**État :** conduite le 17 septembre 2026 sur `bd7c5be5`
**Sortie exigée (§11) :** graphe observé, écarts et risques résiduels
**Autorité :** ingénierie. Aucune autorité extérieure n'est requise : le sujet est le dépôt, et tout
ce qui est examiné est lisible dans le code et dans l'amont.

## Périmètre exact

`src/` en totalité (67 modules, 10 639 lignes), `contracts/v1/` (28 schémas JSON), `scripts/` et les
documents normatifs qui déclarent l'architecture : `amont/conception-technique.md` §2 (invariants
`AT-01` à `AT-12`, sens des dépendances), §4 (catalogue `CMP-*`), §8 (contrats versionnés).

Hors périmètre : la sécurité des frontières de confiance, qui est le sujet de [R3](R3-securite.md) —
R2 examine l'existence et le sens des frontières, R3 leur résistance. Hors périmètre également : les
cibles que 495 analyse, dont l'architecture est le sujet du contrôle `structure` du protocole gelé,
pas d'une revue.

## Critères examinés

| Réf | Critère | Exigence amont |
| --- | --- | --- |
| R2-C01 | Le sens des dépendances entre couches est celui de §2.2 : rien de `domain/`, `contracts/`, `ports/`, `application/` n'atteint Pi, le TUI, Git ou SQLite. | `AT-02`, `ARC-01` |
| R2-C02 | Aucun cycle d'import entre modules. | `ARC-01`, `CON-03` |
| R2-C03 | Chaque composant du catalogue §4.1 est réalisé par un module identifiable, et chaque module revendique un composant déclaré. | `ARC-01` |
| R2-C04 | Le noyau est testable sans I/O : pas d'horloge, de système de fichiers ni de modèle dans le réducteur. | `AT-02`, `VER-01` |
| R2-C05 | Les contrats persistés et interprocessus sont versionnés, validés à l'exécution, et leur forme publiée correspond à leur définition. | `AT-11`, `CON-03` |
| R2-C06 | Le schéma de stockage porte une version et une politique de migration, et refuse ce qu'il ne sait pas lire. | `NFR-08` |
| R2-C07 | Aucun verdict normatif n'est calculé hors du noyau. | `AT-01` |

## Preuves disponibles

| Preuve | Où | Ce qu'elle établit |
| --- | --- | --- |
| `scripts/check-layers.ts`, branché sur `npm run check` | sortie : `layer rules satisfied` | R2-C01, par interdiction d'import par couche. |
| `scripts/check-architecture.ts`, branché sur `npm run check` | sortie : `16 declared components, all claimed; 67 modules, no import cycle` | R2-C02, R2-C03. |
| Catalogue §4.1 et en-têtes des modules | `specs/archive/amont/conception-technique.md`, `src/**/*.ts` | R2-C03, correspondance déclaré ↔ réalisé. |
| `src/domain/change/decide.ts` et sa suite | `test/v0/change-rules`, `test/v0/properties` | R2-C04 : le réducteur est appelé avec des faits, sans I/O. |
| `src/contracts/validate.ts`, `src/contracts/registry.ts`, `contracts/v1/*.json` | `test/v0/contracts` | R2-C05 : validation à l'exécution, schémas publiés. |
| `src/adapters/storage-sqlite/schema.ts`, `ledger.ts` | `test/v2/ledger` (« refuses a database whose schema is newer ») | R2-C06. |
| `src/application/harness.ts` | `test/v2/harness` | R2-C07 : le contrôleur commet ce que le réducteur a décidé. |

## Format de constat

Enveloppe `Finding`, catégorie `review`, `rule_id` = référence du critère. Voir
[README.md](README.md#format-de-constat).

## Ce que le reviewer ne peut pas conclure faute de preuve

- **Que les frontières tiennent à l'exécution.** `check-layers` et `check-architecture` lisent des
  lignes d'`import`. Une frontière franchie par réflexion, par injection de dépendance résolue au
  runtime ou par configuration n'est pas vue. Le même angle mort est déclaré pour le contrôle
  `structure` appliqué aux cibles.
- **Que l'architecture est adaptée à ce qui reste à construire.** Aucune preuve dans le dépôt ne
  porte sur l'évolutivité ; un jugement sur ce point serait une opinion, pas un constat.
- **Que la migration de schéma fonctionne.** `SCHEMA_VERSION` vaut 1 : il n'existe aucune version
  antérieure, donc aucune migration n'a jamais été exécutée. Le refus d'un schéma plus récent est
  prouvé ; la migration d'un schéma plus ancien ne l'est pas et ne peut pas l'être aujourd'hui.
- **Que le graphe observé est complet.** Il est reconstruit depuis les imports statiques de `src/`.
  Les dépendances traversant le protocole JSONL du worker, le processus sandbox ou SQLite ne sont
  pas des arêtes de ce graphe.

## Constats

### R2-C01 — sens des dépendances : **conforme**

`check-layers.ts` applique sept règles d'interdiction, une par couche, et ne relève aucune
violation sur 67 modules. `domain/` n'importe ni `node:fs`, ni `node:child_process`, ni `node:net`,
ni `node:sqlite`, ni `@earendil-works/*`. Le graphe observé correspond à celui de §2.2.

### R2-C02 — cycles : **conforme**

Aucun cycle d'import entre les 67 modules. Le constat était jusqu'ici invérifiable : le contrôle qui
le tient est ajouté par cette revue (`check-architecture.ts`), de sorte qu'un cycle introduit plus
tard fasse échouer `npm run check` au lieu d'attendre la revue suivante.

### R2-C03 — architecture déclarée contre architecture réalisée : **constat**, bloquant clos, résiduel ouvert

À l'ouverture de la revue, huit des seize composants du catalogue §4.1 n'étaient revendiqués par
aucun module : `CMP-DOM`, `CMP-PRG`, `CMP-SBX`, `CMP-WSP`, `CMP-CAN`, `CMP-VER`, `CMP-EVD`,
`CMP-HUM`. Leur réalisation existait, mais rien dans le dépôt ne permettait de la lire : le
rattachement d'un module à la responsabilité que le catalogue lui assigne n'était nulle part.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| Huit composants déclarés sans module revendicateur : la correspondance déclaré ↔ réalisé n'est pas lisible. | `blocker` | **Clos.** Les huit modules portent désormais l'identifiant du composant qu'ils réalisent, et `check-architecture.ts` refuse un composant déclaré que plus aucun module ne revendique, ainsi qu'un identifiant revendiqué que le catalogue ne déclare pas. |
| `src/application/harness.ts` (1 119 lignes) porte à lui seul `CMP-APP` et `CMP-VER`, que le catalogue déclare comme deux composants de responsabilités distinctes — orchestration des cas d'usage d'un côté, coordination de la vérification de l'autre. | `major` | **Ouvert, travail identifié.** Le contrôle nomme la fusion à chaque exécution (`divergence: src/application/harness.ts carries CMP-APP, CMP-VER`) sans la refuser : le catalogue sépare des responsabilités que le code peut légitimement tenir dans un fichier, et l'imposer serait une convention de style, pas une déclaration de la cible. Rattaché à ARC-01, `chantiers/03`. |

La seconde ligne est exactement ce qu'ARC-01 demande de pouvoir lire — l'écart entre l'architecture
déclarée et l'architecture réalisée — appliqué à 495 lui-même. Elle ne bloque pas : aucune règle
gelée n'est franchie, et la responsabilité fusionnée est nommée.

### R2-C04 — testabilité du noyau : **conforme**

`decide(current_state, command, validated_facts, active_policy)` ne lit ni l'heure, ni le système de
fichiers, ni un modèle : horloge, identifiants, empreintes et observations lui sont fournis comme
faits. C'est ce qui rend les propriétés générées de `test/v0/properties` exécutables sans
environnement. L'interdiction est tenue mécaniquement par `check-layers` (`node:fs`,
`node:child_process`, `node:net`, `node:sqlite` interdits sous `domain/`).

### R2-C05 — contrats versionnés : **constat**, clos

Les contrats sont définis en TypeBox sous `src/contracts/v1/`, validés à l'exécution par
`validate.ts` (les types TypeScript seuls ne font pas foi, `AT-11`), et publiés en JSON Schema sous
`contracts/v1/` par `npm run contracts`. Chaque schéma porte un `$id` de la forme
`urn:495:contract:<nom>:1`.

| Constat | Sévérité | Statut |
| --- | --- | --- |
| `contracts/v1/*.json` est produit par un script à lancer à la main, et le package l'expédie (`package.json#files`). Rien ne vérifiait que les schémas publiés correspondent encore aux contrats sources : une divergence aurait livré à un lecteur tiers la description d'un protocole que 495 ne parle plus. | `major` | **Clos.** `check-distribution.ts` régénère les schémas depuis `src/contracts/registry.ts` et refuse toute différence, ainsi qu'un fichier expédié qu'aucun contrat source ne produit. |

### R2-C06 — versionnement et migration du stockage : **constat**, ouvert

La table `schema_migrations` enregistre la version appliquée et l'empreinte du SQL ; une base dont la
version dépasse celle du binaire est refusée avec `CONFIGURATION_ERROR` au lieu d'être mutée
(`test/v2/ledger`, NFR-08).

| Constat | Sévérité | Statut |
| --- | --- | --- |
| `SCHEMA_VERSION` vaut 1 et aucune migration n'existe. Le mécanisme de montée de version n'a donc aucun témoin : la première migration écrite sera aussi la première exécutée, sur des bases contenant des changements réels. | `minor` | **Ouvert, travail identifié.** Rattaché à la clôture du jalon L0, `chantiers/C`. Ce constat n'est pas convertible en contrôle aujourd'hui : on ne qualifie pas une migration qui n'existe pas. |

### R2-C07 — autorité du noyau : **conforme**

`harness.ts` déclare et applique qu'il ne calcule aucun verdict : toute transition normative passe
par le réducteur du domaine et est ajoutée au journal en une transaction. Les gates G2, G4 et G5 sont
sous `domain/gates/`. Les adaptateurs produisent des observations, jamais des décisions ; le contrat
`EvidenceCandidate` est la frontière entre les deux.

## Risques résiduels

1. **Une frontière franchie dynamiquement n'est pas vue.** Les deux contrôles lisent le texte des
   imports. C'est le même angle mort que celui déclaré pour les cibles, et il est assumé au même
   titre : ni compilation, ni résolution de types, ni exécution.
2. **La fusion `CMP-APP`/`CMP-VER` concentre la coordination.** Elle est nommée à chaque exécution du
   contrôle, ce qui empêche qu'elle s'étende sans être vue, mais elle reste un point de
   concentration de 1 119 lignes dans un composant de confiance maximale.
3. **La première migration de schéma sera écrite sans témoin préalable.** Le refus d'une base plus
   récente protège contre la corruption ; il ne protège pas contre une migration fausse.
