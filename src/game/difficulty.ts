/**
 * Pure difficulty curve — no level configs, no objectives, no keys.
 * Difficulty scales continuously with escape count.
 */
export interface Difficulty {
  gridSize: number;       // always odd
  fogCells: number;       // fog radius in cells
  shiftInterval: number;  // ms between maze shifts
  mutationCount: number;  // walls changed per shift
}

/**
 * Difficulty ramps smoothly over ~30 escapes then plateaus.
 *
 * escape  0 → 11×11 grid, 4.5 fog cells, 14s shifts, 2 mutations
 * escape 30 → 29×29 grid, 2.5 fog cells,  7s shifts, 6 mutations
 */
export function getDifficulty(escapes: number): Difficulty {
  const e = Math.min(escapes, 30);

  // Grid size: 11 → 29 in steps of 2, one step every 3 escapes
  const rawSize = 11 + Math.floor(e / 3) * 2;
  const gridSize = Math.min(29, rawSize % 2 === 0 ? rawSize + 1 : rawSize);

  return {
    gridSize,
    fogCells:      Math.max(2.0, 3.0 - e * 0.033),  // 3.0 → 2.0 over 30 escapes
    shiftInterval: Math.max(7000, 14000 - e * 250),
    mutationCount: Math.min(6, 2 + Math.floor(e / 5)),
  };
}

// ─── Persistent score ────────────────────────────────────────────────────────
const LS_KEY = 'maze_v2_best_escapes';

export function getBestEscapes(): number {
  try { return +(localStorage.getItem(LS_KEY) ?? '0'); } catch { return 0; }
}

export function saveBestEscapes(n: number): void {
  try {
    if (n > getBestEscapes()) localStorage.setItem(LS_KEY, `${n}`);
  } catch {}
}
