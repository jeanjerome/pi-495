# Le modèle choisi dans Pi est admis, et sa situation est observée — trois exécutions réelles

| | |
|---|---|
| Conduite le | 2026-09-24 (UTC), de 17:16:15 à 17:27:08, l'une après l'autre |
| Build | `dist/` construit à `698da99`, dont `src/`, `contracts/` et `package.json` sont ceux de `main` à `3b64971` ; le même fichier pour les trois campagnes |
| Environnement | Node 24.21.0, Pi 0.87.1, empreinte `sha256:d2dc0952…` identique dans les trois dossiers |
| Configuration de Pi | celle du propriétaire, sans `PI_CODING_AGENT_DIR` ; session ouverte sur son modèle par défaut, `omlx/qwen3.8-27b-oq8e` |
| Lancement | `pi -ne --mode rpc --no-session -e dist/extension/index.js -e <reload-runtime.ts>`, piloté par `~/.495-campagnes/scripts/e25s04-drive.ts`, enchaîné par `e25s04-run.sh` |
| Cible | un clone de la cible JS minimale par campagne, commit `1a18201` |
| Demande | `/495 start greet doit rendre "Hello, <name>!" avec un point d'exclamation final` |
| Intégration | désactivée ; aucune campagne n'écrit dans la cible |

| Campagne | Dossier | Changement | Issue |
|---|---|---|---|
| `e25s04-local` | `~/.495-campagnes/e25s04-local` | `chg_mufsscjj65d2fc31bd` | accepté, G0 à G5 `PASS`, 1 tentative |
| `e25s04-distant` | `~/.495-campagnes/e25s04-distant` | `chg_mufsya5u42926bd829` | accepté, G0 à G5 `PASS`, 1 tentative |
| `e25s04-negatif` | `~/.495-campagnes/e25s04-negatif` | `chg_mufsn7w3a6cd9010be` | refusé, puis accepté après retrait de la liste, G0 à G5 `PASS`, 1 tentative |

Chaque dossier a été relu en lecture seule par le pilote, depuis `state.sqlite`, le magasin d'objets
et l'export produit par `/495 export` (vérifié `ok` dans les trois cas). La sortie complète de
chaque campagne est dans `<dossier>/driver.out`.

## e25s04-local — un modèle local sans configuration

Le répertoire de données ne porte pas de `config.json`.

- **Écran :** aucune notice de toute la session — ni à l'ouverture, ni pendant `/495 start`, ni
  après.
- **Entrée structurée :** aucun message de 495 ne parle du modèle ; seuls les comptes rendus de
  `/495 status`, `/495 start` et `/495 export`.
- **Journal :** les trois démarrages d'intervention inscrivent `omlx/qwen3.8-27b-oq8e`, réflexion
  `medium`, situation `on_machine`. Les trois lignes de coût disent le coût inconnu, parce que le
  catalogue de l'hôte n'a pas de tarif pour `omlx/qwen3.8-27b-oq8e`, hors abonnement. La strate
  observée dans chaque requête est `openai-completions`, sans bloc imposé.
- **Verdict :** accepté en 4 min 28 s.

## e25s04-distant — un modèle Anthropic choisi en cours de session

Le répertoire de données ne porte pas de `config.json`. La session s'ouvre sur le modèle local.
`anthropic/claude-sonnet-5` est choisi 1 s après que le journal porte le premier démarrage
d'intervention, celui de la spécification.

- **Écran :** une seule notice, un avertissement émis au moment du choix : « 495: the model
  anthropic/claude-sonnet-5 was selected and is reached off this machine; what 495 sends it leaves
  the machine ». Rien à l'ouverture, qui était sur le modèle local.
- **Entrée structurée :** la même annonce, une fois. Elle est remise avec la réponse de la commande
  suivante (`/495 export`), parce que `/495 start` était en cours quand le modèle a changé ; elle
  n'est pas dite deux fois.
- **Journal — la frontière :**

  | intervention | fournisseur et modèle inscrits au démarrage | situation | API observée dans la requête | au-dessus de l'invite de 495 | coût |
  |---|---|---|---|---|---|
  | specify | `omlx/qwen3.8-27b-oq8e` | `on_machine` | `openai-completions` | rien | inconnu, pas de tarif au catalogue pour `omlx/qwen3.8-27b-oq8e` |
  | prepare | `anthropic/claude-sonnet-5` | `off_machine` | `anthropic-messages` | « You are Claude Code, Anthropic's official CLI for Claude. » | 0,0526 $, par abonnement |
  | implement | `anthropic/claude-sonnet-5` | `off_machine` | `anthropic-messages` | le même bloc | 0,0232 $, par abonnement |

  La spécification avait démarré sous le modèle local ; elle l'a gardé jusqu'au bout, et les deux
  interventions suivantes ont démarré sous le modèle choisi.
