/**
 * What the verification of an adopted map on a Maven reactor does not see — the rules of the map ArchUnit checks,
 * the analysis of the dependencies and the reading of the links established by configuration or by reflection —
 * each point with its reason, as the owner reads it under the map.
 */
import type { UnseenByVerification } from "../../../../contracts/v1/protocol.ts";

export const MAP_VERIFICATION_UNSEEN: readonly UnseenByVerification[] = [
	{
		fr: "les noms de classe construits à l'exécution (concaténation, valeur substituée) : 495 ne relève qu'un nom écrit en entier dans la chaîne ou le fichier qui le porte",
		en: "the class names built at runtime (concatenation, substituted value): 495 reads only a name written in full in the string or the file that carries it",
	},
	{
		fr: "les classes désignées autrement que par leur nom entier (balayage d'un paquet, nom court, nom d'un fichier comme sous META-INF/services) : lire chacun de ces mécanismes demanderait un lecteur par framework",
		en: "the classes designated otherwise than by their full name (scan of a package, short name, name of a file as under META-INF/services): reading each of these mechanisms would take a reader per framework",
	},
	{
		fr: "les liens établis par configuration ou par réflexion entre deux paquets d'une même partie : 495 les juge par les relations entre parties, pas par les anneaux ni les couches de la partie",
		en: "the links established by configuration or by reflection between two packages of the same part: 495 judges them by the relations between parts, not by the rings or the layers of the part",
	},
	{
		fr: "les fichiers de configuration hors du src/main/ d'un module : 495 ne lit que les fichiers des sources principales de chaque module",
		en: "the configuration files outside the src/main/ of a module: 495 reads the files of the main sources of each module alone",
	},
	{
		fr: "les fichiers de configuration qu'aucune partie ne revendique seule : ni le périmètre d'une seule partie ne nomme leur module, ni un paquet d'une seule partie ne correspond à leur dossier, et 495 ne sait pas de quelle partie part le lien",
		en: "the configuration files no part claims alone: neither the perimeter of a single part names their module nor a package of a single part matches their folder, so 495 cannot tell which part the link starts from",
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
