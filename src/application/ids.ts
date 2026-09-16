import { randomBytes } from "node:crypto";

export interface Clock {
	now(): string;
}

export interface IdSource {
	next(prefix: string): string;
}

export const systemClock: Clock = { now: () => new Date().toISOString() };

export const randomIds: IdSource = { next: (prefix) => `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString("hex")}` };

/** Deterministic ids and clock for tests. */
export function fixedSources(start = Date.parse("2026-09-16T12:00:00.000Z")): { clock: Clock; ids: IdSource; tick(ms?: number): void } {
	let t = start;
	let n = 0;
	return { clock: { now: () => new Date(t).toISOString() }, ids: { next: (p) => `${p}_${(++n).toString().padStart(4, "0")}` }, tick: (ms = 1000) => { t += ms; } };
}
