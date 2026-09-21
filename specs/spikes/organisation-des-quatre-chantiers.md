# Organisation de quatre chantiers proposés

**Statut : arbitré sur trois chantiers, le quatrième attend une mesure.** Les questions 1 à 4 du §7
sont tranchées et portées dans `specs/product/SCOPE_LATEST.yaml`, `specs/release-plan.yaml` et les
fichiers `specs/adr/D-46` à `D-49`. Ce qui reste à ce document est la frontière d'exécution (§4) et
la question 5, qui attend la mesure sous Apple Container. Le fichier disparaît quand elle a répondu.

Le §1 est conservé jusqu'à ce que `e23` soit joué : il porte les `fichier:ligne` du paquet Pi
**installé** (0.86.1) sur lesquels les quatre décisions s'appuient, et qu'aucune d'elles ne restitue
en entier.

Emplacement : `specs/spikes/` est retenu parce que `specs/archive/spikes/` est gelé avec le reste de
l'archive (`specs/adr/D-45…`). À déplacer si un autre emplacement est préféré.

Les quatre chantiers proposés :

1. utiliser le crédit d'un abonnement Claude Max depuis Pi ;
2. un gestionnaire de prompts centralisé, dépendant du modèle ;
3. un gestionnaire de contexte centralisé, dépendant de la phase ;
4. réexaminer le besoin réel de bac à sable et l'utilité de ce qui est implémenté.

## 1. Le crédit d'abonnement — le chemin existe déjà dans Pi

Vérifié sur le Pi **0.86.1** installé
(`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai`),
et non sur le 0.85.1 que `node_modules` du dépôt a résolu.

| Fait | Emplacement |
| --- | --- |
| `anthropicProvider()` déclare `auth.oauth` nommée « Anthropic (Claude Pro/Max) », `isSubscription: true` | `dist/providers/anthropic.js` |
| L'échange de code renvoie `{ type:"oauth", refresh, access, expires }` ; `toAuth` renvoie ce jeton tel quel | `dist/auth/oauth/anthropic.js` |
| **Aucune clé d'API n'est frappée** : `org:create_api_key` n'apparaît que dans la chaîne `SCOPES`, nulle part ailleurs dans `dist/` | grep exhaustif |
| `isOAuthToken = apiKey.includes("sk-ant-oat")` | `dist/api/anthropic-messages.js:695` |
| Si vrai : `apiKey: null`, `authToken: <jeton>` → `Authorization: Bearer`, jamais `x-api-key` ; en-têtes `user-agent: claude-cli/2.1.251` et `x-app: cli` | `:715-729` |
| Betas `claude-code-20250219` et `oauth-2025-04-20` | `:771` |
| Premier bloc système **imposé** : « You are Claude Code, Anthropic's official CLI for Claude. » ; le prompt système local passe en second | `:818-826` |
| Le catalogue connaît `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`, `claude-haiku-4-5` | `dist/providers/data/anthropic.json` |

**Conclusion : c'est le quota de l'abonnement, pas des crédits d'utilisation.** Le point qui départage
est qu'aucune clé n'est créée : les outils qui consomment des crédits se servent du scope
`org:create_api_key` pour en frapper une, celui-ci présente le jeton OAuth en Bearer avec le beta
`oauth-2025-04-20`.

**Les deux régimes coexistent sur le même fournisseur.** `anthropicApiKeyAuth()` facture des crédits,
`anthropicOAuth` consomme l'abonnement ; ce qui décide n'est pas le fournisseur choisi mais le mode
d'authentification. `resolveProviderAuth` protège dans le bon sens — un credential stocké l'emporte
sur l'ambiant, et « no silent env fallback after a failed refresh » — mais l'absence d'un
`ANTHROPIC_API_KEY` dans l'environnement d'une campagne reste à vérifier, pas à supposer.

**Les trois voies envisagées au départ sont caduques.** Passer par le CLI Claude Code, par un paquet
`pi-claude-bridge` ou par une implémentation propre revient à repontager un pont livré. 495 n'appelle
jamais un modèle (`specs/archive/MODELE-LOCAL.md`) : il reçoit `ctx.model` et `worker-main.ts:101` le
résout depuis le `models.json` de Pi, sans repli (`RM-022`).

### Ce que le harnais doit quand même porter

