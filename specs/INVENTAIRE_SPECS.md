# Inventaire des specs — ce qui existe, à quoi ça sert, ce qui est encore écrit

**Rien n'a été retiré à ce jour.** 163 fichiers, environ 13 500 lignes. Ce document dit ce que
chaque endroit porte et qui le lit, pour que la question « a-t-on simplifié ? » ait une réponse
mesurable la prochaine fois.

## Ce qui est vivant — on y écrit

| Endroit | Volume | Porte | Lu par |
|---|---|---|---|
| `adr/` | 76 fichiers, 1 770 l. | Une décision par fichier, avec son motif daté et ses alternatives rejetées | l'humain, les sessions suivantes |
| `epics/` | 9 fichiers, 1 128 l. | Les stories et leurs tâches vérifiables | `check-story-format.ts` |
| `state.yaml` | 175 l. | Le handoff et les décisions ouvertes | la session suivante, à froid |
| `execution-status.yaml` | — | L'avancement réel des stories | l'humain |
| `release-plan.yaml`, `product/` | 252 l. | L'ordre des epics et le périmètre | l'humain |
| `tech-architecture/` | 6 fichiers, 156 l. | La pile, dérivée du code | l'humain |
| `verifications/`, `security/` | 12 fichiers, 1 208 l. | Les protocoles et le modèle de menace | l'humain |
| `references/` | 1 fichier, 317 l. | Une copie épinglée d'un document écrit ailleurs | `check-story-format.ts` |

## Ce qui est archivé — on n'y écrit plus, mais deux contrôles en dépendent

| Endroit | Volume | Porte | Lu par |
|---|---|---|---|
| `archive/amont/expression-besoins.md` | 1 525 l. | 85 exigences `[P0]` + 8 NFR | **`check-traceability.ts`** |
| `archive/amont/specification-fonctionnelle.md` | 1 274 l. | 24 parcours, 86 règles, 45 scénarios | — |
| `archive/amont/conception-technique.md` | 993 l. | Le catalogue des composants `CMP-*` | **`check-architecture.ts`** |
| `archive/amont/conception-verification.md` | 442 l. | La stratégie de vérification | — |
| `archive/amont/references-externes.md` | 207 l. | Les sources citées | — |
| `archive/chantiers/` | 20 fichiers, 2 913 l. | Le suivi d'implémentation antérieur | — |
| `archive/revues/` | 7 fichiers, 915 l. | Les six revues obligatoires | — |

Les deux documents en gras ne peuvent pas disparaître sans que le contrôle qui les lit perde son
pouvoir de refus.

**Le reste de l'archive n'est pas mort pour autant, et la mesure le dit :** aucun des 32 fichiers
de `archive/` n'est orphelin, chacun est cité par nom depuis ailleurs. `archive/chantiers/` porte
`K-clarte-des-prompts-et-skills-du-harnais.md`, sur lequel l'epic ouvert `e04` est adossé ;
`SCOPE_LATEST.yaml` cite `archive/chantiers/README.md` comme source de son format ; et
`TRACEABILITY.md`, que Preflight lit, pointe quatre fois dans `chantiers/` et `revues/`.
« Lu par aucun contrôle » n'est pas « inutile » : c'est seulement la différence entre ce qui refuse
et ce qui documente.

## Les 86 règles métier, jugées

C'est là que vous pensiez qu'il fallait faire le ménage. Voici ce que donne la lecture complète,
sous les trois questions.

| Question | Résultat |
|---|---|
| Dit ce que quelqu'un gagne, ou comment construire ? | **85 sur 86 disent l'acquis.** Seule `RM-062` prescrit un rendu — et `RM-063`, la ligne d'après, énonce l'acquis qu'elle sert. |
| Porte un chiffre qui périmera ? | **2 sur 86** : `RM-032` (trois tentatives), `RM-033` (deux relances). Les deux recopient une valeur configurable. |
| 495 le construit, ou Pi le fournit ? | **C'est ici que le ménage se trouve.** Une douzaine de règles décrivent une capacité que Pi livre déjà. |

Les règles ne sont donc pas mal écrites. Elles sont bien écrites sur un périmètre trop large : elles
obligent 495 à tenir des choses que son hôte tient déjà.

| Règles | Sujet | Ce que Pi livre |
|---|---|---|
| `RM-026` | La compaction préserve obligations et budgets | compaction conduite par Pi, `custom-compaction.ts`, `trigger-compact.ts`, `summarize.ts` |
| `RM-041`, `RM-042`, `RM-044` | Permissions minimales, effets externes autorisés | `permission-gate.ts`, `protected-paths.ts`, `confirm-destructive.ts` |
| `RM-045`, `RM-075` | Rien du dépôt cible n'est chargé automatiquement | confiance de projet documentée, `project-trust.ts` |
| `RM-046` | Le contenu affiché est rendu inerte | rendu du TUI de Pi |
| `RM-022` | Fournisseur et modèle explicites, aucun repli | `providers.md`, `models.md`, `custom-provider-*` |
| `RM-040`, `RM-037` | Aucune réponse ne vaut approbation | `question.ts`, `questionnaire.ts`, `timed-confirm.ts` |
| `RM-028`, `RM-029` | Délégation bornée, arrêt avec le parent | `subagent/` |
| `RM-021` | Schéma de sortie par intervention | `structured-output.ts` |

La règle reste vraie dans chaque cas. Ce qui change est qui la tient : 495 qui la réimplémente, ou
495 qui s'accroche à ce que Pi expose. `D-55` tranche pour la seconde.

## Ce qui a bougé, et ce qui n'a pas bougé

Retiré : une tâche d'`e23s02` qui vérifiait un contrôle superseded par l'accroche de Pi, et les deux
critères d'acceptation que ce contrôle seul satisfaisait. Le dépôt est stable et Preflight est vert.

Reste à faire : la douzaine de règles ci-dessus, à rendre à Pi une par une. L'archive, elle, ne se
supprime pas — la mesure des références entrantes l'a montré après coup, contre une première
affirmation qui n'avait pas été vérifiée.
