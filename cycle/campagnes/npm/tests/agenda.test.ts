import { describe, expect, it } from "vitest";

import { firstFit, freeSlots, isFree, merge } from "../src/agenda";
import { MINUTES_IN_DAY, slot } from "../src/slot";

describe("merge", () => {
  it("given no slot, when merged, then nothing comes back", () => {
    expect(merge([])).toEqual([]);
  });

  it("given slots out of order, when merged, then they come back ascending", () => {
    const merged = merge([slot(600, 660), slot(120, 180)]);

    expect(merged).toEqual([slot(120, 180), slot(600, 660)]);
  });

  it("given two overlapping slots, when merged, then they become one", () => {
    const merged = merge([slot(540, 620), slot(600, 660)]);

    expect(merged).toEqual([slot(540, 660)]);
  });

  it("given two slots that only touch, when merged, then they become one", () => {
    const merged = merge([slot(540, 600), slot(600, 660)]);

    expect(merged).toEqual([slot(540, 660)]);
  });

  it("given a slot swallowed by another, when merged, then the longer one remains", () => {
    const merged = merge([slot(540, 720), slot(600, 660)]);

    expect(merged).toEqual([slot(540, 720)]);
  });
});

describe("freeSlots", () => {
  it("given an empty day, when read, then the whole day is free", () => {
    expect(freeSlots([])).toEqual([slot(0, MINUTES_IN_DAY)]);
  });

  it("given a busy slot mid-day, when read, then the day is free on both sides", () => {
    const free = freeSlots([slot(540, 600)]);

    expect(free).toEqual([slot(0, 540), slot(600, MINUTES_IN_DAY)]);
  });

  it("given a day busy end to end, when read, then nothing is free", () => {
    expect(freeSlots([slot(0, MINUTES_IN_DAY)])).toEqual([]);
  });

  it("given slots that touch, when read, then no free minute is reported between them", () => {
    const free = freeSlots([slot(0, 600), slot(600, MINUTES_IN_DAY)]);

    expect(free).toEqual([]);
  });
});

describe("firstFit", () => {
  it("given an empty day, when a booking is sought, then it starts at midnight", () => {
    expect(firstFit([], 60)).toEqual(slot(0, 60));
  });

  it("given a gap too short, when a booking is sought, then a later gap is taken", () => {
    const busy = [slot(0, 540), slot(570, MINUTES_IN_DAY - 120)];

    const found = firstFit(busy, 60);

    expect(found).toEqual(slot(MINUTES_IN_DAY - 120, MINUTES_IN_DAY - 60));
  });

  it("given no gap long enough, when a booking is sought, then none comes back", () => {
    expect(firstFit([slot(0, MINUTES_IN_DAY)], 30)).toBeUndefined();
  });

  it("given a booking of no minutes, when it is sought, then it is refused", () => {
    expect(() => firstFit([], 0)).toThrow(RangeError);
  });
});

describe("isFree", () => {
  it("given a candidate over a busy slot, when checked, then it is not free", () => {
    expect(isFree([slot(540, 600)], slot(570, 630))).toBe(false);
  });

  it("given a candidate against the end of a busy slot, when checked, then it is free", () => {
    expect(isFree([slot(540, 600)], slot(600, 660))).toBe(true);
  });
});
