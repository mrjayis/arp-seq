// Evolve: small, non-destructive per-bar variations, so loops keep moving.
// Each bar gets its own deterministic randomness (seed + bar), so a bar's
// variation is stable while it plays and the saved pattern is never changed.

/** A small seeded PRNG (mulberry32). */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The randomness for one bar (and an optional lane), from a run seed. */
export function barRng(seed, bar, lane = 0) {
  return prng((seed ^ Math.imul(bar + 1, 0x9e3779b1) ^ Math.imul(lane + 1, 0x85ebca6b)) >>> 0);
}

/**
 * Drum rows varied for one bar, by `amount` (0–1). Accents are never touched;
 * ordinary hits may shift a step or drop out; busy rows (3+ ordinary hits) may gain ghost
 * notes. Returns new rows; the input is not modified.
 */
export function evolveDrums(rows, amount, rng, conds = {}) {
  if (amount <= 0) return rows;
  const out = {};
  for (const [id, row] of Object.entries(rows)) {
    const next = row.slice();
    // Ghost notes only suit busy rows of ordinary hits (hats, shakers), not kicks.
    const busy = row.filter((v, s) => v > 0 && v < 1 && !conds[id]?.[s]).length >= 3;
    for (let s = 0; s < row.length; s++) {
      const v = row[s];
      if (v >= 1) continue; // accents are the backbone
      if (conds[id]?.[s]) continue; // conditioned hits (fills, 1:2…) stay on their step
      if (v > 0) {
        const r = rng();
        if (r < amount * 0.12) next[s] = 0; // drop
        else if (r < amount * 0.32) {
          const to = s + (rng() < 0.5 ? -1 : 1);
          if (to >= 0 && to < row.length && row[to] === 0 && next[to] === 0) { next[to] = v; next[s] = 0; } // nudge
        }
      } else if (busy && rng() < amount * 0.08) {
        next[s] = 0.4; // ghost note
      }
    }
    out[id] = next;
  }
  return out;
}

/**
 * A breakbeat tracker row varied for one play, by `amount` (0–1): a different
 * slice, an added roll or reverse, or a slice dropped onto an empty row.
 */
export function evolveBreakRow(row, amount, rng, slices) {
  if (amount <= 0 || !row) return row;
  const r = rng();
  if (row.slice === null || row.slice === undefined) {
    if (row.fx !== 'cut' && r < amount * 0.08) return { ...row, slice: Math.floor(rng() * slices), vol: Math.min(row.vol, 80) };
    return row;
  }
  if (r < amount * 0.25) return { ...row, slice: Math.floor(rng() * slices) };
  if (r < amount * 0.35) return { ...row, roll: Math.max(row.roll || 0, 2 + Math.floor(rng() * 2)), rollType: 'R' };
  if (r < amount * 0.4) return { ...row, fx: row.fx === 'rev' ? '' : 'rev' };
  return row;
}
