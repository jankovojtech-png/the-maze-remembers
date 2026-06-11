import React, { useCallback, useEffect, useRef, useState } from 'react';
import { generateMaze, mutateMaze } from '../game/maze';
import { getDifficulty, getBestEscapes, saveBestEscapes } from '../game/difficulty';
import { audio } from '../game/audio';
import { vibrate, HP } from '../game/haptics';
import {
  getControlMode, setControlMode,
  getHapticsEnabled, setHapticsEnabled,
  type ControlMode,
} from '../game/prefs';
import { APP_VERSION } from './MainMenu';
import type { GamePhase, GameState } from '../game/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const CS           = 40;   // cell size px
const LERP         = 12;   // player smoothing speed (cells/s)
const SHAKE_MS     = 320;
const HUD_H        = 44;   // HUD bar height px
const MOVE_DELAY   = 195;  // ms before continuous movement starts
const MOVE_INTERVAL = 130; // ms between continuous steps (~7.7/s)

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:        '#070b0f',
  wall:      '#162236',
  wallEdge:  '#1e3252',
  floor:     '#0c1520',
  floorGrid: 'rgba(255,255,255,0.014)',
  player:    '#5ab4ff',
  exit:      '#00ff88',
  fog:       '#000000',
  memFloor:  'rgba(28,68,115,0.40)',
  memWall:   'rgba(16,38,72,0.35)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ─── Fog memory ───────────────────────────────────────────────────────────────
function markVisible(s: GameState) {
  const r = Math.ceil(s.fogRadius / CS) + 1;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const cx = s.player.x + dx, cy = s.player.y + dy;
      if (cx >= 0 && cx < s.gridW && cy >= 0 && cy < s.gridH &&
          Math.hypot(dx * CS, dy * CS) <= s.fogRadius * 0.85)
        s.visitedCells.add(cy * s.gridW + cx);
    }
}

// ─── Exit particles ───────────────────────────────────────────────────────────
function spawnExitParticle(s: GameState) {
  const ex = s.exit.x * CS + CS / 2, ey = s.exit.y * CS + CS / 2;
  s.particles.push({
    x: ex + (Math.random() - .5) * CS * .5,
    y: ey + (Math.random() - .5) * CS * .5,
    vx: (Math.random() - .5) * 0.018,
    vy: -0.018 - Math.random() * 0.022,
    alpha: 0.65, decay: 0.65 / 1800,
    r: 1.3 + Math.random(),
    color: C.exit,
  });
}

// ─── Maze builder ─────────────────────────────────────────────────────────────
function buildMaze(escapes: number, now: number): GameState {
  const diff = getDifficulty(escapes);
  const maze = generateMaze(diff.gridSize);
  const w = diff.gridSize, h = diff.gridSize;
  const player = { x: 1, y: 1 };
  const exit   = { x: w - 2, y: h - 2 };
  maze[exit.y][exit.x] = false;

  const s: GameState = {
    maze, gridW: w, gridH: h,
    player: { ...player }, playerDisplay: { ...player },
    exit, escapes,
    fogRadius: diff.fogCells * CS,
    phase: 'playing',
    lastShiftTime: now,
    flashCells: [], time: now,
    visitedCells: new Set<number>(),
    shakeOffset: { x: 0, y: 0 }, shakeDuration: 0, shakeIntensity: 0,
    particles: [], lastExitParticle: now,
    shiftInterval: diff.shiftInterval,
    mutationCount: diff.mutationCount,
    pausedAt: 0, totalPausedMs: 0,
  };
  markVisible(s);
  s.visitedCells.add(w + 1); // (1,1)
  return s;
}

// ─── UI state ─────────────────────────────────────────────────────────────────
interface UIState {
  phase:   GamePhase;
  escapes: number;
  best:    number;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  onBackToMenu: () => void;
}

