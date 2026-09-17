# Transverse C — clôture du jalon L0

**État :** clos le 17 septembre 2026
**Objet :** les critères de sortie L0 restés ouverts alors que les incréments IT-0 à IT-4 sont livrés
**Ne dépend d'aucun étage**

## Motif

La conception technique §18 donne à IT-4 la sortie « parcours L0 complet et base du parcours L1 »,
et à IT-5 seulement la sortie « capacité L1 complète, seulement après exécution de V0 à V5 ».
Les incréments IT-0 à IT-5 sont livrés avec leurs tests, mais livrer les incréments n'est pas
franchir le jalon : L0 possède ses propres critères de sortie, qui ne sont pas remplis.

Ce qui reste ouvert, dispersé aujourd'hui dans `STATUS.md` :

- **Linux x86-64** : le backend `bwrap` est implémenté, jamais exécuté. `NFR-05` demande une
  portabilité qualifiée, et la conception technique exige la frontière d'exécution « qualifiée sur
  macOS arm64 et Linux x86-64 ». Tant que ce passage n'a pas eu lieu, une seule plateforme est
  revendiquable.
- **Mode RPC** : les chemins de code existent, aucun client RPC qualifié ne les a exercés. Le
  critère est « mêmes faits et mêmes verdicts dans les cinq entrées » ; quatre sont exercées.
- **Les dix lignes de risque** de la conception technique §16 doivent chacune posséder une décision
  argumentée et sa preuve. Plusieurs sont traitées par le code livré sans que la décision soit
  écrite ; d'autres, comme la divergence de l'ancien code Python, n'ont pas été instruites.
- **Les paramètres différés** : seuil du mode terminal étroit, pagination et budgets des grands
  fichiers, tous trois renvoyés à la qualification L0 par la spécification fonctionnelle.

Sans cette clôture, `STATUS.md` annonce un socle P0 dont le jalon technique qui le précède n'est
pas franchi.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/MILESTONES.md (jalon L0), puis la section 16 de
docs/amont/conception-technique.md et la section « Ce qui n'est pas qualifié » de
docs/STATUS.md.

Quatre travaux, indépendants.

1. Linux x86-64. Le backend bwrap de src/adapters/sandbox/backends.ts n'a jamais été exécuté.
   Exécute la campagne V1 sandbox et V4 sur une machine Linux, ou déclare explicitement que la
   plateforme n'est pas revendiquée et retire-la des sorties annoncées. Le refus fail closed
   quand une restriction requise ne peut être garantie est le point à éprouver en premier.

2. Mode RPC. Exerce un client RPC réel sur le parcours de référence et vérifie la concordance
   des faits et des verdicts avec TUI, JSON, print et SDK. UX-11 en dépend aussi : la
   concordance multicanale des données de revue n'est pas exercée en RPC.

3. Les dix risques de la section 16. Pour chacun, écris la décision de traitement retenue et
   nomme la preuve qui la soutient, ou ouvre le travail manquant. Une ligne dont le code
   contient déjà la réponse demande quand même sa décision écrite.

4. Les trois paramètres différés : seuil du mode terminal étroit, pagination et budgets des
   grands fichiers. Chacun doit recevoir son protocole, sa fixture et son critère de décision.

Critères d'acceptation :
- chaque ligne de la section 16 possède une décision et une preuve, ou un travail ouvert ;
- les trois paramètres différés sont fixés avec leur justification ;
- Linux est qualifié ou explicitement non revendiqué, sans état intermédiaire ;
- docs/MILESTONES.md et docs/STATUS.md reflètent l'état réel du jalon.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Risques et preuves attendues | `docs/amont/conception-technique.md` §16 |
| Sorties d'incrément | `docs/amont/conception-technique.md` §18 |
| Backend Linux | `src/adapters/sandbox/backends.ts`, `bwrap` |
| Paramètres différés | `docs/amont/specification-fonctionnelle.md`, table des seuils |
| État déclaré | `docs/STATUS.md`, `docs/MILESTONES.md` |

## Journal

**17 septembre 2026.** Les quatre travaux sont conduits ; le jalon est franchi avec une plateforme
et non deux.

**Linux x86-64 — non revendiqué.** La seule machine Linux disponible est un conteneur, où `bwrap`
ne crée d'espace de noms qu'en `--privileged`, c'est-à-dire dans un environnement qui a retiré la
frontière que la mesure devait constater ; et `MILESTONES.md` §7 rappelle qu'une campagne exécutée
une fois qualifie cette exécution, pas la combinaison. La plateforme n'est donc pas revendiquée
(`D-31`), sans état intermédiaire : `BubblewrapSandbox.qualify()` refuse sur toute machine et la
frontière refuse alors tout rôle confiné.

Le refus a été éprouvé par exécution avant d'être écrit, et l'exécution a trouvé un défaut : le
refus avait bien lieu, mais pour le mauvais motif. L'échec de `bwrap` était compté comme un verdict
du contrôle de la cible — « the runner exited with 1 without emitting a TAP summary » — là où rien
n'avait été mesuré. Un outil de confinement qui n'a pas démarré rend désormais un incident, par la
même fonction pour les deux backends (`D-32`).

**Mode RPC — et l'entrée SDK, qui ne l'était pas non plus.** `v3/pi-rpc-sdk` pilote un vrai
`pi --mode rpc` par un client JSONL conforme au cadrage du protocole, et un hôte SDK qui charge le
package par `createAgentSession`. Les quatre canaux structurés rendent la même empreinte de
candidat, les mêmes gates, les mêmes verdicts de preuve et le même instantané de revue, ce qui clôt
`UX-11`. Le dialogue de décision traverse le sous-protocole UI et reste refusé à un client qui ne
déclare pas d'identité. L'instruction a montré que Pi n'a que quatre modes d'extension : la
cinquième entrée est un chemin de chargement, pas un mode (`D-34`).

**Les dix risques.** [RISQUES-L0.md](../RISQUES-L0.md) porte, pour chaque ligne de la conception
technique §16, la décision retenue et la preuve qui la soutient. Cinq lignes sont traitées avec un
résiduel nommé, trois traitées, deux ouvertes : la provenance des extensions tierces de la session
hôte, dont l'inventaire n'existe pas, et l'ancien code Python, pour lequel la matrice de migration
est rendue mais laisse deux domaines abandonnés sans décision d'exigence.

**Les trois paramètres différés.** Fixés sur un corpus mesuré et figé (`D-33`,
`test/fixtures/review-corpus.ts`), chacun avec son critère vérifié par `v0/review-parameters`. Deux
constats en sont sortis : l'aide clavier de la revue perdait ses dernières actions dès qu'un
terminal était plus étroit que 123 colonnes, et un fichier plus long qu'une page n'était pas
atteignable au-delà de la première.
