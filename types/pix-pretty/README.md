Declarations written here, by us.

`@xynogen/pix-pretty` publishes TypeScript sources and no build, so it carries no `.d.ts` and its
sources do not compile under this repository's settings (`exactOptionalPropertyTypes`,
`erasableSyntaxOnly`). `tsconfig.json` maps the three entry points we call to the files beside this
one, so the compiler reads these declarations instead of the package's sources; the runtime still
loads the package itself.

They describe the version this repository pins. `usage-check.ts` beside them is compiled against the
installed package rather than against these declarations, and `npm run lint:declarations` runs it, so
a version that moves under them is refused rather than believed. Keep that file a mirror of the calls
`src/presentation/tui/review/diff-view.ts` makes: what it does not exercise, nothing checks.
