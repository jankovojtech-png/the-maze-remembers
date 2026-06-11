export interface Position {
  x: number;
  y: number;
}

export type GamePhase = 'playing' | 'paused';

/** Kept for maze.ts return type — not stored in GameState. */
export interface FlashCell {
  x: number;
  y: number;
  alpha: number;
  isWall: boolean;
}

export interface GameState {
  maze: boolean[][];
  gridW: number;
  gridH: number;
  player: Position;
  playerDisplay: Position;
  exit: Position;
  escapes: number;
  fogRadius: number;        // px
  phase: GamePhase;
  lastShiftTime: number;
  shiftInterval: number;    // ms
  mutationCount: number;
  pausedAt: number;
  time: number;
}
