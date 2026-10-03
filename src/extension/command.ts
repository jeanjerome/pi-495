/**
 * The `/495` command (CMP-PI, UX-02): one deterministic subcommand per act a human may ask of the
 * harness, answering the same way on a screen, in print, in JSON and over RPC. It decides nothing —
 * every subcommand reaches the application controller through the session it is handed.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { VERSION, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ActorRef } from "../contracts/v1/common.ts";
import type { HumanOrigin } from "../contracts/v1/decision.ts";
import type { ChangeState, Deliverable } from "../domain/change/state.ts";
import { DomainError, messageOf } from "../domain/errors.ts";
import type { ProgramState } from "../domain/program/program.ts";
import { formatReport, formatStatus } from "../presentation/structured/text.ts";
import { exportChange, verifyExport } from "../export/export-service.ts";
import { conduct, drive, presentDecisions } from "./conduct.ts";
import { T } from "./labels.ts";
import { openReviewTui } from "./review-command.ts";
import type { HarnessRuntime } from "./runtime.ts";
import { type ExtensionSession, VERSION_495, kernelUser, safeUser } from "./session.ts";

const SUBCOMMANDS = [
	"start",
	"adopt",
	"next",
	"state",
	"status",
	"resume",
	"review",
	"report",
	"verify",
	"decide",
	"integrate",
	"export",
	"pause",
	"close",
	"revoke",
	"cancel",
	"bind",
	"unbind",
	"help",
] as const;

type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(word: string | undefined): word is Subcommand {
	return (SUBCOMMANDS as readonly (string | undefined)[]).includes(word);
}

/** One `/495` invocation: the session and context it runs in, the runtime, and the words after the subcommand. */
interface Call {
	session: ExtensionSession;
	ctx: ExtensionCommandContext;
	rt: HarnessRuntime;
	rest: string[];
	text: string;
}

type Handler = (call: Call) => Promise<void> | void;

export function registerCommand495(pi: ExtensionAPI, session: ExtensionSession): void {
	pi.registerCommand("495", {
		description:
			"495 harness: start|adopt|next|state|status|resume|review|report|verify|decide|integrate|export|pause|close|revoke|cancel|bind|unbind",
		getArgumentCompletions: (prefix) => {
			const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s }));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const [sub, ...rest] = (args ?? "").trim().split(/\s+/);
			const text = rest.join(" ").trim();
			session.flushDiagnostics(ctx);
			try {
				const rt = session.runtime();
				await HANDLERS[isSubcommand(sub) ? sub : "help"]({ session, ctx, rt, rest, text });
			} catch (error) {
				const msg = error instanceof DomainError ? `${error.code}: ${error.message}` : messageOf(error);
				session.emit(ctx, `495 error: ${msg}`, {
					error: error instanceof DomainError ? error.toCanonical() : { message: msg },
				});
				session.updateFooter(ctx, session.currentView());
			}
		},
	});
}

/** The change the session is bound to, or null once the session has said it has none. */
function bound(session: ExtensionSession, ctx: ExtensionCommandContext): ExtensionSession["binding"] {
	if (!session.binding) session.emit(ctx, "no binding");
	return session.binding;
}

/** Who asks: the human the host authenticates, or the local user, unauthenticated, in print and JSON. */
function requester(session: ExtensionSession, ctx: ExtensionCommandContext): ActorRef {
	return (
		session.humanOrigin(ctx)?.actor ?? {
			actor_id: safeUser(),
			actor_type: "human",
			role: "requester",
			origin: ctx.mode === "json" ? "json" : "print",
			authentication_level: "none",
		}
	);
}

/**
 * Creates a change from the text after the subcommand, binds the session to it and conducts it. What
 * the change is created from — a request, a question on the project, a trajectory — is `create`'s.
 */
async function openChange(
	{ session, ctx, text }: Call,
	usage: string,
	loader: string,
	create: (actor: ActorRef) => Promise<{ program: ProgramState; change: ChangeState }>,
): Promise<void> {
	if (!text) {
		session.emit(ctx, usage);
		return;
	}
	if (session.binding) {
		session.emit(ctx, T[session.lang()].alreadyBound(session.binding.change_id));
		return;
	}
	const created = await session.withLoader(ctx, loader, () => create(requester(session, ctx)));
	session.bind(ctx, { program_id: created.program.program_id, change_id: created.change.change_id });
	session.emit(ctx, `${T[session.lang()].programCreated}: ${created.program.program_id} / ${created.change.change_id}`);
	await conduct(session, ctx, created.change.change_id);
}

/** A change whose deliverable is a candidate an agent writes, or the state of the project measured on the reference. */
function openRequest(call: Call, deliverable: Deliverable, usage: string, loader: string): Promise<void> {
	return openChange(call, usage, loader, (actor) =>
		call.rt.harness.start({
			project_path: call.ctx.cwd,
			request_text: call.text,
			actor,
			language: call.session.lang(),
			deliverable,
		}),
	);
}

