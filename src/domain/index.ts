/**
 * Domain kernel (CMP-DOM): the surface of the pure core — transitions, gates, invalidation,
 * budgets, authority and evidence combination. No I/O, no clock, no model.
 */
export * from "./errors.ts";
export * from "./policy.ts";
export * from "./invalidation.ts";
export * from "./change/state.ts";
export * from "./change/events.ts";
export * from "./change/commands.ts";
export * from "./change/apply.ts";
export * from "./change/decide.ts";
export * from "./gates/g2.ts";
export * from "./gates/g4.ts";
export * from "./gates/g5.ts";
export * from "./program/program.ts";
