/** The part of the POMs of a reactor every build reads: each POM without its profiles. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The profiles of a POM: what they declare exists only when a build activates them. */
export const PROFILES = /<profiles\b[\s\S]*?<\/profiles>/g;

/** A POM without its profiles, the part every build of the reactor reads. */
function outsideProfiles(xml: string): string {
	return xml.replace(PROFILES, "");
}

/** Each POM of the reactor that can be read, outside its profiles. */
export function* readPomsOutsideProfiles(projectPath: string, pomPaths: readonly string[]): Generator<string> {
	for (const rel of pomPaths) {
		let xml = "";
		try {
			xml = readFileSync(join(projectPath, rel), "utf8");
		} catch {
			continue; // an unreadable POM declares and binds nothing; the other POMs are still read
		}
		yield outsideProfiles(xml);
	}
}
