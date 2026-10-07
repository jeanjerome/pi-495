---
name: typescript-magician
description: Resolves TypeScript compiler errors and finds the smallest type that compiles under the pi-495 tsconfig (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, TypeScript 7), through narrowing, discriminated unions and exhaustiveness, type guards, `as const` with `typeof` instead of enums, template-literal and branded identifiers, utility and mapped types, `infer`. Use when `npm run typecheck` fails, when a `!`, an `as` or an `any` is about to be written, when an identifier travels as a bare `string`, when a union needs exhaustiveness, or when a type must be derived from a value or from a TypeBox schema.
metadata:
  tags: typescript, types, generics, type-safety, pi-495
---

## Provenance

Adapted from the `typescript-magician` skill of mcollina/skills (MIT, commit 856efd2 of 2026-08-17;
the licence is in `../LICENSE-mcollina-skills`). The rules on chainable builders and on `ts-toolbelt`
deep inference were removed: the tree has neither and adds no type-level library.

## Instructions

When invoked:

1. Run `npm run typecheck` and read the error bottom-up before changing anything
   ([rules/error-diagnosis.md](rules/error-diagnosis.md)).
2. Name the cause: a missing narrowing, an index that may be `undefined`, an optional property given
   `undefined` explicitly, a type imported as a value, an enum or namespace refused by
   `erasableSyntaxOnly`, a generic without the constraint its call site needs.
3. Write the smallest type that compiles. One solution, not several. A union, a type guard or a
   `satisfies` does the job before a conditional or mapped type does; a type-level program is the
   last resort, not the first (`CONVENTIONS.md` § Principles, 5: the minimum code that solves the
   stated problem).
4. `any` never. `!` only to assert an invariant the type cannot see, at the point that knows it
   (Biome's `noNonNullAssertion` is off for that reason, and only that one). `as` only toward
   `unknown`, or at a boundary the value has just been validated through.
5. Run `npm run typecheck` again, then the tests of the generation touched.

Explain the cause in one sentence in the code only when the type is not self-evident; the rest goes
in the answer, not in a comment.

## What the tsconfig implies

| Option | What it means when writing a type |
|---|---|
| `noUncheckedIndexedAccess` | `xs[i]`, `record[key]` are `T \| undefined`: narrow with a check, `.at()`, or `!` where the invariant is known → [rules/type-narrowing.md](rules/type-narrowing.md), [rules/array-index-access.md](rules/array-index-access.md) |
| `exactOptionalPropertyTypes` | `{ a?: string }` refuses `{ a: undefined }`: omit the key, or declare `a?: string \| undefined` on purpose |
| `erasableSyntaxOnly` | a const object and `(typeof X)[keyof typeof X]`, or a written-out string union, instead of an enum → [rules/as-const-typeof.md](rules/as-const-typeof.md) |
| `verbatimModuleSyntax` | `import type` for every type |
| `strict` | an `unknown` at every boundary (JSON, a process's output, a Pi payload), narrowed by a guard before use |

## Patterns already in the tree

- **Contracts are TypeBox schemas** under `src/contracts/`; the type of a contract is
  `Static<typeof Schema>`, never a hand-written twin. `validate` and `check` in `src/contracts/`
  narrow an `unknown` to it. `npm run contracts` re-emits the JSON schemas after a change there.
- **Closed unions as codes**: `DomainErrorCode` is a written-out string union and `CATEGORY` a
  `Record<DomainErrorCode, ErrorCategory>`, so adding a code without its category does not compile.
  Exhaustiveness over such a union goes through a `switch` with a `never` default →
  [rules/type-narrowing.md](rules/type-narrowing.md).
- **Identifiers with a shape** are template-literal types (`` type Digest = `sha256:${string}` ``) →
  [rules/template-literal-types.md](rules/template-literal-types.md). An identifier that must not
  be confused with another `string` of the same shape is a branded type →
  [rules/opaque-types.md](rules/opaque-types.md).
- **Fakes implement ports**: a `Fake<Thing>` in `test/helpers/` implements the interface of
  `src/ports/`; a type error there usually means the port changed and the fake lags.
- **TypeScript 7** is the Go port: `tsc` and the flags are unchanged, the `typescript` npm API is
  not the TypeScript 5 one (`createSourceFile` is absent).

## Rules

### Core patterns
- [rules/as-const-typeof.md](rules/as-const-typeof.md) - Deriving types from runtime values with `as const` and `typeof`
- [rules/array-index-access.md](rules/array-index-access.md) - Element types through `[number]` indexing
- [rules/utility-types.md](rules/utility-types.md) - `Parameters`, `ReturnType`, `Awaited`, `Omit`, `Partial`, `Record`

### Generics
- [rules/generics-basics.md](rules/generics-basics.md) - Generic types, constraints, inference

### Type-level programming
- [rules/conditional-types.md](rules/conditional-types.md) - Conditional types
- [rules/infer-keyword.md](rules/infer-keyword.md) - Extracting types with `infer`
- [rules/template-literal-types.md](rules/template-literal-types.md) - String shapes at the type level
- [rules/mapped-types.md](rules/mapped-types.md) - Transforming the properties of a type

### Type safety
- [rules/opaque-types.md](rules/opaque-types.md) - Branded and opaque identifiers
- [rules/type-narrowing.md](rules/type-narrowing.md) - Narrowing, discriminated unions, exhaustiveness, guards
- [rules/function-overloads.md](rules/function-overloads.md) - Overloads for signatures a union cannot express

### Debugging
- [rules/error-diagnosis.md](rules/error-diagnosis.md) - Reading and isolating a compiler error
