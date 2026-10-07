import { describe, expect, it } from "vitest";
import { Clock } from "../src/sync/clock";
import { positionBetween } from "../src/sync/position";
import { seeded } from "./random";

describe("hybrid clock", () => {
  it("stamps in increasing order, also within one millisecond", () => {
    const clock = new Clock("a", () => 1000);
    const stamps = [clock.tick(), clock.tick(), clock.tick()];
    expect([...stamps].sort()).toEqual(stamps);
    expect(new Set(stamps).size).toBe(3);
  });

  it("stamps after anything it has observed, even with a slow wall clock", () => {
    const fast = new Clock("a", () => 5000);
    const slow = new Clock("b", () => 1000);
    const remote = fast.tick();
    slow.observe(remote);
    expect(slow.tick() > remote).toBe(true);
  });

  it("orders equal times by device", () => {
    expect(new Clock("a", () => 1).tick() < new Clock("b", () => 1).tick()).toBe(true);
  });
});

describe("fractional positions", () => {
  it("finds a position between any two", () => {
    const random = seeded(7);
    let keys = [positionBetween(null, null)];
    for (let round = 0; round < 2000; round++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = positionBetween(keys[at - 1] ?? null, keys[at] ?? null);
      if (at > 0) expect(key > keys[at - 1]).toBe(true);
      if (at < keys.length) expect(key < keys[at]).toBe(true);
      keys = [...keys.slice(0, at), key, ...keys.slice(at)];
    }
    expect([...keys].sort()).toEqual(keys);
  });

  it("keeps keys short when appending", () => {
    let last: string | null = null;
    for (let i = 0; i < 1000; i++) last = positionBetween(last, null);
    expect(last!.length).toBeLessThan(40);
  });

  it("refuses an empty interval", () => {
    expect(() => positionBetween("b", "a")).toThrow();
  });
});

