# La strate imposée est observée dans la requête, et concorde avec la déclaration

| | |
|---|---|
| Conduite le | 2026-09-23 (UTC), de 11:15 à 11:43 |
| Cible | `~/.495-campagnes/e23s04-cible` — arbre propre, commit `bac3d5b` |
| Demande | `/495 start greet doit rendre "Hello, <name>!" avec un point d'exclamation final` |
| Dossier distant | `~/.495-campagnes/e23s06-distant`, changement `chg_mue18zi38fb34c7ced`, `anthropic/claude-sonnet-5`, chemin d'abonnement |
| Dossier local | `~/.495-campagnes/e23s06-local`, changement `chg_mue0bl838bf2881f97`, `omlx/qwen3.8-27b-oq8e` |
| Contrôle négatif | `~/.495-campagnes/e23s06-negatif`, changement `chg_mue0g30t123dbc39c5`, `anthropic/qwen3.8-27b-oq8e`, servi par le modèle local |
| Extension | chargée depuis `dist/`, en mode print : `pi -ne -p --no-session -e dist/extension/index.js --model <modèle> "<demande>" < /dev/null` |
| Environnement | Node 24.21.0, Pi 0.87.0, empreinte `sha256:ede62b19…` pour les trois campagnes |
| Intégration | désactivée ; aucune campagne n'écrit dans la cible |

La story demande trois choses d'une exécution réelle. Le dossier porte, pour chaque intervention, ce
que le fournisseur a écrit autour des instructions de 495 dans la requête envoyée, marqué comme
observé. Sur le chemin d'abonnement, cette observation concorde avec la déclaration du manifeste.
Et l'observation sait ne pas concorder : un fournisseur déclaré, joint sans ce chemin, donne un
écart nommé.

Les trois campagnes se sont closes acceptées, avec G0 à G5 à `PASS` et une seule tentative chacune.

## Ce que chaque intervention porte au journal

La fin de chaque intervention, `intervention.finished`, porte la liste `imposed_layers`. Chaque
entrée associe ce que la requête a montré, `observed_in_request`, à sa comparaison avec le
manifeste, `compared_with_manifest`. Chaque intervention a envoyé plusieurs requêtes : ses appels
d'outils se comptent de 3 à 10. Chacune ne porte pourtant qu'une entrée, parce que toutes ses
requêtes ont montré la même chose.

| | distant | local | négatif |
|---|---|---|---|
| API lue | `anthropic-messages` | `openai-completions` | `openai-completions` |
| au-dessus de l'invite de l'hôte | « You are Claude Code, Anthropic's official CLI for Claude. » | rien | rien |
| au-dessous | rien | rien | rien |
| ajouté par l'hôte | la section `<cwd>` | la section `<cwd>` | la section `<cwd>` |
| comparaison | `agrees` | `agrees` | `disagrees` : `expected_not_observed`, avec la condition déclarée |
| interventions concernées | specify, prepare, implement | les trois mêmes | les trois mêmes |

Le résultat est le même pour les trois interventions de chaque campagne.

**Distant.** C'est le seul des trois dossiers où le fournisseur a réellement écrit son bloc. Le
texte relevé est celui que la table du domaine déclare, mot pour mot, et à la position qu'elle
déclare. Ce texte n'est pas redit par 495 : il est lu dans la requête que le fournisseur a construite.

**Local.** Le fournisseur n'impose rien, et le dossier le dit par une observation relevée et vide,
et non par une absence d'observation. L'attente est vide aussi, donc les deux concordent.

**Négatif.** Le manifeste attend le bloc, parce que le fournisseur retenu s'appelle `anthropic`. La
requête ne le porte pas, parce que ce fournisseur est joint sans le chemin d'abonnement. Le dossier
nomme l'écart et écrit la condition à côté : « the OAuth subscription path is used (an access token
prefixed sk-ant-oat) ». C'est la sur-déclaration que la story `e23s02` avait assumée faute
d'observation, et elle est désormais lisible. L'écart n'a rien arrêté : le changement est allé à son
verdict.

