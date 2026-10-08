# D-87: L'architecture d'une cible est une carte proposée par un modèle, adoptée par le propriétaire et vérifiée par les outils de sa technologie

**Status:** Acceptée (arbitrages du propriétaire, 2026-10-08) ; élargit `D-25`
**Date:** 2026-10-08

## Contexte

`ARC-01` demande un diagnostic de l'architecture réellement présente, comparée à l'architecture déclarée.
`D-25` ne retient comme architecture déclarée que ce que la cible écrit déjà : la direction de dépendance
de ses POM, la racine de paquets de chaque module, l'absence de cycle. Un projet d'un seul module, ou un
réacteur dont chaque module est organisé en couches ou en hexagone à l'intérieur, ne déclare rien de son
organisation : le noyau n'a rien à lui opposer que ses cycles.

Le propriétaire a demandé le 2026-10-08 que le diagnostic commence plus haut : identifier l'architecture
de l'application, puis vérifier avec les outils de sa technologie qu'elle est tenue. Les skills qu'il cite
(`architecture-blueprint-generator` d'`awesome-copilot`, `design-pattern-skill`) font identifier le style
par un modèle, sans règle de décision ni seuil, et ne vérifient rien avec un outil. Il a posé trois
conditions : un outil ajouté à un projet sert une vérification précise ; chaque vérification a ses outils
dans chaque technologie ; une architecture mixte est prise en compte, et l'ensemble doit être cohérent.

## Décision

1. **L'architecture d'une cible est une carte.** Elle découpe le projet en parties, chacune un module ou
   une branche de paquets. Chaque partie a un style et le rôle de chacun de ses paquets dans ce style. La
   carte dit enfin quelles parties peuvent dépendre de quelles autres. Les styles sont une liste fermée :
   - `layered` : des couches nommées, chacune avec les couches qui peuvent l'appeler ;
   - `onion` (hexagonal, clean architecture) : le modèle du domaine, les services du domaine, les services
     d'application et des adaptateurs nommés ;
   - `simple` : aucune organisation interne n'est revendiquée, seuls les cycles sont opposables ; une petite
     application peut garder une structure simple (`ARC-02`) ;
   - `other` : un style nommé (événementiel, pipeline…) dont seules les relations entre parties et l'absence
     de cycle sont vérifiées, ses règles internes étant un angle mort nommé.
2. **Un modèle propose la carte, en lecture seule, et chaque élément porte ses indices**, à leur fichier et
   à leur ligne dans la référence. Le noyau confronte la proposition à l'arbre avant de la présenter : un
   paquet nommé doit exister dans les sources, un indice doit désigner une ligne qui existe, et un paquet des
   sources qu'aucune partie ne couvre est nommé « sans partie ». La carte n'est pas un constat : `D-74`
   tient, et les constats viennent des contrôles exécutés.
   Le modèle reçoit une skill d'identification que 495 embarque, au format Agent Skills que Pi charge. Elle
   est adaptée de `architecture-blueprint-generator` (`github/awesome-copilot`, commit `caab1f62`, MIT) et de
   `design-pattern-review` (`sirius-zuo/design-pattern-skill`, commit `66d78158`, MIT), copiée à ces versions
   avec leur date et attribuée dans `NOTICE`. Elle donne les signes de reconnaissance de chaque style et
   demande la carte dans le format de 495, pas le document libre que les deux skills produisent. Aucune skill
   du projet analysé n'est chargée : ce serait une instruction venue de l'arbre (`D-11`).
3. **Le propriétaire adopte la carte, en demande une autre avec une remarque, ou laisse l'exigence en
   angle mort.** Adoptée, la carte est gelée dans le protocole avec la date de la décision, comme le
   référentiel de qualité. Elle devient l'architecture déclarée au sens de `D-25`, qu'elle élargit : une
   déclaration du propriétaire vaut celle d'un POM. Elle n'est jamais lue dans l'arbre analysé, et la changer
   demande une nouvelle adoption (`ARC-04`).
4. **Un outil n'est recommandé que pour une règle adoptée qu'il vérifie**, et la recommandation nomme ces
   règles. Les vérifications et leurs outils au 2026-10-08 :

   | Vérification | Maven | Node |
   |---|---|---|
   | Le style de chaque partie et les relations entre parties | ArchUnit 1.5.1 | dependency-cruiser 18.5.0 ou eslint-plugin-boundaries 7.2.0, à départager |
   | Les cycles entre paquets ou dossiers | ArchUnit ; le lecteur d'imports de 495 sans rien installer | dependency-cruiser |
   | Les dépendances déclarées sont celles que le code utilise | `dependency:analyze` de maven-dependency-plugin 3.11.0 | Knip 6.40.0 |

   Spring Modulith, jMolecules, Sheriff et Nx sont lus quand la cible les emploie déjà, comme une
   architecture qu'elle déclare elle-même, et ne sont jamais proposés : ils demandent de modifier le code,
   pas seulement d'ajouter un outil.
5. **La cohérence d'ensemble est ce que la vérification juge.** Chaque source appartient à une partie ;
   chaque partie respecte son style ; les parties ne dépendent les unes des autres que par les relations de
   la carte ; aucun cycle ne relie deux parties.

## Conséquences

L'epic `e11` se découpe en conséquence : proposer et adopter la carte d'une cible Maven, la vérifier avec
ArchUnit, comparer les dépendances déclarées aux POM à celles du code, puis la même chaîne pour Node, et
enfin la recommandation et la migration.

Les règles ArchUnit sont écrites par 495 dans chaque copie où le contrôle tourne, à partir de la carte
gelée, comme le jeu de règles de PMD (`e10s01`) : le producteur ne peut ni les lire dans l'arbre ni les
modifier. Le lecteur d'imports de 495 reste le contrôle qui oppose à un candidat les frontières de ses POM
(`ARC-04`).

Les deux skills servent aussi la suite de l'epic. La description des données, des préoccupations
transverses et du déploiement que la première produit entre dans l'état des lieux comme lecture du modèle,
distincte des constats. La revue de patterns de la seconde fonde la recommandation (`ARC-02`), et un
anti-pattern qu'elle relève et qui s'écrit en règle de dépendance est proposé comme règle de la carte, pour
être vérifié par un outil. Ni l'une ni l'autre ne couvre Node : sa part est à écrire.

Le 2026-09-30, dependency-cruiser 18.4.0 sous TypeScript 7 a analysé zéro module en sortant 0. Le choix de
l'outil Node attend la même mesure sur la version courante.
