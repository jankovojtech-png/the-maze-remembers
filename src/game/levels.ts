import type { LevelConfig, ObjectiveType } from './types';

export const FIXED_LEVELS: LevelConfig[] = [
  // 1 — generous intro, just reach exit
  { gridSize: 13, fogCells: 4.5, objective: 'exit',          keyCount: 0, shiftInterval: 15000, sanityDrainBase: 0.0015, unstableThreshold: 5 },
  // 2 — one key
  { gridSize: 15, fogCells: 4.2, objective: 'keys',          keyCount: 1, shiftInterval: 14000, sanityDrainBase: 0.0020, unstableThreshold: 4 },
  // 3 — exit, tighter shifts
  { gridSize: 17, fogCells: 4.0, objective: 'exit',          keyCount: 0, shiftInterval: 12000, sanityDrainBase: 0.0025, unstableThreshold: 4 },
  // 4 — two keys
  { gridSize: 19, fogCells: 3.8, objective: 'keys',          keyCount: 2, shiftInterval: 12000, sanityDrainBase: 0.0030, unstableThreshold: 3 },
  // 5 — exit teleports each shift
  { gridSize: 21, fogCells: 3.5, objective: 'unstable-exit', keyCount: 0, shiftInterval: 11000, sanityDrainBase: 0.0035, unstableThreshold: 3 },
  // 6 — two keys, smaller fog
  { gridSize: 23, fogCells: 3.2, objective: 'keys',          keyCount: 2, shiftInterval: 11000, sanityDrainBase: 0.0040, unstableThreshold: 3 },
  // 7 — unstable exit with one key
  { gridSize: 25, fogCells: 3.0, objective: 'keys',          keyCount: 1, shiftInterval: 10500, sanityDrainBase: 0.0045, unstableThreshold: 2 },
  // 8 — three keys
  { gridSize: 27, fogCells: 2.8, objective: 'keys',          keyCount: 3, shiftInterval: 10000, sanityDrainBase: 0.0050, unstableThreshold: 2 },
];

const PROC_OBJ: ObjectiveType[] = ['exit', 'keys', 'unstable-exit', 'keys'];

export function getLevelConfig(level: number): LevelConfig {
  if (level <= FIXED_LEVELS.length) return FIXED_LEVELS[level - 1];
  const ex  = level - FIXED_LEVELS.length;
  const base = FIXED_LEVELS[FIXED_LEVELS.length - 1];
  return {
    gridSize: Math.min(31, base.gridSize + Math.floor(ex / 2) * 2),
    fogCells: Math.max(2.5, base.fogCells - ex * 0.08),
    objective: PROC_OBJ[ex % PROC_OBJ.length],
    keyCount:  ex % 2 === 0 ? 2 : 3,
    shiftInterval:   Math.max(8000, base.shiftInterval - ex * 250),
    sanityDrainBase: Math.min(0.009, base.sanityDrainBase + ex * 0.0005),
    unstableThreshold: 2,
  };
}

// localStorage helpers -------------------------------------------------

const LS_BEST    = (lvl: number) => `maze_v2_best_${lvl}`;
const LS_HIGHEST = 'maze_v2_highest';

export function getBestTime(level: number): number | null {
  try { const v = localStorage.getItem(LS_BEST(level)); return v ? +v : null; }
  catch { return null; }
}
export function setBestTime(level: number, ms: number): boolean {
  try {
    const b = getBestTime(level);
    if (b === null || ms < b) { localStorage.setItem(LS_BEST(level), `${ms}`); return true; }
    return false;
  } catch { return false; }
}
export function getHighestLevel(): number {
  try { const v = localStorage.getItem(LS_HIGHEST); return v ? +v : 1; }
  catch { return 1; }
}
export function saveHighestLevel(lvl: number) {
  try {
    if (lvl > getHighestLevel()) localStorage.setItem(LS_HIGHEST, `${lvl}`);
  } catch {}
}
