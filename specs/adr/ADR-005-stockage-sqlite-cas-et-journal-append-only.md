# ADR-005: Stockage SQLite, CAS et journal append-only

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Utiliser SQLite pour transactions et projections, un CAS SHA-256 pour les octets, et une chaîne d’empreintes pour les événements.

## Consequences

**Alternative rejetée :** Fichiers JSON mutables seuls, insuffisants pour concurrence, reprise et atomicité.

**Limite :** Pas de protection contre l’administrateur local hostile.