const HANDLERS: Record<Subcommand, Handler> = {
	start: (call) => openRequest(call, "candidate", "usage: /495 start <request text>", "495 start"),
	state: (call) => openRequest(call, "state", "usage: /495 state <question about the project>", "495 state"),
	// The document is read as JSON and handed over as data: nothing in it is executed.
	adopt: (call) =>
		openChange(call, "usage: /495 adopt <trajectory.json>", "495 adopt", async (actor) =>
			call.rt.harness.adopt({
				project_path: call.ctx.cwd,
				trajectory: JSON.parse(await readFile(resolve(call.ctx.cwd, call.text), "utf8")),
				actor,
				language: call.session.lang(),
			}),
		),
	// The kernel's refusal — another increment still open, the program closed, none ready — reaches the
	// owner with its code and message, and leaves the session bound where it was.
	next: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const started = await session.withLoader(ctx, "495 next", () =>
			rt.harness.startNext({
				program_id: binding.program_id,
				actor: requester(session, ctx),
				language: session.lang(),
			}),
		);
		session.bind(ctx, { program_id: started.program.program_id, change_id: started.change.change_id });
		session.emit(
			ctx,
			`${T[session.lang()].incrementStarted}: ${started.change.increment_id} / ${started.change.change_id}`,
		);
		await conduct(session, ctx, started.change.change_id);
	},
	status: ({ session, ctx }) => {
		const view = session.currentView();
		session.updateFooter(ctx, view);
		session.emit(ctx, view ? formatStatus(view, session.lang()) : T[session.lang()].noProgram, { view });
	},
	resume: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const changeId = binding.change_id;
		await conduct(session, ctx, changeId, () =>
			rt.harness.resume(changeId, session.humanOrigin(ctx)?.actor ?? kernelUser()),
		);
	},
	review: async ({ session, ctx, rt, rest }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const review = await rt.harness.openReview(binding.change_id, rest[0]?.startsWith("cand_") ? rest[0] : undefined);
		if (ctx.mode === "tui") await openReviewTui(ctx, review, session.lang());
		else {
			const { summarizeReview } = await import("../presentation/structured/review-text.ts");
			session.emit(
				ctx,
				await summarizeReview(review, rest[0] && !rest[0].startsWith("cand_") ? rest[0] : null, session.lang()),
				{ snapshot: review.snapshot },
			);
		}
	},
	report: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const report = await rt.harness.report(binding.change_id);
		session.emit(ctx, formatReport(report, session.lang()), { report });
	},
	verify: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const changeId = binding.change_id;
		await session.hold(ctx, async () => {
			const result = await session.withLoader(ctx, "495 verify", async () => rt.harness.verify(changeId));
			session.emit(ctx, formatStatus(result.view, session.lang()), { view: result.view });
			session.updateFooter(ctx, result.view);
		});
	},
	decide: async ({ session, ctx }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		await presentDecisions(session, ctx, binding.change_id);
	},
	integrate: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		if (!rt.config.policy.integration_enabled) {
			session.emit(ctx, T[session.lang()].integrationDisabled);
			return;
		}
		await conduct(session, ctx, binding.change_id);
	},
	export: async ({ session, ctx, rt, rest }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const redact = rest.includes("--redact");
		const dest = join(rt.dataDir, "exports", `${binding.change_id}-${redact ? "redacted" : "full"}-${Date.now()}`);
		const result = await exportChange(rt.ledger, rt.objects, {
			change_id: binding.change_id,
			destination: dest,
			redact,
			now: new Date().toISOString(),
			producer: `495 ${VERSION}`,
		});
		const check = await verifyExport(dest);
		session.emit(
			ctx,
			`Export: ${result.path}\n${result.files} files, ${result.bytes} bytes, ${result.redactions} redactions${result.missing.length ? `, missing: ${result.missing.join(", ")}` : ""}\nverify: ${check.ok ? "ok" : check.problems.join("; ")}`,
			{ export: result, verify: check },
		);
	},
	pause: async ({ session, ctx, rt }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		await rt.harness.abortCurrent("pause");
		session.emit(
			ctx,
			formatStatus(
				rt.harness.pause(binding.change_id, session.humanOrigin(ctx)?.actor ?? kernelUser()),
				session.lang(),
			),
		);
	},
	close: ({ session, ctx, rt, text }) =>
		actOnQuestion(session, ctx, text, {
			usage: "usage: /495 close <question>",
			noOrigin: {
				fr: "La clôture exige une provenance humaine (TUI ou hôte RPC ou SDK qualifié).",
				en: "Closing a question requires a human origin.",
			},
			confirmation: (question) => ({
				fr: `Clore la question ${question} ? Elle n'est plus matérielle ; sa réponse ne liera plus aucune exigence.`,
				en: `Close question ${question}? It is no longer material; its answer will no longer bind any requirement.`,
			}),
			inscribe: (changeId, question, origin) => rt.harness.closeQuestion(changeId, question, origin),
		}),
	revoke: ({ session, ctx, rt, text }) =>
		actOnQuestion(session, ctx, text, {
			usage: "usage: /495 revoke <question>",
			noOrigin: {
				fr: "La révocation exige une provenance humaine (TUI ou hôte RPC ou SDK qualifié).",
				en: "Revoking a question's resolution requires a human origin.",
			},
			confirmation: (question) => ({
				fr: `Révoquer ce que vous avez décidé de la question ${question} ? Elle vous sera reposée, et le mandat, les exigences et tout ce qui a été adopté depuis ne le seront plus.`,
				en: `Revoke what you decided on question ${question}? It will be asked again, and the mandate, the requirements and everything adopted since will no longer be adopted.`,
			}),
			inscribe: (changeId, question, origin) => rt.harness.revokeQuestion(changeId, question, origin),
		}),
	cancel: async ({ session, ctx, rt, text }) => {
		const binding = bound(session, ctx);
		if (!binding) return;
		const origin = session.humanOrigin(ctx);
		if (!origin) {
			session.emit(ctx, T[session.lang()].cancelNoOrigin);
			return;
		}
		if (ctx.hasUI && !(await ctx.ui.confirm("495", T[session.lang()].cancelConfirmation))) return;
		await rt.harness.abortCurrent("cancel");
		session.emit(
			ctx,
			formatStatus(rt.harness.cancel(binding.change_id, origin.actor, text || "cancelled from Pi"), session.lang()),
		);
	},
	bind: ({ session, ctx, rt, rest }) => {
		const target = rest[0];
		if (!target) {
			const list = rt.ledger
				.listChanges()
				.filter((c) => c.phase !== "closed")
				.map((c) => `${c.change_id} ${c.phase}/${c.status} (${c.program_id})`);
			session.emit(ctx, list.length ? list.join("\n") : "no change recorded");
			return;
		}
		const loaded = rt.ledger.loadChange(target);
		if (!loaded) {
			session.emit(ctx, `unknown change ${target}`);
			return;
		}
		session.bind(ctx, { program_id: loaded.state.program_id, change_id: target });
		session.emit(ctx, formatStatus(rt.harness.status(target), session.lang()));
	},
	unbind: ({ session, ctx, rt }) => {
		rt.ledger.unbindSession(ctx.sessionManager.getSessionId());
		session.binding = null;
		session.updateFooter(ctx, null);
		session.emit(ctx, "unbound");
	},
	help: ({ session, ctx }) => {
		session.emit(
			ctx,
			`495 — the spec-driven agentic harness — v${VERSION_495}\n/495 start ${T[session.lang()].request} · status · adopt <trajectory.json> · next · state <question> · resume · review [path|cand_id] · report · verify · decide · integrate · export [--redact] · pause · close <question> · revoke <question> · cancel · bind [change_id] · unbind`,
		);
	},
};

