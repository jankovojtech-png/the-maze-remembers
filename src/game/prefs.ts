/** Thin localStorage wrapper — all game preferences in one place. */

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string)      => { try { localStorage.setItem(k, v); }   catch {} };

// ─── Control mode ─────────────────────────────────────────────────────────────
export type ControlMode = 'swipe' | 'dpad';

export function getControlMode(): ControlMode {
  const s = get('maze_v2_control');
  if (s === 'swipe' || s === 'dpad') return s;
  return (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))
    ? 'swipe' : 'dpad';
}
export const setControlMode = (m: ControlMode) => set('maze_v2_control', m);

// ─── Haptics ──────────────────────────────────────────────────────────────────
export const getHapticsEnabled = () => get('maze_v2_haptics') !== '0';
export const setHapticsEnabled = (v: boolean) => set('maze_v2_haptics', v ? '1' : '0');

// ─── Reset all ────────────────────────────────────────────────────────────────
export function resetAllProgress() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('maze_v2')) localStorage.removeItem(key);
    }
  } catch {}
}
