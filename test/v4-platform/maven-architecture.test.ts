/**
 * The rules of an adopted architecture map checked by ArchUnit on a real Maven reactor, through the generic
 * runner and the platform sandbox: once a copy declares ArchUnit by 495's declaration, the architecture
 * control is qualified by its own witnesses although the project already breaks its map, and the pass on the
 * reference reports each violation at its file and its line. The tests of the project do not run the rules.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ArchitectureHint, ArchitectureMap } from "../../src/contracts/v1/protocol.ts";
import { mavenBench, mavenReference, qualifyByWitnesses, widenForMaven } from "../helpers/maven-bench.ts";
import { DOMAIN_MAP, DOMAIN_SOURCES } from "../helpers/architecture-survey.ts";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const mavenAvailable = spawnSync("mvn", ["-v"], { stdio: "ignore" }).status === 0;

const REFS = [{ requirement_id: "ARC-01", revision: 1 }];

const pom = (artifactId: string, dependsOn: readonly string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version></parent>
  <artifactId>${artifactId}</artifactId>
  <dependencies>
${dependsOn.map((d) => `    <dependency><groupId>io.demo</groupId><artifactId>${d}</artifactId><version>1.0.0</version></dependency>\n`).join("")}  </dependencies>
</project>
`;

const ADMIN_SERVICE = "admin/src/main/java/io/demo/admin/service/AdminService.java";
const ADMIN_DAO = "admin/src/main/java/io/demo/admin/data/AdminDao.java";
const OLD_ADMIN = "admin/src/main/java/io/demo/admin/legacy/OldAdmin.java";

/** The reactor of `orders`, `admin` and `shared`: `admin` uses `orders`, its `data` layer calls its `web` layer, and `legacy` belongs to no part. */
const REACTOR: Record<string, string> = {
	"pom.xml": `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.demo</groupId><artifactId>reactor</artifactId><version>1.0.0</version>
  <packaging>pom</packaging>
  <modules><module>orders</module><module>admin</module><module>shared</module></modules>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
`,
	"orders/pom.xml": pom("orders", []),
	"admin/pom.xml": pom("admin", ["orders", "shared"]),
	"shared/pom.xml": pom("shared", []),
	"orders/src/main/java/io/demo/orders/model/Order.java": "package io.demo.orders.model;\n\npublic class Order {}\n",
	"orders/src/main/java/io/demo/orders/service/OrderService.java":
		"package io.demo.orders.service;\n\nimport io.demo.orders.model.Order;\n\npublic class OrderService {\n    public Order open() {\n        return new Order();\n    }\n}\n",
	"orders/src/main/java/io/demo/orders/store/OrderStore.java":
		"package io.demo.orders.store;\n\nimport io.demo.orders.model.Order;\n\npublic class OrderStore {\n    public Order load() {\n        return new Order();\n    }\n}\n",
	"admin/src/main/java/io/demo/admin/web/AdminPage.java":
		"package io.demo.admin.web;\n\nimport io.demo.admin.service.AdminService;\n\npublic class AdminPage {\n    public String show() {\n        return new AdminService().name();\n    }\n}\n",
	[ADMIN_SERVICE]:
		"package io.demo.admin.service;\n\nimport io.demo.admin.data.AdminDao;\nimport io.demo.orders.model.Order;\nimport io.demo.shared.Money;\n\npublic class AdminService {\n    public String name() {\n        return new AdminDao().find() + new Money();\n    }\n\n    public Object order() {\n        return new Order();\n    }\n}\n",
	[ADMIN_DAO]:
		'package io.demo.admin.data;\n\nimport io.demo.admin.web.AdminPage;\n\npublic class AdminDao {\n    public String find() {\n        return "admin";\n    }\n\n    public String page() {\n        return new AdminPage().show();\n    }\n}\n',
	[OLD_ADMIN]: "package io.demo.admin.legacy;\n\npublic class OldAdmin {}\n",
	"shared/src/main/java/io/demo/shared/Money.java": "package io.demo.shared;\n\npublic class Money {}\n",
	"admin/src/test/java/io/demo/admin/AdminDaoTest.java":
		'package io.demo.admin;\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass AdminDaoTest {\n    @Test\n    void finds() {\n        assertEquals("admin", new io.demo.admin.data.AdminDao().find());\n    }\n}\n',
};

