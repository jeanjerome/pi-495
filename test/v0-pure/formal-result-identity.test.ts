import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { digestBytes } from "../../src/contracts/digest.ts";
import type { ControlDefinition, FormalPackage } from "../../src/contracts/v1/protocol.ts";
import { controlInputsDigest } from "../../src/domain/baseline.ts";
import { formalPackageDigest, importedModules } from "../../src/domain/formal-package.ts";
import { controlOf } from "../helpers/execution-fixture.ts";

const COMPTEUR =
	"---- MODULE Compteur ----\nEXTENDS Bornes\nVARIABLE x\nInit == x = 0\nNext == x < Max /\\ x' = x + 1\n====\n";
/** A module the model reaches through `EXTENDS`, and which the package does not pin. */
const BORNES = "---- MODULE Bornes ----\nEXTENDS Naturals\nMax == 3\nBorne(x) == x <= Max\n====\n";
const CONFIG = "INIT Init\nNEXT Next\nINVARIANT Borne\n";

const JAVA = "/opt/java/bin/java";
const JAR = "/opt/tlaplus/tla2tools.jar";

const PACKAGE: FormalPackage = {
	model: "spec/Compteur.tla",
	config: "spec/Compteur.cfg",
	files: { "spec/Compteur.tla": digestBytes(COMPTEUR), "spec/Compteur.cfg": digestBytes(CONFIG) },
	required_properties: ["Borne"],
	expected_violation: { mutant: "spec/mutants/Compteur.tla", replaces: "spec/Compteur.tla" },
	tool: { name: "TLC", version: "2.19 of 08 August 2024 (rev: 5a47802)", java: JAVA, jar: JAR },
	budget: { timeout_ms: 600_000, workers: 1, heap_mb: 512 },
	requirement_ids: ["R1"],
	correspondence: [{ control_id: "unit", cases: ["R1 replays the traces of Compteur"] }],
};

/** The control exploring `pkg`, versioned by the package as the kernel freezes it. */
function formalControl(pkg: FormalPackage): ControlDefinition {
	return controlOf({
		control_id: "formal-model",
		version: formalPackageDigest(pkg),
		command: [pkg.tool.java, "-cp", pkg.tool.jar, "tlc2.TLC", "-tool", "-config", pkg.config, pkg.model],
		parser: "tlc",
		formal_package: pkg,
	});
}

/** What the exploration reads, by path: the closure of the model's modules, its configuration and the tool. */
const READ = {
	"spec/Compteur.tla": digestBytes(COMPTEUR),
	"spec/Bornes.tla": digestBytes(BORNES),
	"spec/Compteur.cfg": digestBytes(CONFIG),
	[JAVA]: digestBytes("java 21"),
	[JAR]: digestBytes("tla2tools 2.19"),
};

const CANDIDATE_A = `sha256:${"a".repeat(64)}`;
const CANDIDATE_B = `sha256:${"b".repeat(64)}`;

describe("a formal result is identified by everything it read, and a program result by its exact candidate", () => {
	it("changer un import transitif ou une propriété change la clé, changer seulement le candidat ne conserve que le modèle", () => {
		const control = formalControl(PACKAGE);
		const key = controlInputsDigest(control, CANDIDATE_A, READ);

		const otherBound = { ...READ, "spec/Bornes.tla": digestBytes(BORNES.replace("Max == 3", "Max == 4")) };
		assert.notEqual(
			controlInputsDigest(control, CANDIDATE_A, otherBound),
			key,
			"changing a module the model imports transitively, under the same name, changes the key",
		);
		const moreProperties = formalControl({ ...PACKAGE, required_properties: ["Borne", "Progres"] });
		assert.notEqual(
			controlInputsDigest(moreProperties, CANDIDATE_A, READ),
			key,
			"changing a required property changes the key",
		);
		const otherJar = { ...READ, [JAR]: digestBytes("tla2tools 1.8") };
		assert.notEqual(
			controlInputsDigest(control, CANDIDATE_A, otherJar),
			key,
			"another jar at the same path changes the key",
		);

		assert.equal(
			controlInputsDigest(control, CANDIDATE_B, READ),
			key,
			"another candidate holding the same model keeps the key of the model result",
		);
		const unit = controlOf({ control_id: "unit", command: ["node", "--test"] });
		assert.notEqual(
			controlInputsDigest(unit, CANDIDATE_B),
			controlInputsDigest(unit, CANDIDATE_A),
			"a control of the program is identified by its exact candidate",
		);
	});
});

describe("the modules a TLA+ module imports", () => {
	it("are those named after EXTENDS and INSTANCE, a module named in a comment set aside", () => {
		const text = [
			"---- MODULE Compteur ----",
			"EXTENDS Naturals ,  Bornes",
			"\\* EXTENDS Ligne",
			"(* INSTANCE Bloc",
			"   EXTENDS Bloc *)",
			"B == INSTANCE Bornes",
			"C == INSTANCE Cache WITH x <- 0",
			"====",
		].join("\n");
		assert.deepEqual(importedModules(text), ["Naturals", "Bornes", "Cache"]);
		assert.deepEqual(importedModules("---- MODULE Seul ----\nVARIABLE x\n====\n"), [], "a module importing nothing");
	});
});
