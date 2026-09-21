# D-37: Une réponse matérielle rouvre la spécification, et G1 refuse l'exigence qui l'ignore

**Status:** Acceptée

**Décision.** Trois mécanismes répondent à la réponse humaine sans effet, et ils ne portent pas le
même rôle.

1. **Le noyau rouvre la spécification.** `stepClarify` ne réemploie plus le rapport de diagnostic dès
   que toute question matérielle a une réponse. Il le réemploie quand le rapport *rend compte* des
   réponses : un rapport qui a posé une question et ne déclare rien de sa réponse est le rapport
   d'avant la décision, quel que soit son texte, et une nouvelle intervention `specify` est lancée
   avec les réponses dans la demande — le chemin `Answered questions:` qui existait déjà et que le
   parcours nominal n'atteignait jamais. **Ce qui borne la réouverture est la progression, pas un
   compte** : le rapport qu'une réouverture produit doit rendre compte d'une réponse que le
   précédent ne portait pas. Un rapport qui rend le même terrain n'est pas rouvert une fois de plus,
   il est refusé au point 2. La récurrence s'arrête d'elle-même : l'ensemble des réponses prises en
   compte croît strictement, il est borné par celui des réponses enregistrées, et celui-là ne grandit
   que lorsqu'un humain répond — chaque tour suspend le changement et l'attend.
2. **G1 refuse d'adopter des exigences qui n'emportent pas une réponse enregistrée.** Le document
   d'exigences porte désormais un bloc `answers` : pour chaque question matérielle répondue, la
   question et la réponse recopiées du journal, un booléen `observable` et les exigences qui la
   portent. G1 le confronte à `open_questions`, qu'il ne consultait jamais : une réponse absente,
   une réponse dont le texte diffère de la décision enregistrée, une réponse observable que ne porte
   aucune exigence, une réponse qui nomme une exigence absente du document, ou qui n'en nomme aucune
   d'obligatoire — G2 gèlerait alors un protocole sans obligation pour elle — sont des motifs de
   `FAIL`, nommant la question. Nommer une exigence non obligatoire de surcroît n'en est pas un.
3. **`artifact.revise` ne porte pas cette correction.** Le mécanisme existe et reste inutilisé ici.
   Réviser fidèlement une exigence à une réponse, c'est réécrire « un refus est exposé par un 400 »
   en « … par un 422 » : une phrase, que le noyau ne comprend pas et que personne ne relit. Une
   réécriture mécanique — substituer le texte de la réponse dans l'exigence — produirait un artefact
   dont rien ne garantit la cohérence, et la seule garantie de fidélité disponible reste celle du
   point 2 : la réponse est recopiée mot pour mot par le noyau, la liaison à une exigence est
   déclarée, et ce qui n'est pas déclaré arrête le changement. `artifact.revise` garde son emploi :
   rejouer l'aval quand un artefact déjà adopté change, ce qui n'arrive pas ici puisque toute
   réponse matérielle précède G0.

Le point 2 ne vaut pas seul : il arrête le changement sans rien corriger. Le point 1 corrige, le
point 2 garantit que ce qu'il n'a pas corrigé se voit, et le point 3 dit pourquoi le mécanisme déjà
écrit ne remplace ni l'un ni l'autre.

**`IH-02` est construite, pas retirée des gates.** `buildDecisionRequest` porte son texte en français
et en anglais — *adopter* / *refuser*, texte libre autorisé pour le motif du refus —, `requestDecision`
l'accepte, et `stepClarify` comme `stepSpecify` la demandent quand le gate rend
`request_decision:IH-02`. Le sujet présenté est l'artefact, à sa révision et à son empreinte ; un
refus bloque le changement en `policy_denied` avec son motif. Le motif du choix est celui du chantier
lui-même : le défaut corrigé ici est un jugement humain perdu entre le journal qui l'enregistre et
l'artefact qui lie le producteur, et supprimer le seul endroit où un humain peut lire cet artefact
avant qu'il ne lie irait exactement à contresens. `hasValidDecision` liait déjà l'adoption à
l'empreinte du contenu : une spécification refaite produit une empreinte nouvelle et redemande
l'adoption, au lieu d'hériter de l'approbation de celle qu'elle remplace.

**Ce qui vérifie la correction.** Une consigne sans contrôle est un vœu, et une décision humaine ne
fait pas exception. La chaîne est fermée par construction : une réponse observable nomme au moins une
exigence obligatoire ; G2 refuse tout protocole où une exigence obligatoire n'a pas d'obligation, et
toute obligation sans contrôle qualifié, sans décision humaine assignée et sans justification de
non-applicabilité ; la vérification exécute les contrôles de l'obligation sur le candidat gelé.
Réponse → exigence → obligation → contrôle, chaque maillon étant déjà refusé par un gate quand il
manque. La seule sortie est la non-applicabilité justifiée, que le protocole gelé porte en toutes
lettres et qui se relit dans le dossier. Ce qu'aucun gate ne peut faire est juger que
la phrase de l'exigence dit bien ce que la réponse disait : c'est le texte, et il est relu par la
seule `IH-02` quand la cible la demande.

**Une réponse qui ne porte aucun contrat observable** — « documente-le dans le README », « peu
importe » — est déclarée `observable: false` par la spécification : elle est recopiée dans le
document d'exigences, adoptée à G1, remise à chaque producteur avec l'artefact adopté, et ne lie
aucun contrôle. Le silence n'est pas cette déclaration : une réponse dont le rapport ne dit rien est
tenue pour observable et portée par rien, donc refusée (ADR-013, fail closed). Déclarer qu'une
réponse ne s'observe pas est un acte de la spécification, pas un oubli.

