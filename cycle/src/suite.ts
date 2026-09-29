/**
 * The run of epics the owner marked ready, one after the other: the first ready epic not landed,
 * its next story written when the plan lists none pending, the story driven to its landing, the plan
 * updated, and on to the next until nothing is left. It starts from `main` with a clean tree and
 * stops, with the reason, at the first story that blocks. Nothing is pushed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arbrePropre, brancheCourante, git } from "./git.ts";
import { type Gravite, defautDeLaStory, defautsOuverts, marquerCorrige } from "./registre.ts";
import { invite } from "./invite.ts";
import { Journal } from "./journal.ts";
import { type EpicDuPlan, lirePlan, marquerEpic, marquerStory, prochaineEpic, prochaineStory } from "./plan.ts";
import { lancerSession } from "./session.ts";
import { lireStory } from "./story.ts";

export interface OptionsSuite {
	root: string;
	/** Where the journals live: one per story, and one per epic for the stories written here. */
	racine: string;
	cible: string;
	/** Drives a story to its landing and answers 0, or the code it stopped with. */
	deroulerStory: (id: string) => Promise<number>;
	claude?: string;
	annonce?: (texte: string) => void;
	suivi?: (nom: string, ligne: string) => void;
}

/** A story cannot be listed pending without a file the cycle can read. */
function fichierDeLaStory(root: string, id: string): boolean {
	try {
		lireStory(id, root);
		return true;
	} catch {
		return false;
	}
}

function bloc(root: string, epic: string): string {
	const lignes = readFileSync(join(root, "specs", "plan.yaml"), "utf8").split("\n");
	const debut = lignes.indexOf(`  - id: ${epic}`);
	let fin = debut + 1;
	while (fin < lignes.length && !/^ {2}- id: /.test(lignes[fin]!) && !/^[a-z]/.test(lignes[fin]!)) fin++;
	return lignes.slice(debut, fin).join("\n").trimEnd();
}

function commiter(root: string, message: string, chemins: string[]): void {
	git(root, ["add", "--", ...chemins]);
	git(root, ["commit", "-q", "-m", message]);
}

/** Paths a drafting session may leave modified: the story and the plan, nothing else. */
function horsDeLaRedaction(root: string): string[] {
	return (
		git(root, ["status", "--porcelain"])
			.split("\n")
			.filter((l) => l !== "")
			// `git()` trims its output, so the first line may have lost the space of its status column.
			.map((l) => l.trim().replace(/^\S{1,2}\s+/, ""))
			.filter((p) => p !== "specs/plan.yaml" && !p.startsWith("specs/stories/"))
	);
}

type Redaction = { fait: true; epicVersee?: true } | { fait: false; code: number; motif: string };

async function rediger(o: OptionsSuite, epic: EpicDuPlan, attendue: string | null): Promise<Redaction> {
	const journal = new Journal(epic.id, o.racine);
	const versees = epic.stories.filter((s) => s.statut === "versée");
	o.annonce?.(`rédaction de la prochaine story de ${epic.id}…`);
	const s = await lancerSession(
		{
			invite: invite("redaction", {
				epic: epic.id,
				attendue: attendue ?? "aucune : décide si les stories versées livrent l'objet de l'epic",
				epic_plan: bloc(o.root, epic.id),
				versees: versees.length === 0 ? "(aucune)" : versees.map((v) => `- ${v.id} : ${v.titre}`).join("\n"),
			}),
			schema: {
				type: "object",
				properties: {
					status: { type: "string", enum: ["ecrite", "complete", "bloque"] },
					story_id: { type: "string" },
					message: { type: "string" },
					resume: { type: "string" },
				},
				required: ["status", "story_id", "message", "resume"],
			},
			cwd: o.root,
			...(o.claude ? { claude: o.claude } : {}),
			...(o.suivi ? { suivi: (ligne: string) => o.suivi?.("redaction", ligne) } : {}),
		},
		journal,
	);
	journal.inscrire("story", "session", {
		nom: "redaction",
		ok: s.ok,
		cout_usd: s.cout_usd,
		duree_ms: s.duree_ms,
		tours: s.tours,
		session_id: s.session_id,
		transcript: s.transcript,
		resume: s.resume.slice(0, 2000),
	});
	const arret = (motif: string): Redaction => ({ fait: false, code: 1, motif });
	if (!s.ok || !s.sortie) return arret(`drafting session for ${epic.id}: ${s.resume}`);
	const sortie = s.sortie as { status: string; story_id: string; message: string; resume: string };
	if (sortie.status === "bloque") return arret(`${epic.id} is not ready to run unattended: ${sortie.resume}`);
	if (sortie.status === "complete") {
		if (versees.length === 0)
			return arret(`${epic.id}: the drafting session finds the epic complete with no story landed`);
		marquerEpic(o.root, epic.id, "versé");
		commiter(o.root, `docs: the plan marks ${epic.id} landed`, ["specs/plan.yaml"]);
		return { fait: true, epicVersee: true };
	}
	const autre = horsDeLaRedaction(o.root);
	if (autre.length > 0)
		return arret(`the drafting session modified files beyond the story and the plan: ${autre.join(", ")}`);
	const prochaine = prochaineStory(lirePlan(o.root).find((e) => e.id === epic.id) ?? epic);
	if (!prochaine || prochaine.id !== sortie.story_id || !fichierDeLaStory(o.root, prochaine.id))
		return arret(
			`${epic.id}: the drafting session did not leave a readable story ${sortie.story_id} listed pending in the plan`,
		);
	commiter(o.root, sortie.message.split("\n")[0]!.trim(), ["specs"]);
	return { fait: true };
}

