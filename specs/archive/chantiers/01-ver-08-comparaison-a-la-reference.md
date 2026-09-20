# Étage 1 — VER-08 : exécuter les contrôles sur la référence

**État :** livré
**Exigence :** VER-08 [P0], avec QLT-02 et VER-02 en dépendance amont
**Dépend de :** étage 0
**Porte :** le mécanisme commun aux étages 2, 3 et 4

## Motif

VER-08 demande trois choses distinctes : exécuter les contrôles pertinents sur la référence
initiale **et** sur le candidat dans des environnements comparables ; garder un défaut préexistant
visible sous une tolérance explicite qui interdit l'aggravation ; identifier un contrôle instable
et le traiter selon une règle préenregistrée, sans relances jusqu'au premier vert.

Aucune des trois n'existait. `runner.ts` n'exécutait que le candidat et écrivait
`baseline_state: "new"` en dur pour chaque constat ; les valeurs `preexisting`, `removed` et
`unknown` du contrat v1 n'étaient jamais produites. Aucune notion d'instabilité n'apparaissait dans
les sources : un contrôle qui alternait réussite et échec rendait son dernier verdict.

C'est la conséquence qui compte pour la suite : **tous les étages au-dessus supposent ce
mécanisme**. Le contrôle de couverture différentielle, les constats structurels et les mutants
survivants se jugent sur le delta entre la référence et le candidat. Tant que les contrôles ne
tournaient que d'un côté, chaque étage devait réinventer sa propre comparaison, ou se contenter de
déclarer tout constat comme introduit.

## Prompt

