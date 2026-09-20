# Le modèle local : oMLX et sa configuration pour 495

495 n'appelle jamais un modèle lui-même : il reçoit celui que Pi lui tend (`ctx.model` dans
`extension/index.ts`). Configurer le modèle est donc une affaire entre oMLX et Pi, et ce document
décrit la chaîne des deux côtés, telle qu'elle est établie sur la machine de référence.

Les vitesses citées ici viennent de [benchmarks/](benchmarks/README.md), où chaque chiffre a sa
fiche et son protocole.

## 1. oMLX

### Ce qui est installé

oMLX est une application macOS, `/Applications/oMLX.app`, qui pose son propre lanceur en ligne de
commande. `/opt/homebrew/bin/omlx` est un lien symbolique vers `~/.omlx/bin/omlx`, lequel est un
script court qui lit `~/Library/Application Support/oMLX/base-path`, exporte `OMLX_BASE_PATH` et
exécute `/Applications/oMLX.app/Contents/MacOS/omlx-cli`. Ce n'est pas un paquet Homebrew : le
`brew list --cask` ne le connaît pas, seul le lien vit dans son répertoire.

Version en service : **0.6.4 (2529)**, lisible par `omlx --version` ou dans l'`Info.plist` du
bundle.

### Les commandes

```
omlx start      # démarre le serveur géré en arrière-plan (--timeout, --no-wait)
omlx stop
omlx restart
omlx serve      # serveur multi-modèles au premier plan, avec tous ses réglages en options
omlx diagnose   # diagnostic d'installation ou d'exécution
```

`omlx start` suffit pour l'usage de 495 : `auto_start_on_launch` est vrai, et le serveur écoute sur
`127.0.0.1:8000`. Vérification en une ligne :

```bash
curl -s http://127.0.0.1:8000/v1/models
```

Un serveur éteint se manifeste, côté 495, par une intervention qui échoue en quelques secondes sur
`Connection error.` — le changement est alors bloqué avant tout gate.

### L'arborescence

| Chemin | Contenu |
| --- | --- |
| `~/.omlx/settings.json` | serveur, répertoires de modèles, mémoire, ordonnanceur, cache, authentification |
| `~/.omlx/model_settings.json` | réglages par modèle, dont le profil actif |
| `~/.omlx/model_profiles.json` | les profils, par modèle |
| `~/.omlx/models/` | les poids ; chaque sous-répertoire est un modèle, y compris imbriqué (`Vontra/…`) |
| `~/.omlx/cache/` | cache de préfixe sur SSD (`ssd_cache_max_size: 185GB` ici) |
| `~/.omlx/logs/server.log` | le journal, où se lisent les chargements, la géométrie du cache et les refus |

Les modèles sont découverts au démarrage depuis les sous-répertoires de `model_dir` ; chacun doit
porter un `config.json` et ses `*.safetensors`. L'acquisition se fait par l'application (Hugging Face
ou ModelScope, endpoints réglables dans `settings.json`) — il n'y a pas de sous-commande de
téléchargement dans le CLI.

### L'authentification

La clé d'API du serveur est dans `~/.omlx/settings.json`, champ `auth.api_key`, et c'est elle qu'il
faut recopier côté Pi. **Elle n'est pas reproduite ici** : ce dépôt a un distant public. Noter que
`auth.skip_api_key_verification` vaut `true` sur cette machine, donc la clé n'est pas réellement
opposée — ne pas en conclure qu'elle est facultative ailleurs.

## 2. Le modèle : `Qwen3.8-Flash-Next-MLX-oQ4-MTP`

### Pourquoi celui-là, et sur quelle preuve

Le coût d'un cycle 495 est dominé par la **lecture du prompt**, pas par la génération : le contexte
qu'une intervention envoie fait 60 000 octets, soit environ 12 400 jetons, et la campagne réelle a
montré que les minutes passent à relire la conversation. Sur ce terrain le Flash-Next l'emporte
nettement :

