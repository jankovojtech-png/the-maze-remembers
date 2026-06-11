/**
 * Difficulty curve — scales with escape count.
 *
 * Steepness target: noticeably harder by escape 5–8.
 *
 * escape  0 → 11×11,  3.0 fog cells, 13s shifts, 2 mutations
 * escape  5 → 21×21,  2.6 fog cells,  9s shifts, 3 mutations
 * escape  8 → 25×25,  2.4 fog cells,  8s shifts, 4 mutations
 * escape 15 → 31×31,  1.9 fog cells,  6s shifts, 7 mutations
 * escape 20 → 35×35,  1.8 fog cells,  5s shifts, 9 mutations  (plateau)
 */
export interface Difficulty {
  gridSize: number;       // always odd
  fogCells: number;       // visibility radius in cells
  shiftInterval: number;  // ms between maze shifts
  mutationCount: number;  // walls toggled per shift
  loopChance: number;     // fraction of interior walls punched to form loops
}

export function getDifficulty(escapes: number): Difficulty {
  const e = Math.min(escapes, 20); // plateau after 20

  // Grid: grows by 2 every 2 escapes  →  11 at 0, 21 at 5, 31 at 10, cap 35
  const rawSize = 11 + Math.floor(e / 2) * 2;
  const gridSize = Math.min(35, rawSize % 2 === 0 ? rawSize + 1 : rawSize);

  // Fog: 3.0 → 1.8 over 20 escapes  (−0.06/escape)
  const fogCells = Math.max(1.8, 3.0 - e * 0.06);

  // Shifts: 13 000 → 5 000 ms  (−400ms/escape)
  const shiftInterval = Math.max(5000, 13000 - e * 400);

  // Mutations: 2 → 10  (+1 every 2 escapes)
  const mutationCount = Math.min(10, 2 + Math.floor(e / 2));

  // Loops: slight extra loops at higher difficulty make navigation trickier
  const loopChance = Math.min(0.09, 0.045 + e * 0.002);

  return { gridSize, fogCells, shiftInterval, mutationCount, loopChance };
}

// ─── Persistent score ─────────────────────────────────────────────────────────
const LS_KEY = 'maze_v2_best_escapes';

export function getBestEscapes(): number {
  try { return +(localStorage.getItem(LS_KEY) ?? '0'); } catch { return 0; }
}

export function saveBestEscapes(n: number): void {
  try {
    if (n > getBestEscapes()) localStorage.setItem(LS_KEY, `${n}`);
  } catch {}
}
