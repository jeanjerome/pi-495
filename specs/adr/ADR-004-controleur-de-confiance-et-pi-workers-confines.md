# ADR-004: Contrôleur de confiance et Pi workers confinés

**Status:** Acceptée, sous qualification du backend
**Date:** 2026-09-16

## Decision

Garder l’extension et le noyau dans la zone de contrôle ; exécuter chaque intervention dans un processus enfant Pi SDK confiné, sans accès au stockage normatif.

## Consequences

Un import in-process ou une simple consigne de lecture seule ne constitue pas une isolation.