**Motif.** La campagne Flash-Next (`~/.495-campagnes/java-flashnext`, `chg_mu77jd604d4bf66034`) rend
`400` là où son propriétaire avait décidé `422`, en `accepted`, `G0…G5 PASS`, quatre contrôles verts.
L'unique intervention `specify` finit à 17:10:50.008Z ; `Q3` reçoit « 422 avec par exemple 'Name
cannot be longer than 50 characters' » à 17:13:37.203Z ; le mandat `mnd_mu77xww51dde0cf935` est adopté
à 17:14:43.022Z avec les quatre réponses mot pour mot, et un objectif qui dit dans le même artefact
« jusqu'à la frontière HTTP (400 + message) » ; huit millisecondes plus tard, G1 adopte
`rqs_mu77xwwg1fd4795496`, qui est le rapport de 17:10:50 inchangé — `R3` exige un `400`, l'hypothèse 2
retient `ValidationException → 400`, l'hypothèse 5 traite encore comme question ouverte ce que `Q1`
avait tranché à 17:11:52.958Z. La suite préparée assère `400` en égalité stricte, G2 la gèle comme
oracle, et le contrôle n'a pas manqué la décision : il exige son contraire. Le cycle du 27B
(`~/.495-campagnes/java-cycle-3`) prend le même chemin — réponse à 10:34:08.667Z, exigences adoptées
à 10:34:21.750Z, treize secondes, sans le cas de la mise à jour que la réponse venait d'ouvrir. Ce
n'est donc pas un incident de modèle : c'est le parcours nominal, sur deux modèles et deux cycles.

La condition `spec && open_questions.every((q) => !q.material || q.answer !== null)` réemployait le
rapport exactement lorsque toutes les réponses étaient là, c'est-à-dire exactement lorsqu'elles
auraient dû le rendre caduc ; la branche qui les réinjecte n'était prise que tant qu'une question
restait sans réponse, état dans lequel le changement n'avance pas. Le producteur n'était pas en
cause : il avait suivi l'exigence, qui est l'artefact liant.

La borne de progression n'est pas le premier choix : un plafond de deux réouvertures par changement
l'a précédé, et la campagne `~/.495-campagnes/java-flashnext-L` du 19 septembre 2026 l'a démenti.
Même modèle, même cible, même demande au mot près. La spécification pose **quatre** questions
matérielles, puis **deux** après les réponses, puis **deux** encore : chaque tour consomme de vraies
réponses — l'objectif porte « 422 » et « mise à jour » dès le deuxième rapport, `R3-contrat-http-400`
y disparaît au profit de `req-422-contract` —, chaque tour rétrécit les questions, et les durées
décroissent, 10 min 33 s, 9 min 34 s, 8 min 07 s. Un plafond compté d'avance arrêtait donc à G1 une
spécification qui convergeait. Le modèle a de surcroît corrigé seul une déclaration de son tour
précédent, passant `q-schema-alignment` d'`observable: true` portée par une exigence non obligatoire
— que G1 aurait refusée — à `observable: false` : c'est un tour de plus qui l'a permis.

Le marqueur retenu pour « ce rapport a-t-il été écrit avec la réponse » est une déclaration du
rapport, pas un horodatage. Comparer l'heure de la réponse à celle de la fin de l'intervention aurait
été plus direct et n'est pas testable : l'horloge des suites déterministes est figée, si bien qu'un
tel critère ne se distingue pas de son contraire sur le banc. Une déclaration se lit dans l'artefact
et se vérifie sur le dossier d'une campagne.

**Conséquence.** `SpecificationReport` porte `answers`, et `RequirementsDocument` aussi : deux
contrats changent, donc `npm run contracts` et une empreinte d'environnement nouvelle, qui invalide
un protocole gelé avant ce changement. Un rapport de spécification écrit avant ce changement ne
valide plus son schéma. L'instruction de rôle `specify` dit désormais ce qu'attend `answers` et que
le silence sur une réponse est refusé.

Une réponse matérielle coûte une seconde intervention `specify`, comptée là où la première l'était :
le budget d'incrément `increment_ms` et `tool_calls_total`, bornée par `intervention_ms` et
`tool_calls_per_intervention`, sans consommer de tentative — `attempts_used` ne bouge que pour
`implement`. Sur la campagne Flash-Next, la première spécification a coûté 7 min 24 s et 227 126
jetons connus sur les 77 min 56 s du changement, soit de l'ordre du dixième ; sur le 27B, 5 min 55 s.
C'est le prix de la fidélité au jugement humain, et il est payé une fois par tour de questions — trois
tours et 28 min 14 s des 120 du budget d'incrément sur la campagne `java-flashnext-L`, pour une cible
Maven que ce modèle explore en profondeur.

Le mécanisme a un coût qui s'accumule : chaque réouverture oblige le rapport à porter toutes les
réponses déjà déclarées et les exigences qu'elles engendrent, donc il grossit à chaque tour. Sur
`java-flashnext-L` le cinquième rapport atteint 17,3 min et 750 564 jetons — le double des précédents
— et sa sortie structurée est refusée, ce qui perd le changement (`chantiers/F`). La fidélité au
jugement humain se paie donc aussi en surface de rapport, et non seulement en minutes.

`open_questions` porte `answered_at`, recopié de l'événement `question.answered` : l'heure d'une
décision est désormais dans l'état projeté et non plus seulement dans le journal.
