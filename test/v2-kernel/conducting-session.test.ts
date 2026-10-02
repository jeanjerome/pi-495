import { strict as assert } from "node:assert";
import { describe, it, mock } from "node:test";
import { makeHarness, trackedProject, type TestHarness } from "../helpers/harness-fixture.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixedSources, randomIds, type Clock } from "../../src/application/ids.ts";
import type { AdvanceResult } from "../../src/application/harness.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import { runningIntervention } from "../../src/domain/change/state.ts";
import { DomainError } from "../../src/domain/errors.ts";

const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s-second",
	asserted_at: "2026-09-16T12:00:00.000Z",
});

/** A day after the first session last renewed what it holds: long past any delay a live session renews within. */
const A_DAY_LATER: Clock = { now: () => "2026-09-17T12:00:00.000Z" };

interface FirstSession {
	first: TestHarness;
	changeId: string;
	/** The conduct of the first session, still under way until `finish` lets its intervention end. */
	conducted: Promise<AdvanceResult>;
	finish: () => void;
}

/** A first session conducting a change, whose first intervention runs until the test lets it finish. */
async function firstSessionConducting(clock?: Clock): Promise<FirstSession> {
	const first = makeHarness(clock ? { clock } : {});
	let finish = (): void => {};
	const held = new Promise<void>((resolve) => {
		finish = resolve;
	});
	let started = (): void => {};
	const running = new Promise<void>((resolve) => {
		started = resolve;
	});
	const original = first.agent.startIntervention.bind(first.agent);
	first.agent.startIntervention = async (mandate) => {
		started();
		await held;
		return original(mandate);
	};
	const { change } = await first.harness.start({ project_path: trackedProject(), request_text: "x", actor: HUMAN });
	const conducted = first.harness.advance(change.change_id, { max_steps: 1 });
	await running;
	return { first, changeId: change.change_id, conducted, finish };
}

/** A second Pi session opened on the same data directory as the first. */
function secondSession(first: TestHarness, clock?: Clock): TestHarness {
	return makeHarness({ root: first.root, ids: randomIds, ...(clock ? { clock } : {}) });
}

/** Lets the first session's intervention end, and waits for its conduct whatever it comes to. */
async function settle(session: FirstSession): Promise<unknown> {
	session.finish();
	return session.conducted.then(
		(result) => result,
		(error: unknown) => error,
	);
}

/** The refusal an act met, thrown or returned, or null when the act was accepted. */
async function refusalOf(act: () => unknown): Promise<DomainError | null> {
	try {
		const outcome = await act();
		if (typeof outcome === "object" && outcome !== null && "error" in outcome && outcome.error instanceof DomainError)
			return outcome.error;
		return null;
	} catch (error) {
		if (error instanceof DomainError) return error;
		throw error;
	}
}

