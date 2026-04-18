export const createSeededRng = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0xffffffff;
  };
};

export const pick = <T>(items: T[], rng: () => number): T => {
  const index = Math.floor(rng() * items.length);
  return items[index];
};
