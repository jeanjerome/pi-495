# Transverse F — une sortie structurée refusée, et le changement qui n'a plus d'issue

**État :** ouvert
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
docs/QUALIFICATION.md, puis extractJsonOutput et normalizeOutput dans
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