describe("one Pi session conducts a change at a time", () => {
	it("une seconde session qui reprend le changement pendant qu'une intervention de la première tourne est refusée avec OPERATION_ACTIVE, et l'intervention de la première est toujours en cours", async () => {
		const session = await firstSessionConducting();
		const { changeId } = session;
		try {
			const second = secondSession(session.first);
			const running = runningIntervention(second.ledger.loadChange(changeId)!.state);
			assert.ok(running, "the first session's intervention runs");

			const refusal = await refusalOf(() => second.harness.resume(changeId, HUMAN));

			assert.equal(refusal?.code, "OPERATION_ACTIVE", "the resume is refused");
			assert.match(refusal.message, /another Pi session conducts/);
			const lease = second.ledger.getLease(`change:${changeId}`);
			assert.ok(lease, "the first session holds the change");
			assert.ok(
				refusal.message.includes(lease.expires_at),
				`the refusal names the time the first session holds the change until: ${refusal.message}`,
			);
			assert.equal(
				runningIntervention(second.ledger.loadChange(changeId)!.state)?.intervention_id,
				running.intervention_id,
				"the first session's intervention is still running in the journal",
			);
		} finally {
			await settle(session);
		}
	});

	it("avancer, vérifier, répondre, clore, révoquer, mettre en pause et annuler depuis une seconde session sont refusés, et la révision du changement n'a pas bougé", async () => {
		const session = await firstSessionConducting();
		const { changeId } = session;
		try {
			const second = secondSession(session.first);
			const before = second.ledger.loadChange(changeId)!.revision;
			const acts: Record<string, () => unknown> = {
				advance: () => second.harness.advance(changeId),
				verify: () => second.harness.verify(changeId),
				answer: () =>
					second.harness.answerDecision(
						changeId,
						{
							decision_id: "dec_asked_of_the_first_session",
							option_id: "answer",
							free_text: "400",
							reason: null,
							subject_revision: before,
							scope: null,
							expires_at: null,
						},
						origin(),
					),
				close: () => second.harness.closeQuestion(changeId, "q1", origin()),
				revoke: () => second.harness.revokeQuestion(changeId, "q1", origin()),
				pause: () => second.harness.pause(changeId, HUMAN),
				cancel: () => second.harness.cancel(changeId, HUMAN, "cancelled from the second session"),
			};
			const refused: Record<string, string> = {};
			for (const [act, run] of Object.entries(acts)) {
				const refusal = await refusalOf(run);
				refused[act] =
					refusal?.code === "OPERATION_ACTIVE" && /another Pi session conducts/.test(refusal.message)
						? "refused: another Pi session conducts the change"
						: `not refused for the first session: ${refusal ? `${refusal.code} ${refusal.message}` : "accepted"}`;
			}

			assert.deepEqual(
				refused,
				Object.fromEntries(Object.keys(acts).map((act) => [act, "refused: another Pi session conducts the change"])),
			);
			assert.equal(second.ledger.loadChange(changeId)!.revision, before, "the change's revision has not moved");
		} finally {
			await settle(session);
		}
	});

	it("une seconde session reprend sans attendre un changement que la première a fini de conduire", async () => {
		const first = makeHarness();
		const { change } = await first.harness.start({ project_path: trackedProject(), request_text: "x", actor: HUMAN });
		await first.harness.advance(change.change_id, { max_steps: 1 });
		const second = secondSession(first);

		assert.equal(await refusalOf(() => second.harness.resume(change.change_id, HUMAN)), null, "the resume is accepted");
	});

	it("une seconde session reprend un changement dont la première a disparu une fois son bail échu, et l'intervention de la première est close comme échouée", async () => {
		const session = await firstSessionConducting();
		const { changeId } = session;
		try {
			const second = secondSession(session.first, A_DAY_LATER);
			const running = runningIntervention(second.ledger.loadChange(changeId)!.state)!;

			assert.equal(await refusalOf(() => second.harness.resume(changeId, HUMAN)), null, "the resume is accepted");

			const closed = second.ledger
				.loadChange(changeId)!
				.state.interventions.find((i) => i.intervention_id === running.intervention_id);
			assert.equal(closed?.result, "failed", "the first session's intervention is closed as failed");
		} finally {
			await settle(session);
		}
	});

	it("une session qui conduit plus longtemps que son bail le renouvelle, et une seconde session est toujours refusée une fois le premier délai passé", async () => {
		mock.timers.enable({ apis: ["setInterval"] });
		const time = fixedSources();
		const session = await firstSessionConducting(time.clock);
		const { changeId } = session;
		try {
			for (let elapsed = 0; elapsed < 60_000; elapsed += 20_000) {
				time.tick(20_000);
				mock.timers.tick(20_000);
			}
			const second = secondSession(session.first, { now: () => "2026-09-16T12:01:30.000Z" });

			const refusal = await refusalOf(() => second.harness.resume(changeId, HUMAN));

			assert.equal(refusal?.code, "OPERATION_ACTIVE", "the first session still holds the change it renewed");
		} finally {
			mock.timers.reset();
			await settle(session);
		}
	});

	it("une session dont le bail a échu sans qu'aucune autre ne l'ait pris, après une mise en veille de la machine, le reprend à son renouvellement suivant, et une seconde session est toujours refusée", async () => {
		mock.timers.enable({ apis: ["setInterval"] });
		const time = fixedSources();
		const session = await firstSessionConducting(time.clock);
		const { changeId } = session;
		try {
			// The machine sleeps two minutes: no renewal runs, and the lease expires a minute in.
			time.tick(120_000);
			time.tick(20_000);
			mock.timers.tick(20_000);
			const second = secondSession(session.first, time.clock);

			const refusal = await refusalOf(() => second.harness.resume(changeId, HUMAN));

			assert.equal(
				refusal?.code,
				"OPERATION_ACTIVE",
				"the first session took its lease back at its next renewal and still holds the change",
			);
		} finally {
			mock.timers.reset();
			await settle(session);
		}
	});

	it("une session dont le bail a échu et a été repris par une autre voit son écriture suivante refusée avec OPERATION_ACTIVE, et le changement n'est pas bloqué par elle", async () => {
		const session = await firstSessionConducting();
		const { changeId } = session;
		const second = secondSession(session.first, A_DAY_LATER);
		second.harness.resume(changeId, HUMAN);
		const resumed = second.ledger.loadChange(changeId)!;

		const outcome = await settle(session);

		const after = second.ledger.loadChange(changeId)!;
		assert.notEqual(
			after.state.status,
			"blocked",
			`the first session does not block the change: ${after.state.stop_reason} ${after.state.stop_detail}`,
		);
		assert.equal(after.revision, resumed.revision, "the first session writes nothing on the change");
		assert.ok(outcome instanceof DomainError, `the first session's write is refused: ${JSON.stringify(outcome)}`);
		assert.equal(outcome.code, "OPERATION_ACTIVE");
	});
});
