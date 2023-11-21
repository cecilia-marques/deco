interface Timing {
  name: string;
  desc?: string;
  start: number;
  end?: number;
}

export function createServerTimings() {
  const timings: Timing[] = [];

  const start = (name: string, desc?: string, start?: number) => {
    const t: Timing = { name, desc, start: start || performance.now() };

    timings.push(t);

    return (desc?: string) => {
      t.end = performance.now();
      t.desc ||= desc;
    };
  };

  const printTimings = () =>
    timings
      .map(({ name, desc, start, end }) => {
        if (!end) return;

        return `${encodeURIComponent(name)}${desc ? `;desc=${desc}` : ""};dur=${
          (end - start).toFixed(0)
        }`;
      })
      .filter(Boolean)
      .join(", ");

  return {
    start,
    printTimings,
  };
}
