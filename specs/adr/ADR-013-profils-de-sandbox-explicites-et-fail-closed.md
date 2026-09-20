# ADR-013: Profils de sandbox explicites et fail closed

**Status:** Acceptée ; backend à sélectionner en L0
**Date:** 2026-09-16

## Decision

Exprimer les permissions indépendamment de la plateforme, qualifier un backend macOS arm64 et Linux x86-64, refuser l’opération lorsqu’une restriction requise ne peut être appliquée.

## Consequences

Aucun fallback silencieux vers un processus non confiné.
