/**
 * How the owner is told what adopting a complement or a referential does, in the words the technology of its
 * package manager declares: npm and Maven read as they always have, word for word, in French and in English.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest, type Adoptable, type ReferentialOffer } from "../../src/application/decisions.ts";
import type { PackageInstall } from "../../src/contracts/v1/protocol.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const VITEST: PackageInstall = { package: "@vitest/coverage-v8", version: "3.2.4", manager: "npm" };
const ESLINT: PackageInstall = { package: "eslint", version: "9.0.0", manager: "npm" };
const JACOCO: PackageInstall = { package: "org.jacoco:jacoco-maven-plugin", version: "0.8.15", manager: "maven" };

/** The option that adopts, as the owner reads it in `language`, for a complement or a referential. */
function adoptOption(
	language: "fr" | "en",
	offer: { adoptable: Adoptable } | { referential: ReferentialOffer },
): { label: string; effect: string } {
	const options = buildDecisionRequest({
		decision_id: "dec_1",
		change_id: "chg_1",
		interaction: "IH-04",
		subject: { kind: "artifact", id: "req_0001", revision: 1, digest: "sha256:00" },
		language,
		facts: [],
		recommendation: null,
		arg: "R1",
		requested_at: "2026-10-07T12:00:00.000Z",
		installers: (manager) => STACKS_OF_495.installerOf(manager)?.install,
		...offer,
	}).options;
	const adopt = options.find((option) => option.id.startsWith("adopt_"));
	assert.ok(adopt !== undefined, `${language}: an option adopts`);
	return { label: adopt.label, effect: adopt.effect };
}

const OFFERS = {
	maven_repo: {
		adoptable: { files: ["pom.xml"], installs: [JACOCO], outside_directories: { maven: "/m2/repository" } },
	},
	npm_maven: { adoptable: { files: [], installs: [VITEST, JACOCO] } },
	ref_npm: { referential: { stack: "node", installs: [VITEST, ESLINT] } },
	ref_maven: { referential: { stack: "maven", installs: [JACOCO] } },
} as const;

