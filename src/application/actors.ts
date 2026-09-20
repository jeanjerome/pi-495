/**
 * The two actors the harness itself acts as. The kernel commits every normative transition; the
 * executor produces observations by running a control, and never decides what they are worth.
 * Neither is ever borrowed by an agent or a human: authority is read off the actor (AT-01, AT-03).
 */
import type { ActorRef } from "../contracts/v1/common.ts";

export const KERNEL_ACTOR: ActorRef = {
	actor_id: "495-kernel",
	actor_type: "kernel",
	role: "kernel",
	origin: "kernel",
	authentication_level: "host_qualified",
};
export const EXECUTOR_ACTOR: ActorRef = {
	actor_id: "495-executor",
	actor_type: "executor",
	role: "executor",
	origin: "executor",
	authentication_level: "host_qualified",
};
