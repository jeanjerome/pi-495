/**
 * The edit that declares a plugin in the root POM of a copy, and the resolution that adopts it, when the
 * POM takes the declaration without ambiguity.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { FileEdit, RecommendedComplement } from "../../../../contracts/v1/protocol.ts";
import { PROFILES } from "./poms.ts";

/** A declaration written at `indent`, each leading tab of its lines replaced by the indentation unit of the POM. */
function indented(declaration: readonly string[], indent: string, unit: string, eol: string): string {
	return declaration
		.map((line) => `${indent}${line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length))}${eol}`)
		.join("");
}

/** The regions of a POM whose plugins a build does not run: comments, profiles, managed plugins and reporting. */
const INACTIVE_REGIONS = [
	/<!--[\s\S]*?-->/g,
	PROFILES,
	/<pluginManagement\b[\s\S]*?<\/pluginManagement>/g,
	/<reporting\b[\s\S]*?<\/reporting>/g,
];

/** How many lines before the opening of the plugins may be added to the text to replace to make it occur once. */
const ANCHOR_CONTEXT_LINES = 4;

/**
 * The replacement that declares a plugin in the root POM: the line that opens its one `build/plugins`
 * section, preceded by as many lines as it takes to occur once, followed by the declaration. Null when
 * the POM does not take it without ambiguity: plugins only in a profile, in `pluginManagement` or in
 * `reporting`, more than one section, the plugin already named outside a profile, or an opening line
 * that is not alone on its line.
 */
function pluginEdit(pom: string, artifactId: string, declaration: readonly string[]): FileEdit | null {
	// The inactive regions are blanked to the same length, so a position found in `active` is one of `pom`.
	const active = INACTIVE_REGIONS.reduce((text, region) => text.replace(region, (m) => " ".repeat(m.length)), pom);
	if (active.includes(artifactId)) return null;
	const opening = active.indexOf("<plugins>");
	if (opening < 0 || active.indexOf("<plugins>", opening + 1) >= 0) return null;
	if (!/<build\b/.test(active.slice(0, opening))) return null;
	const openingLine = /^([ \t]*)<plugins>[ \t]*(\r?\n)/.exec(pom.slice(pom.lastIndexOf("\n", opening) + 1));
	if (openingLine === null) return null;
	const [line, indent = "", eol = "\n"] = openingLine;
	const end = pom.lastIndexOf("\n", opening) + 1 + line.length;
	let start = end - line.length;
	for (let added = 0; pom.split(pom.slice(start, end)).length !== 2; added++) {
		if (added === ANCHOR_CONTEXT_LINES || start === 0) return null;
		start = pom.lastIndexOf("\n", start - 2) + 1;
	}
	const anchor = pom.slice(start, end);
	const unit = /^([ \t]*)<plugin>/m.exec(pom.slice(end))?.[1]?.slice(indent.length) || "  ";
	return {
		path: "pom.xml",
		current: anchor,
		wanted: `${anchor}${indented(declaration, `${indent}${unit}`, unit, eol)}`,
	};
}

/** The recommendation with the edit that declares its plugin and the resolution that adopts it, when the root POM takes the declaration. */
export function withPluginEdit(
	view: ProjectView,
	recommendation: RecommendedComplement,
	artifactId: string,
	declaration: readonly string[],
): RecommendedComplement {
	const pom = view.read("pom.xml");
	if (pom === null) return recommendation; // an unreadable POM gets the recommendation without an edit to apply
	const edit = pluginEdit(pom, artifactId, declaration);
	if (edit === null) return recommendation;
	return {
		...recommendation,
		edit,
		install: { package: recommendation.tool, version: recommendation.version, manager: "maven" },
	};
}