| Conséquence | Rattachement |
| --- | --- |
| Le fournisseur écrit un bloc système **au-dessus** des instructions de confiance, et `buildContext` ne le connaît pas : le manifeste `ctx_…` déclare « ce qui a été mis devant le modèle » et deviendrait faux | `CTX-02`, dont la clause « les contraintes imposées par un fournisseur doivent être reconnues comme extérieures à cette hiérarchie locale » n'a jamais été éprouvée faute de fournisseur qui en impose |
| L'identité annoncée sur le fil est `claude-cli/2.1.251` + `x-app: cli` | fait matériel à consigner au dossier ; l'arbitrage sur les conditions d'utilisation revient au propriétaire |
| « Le même cas de contrat passe avec deux fournisseurs qualifiés » n'est tenu que par des preuves unitaires | recette de `AGT-02` ; `specs/archive/TRACEABILITY.md:26` |
| « Refuser un profil incompatible avant une intervention **facturée** » n'a aucun effet tant que le modèle est gratuit | `AGT-01` |
| `intervention_ms` 20 min et `increment_ms` 120 min sont calibrés sur 2,5 appels d'outil par minute ; avec un modèle frontière la borne n'est plus le temps mais la fenêtre d'abonnement | `src/domain/policy.ts:47` |
| Les extraits et les invites quittent la machine ; la campagne `NFR-06` mesure l'absence de télémétrie **produit**, pas le canal modèle | `SEC-05`, `NFR-06` |
| Le bac à sable ne bouge pas : le worker est déjà exempté de confinement réseau pour joindre le fournisseur | `specs/adr/D-11…` |

**C'est aussi un instrument de mesure.** Les trois campagnes qui fondent `specs/archive/chantiers/K…`
ont tourné avec un modèle local qui rend deux fois sur trois un rapport que le schéma
`specification-report` refuse. Tant qu'il est le seul témoin, une instruction mauvaise ne se
distingue pas d'un modèle incapable.

## 2 et 3. Prompts et contexte sont un seul module, et le travail est déjà ouvert

`src/application/context.ts` (`CMP-CTX`) est déjà le constructeur centralisé des deux : « Everything an
intervention is handed is composed here and nowhere else ». Déjà par rôle, déjà avec manifeste
empreinté, budget d'entrée compté et schéma de sortie.

Le travail ouvert dessus existe : **`e04`**, adossé à `specs/archive/chantiers/K-clarte-des-prompts-et-skills-du-harnais.md`,
qui a déjà instruit l'antériorité (`superpowers`, `bigpowers`), déjà arbitré la voie de chargement —
495 lit ses propres fichiers de skill par un chemin qu'il contrôle, jamais le `ResourceLoader` de Pi,
parce qu'une ressource chargée par l'hôte n'apparaît dans aucun manifeste — et déjà borné la taille à
cinq à huit unités nommées par rôle.

Deux axes neufs, que K ne couvre pas, et qui sont des axes et non des composants :

- **dépendance au modèle** : des variantes d'instruction indexées sur les capacités déclarées
  (`AGT-01`), jamais sur un nom de modèle. Sans objet avant d'avoir deux fournisseurs qualifiés.
- **dépendance à la phase** : `CTX-01` demande « rôle **et** phase » ; `buildContext` ne reçoit que le
  rôle et un objectif interpolé dans `harness.ts`. S'y rattachent le budget d'entrée de 60 000 octets
  et `CTX-04`, dont la question change avec une fenêtre de contexte d'un ordre supérieur.

Les découper en deux epics ferait deux plans qui éditent la même fonction. `CTX-03` (`[P1]`, au-delà
de P0) remonte avec eux : c'est lui qui nomme « skills, modèles de prompts et références documentaires
comme ressources versionnées ».

## 4. La frontière d'exécution — la prémisse de départ est fausse

**Pi n'implémente pas de bac à sable.** `docs/security.md` du paquet : « No Built-in Sandbox », et
c'est délibéré — « real isolation needs to come from the operating system or a virtualization /
container boundary ». Ce que Pi livre sont deux exemples :

| Exemple | Ce que c'est |
| --- | --- |
| `examples/extensions/sandbox` | `@anthropic-ai/sandbox-runtime` — `sandbox-exec` sur macOS, `bubblewrap` sur Linux : les deux mécanismes que `src/adapters/sandbox/backends.ts` écrit à la main (`D-04`), plus une politique réseau **par domaine** que le tri-état `denied / loopback / allowed` de `ports/execution.ts:27` n'a pas |
| `examples/extensions/gondolin` | micro-VM Linux (QEMU), avec `read`/`write`/`edit`/`bash`/`grep`/`find`/`ls` routés dedans |

La question n'est donc pas de savoir si le bac à sable reste nécessaire — `SEC-01` et `SEC-02` sont
`[P0]` et le refus `capability_missing` en dépend — mais **quel adaptateur se tient derrière
`SandboxPort`**. Trois réponses, chacune avec un coût énonçable :

1. garder les backends écrits à la main : le paquet n'a aujourd'hui **aucune dépendance d'exécution**,
   et `scripts/check-distribution.ts` le tient ;
