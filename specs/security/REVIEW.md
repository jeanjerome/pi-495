# Revue de sécurité — e23s01, sortie de données déclarée

| | |
|---|---|
| Périmètre | `git diff $(git merge-base main HEAD)..HEAD` |
| Conduite le | 2026-09-21, revue après la ronde de relecture croisée |
| Branche | `sortie-vers-le-fournisseur-declaree` |
| Risque de la story | P0 |
| Code de production touché | `src/domain/policy.ts`, `src/application/intervention.ts`, `src/extension/config.ts` (le lecteur de la déclaration) |

## Verdict

**Aucun constat à confiance ≥ 8/10. Le gate n'est pas bloqué.**

Le changement **ajoute** un contrôle plutôt que d'en affaiblir un : une liste blanche de
destinations opposée avant qu'une intervention démarre, ce qui va dans le sens d'une atténuation
de `CWE-918` (requête sortante vers une destination non prévue) sur le seul canal réseau que le
harnais ouvre.

## Hypothèses vérifiées, non supposées

**Médiation complète.** `requireCapable()` est appelé en première instruction de
`Harness.runIntervention` (`src/application/harness.ts:461`), et `InterventionSupervisor.run()`
est appelé plus bas dans la **même** méthode privée (`:526`). C'est aujourd'hui le seul appelant
de `run()` dans tout `src/`. Aucun chemin n'atteint un worker sans passer la porte.

**Le message de refus n'atteint aucun modèle.** `buildFeedback` compose son texte depuis les
verdicts de gate, leurs motifs et les constats de preuve — jamais depuis `DomainError.message`. Et
le refus est levé avant qu'une session existe : il n'y a rien à qui le transmettre.

**Le helper de test n'est jamais distribué.** `test/helpers/fake-worker.ts` a gagné un objectif
`echo-env` qui renvoie son `process.env` sur stdout. `dist/` est bâti depuis `src/` seul et le
champ `files` du paquet vaut `["dist","contracts","README.md","LICENSE","NOTICE"]` : `test/` ne
quitte jamais le dépôt.

## Sens de la défaillance : fermé

| Entrée | Effet |
| --- | --- |
| Fournisseur absent de la liste | refusé (`POLICY_DENIED`) |
| Liste déclarée vide | refusé, et le message nomme la liste vide |
| `provider_id` vide, faute de modèle configuré | non jugé ici — la vérification de capacité le refuse sous son propre motif |
| Comparaison | égalité de chaîne exacte — ni motif, ni préfixe, ni joker ; ne peut pas sur-apparier |

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Profondeur de la médiation — refermée.** Cette revue notait que le contrôle ne vivait que dans
`requireCapable()`, méthode sœur, et qu'un chemin futur appelant `run()` directement le
contournerait. `run()` appelle désormais le refus en première instruction, et un test l'épingle.
La note de robustesse transmise à `e23s03` n'a plus d'objet : ce qui reste est que la seconde
vérification ne peut plus garder le journal propre — l'intervention y est déjà inscrite — elle ne
peut qu'arrêter le worker. Le dernier point avant que les octets partent reste l'adaptateur, qui ne
reçoit aucune politique.

**Confiance accordée à `config.json` — refermée depuis la première passe.** Cette revue notait que
`loadConfig` ne validait la forme d'aucun champ de la politique, `egress` compris, et qu'une valeur
malformée levait une `TypeError` au démarrage d'une intervention. `readEgress` valide désormais la
liste, nomme l'entrée fautive dans un diagnostic, et **ne déclare plus rien** en cas de défaut —
plutôt que de revenir au défaut, ce qui aurait réadmis en silence une destination que le
propriétaire venait de retirer. Le fichier reste hors d'atteinte d'un projet cible, dans les chemins
refusés en lecture du bac à sable.

**Ce qu'un refus laisse au dossier.** Un refus de destination inscrit un blocage au journal, de
motif `policy_denied`, dont le détail nomme les destinations déclarées ; le flux d'événements part
au dossier exporté. Les noms des fournisseurs que l'installation a le droit de joindre voyagent donc
avec un dossier remis à un tiers. Ce sont des noms de politique et non des secrets — aucune
sentinelle, aucun jeton, aucun chemin de travail n'y figure — mais le fait est consigné ici et au
§12 de la story plutôt que laissé à découvrir.

**Motifs d'expurgation fournis par l'appelant.** `exportChange` accepte `options.secret_patterns`.
Un appelant fournissant un motif à groupe de capture pourrait contourner la garde structurelle de
la tâche 4. Aucun appelant existant ne le fait ; consigné dans la preuve de cette tâche.

---

# Revue de sécurité — e23s02, strate imposée déclarée au manifeste

| | |
|---|---|
| Périmètre | `git diff $(git merge-base main HEAD)..HEAD` |
| Conduite le | 2026-09-21 (UTC), après la dernière tâche verte |
| Branche | `strate-imposee-au-manifeste` |
| Risque de la story | P0 |
| Code de production touché | `src/domain/imposed-layers.ts` (nouveau), `src/ports/execution.ts` (type seul), `src/application/context.ts`, `src/application/harness.ts` |
| Contrôles ajoutés | `scripts/check-provider-system-block.ts`, `scripts/check-capsule.ts` (hors production, lus par Preflight) |

## Verdict

**Aucun constat à confiance ≥ 8/10. Le gate n'est pas bloqué.**

Le changement n'ouvre aucun canal et n'élargit aucune permission : il **nomme** une contrainte qui
existait déjà et que 495 subissait sans la dire. La surface d'attaque ne bouge pas ; ce qui bouge
est ce qu'un dossier affirme.

## Hypothèses vérifiées, non supposées

**Rien de plus n'est émis vers le fournisseur.** Le manifeste voyage bien jusqu'au worker — le
mandat entier est sérialisé dans le message `{ type: "mandate", mandate, config }`
(`src/adapters/pi-worker/supervisor.ts:153`), `context` compris, donc `imposed_layers` compris.
Il s'arrête là : **aucun fichier de `src/adapters/pi-worker/` ne lit `mandate.context`**. Ce que le
worker remet au modèle est `m.system_prompt` par `getSystemPrompt` (`worker-main.ts:296`) et
`m.prompt` par `session.prompt` (`:356`), rien d'autre. Vérifié par recherche sur l'adaptateur
entier, pas déduit de la forme du type.

**La strate ne rejoint pas les instructions composées.** Le module bâti a été interrogé
directement : pour `anthropic`, le texte imposé n'apparaît ni dans `trusted_instructions`, ni dans
`system_prompt`, ni dans `prompt`, ni dans l'enregistrement adressé par empreinte. Pour `omlx`, le
champ est présent et vide. La mesure porte sur `dist/`, donc sur ce qu'une installation exécute.

**Le contrôle ne lit aucun secret.** `check-provider-system-block.ts` ne lit que les `.js`
distribués du paquet épinglé. Il n'ouvre ni `auth.json`, ni `models.json`, ni aucun fichier de la
configuration Pi, et ne compose aucune requête. Le texte qu'il imprime est du code public
redistribué dans le paquet.

