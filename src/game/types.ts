export interface Position {
  x: number;
  y: number;
}

export type GamePhase = 'playing' | 'paused' | 'levelComplete' | 'gameOver';
export type ObjectiveType = 'exit' | 'keys' | 'unstable-exit';

export interface FlashCell {
  x: number;
  y: number;
  alpha: number;
  isWall: boolean;
}

export interface ShiftPulse {
  radius: number;
  alpha: number;
}

export interface Particle {
  x: number;   // world pixel x
  y: number;   // world pixel y
  vx: number;  // px/ms
  vy: number;
  alpha: number;
  decay: number; // alpha/ms
  r: number;
  color: string;
}

export interface LevelConfig {
  gridSize: number;
  fogCells: number;
  objective: ObjectiveType;
  keyCount: number;
  shiftInterval: number;      // ms between shifts
  sanityDrainBase: number;    // sanity fraction lost per second (normal)
  unstableThreshold: number;  // visits before cell becomes unstable
}

export interface GameState {
  maze: boolean[][];
  gridW: number;
  gridH: number;
  player: Position;
  playerDisplay: Position;
  exit: Position;
  level: number;
  fogRadius: number;
  phase: GamePhase;
  lastShiftTime: number;
  shiftWarning: boolean;
  flashCells: FlashCell[];
  time: number;
  // Fog + memory
  visitedCells: Set<number>;
  cellVisitCount: Map<number, number>;
  unstableCells: Set<number>;
  unstableThreshold: number;
  // Objective
  objective: ObjectiveType;
  keys: Position[];
  keysCollected: number;
  keysTotal: number;
  exitOpen: boolean;
  // Sanity
  sanity: number;
  sanityDrainBase: number;
  // Score
  shiftCount: number;
  levelStartTime: number;
  pausedAt: number;
  totalPausedMs: number;
  // Screen shake
  shakeOffset: { x: number; y: number };
  shakeDuration: number;
  shakeIntensity: number;
  // Animations
  shiftPulse: ShiftPulse | null;
  lastWarningPulse: number;
  particles: Particle[];
  lastExitParticle: number;
  // Config
  shiftInterval: number;
}
