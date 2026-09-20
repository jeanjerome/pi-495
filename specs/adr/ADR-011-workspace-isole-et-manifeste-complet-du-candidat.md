# ADR-011: Workspace isolé et manifeste complet du candidat

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Ne jamais laisser le worker écrire dans le dépôt original ; construire le candidat depuis un workspace et l’identifier par un manifeste de contenu complet.

## Consequences

Un `git diff` ou un nom de branche ne suffit pas ; les dépôts sales et sans `HEAD` restent supportés.
