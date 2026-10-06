# D-83: Les étapes portent les noms du cadrage à l'intégration, à l'écran comme dans les identifiants

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-06)
**Date:** 2026-10-06

## Contexte

Les étapes d'un changement se nomment aujourd'hui de trois façons qui ne coïncident pas. Le statut et le
rapport les appellent Mandate, Requirements, Checks frozen, Design, Candidate, Acceptance et
Integration (en français Mandat, Exigences, Contrôles gelés, Conception, Candidat, Acceptation,
Intégration). Le README dit « G2 — Verification » et `AGENTS.md` « Frozen verification protocol »,
« Isolated candidate », « Model-free checks ». Le pied de page, le JSON des modes RPC et print et le
journal montrent les identifiants de phase : `clarifying`, `specifying`, `verification_design`,
`designing`, `implementing`, `integrating`. Un utilisateur qui lit « Candidate » sur l'écran et
`implementing` dans le JSON ne sait pas qu'il s'agit de la même étape.

Deux mots désignent aussi un artefact : le mandat et les exigences sont ce que l'étape produit, pas
l'étape. `policy.adoption.mandate` dit qui adopte le mandat ; `mandate.json` et `requirements.json`
sont les contrats de ces artefacts.

## Décision

1. **Les sept étapes portent ces noms**, partout où une étape est nommée : statut, rapport, pied de
   page, documentation, corpus normatif.

   | Gate | Anglais | Français |
   |---|---|---|
   | G0 | Scoping | Cadrage |
   | G1 | Specification | Spécification |
   | G2 | Qualification | Qualification |
   | G3 | Design | Conception |
   | G4 | Implementation | Implémentation |
   | G5 | Acceptance | Acceptation |
   | G6 | Integration | Intégration |

2. **Les identifiants de phase qui désignent une étape en prennent le nom** :

   | Aujourd'hui | Désormais |
   |---|---|
   | `clarifying` | `scoping` |
   | `specifying` | `specification` |
   | `verification_design` | `qualification` |
   | `designing` | `design` |
   | `implementing` | `implementation` |
   | `integrating` | `integration` |

   Les phases qui sont une activité à l'intérieur d'une étape gardent leur nom : `intake` (cadrage),
   `preparing` (qualification), `verifying`, `reviewing` et `deciding` (acceptation), et `closed`. Les
   identifiants de gate `G0` à `G6` ne changent pas.
3. **Un artefact garde son nom.** Le mandat, les exigences, le protocole et la conception sont ce que
   les étapes produisent : leurs contrats (`mandate.json`, `requirements.json`, `protocol.json`,
   `design.json`) et les clés `policy.adoption.mandate`, `requirements` et `design` ne changent pas.
4. **Un dossier écrit avant reste lisible.** Les événements déjà enregistrés gardent leurs octets, donc
   leur chaîne d'empreintes : les anciens identifiants de phase sont traduits à la lecture, et seuls les
   nouveaux sont écrits.
5. Le pied de page et le statut nomment l'étape ; le statut garde, sous elle, l'activité en cours.

## Conséquences

Le contrat publié `contracts/v1` change ses valeurs de phase : un consommateur du JSON qui lisait
`specifying` lit `specification`. Le changement sort dans une version mineure de 0.x, dont les notes le
disent. Les dossiers exportés avant restent vérifiables par le vérificateur hors ligne.

Les décisions et les stories versées gardent leur vocabulaire : elles disent ce qui était vrai quand
elles ont été écrites.