export default function GameCanvas({ onBackToMenu }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fogRef       = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const stateRef     = useRef<GameState | null>(null);
  const rafRef       = useRef<number>(0);
  const prevRef      = useRef<number>(0);
  const cameraRef    = useRef({ x: 0, y: 0 });
  const wallBumpRef  = useRef<{ nx: number; ny: number; t: number } | null>(null);
  const exitFlashRef = useRef(0); // 0→1 alpha, decays to 0 after escape

  // Continuous movement state
  const heldDirRef    = useRef<{ dx: number; dy: number } | null>(null);
  const heldKeysRef   = useRef<Set<string>>(new Set());
  const moveTimerRef  = useRef(0);
  const movePhaseRef  = useRef<'idle' | 'initial' | 'repeat'>('idle');
  const ctrlModeRef   = useRef<ControlMode>(getControlMode());
  const touchStart    = useRef<{ x: number; y: number } | null>(null);

  const [muted,      setMuted]     = useState(audio.muted);
  const [controlMode,setCtrlMode]  = useState<ControlMode>(getControlMode);
  const [hapticsOn,  setHapticsOn] = useState(getHapticsEnabled);
  const [ui, setUi]  = useState<UIState>({
    phase: 'playing', escapes: 0, best: getBestEscapes(),
  });

  useEffect(() => { ctrlModeRef.current = controlMode; }, [controlMode]);

  // ── Resize ──────────────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
    fogRef.current.width  = c.width;
    fogRef.current.height = c.height;
  }, []);

  // ── tryMoveStep ─────────────────────────────────────────────────────────────
  const tryMoveStep = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (!s || s.phase !== 'playing') return;
    const nx = s.player.x + dx, ny = s.player.y + dy;

    // Wall / out-of-bounds
    if (nx < 0 || nx >= s.gridW || ny < 0 || ny >= s.gridH || s.maze[ny][nx]) {
      wallBumpRef.current = { nx: s.player.x + dx, ny: s.player.y + dy, t: performance.now() };
      vibrate(HP.bump);
      audio.playBump();
      return;
    }

    s.player = { x: nx, y: ny };
    s.visitedCells.add(ny * s.gridW + nx);
    markVisible(s);
    audio.playMove();

    // Exit reached → build next maze immediately
    if (nx === s.exit.x && ny === s.exit.y) {
      const nextEscapes = s.escapes + 1;
      saveBestEscapes(nextEscapes);
      audio.playEscape();
      vibrate(HP.levelComplete);
      exitFlashRef.current = 1.0;
      // Snap display to exit so the transition looks clean
      s.playerDisplay.x = nx;
      s.playerDisplay.y = ny;
      // Build the next maze with updated difficulty
      const newS = buildMaze(nextEscapes, performance.now());
      stateRef.current = newS;
      // Reset movement — player starts fresh in new maze
      heldDirRef.current  = null;
      movePhaseRef.current = 'idle';
      setUi(u => ({ ...u, escapes: nextEscapes, best: Math.max(u.best, nextEscapes) }));
    }
  }, []);

  // ── tapToMove ───────────────────────────────────────────────────────────────
  const tapToMove = useCallback((cx: number, cy: number) => {
    const s = stateRef.current;
    if (!s || s.phase !== 'playing') return;
    const { x: camX, y: camY } = cameraRef.current;
    const gx = Math.floor((cx - camX) / CS);
    const gy = Math.floor((cy - camY) / CS);
    const adx = gx - s.player.x, ady = gy - s.player.y;
    if (Math.abs(adx) + Math.abs(ady) === 1) tryMoveStep(adx, ady);
  }, [tryMoveStep]);

  // ── Keyboard (with continuous movement) ────────────────────────────────────
  useEffect(() => {
    const DIR: Record<string, [number, number]> = {
      ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
      w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
    };

    const onDown = (e: KeyboardEvent) => {
      audio.init();
      if (e.key === 'Escape') {
        const s = stateRef.current;
        if (s?.phase === 'playing') pauseGame();
        else if (s?.phase === 'paused') resumeGame();
        return;
      }
      const d = DIR[e.key]; if (!d) return;
      e.preventDefault();
      if (e.repeat) return; // browser repeat — we handle it ourselves
      heldKeysRef.current.add(e.key);
      // Immediate first step
      tryMoveStep(d[0], d[1]);
      // Start continuous movement
      heldDirRef.current   = { dx: d[0], dy: d[1] };
      moveTimerRef.current = 0;
      movePhaseRef.current = 'initial';
    };

    const onUp = (e: KeyboardEvent) => {
      const d = DIR[e.key]; if (!d) return;
      heldKeysRef.current.delete(e.key);
      if (heldDirRef.current?.dx === d[0] && heldDirRef.current?.dy === d[1]) {
        // Try to hand off to another held key, if any
        let next: { dx: number; dy: number } | null = null;
        for (const k of heldKeysRef.current) {
          const kd = DIR[k]; if (kd) { next = { dx: kd[0], dy: kd[1] }; break; }
        }
        heldDirRef.current = next;
        if (!next) movePhaseRef.current = 'idle';
        else       moveTimerRef.current = 0; // start initial delay for new direction
      }
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryMoveStep]);

  // ── Touch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      audio.init();
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStart.current) return;
      const t   = e.changedTouches[0];
      const dx  = t.clientX - touchStart.current.x;
      const dy  = t.clientY - touchStart.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        tapToMove(t.clientX, t.clientY);
      } else if (ctrlModeRef.current === 'swipe') {
        if (Math.abs(dx) > Math.abs(dy)) { if (dist > 18) tryMoveStep(dx > 0 ? 1 : -1, 0); }
        else                             { if (dist > 18) tryMoveStep(0, dy > 0 ? 1 : -1); }
      }
      touchStart.current = null;
    };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchend',   onEnd,   { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchend',   onEnd);
    };
  }, [tryMoveStep, tapToMove]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const render = useCallback((s: GameState) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    // Player screen center (offset down to account for HUD)
    const FX = W / 2;
    const FY = H / 2 + HUD_H / 2;

    // Wall bump
    const bump    = wallBumpRef.current;
    const bumpAge = bump ? (performance.now() - bump.t) : Infinity;
    let bumpX = 0, bumpY = 0;
    if (bumpAge < 220) {
      const mag = Math.sin((bumpAge / 220) * Math.PI) * CS * 0.2;
      bumpX = (bump!.nx - s.player.x) * mag;
      bumpY = (bump!.ny - s.player.y) * mag;
    } else if (bump) {
      wallBumpRef.current = null;
    }

    // Camera — follow player, clamped to maze bounds
    const mazeW = s.gridW * CS, mazeH = s.gridH * CS;
    const baseCamX = mazeW > W
      ? clamp(W - mazeW, 0, FX - (s.playerDisplay.x + .5) * CS)
      : FX - (s.playerDisplay.x + .5) * CS;
    const baseCamY = mazeH > H
      ? clamp(H - mazeH, 0, FY - (s.playerDisplay.y + .5) * CS)
      : FY - (s.playerDisplay.y + .5) * CS;
    cameraRef.current = { x: baseCamX, y: baseCamY };

    const camX = baseCamX + bumpX + s.shakeOffset.x;
    const camY = baseCamY + bumpY + s.shakeOffset.y;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ─── World ───────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(camX, camY);

    // Floor + walls
    for (let row = 0; row < s.gridH; row++) {
      for (let col = 0; col < s.gridW; col++) {
        if (!s.maze[row][col]) {
          ctx.fillStyle = C.floor;
          ctx.fillRect(col * CS, row * CS, CS, CS);
          ctx.strokeStyle = C.floorGrid; ctx.lineWidth = 0.5;
          ctx.strokeRect(col * CS + 1, row * CS + 1, CS - 2, CS - 2);
        } else {
          ctx.fillStyle = C.wall;
          ctx.fillRect(col * CS, row * CS, CS, CS);
          ctx.fillStyle = C.wallEdge;
          ctx.fillRect(col * CS, row * CS, CS, 1);
          ctx.fillRect(col * CS, row * CS, 1, CS);
        }
      }
    }

    // Changed cells — render ghost of previous state dissolving into new state.
    // isWall = new state:  ghost shows what it WAS before (old state fading out).
    // New wall  (isWall=true):  was floor → ghost floor fades out → wall solidifies.
    // Removed wall (isWall=false): was wall → ghost wall fades out → floor appears.
    for (const fc of s.flashCells) {
      if (fc.alpha <= 0) continue;
      // Ease out: fade quickly at first, linger toward the end
      const a = fc.alpha * fc.alpha;
      ctx.globalAlpha = a;
      if (fc.isWall) {
        // Previous state was floor
        ctx.fillStyle = C.floor;
        ctx.fillRect(fc.x * CS, fc.y * CS, CS, CS);
        ctx.strokeStyle = C.floorGrid; ctx.lineWidth = 0.5;
        ctx.strokeRect(fc.x * CS + 1, fc.y * CS + 1, CS - 2, CS - 2);
      } else {
        // Previous state was wall
        ctx.fillStyle = C.wall;
        ctx.fillRect(fc.x * CS, fc.y * CS, CS, CS);
        ctx.fillStyle = C.wallEdge;
        ctx.fillRect(fc.x * CS, fc.y * CS, CS, 1);
        ctx.fillRect(fc.x * CS, fc.y * CS, 1, CS);
      }
    }
    ctx.globalAlpha = 1;

    // Exit glow
    const tp = 0.72 + 0.28 * Math.sin(s.time * 0.003);
    const ex = s.exit.x * CS + CS / 2, ey = s.exit.y * CS + CS / 2;
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, CS * 2 * tp);
    eg.addColorStop(0, 'rgba(0,255,100,0.52)');
    eg.addColorStop(0.4, 'rgba(0,255,100,0.16)');
    eg.addColorStop(1, 'rgba(0,255,100,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, CS * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.exit;
    ctx.shadowColor = C.exit; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ex, ey, CS * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Arrow indicator
    ctx.strokeStyle = C.exit; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const aw = CS * 0.18;
    ctx.beginPath();
    ctx.moveTo(ex, ey - CS * 0.12); ctx.lineTo(ex, ey + CS * 0.16);
    ctx.moveTo(ex - aw, ey - CS * 0.0); ctx.lineTo(ex, ey - CS * 0.2); ctx.lineTo(ex + aw, ey - CS * 0.0);
    ctx.stroke();

    // Player (with bump offset applied to display)
    const ppx = s.playerDisplay.x * CS + CS / 2 + bumpX;
    const ppy = s.playerDisplay.y * CS + CS / 2 + bumpY;
    const pg = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, CS * 1.5);
    pg.addColorStop(0, 'rgba(90,180,255,0.48)');
    pg.addColorStop(0.4, 'rgba(60,140,255,0.22)');
    pg.addColorStop(1, 'rgba(20,60,180,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(ppx, ppy, CS * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.player; ctx.shadowColor = '#60b8ff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(ppx, ppy, CS * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.arc(ppx - CS * 0.09, ppy - CS * 0.1, CS * 0.09, 0, Math.PI * 2); ctx.fill();

    // Wall bump red flash
    if (bumpAge < 200 && bump) {
      const bx = clamp(0, s.gridW - 1, bump.nx);
      const by = clamp(0, s.gridH - 1, bump.ny);
      ctx.globalAlpha = (1 - bumpAge / 200) * 0.5;
      ctx.fillStyle = 'rgba(255,50,20,1)';
      ctx.beginPath(); ctx.arc(bx * CS + CS / 2, by * CS + CS / 2, CS * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Particles
    for (const p of s.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ─── Fog of war ──────────────────────────────────────────────────────────
    const fogCanvas = fogRef.current, fogCtx = fogCanvas.getContext('2d')!;
    fogCtx.clearRect(0, 0, W, H);
    fogCtx.fillStyle = C.fog; fogCtx.fillRect(0, 0, W, H);
    fogCtx.globalCompositeOperation = 'destination-out';
    const fogR = s.fogRadius;
    const fg = fogCtx.createRadialGradient(FX, FY, 0, FX, FY, fogR);
    fg.addColorStop(0,    'rgba(0,0,0,1)');
    fg.addColorStop(0.5,  'rgba(0,0,0,1)');
    fg.addColorStop(0.72, 'rgba(0,0,0,0.65)');
    fg.addColorStop(0.88, 'rgba(0,0,0,0.22)');
    fg.addColorStop(1,    'rgba(0,0,0,0)');
    fogCtx.fillStyle = fg;
    fogCtx.beginPath(); fogCtx.arc(FX, FY, fogR, 0, Math.PI * 2); fogCtx.fill();
    fogCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCanvas, 0, 0);

    // ─── Memory cells (explored but out-of-fog) ──────────────────────────────
    ctx.save();
    ctx.translate(camX, camY);
    const fStart = fogR * 0.45, fRange = fogR * 0.45;
    for (const k of s.visitedCells) {
      const col = k % s.gridW, row = Math.floor(k / s.gridW);
      const dist = Math.hypot((col - s.playerDisplay.x) * CS, (row - s.playerDisplay.y) * CS);
      if (dist < fStart) continue;
      ctx.globalAlpha = Math.min(1, (dist - fStart) / fRange);
      ctx.fillStyle = s.maze[row][col] ? C.memWall : C.memFloor;
      ctx.fillRect(col * CS, row * CS, CS, CS);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ─── Exit flash (escape transition) ──────────────────────────────────────
    if (exitFlashRef.current > 0) {
      ctx.fillStyle = `rgba(0,255,100,${(exitFlashRef.current * 0.22).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ─── Pause dim ───────────────────────────────────────────────────────────
    if (s.phase === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.fillRect(0, 0, W, H);
    }
  }, []);

  // ── Game loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const now = performance.now();
    stateRef.current = buildMaze(0, now);
    prevRef.current  = now;
    resize();
    window.addEventListener('resize', resize);
    let uiAcc = 0;

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (document.hidden) return; // skip frames when tab is not visible

      const dt = Math.min(ts - prevRef.current, 80);
      prevRef.current = ts;
      uiAcc += dt;

      // Exit flash decay (independent of game state)
      if (exitFlashRef.current > 0) {
        exitFlashRef.current = Math.max(0, exitFlashRef.current - dt / 400);
      }

      let s = stateRef.current;
      if (!s) return;
      s.time = ts;

      if (s.phase === 'playing') {
        // Smooth player
        const lf = Math.min(1, LERP * dt / 1000);
        s.playerDisplay.x += (s.player.x - s.playerDisplay.x) * lf;
        s.playerDisplay.y += (s.player.y - s.playerDisplay.y) * lf;

        // Flash cell decay — 270ms total for a quiet dissolve
        s.flashCells = s.flashCells
          .map(fc => ({ ...fc, alpha: fc.alpha - dt / 270 }))
          .filter(fc => fc.alpha > 0);

        // Screen shake
        if (s.shakeDuration > 0) {
          s.shakeDuration -= dt;
          const str = s.shakeIntensity * Math.max(0, s.shakeDuration / SHAKE_MS);
          s.shakeOffset = { x: (Math.random() - .5) * str * 2, y: (Math.random() - .5) * str * 2 };
          if (s.shakeDuration <= 0) s.shakeOffset = { x: 0, y: 0 };
        }

        // Particles
        s.particles = s.particles
          .map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, alpha: p.alpha - p.decay * dt }))
          .filter(p => p.alpha > 0);
        if (s.particles.length < 10 && ts - s.lastExitParticle > 500) {
          spawnExitParticle(s); s.lastExitParticle = ts;
        }

        // ── Continuous movement ──────────────────────────────────────────────
        const held = heldDirRef.current;
        if (held) {
          moveTimerRef.current += dt;
          if (movePhaseRef.current === 'initial') {
            if (moveTimerRef.current >= MOVE_DELAY) {
              moveTimerRef.current = 0;
              movePhaseRef.current = 'repeat';
              tryMoveStep(held.dx, held.dy);
              // State may have been replaced (escape) — get fresh ref
              s = stateRef.current!;
            }
          } else if (movePhaseRef.current === 'repeat') {
            if (moveTimerRef.current >= MOVE_INTERVAL) {
              moveTimerRef.current -= MOVE_INTERVAL;
              tryMoveStep(held.dx, held.dy);
              s = stateRef.current!;
            }
          }
        }

        // ── Maze shift ──────────────────────────────────────────────────────
        const sinceShift = ts - s.lastShiftTime - s.totalPausedMs;
        if (sinceShift >= s.shiftInterval) {
          const { newCells, changed } = mutateMaze(
            s.maze, s.player, s.exit, s.gridW, s.gridH, s.mutationCount,
          );
          s.maze       = newCells;
          s.flashCells = changed;
          s.lastShiftTime   = ts;
          s.totalPausedMs   = 0;
          s.shakeDuration   = SHAKE_MS * 0.5;   // short — just a hint
          s.shakeIntensity  = 1.2;              // barely perceptible
          audio.playShift();
          vibrate(HP.shift);
        }

        // Throttled UI sync
        if (uiAcc > 300) {
          uiAcc = 0;
          const phase = stateRef.current?.phase ?? 'playing';
          setUi(u => u.phase === phase ? u : { ...u, phase });
        }
      }

      render(s);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const pauseGame = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.phase !== 'playing') return;
    s.phase   = 'paused';
    s.pausedAt = performance.now();
    heldDirRef.current = null;
    movePhaseRef.current = 'idle';
    setUi(u => ({ ...u, phase: 'paused' }));
  }, []);

  const resumeGame = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.phase !== 'paused') return;
    const pausedMs = performance.now() - s.pausedAt;
    s.lastShiftTime += pausedMs;
    s.totalPausedMs += pausedMs;
    s.pausedAt = 0;
    s.phase    = 'playing';
    setUi(u => ({ ...u, phase: 'playing' }));
  }, []);

  const toggleMute = useCallback(() => {
    const m = audio.toggleMute(); setMuted(m);
  }, []);

  const switchControl = useCallback((m: ControlMode) => {
    setCtrlMode(m); setControlMode(m); ctrlModeRef.current = m;
  }, []);

  const toggleHaptics = useCallback(() => {
    const next = !getHapticsEnabled();
    setHapticsEnabled(next); setHapticsOn(next);
  }, []);

  // ── D-pad with pointer capture for continuous movement ───────────────────
  const dpadStart = (dx: number, dy: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    audio.init();
    (e.target as Element).setPointerCapture(e.pointerId);
    tryMoveStep(dx, dy);
    heldDirRef.current   = { dx, dy };
    moveTimerRef.current = 0;
    movePhaseRef.current = 'initial';
  };
  const dpadEnd = (dx: number, dy: number) => (_e: React.PointerEvent) => {
    if (heldDirRef.current?.dx === dx && heldDirRef.current?.dy === dy) {
      heldDirRef.current   = null;
      movePhaseRef.current = 'idle';
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const isPlaying = ui.phase === 'playing';

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      {/* ── HUD ── */}
      <div className="safe-hud" style={S.hud}>
        <div style={S.hudStat}>
          <span style={S.lbl}>ESCAPES</span>
          <span style={S.val}>{ui.escapes}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...S.hudStat, alignItems: 'flex-end' }}>
          <span style={S.lbl}>BEST</span>
          <span style={S.val}>{ui.best}</span>
        </div>
        <button style={S.ico} onClick={pauseGame}>⏸</button>
      </div>

      {/* ── Pause overlay ── */}
      {ui.phase === 'paused' && (
        <div style={S.overlay}>
          <div style={S.card}>
            <div style={S.cardTitle}>PAUSED</div>
            <div style={S.cardSub}>
              {ui.escapes} escape{ui.escapes !== 1 ? 's' : ''} this run
            </div>

            <button style={S.btnPrimary} onClick={resumeGame}>▶ Resume</button>

            {/* Inline settings */}
            <div style={S.settingsSection}>
              <div style={S.settingRow}>
                <span style={S.stLbl}>Controls</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button style={{ ...S.toggleBtn, ...(controlMode === 'swipe' ? S.toggleActive : {}) }}
                          onClick={() => switchControl('swipe')}>Swipe</button>
                  <button style={{ ...S.toggleBtn, ...(controlMode === 'dpad' ? S.toggleActive : {}) }}
                          onClick={() => switchControl('dpad')}>D-pad</button>
                </div>
              </div>
              <div style={S.settingRow}>
                <span style={S.stLbl}>Sound</span>
                <button style={{ ...S.toggleBtn, ...(!muted ? S.toggleActive : {}) }}
                        onClick={toggleMute}>{muted ? 'Off' : 'On'}</button>
              </div>
              <div style={S.settingRow}>
                <span style={S.stLbl}>Haptics</span>
                <button style={{ ...S.toggleBtn, ...(hapticsOn ? S.toggleActive : {}) }}
                        onClick={toggleHaptics}>{hapticsOn ? 'On' : 'Off'}</button>
              </div>
            </div>

            <button style={S.btnGhost} onClick={onBackToMenu}>← Menu</button>
            <div style={S.version}>{APP_VERSION}</div>
          </div>
        </div>
      )}

      {/* ── D-pad (dpad mode only, while playing) ── */}
      {isPlaying && controlMode === 'dpad' && (
        <div className="safe-dpad" style={S.dpad}>
          <div style={S.drow}>
            <button style={S.dbtn}
                    onPointerDown={dpadStart(0, -1)} onPointerUp={dpadEnd(0, -1)}
                    onPointerLeave={dpadEnd(0, -1)}  onPointerCancel={dpadEnd(0, -1)}>▲</button>
          </div>
          <div style={S.drow}>
            <button style={S.dbtn}
                    onPointerDown={dpadStart(-1, 0)} onPointerUp={dpadEnd(-1, 0)}
                    onPointerLeave={dpadEnd(-1, 0)}  onPointerCancel={dpadEnd(-1, 0)}>◀</button>
            <div style={{ width: 50, height: 50 }} />
            <button style={S.dbtn}
                    onPointerDown={dpadStart(1, 0)} onPointerUp={dpadEnd(1, 0)}
                    onPointerLeave={dpadEnd(1, 0)}  onPointerCancel={dpadEnd(1, 0)}>▶</button>
          </div>
          <div style={S.drow}>
            <button style={S.dbtn}
                    onPointerDown={dpadStart(0, 1)} onPointerUp={dpadEnd(0, 1)}
                    onPointerLeave={dpadEnd(0, 1)}  onPointerCancel={dpadEnd(0, 1)}>▼</button>
          </div>
        </div>
      )}

      {/* Swipe mode hint */}
      {isPlaying && controlMode === 'swipe' && (
        <div className="safe-hint" style={S.hint}>
          swipe or tap to move
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  hud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 16px',
    minHeight: HUD_H,
    background: 'rgba(7,11,15,0.82)',
    backdropFilter: 'blur(4px)',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    zIndex: 10, userSelect: 'none',
  },
  hudStat: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  },
  lbl: {
    fontSize: 8, letterSpacing: '0.22em',
    color: 'rgba(255,255,255,0.28)',
    fontFamily: 'monospace', textTransform: 'uppercase',
  },
  val: {
    fontSize: 22, fontWeight: 700, fontFamily: 'monospace',
    color: 'rgba(255,255,255,0.88)', lineHeight: 1.05,
  },
  ico: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7, color: 'rgba(255,255,255,0.4)',
    fontSize: 14, cursor: 'pointer', padding: '4px 9px', lineHeight: 1,
  },
  overlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(7,11,15,0.88)', backdropFilter: 'blur(12px)', zIndex: 20,
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '28px 32px',
    background: 'rgba(10,18,32,0.97)',
    border: '1px solid rgba(90,180,255,0.1)',
    borderRadius: 18,
    boxShadow: '0 0 60px rgba(0,0,0,0.9)',
    maxWidth: 300, width: '88%',
  },
  cardTitle: {
    fontSize: 20, fontWeight: 900, letterSpacing: '0.26em',
    color: '#5ab4ff', fontFamily: 'monospace',
  },
  cardSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    fontFamily: 'monospace', marginTop: -4,
  },
  btnPrimary: {
    padding: '12px 0',
    background: 'rgba(90,180,255,0.1)',
    border: '1px solid rgba(90,180,255,0.38)',
    borderRadius: 10, color: '#5ab4ff',
    fontSize: 14, fontWeight: 700, letterSpacing: '0.14em',
    fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  btnGhost: {
    padding: '9px 0', background: 'transparent',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10, color: 'rgba(255,255,255,0.3)',
    fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', width: '100%',
  },
  settingsSection: {
    width: '100%',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '8px 0',
    display: 'flex', flexDirection: 'column', gap: 7,
    margin: '2px 0',
  },
  settingRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  stLbl: {
    fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'monospace',
  },
  toggleBtn: {
    padding: '4px 10px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5, color: 'rgba(255,255,255,0.28)',
    fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
  },
  toggleActive: {
    background: 'rgba(90,180,255,0.14)',
    border: '1px solid rgba(90,180,255,0.42)',
    color: '#5ab4ff',
  },
  version: {
    fontSize: 9, color: 'rgba(255,255,255,0.12)',
    fontFamily: 'monospace', letterSpacing: '0.1em', marginTop: 2,
  },
  dpad: {
    position: 'absolute', bottom: 28, left: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    zIndex: 10, opacity: 0.85,
  },
  drow: { display: 'flex', gap: 4 },
  dbtn: {
    width: 52, height: 52,
    background: 'rgba(14,26,44,0.78)',
    border: '1px solid rgba(90,180,255,0.14)',
    borderRadius: 12, color: 'rgba(90,180,255,0.7)',
    fontSize: 17, cursor: 'pointer', touchAction: 'none', userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  hint: {
    position: 'absolute', bottom: 34, right: 18,
    fontSize: 10, color: 'rgba(255,255,255,0.18)',
    fontFamily: 'monospace', letterSpacing: '0.07em',
    pointerEvents: 'none', zIndex: 10,
  },
};
