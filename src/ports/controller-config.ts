import type { ActivePolicy } from "../domain/policy.ts";

/**
 * The controller's configuration, which 495 writes only on the owner's answer that gives a control a directory (D-90).
 */
export interface ControllerConfigPort {
	/**
	 * Adds `directories` to the writable paths the configuration gives the control `controlId`, each once, leaving every
	 * other setting as it is, and returns the policy read back from it.
	 */
	grantWritable(controlId: string, directories: readonly string[]): ActivePolicy;
}
