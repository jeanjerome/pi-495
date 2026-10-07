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
