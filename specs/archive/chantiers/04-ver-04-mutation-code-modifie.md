# Étage 4 — VER-04 : mutation sur les classes modifiées

**État :** livré pour une cible Maven déclarant PITest en XML à chemin stable
**Exigence :** VER-04 [P1], accessible au socle par le runner générique
**Dépend de :** étages 1 et 2

## Motif

La couverture répond à « cette ligne est-elle exercée ». Elle ne répond pas à « un test
remarquerait-il que cette ligne change ». La mutation est l'instrument de cette seconde question,
et c'est le seul étage que la couverture ne peut pas atteindre.

Deux règles de cadrage s'appliquent. L'orchestration générique de tests natifs relève du socle,
tandis qu'une intégration spécialisée à un outil de mutation vient ensuite : le travail passe donc
par le runner générique et un parser. Et un essai de mutation n'est pas déterministe par son seul
nom — seeds, environnement, résultats attendus et instabilité doivent être maîtrisés et
documentés.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/ROADMAP.md (sections 3 et 5) puis VER-04 dans
specs/archive/amont/expression-besoins.md, ainsi que le paragraphe sur les budgets des
contrôles coûteux (section 12 du même document).

Deux règles de cadrage à respecter :
- l'orchestration générique de tests natifs relève du socle ; un intégrateur dédié à un outil de
  mutation relève de la suite. Passe donc par le runner générique et un parser, pas par une
  intégration spécialisée ;
- « les essais de mutation ne sont pas déclarés déterministes par leur seul nom : seeds,
  environnement, résultats attendus et instabilité doivent être maîtrisés et documentés ».

La cible Maven a déjà PITest configuré : sortie XML, rapports non horodatés (chemin stable),
`mutationThreshold` par module. Scope les mutants aux classes modifiées par le candidat — les
chemins changés sont dans le manifeste, et `diffLines` donne les lignes.

Budget : un contrôle de mutation reçoit un budget propre. Si ce budget empêche de produire une
preuve obligatoire, le changement reste INDETERMINATE ; le seuil n'est jamais abaissé pour
terminer. Vérifie que ce chemin donne bien un incident, donc une reprise légitime, et non un
FAIL sur le candidat.

Critères d'acceptation :
- un mutant survivant sur une classe modifiée produit un constat localisé ;
- un mutant survivant sur une classe non touchée par le candidat ne fait pas échouer ;
- un dépassement de budget donne INDETERMINATE et non FAIL ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Frontière incident / verdict | `incidentOf` dans `parsers.ts` : seuls lancement, timeout et signal sont INDETERMINATE |
| Chemins modifiés | manifeste de candidat, entrées dont `baseline_state !== "unchanged"` |
| Budget par contrôle | `timeout_ms` de `ControlDefinition` ; budgets de politique dans `policy.budgets` |
| Configuration côté cible | PITest en XML non horodaté, seuil par module |
| Capteur livré | `adapters/execution/mutation.ts` : portée, lecture du XML, classement des statuts |
| Portée d'un lancement | `ControlDefinition.scope_argument`, `{classes}` substitué par le runner avant le bac à sable |
| Contrôle et témoins | `detectStack` dans `target.ts` : contrôle `mutation`, `readsMutationReport`, `mutationNegativeWitness` |
| Droits du lancement | `SandboxProfile.network = "loopback"` : boucle locale seule, aucun autre hôte |

## Journal

**Le runner générique et un parseur.** Le protocole gèle une commande Maven — `test-compile` puis
`org.pitest:pitest-maven:mutationCoverage` — que le runner lance comme n'importe quelle autre, et
`adapters/execution/mutation.ts` lit le rapport qu'elle laisse. Rien n'est intégré au moteur : ce
qui est natif ici, c'est la lecture d'un XML et la dérivation d'une portée depuis les déclarations
de paquet des sources. Le capteur rend ses constats dans l'enveloppe `Finding` commune, catégorie
`quality`, localisés au fichier, à la ligne, à l'opérateur et à la méthode.

**La portée vient du candidat, pas de la cible.** `ControlDefinition.scope_argument` est un argument
gelé dont `{classes}` est remplacé au lancement par les types que le sujet introduit —
`io.x.Greeter` et `io.x.Greeter$*`, le paquet lu dans la déclaration du fichier et non deviné depuis
son répertoire. Le calcul précède le lancement, et deux cas se décident sans rien exécuter : un
sujet qui n'introduit aucune classe ne lance rien, ce qui rend le passage de référence gratuit, et
un sujet dont les lignes n'ont pas été établies ne lance rien non plus — muter tout l'arbre n'est
jamais le repli. Le coût suit donc la taille du changement, pas celle de la cible. La portée sort des
lignes introduites plutôt que des chemins modifiés du manifeste : un fichier dont le candidat n'a
que retiré des lignes n'introduit rien qui puisse porter un mutant survivant, et le muter coûterait
sans jamais pouvoir bloquer.

**Ce qui bloque et ce qui ne bloque pas.** Un mutant survivant sur une ligne écrite par le candidat
est un constat bloquant, nommé avec son opérateur et sa méthode. Un mutant survivant sur une autre
ligne d'une classe modifiée est de la dette de cette classe : compté, nommé dans les notes, jamais
opposé au changement. Une classe que le candidat n'a pas touchée n'est pas mutée du tout, et un
mutant qui nommerait une classe hors portée est laissé de côté. Un mutant `NO_COVERAGE` porte sa
propre règle, distincte du survivant : ce que la suite n'exécute pas et ce qu'elle n'assertit pas ne
se corrigent pas de la même façon.

