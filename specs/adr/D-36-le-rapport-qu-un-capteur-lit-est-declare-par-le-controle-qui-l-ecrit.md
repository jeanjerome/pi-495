# D-36: Le rapport qu'un capteur lit est déclaré par le contrôle qui l'écrit

**Status:** Acceptée

**Décision.** `ControlDefinition` porte deux listes de noms de rapports : `provides`, ce que le
contrôle laisse dans le workspace, et `requires`, ce qu'il lit sans le produire. `mvn test` déclare
`surefire-reports` et, quand le POM lie `jacoco:report` hors profil, `jacoco-report` ; le capteur de
couverture déclare `requires: ["jacoco-report"]` et ne produit rien. `domain/controls.ts` en dérive
l'ordre — tri topologique, stable sur l'ordre d'arrivée, cycles nommés au lieu d'être arbitrés — et
`stepVerificationDesign` s'en sert deux fois : il exécute les producteurs d'un capteur dans chacun
de ses workspaces de témoin avant de le qualifier, et il gèle les contrôles dans cet ordre, que la
vérification suit ensuite.

**Motif.** Un capteur qui ne mesure rien de son cru n'est interrogeable que là où le contrôle
producteur a tourné. Son témoin positif trouvait le rapport par accident — le workspace positif
avait servi à qualifier le producteur juste avant —, son témoin négatif propre recevait un workspace
neuf, et la mesure absente y était rendue `INDETERMINATE`, ce qui est le bon verdict pour une mesure
qui manque et le mauvais pour un témoin négatif. Aucune cible Maven liant JaCoCo hors profil ne
dépassait donc G2, tandis qu'une cible qui ne lie pas JaCoCo n'a pas de contrôle `coverage` du tout
et passait : l'incitation était inversée.

L'autre forme envisagée — exécuter, avant chaque capteur, tous les contrôles qui le précèdent dans
le protocole — coûte moins de contrat et ne dit rien. Elle fait porter la dépendance par un rang
dans un tableau : rien n'énonce que le capteur de couverture attend `mvn test` plutôt que le
contrôle qui se trouve au-dessus de lui, et déplacer une ligne de l'adaptateur changerait
silencieusement ce qui est qualifié. `pi-lens` répond à la même question sur ses producteurs de
faits, chaque `FactProvider` déclarant ses clés `provides` / `requires` et `dispatch/` les ordonnant
topologiquement ; la transposition est directe et met la dépendance dans le protocole gelé, où elle
se relit.

Le départage entre contrôles que rien ne sépare est l'ordre d'arrivée, pas l'ordre alphabétique de
`pi-lens`. Ce qui distingue deux contrôles indépendants est leur coût — la mutation dépense trente
minutes là où un capteur structurel en dépense deux — et seul l'adaptateur qui les propose le sait ;
l'ordre alphabétique paierait le premier avant de savoir ce que répond le second. Le protocole gelé
portant à la fois les déclarations et les contrôles dans cet ordre, il se redérive de lui seul.

**Conséquence.** Le contrat change, donc `npm run contracts` et un `environment_digest` nouveau : un
protocole gelé avant ce changement est invalidé. La qualification d'un capteur à rapport coûte
désormais l'exécution de ses producteurs dans ses deux workspaces de témoin — sur la cible Maven,
deux `mvn test` de plus, du même ordre que les 5,5 s et 2,5 s que les témoins de `maven-test`
mesurent. `sensorDigest` intègre `requires` : changer ce qu'un capteur lit fait tomber la
réutilisation de sa qualification, ce qui est le comportement attendu puisque ses témoins ne
répondraient plus la même chose. Un cycle de rapports déclaré par deux contrôles est un
`configuration_error` nommé, jamais un ordre arbitraire.