## Sens de la défaillance : fermé

| Entrée | Effet |
| --- | --- |
| Fournisseur inconnu, ou identifiant vide | liste vide — rien n'est affirmé sur lui |
| Bloc absent du paquet épinglé | refus (le moyen de vérifier est perdu, ce n'est pas une preuve d'innocuité) |
| Plus d'une occurrence | refus (aucune n'est élue par défaut) |
| Texte différent du déclaré | refus, les deux textes nommés |
| Comparaison | égalité de chaîne exacte — ni motif, ni préfixe, ni joker |

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Sur-déclaration assumée.** La condition écrite — le chemin d'abonnement — n'est pas observable
par 495, qui ne connaît que l'identifiant de fournisseur. La strate est donc déclarée dès que
`anthropic` est retenu, même si ce fournisseur était joint par clé d'API, auquel cas le paquet
n'impose rien. L'erreur est prise dans le sens prudent : le manifeste nomme une contrainte de trop
plutôt que d'en taire une. Portée au §19 de la story comme question ouverte.

**Texte du paquet réimprimé dans un message de refus.** Le contrôle déséchappe la chaîne relevée
(`\\(.) → $1`) avant de la comparer et de l'imprimer. Un paquet hostile pourrait y loger des
séquences d'échappement de terminal. Le contenu vient d'une dépendance déjà exécutée par le
harnais, dont le pouvoir dépasse de loin la coloration d'un message ; consigné pour mémoire, non
traité.

---

# Revue de sécurité — e23s02, seconde passe après réécriture des contrôles

| | |
|---|---|
| Périmètre | arbre de travail contre `git merge-base main HEAD` (6807368), 31 fichiers |
| Conduite le | 2026-09-22, après la ronde de relecture 2 et la montée de Pi en 0.87.0 |
| Branche | `strate-imposee-au-manifeste` |
| Risque de la story | P0 |
| Code touché depuis la première revue | `scripts/check-provider-system-block.ts` (réécrit), `scripts/check-capsule.ts` (réécrit), `scripts/e2e-local-model.ts`, `src/application/context.ts`, `src/ports/execution.ts` |

## Verdict

Aucun constat à confiance ≥ 8. La porte passe.

La première revue portait sur un contrôle qui lisait un paquet minifié. Celui-ci lit un module en
clair, construit une expression à partir d'un identifiant relevé dans du code tiers, et prend sa
racine sur la ligne de commande. Ces trois changements ouvrent des surfaces qui n'existaient pas, et
chacune a été tracée de l'entrée au puits.

## Hypothèses vérifiées, non supposées

**Aucune injection d'expression régulière.** Quatre expressions sont construites dynamiquement. Les
trois de `check-capsule.ts` interpolent soit un nom de section, littéral de code aux neuf sites
d'appel — `stories`, `tasks`, `development_status`, `phases`, `spec`, `status`, `story_id`,
`verified_at` —, soit un identifiant de story déjà contraint par `/^e\d+s\d+$/` avant d'atteindre
l'interpolation. Celle de `check-provider-system-block.ts` interpole un identifiant relevé par
`\w+`, qui ne peut donc porter aucun caractère qu'un moteur lirait comme syntaxe.

**Retour arrière : corrigé le 2026-09-22.** La mesure écrite ici le 22 au matin — « les deux
expressions rendent en 0 ms » — portait sur la mauvaise forme d'entrée : un préfixe suivi de N
accolades, qui est bien linéaire. Sur la forme qui compte, des préfixes `if (x) { params.system = [`
répétés et jamais conclus, l'expression du bloc imposé est **quadratique** : 0,9 ms à 13 Ko, 3,1 ms à
26 Ko, 12,6 ms à 53 Ko, 50,4 ms à 105 Ko. Le fichier lu fait 105 Ko et le contrôle ne tourne pas en
service, donc rien n'est exploitable — mais le chiffre publié n'était pas ce que l'expression fait.
L'alternance `(?:[^"\\]|\\.)*` de la lecture des textes, elle, a bien ses branches disjointes et
reste linéaire.

**`JSON.parse` sur du texte tiers ne déserialise pas d'objet.** L'appel lit un littéral de chaîne
JSON et rend une chaîne ; aucune forme d'objet n'est construite, donc aucune surface de pollution de
prototype. L'appel est gardé : un échappement que JSON ne décode pas fait refuser le contrôle avec
une phrase, au lieu de mourir en trace d'appel comme auparavant.

**Les deux contrôles sont en lecture seule.** Aucune écriture de fichier, aucune création ou
suppression de répertoire. Aucun n'ouvre `auth.json`, `models.json` ni quoi que ce soit sous la
configuration Pi du propriétaire.

**Aucune exécution ni aucun réseau n'entre par ce changement.** Le diff de production ne porte ni
`exec`, ni `spawn`, ni `fetch`, ni `eval`. Le seul `spawnSync` du diff est dans un fichier de test,
et lance l'exécutable Node courant sur un chemin de script et un répertoire temporaire.

**La borne du fournisseur inconnu tient toujours.** `provider_id` vient de la configuration Pi du
propriétaire, donc de l'extérieur, et `imposedLayersFor` le garde par `Object.hasOwn`. Le même
chemin est désormais emprunté par `scripts/e2e-local-model.ts`, qui prend le fournisseur sur la
ligne de commande : la garde le couvre sans changement.

## Sens de la défaillance : fermé

Table révisée le 2026-09-22 : deux de ses lignes sur-affirmaient. « Part imposée supplémentaire »
ne valait que pour un littéral entre guillemets, et « condition différente » ne valait pas pour un
prédicat élargi. Le contrôle a été réécrit pour classer tout ce qu'il lit, et la table dit ce qu'il
fait désormais.

| Entrée | Effet |
| --- | --- |
| Aucune copie du module dans l'arbre | refus (le moyen de vérifier est perdu) |
| Copies présentes mais en désaccord | refus, aucune n'est élue |
| Plus d'un bloc imposé dans le module | refus — le fournisseur écrit à plusieurs endroits (§14) |
| Texte imposé différent du déclaré | refus, les deux textes nommés |
| Part imposée supplémentaire, littérale | refus, la part en trop est nommée |
| Élément du tableau qui n'est pas une part lisible | refus — il ne contribue plus « rien » |
| Prédicat élargi, neutralisé, ou d'une autre forme | refus — seule une unique vérification d'appartenance est lue |
| Garde sans prédicat de ce nom | refus |
| Condition du paquet différente de la déclarée | refus, les deux jetons nommés |
| Déclaration ne nommant aucun jeton | refus — une condition invérifiable ne doit pas passer |
| Échappement indécodable dans le texte relevé | refus en toutes lettres |

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Racine prise sur la ligne de commande.** Les deux contrôles acceptent un chemin en argument et
lisent dessous. C'est un contrôle de développement que l'opérateur lance lui-même : aucune frontière
de privilège n'est franchie, et la lecture ne sort pas de l'arbre qu'on lui désigne. C'est ce qui
les rend testables, ce qu'ils n'étaient pas.