/** The line of `path` in the reactor that holds `text`, counted from 1. */
const lineOf = (path: string, text: string) => REACTOR[path]!.split("\n").findIndex((l) => l.includes(text)) + 1;

const at = (path: string): ArchitectureHint[] => [{ path, line: 1, says: "its package" }];
const role = (pkg: string, name: string, calledBy?: string[]) => ({
	package: pkg,
	role: name,
	...(calledBy ? { called_by: calledBy } : {}),
	hints: at(`${pkg.split(".")[2]}/pom.xml`),
});

/** `orders` in onion, `admin` in the layers web, service and data, `shared` simple; both may depend on `shared` alone. */
const MAP: ArchitectureMap = {
	parts: [
		{
			name: "orders",
			perimeter: ["orders"],
			style: "onion",
			roles: [
				role("io.demo.orders.model", "domain model"),
				role("io.demo.orders.service", "domain services"),
				role("io.demo.orders.store", "adapter persistence"),
			],
			hints: at("orders/pom.xml"),
		},
		{
			name: "admin",
			perimeter: ["admin"],
			style: "layered",
			roles: [
				role("io.demo.admin.web", "web", []),
				role("io.demo.admin.service", "service", ["web"]),
				role("io.demo.admin.data", "data", ["service"]),
			],
			hints: at("admin/pom.xml"),
		},
		{
			name: "shared",
			perimeter: ["shared"],
			style: "simple",
			roles: [role("io.demo.shared", "shared kernel")],
			hints: at("shared/pom.xml"),
		},
	],
	relations: [
		{ from: "orders", to: "shared", hints: at("orders/pom.xml") },
		{ from: "admin", to: "shared", hints: at("admin/pom.xml") },
	],
};

const USER = "domain/src/main/java/io/demo/domain/user/User.java";
const USER_SERVICE = "domain/src/main/java/io/demo/domain/service/UserService.java";

/** The model of the domain calls a service of the domain, which the onion of the part `domain` forbids. */
const USER_CALLS_SERVICE =
	"package io.demo.domain.user;\n\nimport io.demo.domain.service.UserService;\n\npublic class User {\n    public String name() {\n        return UserService.describe();\n    }\n}\n";

/** The reactor of `domain` and `infrastructure`, where the service of the domain uses its model, as the onion of `domain` permits. */
const DOMAIN_REACTOR: Record<string, string> = {
	"pom.xml": REACTOR["pom.xml"]!.replace(
		"<module>orders</module><module>admin</module><module>shared</module>",
		"<module>domain</module><module>infrastructure</module>",
	),
	"domain/pom.xml": pom("domain", []),
	"infrastructure/pom.xml": pom("infrastructure", ["domain"]),
	...DOMAIN_SOURCES,
	[USER]: "package io.demo.domain.user;\n\npublic class User {}\n",
	[USER_SERVICE]:
		'package io.demo.domain.service;\n\nimport io.demo.domain.user.User;\n\npublic class UserService {\n    public static String describe() {\n        return "a user";\n    }\n\n    public User find() {\n        return new User();\n    }\n}\n',
};

