# ADR-015: Intégration Git en deux temps et réconciliable

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Préparer et enregistrer l’effet, appliquer le candidat exact, observer la destination puis confirmer G6.

## Consequences

Destination avancée ou panne après effet entraîne revalidation ou réconciliation ; aucun push implicite.
