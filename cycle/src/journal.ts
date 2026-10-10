/**
 * The dossier of a story: an append-only journal, one JSON line per event written when it is
 * observed, beside a content-addressed store for what the events point at — a transcript, the output
 * of a control, the findings of a review. The same discipline as the kernel's ledger and object
 * store: nothing is rewritten, and a record cites an object by its digest.
 *
 * The dossier lives under `~/.495/cycle/<story>/` while the story runs, and is exported once, at
 * the landing, under `specs/verifications/<story>/`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ObjectRef } from "../../src/contracts/v1/common.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";

export type Pas = "story" | "rouge-vert" | "autocontrole" | "relecture" | "recette" | "versement";
export const PAS: Pas[] = ["story", "rouge-vert", "autocontrole", "relecture", "recette", "versement"];
/** A step of a story, or `reprise`, the short path of a refactoring that changes no behaviour. */
export type Etape = Pas | "reprise";

export interface Evenement {
	at: string;
	pas: Etape;
	genre: string;
	[detail: string]: unknown;
}

export function racineCycle(env: NodeJS.ProcessEnv = process.env): string {
	return env.CYCLE_495_DIR ?? join(homedir(), ".495", "cycle");
}

export class Journal {
	readonly story: string;
	readonly dir: string;
	readonly objets: CasObjectStore;
	private readonly fichier: string;
	/** Told each event as it is written, for whoever watches the story run. */
	observateur: ((e: Evenement) => void) | null = null;

	constructor(story: string, racine: string) {
		this.story = story;
		this.dir = join(racine, story);
		mkdirSync(this.dir, { recursive: true });
		this.fichier = join(this.dir, "journal.jsonl");
		this.objets = new CasObjectStore(join(racine, "objects"));
	}

	inscrire(pas: Etape, genre: string, detail: Record<string, unknown> = {}): Evenement {
		const evenement: Evenement = { at: new Date().toISOString(), pas, genre, ...detail };
		appendFileSync(this.fichier, `${JSON.stringify(evenement)}\n`);
		this.observateur?.(evenement);
		return evenement;
	}

	lire(): Evenement[] {
		if (!existsSync(this.fichier)) return [];
		return readFileSync(this.fichier, "utf8")
			.split("\n")
			.filter((l) => l.length > 0)
			.map((l) => JSON.parse(l) as Evenement);
	}

	dernier(genre: string, pas?: Pas): Evenement | null {
		const events = this.lire().filter((e) => e.genre === genre && (pas === undefined || e.pas === pas));
		return events.at(-1) ?? null;
	}

	/** The events since the last `rouvert`, which an acceptance-run gap writes to send the story back. */
	depuisReouverture(): Evenement[] {
		const events = this.lire();
		const at = events.map((e) => e.genre).lastIndexOf("rouvert");
		return at < 0 ? events : events.slice(at + 1);
	}

	/**
	 * The head a step started from, counting from the first launch of the run the step is in: the
	 * earliest `debute` of `pas` since the last event of another step. A launch resumed after a block
	 * belongs to the same run, so the commits of its earlier launch stay within reach; a step that
	 * ran in between does not, and neither does the run before a reopening.
	 */
	debutDePassage(pas: Pas): string | null {
		const debut = this.passage(pas).find((e) => e.genre === "debute");
		return typeof debut?.revision === "string" ? debut.revision : null;
	}

	/** The events of the run `pas` is in, as `debutDePassage` counts it: since the last event of another step. */
	passage(pas: Pas): Evenement[] {
		const events = this.lire();
		return events.slice(events.findLastIndex((e) => e.pas !== pas) + 1);
	}

	/** How many times the story went back to the red-green: the `rouvert` events of the journal. */
	reouvertures(): number {
		return this.lire().filter((e) => e.genre === "rouvert").length;
	}

	rouvert(): boolean {
		return this.reouvertures() > 0;
	}

	/** The step to run next: the first one no `fini` event closes since the last reopening. */
	prochainPas(): Pas | null {
		const finis = new Set(
			this.depuisReouverture()
				.filter((e) => e.genre === "fini")
				.map((e) => e.pas),
		);
		return PAS.find((p) => !finis.has(p)) ?? null;
	}

	garder(texte: string, mediaType = "text/plain; charset=utf-8"): Promise<ObjectRef> {
		return this.objets.putText(texte, mediaType);
	}
}
