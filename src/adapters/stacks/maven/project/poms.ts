/** The part of the POMs of a reactor every build reads: each POM without its profiles. */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";

/** The profiles of a POM: what they declare exists only when a build activates them. */
export const PROFILES = /<profiles\b[\s\S]*?<\/profiles>/g;

/** A POM without its profiles, the part every build of the reactor reads. */
function outsideProfiles(xml: string): string {
	return xml.replace(PROFILES, "");
}

/** Each POM of the reactor that can be read, outside its profiles. */
export function* readPomsOutsideProfiles(view: ProjectView, pomPaths: readonly string[]): Generator<string> {
	for (const rel of pomPaths) {
		const xml = view.read(rel);
		// An unreadable POM declares and binds nothing; the other POMs are still read.
		if (xml !== null) yield outsideProfiles(xml);
	}
}
