# ADR-018: Les sessions Pi ne sont pas le journal 495

**Status:** Acceptée
**Date:** 2026-09-16

## Context

Compaction, fork, resume et arborescence Pi ont une sémantique différente du workflow 495.

## Decision

Utiliser les sessions Pi pour conversation et UX, mais persister l’état normatif dans `CMP-EVD`.

## Consequences

Toute liaison session-programme est réversible et reconstruisible.
