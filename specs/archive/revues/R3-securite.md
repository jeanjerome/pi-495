# R3 — Revue de sécurité

**État :** en attente — l'autorité manque
**Sortie exigée (§11) :** modèle de menace mis à jour et constats localisés
**Autorité requise :** un reviewer indépendant du producteur

## Pourquoi elle n'est pas conduite ici

Une revue de sécurité conduite par l'auteur du code hérite des angles morts de l'auteur. Ce n'est
pas une règle de forme : le sujet de la revue est précisément ce que le producteur n'a pas prévu, et
la personne qui a écrit le confinement est la moins bien placée pour imaginer ce qu'elle n'a pas
imaginé. §11 demande un mandat, des critères, des preuves et un format de constat — tout cela est
réuni ci-dessous — mais l'autorité qui donne sa valeur au constat est l'indépendance, et elle ne
peut pas être fabriquée par le dossier.

Le dossier est prêt. La revue ne l'est pas.

## Périmètre exact

- Les profils d'exécution et leurs permissions effectives : `src/adapters/sandbox/`, les sept
  profils de `conception-technique.md` §6.3, les chemins interdits en lecture calculés par
  `src/extension/runtime.ts`.
- Le confinement des voies d'action : fichiers, sous-processus, réseau, liens symboliques, outils,
  extensions, enfants.
- La protection du référentiel de décision : G4 (chemins protégés), le mandat compilé remis au
  runner, l'inaccessibilité du stockage 495 depuis le worker.
- Les secrets : expurgation à l'export, `auth.json` de Pi interdit en lecture, absence de secret
  dans le contexte remis à un modèle.
- La chaîne d'approvisionnement : dépendances, pairs, arbre de construction, identité de livraison.
- Les frontières de confiance de `conception-technique.md` §6 dans leur ensemble.

Hors périmètre : la sécurité des cibles que 495 analyse. 495 ne prétend rien sur le code qu'il
vérifie ; il prétend sur ce qu'il exécute.

## Critères examinés

| Réf | Critère | Exigence amont |
| --- | --- | --- |
| R3-C01 | Le moindre privilège est appliqué : chaque rôle reçoit le profil de §6.3 et rien de plus. | `SEC-01` |
| R3-C02 | Toutes les voies d'action sont confinées par une frontière effective, pas par interception. | `SEC-02` |
| R3-C03 | Le référentiel de décision — politiques, protocoles gelés, preuves, décisions — est inatteignable en écriture par une intervention productrice. | `SEC-03`, `AT-04` |
| R3-C04 | Les effets externes sont bornés, idempotents, et aucun effet incertain n'est rejoué automatiquement. | `SEC-04`, `AT-06` |
| R3-C05 | L'exposition de données est réduite : ni secret dans un contexte, ni secret dans un export. | `SEC-05` |
| R3-C06 | Une instruction malveillante dans le dépôt, une sortie d'outil ou un document n'élargit aucune permission. | `CTX-02`, `CTX-05`, `AT-03` |
| R3-C07 | La chaîne d'approvisionnement du package est connue et son identité de livraison est vérifiable. | §12 point 6 |
| R3-C08 | Les limites revendiquées de §6.5 sont exactes : ce que 495 ne protège pas est dit. | §6.5 |

## Preuves disponibles

| Preuve | Où | Ce qu'elle établit |
| --- | --- | --- |
| Profils de sandbox et leur qualification | `test/v1/sandbox` | R3-C01, R3-C02 : `unconfined` ne qualifie jamais et déclare les capacités de confinement manquantes ; `bubblewrap` n'est pas qualifié sur la machine de référence et dit pourquoi ; l'environnement est construit depuis une liste blanche, sans shell ; le runner applique le délai, tue le groupe de processus et borne la sortie. |
| Profil réseau `loopback` | `test/v1/mutation`, campagne V4 | R3-C02 : un témoin se joint à lui-même puis à un autre hôte, et n'obtient le second qu'en `EPERM`. |
| Sandbox non qualifié bloquant | `test/v2/harness` (« an unqualified sandbox blocks before any producing intervention ») | R3-C01 : aucune intervention productrice ne démarre sous un confinement non qualifié. |
| Chemins protégés et G4 | `test/v2/harness` (test protégé altéré → échec G4, trois échecs → IH-07) | R3-C03. |
| Chemins interdits en lecture | `src/extension/runtime.ts` : base, WAL, objets, exports, journaux, verrous, `config.json`, `auth.json` de Pi | R3-C03, R3-C05. |
| Instrumentation réseau complète | `test/v2/telemetry` : un changement conduit de la demande à l'export expurgé, sockets, DNS, `http`/`https` et `fetch` instrumentés, n'ouvre aucune connexion et ne résout aucun hôte ; aucune source ne porte de client réseau ni d'URL d'endpoint | R3-C02, `NFR-06`. |
| Expurgation à l'export | `src/export/export-service.ts`, `test/v2/export-integration` | R3-C05 : sentinelles de secret retirées, altération déclarée dans `redactions.json`, empreintes recalculées. |
| Contexte étiqueté | `src/application/context.ts`, `test/v2/harness` (manifestes) | R3-C06 : contenu projet étiqueté non fiable, instructions de confiance en premier, budget borné, schéma de sortie explicite. |
| `ResourceLoader` explicite du worker | `src/adapters/pi-worker/worker-main.ts`, §6.4 point 2 | R3-C06 : aucun skill, `AGENTS.md`, extension ou package du projet n'est chargé implicitement. |
| Intégration Git hors modèle | `src/adapters/git/integrator.ts`, `test/v2/export-integration` | R3-C04 : jamais un outil du modèle, jamais de push, deux temps avec reçu, destination avancée détectée. |
| Baux et idempotence | `test/v2/ledger` | R3-C04 : une opération rejouée sous la même clé s'exécute une fois ; une autre clé sur une opération active est refusée. |
| Chaîne d'approvisionnement | [R5](R5-licences-distribution.md) : 0 dépendance redistribuée, 263 packages permissifs, `dist/` reproduit les sources | R3-C07, partiellement. |
| Limites revendiquées | `conception-technique.md` §6.5 | R3-C08 : administrateur hostile hors modèle, chaînage sans signature externe, SEC-02/SEC-03 non revendicables sous un backend qui ne confine pas. |

