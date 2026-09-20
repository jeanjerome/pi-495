# ADR-008: SDK Pi dans les workers

**Status:** Acceptée pour prototype
**Date:** 2026-09-16

## Context

Outils, modèle, ressources et session sont configurables de manière typée sans exposer une nouvelle interface utilisateur.

## Decision

Créer les sessions workers avec le SDK Pi dans le processus confiné ; garder le mode RPC Pi comme repli interne à qualifier.
