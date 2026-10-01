---
name: typescript
description: TypeScript run by type stripping in the pi-495 tree
metadata:
  tags: typescript, type-stripping, erasable-syntax, configuration
---

# TypeScript in Node.js

## Type stripping is how this tree runs

Node 24 runs a `.ts` file directly by removing the type annotations; nothing is transpiled. Every
entry point of the tree is run this way: `node scripts/check-layers.ts`, `node cycle/src/main.ts`,
`node --test 'test/**/*.test.ts'`. There is no ts-node, no tsx, and no build before a test.

The build (`npm run build`, `tsc -p tsconfig.build.json`) exists only for `dist/`, which Pi loads
through `package.json` → `pi.extensions`. `dist/` is rebuilt from `src/`, never edited; the
`lint:distribution` gate of Preflight refuses a `dist/` that lags behind `src/`, a changed comment
included.

Type stripping validates nothing: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) is the type
check, and Preflight runs it.

## What type stripping refuses

Type stripping removes annotations and cannot transform code. `tsconfig.json` sets
`erasableSyntaxOnly`, so `tsc` refuses the same constructs at type-check time instead of letting
them fail at load time with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

### Type-only imports

`verbatimModuleSyntax` is on: a type imported as a value is an error.

```typescript
// GOOD
import type { CanonicalError, Phase } from "../contracts/v1/common.ts";
import { digestValue } from "../contracts/digest.ts";
import { candidate, type Evidence } from "../helpers/change-fixture.ts";

// BAD - a type in a value import
import { Phase, digestValue } from "./x.ts";
```

### No enums

```typescript
// BAD
enum Status { Active = "active", Inactive = "inactive" }

// GOOD - a const object and the union derived from it
const Status = { Active: "active", Inactive: "inactive" } as const;
type Status = (typeof Status)[keyof typeof Status];
```

A closed string union written out (`type DomainErrorCode = "INVALID_TRANSITION" | ...`, as in
`src/domain/errors.ts`) is the simpler form when the values are never iterated.

### No namespaces

```typescript
// BAD
namespace Utils { export function format(s: string): string { return s.trim(); } }

// GOOD - a module
export function format(s: string): string { return s.trim(); }
```

### No constructor parameter properties

```typescript
// BAD
class Worker { constructor(public name: string, private budget: number) {} }

// GOOD
class Worker {
	readonly name: string;
	private readonly budget: number;
	constructor(name: string, budget: number) {
		this.name = name;
		this.budget = budget;
	}
}
```

### No legacy decorators

Nothing in the tree uses decorators. Do not introduce them.

## File extensions

Every relative import carries the `.ts` extension. `allowImportingTsExtensions` accepts it at
type-check time; `rewriteRelativeImportExtensions` rewrites it to `.js` in `dist/`.

```typescript
// GOOD
import { lancerSession } from "./session.ts";
import type { Journal } from "./journal.ts";

// BAD - resolves in a bundler, not in Node
import { lancerSession } from "./session";
// BAD - the file on disk is .ts
import { lancerSession } from "./session.js";
```

## The compiler options that bite

The two configs are `tsconfig.json` (type check, includes `src/`, `test/`, `scripts/`, `cycle/`)
and `tsconfig.build.json` (emits `dist/` from `src/`). Read them before guessing a flag. The options
most often behind a type error:

| Option | Effect |
|---|---|
| `noUncheckedIndexedAccess` | `xs[i]` and `record[key]` are `T \| undefined`; narrow, or assert the invariant with `!` where it is known |
| `exactOptionalPropertyTypes` | `{ a?: string }` refuses `{ a: undefined }`; omit the key, or declare `a?: string \| undefined` on purpose |
| `verbatimModuleSyntax` | types go through `import type` |
| `erasableSyntaxOnly` | no enum, namespace, parameter property |
| `noImplicitOverride` | `override` on every overriding method |

`paths` maps `@xynogen/pix-pretty/*` to hand-written declarations under `types/pix-pretty/`,
because that package ships TypeScript sources and no build; the runtime still loads the package.

## TypeScript 7

The installed compiler is TypeScript 7, the Go port. `tsc` and the flags above are unchanged. The
`typescript` npm API is not the one of TypeScript 5: `createSourceFile` is absent, so the scripts
under `scripts/` read sources with regular expressions, and a gate written against the old API
would not load.

## Commands

```bash
npm run typecheck        # tsc --noEmit over the whole tree
npm run build            # dist/ from src/, before any npm run check
node scripts/x.ts        # a script, directly
node --test test/v2/foo.test.ts
```
