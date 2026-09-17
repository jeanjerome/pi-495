# Étage 3 — ARC-04 : contraindre par l'architecture active

**État :** livré pour une cible Maven multi-module ; ARC-01 partiellement, ARC-02 et ARC-03 absentes
**Exigence :** ARC-04 [P0], avec ARC-01 et CON-03 en dépendance amont et ARC-05 [P1] en aval
**Dépend de :** étage 1

## Motif

ARC-04 : « une architecture adoptée ne doit pas rester seulement une consigne dans le contexte ».
Une conception transmise au producteur dans son contexte n'est qu'une instruction, donc soumise à
la même inférence que le code produit. Tant qu'aucun contrôle ne l'observe, elle n'est pas
opposable.

Sa recette : un candidat fonctionnel plaçant une responsabilité dans un module interdit échoue au
contrôle prévu ; un changement volontaire de frontière exige une révision architecturale adoptée.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/ROADMAP.md (sections 1 et 4) puis ARC-01 à ARC-04 dans
docs/amont/expression-besoins.md.

ARC-04 : « une architecture adoptée ne doit pas rester seulement une consigne dans le contexte ».
Recette : un candidat fonctionnel plaçant une responsabilité dans un module interdit échoue au
contrôle prévu.

Ajoute des constats structurels — frontières, cycles, dépendances interdites — dans l'enveloppe
`Finding` existante (src/contracts/v1/evidence.ts, catégorie "structure" déjà prévue), produits
par un adaptateur d'analyse natif à l'écosystème et exécutés par le runner générique. Le
registre de références a tranché : adaptateurs natifs par écosystème, enveloppe de constat
commune, pas de moteur sémantique universel.

Précédent interne : scripts/check-layers.ts applique déjà une règle de frontières au dépôt 495
lui-même. La cible ~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture est
hexagonale : `domain` ne doit dépendre ni de `infrastructure` ni d'un framework — une première
règle naturelle et vérifiable.

Comme à l'étage 2, les constats se jugent sur le delta ; le classement préexistant / introduit
vient de l'étage 1 : une violation préexistante est tolérée et nommée, une violation introduite
est refusée.

Critères d'acceptation :
- un candidat introduisant un import de `infrastructure` dans `domain` échoue avec la
  localisation exacte ;
- un cycle préexistant n'échoue pas mais apparaît en constat `preexisting` ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Règle gelée | `StructureRule` dans `src/contracts/v1/protocol.ts`, portée par `ControlDefinition.structure_rules` |
| Adaptateur natif | `src/adapters/execution/structure.ts`, parseur `java-imports` du runner générique |
| Dérivation des règles | `structureRules`, `pomIdentity`, `packageRootOf` dans `src/application/target.ts` |
| Constat | catégorie `"structure"` de `FINDING_CATEGORIES`, localisation par `Region` |
| Frontières transmises au producteur | `ContextInput.boundaries` dans `src/application/context.ts` |
| Précédent interne | `scripts/check-layers.ts`, règle d'imports entre couches de 495 |
| Doctrine multi-langage | `docs/amont/references-externes.md` § 5 : adaptateurs natifs, enveloppe commune |

## Journal

**Où vit la règle.** Pas dans l'arbre. Une règle d'architecture posée dans un fichier du dépôt est
un fichier que le producteur peut éditer, et une frontière que son auteur peut déplacer n'est pas
une frontière. `StructureRule` est donc un champ du contrat `ControlDefinition` : les règles sont
gelées avec le protocole à G2, au même titre que la tolérance de baseline et la règle d'instabilité.
Le producteur en reçoit l'énoncé dans son contexte (`ContextInput.boundaries`) et jamais la
définition ; les déplacer suppose une autre révision du protocole, ce qui est exactement ce que la
recette d'ARC-04 demande d'un changement volontaire de frontière.

**D'où viennent les règles.** D'aucune convention de style. Chacune reprend une déclaration que la
cible a déjà faite :

| Règle | Ce que la cible déclare |
| --- | --- |
| `structure:module-boundary:A->B` | le POM de `A` ne déclare pas `B` en dépendance, et `B` dispose ses sources sous une racine de paquet à lui |
| `structure:framework-independence:M` | `M` ne dépend d'aucun autre module du réacteur et les autres s'appuient sur lui : un framework importé là est un framework qu'ils portent tous |
| `structure:package-cycle` | deux paquets qui s'importent l'un l'autre sont un seul paquet |

`pomIdentity` neutralise `<parent>`, `<dependencyManagement>`, `<build>`, `<profiles>` et
`<reporting>` avant de lire les dépendances : une dépendance qui n'existe que sous un profil activé
n'est pas une dépendance que le réacteur garantit — la lecture est celle que `bindsJacocoReport`
applique déjà au rapport de couverture. `packageRootOf` descend sous `src/main/java` tant que le
répertoire ne contient qu'un sous-répertoire et rien d'autre : `io/scalastic/demo/domain` est ce que
le module dispose, sans qu'aucun fichier ne soit lu. Deux modules rangés sous la même racine, ou sous
des racines imbriquées, ne peuvent pas être distingués par un import : aucune règle n'est produite et
l'insuffisance est inscrite dans `capability_missing`, où PRE-01 range déjà ce que les contrôles de
la cible ne savent pas décider.

