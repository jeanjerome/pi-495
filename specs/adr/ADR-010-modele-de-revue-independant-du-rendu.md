# ADR-010: Modèle de revue indépendant du rendu

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Produire un `ReviewSnapshot` paginé commun ; rendre un composant deux panneaux en TUI et des projections structurées ailleurs.

## Consequences

`ctx.ui.custom()` est utilisé uniquement en TUI ; l’overlay expérimental est exclu de P0.