**Texte tiers réimprimé dans un message de refus.** Inchangé depuis la première revue, et toujours
vrai : le contrôle imprime par `JSON.stringify`, qui échappe les caractères de contrôle, séquence
d'échappement de terminal comprise. Un paquet hostile ne peut donc pas colorer un message.

**La condition déclarée passe à un caractère du filtre de rédaction de l'export.**
`/sk-[A-Za-z0-9_-]{8,}/` réclame huit caractères après `sk-` ; la condition en porte sept. Rien ne
fuit et rien n'est rédigé aujourd'hui, mais écrire le préfixe une lettre plus loin ferait rédiger la
condition à la sortie, et le dossier affirmerait alors une condition que personne n'a déclarée. La
contrainte est écrite dans la docstring de `ImposedLayer`, là où la décision se prend.

# Revue de sécurité — e25s01, fournisseur du modèle choisi admis sans configuration

| | |
|---|---|
| Périmètre | `git diff 1e7fd3e..5e56368`, 35 fichiers, dont 9 de production et un script |
| Conduite le | 2026-09-23 |
| Branche | `le-modele-choisi-est-admis` |
| Risque de la story | P0 |
| Code de production touché | `src/domain/policy.ts`, `src/extension/config.ts`, `src/application/intervention.ts`, `src/application/harness.ts`, `src/extension/session.ts`, et `command.ts`, `conduct.ts`, `tool.ts`, `runtime.ts` (lecture du runtime, un commentaire) |

## Verdict

Aucun constat à confiance ≥ 8. La porte passe.

Le changement retire du code : aucune entrée nouvelle n'est lue, aucun puits nouveau n'est atteint.
Le seul contrôle retiré est celui que la story retire, et il est nommé plus bas. Un contrôle est
ajouté : un fichier de configuration illisible arrête tout changement.

## Hypothèses vérifiées, non supposées

**Plus aucun lecteur de la liste.** `grep -rnw egress src/` ne rend que la clé lue pour être
annoncée dans `config.ts` (sans `-w`, le mot « non-regression » de `src/application/preparation.ts`
répond aussi). Le type `EgressLocation` est retiré lui aussi, faute de lecteur. Aucune
production ne lit `policy.egress`, et l'action suivante `declare_egress_destination` n'a plus
d'émetteur ni de consommateur.

**La clé ignorée ne reste pas dans la politique active.** `config.ts` la retire par
déstructuration avant l'étalement de `policy`. Une politique chargée d'un fichier qui la porte n'a
donc aucun champ `egress`, ce que `test/v1/model-admitted.test.ts` vérifie.

**Le diagnostic ne reproduit rien du fichier.** C'est une chaîne constante. Il emprunte le chemin
existant (`session.ts`, `openedAt`) : l'affichage, puis les entrées structurées au premier `/495`.
Hors du mode texte, ce chemin est `pi.sendMessage`, que Pi convertit en message utilisateur du
contexte du modèle (`convertToLlm`, `dist/core/messages.js`) : un diagnostic part donc vers le
fournisseur de la session. Il n'est inscrit ni au journal ni au dossier exporté.
`test/v3/pi-entries.test.ts` le vérifie dans les entrées texte et JSON. Aucun contenu fourni par le
propriétaire n'y entre, quelle que soit la forme de la clé : `test/v1/model-admitted.test.ts` exige
le même texte, mot pour mot, pour une liste et pour chaque forme malformée.

**Un fichier illisible n'est plus cité au modèle.** Le diagnostic d'un fichier illisible reprenait
le message de `JSON.parse`, et V8 y cite une vingtaine de caractères du fichier autour de la faute.
Le défaut existait avant cette story, sur le même chemin vers le modèle, et le retrait de la liste
ouvre ce chemin à tout fournisseur. Il est corrigé (BUG-2026-09-23T173000) : une erreur de syntaxe
est annoncée « it is not valid JSON », sans extrait. Depuis `bda51c7`, un fichier qui ne s'ouvre pas
est annoncé « the file cannot be opened », sans le chemin absolu que portait le message d'`EACCES` ;
depuis `0b6539d`, il en va de même quand le répertoire ne se laisse pas parcourir, où `lstat`
échouait en citant le chemin. Une forme inattendue ne nomme que son type. Les tests de
`test/v1/model-admitted.test.ts` le tiennent, et un démarrage à froid de l'extension construite le
confirme.

**Un runtime qui ne se crée pas ne nomme pas son répertoire.** Hors du fichier de configuration, la
création du runtime échoue sur le répertoire de données (un `mkdir` refusé, par exemple), et le
message du système porte son chemin, qui est aussi celui de `config.json`. Le défaut existait avant
cette story. Depuis `0b6539d`, le refus ne garde que le code de l'erreur (`EACCES`, `EEXIST`…) et dit
comment le lever ; `test/v3/pi-rpc-sdk.test.ts` le vérifie dans une session RPC réelle.

**Les autres réglages gardent leur sens.** L'étalement de `policy`, les fusions de `budgets` et
`adoption`, le verrou `protocol: "kernel"`, `revision` et `policy_id` sont lus comme avant. La
campagne `e25s01-egress-malforme` a appliqué `language: "en"` à côté d'une clé ignorée. La campagne
`e25s01-egress-herite` portait `budgets.max_attempts: 2`, et son changement s'est ouvert à 3 : la
configuration le lit, mais `apply.ts` initialise tout changement au défaut du noyau. Ce défaut est
ouvert au registre sous BUG-2026-09-23T155707.

