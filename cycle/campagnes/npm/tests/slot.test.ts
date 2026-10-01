import { describe, expect, it } from "vitest";

import { MINUTES_IN_DAY, duration, formatTime, overlaps, parseSlot, parseTime, slot } from "../src/slot";

describe("slot", () => {
  it("given bounds that advance inside the day, when built, then it holds them", () => {
    const built = slot(540, 600);

    expect(built).toEqual({ start: 540, end: 600 });
  });

  it("given bounds that do not advance, when built, then it is refused", () => {
    expect(() => slot(600, 600)).toThrow(RangeError);
  });

  it("given a bound outside the day, when built, then it is refused", () => {
    expect(() => slot(0, MINUTES_IN_DAY + 1)).toThrow(RangeError);
  });

  it("given fractional bounds, when built, then it is refused", () => {
    expect(() => slot(0.5, 10)).toThrow(RangeError);
  });

  it("given a slot, when its duration is read, then it is the span in minutes", () => {
    expect(duration(slot(540, 615))).toBe(75);
  });
});

describe("times", () => {
  it("given a time of day, when parsed, then it is the minutes since midnight", () => {
    expect(parseTime("09:30")).toBe(570);
  });

  it("given midnight at the far end, when parsed, then it is the end of the day", () => {
    expect(parseTime("24:00")).toBe(MINUTES_IN_DAY);
  });

  it("given a time past the day, when parsed, then it is refused", () => {
    expect(() => parseTime("24:01")).toThrow(RangeError);
  });

  it("given more than sixty minutes, when parsed, then it is refused", () => {
    expect(() => parseTime("09:60")).toThrow(RangeError);
  });

  it("given minutes since midnight, when formatted, then hours and minutes are padded", () => {
    expect(formatTime(570)).toBe("09:30");
  });

  it("given two times, when a slot is parsed from them, then it spans between them", () => {
    expect(parseSlot("09:00", "10:30")).toEqual({ start: 540, end: 630 });
  });
});

describe("overlaps", () => {
  it("given two slots sharing a minute, when compared, then they overlap", () => {
    expect(overlaps(slot(540, 600), slot(599, 660))).toBe(true);
  });

  it("given two slots that only touch, when compared, then they do not overlap", () => {
    expect(overlaps(slot(540, 600), slot(600, 660))).toBe(false);
  });
});
