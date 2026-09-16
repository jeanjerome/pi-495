import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACTS } from "../src/contracts/registry.ts";

const out = join(process.cwd(), "contracts", "v1");
mkdirSync(out, { recursive: true });
for (const [name, schema] of Object.entries(CONTRACTS)) {
	const doc = { $schema: "https://json-schema.org/draft/2020-12/schema", ...JSON.parse(JSON.stringify(schema)) };
	writeFileSync(join(out, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`${Object.keys(CONTRACTS).length} contracts written to ${out}`);
