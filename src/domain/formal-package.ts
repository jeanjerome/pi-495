/**
 * The formal package a protocol freezes: the TLA+ model the owner adopted, complete enough to be explored as it was
 * approved, carried by the control that explores it, and the one the policy adopts. Its identity is the digest of
 * the whole declaration, so a file, a property, the tool or the budget that changes is another package.
 */
import { digestValue } from "../contracts/digest.ts";
import type { ControlDefinition, FormalPackage, Protocol } from "../contracts/v1/protocol.ts";
import type { EvidenceEntry, FrozenFormalPackage } from "./change/state.ts";
import type { ActivePolicy } from "./policy.ts";

/** The identity of a formal package, which the control exploring it carries as its version. */
export function formalPackageDigest(pkg: FormalPackage): string {
	return digestValue(pkg);
}

/** The control of a protocol that explores a formal package, if any. */
function formalControlIn(protocol: Pick<Protocol, "controls">): ControlDefinition | null {
	return protocol.controls.find((c) => c.formal_package) ?? null;
}

/** What keeps a package from being explored as it was approved: a file it names that it does not pin. */
function packageFindings(pkg: FormalPackage): string[] {
	const who = `formal package ${pkg.model}`;
	const named = [
		["its model", pkg.model],
		["its configuration", pkg.config],
		["its mutant", pkg.expected_violation.mutant],
		["the file its mutant replaces", pkg.expected_violation.replaces],
	] as const;
	const findings = named
		.filter(([, path]) => !(path in pkg.files))
		.map(([role, path]) => `${who} does not pin ${role} ${path}`);
	if (pkg.expected_violation.mutant === pkg.expected_violation.replaces)
		findings.push(`${who}: its mutant ${pkg.expected_violation.mutant} replaces itself`);
	return findings;
}

/**
 * What keeps the formal package of a protocol from being frozen, one sentence each; empty when nothing does, and when
 * neither the policy nor the protocol adopts one.
 */
export function formalPlanFindings(protocol: Protocol, policy: ActivePolicy, known: ReadonlySet<string>): string[] {
	const control = formalControlIn(protocol);
	const pkg = control?.formal_package;
	const adopted = policy.formal_control;
	if (!control || !pkg) return adopted ? ["policy adopts a formal package which the protocol does not carry"] : [];
	const findings = packageFindings(pkg);
	const identity = formalPackageDigest(pkg);
	if (control.version !== identity)
		findings.push(`formal control ${control.control_id} is not versioned by the package it explores`);
	if (!adopted || formalPackageDigest(adopted) !== identity)
		findings.push("the protocol explores a formal package other than the one the policy adopts");
	for (const rid of pkg.requirement_ids)
		if (!known.has(rid)) findings.push(`formal package ${pkg.model} references unknown requirement ${rid}`);
	for (const c of pkg.correspondence)
		if (!protocol.controls.some((d) => d.control_id === c.control_id))
			findings.push(`correspondence control ${c.control_id} of formal package ${pkg.model} is not defined`);
	if (!protocol.qualifications[control.control_id]?.qualified)
		findings.push(`formal control ${control.control_id} is not qualified`);
	return findings;
}

/** What the protocol freezes of its formal package for G5, or null when it adopts none. */
export function frozenFormalOf(protocol: Pick<Protocol, "controls">): FrozenFormalPackage | null {
	const control = formalControlIn(protocol);
	const pkg = control?.formal_package;
	if (!control || !pkg) return null;
	return {
		control_id: control.control_id,
		package_digest: control.version,
		model: pkg.model,
		required_properties: [...pkg.required_properties],
		requirement_ids: [...pkg.requirement_ids],
		correspondence: pkg.correspondence.map((c) => ({ control_id: c.control_id, cases: [...c.cases] })),
	};
}

/**
 * What G5 reads of the exploration, for the requirements of the program the frozen package bears on: that very package
 * explored on the candidate, while the policy still adopts it. A completed exploration proves the model, so G5 never
 * keeps a requirement on it alone; a package the policy no longer adopts keeps nothing until it is prepared and
 * qualified again. A counterexample is a FAIL, anything missing an INDETERMINATE.
 */
export function formalExploration(
	formal: FrozenFormalPackage,
	latest: ReadonlyMap<string, EvidenceEntry>,
	adopted: FormalPackage | null,
): { verdict: "PASS" | "FAIL" | "INDETERMINATE"; reasons: string[]; retained: string[] } {
	const reasons: string[] = [];
	if (!adopted || formalPackageDigest(adopted) !== formal.package_digest)
		reasons.push("the policy adopts another formal package than the one frozen: prepare and qualify it again");
	const run = latest.get(formal.control_id);
	if (!run?.control_version.startsWith(`${formal.package_digest}+`)) {
		reasons.push(`the model of formal package ${formal.package_digest} was not explored on the candidate`);
		return { verdict: "INDETERMINATE", reasons, retained: [] };
	}
	if (run.verdict !== "PASS") reasons.push(`the exploration of ${formal.model} gave ${run.verdict}`);
	const verdict = run.verdict === "FAIL" ? "FAIL" : reasons.length > 0 ? "INDETERMINATE" : "PASS";
	return { verdict, reasons, retained: [run.evidence_id] };
}
