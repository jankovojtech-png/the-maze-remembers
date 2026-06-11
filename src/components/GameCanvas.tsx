import React, { useCallback, useEffect, useRef, useState } from 'react';
import { generateMaze, mutateMaze, findDynamicExit } from '../game/maze';
import { getDifficulty, getBestEscapes, saveBestEscapes } from '../game/difficulty';
import type { GamePhase, GameState } from '../game/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const CS            = 40;   // cell size px
const HUD_H         = 40;   // HUD bar height
const LERP          = 10;   // player smoothing (cells/s)
const MOVE_DELAY    = 200;  // ms hold before continuous starts
const MOVE_INTERVAL = 130;  // ms between continuous steps

// ─── Colors ───────────────────────────────────────────────────────────────────
const WALL_C   = '#080e18';
const FLOOR_C  = '#16222e';
const PLAYER_C = '#5ab4ff';
const EXIT_C   = '#00ff88';
const BG       = '#000000';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ─── Build maze state ─────────────────────────────────────────────────────────
function buildMaze(escapes: number, now: number): GameState {
  const diff   = getDifficulty(escapes);
  const maze   = generateMaze(diff.gridSize, diff.loopChance);
  const w = diff.gridSize, h = diff.gridSize;
  const player = { x: 1, y: 1 };

  // Place exit at a BFS-far floor cell — never the same corner every run
  const exit = findDynamicExit(maze, player, w, h);
  maze[exit.y][exit.x] = false; // ensure it's passable
  return {
    maze, gridW: w, gridH: h,
    player: { ...player }, playerDisplay: { ...player },
    exit, escapes,
    fogRadius: diff.fogCells * CS,
    phase: 'playing',
    lastShiftTime: now,
    shiftInterval: diff.shiftInterval,
    mutationCount: diff.mutationCount,
    pausedAt: 0, time: now,
  };
}

// ─── UI state ─────────────────────────────────────────────────────────────────
interface UIState { phase: GamePhase; escapes: number; best: number; }

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { onBackToMenu: () => void; }

