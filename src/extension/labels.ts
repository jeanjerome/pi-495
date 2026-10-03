/**
 * What the `/495` command and the conduct of a change say to the owner (CMP-PI), one table per
 * language, as `presentation/structured/text.ts` holds the words of a status.
 */
const fr = {
	alreadyBound: (changeId: string) =>
		`Cette session est déjà liée à ${changeId} ; /495 status, /495 resume ou /495 unbind.`,
	programCreated: "Programme créé",
	incrementStarted: "Incrément démarré",
	noProgram: "Aucun programme lié à cette session. /495 start <demande> ou /495 bind <change_id>.",
	integrationDisabled: "L'intégration est désactivée par la politique (HARNESS495_INTEGRATION=1 ou config.json).",
	cancelNoOrigin: "L'annulation exige une provenance humaine (TUI ou hôte RPC qualifié).",
	cancelConfirmation: "Annuler le changement ? Le dossier est conservé.",
	request: "<demande>",
	noPendingDecision: "Aucune décision en attente.",
	decisionRequired: (decisionId: string) =>
		`decision_required: ${decisionId} — répondez dans le TUI Pi avec /495 decide (reprise: /495 resume dans une session liée).`,
	later: "(plus tard)",
	decisionRefused: "Décision refusée",
	decisionRecorded: "Décision enregistrée",
};

const en: typeof fr = {
	alreadyBound: (changeId) => `This session is bound to ${changeId}; use /495 status, resume or unbind.`,
	programCreated: "Program created",
	incrementStarted: "Increment started",
	noProgram: "No program bound. /495 start <request> or /495 bind <change_id>.",
	integrationDisabled: "Integration is disabled by policy.",
	cancelNoOrigin: "Cancellation requires a human origin.",
	cancelConfirmation: "Cancel the change? The dossier is kept.",
	request: "<request>",
	noPendingDecision: "No pending decision.",
	decisionRequired: (decisionId) => `decision_required: ${decisionId} — answer in the Pi TUI with /495 decide.`,
	later: "(later)",
	decisionRefused: "Decision refused",
	decisionRecorded: "Decision recorded",
};

export const T = { fr, en };
