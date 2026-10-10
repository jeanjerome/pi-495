import { strict as assert } from "node:assert";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, it } from "node:test";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { checkLean, type LeanReport, lakeBuild, leanMissing, projectCopy } from "../helpers/lean-verdicts.ts";

const cleanups = removedAfterEach();

/** The proofs of a copy with the proof of one theorem replaced: its former block removed, the new one appended. */
function replaceProof(copy: string, theorem: string, block: string): void {
	const path = join(copy, "Verdicts", "Proofs.lean");
	const kept = readFileSync(path, "utf8").replace(
		new RegExp(`\\ntheorem ${theorem} [\\s\\S]*?(?=\\n(?:theorem |end Verdicts))`),
		"",
	);
	writeFileSync(path, kept.replace(/\nend Verdicts\s*$/, `\n${block}\n\nend Verdicts\n`));
}

/** The theorems of the manifest a copy carries, each with the short name of the statement it must prove. */
function theoremsOf(copy: string): { theorem: string; statement: string }[] {
	const manifest = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8")) as {
		theorems: { theorem: string; statement: string }[];
	};
	return manifest.theorems.map((t) => ({
		theorem: t.theorem.replace(/^Verdicts\./, ""),
		statement: t.statement.replace(/^Verdicts\./, ""),
	}));
}

/** Proofs of every approved theorem, each given by `proof`. */
function proofsBy(copy: string, proof: string): string {
	const theorems = theoremsOf(copy).map((t) => `theorem ${t.theorem} : ${t.statement} := ${proof}`);
	return `import Verdicts.Statements\n\nnamespace Verdicts\n\n${theorems.join("\n\n")}\n\nend Verdicts\n`;
}

/** Proofs of every approved theorem left to `sorry`: they build, and prove nothing. */
function sorriedProofs(copy: string): string {
	return proofsBy(copy, "by\n  sorry");
}

/** The approved statements, each made `True`: `trivial` proves them all. */
function forgedStatements(copy: string): string {
	const statements = theoremsOf(copy).map((t) => `def ${t.statement} : Prop := True`);
	return `import Verdicts.Defs\n\nnamespace Verdicts\n\n${statements.join("\n")}\n\nend Verdicts\n`;
}

/** Writes under `root` a project of the same modules where every statement is `True` and every proof `trivial`. */
function writeForgedModules(root: string, copy: string): void {
	mkdirSync(join(root, "Verdicts"), { recursive: true });
	writeFileSync(
		join(root, "Verdicts.lean"),
		"import Verdicts.Defs\nimport Verdicts.Statements\nimport Verdicts.Proofs\n",
	);
	writeFileSync(join(root, "Verdicts", "Defs.lean"), "namespace Verdicts\n\nend Verdicts\n");
	writeFileSync(join(root, "Verdicts", "Statements.lean"), forgedStatements(copy));
	writeFileSync(join(root, "Verdicts", "Proofs.lean"), proofsBy(copy, "trivial"));
}

/** Builds a module of a project with Lake's artifact cache under `home`, and says which outputs it added there. */
function cachedBuild(project: string, module: string, home: string): string[] {
	const outputs = join(home, ".cache", "lake", "outputs", "verdicts");
	const before = existsSync(outputs) ? readdirSync(outputs) : [];
	const built = lakeBuild(project, module, { HOME: home, LAKE_ARTIFACT_CACHE: "true" });
	assert.equal(built.status, 0, built.output);
	return readdirSync(outputs).filter((entry) => !before.includes(entry));
}

/** Appends Lean commands to the proofs of a copy: they run while Lake builds them. */
function appendToProofs(copy: string, commands: string): void {
	const path = join(copy, "Verdicts", "Proofs.lean");
	writeFileSync(path, `${readFileSync(path, "utf8")}\n${commands}\n`);
}

/**
 * Makes the build give the compiled proofs the theorems of a sorried module again, each valued by an ill-typed
 * `True.intro`: the kernel replay skips a theorem its imports already hold, the import keeps the later copy. With
 * `misfiled`, it also files there a definition `Verdicts.extra` under the name `Verdicts.k0`.
 */
