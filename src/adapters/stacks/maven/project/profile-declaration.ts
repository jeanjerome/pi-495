/** The edit that writes profiles 495 declares into a copy of a POM, where the POM takes them without ambiguity. */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { FileEdit } from "../../../../contracts/v1/protocol.ts";

/**
 * The edit that writes `profiles`, each one line per entry indented by tabs below it, into the POM at `path`:
 * before the closing of its one `<profiles>`, or in a `<profiles>` of its own before the closing of the project.
 * Null when the POM cannot be read or the place does not occur exactly once.
 */
export function profileEdit(
	view: ProjectView,
	path: string,
	profiles: readonly (readonly string[])[],
): FileEdit | null {
	const pom = view.read(path);
	if (pom === null) return null;
	const unit = /^([ \t]+)</m.exec(pom)?.[1] ?? "  ";
	const lines = (indent: string, declaration: readonly string[]) =>
		declaration.map((line) => `${indent}${line.replace(/^\t+/, (tabs) => unit.repeat(tabs.length))}`);
	const declared = profiles.flat();
	const once = (text: string) => pom.split(text).length === 2;
	if (pom.includes("</profiles>")) {
		const indent = /([ \t]*)<\/profiles>/.exec(pom)?.[1] ?? unit;
		if (!once("</profiles>")) return null;
		const [first, ...rest] = lines(`${indent}${unit}`, declared);
		return { path, current: "</profiles>", wanted: `${first!.trimStart()}\n${rest.join("\n")}\n${indent}</profiles>` };
	}
	if (!once("</project>")) return null;
	return {
		path,
		current: "</project>",
		wanted: `${[`${unit}<profiles>`, ...lines(`${unit}${unit}`, declared), `${unit}</profiles>`].join("\n")}\n</project>`,
	};
}