**Un fichier illisible arrête tout changement.** Avant cette story, la liste vidée par un fichier
illisible refusait toute intervention, par accident. Sans elle, le fichier ignoré aurait laissé la
session sous les réglages par défaut, et un arbitrage humain écrit dans le fichier
(`adoption.design: human`, `g5_human_acceptance`) serait passé au noyau (BUG-2026-09-23T184520). Le
propriétaire a tranché le 2026-09-23 : `loadConfig` lève `CONFIGURATION_ERROR` sur un fichier qui ne
s'ouvre pas, qui n'est pas du JSON, qui n'est pas un objet, ou dont une section (`policy`,
`policy.budgets`, `policy.adoption`, `isolation`, `human_origin`) n'en est pas un ; un lien
symbolique dont la cible a disparu est un fichier qui ne s'ouvre pas, pas un fichier absent, et ce
qui n'est pas un fichier ordinaire est refusé avant d'être ouvert (un tube nommé bloquait
l'ouverture de session jusqu'à ce qu'on y écrive). Le runtime ne se crée pas, et chaque `/495`
répond par ce refus jusqu'à ce que le fichier soit réparé ou retiré et que Pi recharge ses
extensions (`/reload`) ou ouvre une nouvelle session : seule l'ouverture de session lie la session à
son changement et annonce les diagnostics, et c'est aussi le seul endroit qui crée le runtime
(`session.ts`, `createRuntimeAt`). Les commandes et l'outil le lisent sans pouvoir le créer, et une
seconde ouverture de la même session, que le mode RPC de Pi émet sur `new_session`,
`switch_session`, `fork` et `clone`, garde le runtime ou l'échec de la première. Le refus atteint le contexte du
modèle une fois par commande. Aucun journal n'est ouvert. Une section qui n'est pas un objet ne répand donc plus ses caractères
dans la politique ; un champ du mauvais type y entre encore (BUG-2026-09-23T184521, ouvert).

**La vérification de capacité reste jugée avant tout engagement.** `requireCapable` juge le bac à
sable et les capacités du modèle ; `harness.ts` l'appelle avant de soumettre `intervention.start`,
dont le journal inscrit `intervention.started`. Un modèle sans fournisseur y reste un refus de
capacité, pas un refus par politique (`test/v2/model-admitted.test.ts`).

**Environnement du worker et constructeur de contexte non touchés.** Aucun fichier sous
`src/adapters/pi-worker/` ni `src/application/context.ts` dans le diff. Les tests du secret sentinelle
(`test/v1/egress.test.ts`, 2 tests) passent inchangés.

**Aucune exécution ni aucun réseau n'entre par ce changement.** Le diff de production ne porte ni
`exec`, ni `spawn`, ni `fetch`, ni `eval`.

## Contrôle retiré, comme la story le prévoit

Le refus d'une destination non déclarée. Un modèle distant choisi dans Pi reçoit des extraits sans
déclaration préalable à 495. L'autorisation de la destination est désormais le choix du modèle dans
Pi. L'annonce d'un modèle hors de la machine appartient à e25s03 ; D-61 (e25s04) consigne le retrait
et rend D-53 sans objet. Ce n'est pas un constat : c'est la décision du propriétaire du 2026-09-23.

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Un champ du mauvais type entre dans la politique.** Une section qui n'est pas un objet est refusée
depuis `bda51c7`, mais aucun champ n'est vérifié : `max_attempts: "abc"` est chargé tel quel, et
`policy.baseline`, qui n'est pas fusionné avec son défaut, peut perdre `compare_to_reference`.
`adoption.design: "Human"` fait adopter la conception par le noyau sans rien annoncer ;
`integration_enabled: "false"` active l'intégration, qui attend encore une autorisation humaine ;
`allow_unconfined: "no"` choisit le backend non confiné, jamais qualifié, et tout rôle qui écrit est
refusé. Le défaut précède la story, et il est ouvert au registre sous BUG-2026-09-23T184521.

**Changements bloqués avant la story.** Un changement bloqué sous `policy_denied` au titre de sa
destination repart, à la reprise, vers le fournisseur choisi. C'est l'effet voulu : le motif de
blocage n'existe plus.

# Revue de sécurité — e25s02, le modèle sélectionné quand l'intervention démarre

| | |
|---|---|
| Périmètre | `git diff 952172c..c1ff51c`, 13 fichiers, dont 6 de production ; puis `c1ff51c..af09eeb`, 8 fichiers de code et de test, dont 3 de production |
| Conduite le | 2026-09-23 |
| Branche | `modele-lu-a-chaque-intervention` |
| Risque de la story | P1, tâche 2 en P0 (contournement de la sonde de capacité) |
| Code de production touché | `src/application/harness.ts`, `src/application/intervention.ts`, `src/application/phases/verify.ts` (signature), `src/extension/conduct.ts`, `src/extension/runtime.ts`, `src/extension/session.ts` ; puis `src/application/intervention.ts`, `src/application/artifacts.ts`, `src/application/phases/implement.ts` |

## Verdict

Aucun constat à confiance ≥ 8. La porte passe.

Le changement déplace une lecture : le modèle n'est plus lu à l'ouverture de session mais au
démarrage de chaque intervention. Aucune entrée nouvelle n'est lue, et la sélection vient toujours de
l'hôte, jamais d'un fichier du projet cible.

## Hypothèses vérifiées, non supposées

**Le modèle jugé est celui qui est joint.** `runIntervention` (`harness.ts`) appelle `readModel()`
une seule fois et passe la même valeur à `requireCapable`, à l'événement `intervention.started`, à
`imposedLayersFor` et à la requête remise au superviseur, dont le mandat nomme `request.model`.
`InterventionSupervisor` ne garde plus de modèle : il ne peut pas en joindre un autre que celui de la
requête. Un `/model` reçu pendant que `requireCapable` attend la description du modèle ne change
donc rien à l'intervention qui démarre. `test/v3/model-select.test.ts` (§5, 6c) le vérifie, et la
campagne `e25s02-en-route` l'a montré en situation : un `set_model` reçu pendant la spécification n'a
pas changé son modèle, et la ligne de coût que le worker écrit à sa fin nomme encore le premier.

**Le worker résout le modèle du mandat, sans repli.** `worker-main.ts` cherche
`m.model.provider_id/m.model.model_id` dans le catalogue de Pi et refuse, sans chercher d'autre
modèle, s'il n'y est pas configuré ou authentifié. Le fichier n'est pas dans le diff.

**Un seul chemin fait avancer un changement.** `advance` n'a qu'un appelant, `conduct.ts`, et
`readModel` y est obligatoire : le typage refuse un appel qui l'omet. L'outil `495` crée le
changement sans le faire avancer. `verify` n'ouvre aucune intervention, et sa signature l'écrit.

**Une sélection vide reste un refus de capacité.** Sans modèle dans le contexte, `selectedModel` rend
un fournisseur et un modèle vides, que la description refuse avant tout engagement (6e, par test).
La campagne `e25s02-flash-refuse` a montré en situation qu'un modèle sélectionné qui n'appelle pas
l'outil est refusé en `capability_missing`, avant tout `intervention.started`.

**La politique ne change pas avec le modèle.** Le runtime, et la politique qu'il a chargée à
l'ouverture de session, ne sont pas recréés quand la sélection change.

**Aucune exécution ni aucun réseau n'entre par ce changement.** Le diff de production ne porte ni
`exec`, ni `spawn`, ni `fetch`, ni `eval`.

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Un modèle choisi en cours de changement reçoit le contexte des interventions suivantes.** C'est
l'effet voulu (AGT-07) : le choix du modèle dans Pi est ce qui admet son fournisseur (SEC-05, e25s01).
L'annonce d'un modèle hors de la machine appartient à e25s03 ; d'ici là, un passage d'un modèle local
à un modèle distant entre deux interventions ne se lit qu'au journal, par différence entre deux
`intervention.started`.

## Changements de la relecture (`c1ff51c..af09eeb`)

Aucun constat à confiance ≥ 8.

**Le refus du modèle devient réessayable, celui du bac à sable non.** `/495 resume` lève un blocage
dû au modèle et l'étape repasse par `requireCapable` avec la sélection lue à nouveau : la reprise ne
contourne pas la sonde, elle la rejoue. Le refus d'un bac à sable non qualifié reste non réessayable,
et `test/v2/harness.test.ts` le vérifie : aucune commande de la session ne qualifie un bac à sable,
et une reprise ne peut donc pas relancer un producteur sur un bac à sable qui ne confine pas.

**L'espace repris vient du journal de 495.** `unstartedAttempt` lit les artefacts `ws_` que seule
l'étape d'implémentation écrit, sous l'acteur du noyau, dans le journal de 495. Le chemin repris ne
vient ni du projet cible ni d'un fichier qu'un agent écrit. Aucun producteur n'a travaillé dans cet
espace : il ne contient que la référence et la préparation adoptée.

# Revue de sécurité — e25s03, la situation du modèle lue de son adresse

| | |
|---|---|
| Périmètre | `git diff fadf8f1..0816d28` (`main...HEAD`), 26 fichiers, dont 8 de production et un script de banc ; le code est celui de `db1173c`, `0816d28` ne touche que des relevés. Relu ensuite sur le code de `c17215f`, la révision que la relecture passe (voir la dernière section) |
| Conduite le | 2026-09-24 ; relu à `c17215f` le même jour |
| Branche | `situation-du-modele-lue-de-son-adresse` |
| Risque de la story | P0, tâche 1 classée `security: high`, tâche 2 `security: medium` |
| Code de production touché | `src/domain/policy.ts`, `src/ports/execution.ts`, `src/domain/change/commands.ts`, `src/domain/change/events.ts`, `src/domain/change/state.ts`, `src/extension/conduct.ts`, `src/extension/session.ts`, `src/extension/index.ts` ; `scripts/e2e-local-model.ts` hors production |

## Verdict

Aucun constat à confiance ≥ 8. La porte passe.

Le changement ajoute une lecture et un message. La lecture prend l'adresse que Pi tient pour le
modèle et n'en garde qu'un mot, `on_machine` ou `off_machine`. Le message nomme le fournisseur et le
modèle. Rien n'est exécuté, rien n'est résolu, aucune connexion n'est ouverte, et l'adresse ne
sort pas de la fonction qui la lit.

## Hypothèses vérifiées, non supposées

**La lecture ne résout aucun nom et n'ouvre aucune connexion (`security_verify` de la tâche 1).**
`locateModel` (`src/domain/policy.ts:31`) n'appelle que `new URL(...).hostname` et compare le
résultat à `localhost`, `[::1]` et `127.x.x.x`. Le module n'importe ni `node:dns`, ni `node:net`, ni
`fetch`. Une sonde a remplacé `dns.lookup` et `net.connect` par des compteurs, puis a lu les 33
adresses du tableau ci-dessous : `dns.lookup calls: 0, net.connect calls: 0`.

**Un nom qui imite le bouclage est hors de la machine.** Sonde sur le code de `db1173c`, par
`node` directement sur `src/domain/policy.ts` :

| Adresse | Hôte lu par `URL` | Situation |
|---|---|---|
| `http://127.0.0.1:8000/v1`, `http://localhost:1234`, `http://[::1]:8080` | tels quels | `on_machine` |
| `http://127.1`, `http://0x7f.1`, `http://2130706433`, `http://0177.0.0.1` | `127.0.0.1` | `on_machine` |
| `http://127.255.255.255`, `ws://127.0.0.1` | tels quels | `on_machine` |
| `http://LOCALHOST`, `http://ⓛocalhost` | `localhost` | `on_machine` |
| `http://[0:0:0:0:0:0:0:1]` | `[::1]` | `on_machine` |
| `http://localhost.` | `localhost.` | `off_machine` |
| `http://[::ffff:127.0.0.1]` | `[::ffff:7f00:1]` | `off_machine` |
| `http://127.0.0.1.nip.io`, `http://localhost.example.com` | tels quels | `off_machine` |
| `http://127.0.0.1@evil.com`, `http://evil.com#@127.0.0.1`, `http://evil.com\@127.0.0.1`, `http://[::1]@evil.com` | `evil.com` | `off_machine` |
| `http://127.0.0.1%2e.evil.com` | `127.0.0.1..evil.com` | `off_machine` |
| `http://0.0.0.0:8000`, `http://[::]:8000`, `http://128.0.0.1`, `https://api.example.com` | tels quels | `off_machine` |
| `file:///tmp/x`, `file://localhost/tmp` | vide | `off_machine` |
| absente, vide, `garbage`, `//127.0.0.1`, `127.0.0.1:8000`, `http://localhost%00.evil.com` | illisible | `off_machine` |

Chaque forme qui passe pour locale est une écriture de l'hôte de bouclage lui-même, après la
normalisation de l'analyseur d'URL. Les formes d'information d'utilisateur (`user@host`) et de
fragment sont lues sur l'hôte réel, qui est `evil.com`.

**L'hôte lu est celui que le client joint.** Le client OpenAI que Pi emploie construit l'URL de la
requête par `new URL(baseURL + path)` (`node_modules/openai/client.js:285`), avec un chemin qui
commence par `/`. Ajouter un chemin après l'autorité ne change pas l'hôte. Le même analyseur WHATWG
lit les deux côtés, donc un désaccord d'analyse entre la règle et le client ne peut pas situer sur la
machine un modèle que le client joint ailleurs.

**L'adresse n'atteint ni le journal, ni l'état, ni l'export, ni l'annonce (`security_verify` de la
tâche 2).** `baseUrl` n'est lu qu'en deux endroits, `conduct.ts:25` et `session.ts:253`, chaque fois
comme argument de `locateModel`. `selectedModel` construit `ModelSelection` champ par champ, avec
quatre clés, et c'est cet objet que `runIntervention` (`harness.ts:477`) passe tel quel à
`intervention.start`. Aucune copie de `ctx.model` n'est faite. Le texte de l'annonce ne porte que
`model.provider` et `model.id`. `test/v2/model-location-journal.test.ts:93` cherche une adresse
sentinelle dans tout le journal et dans chaque objet du magasin, sans la trouver.
`test/v3/model-select.test.ts:292` et `:446` vérifient que l'annonce ne contient pas l'hôte, avec une
adresse qui porte `?key=not-a-secret`.

