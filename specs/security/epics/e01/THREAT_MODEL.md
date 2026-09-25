# Modèle de menace — e01, une réponse humaine atteint les exigences

| | |
|---|---|
| Périmètre | la capsule `specs/epics/e01-reponse-humaine-atteint-les-exigences/epic.yaml`, cinq stories, avant toute ligne de code |
| Conduit le | 2026-09-25, étape 0 de `build-epic` |
| Révision lue | `02e86ef` (`main`) |
| Niveau de risque de l'epic | **moyen** — aucune entrée réseau, aucun secret, aucun chemin de fichier nouveau ; l'enjeu est l'intégrité des décisions humaines |

## Ce que l'epic protège

Le bien protégé n'est pas une donnée confidentielle. C'est l'**autorité d'une décision humaine** sur
ce que le changement doit faire. Elle a trois propriétés :

- **Provenance.** Seul un humain qualifié répond, clôt ou révoque. Un modèle, un appel d'outil ou un
  mode non interactif ne le peut pas.
- **Effet.** Une réponse enregistrée atteint l'artefact que la gate adopte, puis le protocole gelé
  et les contrôles. Le défaut d'origine de `chantiers/L` est une atteinte à cette propriété.
- **Réversibilité bornée.** Une révocation défait ce qui a été adopté sur la foi de la réponse, et
  rien d'autre. Elle ne rend adopté rien de ce qui ne l'était pas.

Aucune de ces propriétés ne relève d'une catégorie classique (injection, SSRF, désérialisation).
Les catégories retenues ci-dessous sont celles du contournement d'autorité (`CWE-285`, `CWE-863`) et
de l'intégrité d'état (`CWE-841`, séquence de flux non imposée).

## Surfaces, établies dans le code

| Surface | Emplacement | Qui l'atteint | Contrôle existant |
| --- | --- | --- | --- |
| Rapport de spécification (sortie de modèle, non fiable) | `src/application/phases/clarify.ts`, `specify.ts` ; `src/domain/change/state.ts` | le modèle de l'intervention `specify` | schéma de sortie ; `gateG1` (`decide.ts:399`) |
| Réponse à une décision | `decisionAnswer`, `decide.ts:1203` | `/495` en TUI ou en RPC qualifié | provenance vérifiée sur trois axes : `actor_type` humain, origine dans `HUMAN_ORIGINS`, authentification autre que `none` ; refus explicite de `model_output` et `tool_call` ; révision et empreinte du sujet |
| Réponse à une question | `questionAnswer`, `decide.ts:270` | le harnais, après une décision IH-01 | provenance vérifiée **seulement** quand aucun `human_decision_id` n'est fourni |
| Révocation | `decisionRevoke`, `decide.ts:1310` | **personne** aujourd'hui : aucun appelant hors du domaine | provenance vérifiée sur un seul axe, l'origine |
| Outil conversationnel | `src/extension/tool.ts` | le modèle de la session Pi | surface fermée : ni réponse, ni adoption, ni décision (ADR-009) |
| Identité en RPC | `session.ts:124`, variable `HARNESS495_RPC_HUMAN_ACTOR` | quiconque contrôle l'environnement du processus Pi | aucune au-delà de la présence de la variable ; hors du périmètre de l'epic |

## Menaces

### M1 — Le modèle soustrait une réponse humaine à toute obligation en la déclarant non observable

**Confiance 9/10. Gravité haute pour l'intégrité. Couverte par e01s03, sur décision du propriétaire du 2026-09-25.**

`gateG1` saute toute vérification de liaison pour une réponse que le rapport déclare
`observable: false` (`decide.ts:426`, `if (!a.observable) continue;`). Cette déclaration vient du
rapport, donc du modèle. Une réponse « 422 » déclarée non observable est recopiée au document
d'exigences, adoptée à G1, et ne lie aucune obligation ni aucun contrôle. Le changement peut alors
être accepté en rendant `400`, ce qui est exactement le défaut que l'epic existe pour fermer.

Ce n'est pas théorique. D-37 rapporte, sur `~/.495-campagnes/java-flashnext-L`, un modèle qui fait
passer `q-schema-alignment` d'une liaison que G1 aurait refusée à `observable: false`, et le compte
comme un progrès. Le modèle a trouvé seul la sortie la moins coûteuse.

Seul le relit IH-02, quand la politique d'une cible demande l'adoption humaine des exigences. Par
défaut (`policy.adoption.requirements: "kernel"`, `src/domain/policy.ts:88`), personne ne le relit.

e01s03 introduit un chemin humain pour dire qu'une question n'est plus matérielle. La déclaration du
modèle devient alors un second chemin, non authentifié, vers le même effet. CONVENTIONS § Review,
règle 2 : on supprime un second point d'entrée plutôt que de le garder.

**Atténuation retenue.** Une réponse humaine ne cesse de lier que par une décision humaine. Le
rapport peut *proposer* qu'une réponse ne fixe rien d'observable ; la proposition ouvre la clôture
d'e01s03 au lieu de passer G1 seule, et G1 ne dispense une réponse de toute exigence que sur la
confirmation humaine. Un test déterministe tient qu'un rapport déclarant « 422 » non observable ne
passe plus G1 sans elle, et échoue sur le code d'avant.

### M2 — Un rapport défait une liaison et le changement s'arrête sans recours

**Confiance 10/10. Gravité moyenne. Couverte par e01s01 et e01s02.**

Ce n'est pas une fuite d'autorité : G1 refuse, en fermé. C'est un déni de service sur le changement.
Il est reproduit sur `java-flashnext-L2`, événements 190 à 195. L'atténuation est l'objet même des
deux stories. Contrainte de conception : le refus de G1 doit rester fermé. Le recours relance ou
arrête ; il n'adopte jamais un document qui perd une réponse.

