# ADR-003: Noyau hexagonal et déterministe

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Fonctions pures et ports ; aucune API Pi ou I/O dans le domaine. Pas de bibliothèque de machine à états en P0 : transitions explicites, tables et tests de propriétés.

## Consequences

Les gates sont testables sans modèle ni Pi ; toute commodité d’adaptateur reste extérieure.