/** The epic the cycle drives itself, never marked ready: the stories that repair the registry's defects. */
const EPIC_DES_CORRECTIFS = "e28";

/** How many defects one phase repairs before it hands back, so a long registry does not run without end. */
function defautsMax(): number {
	return Number(process.env.CYCLE_495_DEFAUTS_MAX ?? 5);
}

export interface Ecartes {
	bug_id: string;
	raison: string;
}

function storyDuCorrectif(o: OptionsSuite): { id: string; titre: string } | null {
	const epic = lirePlan(o.root).find((e) => e.id === EPIC_DES_CORRECTIFS);
	const s = epic?.stories.find((x) => x.statut !== "versée" && fichierDeLaStory(o.root, x.id));
	return s ? { id: s.id, titre: s.titre } : null;
}

/**
 * Repairs the open defects of at least `seuil` severity that need no product decision, one story
 * each, until none is left or the phase's ceiling is reached. The defects the session sets aside are
 * returned, not repaired: they are the owner's.
 */
export async function corrigerDefauts(
	o: OptionsSuite,
	seuil: Gravite,
	contexte: string,
): Promise<{ code: number; aDecider: Ecartes[] }> {
	const journal = new Journal(EPIC_DES_CORRECTIFS, o.racine);
	let aDecider: Ecartes[] = [];
	for (let corriges = 0; corriges < defautsMax(); ) {
		let story = storyDuCorrectif(o);
		if (!story) {
			const ouverts = defautsOuverts(o.root, seuil);
			if (ouverts.length === 0) break;
			o.annonce?.(`choix du prochain défaut à corriger (${ouverts.length} ouvert(s) de gravité ${seuil} ou plus)…`);
			const s = await lancerSession(
				{
					invite: invite("correctif", {
						seuil,
						contexte,
						defauts: ouverts.map((d) => `- ${d.id} (${d.gravite}) : ${d.titre}`).join("\n"),
					}),
					schema: {
						type: "object",
						properties: {
							status: { type: "string", enum: ["ecrite", "aucun"] },
							story_id: { type: "string" },
							bug_id: { type: "string" },
							message: { type: "string" },
							resume: { type: "string" },
							a_decider: {
								type: "array",
								items: {
									type: "object",
									properties: { bug_id: { type: "string" }, raison: { type: "string" } },
									required: ["bug_id", "raison"],
								},
							},
						},
						required: ["status", "story_id", "bug_id", "message", "resume", "a_decider"],
					},
					cwd: o.root,
					...(o.claude ? { claude: o.claude } : {}),
					...(o.suivi ? { suivi: (ligne: string) => o.suivi?.("correctif", ligne) } : {}),
				},
				journal,
			);
			journal.inscrire("story", "session", {
				nom: "correctif",
				ok: s.ok,
				cout_usd: s.cout_usd,
				duree_ms: s.duree_ms,
				tours: s.tours,
				session_id: s.session_id,
				transcript: s.transcript,
				resume: s.resume.slice(0, 2000),
			});
			if (!s.ok || !s.sortie) {
				o.annonce?.(`⛔ session de correctif : ${s.resume}`);
				return { code: 1, aDecider };
			}
			const sortie = s.sortie as {
				status: string;
				story_id: string;
				bug_id: string;
				message: string;
				a_decider: Ecartes[];
			};
			aDecider = sortie.a_decider;
			if (sortie.status === "aucun") break;
			const autre = horsDeLaRedaction(o.root);
			const ecrite = storyDuCorrectif(o);
			const cite =
				ecrite && fichierDeLaStory(o.root, ecrite.id)
					? defautDeLaStory(readFileSync(lireStory(ecrite.id, o.root).chemin, "utf8"))
					: null;
			if (
				autre.length > 0 ||
				!ecrite ||
				ecrite.id !== sortie.story_id ||
				cite !== sortie.bug_id ||
				!ouverts.some((d) => d.id === cite)
			) {
				o.annonce?.(
					`⛔ la session de correctif n'a pas laissé une story lisible qui cite un défaut ouvert (${autre.join(", ") || sortie.story_id})`,
				);
				return { code: 1, aDecider };
			}
			commiter(o.root, sortie.message.split("\n")[0]!.trim(), ["specs"]);
			story = ecrite;
		}
		const code = await o.deroulerStory(story.id);
		if (code !== 0) return { code, aDecider };
		const bug = defautDeLaStory(readFileSync(lireStory(story.id, o.root).chemin, "utf8"));
		const sha = new Journal(story.id, o.racine).dernier("verse", "versement")?.commit;
		if (!bug || typeof sha !== "string") {
			o.annonce?.(
				`⛔ ${story.id} est versée sans le défaut qu'elle corrige ou sans sa révision : le registre n'est pas mis à jour`,
			);
			return { code: 1, aDecider };
		}
		marquerStory(o.root, story.id, "versée");
		marquerCorrige(o.root, bug, sha.slice(0, 7));
		commiter(o.root, `docs: the plan marks ${story.id} landed and the registry marks its defect fixed`, ["specs"]);
		corriges++;
	}
	return { code: 0, aDecider };
}

