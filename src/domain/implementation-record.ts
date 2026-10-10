/**
 * What the producer declared of the adopted plan on a frozen candidate, beside what the kernel read of
 * the diff itself. The kernel executed none of the local checks recorded here: the candidate is judged
 * at G5 on the frozen controls alone, and this record is read as a declaration.
 */
import type { DesignTask } from "../contracts/v1/protocol.ts";
import { type ProducerReport, SELF_REVIEW_ASPECTS } from "../contracts/v1/reports.ts";
import { matchesScope } from "./gates/g4.ts";

interface TaskProgress {
	task_id: string;
	/** As the producer reported it; `not_reported` when its report says nothing of the task. */
	declared_status: string;
	local_checks: { command: string; outcome: string }[];
	deviations: string[];
}

export interface ImplementationRecord {
	candidate_digest: string;
	design_digest: string;
	authority: "producer_declaration";
	/** Each task of the adopted plan, in its order. */
	tasks: TaskProgress[];
	/** Task ids the producer reported that the plan does not hold. */
	unplanned_tasks: string[];
	self_review: { aspect: string; finding: string }[];
	/** The aspects of the self-review the producer named no finding for. */
	self_review_missing: string[];
	/** Read by the kernel on the candidate: each path the producer changed that no task of the plan declared it writes. */
	unplanned_paths: string[];
}

export function implementationRecord(
	plan: readonly DesignTask[],
	report: ProducerReport | null,
	changedPaths: readonly string[],
	subject: { candidate_digest: string; design_digest: string },
): ImplementationRecord {
	const declared = report?.tasks ?? [];
	const planned = new Set(plan.map((t) => t.task_id));
	const selfReview = report?.self_review ?? [];
	const named = new Set(selfReview.map((f) => f.aspect));
	return {
		...subject,
		authority: "producer_declaration",
		tasks: plan.map((t) => {
			const progress = declared.find((d) => d.task_id === t.task_id);
			return {
				task_id: t.task_id,
				declared_status: progress?.status ?? "not_reported",
				local_checks: progress?.local_checks ?? [],
				deviations: progress?.deviations ?? [],
			};
		}),
		unplanned_tasks: declared.map((d) => d.task_id).filter((id) => !planned.has(id)),
		self_review: selfReview,
		self_review_missing: SELF_REVIEW_ASPECTS.filter((a) => !named.has(a)),
		unplanned_paths: changedPaths.filter((p) => !plan.some((t) => t.paths.some((tp) => matchesScope(p, tp)))),
	};
}
