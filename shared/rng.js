/** Small deterministic PRNG so the server and every client build the same world. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