## Format de constat

Enveloppe `Finding`, catégorie `security` pour un constat localisé dans le code, `review` pour un
constat portant sur le modèle. Voir [README.md](README.md#format-de-constat).

La sortie attendue par §11 comporte deux pièces : les constats localisés, et **le modèle de menace
mis à jour**. Il n'existe aujourd'hui aucun document de modèle de menace à mettre à jour :
`conception-technique.md` §6 en porte la matière — zones, base de confiance, profils, défenses
contre les contournements, limites revendiquées — et `expression-besoins.md` nomme les menaces à
couvrir (instruction malveillante indirecte, outil écrivant par une voie alternative, package
chargeant du code ambiant, changement concurrent, falsification de résultat par le producteur). La
production du document est donc une sortie de cette revue, pas une entrée.

## Ce que le reviewer ne peut pas conclure faute de preuve

- **Que SEC-02 et SEC-03 tiennent sur Linux.** Le backend `bubblewrap` est implémenté et n'a jamais
  été exécuté. §6.5 interdit déjà de revendiquer SEC-02 ou SEC-03 sous un profil dont le backend ne
  confine pas effectivement ; aucune preuve n'existe pour Linux x86-64.
- **Que le confinement résiste à une tentative d'évasion.** Toutes les preuves de confinement sont
  des témoins : un processus qui essaie ce qui est interdit et échoue. Aucune campagne adverse n'a
  été menée, aucun agent n'a été mandaté pour chercher une voie de sortie.
- **Que le rôle `review` en lecture seule tient face à un modèle réel.** Le mécanisme est livré et
  testé avec l'agent scripté ; il n'a jamais été exercé avec un modèle qui tenterait d'écrire.
- **Que la base de confiance est saine.** Une extension Pi tierce chargée dans le même processus
  rejoint la base de confiance ; §6.2 le déclare et 495 ne prétend pas s'en protéger. Le reviewer
  peut constater la déclaration, pas l'absence d'une telle extension chez un utilisateur.
- **Que les secrets sont couverts.** L'expurgation repose sur des sentinelles — motifs de clés, de
  jetons, de mots de passe, de clés privées. Un secret d'une forme non prévue traverse l'export.
  Aucune preuve n'existe sur le rappel de ces sentinelles.
- **Que l'archive publiée est celle qui a été revue.** Rien n'est signé (voir R5-C06).
- **Que le mode RPC est sûr.** Les chemins de code existent, aucun client RPC qualifié n'a été
  exercé, et `humanOrigin` accepte un acteur déclaré par variable d'environnement dans ce mode.

## Ce qui manque pour conduire

| Manque | Pourquoi il est bloquant | Ce qui le lèverait |
| --- | --- | --- |
| Un reviewer indépendant du producteur | L'autorité du constat vient de l'indépendance ; le dossier ne la fabrique pas. | Une personne ou une équipe n'ayant pas écrit `src/adapters/sandbox/`, `src/extension/runtime.ts` ni `src/application/context.ts`. |
| Un environnement Linux x86-64 | R3-C01, R3-C02 et R3-C08 restent indéterminés pour la moitié des plateformes annoncées. | Une machine Linux avec `bwrap`, et l'exécution de la campagne V1. |
| Un mandat adverse | Les témoins prouvent que ce qui est interdit échoue ; ils ne prouvent pas qu'il n'existe pas d'autre chemin. | Une campagne d'évasion sur les sept profils, avec un budget et un périmètre écrits d'avance. |
| Un document de modèle de menace | §11 exige de le rendre « mis à jour » ; il n'existe pas. | Sa rédaction à partir de §6 et des menaces nommées à l'amont, comme première sortie de la revue. |

## Estimation

Le dossier est complet : critères, preuves, format et limites sont réunis. L'effort restant est
celui du reviewer, plus une machine Linux pour la moitié plateforme. Aucun travail de préparation
supplémentaire n'est identifié côté dépôt.
