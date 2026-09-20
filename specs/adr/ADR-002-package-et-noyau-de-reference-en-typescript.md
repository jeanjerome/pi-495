# ADR-002: Package et noyau de référence en TypeScript

**Status:** Acceptée pour L0/L1
**Date:** 2026-09-16

## Context

Installation unique avec Pi, contrats partagés et accès direct aux API publiques Pi.

## Decision

Implémenter extension, services et noyau en TypeScript, sans dépendance runtime Python.

## Consequences

Le code Python existant sert de référence de comportement et de source de tests ; sa reprise est incrémentale, pas une traduction aveugle.