function annoncerADecider(o: OptionsSuite, aDecider: Ecartes[]): void {
	if (aDecider.length === 0) return;
	o.annonce?.(
		`défauts qui demandent une décision du propriétaire :\n${aDecider.map((d) => `- ${d.bug_id} : ${d.raison}`).join("\n")}`,
	);
}

/** Runs the ready epics in plan order. Returns 0 when none is left, else the code of the first stop. */
export async function suite(o: OptionsSuite): Promise<number> {
	let epicsVersees = 0;
	let finDEpic = false;
	const aDeciderTous = new Map<string, string>();
	const noter = (l: Ecartes[]): void => {
		for (const d of l) aDeciderTous.set(d.bug_id, d.raison);
	};
	for (;;) {
		if (brancheCourante(o.root) !== o.cible) {
			o.annonce?.(`⛔ la suite part de ${o.cible} : la branche courante est ${brancheCourante(o.root)}`);
			return 1;
		}
		if (!arbrePropre(o.root)) {
			o.annonce?.("⛔ la suite part d'un arbre propre : des fichiers sont modifiés");
			return 1;
		}
		if (finDEpic) {
			const r = await corrigerDefauts(
				o,
				"medium",
				"une epic vient d'être versée : ses défauts se réparent avant la suivante",
			);
			noter(r.aDecider);
			if (r.code !== 0) return r.code;
			finDEpic = false;
			continue;
		}
		const epic = prochaineEpic(lirePlan(o.root));
		if (!epic) {
			if (epicsVersees > 0) {
				const r = await corrigerDefauts(
					o,
					"low",
					"la suite a fini ses epics : les défauts faibles se réparent maintenant",
				);
				noter(r.aDecider);
				if (r.code !== 0) return r.code;
			}
			annoncerADecider(
				o,
				[...aDeciderTous].map(([bug_id, raison]) => ({ bug_id, raison })),
			);
			o.annonce?.("aucune epic prête à dérouler : la suite est finie");
			return 0;
		}
		const story = prochaineStory(epic);
		if (!story || !fichierDeLaStory(o.root, story.id)) {
			const r = await rediger(o, epic, story ? `${story.id} : ${story.titre}` : null);
			if (!r.fait) {
				o.annonce?.(`⛔ ${r.motif}`);
				return r.code;
			}
			if (r.epicVersee) {
				epicsVersees++;
				finDEpic = true;
			}
			continue;
		}
		o.annonce?.(`${epic.id} · ${story.id}`);
		const code = await o.deroulerStory(story.id);
		if (code !== 0) return code;
		marquerStory(o.root, story.id, "versée");
		commiter(o.root, `docs: the plan marks ${story.id} landed`, ["specs/plan.yaml"]);
	}
}
