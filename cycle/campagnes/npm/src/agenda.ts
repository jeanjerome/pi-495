/** A day's worth of slots: what is taken, and what that leaves free. */

import { MINUTES_IN_DAY, type Slot, overlaps, slot } from "./slot";

/**
 * Merge slots into the fewest that cover the same minutes, in ascending order.
 *
 * Two slots that touch are merged: an agenda busy 09:00–10:00 and 10:00–11:00 is busy
 * 09:00–11:00, with no free minute between them to report.
 */
export function merge(slots: readonly Slot[]): Slot[] {
  const sorted = [...slots].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Slot[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && current.start <= last.end) {
      merged[merged.length - 1] = slot(last.start, Math.max(last.end, current.end));
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/**
 * The slots of the day no busy slot covers, in ascending order.
 *
 * A day nothing covers is free in one slot; a day covered end to end is free in none.
 */
export function freeSlots(busy: readonly Slot[]): Slot[] {
  const free: Slot[] = [];
  let cursor = 0;
  for (const taken of merge(busy)) {
    if (taken.start > cursor) {
      free.push(slot(cursor, taken.start));
    }
    cursor = Math.max(cursor, taken.end);
  }
  if (cursor < MINUTES_IN_DAY) {
    free.push(slot(cursor, MINUTES_IN_DAY));
  }
  return free;
}

/**
 * The earliest free slot of `minutes` minutes, or `undefined` when the day has no room.
 *
 * The slot returned starts as early as the day allows, so that booking it leaves the longest
 * possible run of free time after it.
 */
export function firstFit(busy: readonly Slot[], minutes: number): Slot | undefined {
  if (minutes <= 0) {
    throw new RangeError(`a booking lasts at least a minute: ${minutes}`);
  }
  for (const free of freeSlots(busy)) {
    if (free.end - free.start >= minutes) {
      return slot(free.start, free.start + minutes);
    }
  }
  return undefined;
}

/** Whether `candidate` can be added to `busy` without sharing a minute with any of them. */
export function isFree(busy: readonly Slot[], candidate: Slot): boolean {
  return !busy.some((taken) => overlaps(taken, candidate));
}
