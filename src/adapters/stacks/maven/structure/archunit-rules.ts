/**
 * The rules of an adopted architecture map, written as the ArchUnit test class the architecture control
 * compiles and runs at each run (`specs/adr/D-87` §5): the style of each part — the rings of an onion, the
 * calls permitted between layers —, no dependency between two parts the map does not relate, no cycle
 * between the parts nor between the packages of the map, and every main source in a part. A part in `simple`
 * or `other` style has no rule of its own beyond its relations and its cycles. Each rule is described in the
 * words of the map, which is the name its violations are reported under.
 */
import type { ArchitectureMap } from "../../../../contracts/v1/protocol.ts";
import { onionRing } from "../../../../domain/architecture-map.ts";
import { WITNESS_PACKAGE } from "../project/witness-layout.ts";

/** The test class the rules are written in, and the name its Surefire report carries. */
export const ARCHITECTURE_TEST_CLASS = "Architecture495Test";

type Part = ArchitectureMap["parts"][number];

const literal = (text: string) => `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
const literals = (texts: readonly string[]) => texts.map(literal).join(", ");
const packagesOf = (part: Part) => [...new Set(part.roles.map((r) => r.package))];

/** The packages of the roles of `part` its style puts in `ring`. */
const inRing = (part: Part, ring: (role: string) => boolean) =>
	part.roles.filter((r) => ring(r.role)).map((r) => r.package);

/** The onion of a part: its rings, judged on the dependencies that start in the part. */
function onionRule(part: Part): string {
	const rings = [
		["domainModels", "domain model"],
		["domainServices", "domain services"],
		["applicationServices", "application services"],
	]
		.map(([method, ring]) => [method, inRing(part, (role) => onionRing(role) === ring)] as const)
		.filter(([, packages]) => packages.length > 0)
		.map(([method, packages]) => `.${method}(${literals(packages)})`);
	const adapters = new Map<string, string[]>();
	for (const r of part.roles) {
		const ring = onionRing(r.role);
		if (ring !== null && typeof ring === "object")
			adapters.set(ring.adapter, [...(adapters.get(ring.adapter) ?? []), r.package]);
	}
	return [
		"onionArchitecture()",
		...rings,
		...[...adapters].map(([name, packages]) => `.adapter(${literal(name)}, ${literals(packages)})`),
		".withOptionalLayers(true)",
		// A dependency from another part onto this one is judged by the relations of the map, not by its rings.
		`.ignoreDependency(JavaClass.Predicates.resideOutsideOfPackages(${literals(packagesOf(part))}), DescribedPredicate.alwaysTrue())`,
		`.as(${literal(`part ${part.name} keeps the rings of its onion`)})`,
	].join("\n        ");
}

/** The layers of a part, each called only by the layers the map names. */
function layeredRule(part: Part): string {
	const layers = [...new Set(part.roles.map((r) => r.role))];
	const callers = (layer: string) => [
		...new Set(part.roles.filter((r) => r.role === layer).flatMap((r) => r.called_by ?? [])),
	];
	return [
		"layeredArchitecture().consideringOnlyDependenciesInLayers()",
		...layers.map(
			(layer) => `.layer(${literal(layer)}).definedBy(${literals(inRing(part, (role) => role === layer))})`,
		),
		...layers.map((layer) => {
			const by = callers(layer);
			return `.whereLayer(${literal(layer)})${by.length === 0 ? ".mayNotBeAccessedByAnyLayer()" : `.mayOnlyBeAccessedByLayers(${literals(by)})`}`;
		}),
		".withOptionalLayers(true)",
		`.as(${literal(`part ${part.name} keeps the calls between its layers`)})`,
	].join("\n        ");
}

/** For each part, one rule per part it may not depend on. */
function relationRules(map: ArchitectureMap): string[] {
	return map.parts.flatMap((from) =>
		map.parts
			.filter((to) => to.name !== from.name && !map.relations.some((r) => r.from === from.name && r.to === to.name))
			.map((to) =>
				[
					`noClasses().that().resideInAnyPackage(${literals(packagesOf(from))})`,
					`.should().dependOnClassesThat().resideInAnyPackage(${literals(packagesOf(to))})`,
					".allowEmptyShould(true)",
					`.as(${literal(`part ${from.name} may not depend on part ${to.name}`)})`,
				].join("\n        "),
			),
	);
}

/** The Java source of the rules of `map`. */
export function architectureRules(map: ArchitectureMap): string {
	const rules = [
		...map.parts.flatMap((part) =>
			part.style === "onion" ? [onionRule(part)] : part.style === "layered" ? [layeredRule(part)] : [],
		),
		...relationRules(map),
		'slices().assignedFrom(BY_PART).should().beFreeOfCycles().allowEmptyShould(true).as("no cycle between the parts")',
		'slices().assignedFrom(BY_PACKAGE).should().beFreeOfCycles().allowEmptyShould(true).as("no cycle between the packages of the map")',
		// The witnesses 495 writes in a package of their own belong to no part of the project.
		`classes().that().resideOutsideOfPackages(${literal(`${WITNESS_PACKAGE}..`)}).should().resideInAnyPackage(PART_OF.keySet().toArray(new String[0])).allowEmptyShould(true).as("every main source belongs to a part")`,
	];
	const partOf = map.parts.flatMap((part) =>
		packagesOf(part).map((p) => `        PART_OF.put(${literal(p)}, ${literal(part.name)});`),
	);
	return `import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.core.importer.Location;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.library.dependencies.SliceAssignment;
import com.tngtech.archunit.library.dependencies.SliceIdentifier;
import java.util.HashMap;
import java.util.Map;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.library.Architectures.onionArchitecture;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/** The rules of the architecture map the owner adopted, written by 495 at each run. */
@AnalyzeClasses(wholeClasspath = true, importOptions = {ImportOption.DoNotIncludeTests.class, ${ARCHITECTURE_TEST_CLASS}.MainClasses.class})
public class ${ARCHITECTURE_TEST_CLASS} {
    /** The main classes the modules of the reactor compiled, and nothing of a library or of the JDK. */
    public static final class MainClasses implements ImportOption {
        @Override
        public boolean includes(Location location) {
            return location.contains("/target/classes/");
        }
    }

    static final Map<String, String> PART_OF = new HashMap<>();
    static {
${partOf.join("\n")}
    }

    static final SliceAssignment BY_PART = new SliceAssignment() {
        @Override
        public SliceIdentifier getIdentifierOf(JavaClass c) {
            String part = PART_OF.get(c.getPackageName());
            return part == null ? SliceIdentifier.ignore() : SliceIdentifier.of("part " + part);
        }

        @Override
        public String getDescription() {
            return "the parts of the map";
        }
    };

    static final SliceAssignment BY_PACKAGE = new SliceAssignment() {
        @Override
        public SliceIdentifier getIdentifierOf(JavaClass c) {
            return PART_OF.containsKey(c.getPackageName()) ? SliceIdentifier.of(c.getPackageName()) : SliceIdentifier.ignore();
        }

        @Override
        public String getDescription() {
            return "the packages of the map";
        }
    };

${rules.map((rule, i) => `    @ArchTest\n    static final ArchRule rule${i + 1} = ${rule};`).join("\n\n")}
}
`;
}