function declareTheoremsAgain(copy: string, misfiled: boolean): void {
	writeFileSync(join(copy, "Verdicts", "Sorried.lean"), sorriedProofs(copy));
	writeFileSync(join(copy, "Verdicts", "Proofs.lean"), "import Verdicts.Sorried\n");
	const extra = misfiled
		? [
				"  let extra := ConstantInfo.defnInfo <|",
				"    mkDefinitionValEx `Verdicts.extra [] (mkConst ``Nat) (mkConst ``Nat.zero) .abbrev .safe [`Verdicts.extra]",
				"  let names := theorems.map (·.name) |>.push `Verdicts.k0",
				"  let constants := theorems.push extra",
			]
		: ["  let names := theorems.map (·.name)", "  let constants := theorems"];
	writeFileSync(
		join(copy, "Verdicts", "Overwrite.lean"),
		[
			"import Lean",
			"import Verdicts.Proofs",
			"",
			"open Lean",
			"",
			"#eval show IO Unit from do",
			'  let library := ".lake/build/lib/lean/Verdicts"',
			'  let (sorried, _) ← readModuleData s!"{library}/Sorried.olean"',
			'  let (proofs, _) ← readModuleData s!"{library}/Proofs.olean"',
			"  let theorems := sorried.constants.filterMap fun",
			"    | .thmInfo t => some (ConstantInfo.thmInfo { t with value := mkConst ``True.intro })",
			"    | _ => none",
			...extra,
			'  saveModuleData s!"{library}/Proofs.olean" `Verdicts.Proofs { proofs with constNames := names, constants }',
			"",
		].join("\n"),
	);
	writeFileSync(
		join(copy, "Verdicts.lean"),
		`${readFileSync(join(copy, "Verdicts.lean"), "utf8")}import Verdicts.Overwrite\n`,
	);
}

function theoremOf(report: LeanReport | null, name: string) {
	return report?.theorems.find((t) => t.theorem === `Verdicts.${name}`);
}