- **Ce qui prouve le modèle réellement joint :** la ligne de coût ne nomme le modèle que lorsque le
  coût est inconnu. Pour les deux interventions Anthropic, elle porte un montant au tarif du
  catalogue et `subscription: true`, sans nommer le modèle. Ce qui établit que le worker a joint
  Anthropic est la strate observée dans la requête qu'il a envoyée : l'API `anthropic-messages` et le
  bloc que le fournisseur impose sur le chemin d'abonnement (`D-60`). La spécification de la story
  attendait que la ligne de coût nomme le modèle ; ce n'est pas ce que le code écrit, et ce relevé
  s'appuie sur l'observation de la requête à la place.
- **Coût :** 0,0758 $ au tarif du catalogue de l'hôte pour les deux interventions Anthropic ; les
  trois interventions ont fait 20 appels d'outils et 89 229 jetons. Relu par `node scripts/measure-budgets.ts ~/.495-campagnes/e25s04-distant`
  (sortie 0). Aucun montant n'est lu sur une facture.
- **Verdict :** accepté en 2 min 3 s.

## e25s04-negatif — une liste restée dans `config.json`

Le fichier porte, dans l'ancienne forme, une liste qui ne nomme qu'un fournisseur témoin,
`temoin-liste-e25s04`, situé hors de la machine. Elle exclut donc le modèle choisi.

- **À l'ouverture**, une erreur à l'écran : « 495: config.json cannot be read: policy.egress is no
  longer read, since the model selected in Pi is used; no change runs until it is fixed or removed
  and Pi is reloaded (/reload) or a new session is started ».
- **`/495 status` et `/495 start`** reçoivent la même raison sous `CONFIGURATION_ERROR`.
- **Retrait :** le fichier devient `{ "policy": {} }` à 17:16:22.797, Pi recharge ses extensions, et
  `/495 start` est renvoyé. Le changement est créé à 17:16:25.354, après le rechargement : aucun
  changement n'a été ouvert sous la liste.
- **Après le retrait :** aucune notice à l'écran, aucun refus au journal (aucun événement de type
  `*refused*`). Les trois démarrages inscrivent `omlx/qwen3.8-27b-oq8e` `on_machine`. Accepté en
  3 min 50 s.
- **Le nom témoin** n'apparaît dans aucun fichier du répertoire de données — journal, magasin
  d'objets, fichiers de journal, export — ni dans ce que Pi a reçu de 495, à l'écran comme sur
  l'entrée structurée.

## Adresses et jetons

Les trois répertoires de données, hors espaces de travail des candidats et hors sorties du pilote,
ont été fouillés, ainsi que tout ce que Pi a reçu de 495 à l'écran et sur l'entrée structurée. Les
valeurs cherchées ont été lues dans la configuration du propriétaire et ne sont écrites ni ici ni
dans les sorties du pilote : l'adresse du modèle local et sa clé, l'adresse d'Anthropic, le jeton
d'accès et le jeton de renouvellement de l'abonnement, et le nom témoin. Aucune occurrence, dans
aucune des trois campagnes.

Le préfixe `sk-ant-oat` apparaît dans quatre fichiers du dossier distant : deux manifestes, et leur
copie dans l'export. C'est la condition que le manifeste déclare pour le bloc imposé, pas un jeton.

La configuration du propriétaire n'est pas modifiée : `settings.json` garde `omlx` comme modèle par
défaut après la campagne distante. La commande RPC `set_model` ne persiste pas le choix.

## Ce qui est feint

- **`/model` n'est pas tapé dans l'interface texte.** La campagne distante emploie la commande RPC
  `set_model`, qui appelle le même `session.setModel` de Pi (`rpc-mode.js`, Pi 0.87.1). Selon le chemin
  pris dans l'interface texte, `/model` peut persister le choix comme défaut (`interactive-mode.js`),
  ce que `set_model` ne fait pas ; 495 lit le modèle de la session, pas ce défaut.
- **`/reload` n'est pas tapé.** Le mode RPC n'a pas de commande `/reload`. Le contrôle négatif
  recharge par `/reload-runtime`, l'extension d'exemple de Pi qui appelle `ctx.reload()`, le même
  `session.reload()` que le `/reload` interactif.
- **L'extension est chargée par l'entrée de paquet du propriétaire.** Sa configuration de Pi déclare
  le dépôt comme paquet, et Pi le charge malgré `-ne`. Une seule commande `495` est enregistrée, et
  elle pointe vers le même `dist/extension/index.js` que le `-e` explicite.

Rien d'autre n'est feint : le modèle local et le modèle Anthropic sont réels, le second joint par
l'abonnement du propriétaire, et la Seatbelt confine les contrôles.

## Ce que ce relevé n'établit pas

- **La ligne de coût ne nomme pas le modèle Anthropic** (voir la campagne distante). Le modèle joint
  est établi par la strate observée dans la requête.
- **La section `<cwd>`** que Pi ajoute à l'invite est partie chez Anthropic avec les deux
  interventions distantes, avec le chemin absolu de l'espace de travail. C'est la question ouverte
  que `D-61` reprend ; cette recette ne la tranche pas.
- **Une extension qui redéfinit l'adresse d'un fournisseur** n'a pas été exercée.
- **Une adresse de réseau local privé** n'a pas été exercée ; sa situation hors de la machine repose
  sur `test/v1/model-location.test.ts`.
