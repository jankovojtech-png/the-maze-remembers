import { getHapticsEnabled } from './prefs';

/** Fire haptic feedback if supported and enabled. */
export function vibrate(pattern: number | readonly number[]): void {
  if (!getHapticsEnabled()) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern as number | number[]);
  } catch { /* not supported */ }
}

/** Named patterns for consistent haptic language across the game. */
export const HP = {
  tap:          10,           // key collect, normal action
  bump:         [8],          // invalid move
  warning:      [20, 30, 20], // shift warning starts
  shift:        [30, 15, 50], // maze shifts
  levelComplete:[20, 50, 20], // exit found
  gameOver:     [60, 30, 100],// light faded
} as const;
