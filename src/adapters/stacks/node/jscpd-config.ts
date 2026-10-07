/** The configuration jscpd is given, written from the frozen rules of its control. */
import type { QualityRule } from "../../../contracts/v1/protocol.ts";

/**
 * The configuration of jscpd, written from the rules a control's frozen definition carries: each property
 * of a rule under the name jscpd's configuration gives it, such as `minTokens`. jscpd is given this file
 * in place of any `.jscpd.json` of the analysed tree, which it would read otherwise.
 */
export function jscpdConfig(rules: readonly QualityRule[]): string {
	const options = rules.flatMap((rule) =>
		Object.entries(rule.properties).map(([name, value]) => [name, Number(value)] as const),
	);
	return `${JSON.stringify(Object.fromEntries(options))}\n`;
}
