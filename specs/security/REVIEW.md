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