**Le défaut va vers l'annonce.** Une sélection vide donne `location: "off_machine"`
(`conduct.ts:27`). Un événement ancien sans `location` reste sans valeur : le champ est facultatif et
aucun code ne le remplace par `on_machine` (6j).

**Aucune exécution ni aucun réseau n'entre par ce changement.** Le diff de production ne porte ni
`exec`, ni `spawn`, ni `fetch`, ni `eval`, ni lecture de fichier.

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Trois formes de bouclage sont situées hors de la machine.** `http://localhost.` (nom absolu),
`http://[::ffff:127.0.0.1]` (IPv4 dans IPv6) et `http://0.0.0.0` atteignent la machine, mais la règle
ne les admet pas. La spec n'admet que `localhost`, `127.0.0.0/8` et `::1` (§5, 6g). L'erreur produit une
annonce de trop, jamais une annonce qui manque.

**`localhost` est admis sans résolution.** Le client, lui, le résout par le système. Un fichier
`/etc/hosts` qui envoie `localhost` ailleurs ferait situer sur la machine un modèle qui ne l'est pas.
C'est la configuration de la machine elle-même, que la spec a choisi de ne pas lire (§5 : aucune
résolution).

**Un identifiant de modèle est dit tel que Pi le tient.** L'annonce cite `provider/id` du catalogue.
Si un utilisateur donne à un modèle un identifiant qui contient une adresse, l'annonce la répète. Ce
nom vient de sa propre configuration, pas du projet cible.

