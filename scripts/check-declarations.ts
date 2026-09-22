/**
 * The declarations 495 wrote for a package that ships none (`D-56`).
 *
 * `@xynogen/pix-pretty` publishes TypeScript sources and no build, and its sources do not compile
 * under this repository's settings, so `tsconfig.json` points the compiler at `types/pix-pretty/`
 * instead. Those declarations are ours. Nothing in a normal build reads the package itself, so the
 * day its version moves the compiler keeps reading what we wrote and agrees with itself — a hand-
 * written restatement that cannot be contradicted is exactly what `D-55` warns against.
 *
 * This control removes that comfort. It compiles `types/pix-pretty/usage-check.ts` — the calls the
 * review makes, written against the package rather than against our declarations — **without** the
 * `paths` mapping, so every specifier resolves to the installed package. A renamed field, a changed
 * signature, a moved entry point or a vanished export becomes a refusal here instead of a wrong
 * drawing later.
 *
 * It reads the package, it does not restate it: the comparison is the compiler's, not a regular
 * expression's.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const probe = "types/pix-pretty/usage-check.ts";
const pkg = "@xynogen/pix-pretty";

const installed = (
	JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")) as { version: string }
).version;
const declared = (
	JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> }
).dependencies[pkg];

/**
 * `--ignoreConfig` is what drops the `paths` mapping; the rest is the smallest configuration under
 * which the package's own sources compile. `--allowImportingTsExtensions` is not a preference: the
 * package imports its own files with their `.ts` extension, and without it every one of those lines
 * is reported instead of the drift this control is looking for.
 */
const options = [
	"--ignoreConfig",
	"--noEmit",
	"--allowImportingTsExtensions",
	"--module",
	"nodenext",
	"--moduleResolution",
	"nodenext",
	"--target",
	"es2022",
	"--lib",
	"es2023",
	"--skipLibCheck",
];

try {
	execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), ...options, probe], {
		cwd: root,
		stdio: "pipe",
	});
} catch (error) {
	const diagnostics = String((error as { stdout?: Buffer }).stdout ?? "").trim();
	console.error(
		[
			`the declarations under types/pix-pretty/ no longer describe ${pkg}@${installed} (declared ${declared}):`,
			diagnostics,
			"",
			`Read node_modules/${pkg}/src/ and bring types/pix-pretty/ back in line, then say so in ${probe}.`,
		].join("\n"),
	);
	process.exit(1);
}

console.log(`declarations match the package: ${pkg}@${installed} answers the calls the review makes`);