/** The copy of `reactor` where the controls run, declaring ArchUnit by 495's declaration for `map`, and its detection. */
function declaredReference(root: string, reactor: Record<string, string> = REACTOR, map: ArchitectureMap = MAP) {
	const project = join(root, "project");
	writeFiles(project, reactor);
	const offered = STACKS_OF_495.recognise(project, REFS, process.execPath, [], map);
	const verification = offered.architecture_verification;
	assert.ok(
		verification?.kind === "proposed",
		`the adapter declares ArchUnit for the adopted map; it declares the controls ${offered.controls.map((c) => c.control_id).join(", ")} and ${JSON.stringify(verification)}`,
	);
	const { edit, install } = verification.recommendation;
	assert.ok(edit && install, "the recommendation carries the declaration of ArchUnit and its resolution");
	const reference = mavenReference(root, project, edit, install);
	return { reference, detection: STACKS_OF_495.recognise(reference, REFS, process.execPath, [], map) };
}

describe("ArchUnit checks the adopted map on a Maven reactor that already breaks it", {
	skip: !mavenAvailable && "mvn is not on PATH",
}, () => {
	const cleanups = removedAfterEach();

	it("sur le réacteur orders, admin et shared, le contrôle d'architecture est qualifié par ses témoins bien que le projet viole sa carte, et la passe de référence rapporte la relation d'admin vers orders et l'appel de data vers web à leur fichier et à leur ligne, et la source de io.demo.admin.legacy à son fichier, sans constat sur shared", async () => {
		const root = outputDir("maven-architecture-", cleanups);
		const { reference, detection } = declaredReference(root);
		const architecture = detection.controls.find((c) => c.control_id === "architecture");
		assert.ok(
			architecture,
			`the copy that declares ArchUnit gets the architecture control: ${detection.controls.map((c) => c.control_id).join(", ")}`,
		);
		assert.equal(architecture.network, "denied", "the architecture control runs with the network closed");
		assert.deepEqual(architecture.architecture_map, MAP, "its rules are written from the adopted map");

		const bench = mavenBench(root);
		const own = detection.own_negative_witness.architecture;
		assert.ok(own, "the architecture control has a negative witness of its own");
		const q = await qualifyByWitnesses(bench, root, reference, architecture, detection.positive_witness, own);
		assert.deepEqual(
			[q.positive, q.negative, q.incident, q.qualified],
			["PASS", "FAIL", "INDETERMINATE", true],
			JSON.stringify(q.notes),
		);

		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(architecture), workspace_path: reference })
		).evidence;
		assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
		const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
		for (const expected of [
			`part admin may not depend on part orders | ${ADMIN_SERVICE}:${lineOf(ADMIN_SERVICE, "new Order()")}`,
			`part admin keeps the calls between its layers | ${ADMIN_DAO}:${lineOf(ADMIN_DAO, "new AdminPage()")}`,
			`every main source belongs to a part | ${OLD_ADMIN}:-`,
		])
			assert.ok(located.includes(expected), `${expected} in\n${located.join("\n")}`);
		assert.deepEqual(
			[...new Set(located.filter((l) => l.startsWith("part admin keeps the calls between its layers |")))],
			[`part admin keeps the calls between its layers | ${ADMIN_DAO}:${lineOf(ADMIN_DAO, "new AdminPage()")}`],
			"the layers of admin report the call of data on web alone, not the calls of web on service and of service on data the map permits",
		);
		assert.deepEqual(
			located.filter((l) => / part shared\b|\| shared\//.test(l)),
			[],
			"no finding is about shared, neither in it nor on a relation towards it",
		);
		assert.deepEqual(
			located.filter((l) => l.includes("| orders/")),
			[],
			"no finding is in orders, whose model, services and adapter keep the rings of its onion",
		);
	});

	it("sur le réacteur domain et infrastructure, qui tient sa carte, le contrôle d'architecture est qualifié par un témoin négatif qui échoue sur une dépendance que la carte interdit, rend PASS sans constat quand le service du domaine utilise le modèle, et FAIL quand la classe User du modèle appelle UserService, avec la règle des anneaux de domain à la ligne de l'appel", async () => {
		const root = outputDir("maven-architecture-onion-", cleanups);
		const { reference, detection } = declaredReference(root, DOMAIN_REACTOR, DOMAIN_MAP);
		const architecture = detection.controls.find((c) => c.control_id === "architecture");
		assert.ok(
			architecture,
			`the copy that declares ArchUnit gets the architecture control: ${detection.controls.map((c) => c.control_id).join(", ")}`,
		);
		const bench = mavenBench(root);
		const run = async (workspace_path: string) =>
			(await bench.runner.runControl({ ...bench.base, control: widenForMaven(architecture), workspace_path })).evidence;

		const own = detection.own_negative_witness.architecture;
		assert.ok(own, "the architecture control has a negative witness of its own");
		const q = await qualifyByWitnesses(bench, root, reference, architecture, detection.positive_witness, own);
		assert.deepEqual(
			[q.positive, q.negative, q.qualified],
			["PASS", "FAIL", true],
			`on a reference that keeps its map, the negative witness fails on a dependency the map forbids: ${JSON.stringify(q.notes)}`,
		);

		const held = await run(reference);
		assert.equal(held.verdict, "PASS", held.limits.notes.join("; "));
		assert.deepEqual(held.findings, [], "a service of the domain may use the model");

		const breaking = join(root, "breaking");
		cpSync(reference, breaking, { recursive: true });
		writeFiles(breaking, { [USER]: USER_CALLS_SERVICE });
		const broken = await run(breaking);
		assert.equal(broken.verdict, "FAIL", broken.limits.notes.join("; "));
		const line = USER_CALLS_SERVICE.split("\n").findIndex((l) => l.includes("UserService.describe()")) + 1;
		const located = broken.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
		assert.ok(
			located.includes(`part domain keeps the rings of its onion | ${USER}:${line}`),
			`the call of the model on a service of the domain is located at its line:\n${located.join("\n")}`,
		);
	});

	it("sur ce réacteur, le contrôle des tests du projet rend PASS sans compter les règles d'architecture parmi ses cas", async () => {
		const root = outputDir("maven-architecture-tests-", cleanups);
		const { reference, detection } = declaredReference(root);
		const tests = detection.controls.find((c) => c.control_id === "maven-test");
		assert.ok(tests, "the suite of the project is a control");
		assert.ok(
			detection.controls.some((c) => c.control_id === "architecture"),
			`the copy declares the architecture rules: ${detection.controls.map((c) => c.control_id).join(", ")}`,
		);
		const bench = mavenBench(root);
		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(tests), workspace_path: reference })
		).evidence;
		assert.equal(pass.verdict, "PASS", pass.limits.notes.join("; "));
		assert.equal(pass.facts.tests, 1, "the one test of the project, and no rule of the map");
	});

	it("sur ce réacteur dont les tests passent avec JUnit Jupiter 6, le contrôle d'architecture est qualifié par ses témoins et rapporte la relation d'admin vers orders, et le contrôle des tests du projet rend PASS sans compter les règles d'architecture parmi ses cas", async () => {
		const root = outputDir("maven-architecture-jupiter6-", cleanups);
		const jupiter6 = {
			...REACTOR,
			"pom.xml": REACTOR["pom.xml"]!.replace(
				"<artifactId>junit-jupiter</artifactId><version>5.10.2</version>",
				"<artifactId>junit-jupiter</artifactId><version>6.0.1</version>",
			),
		};
		assert.notEqual(jupiter6["pom.xml"], REACTOR["pom.xml"], "the project's tests run on JUnit Jupiter 6");
		const { reference, detection } = declaredReference(root, jupiter6);
		const architecture = detection.controls.find((c) => c.control_id === "architecture");
		const tests = detection.controls.find((c) => c.control_id === "maven-test");
		const own = detection.own_negative_witness.architecture;
		assert.ok(architecture && tests && own, "the copy declares the architecture rules beside the suite of the project");
		const bench = mavenBench(root);

		const q = await qualifyByWitnesses(bench, root, reference, architecture, detection.positive_witness, own);
		assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
		const pass = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(architecture), workspace_path: reference })
		).evidence;
		assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
		const relation = `part admin may not depend on part orders | ${ADMIN_SERVICE}:${lineOf(ADMIN_SERVICE, "new Order()")}`;
		const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
		assert.ok(located.includes(relation), `${relation} in\n${located.join("\n")}`);

		const suite = (
			await bench.runner.runControl({ ...bench.base, control: widenForMaven(tests), workspace_path: reference })
		).evidence;
		assert.equal(suite.verdict, "PASS", suite.limits.notes.join("; "));
		assert.equal(suite.facts.tests, 1, "the one test of the project, and no rule of the map");
	});

	for (const junit of ["5.10.2", "6.0.1"])
		it(`sur ce réacteur dont les tests JUnit 4 passent par le moteur Vintage ${junit} à côté de JUnit Jupiter ${junit}, le contrôle d'architecture est qualifié par ses témoins et rapporte la relation d'admin vers orders, et le contrôle des tests du projet rend PASS sans compter les règles d'architecture parmi ses cas`, async () => {
			const root = outputDir(`maven-architecture-vintage-${junit}-`, cleanups);
			const vintage = {
				...REACTOR,
				"pom.xml": REACTOR["pom.xml"]!.replace(
					"<artifactId>junit-jupiter</artifactId><version>5.10.2</version><scope>test</scope></dependency>",
					`<artifactId>junit-jupiter</artifactId><version>${junit}</version><scope>test</scope></dependency>\n    <dependency><groupId>org.junit.vintage</groupId><artifactId>junit-vintage-engine</artifactId><version>${junit}</version><scope>test</scope></dependency>`,
				),
				"admin/src/test/java/io/demo/admin/AdminPageTest.java":
					'package io.demo.admin;\n\nimport static org.junit.Assert.assertEquals;\n\npublic class AdminPageTest {\n    @org.junit.Test\n    public void names() {\n        assertEquals("admin", new io.demo.admin.service.AdminService().name().substring(0, 5));\n    }\n}\n',
			};
			assert.notEqual(vintage["pom.xml"], REACTOR["pom.xml"], "the project's JUnit 4 tests run on the Vintage engine");
			const { reference, detection } = declaredReference(root, vintage);
			const architecture = detection.controls.find((c) => c.control_id === "architecture");
			const tests = detection.controls.find((c) => c.control_id === "maven-test");
			const own = detection.own_negative_witness.architecture;
			assert.ok(
				architecture && tests && own,
				"the copy declares the architecture rules beside the suite of the project",
			);
			const bench = mavenBench(root);

			const q = await qualifyByWitnesses(bench, root, reference, architecture, detection.positive_witness, own);
			assert.deepEqual([q.positive, q.negative, q.qualified], ["PASS", "FAIL", true], JSON.stringify(q.notes));
			const pass = (
				await bench.runner.runControl({
					...bench.base,
					control: widenForMaven(architecture),
					workspace_path: reference,
				})
			).evidence;
			assert.equal(pass.verdict, "FAIL", pass.limits.notes.join("; "));
			const relation = `part admin may not depend on part orders | ${ADMIN_SERVICE}:${lineOf(ADMIN_SERVICE, "new Order()")}`;
			const located = pass.findings.map((f) => `${f.rule_id} | ${f.path}:${f.region?.start_line ?? "-"}`);
			assert.ok(located.includes(relation), `${relation} in\n${located.join("\n")}`);

			const suite = (
				await bench.runner.runControl({ ...bench.base, control: widenForMaven(tests), workspace_path: reference })
			).evidence;
			assert.equal(suite.verdict, "PASS", suite.limits.notes.join("; "));
			assert.equal(
				suite.facts.tests,
				2,
				"the Jupiter test and the JUnit 4 test of the project, and no rule of the map",
			);
		});
});
