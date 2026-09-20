# ADR-007: Protocole interprocessus JSONL corrélé

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Enveloppes JSONL sur stdio entre superviseur et workers, messages bornés, corrélation, idempotence, heartbeat et arrêt explicite.

## Consequences

**Alternative rejetée :** Serveur HTTP local permanent, qui agrandit inutilement la surface et le cycle de vie.
