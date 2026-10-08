/**
 * The common layer of the technologies (CMP-TGT): it asks a recognised technology each capability in turn
 * and assembles, once for all of them, what the kernel reads — the controls, the witnesses that qualify
 * them, the controls that judge style, the blind spots and the recommendations. A capability a technology
 * does not offer is a blind spot named in the same words whatever the technology.
 */
import type { RecommendedComplement } from "../../contracts/v1/protocol.ts";
import { type ReaderTraits, readerOf } from "../../domain/survey.ts";
import type { CapabilityQuestion, Offer, StackPlugin } from "./plugin.ts";
import type { DetectedTechnology } from "./stack.ts";

/**
 * What each capability other than the tests leaves unseen when it is not offered. Asked in this order,
 * which is the order its controls run in: the build-reading sensors first, mutation and its own build
 * after them, the quality analysers last.
 */
const BLIND_SPOTS = {
	coverage: "the coverage of the introduced lines is not measured on this target",
	structure: "no dependency direction between modules is checked on this target",
	mutation: "the mutation of the introduced lines is not measured on this target",
	quality: "the quality of the code is not measured on this target",
} as const;

type Sensor = keyof typeof BLIND_SPOTS;

/** The sensors whose controls judge executed code, and so must let through a module a test calls and asserts on. */
const EXECUTED_CODE_SENSORS: readonly Sensor[] = ["coverage", "mutation"];

/** A detection that offers no control, and the blind spot that says why. */
export function undetected(stack: string, blindSpot: string, facts: Record<string, unknown> = {}): DetectedTechnology {
	return {
		stack,
		facts,
		controls: [],
		lint_control_ids: [],
		positive_witness: {},
		witness_tests: 0,
		negative_witness: {},
		own_negative_witness: {},
		preparation_paths: [],
		capability_missing: [blindSpot],
		recommendations: [],
	};
}

/**
 * The detection of a project `plugin` recognised. A suite it refuses leaves no control at all: a protocol
 * frozen on the other sensors would judge nothing of the behaviour the suite was there to judge.
 */
export function assembleDetection<Model>(
	plugin: StackPlugin<Model>,
	question: CapabilityQuestion<Model>,
	readers: readonly ReaderTraits[],
): DetectedTechnology {
	const { tests } = plugin.capabilities;
	const facts = plugin.facts?.(question) ?? {};
	const suite = tests.offer(question);
	if (suite.kind !== "available") return undetected(plugin.id, suite.reason, facts);
	const sensors = (Object.keys(BLIND_SPOTS) as Sensor[]).map((sensor) => ({
		sensor,
		offer: plugin.capabilities[sensor]?.offer(question) ?? notOffered(plugin.id),
	}));
	const available = sensors.flatMap(({ sensor, offer }) => (offer.kind === "available" ? [{ sensor, offer }] : []));
	const controls = [...suite.controls, ...available.flatMap(({ offer }) => offer.controls)];
	const measuresExecutedCode = available.some(
		({ sensor, offer }) =>
			EXECUTED_CODE_SENSORS.includes(sensor) &&
			offer.controls.some((control) => readerOf(readers, control.parser)?.differential),
	);
	const measured = measuresExecutedCode ? tests.measuredCodeWitness?.(question) : undefined;
	const quality = available.find(({ sensor }) => sensor === "quality")?.offer.controls ?? [];
	const referential = plugin.capabilities.quality?.referential?.(question);
	const packages = plugin.capabilities.structure?.packages?.(question);
	const architecture = plugin.capabilities.structure?.architecture?.(question);
	const declaredEnv = plugin.capabilities.workspace?.env ?? [];
	return {
		stack: plugin.id,
		facts,
		// Every control reads the variables its technology declares, and no other of the session.
		controls: controls.map((control) => ({
			...control,
			env_allowlist: [...new Set([...control.env_allowlist, ...declaredEnv])],
		})),
		// A control whose reader names no nature takes the one of the capability that offers it.
		lint_control_ids: controls
			.filter((control) => {
				const nature = readerOf(readers, control.parser)?.nature;
				return nature === "style" || (nature === null && quality.includes(control));
			})
			.map((control) => control.control_id),
		positive_witness: { ...tests.positiveWitness(question), ...measured },
		// The positive witness is one passing case; the module a test calls and asserts on adds one more.
		witness_tests: measured ? 2 : 1,
		negative_witness: tests.negativeWitness(question),
		own_negative_witness: Object.fromEntries(
			[suite, ...available.map(({ offer }) => offer)].flatMap((offer) =>
				Object.entries(offer.own_negative_witness ?? {}),
			),
		),
		reference_positive: available.flatMap(({ offer }) => offer.reference_positive ?? []),
		preparation_paths: tests.preparationPaths(question),
		capability_missing: sensors.flatMap(({ sensor, offer }) => blindSpotOf(BLIND_SPOTS[sensor], offer)),
		recommendations: sensors.flatMap(({ offer }) => recommendationOf(offer)),
		...(referential ? { quality_referential: referential } : {}),
		...(packages ? { main_packages: packages } : {}),
		...(architecture ? { architecture_verification: architecture } : {}),
	};
}

/** What a technology answers for a capability it does not declare. */
function notOffered(stack: string): Offer {
	return { kind: "missing", reason: `the ${stack} technology does not offer it` };
}

function blindSpotOf(phrase: string, offer: Offer): string[] {
	if (offer.kind !== "available") return [`${phrase}: ${offer.reason}`];
	return offer.short_of === undefined ? [] : [`${phrase}: ${offer.short_of}`];
}

function recommendationOf(offer: Offer): RecommendedComplement[] {
	return offer.kind === "missing" && offer.recommendation ? [offer.recommendation] : [];
}
