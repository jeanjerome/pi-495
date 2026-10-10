/**
 * The acceptance plan a protocol carries before it is frozen: a mission for each required review, distinct from the
 * others, and the acceptance recipe the profile asks for, complete enough to tell the delivered behaviour apart.
 */
import type { AcceptancePlan, AcceptanceRecipe, Protocol } from "../contracts/v1/protocol.ts";
import type { ActivePolicy } from "./policy.ts";

/** What keeps the acceptance plan of a protocol from being frozen, one sentence each; empty when nothing does. */
export function acceptancePlanFindings(protocol: Protocol, policy: ActivePolicy, known: ReadonlySet<string>): string[] {
	const declared = Object.keys(policy.review_missions).length > 0 || policy.acceptance_recipe !== null;
	const plan = protocol.acceptance;
	if (!plan) return declared ? ["policy declares an acceptance plan which the protocol does not carry"] : [];
	const roles = [...new Set([...protocol.required_reviews, ...policy.required_reviews])];
	const findings = missionFindings(plan, roles);
	if (plan.recipe_control_id === null) {
		if (policy.acceptance_recipe)
			findings.push("policy requires an acceptance recipe which the protocol does not schedule");
		return findings;
	}
	const control = protocol.controls.find((c) => c.control_id === plan.recipe_control_id);
	if (!control?.acceptance_recipe) {
		findings.push(`acceptance recipe control ${plan.recipe_control_id} is not defined`);
		return findings;
	}
	return [...findings, ...recipeFindings(control.control_id, control.acceptance_recipe, known)];
}

/** Each required review has a mission of its own: a role without one, or two roles sharing one, is a finding. */
function missionFindings(plan: AcceptancePlan, roles: readonly string[]): string[] {
	const findings: string[] = [];
	const missions = new Map(plan.review_missions.map((m) => [m.role, m.mission.trim()] as const));
	for (const role of roles) if (!missions.get(role)) findings.push(`required review ${role} has no mission`);
	const byMission = new Map<string, string[]>();
	for (const [role, mission] of missions)
		if (mission) byMission.set(mission, [...(byMission.get(mission) ?? []), role]);
	for (const shared of byMission.values())
		if (shared.length > 1)
			findings.push(`reviews ${shared.join(" and ")} share the mission: each role judges its own risk`);
	return findings;
}

function recipeFindings(controlId: string, recipe: AcceptanceRecipe, known: ReadonlySet<string>): string[] {
	const findings: string[] = [];
	const who = `acceptance recipe ${controlId}`;
	if (recipe.observations.length === 0) findings.push(`${who} names no observation of the built candidate`);
	for (const o of recipe.observations)
		if (!known.has(o.requirement_id))
			findings.push(`${who}: observation ${o.observation_id} references unknown requirement ${o.requirement_id}`);
	if (recipe.negative_control === null) {
		if (!recipe.negative_not_applicable?.trim())
			findings.push(`${who} has no negative control and no reason why none applies`);
	} else if (!known.has(recipe.negative_control.requirement_id))
		findings.push(`${who}: negative control references unknown requirement ${recipe.negative_control.requirement_id}`);
	return findings;
}