/** An owner's act on one material question: what it says, what it confirms, and how it is inscribed. */
interface QuestionAct {
	usage: string;
	/** What the session says when it cannot authenticate its human. */
	noOrigin: Record<"fr" | "en", string>;
	/** The confirmation put to the owner on a dialog-capable session: what the act undoes. */
	confirmation: (question: string) => Record<"fr" | "en", string>;
	inscribe: (changeId: string, question: string, origin: HumanOrigin) => { error: DomainError | null };
}

/**
 * `/495 close` and `/495 revoke`: a binding, a question and a free session required, a human origin
 * required, the act confirmed on a dialog-capable session, then the change conducted onward. A
 * refusal of the kernel is displayed with its code and reason, and nothing else happens.
 */
async function actOnQuestion(
	session: ExtensionSession,
	ctx: ExtensionCommandContext,
	question: string,
	act: QuestionAct,
): Promise<void> {
	const binding = bound(session, ctx);
	if (!binding) return;
	if (!question) {
		session.emit(ctx, act.usage);
		return;
	}
	const changeId = binding.change_id;
	// Held from here to the end of the conduct that follows the act: a conduct running concurrently commits
	// between two of its own steps, and an act landing in that gap either loses a race to
	// REVISION_CONFLICT, or lands between the end of an intervention and the artifact it paid for, losing
	// that artifact instead; a command started between the act and its conduct would find the session
	// free and have the act's conduct refused.
	await session.hold(ctx, async () => {
		const origin = session.humanOrigin(ctx);
		if (!origin) {
			session.emit(ctx, act.noOrigin[session.lang()]);
			return;
		}
		if (ctx.hasUI && !(await ctx.ui.confirm("495", act.confirmation(question)[session.lang()]))) return;
		const { error } = act.inscribe(changeId, question, origin);
		if (error) {
			session.emit(ctx, `495 error: ${error.code}: ${error.message}`, { error: error.toCanonical() });
			return;
		}
		await drive(session, ctx, changeId);
	});
}
