/**
 * A hybrid logical clock. Stamps are strings that sort in causal order:
 * wall time, then a counter for stamps within one millisecond, then the
 * device id so two devices never produce equal stamps.
 */
export class Clock {
  private wall = 0;
  private counter = 0;

  constructor(
    readonly device: string,
    private now: () => number = Date.now,
  ) {}

  tick(): string {
    const wall = this.now();
    if (wall > this.wall) {
      this.wall = wall;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return stamp(this.wall, this.counter, this.device);
  }

  /** Moves past a stamp seen from elsewhere, so the next local stamp is later than it. */
  observe(seen: string): void {
    const { wall, counter } = parseStamp(seen);
    if (wall > this.wall || (wall === this.wall && counter > this.counter)) {
      this.wall = wall;
      this.counter = counter;
    }
  }
}

const WALL_WIDTH = 11;
const COUNTER_WIDTH = 5;

function stamp(wall: number, counter: number, device: string): string {
  return `${wall.toString(36).padStart(WALL_WIDTH, "0")}-${counter.toString(36).padStart(COUNTER_WIDTH, "0")}-${device}`;
}

function parseStamp(value: string): { wall: number; counter: number } {
  return {
    wall: parseInt(value.slice(0, WALL_WIDTH), 36),
    counter: parseInt(value.slice(WALL_WIDTH + 1, WALL_WIDTH + 1 + COUNTER_WIDTH), 36),
  };
}

export function newDeviceId(): string {
  return Math.random().toString(36).slice(2, 10);
}
