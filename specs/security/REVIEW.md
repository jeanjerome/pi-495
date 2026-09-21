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