| | 27B oQ8e | **Flash-Next oQ4** |
| --- | --- | --- |
| Préremplissage à froid | 288 tok/s | **523 tok/s** |
| Préremplissage en régime agentique | 236 tok/s | **525 tok/s** |
| Génération | 29,3 tok/s | 30,3 tok/s |
| TTFT sur 12,4 k jetons | 43,2 s | **23,8 s** |
| Empreinte estimée | 28,44 Go | 79,53 Go |

La génération est indistinguable ; tout l'écart est en lecture, là où il compte.

**Ce que cette recommandation ne couvre pas.** Elle est établie sur la vitesse et sur elle seule. La
qualité des sorties n'a pas été mesurée, et c'est un manque qui pèse ici : le mur qui tue réellement
les cycles 495 aujourd'hui n'est pas la lenteur mais la **validité de la sortie structurée** — deux
lancements sur quatre y sont morts avec le 27B en 8 bits (`chantiers/F`). Un modèle en 4 bits n'est
pas a priori meilleur sur ce terrain. Avant d'en faire le modèle par défaut d'un usage sérieux, il
faut lui faire conduire un cycle complet et regarder combien de rapports valident leur schéma.

### Configuration côté oMLX

Le modèle vit dans `~/.omlx/models/Vontra/Qwen3.8-Flash-Next-MLX-oQ4-MTP` : architecture
`qwen4_exp`, quantification affine 4 bits par groupes de 32, 22 fragments de poids.

Réglages en vigueur, dans `model_settings.json`, par le profil `pi-flashnext-01` :

| Réglage | Valeur | Pourquoi |
| --- | --- | --- |
| `model_type_override` | **absent** | à ne surtout pas mettre à `"llm"` — voir l'avertissement ci-dessous |
| `active_profile_name` | `pi-flashnext-01` | |
| `max_context_window` | 131 072 | doit couvrir le contexte d'une intervention et sa conversation d'outils |
| `max_tokens` | 32 768 | |
| `enable_thinking` | `true` | |
| `thinking_budget_enabled` | `false` | pas de plafond sur la pensée |
| `mtp_enabled` | `true` | décodage spéculatif ; `Lightning MTP` au chargement |
| `qwen35_ane_prefill_enabled` | `false` | **indisponible**, pas un choix : le serveur réserve l'ANE aux architectures `qwen3_5`/`3_6`/`3_8` et refuse en HTTP 400 sur `qwen4_exp` |
| `force_sampling` | `true` | le serveur impose sa température, son `top_p` et son `top_k` ; ce que Pi envoie sur ce terrain est ignoré |
| `is_pinned` | `true` | |
| `ttl_seconds` | 1 800 | décharge après trente minutes d'inactivité ; 18,5 s de rechargement à la reprise |

**Avertissement, appris à la dure.** Poser `model_type_override: "llm"` sur ce modèle le rend
**inchargeable**. Son architecture `qwen4_exp` n'est connue que du chargeur VLM ; le chargeur texte
de mlx-lm la refuse (`Model type qwen4_exp not supported.`), l'échec est mis en cache et toute
requête suivante reçoit un HTTP 409. Le repli `falling back to VLM engine` que prévoit le code
n'opère que sur le chemin `force_lm` d'une requête, pas sur un override persistant. Le réglage LM
convient au 27B et à lui seul : il dépend de ce que le chargeur texte sait lire, et n'est pas
transposable. Pour réparer :

```bash
curl -s -X PUT -H "Authorization: Bearer $OMLX_KEY" -H "Content-Type: application/json" \
  -d '{"model_type_override":""}' \
  http://127.0.0.1:8000/admin/api/models/Qwen3.8-Flash-Next-MLX-oQ4-MTP/settings
```

Un changement de réglage de chargement efface l'échec en cache et rétablit la détection automatique.

