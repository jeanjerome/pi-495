/**
 * A slot is a half-open range of minutes from midnight: `start` is inside it, `end` is not.
 *
 * Half-open is what makes two slots that touch — one ending at 600, the next starting at 600 —
 * not overlap, so a day can be tiled without a minute belonging to two slots at once.
 */
export interface Slot {
  readonly start: number;
  readonly end: number;
}

/** Minutes in a day; every slot lies within `[0, MINUTES_IN_DAY]`. */
export const MINUTES_IN_DAY = 24 * 60;

/**
 * Build a slot, refusing one that a day cannot hold.
 *
 * @throws RangeError when the bounds fall outside the day or do not increase.
 */
export function slot(start: number, end: number): Slot {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new RangeError(`slot bounds must be whole minutes: ${start}..${end}`);
  }
  if (start < 0 || end > MINUTES_IN_DAY) {
    throw new RangeError(`slot outside the day: ${start}..${end}`);
  }
  if (start >= end) {
    throw new RangeError(`slot does not advance: ${start}..${end}`);
  }
  return { start, end };
}

/** Read a slot from two `HH:MM` times. */
export function parseSlot(start: string, end: string): Slot {
  return slot(parseTime(start), parseTime(end));
}

/** Read `HH:MM` as minutes from midnight; `24:00` is the end of the day. */
export function parseTime(text: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(text.trim());
  if (match === null) {
    throw new RangeError(`not a time: ${JSON.stringify(text)}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours * 60 + minutes > MINUTES_IN_DAY) {
    throw new RangeError(`not a time in the day: ${text}`);
  }
  return hours * 60 + minutes;
}

/** Write minutes from midnight as `HH:MM`. */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** How long a slot lasts, in minutes. */
export function duration(s: Slot): number {
  return s.end - s.start;
}

/** Whether two slots share at least one minute. Touching bounds do not overlap. */
export function overlaps(a: Slot, b: Slot): boolean {
  return a.start < b.end && b.start < a.end;
}
