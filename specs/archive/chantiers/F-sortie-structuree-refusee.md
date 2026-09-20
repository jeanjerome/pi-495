# Transverse F — une sortie structurée refusée, et le changement qui n'a plus d'issue

**État :** reprise corrigée et éprouvée en campagne ; le recours d'extraction perd un rapport complet
**Objet :** un rapport d'intervention qui ne valide pas son schéma bloque le changement sur
`configuration_error`, et aucune entrée Pi n'expose l'action que le noyau nomme lui-même
**Ne dépend d'aucun étage**

## Motif

Premier cycle conduit depuis Pi sur `~/Projets/495-workspace/cibles/node-demo` avec le modèle local :
l'intervention `specify` travaille 259,5 s, fait 4 appels d'outils, consomme 38 659 jetons connus et
se termine d'elle-même — événement terminal `completed`, `output_valid: false`. Le noyau lève
`CONFIGURATION_ERROR: specification intervention completed with an invalid structured output`, et le
changement est bloqué en phase `clarifying`, sans gate évalué et sans tentative consommée.

Trois constats distincts.

**Le rapport était presque complet.** Le texte refusé est conservé : la trace de l'intervention porte
`output.raw`, et l'export le rend adressable dans le CAS. On y lit un rapport de 7 314 caractères —
objectif, faits vérifiés dans l'arborescence, quatre exigences avec leurs critères, une conception
exécutable — dont le bloc de code annoncé `json`, écrit sur une seule ligne de 4 770 caractères,
s'arrête une accolade fermante trop tôt. `extractJsonOutput` ne trouve donc aucun bloc analysable, et
`normalizeOutput`, qui tolère déjà les manques d'un petit modèle, n'est jamais atteint.

**Le noyau nomme une action que personne ne peut déclencher.** L'erreur est déclarée réessayable et
porte `retry_specification` comme action suivante. Mais `resume` ne lève le blocage que pour
`execution_error`, et celle-ci est classée `configuration_error` : `/495 resume` rend en 1 s le même
état, à la même révision. Il ne reste qu'à ouvrir un autre changement.

**Ce qui reste vrai.** Le dossier de ce changement bloqué s'exporte et se vérifie
(`42 files, 370 991 bytes, 0 redactions, verify: ok`), et la liaison se retrouve par le répertoire
courant depuis une session Pi neuve.

## Prompt