**Ce que l'adaptateur lit.** Les déclarations `package` et `import` des sources sous les portées que
les règles nomment. Rien d'autre : pas de compilation, pas de résolution de type, pas de build. Un
import est rattaché au plus long paquet que l'arbre déclare et qu'il prolonge — c'est la seule façon
de placer un import statique ou une classe imbriquée, dont l'orthographe ne dit pas où s'arrête le
paquet. Le graphe de paquets qui en découle donne les cycles par composantes fortement connexes.
C'est un analyseur natif à l'écosystème Java derrière l'enveloppe `Finding` commune, conformément à
ce que le registre de références a tranché : pas de moteur sémantique universel.

**Ce qui bloque et ce qui est seulement nommé.** Toute violation est un constat `blocker`, où qu'elle
se trouve : c'est la comparaison à la référence qui distingue l'héritée de l'introduite, et elle a
besoin que les deux passages disent la même chose du même défaut. Ce que la portée des lignes
introduites décide, c'est le verdict du passage : un arbre dont les seules violations étaient déjà là
n'est pas l'échec de ce candidat. Sans cette distinction le contrôle serait inqualifiable sur toute
cible portant la moindre dette — son témoin positif s'exécute sur la référence, et G2 exige qu'il
passe. La conséquence est celle qu'on attend : un import d'`infrastructure` introduit dans `domain`
échoue, localisé au fichier et à la ligne ; un cycle préexistant laisse le contrôle vert et apparaît
au dossier en `preexisting`.

**Le cycle est nommé là où le candidat l'a fermé.** Parmi les arêtes internes à une composante, celle
qui porte le constat est une arête introduite s'il y en a une, sinon la première dans l'ordre des
chemins. Deux passages sur un cycle que personne n'a touché pointent ainsi le même import et se
correspondent par empreinte ; un candidat qui ferme le cycle est nommé à l'import qu'il a écrit.

**Les trois témoins.** Le témoin négatif partagé de la cible Maven est un test qui échoue ; il ne dit
rien d'une frontière. Celui de ce contrôle est une source du module scopé qui importe exactement ce
que ce module déclare ne pas dépendre — un fichier qui ne compile nulle part, ce qui n'a aucune
importance pour un capteur qui lit des déclarations. Il rejoint `own_negative_witness` aux côtés de
celui de la couverture. Le témoin positif reste la référence et les fichiers du témoin partagé :
ils n'introduisent aucune violation, donc le capteur passe.

**Une tolérance élargie.** `verdictUnderTolerance` ne dépendait que du cas où les deux passages
échouent. Un capteur qui juge les lignes introduites passe sur la référence, qui n'introduit rien,
tout en nommant ce qu'il y trouve : la règle est donc formulée sur ce qu'elle visait déjà — un
contrôle qui n'échoue sur rien que la référence ne porte déjà ne bloque pas. Un échec qui ne nomme
aucun constat reste un échec, et un passage de référence `INDETERMINATE` n'est toujours pas une
tolérance. Le passage de confirmation suit la même correction : la divergence à payer est celle que
la tolérance a laissée debout.

**Obligation et coût.** Le contrôle rejoint toutes les obligations, comme la couverture
différentielle : une responsabilité placée dans un module interdit n'est pas démontrée par une suite
restée verte, et une amélioration ailleurs ne la compense pas. Il est déclaré après le contrôle de
test, qui reste le premier du protocole — c'est celui que la préparation exécute. Le coût est la
lecture des déclarations de l'arbre : 19 sources et 12 paquets sur la cible réelle, quelques
dizaines de millisecondes, et rien de plus côté référence.

**Portée.** La cible Maven multi-module. Ce qui est livré d'ARC-01 est la partie observable de son
diagnostic — modules, dépendances, cycles, frontières, avec localisation dans le code ; la
comparaison entre architecture déclarée et architecture réalisée, les angles morts et les liens
découverts par configuration dynamique n'y sont pas. ARC-02 (préconiser une architecture),
ARC-03 (migration progressive avec contrats de transition et exceptions bornées) et ARC-05 (suivi de
la dérive) restent absentes. La stack Node n'a pas d'adaptateur structurel : ses frontières ne sont
déclarées nulle part dans le projet, alors que `check-layers.ts` porte celles de 495 lui-même.

**Limites connues.** La liste des familles de framework est gelée dans l'adaptateur de cible, pas
adoptée par la cible : un module qui en importe déjà une garde le constat en `preexisting`, mais
c'est un jugement que le projet n'a pas énoncé. Les déclarations sont lues ligne à ligne : un
`import` écrit dans un bloc de texte serait compté, ce qui ne change aucun verdict mais ajouterait un
constat. Un import réfléchi par nom de classe, un service chargé dynamiquement ou une frontière
passant par la configuration ne sont pas vus — c'est précisément ce qu'ARC-01 demande de marquer
avec sa méthode d'observation, et ce marquage n'existe pas. Enfin, `src/test/java` est hors de toute
portée : le test d'un module peut importer ce que son code de production ne doit pas, et rien ici ne
l'observe.