**La situation est lue du catalogue de la session, le worker lit le sien.** C'est la limite que la
spec déclare au §15. Une extension de la session qui redéfinit l'adresse d'un fournisseur ferait lire
à 495 une adresse que le worker ne joint pas. Rien dans le diff n'y touche.

## Relu à `c17215f`

La relecture a changé deux comportements après `db1173c`. Aucun n'ajoute de lecture de l'adresse ni
de canal, et le verdict reste le même.

- **Un choix reçu avant l'ouverture de 495 n'est pas dit (`0bf0707`).** `modelSelected` rend la main
  tant que la session n'est pas ouverte (`session.ts:252`). L'ouverture lit alors le modèle actif dans
  `ctx.model` et le juge avec la même fonction. Un modèle distant choisi avant l'ouverture, et encore
  actif à celle-ci, est donc annoncé une fois, et non perdu. Un test le mesure dans un vrai
  `pi --mode rpc`, avec une seconde extension qui choisit le modèle. Aucune campagne ne l'a exécuté.
- **L'annonce dit « was selected » (`8083cd0`).** Le texte porte toujours `model.provider` et
  `model.id`, et rien d'autre du modèle.

`baseUrl` n'est toujours lu qu'aux deux endroits cités plus haut. Les références de ligne de cette
revue sont celles de `c17215f`. Preflight y est verte sous Node 24.21.0, avec 426 tests.

# Revue de sécurité — e25s05, config.json validé par un schéma

| | |
|---|---|
| Périmètre | `git diff 770c7a9..7bd099b` (`main...HEAD`), 16 fichiers, dont 5 de production et le contrat émis |
| Révision relue | `7bd099b` |
| Conduite le | 2026-09-24 |
| Branche | `config-validee-par-un-schema` |
| Risque de la story | P1, tâche 1 classée `security: medium`, tâche 2 `security: high` |
| Code de production touché | `src/contracts/v1/config.ts`, `src/contracts/validate.ts`, `src/contracts/registry.ts`, `src/extension/config.ts`, `src/extension/session.ts` (un commentaire) ; `contracts/v1/harness-config.json` émis |

## Verdict

Un constat à confiance ≥ 8, de sévérité moyenne. À `7bd099b`, la porte ne passe pas : le
`security_verify` de la tâche 2 est réfuté dans un vrai Pi. Le constat est corrigé (voir « Correction
du constat »), et la porte passe sur le code corrigé.

Le refus d'un fichier que le schéma rejette arrête bien tout changement, sur toutes les formes
d'écart essayées, et il ne reproduit aucune valeur écrite. Mais sous la copie de TypeBox que Pi
fournit à l'extension, une clé inconnue qui contient `/` est citée, réécrite avec des points, alors
qu'elle n'est pas un identifiant court. Les tests passent parce qu'ils tournent sous la copie du
dépôt, qui échappe le pointeur.

## Constat à confiance ≥ 8

**`src/extension/config.ts:93` et `:118` — moyenne — exposition de données (CWE-200).** Confiance 9.

- **Ce qui se passe.** `unknownKey` retrouve le nom d'une clé inconnue en coupant `instancePath` au
  dernier `/`, et `location` remplace chaque `/` par un point. Les deux supposent un pointeur JSON
  échappé (`/` écrit `~1`). TypeBox 1.3.34, celle du dépôt, échappe : la clé `a/b~c` donne
  `/a~1b~0c`. TypeBox 1.3.27, celle que le chargeur d'extensions de Pi 0.87.1 aliase sous `typebox`,
  n'échappe pas : la même clé donne `/a/b~c`. Sous Pi, une clé `X/y` dont le dernier segment `y` est
  un identifiant court est donc citée en entier, sous la forme `X.y`. Une clé `X/` fait citer `X`
  comme une section.
- **Preuve dans un vrai Pi.** `pi --version` 0.87.1, `pi -ne --mode json --no-session -e
  src/extension/index.ts "/495 status"`, avec un `config.json` qui porte
  `{"sk-ant-api03-SECRET/token":1}`. Le message `495` rendu :
  `495 error: CONFIGURATION_ERROR: config.json cannot be read: sk-ant-api03-SECRET.token is not a known setting; no change runs until it is fixed or removed and Pi is reloaded (/reload) or a new session is started`.
- **Scénario.** Le propriétaire colle par erreur, comme nom de clé, un texte qui contient `/` : une
  URL avec son jeton, un chemin privé, un secret suivi d'un suffixe. Le refus porte ce texte à
  l'écran, sur les entrées structurées et dans le contexte du modèle de la session, qui peut être
  distant. La spec l'interdit (§15, 6b).
- **Effet de bord.** Le même défaut fait nommer un réglage connu à la place de la clé écrite :
  `{"policy/egress":[…]}` à la racine rend le motif de `policy.egress`, et
  `{"policy":{"adoption/design":…}}` rend `policy.adoption.design is not a known setting`.
- **Correction.** Ne pas lire le nom de la clé dans le pointeur. Le parent d'une clé inconnue est
  toujours un objet que le schéma nomme, et ses segments sont des clés connues. Lire le nom dans
  l'objet réel à cet emplacement, par exemple dans `params.additionalProperties` de l'entrée que
  TypeBox émet pour le parent, ou en listant les clés propres de l'objet qui ne sont pas dans
  `properties`. Citer la clé seulement si elle passe `SHORT_IDENTIFIER`, sinon dire « holds a key ».
  Ajouter à `test/v1/config-schema.test.ts` une clé qui contient `/`, et faire tourner ce test sous la
  copie de TypeBox de Pi.

## Hypothèses vérifiées, non supposées

**Les quatre cas du registre sont refusés par le schéma (`security_verify` de la tâche 1,
établi).** Une sonde lance `node` directement sur `src/contracts/v1/config.ts`, deux fois : une fois
sous la copie de TypeBox du dépôt (1.3.34) et une fois sous celle de Pi (1.3.27), par un crochet de
résolution de module qui reproduit l'alias du chargeur de Pi. `design: "Human"`,
`integration_enabled: "false"`, `allow_unconfined: "no"` et `baseline: "x"` sont refusés par
`check` et par `Value.Check` : 4 sur 4 sous chaque copie.

**Le refus bloque, et ne reproduit aucune valeur (`security_verify` de la tâche 2, réfuté pour les
clés).** La même sonde écrit 223 fichiers dans un répertoire de données et appelle `loadConfig`.
Chaque valeur et chaque clé qui n'est pas un identifiant porte un marqueur, et les nombres sont
choisis pour être reconnaissables. Formes couvertes : type à chaque niveau (racine, sections, listes
et leurs éléments, entier flottant, `1e400`), `enum` (`design`, `mandate`, `protocol`, `language`,
`tolerance`, `instability`), `minimum`, `minLength`, `maxLength`, `$schema` de mauvais type, chaînes
de 120 000 caractères, clé inconnue identifiant à chaque niveau, 17 formes de clé non identifiant à
chacune des 7 sections (espace, point, deux-points, `/` au début, au milieu, doublé ou final, `~0`, `~1`, `~`, `é`, émoji, caractère invisible, saut de
ligne, 52 caractères, clé vide), `policy.egress` avec entrées, en chaîne et à la racine, 30 écarts
pour le compte, racine liste, chaîne, nombre, `null` et booléen, clés de prototype.

