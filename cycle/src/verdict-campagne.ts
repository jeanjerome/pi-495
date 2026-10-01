/**
 * What a reference campaign proves about 495, read from the dossier the campaign left. The model's
 * work is not judged here: a candidate whose tests are wrong fails G5 and says so in the report. What
 * is judged is the harness — whether it qualified every control it declared, ran each on the candidate
 * and read a report where one was due — because those are the failures a model cannot cause.
 */

export interface EtatLu {
	statut: string;
	arret: string | null;
	/** Verdict of each gate the change reached, by gate name. */
	portes: Record<string, string>;
}

export interface PreuveLue {
	controle: string;
	verdict: string;
	/** The protocol the evidence was produced under; the qualification witnesses carry `qualification`. */
	protocole: string;
	faits: Record<string, unknown>;
}

export interface VerdictCampagne {
	/** What the campaign observed, for the report. */
	constats: string[];
	/** What only the harness can have caused: a campaign with one is a regression. */
	defauts: string[];
}

const QUALIFICATION = "qualification";

/** A sensor that read nothing although the candidate gave it something to read. */
function rapportAbsent(preuve: PreuveLue): boolean {
	const { controle, faits } = preuve;
	if (controle === "coverage") return Number(faits.introduced_lines) > 0 && Number(faits.reports) === 0;
	if (controle === "mutation") return Number(faits.scoped_files) > 0 && Number(faits.reports) === 0;
	return false;
}

/** The last evidence of each control the candidate was judged by, in the order the preuves are given. */
function dernieresPreuvesDuCandidat(preuves: PreuveLue[]): PreuveLue[] {
	const parControle = new Map<string, PreuveLue>();
	for (const preuve of preuves) {
		if (preuve.protocole === QUALIFICATION || preuve.faits.run === "reference") continue;
		parControle.set(preuve.controle, preuve);
	}
	return [...parControle.values()];
}

export function jugerCampagne(etat: EtatLu, preuves: PreuveLue[]): VerdictCampagne {
	const defauts: string[] = [];
	const constats = [`status ${etat.statut}${etat.arret ? ` (${etat.arret})` : ""}`];
	for (const [porte, verdict] of Object.entries(etat.portes)) constats.push(`${porte} ${verdict}`);

	if (etat.arret === "capability_missing") defauts.push("the change is blocked on capability_missing");
	if (etat.portes.G2 !== "PASS") defauts.push(`G2 is ${etat.portes.G2 ?? "not reached"}: the protocol was not frozen`);
	else if (etat.portes.G5 === undefined) defauts.push("the campaign did not reach the verification of the candidate");

	for (const preuve of dernieresPreuvesDuCandidat(preuves)) {
		constats.push(`${preuve.controle} ${preuve.verdict} on the candidate`);
		if (preuve.verdict === "INDETERMINATE") defauts.push(`${preuve.controle} is INDETERMINATE on the candidate`);
		if (rapportAbsent(preuve)) defauts.push(`${preuve.controle} read no report although the candidate introduced code`);
	}
	return { constats, defauts };
}
