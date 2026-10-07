/** The model of a Maven project its capabilities share (CMP-TGT): its reactor, read once, and what its build binds. */
import type { MavenReactor } from "./reactor.ts";

export interface MavenProject {
	reactor: MavenReactor;
	/** Whether `mvn test` leaves a JaCoCo report: the test control then provides it to the coverage control. */
	jacoco_report_bound: boolean;
}