### M3 — Une révocation ou une clôture émise par autre chose qu'un humain qualifié

**Confiance 8/10 pour l'écart. Gravité haute si atteint. À tenir par e01s03 et e01s04.**

`decisionRevoke` ne vérifie que l'origine de l'acteur. `decisionAnswer` en vérifie trois : le type
d'acteur, l'origine et le niveau d'authentification, et refuse explicitement `model_output` et
`tool_call`. Rendre la révocation atteignable sans aligner ces deux contrôles ouvrirait le premier
chemin où une vérification plus faible décide d'un effet humain.

Contraintes :

- une clôture et une révocation passent par la même vérification de provenance que
  `decisionAnswer`, écrite une seule fois et appelée par les trois ;
- ni l'une ni l'autre n'apparaît dans l'outil `harness495` ; un test l'épingle, comme ADR-009 le fait
  pour les décisions ;
- en mode `print` ou `json`, l'origine n'est pas humaine (`command.ts:67`) : l'une et l'autre y sont
  refusées en le disant, et non ignorées.

### M4 — Une réponse liée à une décision que rien ne vérifie

**Confiance 6/10. Sous le seuil, consignée parce qu'e01s04 s'appuie dessus.**

`questionAnswer` n'exige une provenance humaine que si aucun `human_decision_id` n'est fourni ; il ne
vérifie pas que l'identifiant désigne une décision IH-01 valide, non révoquée, pour cette question.
Aucun appelant non fiable n'émet aujourd'hui cette commande : seul le harnais l'émet, après une
décision validée. Mais la révocation d'e01s04 remonte de la décision à la réponse. Si le lien n'est
pas garanti à l'écriture, la révocation peut défaire la mauvaise réponse ou n'en défaire aucune.
e01s04 vérifie le lien à l'écriture plutôt que de le supposer à la lecture.

### M5 — Une révocation qui ne défait pas tout ce qui en dépend

**Confiance 9/10 pour l'état actuel. Gravité haute pour l'intégrité. Objet d'e01s04.**

Aujourd'hui l'invalidation `authorization_revoked` ne retire aucune gate pour IH-01
(`src/domain/invalidation.ts:137`). La question reste répondue dans `open_questions`. Le mandat et
les exigences adoptés sur la foi de la réponse restent adoptés. Une révocation branchée telle quelle
serait donc enregistrée au dossier, afficherait « révoquée » au rapport (`report.ts:129`), et
n'aurait aucun effet. Le dossier affirmerait une chose que l'état contredit.

Contraintes : fermer en cas de doute. Une révocation d'IH-01 retire au moins G0 et tout ce qui suit,
ramène le changement en clarification, et rouvre la question. Le rapport ne dit « révoquée » que
d'une révocation dont l'effet est tenu.

### M6 — Une décision prise pendant qu'une intervention tourne, ou depuis une seconde session

**Confiance 7/10. Sous le seuil, consignée comme contrainte de conception.**

Une révocation ou une clôture pendant une intervention `specify` laisse un rapport écrit sur la foi
de l'ancienne réponse. Et aucun bail n'est pris (`chantiers/M`, e09) : deux sessions Pi peuvent
conduire le même changement. Aujourd'hui le conflit de révision bloque le changement au lieu de
refuser le second conducteur. e01s04 refuse une révocation tant qu'une intervention tourne, ou
invalide explicitement son résultat. Elle ne présume pas d'un verrou qu'e09 n'a pas encore posé.

### M7 — Le coût des relances

**Confiance 8/10 pour le fait. Gravité faible.**

Chaque reprise d'e01s02 relance une intervention facturée ou longue. Elle est déclenchée par un
humain, et la borne de progression ne s'applique pas à une relance humaine. Le budget de tentatives
écrit dans `config.json` n'atteint aucun changement (`BUG-2026-09-23T155707`, ouvert) : il ne bornera
donc rien ici. L'atténuation est humaine : chaque relance est demandée, et e01s03 offre une issue qui
ne coûte aucune intervention.

## Hors de portée

- **Le texte des réponses remis au modèle.** `specificationObjective` porte les réponses dans la
  demande de spécification. C'est du texte humain, remis au modèle que l'humain a choisi, par le
  canal qu'il a admis (D-61) : ce n'est pas une frontière de confiance.
- **L'identité RPC déclarée par variable d'environnement.** Elle précède l'epic et ne change pas ;
  qui contrôle l'environnement de Pi contrôle déjà la session.
- **Les secrets.** L'epic n'en lit, n'en écrit et n'en transmet aucun. Les relevés de campagne
  d'e01s05 citent le dossier, comme ceux d'e25s04, sans adresse de fournisseur ni jeton.

## Ce que chaque story reprend

| Story | Menaces | Porte `security:` proposée |
| --- | --- | --- |
| e01s01 | M2 | low |
| e01s02 | M2, M7 | medium |
| e01s03 | M1, M3 | high |
| e01s04 | M3, M4, M5, M6 | high |
| e01s05 | toutes, par exécution réelle ; contrôle négatif de M3 : une révocation tentée par l'outil ou en mode `print` est refusée | medium |

## Décision

**M1 est couverte par e01s03**, sur décision du propriétaire du 2026-09-25. C'était la seule menace
de ce modèle qui permettait encore, après l'epic, d'accepter un changement contraire à la décision
de son propriétaire. e01s03 passe de 3 à 5 BCP, l'epic de 21 à 23.