| Copie de TypeBox | Refusés en `CONFIGURATION_ERROR` | Sans fuite | Avec fuite |
|---|---|---|---|
| 1.3.34 (dépôt, tests) | 223 / 223 | 223 | 0 |
| 1.3.27 (Pi 0.87.1) | 223 / 223 | 183 | 40, toutes des clés qui contiennent `/` |

(La sonde signale aussi trois cas `$schema must be a string` ; ce sont de faux positifs, `$schema`
étant une clé du schéma.) Aucune valeur n'est reproduite sous l'une ou l'autre copie. `expectation`
ne lit que des paramètres du schéma (`type`, `allowedValues`, `limit`), et les deux copies les
nomment de la même façon. Un mot-clé qu'elle ne connaît pas rend un texte fixe. Le message de
TypeBox n'est jamais repris. Le pointeur d'un écart de type ou de valeur ne traverse que des clés que
le schéma nomme et des positions de liste, puisque la valeur `false` de `additionalProperties` ne
descend pas dans une clé inconnue.

**Aucune pollution de prototype.** `__proto__`, `constructor`, `toString`, `hasOwnProperty`,
`valueOf`, `__defineGetter__`, `isPrototypeOf` et `propertyIsEnumerable`, placés à la racine, sous
`policy`, sous `isolation` (avec `{"allow_unconfined": true}` pour valeur) et sous `adoption`, sont
tous refusés comme clés inconnues sous les deux copies. `JSON.parse` en fait des propriétés propres,
et la fusion par décomposition ne reçoit qu'un fichier que le schéma a accepté.
`Object.prototype` reste vide après les 223 appels.

**Les refus d'accès au fichier sont inchangés.** `unreadable`, `present` et `parseFile` sont
identiques à ceux de `main` (comparaison textuelle). La sonde les exerce : fichier absent, défauts ;
lien brisé et mode `000`, `the file cannot be opened` ; répertoire et tube nommé,
`it is not a regular file` ; JSON invalide qui porte un secret, `it is not valid JSON`, sans le
secret.

**Un fichier valide n'élargit rien que la lecture précédente n'acceptait déjà.** Avant la story,
toute valeur passait. Le schéma ne rend acceptable aucune valeur qui ne l'était pas. Le seul contrôle
de code retiré, `protocol: "kernel"` forcé après fusion, est remplacé par `Closed(["kernel"])` :
`protocol: "human"` est refusé sous les deux copies. Le contrat émis ferme ses sept objets
(`additionalProperties: false` à la racine, `policy`, `budgets`, `adoption`, `baseline`,
`isolation`, `human_origin`).

**Le plafond de `Value.Errors` est mesuré sous chaque copie.** `LISTED_AT_MOST`
(`src/contracts/validate.ts:17`) vaut 8 sous 1.3.34 comme sous 1.3.27. Sur 30 clés inconnues, le
refus nomme trois écarts puis `and at least 5 more`, sans valeur. Le compte est une borne basse ; il
ne porte rien du fichier.

**Une erreur imprévue ne fuit pas non plus.** Une exception autre que `DomainError` levée pendant la
lecture est rendue par `cannotCreate` (`src/extension/session.ts:36`), qui ne cite que son code.
Aucune des 223 entrées n'en a produit.

## Observations sous le seuil de report (confiance < 8, non bloquantes)

**Les tests ne tournent pas sous la copie de TypeBox qui s'exécute dans Pi.** `package.json` borne
`typebox` à `^1.3.34` en développement, et Pi 0.87.1 fournit 1.3.27. Le constat ci-dessus vient de
cet écart. D'autres différences de comportement entre les deux copies passeraient de la même façon.
`test/v3/config-refused.test.ts` tourne dans un vrai Pi, mais avec une clé identifiant.

**Des écarts distincts peuvent se confondre dans le compte.** Deux clés non identifiant sous la même
section donnent le même texte, qui n'est compté qu'une fois. Le compte reste une borne basse, sans
effet sur le refus. Corrigé par `57cd3b3` (voir « Correction de deux défauts du nommage »).

**`human_origin.rpc_actor_env` accepte le nom de n'importe quelle variable d'environnement.** Une
variable toujours présente, `HOME` par exemple, attribuerait une origine humaine à tout client RPC.
Ce comportement précède la story, qui ne fait que typer la clé.

**Aucune borne haute sur les budgets.** `max_attempts`, `feedback_bytes` ou `increment_ms` acceptent
tout entier. C'est le réglage du propriétaire, déjà accepté avant la story.

## Correction du constat

Test `10293ed`, correction `eb9676c`.

`unknownKey` ne lit plus le nom de la clé dans le pointeur. `unknownKeys` parcourt le fichier le long
du schéma et relève chaque clé qu'il ne nomme pas, avec la section qui la porte, sous ses deux
écritures de pointeur, échappée et brute. Le pointeur d'un écart ne sert plus qu'à retrouver cette
entrée, quelle que soit la copie de TypeBox qui l'a produit. La clé n'est citée que si elle passe
`SHORT_IDENTIFIER`, qui exclut `/` et `~` ; sinon le refus dit « holds a key » sous sa section. Une
clé `policy/egress` écrite à la racine n'a plus le motif de `policy.egress`.

- **Rouge dans un vrai Pi, avant la correction.** Le test ajouté à `test/v3/config-refused.test.ts`
  écrit `{"sk-q8v2x7/token":1,"policy":{"zq8v2/key":1}}` et lance `/495 start` en JSON sur
  `src/extension/index.ts`. Refus rendu : `sk-q8v2x7.token is not a known setting; policy.zq8v2.key
  is not a known setting`. 1 échec sur 1.
- **Vert après.** Le même test passe, 3 sur 3 dans le fichier ; `test/v1/config-schema.test.ts`
  ajoute `zq/key`, `zq/`, `a~1b` et `policy/egress` à la racine, 26 sur 26 avec
  `test/v1/model-admitted.test.ts`.
- **La sonde de 223 fichiers, rejouée.** Sous la copie de Pi (1.3.27) comme sous celle du dépôt
  (1.3.34) : 223 refus sur 223, 0 fuite réelle. Les 3 entrées signalées restent les faux positifs de
  `$schema`, une clé que le schéma nomme, sans valeur reproduite. Avant la correction, 40 fuites sous
  la copie de Pi.

Le `security_verify` de la tâche 2 est établi. L'écart entre les copies de TypeBox reste une
observation : seul un test v3 exerce la copie de Pi.

## Correction de deux défauts du nommage

