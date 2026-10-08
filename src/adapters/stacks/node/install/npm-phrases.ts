/** What the owner is told npm does with the packages it installs in a copy, and what its inspection accepts. */
import type { InstallPhrases } from "../../../../application/stacks/plugin.ts";

export const NPM_PHRASES: { fr: InstallPhrases; en: InstallPhrases } = {
	fr: {
		complementLabel: (names) => `installe ${names}`,
		complementDoes: (names) => `installe ${names} dans une copie du projet`,
		runsNothing: "sans exécuter de script d'installation",
		complementInspected:
			"le résultat est inspecté et n'est accepté que s'il ajoute des paquets sans rien modifier de ce qui existait",
		referentialLabel: (names) => `installe ${names} dans une copie`,
		referentialDoes: (names) => `installe ${names} comme dépendances de développement exactes dans une copie du projet`,
		referentialInspected:
			"la copie est inspectée et l'installation n'est acceptée que si elle ne modifie que package.json, package-lock.json et node_modules/",
		architecture: {
			label: (names) => `installe ${names} dans une copie`,
			does: (names) =>
				`installe ${names} comme dépendances de développement exactes dans une copie du projet, sans exécuter de script d'installation`,
			inspected:
				"la copie est inspectée et l'installation n'est acceptée que si elle ne modifie que package.json, package-lock.json et node_modules/",
		},
	},
	en: {
		complementLabel: (names) => `installs ${names}`,
		complementDoes: (names) => `installs ${names} in a copy of the project`,
		runsNothing: "running no install script",
		complementInspected:
			"the result is inspected and accepted only if it adds packages and changes nothing that existed",
		referentialLabel: (names) => `installs ${names} in a copy`,
		referentialDoes: (names) => `installs ${names} as exact development dependencies in a copy of the project`,
		referentialInspected:
			"the copy is inspected and the install is accepted only if it changes nothing but package.json, package-lock.json and node_modules/",
		architecture: {
			label: (names) => `installs ${names} in a copy`,
			does: (names) =>
				`installs ${names} as exact development dependencies in a copy of the project, running no install script`,
			inspected:
				"the copy is inspected and the install is accepted only if it changes nothing but package.json, package-lock.json and node_modules/",
		},
	},
};
