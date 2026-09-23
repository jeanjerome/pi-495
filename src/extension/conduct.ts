/**
 * Driving a change from a Pi session, and putting the decisions it stops on in front of a human
 * (CMP-PI, IH-01). The kernel decides; this only advances it, says what came back and carries an
 * answer to it. A session that cannot authenticate its human, or has no screen to ask on, says so
 * and records nothing — an answer nobody gave is not an answer.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { formatDecision, formatStatus } from "../presentation/structured/text.ts";
import type { ExtensionSession } from "./session.ts";

export async function conduct(
	session: ExtensionSession,
	ctx: ExtensionCommandContext,
	changeId: string,
): Promise<void> {
	const rt = session.runtime();
	if (session.busy) {
		session.emit(ctx, "495: une opération est déjà en cours dans cette session.");
		return;
	}
	session.busy = true;
	try {
		rt.harness.deps.onProgress = (m) => {
			if (ctx.hasUI) ctx.ui.setStatus("495", `495 ${m}`);
		};
		const result = await session.withLoader(ctx, "495", async () => rt.harness.advance(changeId, { max_steps: 40 }));
		session.updateFooter(ctx, result.view);
		session.emit(
			ctx,
			`${formatStatus(result.view, session.lang())}\n${result.steps.length ? `\n${result.steps.join("\n")}` : ""}`,
			{
				view: result.view,
				stopped_because: result.stopped_because,
			},
		);
		if (result.stopped_because === "decision_required") await presentDecisions(session, ctx, changeId);
	} finally {
		session.busy = false;
	}
}

export async function presentDecisions(
	session: ExtensionSession,
	ctx: ExtensionCommandContext,
	changeId: string,
): Promise<void> {
	const rt = session.runtime();
	const pending = rt.harness.pendingDecisions(changeId);
	if (pending.length === 0) {
		session.emit(ctx, session.lang() === "fr" ? "Aucune décision en attente." : "No pending decision.");
		return;
	}
	const origin = session.humanOrigin(ctx);
	for (const req of pending) {
		session.emit(ctx, formatDecision(req), { decision: req });
		if (!origin || !ctx.hasUI) {
			session.emit(
				ctx,
				session.lang() === "fr"
					? `decision_required: ${req.decision_id} — répondez dans le TUI Pi avec /495 decide (reprise: /495 resume dans une session liée).`
					: `decision_required: ${req.decision_id} — answer in the Pi TUI with /495 decide.`,
				{ decision_required: req.decision_id },
			);
			continue;
		}
		const choice = await ctx.ui.select(req.question, [
			...req.options.map((o) => `${o.id} — ${o.label}${o.risky ? " ⚠" : ""}`),
			session.lang() === "fr" ? "(plus tard)" : "(later)",
		]);
		if (!choice || choice.startsWith("(")) continue;
		const optionId = choice.split(" — ")[0]!;
		let freeText: string | null = null;
		// A refusal that carries no reason leaves the dossier with a blocked change and nothing to
		// read; only the interactions whose text is actually recorded are asked for one.
		if (req.allow_free_text && (optionId === "answer" || optionId === "extend" || optionId === "refuse"))
			freeText =
				(await ctx.ui.input(
					session.lang() === "fr"
						? optionId === "refuse"
							? "Motif du refus"
							: "Votre réponse"
						: optionId === "refuse"
							? "Reason for the refusal"
							: "Your answer",
				)) ?? null;
		const answer = rt.harness.answerDecision(
			changeId,
			{
				decision_id: req.decision_id,
				option_id: optionId,
				free_text: freeText,
				reason: null,
				subject_revision: req.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin,
		);
		if (answer.error)
			session.emit(
				ctx,
				`${session.lang() === "fr" ? "Décision refusée" : "Decision refused"}: ${answer.error.code} ${answer.error.message}`,
			);
		else
			session.emit(
				ctx,
				`${session.lang() === "fr" ? "Décision enregistrée" : "Decision recorded"}: ${answer.decision?.human_decision_id}`,
			);
		session.updateFooter(ctx, answer.view);
	}
}