2. placer `@anthropic-ai/sandbox-runtime` derrière `SandboxPort` : environ 390 lignes de génération de
   profil en moins et une implémentation maintenue sur les deux plateformes, contre la première
   dépendance d'exécution du paquet, son attribution au `NOTICE`, et une requalification de tous les
   profils ;
3. ajouter Gondolin en troisième backend, pour les cas qui demandent une frontière de noyau.

**Ce qui peut décider.** `NFR-05` est `[P0]` **non satisfaite** et classée hors périmètre au motif
qu'aucun environnement ne permet de qualifier `bwrap` — Docker ne le peut pas, c'est mesuré
(profil seccomp par défaut ; `--privileged` détruit la frontière que la campagne mesurerait). Un
environnement Linux qui laisse créer un espace de noms utilisateur rouvrirait la seule exigence `[P0]`
aujourd'hui déclarée infermable.

**Première mesure à conduire : Apple Container**, pas Docker. `/usr/local/bin/container` 1.4.1 est
installé, apiserver arrêté (`container system start` préalable, ce qui enregistre un service launchd).
Chaque conteneur y reçoit un VM Linux léger avec son propre noyau, au lieu d'un VM partagé sous le
profil seccomp de Docker : les raisons du refus constaté sous Docker ne s'y transposent pas
mécaniquement. **C'est une hypothèse à mesurer, pas un acquis** — `container system start`, une image
Debian, `bwrap --unshare-user --unshare-net true`, et le point est tranché.

**Contrainte d'ordonnancement.** Toucher au bac à sable change `environment_digest` : ne pas l'engager
pendant qu'une campagne tourne.

## 5. Organisation proposée — adoptée

| Chantier | Devient |
| --- | --- |
| 1 — crédit d'abonnement | **`e23`, nouvel epic, petit**, joué avant `e01` : non parce qu'il prime en gravité, mais parce qu'il coûte peu et change la preuve sous la campagne de `e01` elle-même. WSJF `(8+7+9)/2 = 12,0`, au-dessus de tout l'index actuel. Livrables : recette `AGT-02` tenue sur deux fournisseurs, clause « intervention facturée » d'`AGT-01` dotée d'effet, budgets remesurés, sortie de données déclarée (`SEC-05`), et **le bloc système du fournisseur porté au manifeste ou le profil refusé** (`CTX-02`) |
| 2 et 3 — prompts et contexte | **`e04` élargi**, position dans l'index inchangée (la ROADMAP le tient pour la cause de `e03`), avec les deux axes nommés ci-dessus et `CTX-03` remonté avec lui |
| 4 — bac à sable | **spike puis décision**, sans rang dans l'index tant que la mesure n'a pas répondu, et hors campagne |

Ordre résultant : `e23`, puis `e01`, `e02`, `e03`, `e04` élargi, la suite inchangée ; le spike en
parallèle.

## 6. Corrections dues indépendamment de l'arbitrage

Les deux sont faites.

- ~~`specs/product/SCOPE_LATEST.yaml` porte « Pi 0.85.1 » dans ses contraintes~~ — corrigé en
  **0.86.1**, la version que la machine exécute.
- ~~`node_modules` du dépôt a résolu `@earendil-works/pi-coding-agent` et `pi-ai` en **0.85.1**~~ —
  les trois bornes `devDependencies` sont montées à `^0.86.1` et résolvent 0.86.1. Les tests et les
  campagnes s'exécutent désormais contre la même version.
- Ce n'est pas cosmétique : `pi_version` alimente `describeEnvironment` (`src/extension/runtime.ts:82`)
  donc `environment_digest`. Le passage en 0.86.1 a **déjà** invalidé le protocole gelé de tout
  changement en vol, avec `environment_changed`.

## 7. Questions — quatre tranchées, une ouverte

| Question | Réponse | Décision |
| --- | --- | --- |
| 1. `e23` adopté, et placé avant `e01` ? | Oui, en tête de l'index, WSJF 12,0 | `D-46` |
| 2. `e04` absorbe les deux axes, ou deux epics ? | `e04` élargi, `CTX-03` remonte avec lui, aucun `CMP-*` nouveau | `D-47` |
| 3. Bloc système imposé : manifeste, ou profil refusé ? | Déclaré au manifeste comme contrainte extérieure | `D-48` |
| 4. Identité `claude-cli` acceptée, sous quelle mention ? | Acceptée pour la machine de référence seule, restriction portée au périmètre | `D-49` |
| 5. Quel adaptateur derrière `SandboxPort` ? | **Ouverte** — attend la mesure du §4 | — |

La question 5 ne se tranche pas sans la mesure : `container system start`, une image Debian sous
Apple Container, `bwrap --unshare-user --unshare-net true`. Hors campagne, puisqu'un changement de
bac à sable change `environment_digest`.