**Le déterminisme est établi, pas supposé.** La portée sort du manifeste et des lignes introduites,
toutes deux calculées depuis des octets adressés par contenu. La commande tourne hors ligne, sur un
seul fil, avec un chemin de rapport que la cible déclare non horodaté — la détection l'exige, et
l'absence de l'une des trois propriétés est nommée dans `capability_missing` plutôt que remplacée
par une convention. Un mutant que le moteur n'a pas su décider — erreur d'exécution, mémoire — est
compté comme indécis et laisse le contrôle `INDETERMINATE` s'il porte sur une ligne introduite ; un
mutant non viable est exclu et compté comme tel. Un mutant tué par expiration est lu comme détecté,
ce que le moteur en dit, et compté à part. Enfin la règle d'instabilité de VER-08 s'applique sans
exception : un contrôle de mutation qui échoue là où la référence passe paye une confirmation, donc
un second essai complet, avant que sa divergence soit opposée au candidat.

**Le budget et le seuil.** Le contrôle porte son `timeout_ms` propre, trente minutes, contre vingt
pour le contrôle de test et une pour la couverture. Un dépassement est un incident au sens de
`incidentOf` : `INDETERMINATE`, jamais `FAIL`, avec une note qui dit que la preuve due est manquante
et qu'aucun seuil n'est abaissé pour conclure sans elle. G5 place alors le changement en
`resolve_incident` — une reprise technique bornée — et non en `correct`, donc sans dépense de
tentative d'implémentation. Le `mutationThreshold` de la cible, lui, n'est pas la règle du contrôle :
c'est un ratio sur tout ce qui a été muté, il est nommé au dossier et n'est pas opposé au candidat
(D-28). Les `pom.xml` sont protégés, de sorte qu'abaisser ce seuil ou exclure un mutateur reste une
mutation du protocole refusée à G4.

**Les trois témoins.** Le témoin négatif partagé d'une cible Maven est un test qui échoue ; il ne
dit rien d'un mutant. Celui du contrôle de couverture non plus : une ligne que rien n'exécute est
l'autre question. Celui-ci lui est propre — une classe que la suite appelle sans rien assertir de
son résultat, dont les mutants sont atteints par un test et tués par aucun. Le témoin positif est la
classe que la suite assertit, dont tous les mutants meurent. Les six fichiers témoins ont été
déplacés dans le paquet `witness495` : un moteur de mutation restreint par défaut les tests qu'il
exécute aux paquets de l'arbre de test, et un témoin hors de tout paquet n'était jamais exécuté
(D-30).

**Un profil d'isolation pour les outils qui se parlent.** Le moteur lance des JVM ouvrières et leur
parle par socket, ce que `(deny network*)` refuse. `SandboxProfile.network` prend donc une troisième
valeur, `loopback`, qui ouvre la boucle locale et rien d'autre ; `v1/sandbox` le vérifie en se
connectant à soi-même puis ailleurs (D-29). C'est la seule extension de droits de cet étage.

**Obligation et coût.** Le contrôle rejoint toutes les obligations, comme la couverture et les
frontières : une exigence dont une ligne peut être modifiée sans qu'un test s'en aperçoive n'est pas
démontrée par une suite restée verte. C'est aussi le mécanisme par lequel un budget épuisé laisse le
changement indéterminé — l'obligation n'est pas remplie, et rien ne la remplit à moindre prix. Sur
la cible de recette, la qualification et un essai scopé à deux classes coûtent environ huit secondes
au total, une JVM de contrôle et une JVM ouvrière par mutant.

**Portée.** La cible Maven déclarant PITest hors profil, avec XML dans ses formats de sortie et des
rapports non horodatés. De VER-04, ce qui est livré est l'angle mutation ; les profils de propriétés,
de fuzzing, de contrats, de tests différentiels et métamorphiques restent absents, et l'activation
selon le risque du changement n'existe pas — c'est la configuration de la cible qui active le
contrôle, pour tous ses changements. La stack Node n'a pas de capteur de mutation.

**Limites connues.** La portée ne couvre que les sources `.java` : un module Kotlin ou Scala compilé
dans la même JVM n'est pas scopé, donc pas muté. Le nom de la classe est celui du fichier, ce qui
laisse hors portée un type déclaré dans un fichier d'un autre nom. Les mutateurs appliqués sont ceux
que la cible configure ; leurs exclusions et le seuil vivent dans les `pom.xml`, protégés mais non
relus par le contrôle, qui enregistre en revanche l'histogramme des statuts observés. Un mutant
équivalent — que rien ne peut tuer — reste un constat bloquant : il est nommé avec son opérateur et
sa ligne pour qu'un humain le reconnaisse, mais aucune liste d'exclusion justifiée n'est gelée avec
le protocole, alors que VER-04 la demande quand applicable. Enfin le rapport est lu à un chemin
stable : si un build échouait après qu'un rapport y a été écrit, c'est ce rapport qui serait lu.
