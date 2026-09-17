# Étage 1 — VER-08 : exécuter les contrôles sur la référence

**État :** à faire
**Exigence :** VER-08 [P0], avec QLT-02 et VER-02 en dépendance amont
**Dépend de :** étage 0
**Porte :** le mécanisme commun aux étages 2, 3 et 4

## Motif

VER-08 demande trois choses distinctes : exécuter les contrôles pertinents sur la référence
initiale **et** sur le candidat dans des environnements comparables ; garder un défaut préexistant
visible sous une tolérance explicite qui interdit l'aggravation ; identifier un contrôle instable
et le traiter selon une règle préenregistrée, sans relances jusqu'au premier vert.

Aucune des trois n'existe. `runner.ts` n'exécute que le candidat et écrit
`baseline_state: "new"` en dur pour chaque constat ; les valeurs `preexisting`, `removed` et
`unknown` du contrat v1 ne sont jamais produites. Aucune notion d'instabilité n'apparaît dans les
sources : un contrôle qui alterne réussite et échec rend son dernier verdict.

C'est la conséquence qui compte pour la suite : **tous les étages au-dessus supposent ce
mécanisme**. Le contrôle de couverture différentielle, les constats structurels et les mutants
survivants se jugent sur le delta entre la référence et le candidat. Tant que les contrôles ne
tournent que d'un côté, chaque étage doit réinventer sa propre comparaison, ou se contenter de
déclarer tout constat comme introduit.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/ROADMAP.md (sections 1 et 5) puis VER-08 dans
docs/amont/expression-besoins.md.

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
- corrige la ligne VER-08 de docs/TRACEABILITY.md quand elle devient vraie ;
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

_À compléter._