```
Dans ~/Projets/495-pi-package, lis specs/archive/ROADMAP.md (sections 1 et 5) puis VER-08 dans
specs/archive/amont/expression-besoins.md.

VER-08 demande d'exécuter les contrôles pertinents sur la référence initiale et sur le candidat
dans des environnements comparables, de garder visible un défaut préexistant sous une tolérance
explicite interdisant l'aggravation, et de traiter un contrôle instable par une règle
préenregistrée plutôt que par des relances.

État actuel : src/adapters/execution/runner.ts n'exécute que le candidat et écrit
baseline_state: "new" en dur. BASELINE_STATES (src/contracts/v1/evidence.ts) déclare
new/preexisting/removed/unknown ; trois de ces quatre valeurs sont mortes.

Trois travaux, dans cet ordre.

1. Exécution sur la référence. L'instantané de référence est déjà dans le CAS et le workspace
   sait le matérialiser (src/adapters/workspace/). Le protocole gelé porte
   environment_digest : la comparabilité des environnements est donc déjà exprimable. Décide
   si le passage sur la référence est mémorisé par (control_id, reference_id,
   environment_digest) pour ne pas le refaire à chaque tentative — une référence ne change
   pas pendant un changement.

2. Classement des constats. Renseigne baseline_state en comparant les constats de la référence
   et ceux du candidat. L'empreinte de constat existe déjà (Finding.fingerprint) ; détermine si
   elle suffit à apparier un constat qui a seulement changé de ligne, et corrige-la sinon —
   QLT-04 exige explicitement que déplacements et renommages ne masquent pas une dette.

3. Politique d'instabilité. Un contrôle dont les deux passages divergent sans cause de candidat
   est instable. La règle doit être préenregistrée dans le protocole, pas décidée après coup, et
   son issue est INDETERMINATE conservé, jamais une relance jusqu'au vert. Attention à la
   frontière existante : incidentOf dans parsers.ts ne rend INDETERMINATE que pour lancement,
   timeout et signal.

PARSER_IDS et ControlDefinition sont dans src/contracts/v1/protocol.ts ; après modification,
lance npm run contracts. Ne mène pas ce travail pendant qu'un cycle tourne : environment_digest
couvre le digest de l'arbre exécuté.

Critères d'acceptation :
- une fixture portant un défaut ancien et un défaut nouveau produit deux constats distincts ;
  seul le nouveau bloque ;
- un renommage de fichier ne transforme pas un constat préexistant en constat introduit ;
- un contrôle alternant réussite et échec reste INDETERMINATE et n'est pas relancé ;
- corrige la ligne VER-08 de specs/archive/TRACEABILITY.md quand elle devient vraie ;
- npm run check passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Constat écrit en dur | `runner.ts`, `baseline_state: "new"` |
| Valeurs du contrat | `BASELINE_STATES` dans `src/contracts/v1/evidence.ts` |
| Empreinte de constat | `Finding.fingerprint` |
| Frontière incident / verdict | `incidentOf` dans `parsers.ts` |
| Comparabilité d'environnement | `environment_digest` du protocole et de la preuve |
| Matérialisation de la référence | `src/adapters/workspace/`, instantané dans le CAS |

## Journal

**Exécution sur la référence.** `harness.referencePasses` reconstruit un workspace depuis
l'instantané de référence avant la première exécution sur le candidat, y exécute chaque contrôle du
protocole gelé, écrit le résultat au journal comme preuve à part entière — `subject.kind =
"reference"`, `facts.run = "reference"`, constats marqués `preexisting` — puis supprime le
workspace. Le passage est relu au lieu d'être refait tant que le contrôle, la référence, l'empreinte
d'environnement et la révision du protocole sont les mêmes : la clé est portée par `inputs_digest`,
qui digère déjà commande, répertoire, environnement du contrôle et arbre observé. Une référence ne
changeant pas pendant un changement, les tentatives qui suivent un refus ne paient rien de ce
côté-là. Le passage de référence n'entre pas dans `state.evidence` : le reducer refuse à juste titre
une preuve dont le sujet n'est pas le candidat gelé, et cette garde reste intacte.

**Classement des constats.** `Finding.fingerprint` ne suffisait pas : le message d'un outil porte le
chemin absolu du workspace exécuté et la ligne du défaut, si bien que le même défaut observé des deux
côtés donnait deux empreintes. Le runner retire désormais le chemin du workspace, extrait `path` et
`region` du message et empreinte l'outil, la règle, le symbole, le chemin relatif et le texte privé
de sa localisation. L'appariement se fait en trois passes — identité exacte, renommage prouvé par le
manifeste, déplacement sans ambiguïté vers un fichier que le candidat ne porte plus — et un
appariement ambigu n'est jamais deviné. `baseline_state` prend ses quatre valeurs : `new`,
`preexisting`, `removed` pour un défaut que le candidat a supprimé, `unknown` quand aucun passage de
référence n'est disponible. Un constat de référence non apparié devient `removed` plutôt que de
disparaître, de sorte qu'un renommage ne peut ni créer une dette ni en effacer une (QLT-04).

**Politique d'instabilité.** `Protocol.baseline` gèle la tolérance et la règle avant toute
exécution. Un contrôle qui échoue sur le candidat là où la référence passe paye une confirmation sur
le même candidat, bornée par `max_confirmations` ; si les deux réponses divergent, le verdict est
`INDETERMINATE` conservé, `limits.unstable` est vrai, les constats cessent de bloquer et
`retryCanDiffer` refuse la relance technique. La frontière de `incidentOf` n'a pas bougé : lancement,
timeout et signal restent la seule source d'`INDETERMINATE` du côté du parseur, et l'instabilité est
décidée au-dessus, par comparaison de deux passages.

**Portée actuelle.** G2 exige qu'un contrôle qualifié passe sur la référence — son témoin positif
doit rendre `PASS`. Il en découle qu'aucun contrôle qualifié ne porte aujourd'hui de constat sur la
référence, donc qu'aucun constat n'est classé `preexisting` dans un cycle complet : le classement y
fonctionne, mais toujours avec une référence vierge. La tolérance se déclenchera avec les analyseurs
des étages 2 et 3, qui rapportent des constats sans faire échouer leur contrôle. Lever cette
frontière pour un contrôle qui échoue déjà sur la référence relèverait de la règle de qualification
(VER-05, PRE-03) : il faudrait que la discrimination soit établie par un constat que le témoin
négatif ajoute, et non plus par un témoin positif vert. Ce n'est pas fait ici.

**Coût.** La première vérification d'un changement matérialise un workspace de plus et exécute
chaque contrôle une fois de plus ; les tentatives suivantes relisent. Un contrôle qui échoue là où la
référence passe coûte une exécution supplémentaire avant qu'une tentative de correction ne soit
dépensée sur lui. `max_confirmations: 0` retire cette dépense et, avec elle, la détection de
l'alternance.
