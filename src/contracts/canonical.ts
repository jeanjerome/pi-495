/**
 * Canonical JSON serialisation used for digests and equality.
 *
 * Keys are sorted lexicographically by UTF-16 code unit, no insignificant whitespace, `undefined`
 * members are omitted, `null`, absent and zero remain distinct. Non-finite numbers are refused so
 * that a digest never depends on a platform-specific rendering.
 */
export function canonicalize(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
	if (value === null) return null;
	if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortValue(v)));
	switch (typeof value) {
		case "number":
			if (!Number.isFinite(value)) throw new TypeError("canonical JSON cannot represent a non-finite number");
			return value;
		case "string":
		case "boolean":
			return value;
		case "bigint":
			throw new TypeError("canonical JSON cannot represent a bigint");
		case "object": {
			const out: Record<string, unknown> = {};
			for (const key of Object.keys(value as object).sort()) {
				const v = (value as Record<string, unknown>)[key];
				if (v === undefined) continue;
				out[key] = sortValue(v);
			}
			return out;
		}
		default:
			throw new TypeError(`canonical JSON cannot represent ${typeof value}`);
	}
}
