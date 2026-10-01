---
name: modules
description: ES modules and the import rules of the pi-495 tree
metadata:
  tags: modules, esm, imports, exports, layers
---

# Modules

## ESM only

`package.json` declares `"type": "module"`. There is no CommonJS in the tree and no `require`.
`import.meta.dirname` and `import.meta.filename` replace `__dirname` and `__filename`.

## Named exports, and only what is read

```typescript
// GOOD
export function lancerSession(demande: Demande, journal: Journal): Promise<Session> { /* ... */ }

// AVOID
export default function lancerSession() { /* ... */ }
```

`scripts/check-exports.ts` (Preflight, `lint:exports`) refuses a `function` or `const` export that
no other `.ts` of `src/`, `test/` or `scripts/` mentions: an export nobody reads is a contract nobody
holds the module to. Export when another module needs the name; otherwise keep it local.

## Extensions

Every relative import carries `.ts` (see [typescript.md](./typescript.md)); JSON is imported with
`with { type: "json" }`.

## Imports follow the layers

```
domain/ → ports/ → application/ → adapters/ → presentation/, export/
```

A module imports from its own layer or from one listed before it, never after.
`scripts/check-layers.ts` refuses the reverse direction and `scripts/check-architecture.ts` refuses
an import cycle. Only `extension/` and `adapters/pi-worker/` import an `@earendil-works` Pi package.

Imports are grouped by layer, in that order; Biome's import sorting is off for that reason, so do not
reorder them alphabetically.

## Dynamic imports

A dynamic `import()` defers a module until the moment it is needed: `extension/` loads the review
text renderer and a Pi widget on demand, the worker under `adapters/pi-worker/` loads Pi lazily.
It is still an import for the layer checks: the module it names must respect the direction above.
