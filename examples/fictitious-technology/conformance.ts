/**
 * Judges the example technology on its sample project under the sandbox of the platform, prints the report and
 * exits non-zero when it carries a finding: `node examples/fictitious-technology/conformance.ts`, after
 * `npm run build`.
 */
import { join } from "node:path";
import { stackConformance } from "pi-495/stack";
import { FICT_PLUGIN } from "./fict.ts";

const report = await stackConformance(FICT_PLUGIN, { projects: [join(import.meta.dirname, "project")] });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.findings.length === 0 ? 0 : 1;
