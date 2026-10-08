/**
 * The roles of a part of an architecture map follow its style before the map is presented: a named adapter
 * is a ring of the onion only with its name, and a layer may be called only by layers its part has, so that
 * the rules written from an adopted map name nothing the map does not define.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import { checkArchitectureMap } from "../../src/domain/architecture-map.ts";

const PACKAGES = ["io.demo.a", "io.demo.b"];

/** A map of one part in `style` over the packages above, each with the role given. */
function mapOf(
	style: ArchitectureMap["parts"][number]["style"],
	roles: ArchitectureMap["parts"][number]["roles"],
): ArchitectureMap {
	return { parts: [{ name: "app", perimeter: ["app"], style, roles, hints: [] }], relations: [] };
}

describe("the roles of a part follow its style", () => {
	it("an onion part whose package has the role adapter with no name does not hold, and the reason names the package", () => {
		const check = checkArchitectureMap(
			mapOf("onion", [
				{ package: "io.demo.a", role: "domain model", hints: [] },
				{ package: "io.demo.b", role: "adapter ", hints: [] },
			]),
			PACKAGES,
			() => 1,
		);
		assert.ok(!check.holds);
		assert.deepEqual(check.missing, [
			'part app: package io.demo.b has the role "adapter ", which is no ring of an onion: "domain model", "domain services", "application services" or "adapter <name>"',
		]);
	});

	it("a layered part whose layer may be called by a layer it does not have does not hold, and the reason names both layers", () => {
		const check = checkArchitectureMap(
			mapOf("layered", [
				{ package: "io.demo.a", role: "web", called_by: [], hints: [] },
				{ package: "io.demo.b", role: "service", called_by: ["web", "batch"], hints: [] },
			]),
			PACKAGES,
			() => 1,
		);
		assert.ok(!check.holds);
		assert.deepEqual(check.missing, ["part app: layer service may be called by batch, which is no layer of the part"]);
	});

	it("a part in the other style holds whatever the roles of its packages", () => {
		const check = checkArchitectureMap(
			mapOf("other", [
				{ package: "io.demo.a", role: "published events", hints: [] },
				{ package: "io.demo.b", role: "handlers", hints: [] },
			]),
			PACKAGES,
			() => 1,
		);
		assert.deepEqual(check, { holds: true, unassigned: [] });
	});
});
