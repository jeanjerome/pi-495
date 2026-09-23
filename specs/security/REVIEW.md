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
