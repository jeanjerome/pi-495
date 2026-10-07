---
name: error-handling
description: Error handling in the pi-495 tree
metadata:
  tags: errors, exceptions, domain-error, cause
---

# Error handling

## `DomainError` carries the code

A failure the kernel can name is a `DomainError` (`src/domain/errors.ts`): a code from a closed
union, a category derived from the code, and what the caller needs to act (`retryable`,
`effectState`, `nextActions`, the subject and phase). `toCanonical()` is the form that reaches the
ledger and the dossier.

```typescript
if (!state) throw new DomainError("UNKNOWN_REFERENCE", "program does not exist");
if (state.closed) throw new DomainError("INVALID_TRANSITION", "program is closed");
if (actor.kind === "agent") throw new DomainError("POLICY_DENIED", "an agent cannot write the program");

throw new DomainError("CAPABILITY_MISSING", "no qualified sandbox backend", {
	retryable: false,
	nextActions: ["qualify a backend", "or set a policy that allows unconfined execution"],
});
```

Adding a code means adding it to `DomainErrorCode` and to `CATEGORY` in the same change; the
`Record<DomainErrorCode, ErrorCategory>` refuses the first without the second.

Throw instead of returning an error code or a boolean sentinel (`CONVENTIONS.md` § Principles, 8).

## Check by class, then by code

```typescript
try {
	program.open(request);
} catch (error) {
	if (error instanceof DomainError && error.code === "PRECONDITION_FAILED") {
		return program.current(); // already open: idempotent
	}
	throw error;
}
```

Never match on the message: a summary is for a human and may be reworded.

## Below the domain, a plain `Error` with `cause`

An adapter wraps the failure of what it drives (git, a child process, SQLite, Pi) in an `Error`
whose `cause` keeps the original, so the chain reads from the symptom to the origin.

```typescript
try {
	await git(["worktree", "add", path, revision]);
} catch (error) {
	throw new Error(`cannot create the worktree for ${revision}`, { cause: error });
}
```

A `DomainError` caught on the way up is rethrown untouched, never rewrapped.

## Never swallow

An empty `catch` hides a failure. The one tolerated form says why what is dropped is harmless:

```typescript
try {
	resultat = JSON.parse(line) as Resultat;
} catch {
	// a truncated line is not the result
}
```

Everything else is handled or rethrown.

## No global handlers

`src/` runs inside Pi's process. It installs no `process.on("unhandledRejection")` or
`uncaughtException` handler: the process belongs to Pi, and a rejection the extension did not await
is a defect to fix at its `await`, not to catch globally.

`cycle/src` owns its process. An unexpected failure surfaces and ends the run with a non-zero exit
code; the tool records what it observed and stops rather than continuing on a state it cannot trust.

## Refuse rather than degrade silently

A capability that is not qualified refuses with `CAPABILITY_MISSING`; it never runs unconfined. A
retry budget exhausted refuses with `ATTEMPTS_EXHAUSTED` or `BUDGET_EXHAUSTED` and asks a human. The
categories of defensive code the tree implements, and only those, are listed in `CONVENTIONS.md`
§ Defensive Code.