```
Dans ~/Projets/495-pi-package, lis la campagne « node-demo avec le modèle local » de
specs/archive/QUALIFICATION.md, puis extractJsonOutput et normalizeOutput dans
src/contracts/v1/reports.ts, runIntervention dans src/application/harness.ts, et resume dans
la même classe.

Trois travaux, du plus sûr au plus discutable.

1. L'issue opératoire. Un blocage que le noyau déclare réessayable doit avoir une action
   atteignable depuis les entrées Pi, ou ne pas être déclaré réessayable. Décide lequel des
   deux, et écris-le : soit resume lève aussi configuration_error quand nextActions le dit,
   soit une commande reprend l'intervention refusée. Un test déterministe doit montrer qu'un
   changement bloqué sur une sortie invalide repart.

2. Le budget d'une reprise. Une intervention refaite consomme du temps et des jetons : dis où
   elle est comptée et ce qui la borne. max_technical_retries existe ; vérifie s'il s'applique
   ici, et sinon dis pourquoi.

3. La récupération d'un rapport tronqué. À décider, pas à supposer : un bloc JSON dont seules
   des accolades fermantes manquent peut être clos avant validation, ou refusé comme
   aujourd'hui. Une réparation silencieuse d'une sortie de producteur est une décision de
   confiance : si elle est retenue, elle doit être visible dans la trace et ne jamais inventer
   de contenu, seulement fermer une structure ouverte.

Critères d'acceptation :
- un changement bloqué sur une sortie structurée invalide a une issue exercée par un test ;
- ce que coûte une reprise est borné et compté ;
- toute tolérance sur un rapport tronqué est décidée par écrit, visible dans la trace, et
  couverte par un test qui montre ce qu'elle refuse encore ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Extraction et tolérance de la sortie | `src/contracts/v1/reports.ts`, `extractJsonOutput`, `normalizeOutput` |
| Refus de l'intervention de spécification | `src/application/harness.ts`, `stepClarify` |
| Classement du blocage | `src/application/harness.ts`, `advance` (catch) |
| Levée du blocage | `src/application/harness.ts`, `resume` |
| Trace conservée de l'intervention | dossier exporté, `objects/`, `output.raw` |

## Journal

**19 septembre 2026, nuit.** Campagne `~/.495-campagnes/java-flashnext-L2`, même cible et même modèle,
détaillée dans `../QUALIFICATION.md`. Le troisième rapport de spécification est refusé sur son schéma,
et le changement repart : le blocage porte `retryable: true` et nomme `retry_specification`,
`resume` émet `changeUnblock` — aucune intervention n'était `running`, donc rien d'autre ne pouvait
le faire —, et une nouvelle intervention `specify` démarre deux secondes plus tard. Soixante-douze
secondes entre le blocage et le redémarrage, là où le même refus perdait le changement. La mesure
que ce chantier attendait est faite.

Le dossier dit aussi **pourquoi** le rapport a été refusé, et la réponse déplace le constat. La
sortie conservée fait 16 825 caractères, sous le plafond, donc entière. Elle ne porte **aucun bloc
délimité** : dix lignes, zéro clôture — le modèle n'a pas posé le bloc `json` que l'instruction
demande. L'objet du rapport commence à l'offset 935 et se parse **jusqu'à la fin du texte** : il est
complet et valide. Le recours de `extractJsonOutput` s'ancre sur le dernier `{`, à l'offset 16 265,
qui tombe dans un sous-objet ; le parse échoue sur ce qui le suit, et le rapport entier est perdu.

Ce que cela change : la fiche tenait le recours pour inopérant sur un objet *tronqué*. Il perd aussi
un objet **intact**, pour la seule raison qu'il cherche par la fin. Un recours qui essaie les `{`
depuis le début du texte, et retient le premier dont le parse consomme le reste, rendrait ce rapport
sans rien inventer — ce n'est pas une tolérance sur une sortie malformée, c'est la lecture correcte
d'une sortie bien formée. La décision de ne pas refermer une structure ouverte (`D-38`) n'est pas en
cause et reste entière.

Reste non mesuré : la conservation des deux bouts. Cette occurrence tenait sous 20 000 caractères,
donc l'ancienne troncature aurait gardé le même texte ; la queue n'a pas encore servi sur un rapport
qui dépasse.

**19 septembre 2026, soir.** Correction, écrite en `D-38`. Un blocage dont le noyau a déclaré la
cause réessayable est levé par `resume`, quelle que soit sa classe d'arrêt : le blocage porte
désormais cette réessayabilité dans l'état projeté, son détail nomme les actions que l'erreur
portait, et la ligne d'état le dit — `blocked: configuration_error — … (next: retry_specification) —
resume retries it`. Le changement repart à la phase où il s'est arrêté et l'étape qui a levé
l'erreur est refaite. Une sortie refusée conserve ses deux bouts, 8 000 caractères de tête et
12 000 de queue, la coupe écrite dans le texte avec le nombre de caractères élidés. Un bloc JSON
tronqué n'est toujours pas refermé par le harnais, et le motif de ce refus est écrit : une structure
refermée valide sans que rien ne dise qu'elle est le rapport, comme le recours au dernier `{` l'a
déjà montré. Deux tests déterministes tiennent l'ensemble ; le premier échoue sur le comportement
d'avant — `resume` rend le même état bloqué et le changement ne repart pas.

Les trois travaux de la demande sont donc traités : l'issue opératoire existe et est exercée ; ce
que coûte une reprise est écrit — le budget d'incrément et les compteurs d'appels d'outils, sans
tentative consommée, `max_technical_retries` ne s'appliquant qu'aux opérations à effet externe ; et
la tolérance sur un rapport tronqué est décidée, en refus.

Ce qui reste : aucune campagne n'a été reconduite depuis, donc une reprise réelle après un rapport
refusé n'est pas mesurée, et la queue conservée n'a pas encore servi à diagnostiquer un refus sur un
dossier.

**19 septembre 2026.** Nouvelle occurrence, sur la cible Maven et le modèle `Flash-Next` : campagne
`~/.495-campagnes/java-flashnext-L`, cinquième rapport de spécification refusé après 17,3 min et
750 564 jetons, changement perdu en `configuration_error` après 55,5 min de budget d'incrément et
aucun gate franchi. Deux faits s'ajoutent au constat. Le modèle avait **fini normalement**
(`finish_reason=stop`, 5 876 jetons côté serveur) : le refus ne vient pas d'une coupure. Et le
dossier **ne peut pas dire pourquoi** : `worker-main.ts` ne conserve d'une sortie refusée que
`finalText.slice(0, 20_000)`, le rapport dépassait cette taille, et le motif d'un refus de schéma est
presque toujours dans la queue du texte — les neuf clés étaient présentes et bien formées dans la
tête conservée. Conserver la fin, ou les deux bouts, est la condition pour que ce chantier se
diagnostique depuis le dossier comme `QUALIFICATION.md` le prétend.

**18 septembre 2026, plus tard.** Un second modèle ne rencontre pas le mur. La même demande, sur la
même cible, conduite avec `Qwen3.8-Flash-Next-MLX-oQ4-MTP` : l'intervention `specify` rend un rapport
conforme au schéma `specification-report` au premier lancement, en 445 s et 27 appels d'outils. Un
seul essai ne renseigne pas sur la fréquence, mais il établit que le refus n'est pas une propriété du
harnais ni de la taille du rapport : il dépend du modèle qui l'écrit. Cette campagne est transcrite
dans `../QUALIFICATION.md`.

**18 septembre 2026.** Deux occurrences de plus, sur la cible Maven multi-module cette fois, pendant
le cycle réel que `chantiers/D` avait différé. Le constat n'a donc rien de propre à `node-demo` ni à
une longueur de rapport : sur trois lancements successifs, deux meurent avant tout gate sur un
rapport de spécification refusé, et le troisième passe. Les deux formes diffèrent, et la seconde
n'était pas connue.

**Un bloc annoncé `json` dont l'objet racine n'est jamais clos.** 332 s, 18 appels d'outils,
104 699 jetons connus ; le texte s'arrête à 7 002 caractères, `extractJsonOutput` ne trouve aucun
bloc analysable. C'est la forme déjà décrite ci-dessus.

**Un objet nu, non clos, dont le recours extrait un sous-objet.** 268 s, 16 appels d'outils,
77 498 jetons connus. Le rapport est en prose suivie d'un objet JSON sans aucune clôture de bloc, et
lui aussi arrêté en cours, à 6 910 caractères. Le recours de `extractJsonOutput` s'ancre sur le
**dernier** `{` du texte : sur un rapport qui porte des objets imbriqués, ce `{` tombe à l'intérieur
du rapport et non à sa racine. Ce qui atteint `normalizeOutput` puis `Value.Check` est donc l'objet
`design` — `summary`, `components`, `interfaces`, `risks` — analysé comme s'il était le rapport
entier, et refusé contre le schéma `specification-report`. L'erreur rendue dit « invalid structured
output » là où la cause est une troncature ; le recours a produit un objet valide au mauvais niveau.

Ce que cela ajoute à la fiche : le recours au dernier `{` n'est pas seulement inopérant sur un objet
tronqué, il peut rendre un sous-objet qui s'analyse, ce qui déplace le diagnostic. Et les deux
troncatures tombent à 6 910 et 7 002 caractères, assez près l'une de l'autre pour mériter d'être
mesurée avant d'être expliquée.

**17 septembre 2026.** Ouverture. Le constat vient de la première campagne réelle sur `node-demo` :
261 s de bout en bout, dont 260 s d'intervention, pour un changement bloqué avant tout gate. La même
cible sous agent scripté va jusqu'à G2 et s'y arrête pour une autre raison, traitée en `chantiers/E`.
