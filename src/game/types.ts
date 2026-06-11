export interface Position {
  x: number;
  y: number;
}

export type GamePhase = 'playing' | 'paused';

export interface FlashCell {
  x: number;
  y: number;
  alpha: number;
  isWall: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;    // px/ms
  vy: number;
  alpha: number;
  decay: number; // alpha/ms
  r: number;
  color: string;
}

export interface GameState {
  maze: boolean[][];
  gridW: number;
  gridH: number;
  player: Position;
  playerDisplay: Position;
  exit: Position;
  escapes: number;          // mazes completed this run
  fogRadius: number;
  phase: GamePhase;
  lastShiftTime: number;
  flashCells: FlashCell[];
  time: number;
  visitedCells: Set<number>;
  shakeOffset: { x: number; y: number };
  shakeDuration: number;
  shakeIntensity: number;
  particles: Particle[];
  lastExitParticle: number;
  shiftInterval: number;    // ms between maze shifts
  mutationCount: number;    // walls changed per shift
  pausedAt: number;
  totalPausedMs: number;
}
