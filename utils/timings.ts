type Timing = { start: number; end?: number };

type TimingKey = string;

const slugify = (key: string) => key.replace(/\//g, ".");

export function createServerTimings() {
  const timings: Record<string, Timing> = {};

  const start = (key: TimingKey) => {
    timings[key] = { start: performance.now() };
    return () => end(key);
  };

  const end = (key: TimingKey) => {
    timings[key].end = performance.now();
  };

  const printTimings = () => {
    return Object.entries(timings)
      .map(([key, timing]) => {
        const duration = (timing.end! - timing.start).toFixed(0);
        return `${slugify(key)};dur=${duration}`;
      })
      .join(", ");
  };

  return {
    start,
    end,
    printTimings,
  };
}
