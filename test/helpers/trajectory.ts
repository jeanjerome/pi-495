/**
 * A trajectory document as the owner writes it: A the common base, B and C on A, one final milestone
 * over the three, and a global requirement R1 carried by B and C.
 */
interface TrajectoryIncrement {
	increment_id: string;
	title: string;
	value: string;
	closure_criterion?: string;
	depends_on: string[];
	requirement_ids: string[];
}

export function increment(id: string, title: string, depends_on: string[] = [], requirement_ids: string[] = []) {
	return {
		increment_id: id,
		title,
		value: `${title} gives the owner one step of the program`,
		closure_criterion: `${title} is in place and the suite passes`,
		depends_on,
		requirement_ids,
	} satisfies TrajectoryIncrement;
}

export function threeIncrements(
	over: {
		increments?: TrajectoryIncrement[];
		global_requirements?: { requirement_id: string; scope_decision?: { reason: string } }[];
		milestone_globals?: string[];
	} = {},
) {
	const increments = over.increments ?? [
		increment("A", "Common base"),
		increment("B", "Export", ["A"], ["R1"]),
		increment("C", "Import", ["A"], ["R1"]),
	];
	return {
		title: "Bring the application to standards",
		increments,
		milestones: [
			{
				milestone_id: "M1",
				title: "Release",
				increment_ids: increments.map((i) => i.increment_id),
				global_requirement_ids: over.milestone_globals ?? [],
				final: true,
			},
		],
		global_requirements: over.global_requirements ?? [{ requirement_id: "R1" }],
	};
}