Tests `6e5401b`, correction `57cd3b3`. L'audit de `eb9676c` a relevé deux défauts dans la façon dont
un refus nomme les clés inconnues. Aucun ne laisse passer un fichier, aucun ne reproduit une valeur.

- **Le compte confondait les clés non citables.** L'observation ci-dessus, mesurée : quatre clés non
  identifiant sous `policy` donnaient `policy holds a key that is not a known setting`, sans reste.
  La liste des écarts ne fusionne plus les textes identiques. Le validateur ne rend jamais deux
  écarts au même pointeur sous le même mot-clé, donc la fusion ne retirait que ces doublons-là. Le
  refus dit désormais trois fois le même texte, puis `and 1 more`.
- **Une clé qui contient `/` pouvait prendre la place d'une clé inconnue.** La correction de
  `eb9676c` range chaque clé inconnue sous ses deux pointeurs, échappé et brut. Le pointeur brut de
  `budgets/x` sous `policy` est `/policy/budgets/x`, celui d'une clé `x` sous `policy.budgets`. Sous
  la copie du dépôt, qui échappe, `{"policy":{"budgets/x":1,"budgets":{"x":1}}}` rendait `policy
  holds a key…` seul : la clé `x` n'était jamais nommée, et l'ordre des clés dans le fichier
  décidait du résultat. `take` cherche désormais la clé dont le pointeur échappé est celui de
  l'écart, et ne prend le pointeur brut qu'à défaut, pour la copie de Pi. Une clé citable n'a qu'une
  écriture de pointeur, puisque `SHORT_IDENTIFIER` exclut `/` et `~` : ce repli ne peut attribuer à
  une clé citable que l'écart d'une clé qui existe dans le fichier, jamais faire citer une clé qui
  contient `/`.

Preuves :

- **Rouge dans un arbre détaché à `6e5401b`.** `test/v1/config-schema.test.ts`, 2 échecs sur 20 :
  les deux nouveaux tests.
- **Vert à `57cd3b3`.** 20 sur 20, et 28 sur 28 avec `test/v1/model-admitted.test.ts`, sous
  Node 24.21.0. Preflight verte, 449 tests.
- **Sous la copie de Pi.** Le test v3 ajouté écrit `{"policy":{"budgets/zq8v2":1,"budgets":{"zq8v2":1}}}`
  et lance `/495 start` en JSON. Il passe avant et après la correction, puisque cette copie donne
  le même pointeur aux deux clés. Sans le repli sur le pointeur brut, il échoue, comme le test v3
  de la clé `sk-q8v2x7/token` : c'est ce repli qui garde la copie de Pi.
- **Non rejoué.** La sonde de 223 fichiers. La correction ne touche ni la condition de citation ni
  le texte d'une valeur. Deux tests v3 exercent désormais la copie de Pi sur une clé qui contient
  `/`.

## Reprise en relecture

Tests `91caebc`, correction `a94ef1f`. La relecture de `6f3010b` a trouvé, chez ses deux relecteurs,
un point à corriger : une valeur qui enfreint deux bornes d'un réglage (`null` là où des valeurs sont
permises, `0.5` sous un minimum) comptait pour deux écarts, et au-delà du plafond du validateur
« and at least N more » pouvait être faux. Le refus lit désormais les clés inconnues dans le fichier
seul, le long du schéma et sans plafond ; le validateur ne donne plus que les valeurs fausses, une
par emplacement. `take()`, décrit ci-dessus, disparaît : aucun pointeur du validateur n'est plus
rapproché d'une clé, sous aucune copie de TypeBox.

La propriété de sécurité ne change pas. Une clé n'est citée que si elle passe `SHORT_IDENTIFIER`.
Une valeur fausse n'est dite que par son emplacement, fait de clés que le schéma nomme et de
positions de liste, et par les paramètres du schéma. Les deux relecteurs ont rejoué le refus sous
chaque copie de TypeBox, dont `policy.egress` portant une URL, `design: "Human"`, `__proto__` et des
clés à `/` et `~` : aucune valeur ni aucune clé non citable n'y apparaît. Un nouveau test v3,
`{"policy":{"a~1b":1,"a/b":1}}` dans un vrai Pi, était rouge avant la correction (la seconde clé
était dite sous « the file ») et passe après. La sonde de 223 fichiers n'a pas été rejouée.

# Revue de sécurité — e25s04, la décision du modèle admis et sa recette

| | |
|---|---|
| Périmètre | `git diff main...HEAD` ; un fichier de production, `src/extension/session.ts`, par la correction décidée en relecture |
| Révision relue | `c96a05d`, puis la relecture jusqu'à `a888f48` |
| Conduite le | 2026-09-24 |
| Branche | `modele-choisi-admis` |
| Risque de la story | P1, tâche 2 classée `security: medium` |
| Code de production touché | `src/extension/session.ts` (`3a9ef82`) : la file des diagnostics ne notifie plus l'écran une seconde fois ; `contracts/` et `package.json` sont ceux de `main` |

## Verdict

Aucun constat. Le correctif ne change ni ce qui est dit ni à qui : chaque diagnostic atteint
toujours l'écran une fois et l'entrée structurée une fois, et aucun texte nouveau n'est émis. Aucun
diagnostic ne cesse d'être montré, car chaque texte mis en file est notifié à l'écran au moment où il
y entre. Le `security_verify` de la tâche 2 est établi : le relevé ne reproduit aucune adresse
de fournisseur ni aucun jeton, et cite les situations lues au journal.

## Hypothèses vérifiées, non supposées

- **Les lignes que la branche ajoute ne portent aucun secret.** Les fichiers de la branche ont été
  fouillés pour
  l'adresse et la clé du modèle local, l'adresse d'Anthropic, les deux jetons de l'abonnement et le
  chemin personnel du propriétaire. Les valeurs de sa configuration de Pi ont été lues sans être
  affichées. Une seule occurrence, antérieure à la branche : l'adresse de bouclage du modèle local,
  citée par la revue de e25s03 plus haut dans ce fichier. Aucune dans ce que la branche ajoute.
- **Les dossiers des campagnes ne portent ni adresse ni jeton.** Les adresses, la clé, les jetons et
  le nom témoin ont été cherchés dans les trois répertoires de données, export compris, et dans ce
  que Pi a reçu de 495. Aucune occurrence hors des sorties du pilote. Le chemin personnel du
  propriétaire n'y a pas été cherché, et il y figure, dans les chemins absolus des espaces de
  travail. Le préfixe `sk-ant-oat` des manifestes du dossier distant est la condition déclarée du
  bloc imposé, pas un jeton.
- **La configuration du propriétaire n'est pas modifiée.** `set_model` ne persiste pas le choix, et
  `settings.json` garde son modèle par défaut après la campagne distante.

## Ce qui est parti hors de la machine

La campagne distante a envoyé à Anthropic les extraits de la cible JS minimale, qui ne porte aucune
donnée privée, et la section `<cwd>` que Pi ajoute à l'invite, avec le chemin absolu de l'espace de
travail. Cette section reste la question ouverte que `D-61` reprend.