**Contrainte de mémoire.** 79,53 Go estimés, pour un modèle complet annoncé à 110,82 Go. Sur une
machine de 128 Go, Metal est plafonné à 107,52 Go : ce modèle et le 27B **ne peuvent pas être
résidents ensemble**, et le serveur refuse le second en HTTP 507 en nommant le dépassement. Décharger
explicitement celui dont on ne se sert pas :

```bash
curl -s -X POST -H "Authorization: Bearer $OMLX_KEY" \
  http://127.0.0.1:8000/admin/api/models/Qwen3.8-27B-oQ8e-mtp/unload
```

**Un réglage modifié détache le profil.** oMLX compare les réglages au profil actif après chaque
mise à jour et met `active_profile_name` à `None` dès qu'un écart apparaît. Remettre la valeur
d'origine ne rattache pas le nom : il faut réappliquer le profil.

```bash
curl -s -X POST -H "Authorization: Bearer $OMLX_KEY" -H "Content-Type: application/json" -d '{}' \
  http://127.0.0.1:8000/admin/api/models/Qwen3.8-Flash-Next-MLX-oQ4-MTP/profiles/pi-flashnext-01/apply
```

## 3. Configuration côté Pi

Pi lit deux fichiers dans `~/.pi/agent/`.

### `models.json` — le fournisseur et le modèle

Ce modèle n'a **pas** de `model_alias` côté oMLX : Pi doit le nommer par son identifiant de
répertoire, exactement.

```json
{
  "providers": {
    "omlx": {
      "baseUrl": "http://127.0.0.1:8000/v1",
      "api": "openai-completions",
      "apiKey": "<auth.api_key de ~/.omlx/settings.json>",
      "authHeader": true,
      "models": [
        {
          "id": "Qwen3.8-Flash-Next-MLX-oQ4-MTP",
          "name": "Qwen3.8-Flash-Next-MLX-oQ4-MTP",
          "reasoning": true,
          "input": ["text"],
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 131072,
          "maxTokens": 32768
        }
      ]
    }
  }
}
```

`contextWindow` et `maxTokens` doivent concorder avec `max_context_window` et `max_tokens` côté
oMLX, sans quoi l'un des deux tronquera à l'insu de l'autre. Les coûts à zéro sont ce qui convient à
un modèle local.

### `settings.json` — le modèle par défaut

```json
{
  "defaultProvider": "omlx",
  "defaultModel": "Qwen3.8-Flash-Next-MLX-oQ4-MTP",
  "defaultThinkingLevel": "medium",
  "packages": ["../../Projets/495-pi-package"]
}
```

C'est `defaultProvider` / `defaultModel` que 495 reçoit : l'extension lit `ctx.model` et n'a aucun
réglage de modèle qui lui soit propre. `packages` charge le harnais depuis son `dist/`.

### Vérifier que la chaîne est complète

```bash
cd ~/Projets/495-workspace/cibles/<une-cible>
pi -ne -e ~/Projets/495-pi-package/src/extension/index.ts
```

puis `/495 status` dans le TUI. Le modèle effectivement employé apparaît dans la ligne
`Dernière intervention` du statut après la première intervention, et dans les traces du journal
oMLX.

## 4. Ce que 495 règle de son côté

Rien de ce qui précède ne vit dans 495. Ce que le harnais règle est ailleurs, dans
`<données>/config.json` : les budgets d'intervention et d'incrément. Le rythme du modèle les
détermine — 2,3 à 3,0 appels d'outils par minute mesurés sur le 27B —, et l'expérience du cycle
complet a montré que le budget qui cède en premier est `tool_calls_per_intervention`, resté à 100,
dont une préparation consomme 74 sur la demande la plus simple. Voir `QUALIFICATION.md`.

Un modèle deux fois plus rapide en lecture ne change pas ce plafond-là : il en raccourcit seulement
l'atteinte.
