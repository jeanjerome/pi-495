/**
 * What every pane of the review surface is given, and the little of it a pane may move.
 *
 * The snapshot is immutable and the loaded pages are read-only: a pane renders what it was handed
 * and never asks the workspace for anything. The view is the navigation state — where the selection
 * sits, which mode the reader is in, how far each side is scrolled — and it is the only thing a
 * pane writes, because scrolling is what keeps a selection on screen.
 */
import type { ChangePage, ContentPage, PathStatus, ReviewNode, ReviewSnapshot } from "../../../application/review.ts";
import type { RenderedDiff } from "./diff-view.ts";

export interface ReviewQuery {
	changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>;
	content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage>;
}

export interface Styles {
	added(s: string): string;
	modified(s: string): string;
	deleted(s: string): string;
	renamed(s: string): string;
	intact(s: string): string;
	selected(s: string): string;
	dim(s: string): string;
	header(s: string): string;
	focus(s: string): string;
	warn(s: string): string;
}

export const PLAIN: Styles = {
	added: (s) => s,
	modified: (s) => s,
	deleted: (s) => s,
	renamed: (s) => s,
	intact: (s) => s,
	selected: (s) => s,
	dim: (s) => s,
	header: (s) => s,
	focus: (s) => s,
	warn: (s) => s,
};

export type ReaderMode = "changes" | "new" | "old" | "metadata" | "findings";
export const MODES: ReaderMode[] = ["changes", "new", "old", "metadata", "findings"];

export const SYMBOL: Record<PathStatus, string> = {
	intact: "=",
	added: "A",
	modified: "M",
	deleted: "D",
	renamed: "R",
	"renamed?": "R?",
	special: "S",
	unknown: "?",
};
export const LABEL: Record<PathStatus, string> = {
	intact: "intact",
	added: "ajouté",
	modified: "modifié",
	deleted: "supprimé",
	renamed: "renommé",
	"renamed?": "renommé?",
	special: "spécial",
	unknown: "inconnu",
};

/** A page the surface loaded, or why it could not be loaded. */
export type LoadedPage = ChangePage | ContentPage | { error: string };

/** Where the reader and the tree currently sit. A pane reads it, and moves only what it must. */
export interface ReviewView {
	expanded: Set<string>;
	changedOnly: boolean;
	focus: "tree" | "reader";
	selected: number;
	treeScroll: number;
	readerScroll: number;
	mode: ReaderMode;
	split: number;
	foldContext: boolean;
	narrowPane: "tree" | "reader";
	search: string;
	searching: boolean;
}

/** What a pane is handed. It holds no query, no cache of its own and no way to reach the workspace. */
export interface PaneContext {
	readonly snapshot: ReviewSnapshot;
	readonly view: ReviewView;
	readonly pages: ReadonlyMap<string, LoadedPage>;
	readonly styles: Styles;
	readonly labels: Labels;
	fit(text: string, width: number): string;
	/** The change body already drawn, or nothing while it is being drawn — drawing it is asynchronous. */
	diff(page: ChangePage): RenderedDiff | null;
}

/** The node the tree has selected, or nothing when the tree is empty. */
export type Selection = ReviewNode | null;

export const FR = {
	review: "Revue",
	ref: "référence",
	cand: "candidat",
	none: "aucun",
	fresh: "à jour",
	newer: "candidat plus récent :",
	incomplete: "comparaison incomplète",
	counts: "Statuts",
	changedOnly: "changements uniquement",
	allPaths: "arbre complet",
	from: "depuis",
	noSelection: "aucune sélection",
	tree: "arbre",
	reader: "lecteur",
	help: "↑↓ naviguer  ⏎ ouvrir  tab focus  c filtre  m mode  n/p fichier  ]/[ modif  x contexte  +/- largeur  / rechercher  q retour",
	helpKeys: "↑↓ ⏎ tab c m n/p ]/[ x +/- / q",
	modes: {
		changes: "Modifications",
		new: "Contenu (nouveau)",
		old: "Contenu (ancien)",
		metadata: "Métadonnées",
		findings: "Constats",
	},
	directory: "Répertoire",
	status: "État",
	kind: "Type",
	path: "Chemin",
	noFindings: "aucun constat sur ce chemin",
	loading: "chargement…",
	error: "erreur",
	lines: "lignes",
};
export const EN = {
	...FR,
	review: "Review",
	ref: "reference",
	cand: "candidate",
	none: "none",
	fresh: "up to date",
	newer: "newer candidate:",
	incomplete: "incomplete comparison",
	counts: "Statuses",
	changedOnly: "changes only",
	allPaths: "full tree",
	from: "from",
	noSelection: "no selection",
	tree: "tree",
	reader: "reader",
	help: "↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back",
	helpKeys: "↑↓ ⏎ tab c m n/p ]/[ x +/- / q",
	modes: { changes: "Changes", new: "Content (new)", old: "Content (old)", metadata: "Metadata", findings: "Findings" },
	directory: "Directory",
	status: "Status",
	kind: "Kind",
	path: "Path",
	noFindings: "no finding on this path",
	loading: "loading…",
	error: "error",
	lines: "lines",
};

export type Labels = typeof FR;