export default function GameCanvas({ onBackToMenu }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const fogRef     = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const stateRef   = useRef<GameState | null>(null);
  const rafRef     = useRef(0);
  const prevRef    = useRef(0);
  const cameraRef  = useRef({ x: 0, y: 0 });

  // Continuous movement
  const heldDirRef    = useRef<{ dx: number; dy: number } | null>(null);
  const heldKeysRef   = useRef<Set<string>>(new Set());
  const moveTimerRef  = useRef(0);
  const movePhaseRef  = useRef<'idle' | 'initial' | 'repeat'>('idle');

  // Touch
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [ui, setUi] = useState<UIState>({ phase: 'playing', escapes: 0, best: getBestEscapes() });

  // ── Resize ────────────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
    fogRef.current.width  = c.width;
    fogRef.current.height = c.height;
  }, []);

  // ── Move one step ─────────────────────────────────────────────────────────
  const tryMoveStep = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (!s || s.phase !== 'playing') return;
    const nx = s.player.x + dx, ny = s.player.y + dy;

    // Silent wall — no sound, no bump effect
    if (nx < 0 || nx >= s.gridW || ny < 0 || ny >= s.gridH || s.maze[ny][nx]) return;

    s.player = { x: nx, y: ny };

    if (nx === s.exit.x && ny === s.exit.y) {
      const next = s.escapes + 1;
      saveBestEscapes(next);
      heldDirRef.current  = null;
      movePhaseRef.current = 'idle';
      const newS = buildMaze(next, performance.now());
      stateRef.current = newS;
      setUi(u => ({ ...u, escapes: next, best: Math.max(u.best, next) }));
    }
  }, []);

  // ── Tap-to-move ──────────────────────────────────────────────────────────
  const tapToMove = useCallback((cx: number, cy: number) => {
    const s = stateRef.current; if (!s || s.phase !== 'playing') return;
    const { x: camX, y: camY } = cameraRef.current;
    const gx = Math.floor((cx - camX) / CS), gy = Math.floor((cy - camY) / CS);
    const dx = gx - s.player.x, dy = gy - s.player.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) tryMoveStep(dx, dy);
  }, [tryMoveStep]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const DIR: Record<string, [number, number]> = {
      ArrowUp:[0,-1], ArrowDown:[0,1], ArrowLeft:[-1,0], ArrowRight:[1,0],
      w:[0,-1], s:[0,1], a:[-1,0], d:[1,0],
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = stateRef.current;
        if (s?.phase === 'playing') pauseGame(); else if (s?.phase === 'paused') resumeGame();
        return;
      }
      const d = DIR[e.key]; if (!d) return;
      e.preventDefault();
      if (e.repeat) return;
      heldKeysRef.current.add(e.key);
      tryMoveStep(d[0], d[1]);
      heldDirRef.current   = { dx: d[0], dy: d[1] };
      moveTimerRef.current = 0;
      movePhaseRef.current = 'initial';
    };
    const onUp = (e: KeyboardEvent) => {
      const d = DIR[e.key]; if (!d) return;
      heldKeysRef.current.delete(e.key);
      if (heldDirRef.current?.dx === d[0] && heldDirRef.current?.dy === d[1]) {
        let next: { dx: number; dy: number } | null = null;
        for (const k of heldKeysRef.current) { const kd = DIR[k]; if (kd) { next = {dx:kd[0],dy:kd[1]}; break; } }
        heldDirRef.current = next;
        if (!next) movePhaseRef.current = 'idle';
        else       moveTimerRef.current = 0;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryMoveStep]);

  // ── Touch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) { tapToMove(t.clientX, t.clientY); }
      else if (Math.abs(dx) > Math.abs(dy)) { if (dist > 18) tryMoveStep(dx > 0 ? 1 : -1, 0); }
      else                                  { if (dist > 18) tryMoveStep(0, dy > 0 ? 1 : -1); }
      touchStartRef.current = null;
    };
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchend',   onEnd,   { passive: false });
    return () => { canvas.removeEventListener('touchstart', onStart); canvas.removeEventListener('touchend', onEnd); };
  }, [tryMoveStep, tapToMove]);

  // ── Render ────────────────────────────────────────────────────────────────
  const render = useCallback((s: GameState) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    // Player always appears centered in the non-HUD area
    const FX = W / 2;
    const FY = H / 2 + HUD_H / 2;

    // Camera: clamp to maze bounds
    const mazeW = s.gridW * CS, mazeH = s.gridH * CS;
    const camX = mazeW > W ? clamp(W - mazeW, 0, FX - (s.playerDisplay.x + .5) * CS)
                           : FX - (s.playerDisplay.x + .5) * CS;
    const camY = mazeH > H ? clamp(H - mazeH, 0, FY - (s.playerDisplay.y + .5) * CS)
                           : FY - (s.playerDisplay.y + .5) * CS;
    cameraRef.current = { x: camX, y: camY };

    // ── Black canvas ─────────────────────────────────────────────────────
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // ── World ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(camX, camY);

    // Tile viewport culling
    const vx0 = Math.max(0, Math.floor(-camX / CS));
    const vx1 = Math.min(s.gridW - 1, Math.ceil((-camX + W) / CS));
    const vy0 = Math.max(0, Math.floor(-camY / CS));
    const vy1 = Math.min(s.gridH - 1, Math.ceil((-camY + H) / CS));

    for (let row = vy0; row <= vy1; row++) {
      for (let col = vx0; col <= vx1; col++) {
        ctx.fillStyle = s.maze[row][col] ? WALL_C : FLOOR_C;
        ctx.fillRect(col * CS, row * CS, CS, CS);
      }
    }

    // Exit — dot + glow
    const ex = s.exit.x * CS + CS / 2, ey = s.exit.y * CS + CS / 2;
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, CS * 1.4);
    eg.addColorStop(0,    'rgba(0,255,136,0.42)');
    eg.addColorStop(0.45, 'rgba(0,255,136,0.12)');
    eg.addColorStop(1,    'rgba(0,255,136,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(ex, ey, CS * 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle   = EXIT_C;
    ctx.shadowColor = EXIT_C; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(ex, ey, CS * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Player — dot + warm glow
    const ppx = s.playerDisplay.x * CS + CS / 2;
    const ppy = s.playerDisplay.y * CS + CS / 2;
    const pg = ctx.createRadialGradient(ppx, ppy, 0, ppx, ppy, CS * 1.6);
    pg.addColorStop(0,   'rgba(90,180,255,0.38)');
    pg.addColorStop(0.5, 'rgba(60,140,255,0.12)');
    pg.addColorStop(1,   'rgba(20,60,180,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(ppx, ppy, CS * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle   = PLAYER_C;
    ctx.shadowColor = PLAYER_C; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(ppx, ppy, CS * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    // ── Fog — solid black with a hard circular hole ───────────────────────
    const fc = fogRef.current, fctx = fc.getContext('2d')!;
    fctx.clearRect(0, 0, W, H);
    fctx.fillStyle = '#000';
    fctx.fillRect(0, 0, W, H);

    // Punch a near-hard circle hole centered on the player
    fctx.globalCompositeOperation = 'destination-out';
    const fogR  = s.fogRadius;
    const softW = Math.max(3, fogR * 0.05); // ≤5% soft edge — hard flashlight
    const innerStop = (fogR - softW) / fogR;
    const fog = fctx.createRadialGradient(FX, FY, 0, FX, FY, fogR);
    fog.addColorStop(0,         'rgba(0,0,0,1)'); // center — fully transparent fog
    fog.addColorStop(innerStop, 'rgba(0,0,0,1)'); // up to edge — still clear
    fog.addColorStop(1,         'rgba(0,0,0,0)'); // edge — fog fully opaque
    fctx.fillStyle = fog;
    fctx.beginPath(); fctx.arc(FX, FY, fogR, 0, Math.PI * 2); fctx.fill();
    fctx.globalCompositeOperation = 'source-over';

    ctx.drawImage(fc, 0, 0);

    // ── Pause dim ─────────────────────────────────────────────────────────
    if (s.phase === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, W, H);
    }
  }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const now = performance.now();
    stateRef.current = buildMaze(0, now);
    prevRef.current  = now;
    resize();
    window.addEventListener('resize', resize);

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (document.hidden) return;

      const dt = Math.min(ts - prevRef.current, 80);
      prevRef.current = ts;

      let s = stateRef.current; if (!s) return;
      s.time = ts;

      if (s.phase === 'playing') {
        // Smooth player position
        const lf = Math.min(1, LERP * dt / 1000);
        s.playerDisplay.x += (s.player.x - s.playerDisplay.x) * lf;
        s.playerDisplay.y += (s.player.y - s.playerDisplay.y) * lf;

        // Continuous movement
        const held = heldDirRef.current;
        if (held) {
          moveTimerRef.current += dt;
          if (movePhaseRef.current === 'initial') {
            if (moveTimerRef.current >= MOVE_DELAY) {
              moveTimerRef.current = 0;
              movePhaseRef.current = 'repeat';
              tryMoveStep(held.dx, held.dy);
              s = stateRef.current!; // state may have been replaced (escape)
            }
          } else if (movePhaseRef.current === 'repeat') {
            if (moveTimerRef.current >= MOVE_INTERVAL) {
              moveTimerRef.current -= MOVE_INTERVAL;
              tryMoveStep(held.dx, held.dy);
              s = stateRef.current!;
            }
          }
        }

        // Silent maze shift
        if (ts - s.lastShiftTime >= s.shiftInterval) {
          const { newCells } = mutateMaze(
            s.maze, s.player, s.exit, s.gridW, s.gridH, s.mutationCount,
          );
          s.maze = newCells;
          s.lastShiftTime = ts;
          // No sound. No shake. No flash. Player discovers it.
        }
      }

      render(s);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const pauseGame = useCallback(() => {
    const s = stateRef.current; if (!s || s.phase !== 'playing') return;
    s.phase   = 'paused';
    s.pausedAt = performance.now();
    heldDirRef.current  = null;
    movePhaseRef.current = 'idle';
    setUi(u => ({ ...u, phase: 'paused' }));
  }, []);

  const resumeGame = useCallback(() => {
    const s = stateRef.current; if (!s || s.phase !== 'paused') return;
    s.lastShiftTime += performance.now() - s.pausedAt; // don't shift while paused
    s.pausedAt = 0;
    s.phase    = 'playing';
    setUi(u => ({ ...u, phase: 'playing' }));
  }, []);

  // ── D-pad with pointer capture ────────────────────────────────────────────
  const dpadStart = (dx: number, dy: number) => (e: React.PointerEvent) => {
    e.preventDefault();
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

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      {/* HUD */}
      <div className="safe-hud" style={S.hud}>
        <div style={S.stat}>
          <span style={S.lbl}>ESCAPES</span>
          <span style={S.val}>{ui.escapes}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ ...S.stat, alignItems: 'flex-end' }}>
          <span style={S.lbl}>BEST</span>
          <span style={S.val}>{ui.best}</span>
        </div>
        <button style={S.pauseBtn} onClick={pauseGame} aria-label="Pause">⏸</button>
      </div>

      {/* Pause overlay */}
      {ui.phase === 'paused' && (
        <div style={S.overlay}>
          <div style={S.card}>
            <div style={S.cardTitle}>PAUSED</div>
            <div style={S.cardSub}>{ui.escapes} escape{ui.escapes !== 1 ? 's' : ''} this run</div>
            <button style={S.btn} onClick={resumeGame}>Resume</button>
            <button style={{ ...S.btn, ...S.btnGhost }} onClick={onBackToMenu}>← Menu</button>
          </div>
        </div>
      )}

      {/* D-pad */}
      <div className="safe-dpad" style={S.dpad}>
        <div style={S.drow}>
          <button style={S.dbtn}
                  onPointerDown={dpadStart(0,-1)} onPointerUp={dpadEnd(0,-1)}
                  onPointerLeave={dpadEnd(0,-1)}  onPointerCancel={dpadEnd(0,-1)}>▲</button>
        </div>
        <div style={S.drow}>
          <button style={S.dbtn}
                  onPointerDown={dpadStart(-1,0)} onPointerUp={dpadEnd(-1,0)}
                  onPointerLeave={dpadEnd(-1,0)}  onPointerCancel={dpadEnd(-1,0)}>◀</button>
          <div style={{ width: 50, height: 50 }} />
          <button style={S.dbtn}
                  onPointerDown={dpadStart(1,0)} onPointerUp={dpadEnd(1,0)}
                  onPointerLeave={dpadEnd(1,0)}  onPointerCancel={dpadEnd(1,0)}>▶</button>
        </div>
        <div style={S.drow}>
          <button style={S.dbtn}
                  onPointerDown={dpadStart(0,1)} onPointerUp={dpadEnd(0,1)}
                  onPointerLeave={dpadEnd(0,1)}  onPointerCancel={dpadEnd(0,1)}>▼</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  hud: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 14px',
    minHeight: HUD_H,
    background: 'rgba(0,0,0,0.75)',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    zIndex: 10, userSelect: 'none', fontFamily: 'monospace',
  },
  stat: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  },
  lbl: {
    fontSize: 8, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.22)',
  },
  val: {
    fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.82)', lineHeight: 1.1,
  },
  pauseBtn: {
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.22)', fontSize: 14,
    cursor: 'pointer', padding: '4px 8px',
  },
  overlay: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 20, background: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(8px)',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    padding: '28px 36px',
    background: 'rgba(6,10,18,0.98)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    fontFamily: 'monospace',
  },
  cardTitle: {
    fontSize: 18, fontWeight: 900, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.7)',
  },
  cardSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: -4,
  },
  btn: {
    width: '100%', padding: '12px 0',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 9, color: 'rgba(255,255,255,0.75)',
    fontSize: 13, fontWeight: 600, letterSpacing: '0.1em',
    fontFamily: 'monospace', cursor: 'pointer',
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.3)',
  },
  dpad: {
    position: 'absolute', bottom: 28, left: 18,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    zIndex: 10, opacity: 0.6,
  },
  drow: { display: 'flex', gap: 4 },
  dbtn: {
    width: 50, height: 50,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: 'rgba(255,255,255,0.4)',
    fontSize: 16, cursor: 'pointer',
    touchAction: 'none', userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
