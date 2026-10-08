/**
 * What the verification of an adopted map on a Maven reactor does not see — the rules of the map ArchUnit checks
 * and the analysis of the dependencies — each point with its reason, as the owner reads it under the map.
 */
import type { UnseenByVerification } from "../../../../contracts/v1/protocol.ts";

export const MAP_VERIFICATION_UNSEEN: readonly UnseenByVerification[] = [
	{
		fr: "les liens établis sans import ni référence dans les classes compilées (réflexion, META-INF/services, configuration d'un framework) : ArchUnit et dependency:analyze ne lisent que les classes compilées",
		en: "the links established without an import or a reference in the compiled classes (reflection, META-INF/services, configuration of a framework): ArchUnit and dependency:analyze read the compiled classes alone",
	},
	{
		fr: "les sources de test : les règles de la carte ne les jugent pas, elles ne portent que sur les sources principales",
		en: "the test sources: the rules of the map do not judge them, they are about the main sources alone",
	},
	{
		fr: "les bibliothèques hors du réacteur : les règles de la carte ne les opposent à aucune partie, qui n'est faite que de modules du réacteur",
		en: "the libraries outside the reactor: the rules of the map oppose them to no part, a part being made of modules of the reactor alone",
	},
	{
		fr: "les dépendances déclarées pour la seule exécution (portée runtime) : aucune classe compilée ne les utilise, et 495 les écarte de l'analyse",
		en: "the dependencies declared for the runtime alone (scope runtime): no compiled class uses them, and 495 leaves them out of the analysis",
	},
	{
		fr: "les dépendances dont les classes compilées ne gardent aucune trace (constante recopiée à la compilation, annotation gardée dans la seule source, processeur d'annotations) : dependency:analyze ne les voit pas utilisées, et elles sont données comme inutilisées",
		en: "the dependencies of which the compiled classes keep no trace (a constant copied at compile time, an annotation kept in the source alone, an annotation processor): dependency:analyze does not see them used, and they are given as unused",
	},
	{
		fr: "les agrégats comme junit-jupiter : un agrégat n'apporte aucune classe à lui, il est donné comme inutilisé quand ce qu'il apporte est donné comme utilisé sans être déclaré",
		en: "the aggregates such as junit-jupiter: an aggregate brings no class of its own, it is given as unused when what it brings is given as used without being declared",
	},
];
