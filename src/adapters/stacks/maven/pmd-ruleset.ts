/** The rule set PMD and CPD are given, written from the frozen rules of their control. */
import type { QualityRule } from "../../../contracts/v1/protocol.ts";

const escapedAttribute = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The PMD rule set of a control, written from the rules its frozen definition carries: each rule by its
 * reference, with the properties that make its threshold the one the referential states. PMD reads a
 * rule set without its namespace, and the source of 495 names no network address.
 */
export function pmdRuleset(rules: readonly QualityRule[]): string {
	const entries = rules.flatMap((rule) => {
		if (rule.reference === null) return [];
		const properties = Object.entries(rule.properties).map(
			([name, value]) => `      <property name="${escapedAttribute(name)}" value="${escapedAttribute(value)}"/>\n`,
		);
		const reference = escapedAttribute(rule.reference);
		return properties.length === 0
			? [`  <rule ref="${reference}"/>\n`]
			: [`  <rule ref="${reference}">\n    <properties>\n${properties.join("")}    </properties>\n  </rule>\n`];
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<ruleset name="495">
  <description>The quality rules of the frozen protocol</description>
${entries.join("")}</ruleset>
`;
}
