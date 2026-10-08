/** What several responsibilities of the Maven technology share. */

/** The date the versions this technology recommends were checked against the sources they cite. */
export const CATALOGUE_DATE = "2026-09-30";

/**
 * The property 495 sets at each run of the PMD control to the rule set it writes from the frozen
 * protocol. The plugin reads no rule set from its command line, so the declaration names this
 * property instead, and a POM that names it is one 495 declared PMD in.
 */
export const PMD_RULESET_PROPERTY = "pmd495.ruleset";

/** The name under which `maven-test` provides the JaCoCo report it writes to the coverage control that requires it. */
export const JACOCO_REPORT_NAME = "jacoco-report";

/** The PMD plugin the quality referential of this technology declares, at the version its catalogue pins. */
export const PMD_PLUGIN = "org.apache.maven.plugins:maven-pmd-plugin";
export const PMD_PLUGIN_VERSION = "3.28.0";

/** The ArchUnit artifact that verifies an adopted architecture map, at the version `specs/adr/D-87` pins. */
export const ARCHUNIT = "com.tngtech.archunit:archunit-junit5";
export const ARCHUNIT_VERSION = "1.5.1";

/**
 * The property 495 sets at each run of the architecture control to the directory of the rules it writes from
 * the frozen map. The profile that declares ArchUnit is activated by it alone, so the build of the project
 * without it, its tests included, is the build of the project; a POM that names it is one 495 declared ArchUnit in.
 */
export const ARCHUNIT_RULES_PROPERTY = "archunit495.rules";