## Ce que l'hôte ajoute

Pi termine l'invite que 495 lui remet par une section qui nomme le répertoire de travail de la
session, en chemin absolu. Dans le dossier distant, pour la spécification, c'est :

```
<cwd>
/Users/<propriétaire>/.495-campagnes/e23s06-distant/workspaces/ws_mue18zij_1
</cwd>
```

Cette section part chez le fournisseur avec chaque requête, dans les trois campagnes. Ni la table,
ni le manifeste, ni le texte que le dossier garde comme remis au modèle ne la contenaient. Elle a
été trouvée à la première exécution sur un point d'accès de substitution, pas à la lecture. Pi
rapporte lui-même l'invite qu'il a composée, et c'est ce qui permet de l'attribuer à l'hôte plutôt
qu'au fournisseur.

## Ce qu'a coûté la campagne distante

Relu par `node scripts/measure-budgets.ts ~/.495-campagnes/e23s06-distant`, sortie 0 :

| intervention | appels | durée | jetons | coût |
|---|---|---|---|---|
| specify | 5 | 13,2 s | 12 152 | 0,0207 $ |
| prepare | 10 | 23,8 s | 44 905 | 0,0444 $ |
| implement | 3 | 7,6 s | 22 629 | 0,0177 $ |
| ensemble | 18 | 44,6 s | 79 686 | 0,0828 $ |

L'hôte calcule ce coût au tarif de son catalogue, et le dit employé par abonnement. Aucun montant
n'est lu sur une facture. Les deux autres campagnes n'ont rien coûté : leur modèle est local.

## Sécurité

Aucun jeton dans les trois dossiers : journal, fichiers de journal en attente, magasin d'objets et
exports. Les seules occurrences de `sk-ant-oat` sont le préfixe cité dans la condition déclarée :
trois dans le dossier distant (les manifestes), six dans le négatif (les manifestes, et les écarts
qui recopient la condition). Le contrôle négatif tourne sous une configuration de Pi isolée
(`PI_CODING_AGENT_DIR=~/.495-campagnes/e23s02-rev2-piconf`), qui ne touche pas celle du
propriétaire. Aucune commande de lancement ne porte de secret. L'observation ne garde de la requête
que les textes système : ni conversation, ni extrait du projet, ni résultat d'outil.

## Ce qui est feint

Le contrôle négatif. Son fournisseur s'appelle `anthropic`, mais il est servi par le modèle local,
en API `openai-completions`. Il établit que l'observation sait ne pas concorder, sur une vraie
exécution. Il n'établit rien du vrai fournisseur. C'est la campagne distante qui l'établit.

## Ce que ce relevé n'établit pas

- **Les formes de requête inconnues** n'ont pas été rencontrées en campagne. Elles sont couvertes
  par les tests : une API inconnue, une forme inattendue, une invite de l'hôte illisible, une session
  dont aucune requête n'atteint l'observateur.
- **Aucune réécriture du contexte** n'a eu lieu dans ces campagnes. Qu'une requête de résumé passe
  par l'accroche n'est donc établi ni par la lecture ni par l'exécution.
- **Le renommage des outils** que le fournisseur fait sur le chemin d'abonnement n'est pas inscrit.
- **La stabilité de l'accroche** au-delà de Pi 0.87.0. Pi la présente comme un outil de débogage. Sa
  disparition ferait échouer la vérification de types sur la version épinglée, et donnerait une
  observation manquante sur une autre version installée.

## Relecture

Le dossier se relit sans Pi, en lecture seule, depuis son journal :

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(`${dossier}/state.sqlite`, { readOnly: true });
for (const { payload } of db.prepare("SELECT payload FROM events ORDER BY sequence").all()) {
	const event = JSON.parse(payload);
	if (event.type === "intervention.finished") console.log(event.intervention_id, event.imposed_layers);
}
```