/** The label and the effect the owner reads for each offer. */
const PRESENTED = {
	maven_repo: {
		fr: {
			label:
				"Adopter le complément (modifie pom.xml ; résout org.jacoco:jacoco-maven-plugin 0.8.15, réseau ouvert pour cette seule étape)",
			effect:
				"495 applique à pom.xml la modification exacte que la recommandation décrit, puis résout org.jacoco:jacoco-maven-plugin 0.8.15 avec Maven dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter aucun but du greffon ; les fichiers téléchargés sont écrits dès l'adoption dans le dépôt local que Maven désigne (/m2/repository) et y restent si l'intégration est refusée ; la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml ; le complément arrive dans le projet avec le candidat, à l'intégration que vous acceptez. Cela ne juge pas l'exigence : elle reste à préparer, à assigner ou à réviser, et la question est reposée sans cette issue si elle reste sans juge. La réponse tombe si les exigences sont révisées.",
		},
		en: {
			label:
				"Adopt the complement (edits pom.xml; resolves org.jacoco:jacoco-maven-plugin 0.8.15, network open for that step alone)",
			effect:
				"495 applies to pom.xml the exact edit the recommendation describes, then resolves org.jacoco:jacoco-maven-plugin 0.8.15 with Maven in a copy of the project, opening the network for that step alone and running no goal of the plugin; the downloaded files are written from the adoption into the local repository Maven designates (/m2/repository) and stay there if the integration is refused; the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml; the complement reaches the project with the candidate, at the integration you accept. It does not judge the requirement: it is still to be prepared, assigned or revised, and the question is asked again without this option if the requirement is still left without a judge. The answer lapses if the requirements are revised.",
		},
	},
	npm_maven: {
		fr: {
			label:
				"Adopter le complément (installe @vitest/coverage-v8 3.2.4, réseau ouvert pour cette seule étape ; résout org.jacoco:jacoco-maven-plugin 0.8.15, réseau ouvert pour cette seule étape)",
			effect:
				"495 installe @vitest/coverage-v8 3.2.4 dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter de script d'installation, puis résout org.jacoco:jacoco-maven-plugin 0.8.15 avec Maven dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter aucun but du greffon ; les fichiers téléchargés sont écrits dès l'adoption dans le dépôt local que Maven désigne et y restent si l'intégration est refusée ; le résultat est inspecté et n'est accepté que s'il ajoute des paquets sans rien modifier de ce qui existait ; la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml ; le complément arrive dans le projet avec le candidat, à l'intégration que vous acceptez. Cela ne juge pas l'exigence : elle reste à préparer, à assigner ou à réviser, et la question est reposée sans cette issue si elle reste sans juge. La réponse tombe si les exigences sont révisées.",
		},
		en: {
			label:
				"Adopt the complement (installs @vitest/coverage-v8 3.2.4, network open for that step alone; resolves org.jacoco:jacoco-maven-plugin 0.8.15, network open for that step alone)",
			effect:
				"495 installs @vitest/coverage-v8 3.2.4 in a copy of the project, opening the network for that step alone and running no install script, then resolves org.jacoco:jacoco-maven-plugin 0.8.15 with Maven in a copy of the project, opening the network for that step alone and running no goal of the plugin; the downloaded files are written from the adoption into the local repository Maven designates and stay there if the integration is refused; the result is inspected and accepted only if it adds packages and changes nothing that existed; the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml; the complement reaches the project with the candidate, at the integration you accept. It does not judge the requirement: it is still to be prepared, assigned or revised, and the question is asked again without this option if the requirement is still left without a judge. The answer lapses if the requirements are revised.",
		},
	},
	ref_npm: {
		fr: {
			label:
				"Adopter le référentiel (installe @vitest/coverage-v8 3.2.4, eslint 9.0.0 dans une copie, réseau ouvert pour cette seule étape)",
			effect:
				"495 installe @vitest/coverage-v8 3.2.4, eslint 9.0.0 comme dépendances de développement exactes dans une copie du projet, en ouvrant le réseau pour cette seule étape et sans exécuter de script d'installation ; la copie est inspectée et l'installation n'est acceptée que si elle ne modifie que package.json, package-lock.json et node_modules/ ; rien n'est écrit dans le projet. Le référentiel est gelé dans le protocole avec la date de cette décision, et l'état des lieux mesure l'exigence avec lui. Si l'installation échoue, rien n'est adopté et l'exigence reste un angle mort avec la raison donnée par npm. La réponse tombe si les exigences sont révisées.",
		},
		en: {
			label:
				"Adopt the referential (installs @vitest/coverage-v8 3.2.4, eslint 9.0.0 in a copy, network open for that step alone)",
			effect:
				"495 installs @vitest/coverage-v8 3.2.4, eslint 9.0.0 as exact development dependencies in a copy of the project, opening the network for that step alone and running no install script; the copy is inspected and the install is accepted only if it changes nothing but package.json, package-lock.json and node_modules/; nothing is written in the project. The referential is frozen in the protocol with the date of this decision, and the survey measures the requirement with it. If the install fails, nothing is adopted and the requirement stays a blind spot with the reason npm gave. The answer lapses if the requirements are revised.",
		},
	},
	ref_maven: {
		fr: {
			label:
				"Adopter le référentiel (déclare org.jacoco:jacoco-maven-plugin 0.8.15 dans une copie du POM et le résout, réseau ouvert pour cette seule étape)",
			effect:
				"495 déclare org.jacoco:jacoco-maven-plugin 0.8.15 dans une copie du POM et résout le greffon avec Maven, en ouvrant le réseau pour cette seule étape et sans exécuter aucun but du greffon ; la copie est inspectée et la résolution n'est acceptée que si elle ne modifie aucun fichier autre que pom.xml ; rien n'est écrit dans le projet. Le référentiel est gelé dans le protocole avec la date de cette décision, et l'état des lieux mesure l'exigence avec lui. Si la résolution échoue, rien n'est adopté et l'exigence reste un angle mort avec la raison donnée par Maven. La réponse tombe si les exigences sont révisées.",
		},
		en: {
			label:
				"Adopt the referential (declares org.jacoco:jacoco-maven-plugin 0.8.15 in a copy of the POM and resolves it, network open for that step alone)",
			effect:
				"495 declares org.jacoco:jacoco-maven-plugin 0.8.15 in a copy of the POM and resolves the plugin with Maven, opening the network for that step alone and running no goal of the plugin; the copy is inspected and the resolution is accepted only if it changes no file other than pom.xml; nothing is written in the project. The referential is frozen in the protocol with the date of this decision, and the survey measures the requirement with it. If the resolution fails, nothing is adopted and the requirement stays a blind spot with the reason Maven gave. The answer lapses if the requirements are revised.",
		},
	},
} as const;

describe("the words the owner reads for adopting a complement or a referential of npm and of Maven", () => {
	it("given a complement of Maven with the local repository Maven announced, the complements of npm and of Maven together with none announced, the referential of Node and the referential of Maven, then the option that adopts carries, in French and in English, exactly the label and the effect npm and Maven have always been presented with", () => {
		for (const [offer, presented] of Object.entries(PRESENTED) as [
			keyof typeof OFFERS,
			(typeof PRESENTED)[keyof typeof OFFERS],
		][])
			for (const language of ["fr", "en"] as const)
				assert.deepEqual(adoptOption(language, OFFERS[offer]), presented[language], `${offer} in ${language}`);
	});
});
