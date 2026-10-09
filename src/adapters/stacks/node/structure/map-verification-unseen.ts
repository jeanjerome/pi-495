/**
 * What the verification of an adopted map on a Node package does not see — the rules of the map dependency-cruiser
 * checks with its swc parser, and the dependencies Knip compares to those the code uses — each point with its
 * reason, as the owner reads it under the map.
 */
import type { UnseenByVerification } from "../../../../contracts/v1/protocol.ts";

export const MAP_VERIFICATION_UNSEEN: readonly UnseenByVerification[] = [
	{
		fr: "les sources .mts et .cts : swc ne les lit pas sous dependency-cruiser 18.5.0, qui ne les compte pas parmi les modules",
		en: "the .mts and .cts sources: swc does not read them under dependency-cruiser 18.5.0, which does not count them among the modules",
	},
	{
		fr: "les liens établis sans import ni require d'un chemin écrit en toutes lettres (chemin calculé, injection, configuration d'un framework) : dependency-cruiser ne suit que les chemins que les sources écrivent",
		en: "the links established without an import or a require of a path written out in full (computed path, injection, configuration of a framework): dependency-cruiser follows only the paths the sources write",
	},
	{
		fr: "les sources de test : les règles de la carte ne les jugent pas, elles ne portent que sur les sources principales",
		en: "the test sources: the rules of the map do not judge them, they are about the main sources alone",
	},
	{
		fr: "les paquets installés sous node_modules : les règles de la carte ne les opposent à aucune partie, qui n'est faite que de dossiers des sources",
		en: "the packages installed under node_modules: the rules of the map oppose them to no part, a part being made of folders of the sources alone",
	},
	{
		fr: "une dépendance chargée par un chemin calculé, ou seulement par la configuration d'un outil dont Knip ne connaît pas le format : Knip ne voit pas cet usage, et la donne comme inutilisée",
		en: "a dependency loaded by a computed path, or only by the configuration of a tool whose format Knip does not know: Knip does not see that use, and gives it as unused",
	},
	{
		fr: "les binaires que les scripts de package.json appellent : 495 ne les compare pas aux dépendances déclarées, un script appelant souvent un outil de la machine que le paquet n'a pas à déclarer",
		en: "the binaries the scripts of package.json call: 495 does not compare them to the declared dependencies, a script often calling a tool of the machine the package need not declare",
	},
	{
		fr: "les paquets que 495 installe dans la copie (dependency-cruiser, @swc/core, knip) : ils sont écartés de l'analyse, et une déclaration que le projet en fait n'est jamais donnée comme inutilisée",
		en: "the packages 495 installs in the copy (dependency-cruiser, @swc/core, knip): they are left out of the analysis, and a declaration of them by the project is never given as unused",
	},
];
