/**
 * Deterministic pseudo-random integers (xorshift32) for generated tests: the same seed always
 * gives the same values, so a failing case can be replayed from the seed in its message.
 */
export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  // Mixes the seed so that close seeds do not start alike.
  for (let warmUp = 0; warmUp < 8; warmUp += 1) next();
  /** An integer from `min` to `max`, both included. */
  const integer = (min: number, max: number) => min + (next() % (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[integer(0, items.length - 1)]!;
  return { integer, pick };
}