describe("the Lean check of the proofs of the verdict combination", { skip: leanMissing }, () => {
	it("the approved proofs are verified: each theorem states its approved statement, with the allowed axioms only", async () => {
		const { status, output, report } = await checkLean();
		assert.equal(report?.verdict, "proved", `the approved project is proved: ${output}`);
		assert.equal(status, 0);
		assert.ok(report.theorems.length > 0);
		for (const t of report.theorems) {
			assert.equal(t.kind, "theorem", t.theorem);
			assert.ok(t.states_approved, `${t.theorem} proves ${t.statement}`);
			assert.ok(!t.axioms.includes("sorryAx"), `${t.theorem} uses no sorry`);
			assert.deepEqual(
				t.axioms.filter((a) => !report.allowed_axioms.includes(a)),
				[],
				`${t.theorem} uses only allowed axioms`,
			);
		}
		assert.equal(report.replay?.passed, true, "the kernel replay finds no problem");
		for (const p of report.protected) assert.ok(p.before === p.approved && p.after === p.approved, p.file);
	});

	it("a dependency using sorry and a proof of another statement are refused", async () => {
		const sorried = projectCopy("lean-sorry-", cleanups);
		writeFileSync(
			join(sorried, "Verdicts", "Lemma.lean"),
			"import Verdicts.Statements\n\nnamespace Verdicts\n\ntheorem anyPassLemma : AnyPassKeepsPass := by\n  sorry\n\nend Verdicts\n",
		);
		const proofs = join(sorried, "Verdicts", "Proofs.lean");
		writeFileSync(proofs, `import Verdicts.Lemma\n${readFileSync(proofs, "utf8")}`);
		replaceProof(sorried, "anyPassKeepsPass", "theorem anyPassKeepsPass : AnyPassKeepsPass := anyPassLemma");
		const withSorry = await checkLean(sorried);
		assert.equal(withSorry.report?.verdict, "refused", `a proof that leans on sorry is refused: ${withSorry.output}`);
		assert.notEqual(withSorry.status, 0);
		assert.ok(theoremOf(withSorry.report, "anyPassKeepsPass")?.axioms.includes("sorryAx"), withSorry.output);
		assert.match(theoremOf(withSorry.report, "anyPassKeepsPass")?.refused.join("\n") ?? "", /sorryAx/);

		const other = projectCopy("lean-other-", cleanups);
		replaceProof(
			other,
			"anyPassKeepsPass",
			"theorem anyPassKeepsPass : ∀ verdicts : List Verdict, combine .any verdicts = combine .any verdicts :=\n  fun _ => rfl",
		);
		const otherStatement = await checkLean(other);
		assert.equal(
			otherStatement.report?.verdict,
			"refused",
			`a proof of another statement is refused: ${otherStatement.output}`,
		);
		assert.equal(theoremOf(otherStatement.report, "anyPassKeepsPass")?.states_approved, false);
		assert.match(
			theoremOf(otherStatement.report, "anyPassKeepsPass")?.refused.join("\n") ?? "",
			/not the approved statement Verdicts\.AnyPassKeepsPass/,
		);
	});

	it("an altered statement is refused before any proof is built", async () => {
		const altered = projectCopy("lean-altered-", cleanups);
		const statements = join(altered, "Verdicts", "Statements.lean");
		writeFileSync(
			statements,
			readFileSync(statements, "utf8").replace(
				"PASS ∈ verdicts → combine .any verdicts = PASS",
				"PASS ∈ verdicts → combine .any verdicts = combine .any verdicts",
			),
		);
		const { status, output, report } = await checkLean(altered);
		assert.equal(report?.verdict, "refused", `an altered statement is refused: ${output}`);
		assert.notEqual(status, 0);
		assert.match(
			report.reasons.join("\n"),
			/Verdicts\/Statements\.lean is sha256:\w+, the manifest approves sha256:\w+/,
		);
		assert.equal(report.replay, null, "nothing is built nor replayed");
	});

	it("a lakefile.lean that points the build to forged statements is not read", async () => {
		const copy = projectCopy("lean-lakefile-", cleanups);
		writeForgedModules(join(copy, "forged"), copy);
		writeFileSync(
			join(copy, "lakefile.lean"),
			'import Lake\nopen Lake DSL\n\npackage verdicts\n\n@[default_target]\nlean_lib Verdicts where\n  srcDir := "forged"\n',
		);
		writeFileSync(join(copy, "Verdicts", "Proofs.lean"), sorriedProofs(copy));
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `the forged statements are not taken for the approved ones: ${output}`);
		assert.notEqual(status, 0);
		assert.ok(theoremOf(report, "anyPassKeepsPass")?.axioms.includes("sorryAx"), "the protected sources are built");
	});

	it("a build that overwrites the compiled statements does not stand for their proof", async () => {
		const forged = projectCopy("lean-forged-", cleanups);
		writeForgedModules(forged, forged);
		const built = lakeBuild(forged, "Verdicts");
		assert.equal(built.status, 0, built.output);
		const copy = projectCopy("lean-overwrite-", cleanups);
		for (const m of ["Defs", "Statements", "Proofs"])
			cpSync(
				join(forged, ".lake", "build", "lib", "lean", "Verdicts", `${m}.olean`),
				join(copy, "forged-build", `${m}.olean`),
			);
		writeFileSync(join(copy, "Verdicts", "Proofs.lean"), sorriedProofs(copy));
		writeFileSync(
			join(copy, "Verdicts", "Overwrite.lean"),
			[
				"import Verdicts.Proofs",
				"",
				"#eval show IO Unit from do",
				'  for m in ["Defs", "Statements", "Proofs"] do',
				'    IO.FS.writeBinFile s!".lake/build/lib/lean/Verdicts/{m}.olean" (← IO.FS.readBinFile s!"forged-build/{m}.olean")',
				"",
			].join("\n"),
		);
		writeFileSync(
			join(copy, "Verdicts.lean"),
			`${readFileSync(join(copy, "Verdicts.lean"), "utf8")}import Verdicts.Overwrite\n`,
		);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `oleans written by the build are not the approved statements: ${output}`);
		assert.notEqual(status, 0);
		assert.equal(report.replay?.passed, false, "the kernel replays the forged proofs against the approved statements");
	});

	it("statements restored from a Lake artifact cache shipped with the project are not taken for the approved ones", async () => {
		const copy = projectCopy("lean-cache-", cleanups);
		cachedBuild(copy, "Verdicts.Defs", copy);
		const [approved] = cachedBuild(copy, "Verdicts.Statements", copy);
		const forged = projectCopy("lean-cache-forged-", cleanups);
		writeFileSync(join(forged, "Verdicts", "Statements.lean"), forgedStatements(forged));
		const [forgery] = cachedBuild(forged, "Verdicts.Statements", copy);
		assert.ok(approved && forgery, "the cache holds an output for the approved and for the forged statements");
		const outputs = join(copy, ".cache", "lake", "outputs", "verdicts");
		copyFileSync(join(outputs, forgery), join(outputs, approved));
		writeFileSync(join(copy, "Verdicts", "Proofs.lean"), proofsBy(copy, "trivial"));
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `the cached forged statements are not the approved ones: ${output}`);
		assert.notEqual(status, 0);
	});

	it("the parts of a module written beside its olean do not stand for its replay", async () => {
		// Two modules without a constant, each compiled to its own region, stand for the server and private parts.
		const forged = projectCopy("lean-parts-forged-", cleanups);
		writeForgedModules(forged, forged);
		const empties = ["Server", "Private"];
		for (const empty of empties) writeFileSync(join(forged, "Verdicts", `${empty}.lean`), "");
		writeFileSync(
			join(forged, "Verdicts.lean"),
			`${readFileSync(join(forged, "Verdicts.lean"), "utf8")}${empties.map((e) => `import Verdicts.${e}\n`).join("")}`,
		);
		const built = lakeBuild(forged, "Verdicts");
		assert.equal(built.status, 0, built.output);
		const copy = projectCopy("lean-parts-", cleanups);
		const library = join(forged, ".lake", "build", "lib", "lean", "Verdicts");
		mkdirSync(join(copy, "forged-build"));
		for (const m of ["Proofs", ...empties])
			copyFileSync(join(library, `${m}.olean`), join(copy, "forged-build", `${m}.olean`));
		writeFileSync(join(copy, "Verdicts", "Proofs.lean"), sorriedProofs(copy));
		writeFileSync(
			join(copy, "Verdicts", "Overwrite.lean"),
			[
				"import Verdicts.Proofs",
				"",
				"#eval show IO Unit from do",
				'  let into := ".lake/build/lib/lean/Verdicts/Proofs.olean"',
				'  IO.FS.writeBinFile into (← IO.FS.readBinFile "forged-build/Proofs.olean")',
				'  for (part, empty) in [("server", "Server"), ("private", "Private")] do',
				'    IO.FS.writeBinFile s!"{into}.{part}" (← IO.FS.readBinFile s!"forged-build/{empty}.olean")',
				"",
			].join("\n"),
		);
		writeFileSync(
			join(copy, "Verdicts.lean"),
			`${readFileSync(join(copy, "Verdicts.lean"), "utf8")}import Verdicts.Overwrite\n`,
		);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `a replay of empty parts does not stand for the forged proofs: ${output}`);
		assert.notEqual(status, 0);
		assert.equal(report.replay?.passed, false, "the kernel replays the olean the inspection reads");
	});

	it("a declaration filed under another name than its own does not stand for the approved statement", async () => {
		// Proofs that import the definitions alone, each statement made `True` beside its `trivial` proof.
		const forged = projectCopy("lean-misfiled-forged-", cleanups);
		const proofs = theoremsOf(forged).map((t) => `theorem ${t.theorem} : ${t.statement} := trivial`);
		writeFileSync(
			join(forged, "Verdicts", "Proofs.lean"),
			forgedStatements(forged).replace(/\nend Verdicts\n$/, `\n${proofs.join("\n")}\n\nend Verdicts\n`),
		);
		const built = lakeBuild(forged, "Verdicts.Proofs");
		assert.equal(built.status, 0, built.output);
		const copy = projectCopy("lean-misfiled-", cleanups);
		mkdirSync(join(copy, "forged-build"));
		copyFileSync(
			join(forged, ".lake", "build", "lib", "lean", "Verdicts", "Proofs.olean"),
			join(copy, "forged-build", "Proofs.olean"),
		);
		writeFileSync(join(copy, "Verdicts", "Proofs.lean"), sorriedProofs(copy));
		// The build files each forged statement under a key the kernel replay reaches before every theorem: the replay
		// adds it under its own name, the import keeps it under that key, out of the way of the approved statement.
		writeFileSync(
			join(copy, "Verdicts", "Overwrite.lean"),
			[
				"import Lean",
				"import Verdicts.Proofs",
				"",
				"open Lean",
				"",
				"#eval show IO Unit from do",
				'  let (forgedProofs, _) ← readModuleData "forged-build/Proofs.olean"',
				"  let theorems := forgedProofs.constants.filterMap fun c => if c matches .thmInfo _ then some c.name else none",
				"  let mut next := 0",
				"  let mut names := #[]",
				"  for c in forgedProofs.constants do",
				"    if c matches .thmInfo _ then",
				"      names := names.push c.name",
				"    else",
				'      let mut key := Name.mkStr `Verdicts s!"k{next}"',
				"      while !theorems.all (Name.quickCmp key · == .lt) do",
				"        next := next + 1",
				'        key := Name.mkStr `Verdicts s!"k{next}"',
				"      next := next + 1",
				"      names := names.push key",
				'  saveModuleData ".lake/build/lib/lean/Verdicts/Proofs.olean" `Verdicts.Proofs { forgedProofs with constNames := names }',
				"",
			].join("\n"),
		);
		writeFileSync(
			join(copy, "Verdicts.lean"),
			`${readFileSync(join(copy, "Verdicts.lean"), "utf8")}import Verdicts.Overwrite\n`,
		);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `a statement filed under another name is not proved: ${output}`);
		assert.notEqual(status, 0);
		assert.match(
			report.reasons.join("\n"),
			/Verdicts\.Proofs files the declaration Verdicts\.AllPassRejectsBlocking under the name Verdicts\.k\d+/,
		);
	});

	it("a theorem declared again by a later module does not stand for the proof the kernel replayed", async () => {
		const copy = projectCopy("lean-duplicate-", cleanups);
		declareTheoremsAgain(copy, false);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `a theorem declared twice is not proved: ${output}`);
		assert.notEqual(status, 0);
		assert.match(
			report.reasons.join("\n"),
			/Verdicts\.allPassRejectsBlocking is declared by Verdicts\.Sorried and again by Verdicts\.Proofs/,
		);
	});

	it("a misfiled declaration beside the theorems declared again is refused for both, every theorem read", async () => {
		const copy = projectCopy("lean-duplicate-misfiled-", cleanups);
		declareTheoremsAgain(copy, true);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `neither a misfiled nor a duplicate declaration is proved: ${output}`);
		assert.notEqual(status, 0);
		assert.equal(report.theorems.length, theoremsOf(copy).length, output);
		const reasons = report.reasons.join("\n");
		assert.match(reasons, /Verdicts\.Proofs files the declaration Verdicts\.extra under the name Verdicts\.k0/);
		assert.match(
			reasons,
			/Verdicts\.allPassRejectsBlocking is declared by Verdicts\.Sorried and again by Verdicts\.Proofs/,
		);
	});

	it("the build of the proofs writes nowhere outside its copy and reaches no network", async () => {
		const copy = projectCopy("lean-confined-", cleanups);
		const name = `495-lean-escape-${process.pid}-${Date.now()}`;
		const outside = [join(tmpdir(), name), join("/tmp", name)];
		cleanups.push(...outside);
		let connections = 0;
		const server = createServer((socket) => {
			connections += 1;
			socket.destroy();
		});
		await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
		const { port } = server.address() as { port: number };
		appendToProofs(
			copy,
			[
				"#eval show IO Unit from do",
				`  for path in [${outside.map((p) => JSON.stringify(p)).join(", ")}] do`,
				'    try IO.FS.writeFile path "written by a proof" catch _ => pure ()',
				`  let connect := "IO::Socket::INET->new(PeerAddr => q{127.0.0.1:${port}}, Timeout => 2)"`,
				'  try discard <| IO.Process.output { cmd := "/usr/bin/perl", args := #["-MIO::Socket::INET", "-e", connect] }',
				"  catch _ => pure ()",
			].join("\n"),
		);
		const { output, report } = await checkLean(copy);
		await new Promise((settled) => setTimeout(settled, 200));
		server.close();
		assert.equal(report?.verdict, "proved", `the approved proofs still build under the confinement: ${output}`);
		for (const path of outside) assert.ok(!existsSync(path), `the build wrote ${path}`);
		assert.equal(connections, 0, "the build reached a listener of the host");
	});

	it("a build that rewrites a protected file is refused", async () => {
		const copy = projectCopy("lean-rewrite-", cleanups);
		appendToProofs(
			copy,
			[
				"#eval show IO Unit from do",
				'  IO.FS.writeFile "Verdicts/Statements.lean" ((← IO.FS.readFile "Verdicts/Statements.lean") ++ "\\n")',
			].join("\n"),
		);
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `a protected file rewritten by the build is refused: ${output}`);
		assert.notEqual(status, 0);
		assert.match(
			report.reasons.join("\n"),
			/the build rewrote a protected file: Verdicts\/Statements\.lean is sha256:\w+/,
		);
		const statements = report.protected.find((p) => p.file === "Verdicts/Statements.lean");
		assert.ok(statements && statements.before === statements.approved && statements.after !== statements.approved);
	});

	it("a definition that proves the approved statement is not a theorem and is refused", async () => {
		const copy = projectCopy("lean-definition-", cleanups);
		const proofs = join(copy, "Verdicts", "Proofs.lean");
		writeFileSync(proofs, readFileSync(proofs, "utf8").replace("theorem anyPassKeepsPass :", "def anyPassKeepsPass :"));
		const { status, output, report } = await checkLean(copy);
		assert.equal(report?.verdict, "refused", `a definition is not taken for a theorem: ${output}`);
		assert.notEqual(status, 0);
		assert.deepEqual(theoremOf(report, "anyPassKeepsPass")?.refused, [
			"Verdicts.anyPassKeepsPass is definition, not a theorem",
		]);
	});

	it("a theorem whose statement comes from an unprotected module is refused", async () => {
		const copy = projectCopy("lean-unprotected-", cleanups);
		const proofs = join(copy, "Verdicts", "Proofs.lean");
		writeFileSync(
			proofs,
			readFileSync(proofs, "utf8").replace(
				/\nend Verdicts\s*$/,
				"\ndef Extra : Prop := True\n\ntheorem extra : Extra := trivial\n\nend Verdicts\n",
			),
		);
		const manifest = JSON.parse(readFileSync(join(copy, "manifest.json"), "utf8")) as {
			theorems: { theorem: string; statement: string }[];
		};
		manifest.theorems.push({ theorem: "Verdicts.extra", statement: "Verdicts.Extra" });
		writeFileSync(join(copy, "manifest-extra.json"), JSON.stringify(manifest));
		const { status, output, report } = await checkLean(copy, { manifest: join(copy, "manifest-extra.json") });
		assert.equal(report?.verdict, "refused", `a statement outside the protected files is refused: ${output}`);
		assert.notEqual(status, 0);
		assert.deepEqual(theoremOf(report, "extra")?.refused, [
			"Verdicts.Extra comes from Verdicts.Proofs, not from a protected file",
		]);
	});
});

describe("the toolchain of the Lean check", () => {
	it("a toolchain that does not print the approved version and commit is refused before anything is built", async () => {
		const toolchain = outputDir("lean-toolchain-", cleanups);
		mkdirSync(join(toolchain, "bin"));
		writeFileSync(
			join(toolchain, "bin", "lean"),
			"#!/bin/sh\necho 'Lean (version 4.0.0, arm64-apple-darwin, commit 0000000000000000000000000000000000000000, Release)'\n",
			{ mode: 0o755 },
		);
		const { status, output, report } = await checkLean(undefined, { toolchain });
		assert.equal(report?.verdict, "error", `another toolchain is refused: ${output}`);
		assert.equal(status, 3);
		assert.match(
			report.reasons.join("\n"),
			/capability missing: .*prints Lean \(version 4\.0\.0.*, not version 4\.34\.1 at commit 5045d005/,
		);
		assert.equal(report.replay, null, "nothing is built nor replayed");
	});
});
