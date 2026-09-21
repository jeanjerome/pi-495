import type { InterventionEvent } from "../../src/ports/execution.ts";

/** Drains an intervention event stream to its end, so a test can assert on what was relayed. */
export async function collect(events: AsyncIterable<InterventionEvent>): Promise<InterventionEvent[]> {
	const out: InterventionEvent[] = [];
	for await (const e of events) out.push(e);
	return out;
}
