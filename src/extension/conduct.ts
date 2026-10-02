/**
 * Driving a change from a Pi session, and putting the decisions it stops on in front of a human
 * (CMP-PI, IH-01). The kernel decides; this only advances it, says what came back and carries an
 * answer to it. A session that cannot authenticate its human, or has no screen to ask on, says so
 * and records nothing — an answer nobody gave is not an answer.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { locateModel } from "../domain/policy.ts";
import type { ModelSelection } from "../ports/execution.ts";
import { formatDecision, formatStatus } from "../presentation/structured/text.ts";
import { T } from "./labels.ts";
import type { ExtensionSession } from "./session.ts";

/**
 * The model Pi holds as selected, with its thinking level. Pi resolves both when they are read
 * (`createContext`, `core/extensions/runner.js`, Pi 0.87.1), so a model chosen by `/model` after the
 * session started is the one this returns.
 */
export function selectedModel(ctx: ExtensionCommandContext): ModelSelection {
	const model = ctx.model;
	return model
		? {
				provider_id: model.provider,
				model_id: model.id,
				thinking_level: String(ctx.thinkingLevel ?? "off"),
				location: locateModel(model.baseUrl),
			}
		: { provider_id: "", model_id: "", thinking_level: "off", location: "off_machine" };
}

/**
 * Advances the change while holding the session. `inscribe` is written under the same hold before the
 * first step: an act the conduct follows, such as a resume, is refused with it while another operation
 * holds the session, instead of ending a pause or closing a verification under steps still running.
 */
export async function conduct(
	session: ExtensionSession,
	ctx: ExtensionCommandContext,
	changeId: string,
	inscribe: () => void = () => {},
): Promise<void> {
	await session.hold(ctx, async () => {
		inscribe();
		await drive(session, ctx, changeId);
	});
}

/**
 * Advances the change under the hold its caller already took, so an act and the conduct that follows
 * it are one operation of the session: a command started between them is refused as busy.
 */
export async function drive(session: ExtensionSession, ctx: ExtensionCommandContext, changeId: string): Promise<void> {
	const rt = session.runtime();
	rt.harness.deps.onProgress = (m) => session.showProgress(ctx, m);
	const result = await session.withLoader(ctx, "495", async () =>
		rt.harness.advance(changeId, { max_steps: 40, readModel: () => selectedModel(ctx) }),
	);
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
}

const FREE_TEXT_PROMPTS: Record<string, Record<"fr" | "en", string>> = {
	answer: { fr: "Votre réponse", en: "Your answer" },
	extend: { fr: "Votre réponse", en: "Your answer" },
	refuse: { fr: "Motif du refus", en: "Reason for the refusal" },
	revise: { fr: "Ce que l'exigence doit devenir", en: "What the requirement should become" },
};

/** What the owner is asked for beside the option chosen, or null when that option records no text. */
function freeTextPrompt(optionId: string, lang: "fr" | "en"): string | null {
	return FREE_TEXT_PROMPTS[optionId]?.[lang] ?? null;
}

export async function presentDecisions(
	session: ExtensionSession,
	ctx: ExtensionCommandContext,
	changeId: string,
): Promise<void> {
	const rt = session.runtime();
	const pending = rt.harness.pendingDecisions(changeId);
	if (pending.length === 0) {
		session.emit(ctx, T[session.lang()].noPendingDecision);
		return;
	}
	const origin = session.humanOrigin(ctx);
	for (const req of pending) {
		session.emit(ctx, formatDecision(req), { decision: req });
		if (!origin || !ctx.hasUI) {
			session.emit(ctx, T[session.lang()].decisionRequired(req.decision_id), { decision_required: req.decision_id });
			continue;
		}
		const choice = await ctx.ui.select(req.question, [
			...req.options.map((o) => `${o.id} — ${o.label}${o.risky ? " ⚠" : ""}`),
			T[session.lang()].later,
		]);
		if (!choice || choice.startsWith("(")) continue;
		const optionId = choice.split(" — ")[0]!;
		let freeText: string | null = null;
		// A refusal that carries no reason leaves the dossier with a blocked change and nothing to
		// read; only the interactions whose text is actually recorded are asked for one.
		const prompt = req.allow_free_text ? freeTextPrompt(optionId, session.lang()) : null;
		if (prompt) freeText = (await ctx.ui.input(prompt)) ?? null;
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
			session.emit(ctx, `${T[session.lang()].decisionRefused}: ${answer.error.code} ${answer.error.message}`);
		else session.emit(ctx, `${T[session.lang()].decisionRecorded}: ${answer.decision?.human_decision_id}`);
		session.updateFooter(ctx, answer.view);
	}
}
