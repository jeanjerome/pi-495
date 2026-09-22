Declarations written here, by us.

`@xynogen/pix-pretty` publishes TypeScript sources and no build, so it carries no `.d.ts` and its
sources do not compile under this repository's settings (`exactOptionalPropertyTypes`,
`erasableSyntaxOnly`). `tsconfig.json` maps the three entry points we call to the files beside this
one, so the compiler reads these declarations instead of the package's sources; the runtime still
loads the package itself.

They describe the version this repository pins, and nothing warns when that version moves. Check
them against `node_modules/@xynogen/pix-pretty/src/` whenever the bound changes.
