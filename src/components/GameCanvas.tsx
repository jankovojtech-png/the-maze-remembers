import React, { useCallback, useEffect, useRef, useState } from 'react';
import { generateMaze, getMutationCount, mutateMaze, findNewExit } from '../game/maze';
import { getLevelConfig, getBestTime, setBestTime, saveHighestLevel } from '../game/levels';
import { audio } from '../game/audio';
import { vibrate, HP } from '../game/haptics';
import {
  isTutorialDone, markTutorialDone,
  getControlMode, setControlMode,
  getHapticsEnabled, setHapticsEnabled,
  type ControlMode,
} from '../game/prefs';
import Tutorial from './Tutorial';
import LevelIntro from './LevelIntro';
import { APP_VERSION } from './MainMenu';
import type { GamePhase, GameState, ObjectiveType, ShiftPulse } from '../game/types';

// ─── Constants ────────────────────────────────────────────────────────────────
const CS          = 40;
const LERP        = 14;
const FLASH_MS    = 700;
const SHAKE_MS    = 380;
const WARN_MULT   = 3;
const HUD_H       = 52;
const SAN_BAR_H   = 4;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  bg:         '#070b0f',
  wall:       '#162236',
  wallEdge:   '#1e3252',
  floor:      '#0c1520',
  floorGrid:  'rgba(255,255,255,0.016)',
  unstFloor:  '#110e25',
  unstWall:   '#1a1035',
  player:     '#5ab4ff',
  exit:       '#00ff88',
  exitLocked: '#224433',
  key:        '#ffd060',
  fog:        '#000000',
  memFloor:   'rgba(28,68,115,0.42)',
  memWall:    'rgba(16,38,72,0.38)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const perfText = (ms: number) => {
  if (ms < 40_000)  return '"You outran the maze."';
  if (ms < 120_000) return '"The maze almost had you."';
  return '"The maze learned your path."';
};
const h01 = (k: number, s: number) =>
  (((k * 1664525 + s * 22695477 + 1013904223) >>> 0) / 4294967295);
const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// ─── Key placement ────────────────────────────────────────────────────────────
function placeKeys(
  maze: boolean[][], player: {x:number;y:number},
  exit: {x:number;y:number}, w: number, h: number, count: number,
) {
  const pool: {x:number;y:number}[] = [];
  for (let y = 1; y < h-1; y++)
    for (let x = 1; x < w-1; x++)
      if (!maze[y][x] && !(x===player.x&&y===player.y) && !(x===exit.x&&y===exit.y))
        pool.push({x,y});
  for (let i = pool.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const keys: {x:number;y:number}[] = [];
  for (const c of pool) {
    if (keys.length >= count) break;
    if (keys.every(k => Math.hypot(k.x-c.x, k.y-c.y) >= 4)) keys.push(c);
  }
  if (keys.length < count) {
    for (const c of pool) {
      if (keys.length >= count) break;
      if (!keys.find(k => k.x===c.x&&k.y===c.y)) keys.push(c);
    }
  }
  return keys;
}

// ─── Fog memory ───────────────────────────────────────────────────────────────
function markVisible(s: GameState) {
  const r = Math.ceil(s.fogRadius / CS) + 1;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const cx = s.player.x+dx, cy = s.player.y+dy;
      if (cx>=0&&cx<s.gridW&&cy>=0&&cy<s.gridH &&
          Math.hypot(dx*CS,dy*CS) <= s.fogRadius*0.85)
        s.visitedCells.add(cy*s.gridW+cx);
    }
}

// ─── Particles ────────────────────────────────────────────────────────────────
function spawnExitParticle(s: GameState) {
  const ex = s.exit.x*CS+CS/2, ey = s.exit.y*CS+CS/2;
  s.particles.push({
    x: ex+(Math.random()-.5)*CS*.6, y: ey+(Math.random()-.5)*CS*.6,
    vx:(Math.random()-.5)*0.02, vy:-0.02-Math.random()*0.025,
    alpha:0.7, decay:0.7/1600, r:1.5+Math.random(), color:C.exit,
  });
}
function spawnKeyBurst(s: GameState, kx: number, ky: number) {
  const wx = kx*CS+CS/2, wy = ky*CS+CS/2;
  for (let i = 0; i < 10; i++) {
    const a = (i/10)*Math.PI*2;
    const sp = 0.04+Math.random()*0.05;
    s.particles.push({
      x:wx, y:wy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      alpha:1, decay:1/500, r:2+Math.random()*1.5, color:C.key,
    });
  }
}

// ─── Level builder ────────────────────────────────────────────────────────────
function buildLevel(level: number, now: number): GameState {
  const lc   = getLevelConfig(level);
  const maze = generateMaze(lc.gridSize);
  const w = lc.gridSize, h = lc.gridSize;
  const player = {x:1,y:1};
  const exit   = {x:w-2,y:h-2};
  maze[exit.y][exit.x] = false;
  const keys = lc.keyCount > 0 ? placeKeys(maze,player,exit,w,h,lc.keyCount) : [];

  const s: GameState = {
    maze, gridW:w, gridH:h,
    player:{...player}, playerDisplay:{...player},
    exit, level,
    fogRadius: lc.fogCells * CS,
    phase: 'playing',
    lastShiftTime: now, shiftWarning: false,
    flashCells: [], time: now,
    visitedCells: new Set<number>(),
    cellVisitCount: new Map<number,number>(),
    unstableCells: new Set<number>(),
    unstableThreshold: lc.unstableThreshold,
    objective: lc.objective,
    keys, keysCollected:0, keysTotal:lc.keyCount,
    exitOpen: lc.keyCount === 0,
    sanity: 1.0, sanityDrainBase: lc.sanityDrainBase,
    shiftCount:0, levelStartTime:now,
    pausedAt:0, totalPausedMs:0,
    shakeOffset:{x:0,y:0}, shakeDuration:0, shakeIntensity:0,
    shiftPulse:null, lastWarningPulse:0,
    particles:[], lastExitParticle:now,
    shiftInterval: lc.shiftInterval,
  };
  markVisible(s);
  s.cellVisitCount.set(1*w+1, 1);
  s.visitedCells.add(1*w+1);
  return s;
}

// ─── UI types ─────────────────────────────────────────────────────────────────
interface UIState {
  phase: GamePhase | 'menu';
  level: number;
  countdown: number;
  levelTimeFmt: string;
  shiftCount: number;
  warning: boolean;
  keysCollected: number;
  keysTotal: number;
  exitOpen: boolean;
  sanity: number;
  objective: ObjectiveType;
}
interface LevelDone {
  level: number; timeFmt: string; shiftCount: number;
  isNewBest: boolean; bestTimeFmt: string|null; perf: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { startLevel: number; onBackToMenu: () => void; }

export default function GameCanvas({ startLevel, onBackToMenu }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const fogRef        = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const stateRef      = useRef<GameState|null>(null);
  const rafRef        = useRef<number>(0);
  const prevRef       = useRef<number>(0);
  const touchStart    = useRef<{x:number;y:number}|null>(null);
  const cameraRef     = useRef({x:0,y:0});
  const wallBumpRef   = useRef<{nx:number;ny:number;t:number}|null>(null);
  const gameActiveRef = useRef(false);     // true once player clicks "Enter Maze"
  const prevWarnRef   = useRef(false);     // for haptic one-shot on warning start
  const ctrlModeRef   = useRef<ControlMode>(getControlMode()); // live ref for touch handler

  const [muted,        setMuted]        = useState(audio.muted);
  const [showTutorial, setShowTutorial] = useState(() => !isTutorialDone());
  const [showIntro,    setShowIntro]    = useState(true);
  const [controlMode,  setCtrlMode]     = useState<ControlMode>(getControlMode);
  const [hapticsOn,    setHapticsOn]    = useState(getHapticsEnabled);
  // Initialize from the actual level config so HUD is correct during the first intro
  const [ui, setUi]   = useState<UIState>(() => {
    const lc = getLevelConfig(startLevel);
    return {
      phase:'playing', level:startLevel,
      countdown: Math.ceil(lc.shiftInterval / 1000),
      levelTimeFmt:'0:00', shiftCount:0,
      warning:false, keysCollected:0, keysTotal:lc.keyCount,
      exitOpen:lc.keyCount===0, sanity:1, objective:lc.objective,
    };
  });
  const [levelDone, setLevelDone] = useState<LevelDone|null>(null);

  // Keep ctrlModeRef in sync (accessible inside touch closure)
  useEffect(() => { ctrlModeRef.current = controlMode; }, [controlMode]);

  // ── Resize ──────────────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = window.innerWidth; c.height = window.innerHeight;
    fogRef.current.width  = c.width;
    fogRef.current.height = c.height;
  }, []);

  // ── tryMove ─────────────────────────────────────────────────────────────────
  const tryMove = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    if (!s || s.phase !== 'playing' || !gameActiveRef.current) return;
    const nx = s.player.x+dx, ny = s.player.y+dy;

    // Wall or boundary — bump feedback
    if (nx<0||nx>=s.gridW||ny<0||ny>=s.gridH||s.maze[ny][nx]) {
      wallBumpRef.current = {nx:s.player.x+dx, ny:s.player.y+dy, t:performance.now()};
      vibrate(HP.bump);
      audio.playBump();
      return;
    }

    s.player = {x:nx,y:ny};
    const key = ny*s.gridW+nx;
    const cnt = (s.cellVisitCount.get(key)??0)+1;
    s.cellVisitCount.set(key, cnt);
    s.visitedCells.add(key);
    if (cnt >= s.unstableThreshold) s.unstableCells.add(key);
    markVisible(s);
    audio.playMove();

    // Key collection
    const ki = s.keys.findIndex(k => k.x===nx&&k.y===ny);
    if (ki !== -1) {
      s.keys.splice(ki,1);
      s.keysCollected++;
      spawnKeyBurst(s, nx, ny);
      audio.playKeyCollect();
      vibrate(HP.tap);
      if (s.keys.length === 0) {
        s.exitOpen = true;
        s.flashCells.push({x:s.exit.x,y:s.exit.y,alpha:1,isWall:false});
      }
      setUi(u => ({...u, keysCollected:s.keysCollected, exitOpen:s.exitOpen}));
    }

    // Exit
    if (nx===s.exit.x && ny===s.exit.y && s.exitOpen) {
      s.phase = 'levelComplete';
      const levelTime = s.time - s.levelStartTime - s.totalPausedMs;
      const isNewBest = setBestTime(s.level, levelTime);
      const best      = getBestTime(s.level);
      saveHighestLevel(s.level+1);
      audio.playLevelComplete();
      vibrate(HP.levelComplete);
      setLevelDone({
        level:s.level, timeFmt:fmt(levelTime), shiftCount:s.shiftCount,
        isNewBest, bestTimeFmt:best!==null?fmt(best):null,
        perf:perfText(levelTime),
      });
      setUi(u => ({...u, phase:'levelComplete'}));
    }
  }, []);

  // ── Tap to move (uses cameraRef for correct world→screen mapping) ─────────
  const tapToMove = useCallback((cx: number, cy: number) => {
    const s = stateRef.current;
    if (!s||s.phase!=='playing'||!gameActiveRef.current) return;
    const {x:camX,y:camY} = cameraRef.current;
    const gx = Math.floor((cx-camX)/CS);
    const gy = Math.floor((cy-camY)/CS);
    const adx=gx-s.player.x, ady=gy-s.player.y;
    if (Math.abs(adx)+Math.abs(ady)===1) tryMove(adx, ady);
  }, [tryMove]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map: Record<string,[number,number]> = {
      ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0],
      w:[0,-1],s:[0,1],a:[-1,0],d:[1,0],
    };
    const h = (e: KeyboardEvent) => {
      audio.init();
      if (e.key==='Escape') {
        const s=stateRef.current;
        if (s?.phase==='playing') pauseGame();
        else if (s?.phase==='paused') resumeGame();
        return;
      }
      const d=map[e.key]; if(d){e.preventDefault();tryMove(...d);}
    };
    window.addEventListener('keydown',h);
    return () => window.removeEventListener('keydown',h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryMove]);

  // ── Touch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onStart = (e: TouchEvent) => {
      e.preventDefault(); audio.init();
      touchStart.current = {x:e.touches[0].clientX, y:e.touches[0].clientY};
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault(); if (!touchStart.current) return;
      const t=e.changedTouches[0];
      const dx=t.clientX-touchStart.current.x, dy=t.clientY-touchStart.current.y;
      const dist=Math.hypot(dx,dy);
      if (dist < 10) {
        // Tap: always works (both modes)
        tapToMove(t.clientX, t.clientY);
      } else if (ctrlModeRef.current === 'swipe') {
        // Swipe: only in swipe mode
        if (Math.abs(dx)>Math.abs(dy)) { if (dist>18) tryMove(dx>0?1:-1,0); }
        else { if (dist>18) tryMove(0,dy>0?1:-1); }
      }
      touchStart.current=null;
    };
    canvas.addEventListener('touchstart',onStart,{passive:false});
    canvas.addEventListener('touchend',onEnd,{passive:false});
    return () => {
      canvas.removeEventListener('touchstart',onStart);
      canvas.removeEventListener('touchend',onEnd);
    };
  }, [tryMove, tapToMove]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const render = useCallback((s: GameState) => {
    const canvas=canvasRef.current; if (!canvas) return;
    const ctx=canvas.getContext('2d')!;
    const W=canvas.width, H=canvas.height;

    // Player visual center (offset for HUD at top)
    const FX = W / 2;
    const FY = H / 2 + (HUD_H + SAN_BAR_H) / 2;

    // Wall bump animation offset (use performance.now() — not s.time — so it works during pause)
    const bump = wallBumpRef.current;
    const bumpAge = bump ? (performance.now() - bump.t) : Infinity;
    let bumpX = 0, bumpY = 0;
    if (bumpAge < 250) {
      const mag = Math.sin((bumpAge / 250) * Math.PI) * CS * 0.22;
      bumpX = (bump!.nx - s.player.x) * mag;
      bumpY = (bump!.ny - s.player.y) * mag;
    } else if (bump) {
      wallBumpRef.current = null;
    }

    // Camera: follow player, clamped to maze bounds
    const mazeW = s.gridW * CS, mazeH = s.gridH * CS;
    const baseCamX = mazeW > W
      ? clamp(W - mazeW, 0, FX - (s.playerDisplay.x+0.5)*CS)
      : FX - (s.playerDisplay.x+0.5)*CS;
    const baseCamY = mazeH > H
      ? clamp(H - mazeH, 0, FY - (s.playerDisplay.y+0.5)*CS)
      : FY - (s.playerDisplay.y+0.5)*CS;

    // Store base camera (no effects) so tap-to-move stays accurate
    cameraRef.current = {x:baseCamX, y:baseCamY};

    const camX = baseCamX + bumpX + s.shakeOffset.x;
    const camY = baseCamY + bumpY + s.shakeOffset.y;

    ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);

    // ─── World layer ─────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(camX,camY);

    for (let row=0;row<s.gridH;row++) {
      for (let col=0;col<s.gridW;col++) {
        const k=row*s.gridW+col;
        const isUnstable=s.unstableCells.has(k);
        if (!s.maze[row][col]) {
          ctx.fillStyle=isUnstable?C.unstFloor:C.floor;
          ctx.fillRect(col*CS,row*CS,CS,CS);
          ctx.strokeStyle=C.floorGrid; ctx.lineWidth=0.5;
          ctx.strokeRect(col*CS+1,row*CS+1,CS-2,CS-2);
        } else {
          ctx.fillStyle=isUnstable?C.unstWall:C.wall;
          ctx.fillRect(col*CS,row*CS,CS,CS);
          ctx.fillStyle=C.wallEdge;
          ctx.fillRect(col*CS,row*CS,CS,1);
          ctx.fillRect(col*CS,row*CS,1,CS);
        }
        if (isUnstable) {
          const p=0.4+0.6*Math.sin(s.time*0.0035+k*0.8);
          ctx.fillStyle=`rgba(140,40,255,${(0.05+p*0.09).toFixed(3)})`;
          ctx.fillRect(col*CS,row*CS,CS,CS);
          ctx.strokeStyle=`rgba(160,60,255,${(0.15+p*0.12).toFixed(3)})`;
          ctx.lineWidth=0.7;
          ctx.beginPath();
          ctx.moveTo(col*CS+h01(k,1)*CS, row*CS+h01(k,2)*CS);
          ctx.lineTo(col*CS+h01(k,3)*CS, row*CS+h01(k,4)*CS);
          ctx.moveTo(col*CS+h01(k,5)*CS, row*CS+h01(k,6)*CS);
          ctx.lineTo(col*CS+h01(k,7)*CS, row*CS+h01(k,8)*CS);
          ctx.stroke();
        }
      }
    }

    // Flash cells
    for (const fc of s.flashCells) {
      ctx.globalAlpha=Math.max(0,fc.alpha);
      ctx.fillStyle=fc.isWall?'rgba(255,120,30,0.85)':'rgba(0,210,255,0.85)';
      ctx.fillRect(fc.x*CS+2,fc.y*CS+2,CS-4,CS-4);
    }
    ctx.globalAlpha=1;

    // Keys
    for (const k of s.keys) {
      const kpx=k.x*CS+CS/2, kpy=k.y*CS+CS/2;
      const kp=0.72+0.28*Math.sin(s.time*0.004+k.x*0.5+k.y*0.7);
      const kg=ctx.createRadialGradient(kpx,kpy,0,kpx,kpy,CS*0.9*kp);
      kg.addColorStop(0,'rgba(255,210,60,0.5)');
      kg.addColorStop(0.5,'rgba(255,180,20,0.15)');
      kg.addColorStop(1,'rgba(255,180,20,0)');
      ctx.fillStyle=kg;
      ctx.beginPath(); ctx.arc(kpx,kpy,CS*0.9,0,Math.PI*2); ctx.fill();
      const ks=CS*0.2;
      ctx.fillStyle=C.key; ctx.shadowColor=C.key; ctx.shadowBlur=10;
      ctx.beginPath();
      ctx.moveTo(kpx,kpy-ks); ctx.lineTo(kpx+ks*0.7,kpy);
      ctx.lineTo(kpx,kpy+ks); ctx.lineTo(kpx-ks*0.7,kpy);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur=0;
    }

    // Exit
    const tp=0.7+0.3*Math.sin(s.time*0.003);
    const ex=s.exit.x*CS+CS/2, ey=s.exit.y*CS+CS/2;
    ctx.globalAlpha=s.exitOpen?1:0.28;
    const eg=ctx.createRadialGradient(ex,ey,0,ex,ey,CS*2*tp);
    eg.addColorStop(0,'rgba(0,255,100,0.55)');
    eg.addColorStop(0.4,'rgba(0,255,100,0.18)');
    eg.addColorStop(1,'rgba(0,255,100,0)');
    ctx.fillStyle=eg;
    ctx.beginPath(); ctx.arc(ex,ey,CS*2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=s.exitOpen?C.exit:C.exitLocked;
    ctx.shadowColor=C.exit; ctx.shadowBlur=s.exitOpen?14:0;
    ctx.beginPath(); ctx.arc(ex,ey,CS*0.28,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    if (s.exitOpen) {
      ctx.strokeStyle=C.exit; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
      const aw=CS*0.2;
      ctx.beginPath();
      ctx.moveTo(ex,ey-CS*0.14); ctx.lineTo(ex,ey+CS*0.18);
      ctx.moveTo(ex-aw,ey-CS*0.02); ctx.lineTo(ex,ey-CS*0.22); ctx.lineTo(ex+aw,ey-CS*0.02);
      ctx.stroke();
    } else {
      ctx.strokeStyle='rgba(0,180,80,0.7)'; ctx.lineWidth=1.8; ctx.lineCap='round';
      ctx.beginPath(); ctx.arc(ex,ey-CS*0.07,CS*0.12,Math.PI*0.1,Math.PI*0.9); ctx.stroke();
      ctx.strokeRect(ex-CS*0.13,ey-CS*0.04,CS*0.26,CS*0.18);
      // "LOCKED" label when exit is visible
      const distToExit = Math.hypot((s.exit.x-s.playerDisplay.x)*CS,(s.exit.y-s.playerDisplay.y)*CS);
      if (distToExit < s.fogRadius*0.8) {
        ctx.globalAlpha=0.55;
        ctx.fillStyle='rgba(0,180,80,0.9)';
        ctx.font=`bold 8px monospace`;
        ctx.textAlign='center';
        ctx.fillText('LOCKED', ex, ey+CS*0.65);
        ctx.textAlign='left';
      }
    }
    ctx.globalAlpha=1;

    // Player (with bump offset)
    const ppx = s.playerDisplay.x*CS+CS/2 + bumpX;
    const ppy = s.playerDisplay.y*CS+CS/2 + bumpY;
    const pg=ctx.createRadialGradient(ppx,ppy,0,ppx,ppy,CS*1.6);
    pg.addColorStop(0,'rgba(90,180,255,0.52)');
    pg.addColorStop(0.35,'rgba(60,140,255,0.26)');
    pg.addColorStop(1,'rgba(20,60,180,0)');
    ctx.fillStyle=pg;
    ctx.beginPath(); ctx.arc(ppx,ppy,CS*1.6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=C.player; ctx.shadowColor='#60b8ff'; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(ppx,ppy,CS*0.3,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(ppx-CS*0.09,ppy-CS*0.1,CS*0.09,0,Math.PI*2); ctx.fill();

    // Wall-bump red flash at target cell
    if (bumpAge < 200 && bump) {
      const tx = clamp(0,s.gridW-1,bump.nx), ty = clamp(0,s.gridH-1,bump.ny);
      ctx.globalAlpha = (1 - bumpAge/200) * 0.55;
      ctx.fillStyle = 'rgba(255,50,20,1)';
      ctx.beginPath(); ctx.arc(tx*CS+CS/2, ty*CS+CS/2, CS*0.35, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha=1;
    }

    // Particles
    for (const p of s.particles) {
      ctx.globalAlpha=p.alpha;
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
    ctx.restore();

    // ─── Fog of war ─────────────────────────────────────────────────────────
    const fogCanvas=fogRef.current, fogCtx=fogCanvas.getContext('2d')!;
    fogCtx.clearRect(0,0,W,H);
    fogCtx.fillStyle=C.fog; fogCtx.fillRect(0,0,W,H);
    fogCtx.globalCompositeOperation='destination-out';
    const fogR=s.fogRadius;
    const fg=fogCtx.createRadialGradient(FX,FY,0,FX,FY,fogR);
    fg.addColorStop(0,'rgba(0,0,0,1)');
    fg.addColorStop(0.5,'rgba(0,0,0,1)');
    fg.addColorStop(0.72,'rgba(0,0,0,0.65)');
    fg.addColorStop(0.88,'rgba(0,0,0,0.22)');
    fg.addColorStop(1,'rgba(0,0,0,0)');
    fogCtx.fillStyle=fg;
    fogCtx.beginPath(); fogCtx.arc(FX,FY,fogR,0,Math.PI*2); fogCtx.fill();
    fogCtx.globalCompositeOperation='source-over';
    ctx.drawImage(fogCanvas,0,0);

    // ─── Memory cells (on top of fog) ───────────────────────────────────────
    ctx.save();
    ctx.translate(camX,camY);
    const fStart=fogR*0.45, fRange=fogR*0.45;
    for (const k of s.visitedCells) {
      const col=k%s.gridW, row=Math.floor(k/s.gridW);
      const dist=Math.hypot((col-s.playerDisplay.x)*CS,(row-s.playerDisplay.y)*CS);
      if (dist<fStart) continue;
      ctx.globalAlpha=Math.min(1,(dist-fStart)/fRange);
      ctx.fillStyle=s.maze[row][col]?C.memWall:C.memFloor;
      ctx.fillRect(col*CS,row*CS,CS,CS);
    }
    ctx.globalAlpha=1;
    ctx.restore();

    // ─── Shift pulse ─────────────────────────────────────────────────────────
    renderPulse(ctx,FX,FY,s.shiftPulse);

    // ─── Warning vignette ────────────────────────────────────────────────────
    if (s.shiftWarning && s.phase!=='paused') {
      const wp=0.5+0.5*Math.sin(s.time*0.009);
      const wa=0.07+wp*0.22;
      const wg=ctx.createRadialGradient(FX,FY,H*0.2,FX,FY,H*0.82);
      wg.addColorStop(0,'rgba(220,40,0,0)');
      wg.addColorStop(0.6,`rgba(220,40,0,${(wa*0.3).toFixed(3)})`);
      wg.addColorStop(1,`rgba(220,40,0,${wa.toFixed(3)})`);
      ctx.fillStyle=wg; ctx.fillRect(0,0,W,H);
    }

    // ─── Sanity vignette ─────────────────────────────────────────────────────
    if (s.sanity < 0.72 && s.phase!=='paused') {
      const loss=(0.72-s.sanity)/0.72;
      const pulse=s.sanity<0.2?0.5+0.5*Math.sin(s.time*0.012):0;
      const inner=W*(0.55-loss*0.25);
      const sg=ctx.createRadialGradient(FX,FY,inner,FX,FY,W*0.8);
      sg.addColorStop(0,'rgba(0,0,0,0)');
      sg.addColorStop(1,`rgba(0,0,0,${(loss*0.75+pulse*0.15).toFixed(3)})`);
      ctx.fillStyle=sg; ctx.fillRect(0,0,W,H);
    }

    // ─── Pause dim ───────────────────────────────────────────────────────────
    if (s.phase==='paused') {
      ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,W,H);
    }
  }, []);

  // ── Game loop ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const now = performance.now();
    stateRef.current = buildLevel(startLevel, now);
    prevRef.current  = now;
    resize();
    window.addEventListener('resize', resize);
    let uiAcc = 0;

    const loop = (ts: number) => {
      const dt = Math.min(ts - prevRef.current, 80);
      prevRef.current = ts;
      uiAcc += dt;

      const s = stateRef.current;
      if (!s) { rafRef.current=requestAnimationFrame(loop); return; }
      s.time = ts;

      if (s.phase === 'playing' && gameActiveRef.current) {
        const lf=Math.min(1, LERP*dt/1000);
        s.playerDisplay.x+=(s.player.x-s.playerDisplay.x)*lf;
        s.playerDisplay.y+=(s.player.y-s.playerDisplay.y)*lf;

        s.flashCells=s.flashCells
          .map(fc=>({...fc,alpha:fc.alpha-dt/FLASH_MS}))
          .filter(fc=>fc.alpha>0);

        if (s.shakeDuration>0) {
          s.shakeDuration-=dt;
          const str=s.shakeIntensity*Math.max(0,s.shakeDuration/SHAKE_MS);
          s.shakeOffset={x:(Math.random()-.5)*str*2,y:(Math.random()-.5)*str*2};
          if (s.shakeDuration<=0) s.shakeOffset={x:0,y:0};
        }

        if (s.shiftPulse) {
          s.shiftPulse.radius+=dt*0.55; s.shiftPulse.alpha-=dt/750;
          if (s.shiftPulse.alpha<=0) s.shiftPulse=null;
        }

        s.particles=s.particles
          .map(p=>({...p,x:p.x+p.vx*dt,y:p.y+p.vy*dt,alpha:p.alpha-p.decay*dt}))
          .filter(p=>p.alpha>0);
        if (s.particles.length<12 && ts-s.lastExitParticle>450) {
          spawnExitParticle(s); s.lastExitParticle=ts;
        }

        const drainRate=s.sanityDrainBase*(s.shiftWarning?WARN_MULT:1);
        s.sanity=Math.max(0,s.sanity-drainRate*dt/1000);
        if (s.sanity===0) {
          s.phase='gameOver';
          audio.playGameOver();
          vibrate(HP.gameOver);
          setUi(u=>({...u,phase:'gameOver',sanity:0}));
        }

        const elapsed=ts-s.lastShiftTime;
        const remaining=s.shiftInterval-elapsed;
        s.shiftWarning=remaining<=3000;

        // Haptic once when warning begins
        if (s.shiftWarning && !prevWarnRef.current) vibrate(HP.warning);
        prevWarnRef.current = s.shiftWarning;

        if (s.shiftWarning && ts-s.lastWarningPulse>1100) {
          s.lastWarningPulse=ts; audio.playWarningPulse();
        }

        if (remaining<=0) {
          const n=getMutationCount(s.level);
          const {newCells,changed}=mutateMaze(s.maze,s.player,s.exit,s.gridW,s.gridH,n,s.unstableCells);
          s.maze=newCells; s.flashCells=[...changed];
          s.lastShiftTime=ts; s.shiftWarning=false; s.shiftCount++;
          s.shakeDuration=SHAKE_MS; s.shakeIntensity=4+s.level;
          s.shiftPulse={radius:30,alpha:0.85} as ShiftPulse;
          s.lastWarningPulse=0;
          if (s.objective==='unstable-exit') {
            const ne=findNewExit(s.maze,s.player,s.gridW,s.gridH);
            if (ne) {
              s.exit=ne;
              s.flashCells.push({x:ne.x,y:ne.y,alpha:1,isWall:false});
            }
          }
          audio.playShift();
          vibrate(HP.shift);
        }

        if (uiAcc>250) {
          uiAcc=0;
          setUi(u=>({
            ...u, level:s.level,
            countdown:Math.max(0,Math.ceil(remaining/1000)),
            levelTimeFmt:fmt(ts-s.levelStartTime-s.totalPausedMs),
            shiftCount:s.shiftCount, warning:s.shiftWarning,
            keysCollected:s.keysCollected, keysTotal:s.keysTotal,
            exitOpen:s.exitOpen, sanity:s.sanity, objective:s.objective,
          }));
        }
      }

      render(s);
      rafRef.current=requestAnimationFrame(loop);
    };

    rafRef.current=requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',resize); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  // Tutorial + level intro flow
  const handleTutorialDone = useCallback(() => {
    markTutorialDone();
    setShowTutorial(false);
    // showIntro remains true → level intro shows next
  }, []);

  const handleEnterMaze = useCallback(() => {
    const now = performance.now();
    const s = stateRef.current;
    if (s) {
      // Reset timers to start from the moment player enters
      s.lastShiftTime   = now;
      s.levelStartTime  = now;
      s.lastWarningPulse = 0;
      s.totalPausedMs   = 0;
    }
    gameActiveRef.current = true;
    prevWarnRef.current   = false;
    setShowIntro(false);
  }, []);

  const pauseGame = useCallback(() => {
    const s=stateRef.current; if (!s||s.phase!=='playing'||!gameActiveRef.current) return;
    s.phase='paused'; s.pausedAt=performance.now();
    setUi(u=>({...u,phase:'paused'}));
  },[]);

  const resumeGame = useCallback(() => {
    const s=stateRef.current; if (!s||s.phase!=='paused') return;
    const pausedMs=performance.now()-s.pausedAt;
    s.lastShiftTime+=pausedMs; s.levelStartTime+=pausedMs;
    if (s.lastWarningPulse>0) s.lastWarningPulse+=pausedMs;
    s.totalPausedMs+=pausedMs; s.pausedAt=0;
    s.phase='playing';
    setUi(u=>({...u,phase:'playing'}));
  },[]);

  const replayLevel = useCallback(() => {
    const lvl=stateRef.current?.level??startLevel;
    const lc=getLevelConfig(lvl);
    stateRef.current=buildLevel(lvl,performance.now());
    setLevelDone(null);
    setShowIntro(true);
    gameActiveRef.current=false;
    prevWarnRef.current=false;
    setUi(u=>({...u,
      phase:'playing', shiftCount:0, keysCollected:0,
      keysTotal:lc.keyCount, objective:lc.objective,
      countdown:Math.ceil(lc.shiftInterval/1000),
      sanity:1, levelTimeFmt:'0:00', warning:false,
      exitOpen:lc.keyCount===0,
    }));
  },[startLevel]);

  const nextLevel = useCallback(() => {
    const lvl=(stateRef.current?.level??startLevel)+1;
    const lc=getLevelConfig(lvl);
    stateRef.current=buildLevel(lvl,performance.now());
    setLevelDone(null);
    setShowIntro(true);
    gameActiveRef.current=false;
    prevWarnRef.current=false;
    setUi(u=>({...u,
      level:lvl, phase:'playing', shiftCount:0, keysCollected:0,
      keysTotal:lc.keyCount, objective:lc.objective,
      countdown:Math.ceil(lc.shiftInterval/1000),
      sanity:1, levelTimeFmt:'0:00', warning:false,
      exitOpen:lc.keyCount===0,
    }));
  },[startLevel]);

  const toggleMute = useCallback(()=>{const m=audio.toggleMute();setMuted(m);},[]);

  const switchControl = useCallback((m: ControlMode) => {
    setCtrlMode(m); setControlMode(m); ctrlModeRef.current=m;
  },[]);

  const toggleHaptics = useCallback(() => {
    const next = !getHapticsEnabled();
    setHapticsEnabled(next);
    setHapticsOn(next);
  },[]);

  const dpad=(dx:number,dy:number)=>(e:React.PointerEvent)=>{
    e.preventDefault(); audio.init(); tryMove(dx,dy);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const sanityColor = ui.sanity>0.6?'#00c880':ui.sanity>0.3?'#e8a020':'#e83020';
  const isPlaying   = ui.phase==='playing';
  const gameVisible = isPlaying && !showTutorial && !showIntro;

  const objLabel = ui.objective==='unstable-exit' ? 'Find the moving exit'
    : ui.objective==='keys' ? `Collect all keys: ${ui.keysCollected}/${ui.keysTotal}`
    : 'Find the exit';

  return (
    <div style={{position:'fixed',inset:0,background:C.bg,overflow:'hidden'}}>
      <canvas ref={canvasRef} style={{display:'block',touchAction:'none'}} />

      {/* ── Tutorial (highest priority overlay) ── */}
      {showTutorial && <Tutorial onDone={handleTutorialDone} />}

      {/* ── Level intro ── */}
      {!showTutorial && showIntro && (
        <LevelIntro
          level={ui.level}
          objective={ui.objective}
          keyCount={ui.keysTotal}
          onEnter={handleEnterMaze}
          onMenu={onBackToMenu}
        />
      )}

      {/* ── HUD ── */}
      <div className="safe-hud" style={S.hud}>
        <div style={S.hudLeft}>
          <div style={S.hudBlock}>
            <span style={S.lbl}>LVL</span>
            <span style={S.val}>{ui.level}</span>
          </div>
          <div style={S.hudBlock}>
            <span style={S.lbl}>TIME</span>
            <span style={S.val}>{ui.levelTimeFmt}</span>
          </div>
        </div>

        <div style={S.hudObj}>
          {ui.keysTotal>0 && (
            <div style={S.keys}>
              {Array.from({length:ui.keysTotal},(_,i)=>(
                <span key={i} style={{color:i<ui.keysCollected?C.key:'rgba(255,208,60,0.22)',fontSize:14,lineHeight:1}}>◆</span>
              ))}
            </div>
          )}
          <span style={{...S.lbl,color:'rgba(255,255,255,0.28)',fontSize:9}}>{objLabel}</span>
        </div>

        <div style={S.hudRight}>
          <div style={{...S.hudBlock,color:ui.warning?'#ff5520':'#5ab4ff',alignItems:'flex-end'}}>
            <span style={S.lbl}>SHIFT</span>
            <span style={S.val}>{ui.countdown}s</span>
          </div>
          <div style={S.hudIcons}>
            <button style={S.ico} onClick={toggleMute}>{muted?'🔇':'🔊'}</button>
            <button style={S.ico} onClick={pauseGame}>⏸</button>
          </div>
        </div>
      </div>

      {/* Sanity bar */}
      <div style={{position:'absolute',top:HUD_H,left:0,right:0,height:SAN_BAR_H,
                   background:'rgba(255,255,255,0.05)',zIndex:11}}>
        <div style={{width:`${ui.sanity*100}%`,height:'100%',background:sanityColor,
          boxShadow:ui.sanity<0.3?`0 0 8px ${sanityColor}`:undefined,transition:'background 0.5s'}}/>
      </div>

      {/* Warning text */}
      {gameVisible && ui.warning && (
        <div style={S.warnTxt}>⚠ THE MAZE IS SHIFTING</div>
      )}

      {/* ── Pause overlay ── */}
      {ui.phase==='paused' && (
        <div style={S.overlay}>
          <div style={S.card}>
            <div style={S.cardTitle}>PAUSED</div>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.15)',fontFamily:'monospace',letterSpacing:'0.1em',marginTop:-4}}>{APP_VERSION}</div>
            <button style={S.btnPrimary} onClick={resumeGame}>▶ Resume</button>
            <div style={S.settingRow}>
              <span style={S.stLbl}>Controls</span>
              <div style={{display:'flex',gap:5}}>
                <button style={{...S.toggleBtn,...(controlMode==='swipe'?S.toggleActive:{})}}
                        onClick={()=>switchControl('swipe')}>Swipe</button>
                <button style={{...S.toggleBtn,...(controlMode==='dpad'?S.toggleActive:{})}}
                        onClick={()=>switchControl('dpad')}>D-pad</button>
              </div>
            </div>
            <div style={S.settingRow}>
              <span style={S.stLbl}>Haptics</span>
              <button style={{...S.toggleBtn,...(hapticsOn?S.toggleActive:{})}}
                      onClick={toggleHaptics}>{hapticsOn?'On':'Off'}</button>
            </div>
            <div style={S.settingRow}>
              <span style={S.stLbl}>Sound</span>
              <button style={{...S.toggleBtn,...(!muted?S.toggleActive:{})}}
                      onClick={toggleMute}>{muted?'Off':'On'}</button>
            </div>
            <button style={S.btnGhost} onClick={replayLevel}>↺ Restart Level</button>
            <button style={S.btnGhost} onClick={onBackToMenu}>← Back to Menu</button>
          </div>
        </div>
      )}

      {/* ── Game over overlay ── */}
      {ui.phase==='gameOver' && (
        <div style={S.overlay}>
          <div style={S.card}>
            <div style={{...S.glyph,color:'#ff3020',filter:'drop-shadow(0 0 14px #ff3020)'}}>◉</div>
            <div style={{...S.cardTitle,color:'#ff4030'}}>YOUR LIGHT FADED</div>
            <div style={S.cardSub}>The darkness claimed you on level {ui.level}.</div>
            <div style={S.stats}>
              <div style={S.statRow}><span style={S.stLbl}>Time survived</span><span style={S.stVal}>{ui.levelTimeFmt}</span></div>
              <div style={S.statRow}><span style={S.stLbl}>Shifts endured</span><span style={S.stVal}>{ui.shiftCount}</span></div>
            </div>
            <button style={S.btnPrimary} onClick={replayLevel}>↺ Try Again</button>
            <button style={S.btnGhost} onClick={onBackToMenu}>← Menu</button>
          </div>
        </div>
      )}

      {/* ── Level complete overlay ── */}
      {ui.phase==='levelComplete' && levelDone && (
        <div style={S.overlay}>
          <div style={S.card}>
            <div style={{...S.glyph,color:C.exit,filter:'drop-shadow(0 0 14px #00ff88)'}}>✦</div>
            <div style={{...S.cardTitle,color:C.exit}}>EXIT FOUND</div>
            <div style={S.cardSub}>{levelDone.perf}</div>
            <div style={S.stats}>
              <div style={S.statRow}><span style={S.stLbl}>Level</span><span style={S.stVal}>{levelDone.level}</span></div>
              <div style={S.statRow}><span style={S.stLbl}>Time</span><span style={S.stVal}>{levelDone.timeFmt}</span></div>
              <div style={S.statRow}><span style={S.stLbl}>Shifts survived</span><span style={S.stVal}>{levelDone.shiftCount}</span></div>
              {levelDone.bestTimeFmt && (
                <div style={S.statRow}>
                  <span style={S.stLbl}>Best time</span>
                  <span style={{...S.stVal,color:levelDone.isNewBest?'#ffd060':undefined}}>
                    {levelDone.bestTimeFmt}{levelDone.isNewBest?' ★':''}
                  </span>
                </div>
              )}
            </div>
            <button style={S.btnPrimary} onClick={nextLevel}>NEXT LEVEL →</button>
            <button style={S.btnGhost} onClick={replayLevel}>↺ Replay</button>
            <button style={S.btnGhost} onClick={onBackToMenu}>← Menu</button>
          </div>
        </div>
      )}

      {/* ── D-pad (dpad mode only) ── */}
      {gameVisible && controlMode==='dpad' && (
        <div className="safe-dpad" style={S.dpad}>
          <div style={S.drow}><button style={S.dbtn} onPointerDown={dpad(0,-1)}>▲</button></div>
          <div style={S.drow}>
            <button style={S.dbtn} onPointerDown={dpad(-1,0)}>◀</button>
            <div style={{width:50,height:50}}/>
            <button style={S.dbtn} onPointerDown={dpad(1,0)}>▶</button>
          </div>
          <div style={S.drow}><button style={S.dbtn} onPointerDown={dpad(0,1)}>▼</button></div>
        </div>
      )}

      {/* Hint */}
      {gameVisible && (
        <div className="safe-hint" style={S.hint}>
          {ui.objective==='keys'&&!ui.exitOpen
            ? <>Collect <span style={{color:C.key}}>keys</span> first</>
            : ui.objective==='unstable-exit'
            ? <>Track the <span style={{color:'#80c0ff'}}>moving exit</span></>
            : <>Find the <span style={{color:C.exit}}>green glow</span></>}
        </div>
      )}
    </div>
  );
}

// ─── Pulse helper ─────────────────────────────────────────────────────────────
function renderPulse(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: ShiftPulse|null) {
  if (!p||p.alpha<=0) return;
  ctx.save();
  ctx.strokeStyle=`rgba(255,100,30,${p.alpha.toFixed(3)})`; ctx.lineWidth=5;
  ctx.beginPath(); ctx.arc(cx,cy,p.radius,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle=`rgba(255,200,60,${(p.alpha*.45).toFixed(3)})`; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,p.radius*.75,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string,React.CSSProperties> = {
  hud:{
    position:'absolute',top:0,left:0,right:0,
    display:'flex',alignItems:'center',gap:6,
    padding:'8px 12px',
    minHeight:HUD_H,   // minHeight so safe-area padding doesn't clip content
    background:'rgba(7,11,15,0.9)',
    backdropFilter:'blur(6px)',
    borderBottom:'1px solid rgba(90,180,255,0.09)',
    zIndex:10,userSelect:'none',
  },
  hudLeft:{display:'flex',gap:10,alignItems:'center'},
  hudObj:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:1,minWidth:0,overflow:'hidden'},
  hudRight:{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'},
  hudBlock:{display:'flex',flexDirection:'column',alignItems:'center'},
  keys:{display:'flex',gap:3,marginBottom:1},
  hudIcons:{display:'flex',gap:4},
  lbl:{fontSize:8,letterSpacing:'0.18em',color:'rgba(255,255,255,0.3)',fontFamily:'monospace',textTransform:'uppercase'},
  val:{fontSize:18,fontWeight:700,fontFamily:'monospace',lineHeight:1.1},
  ico:{
    background:'rgba(90,180,255,0.07)',border:'1px solid rgba(90,180,255,0.16)',
    borderRadius:7,color:'rgba(90,180,255,0.7)',fontSize:15,cursor:'pointer',
    padding:'4px 8px',lineHeight:1,
  },
  warnTxt:{
    position:'absolute',top:HUD_H+SAN_BAR_H+6,left:0,right:0,
    textAlign:'center',fontSize:11,fontWeight:700,letterSpacing:'0.24em',
    color:'#ff5520',fontFamily:'monospace',
    animation:'warnPulse 0.75s ease-in-out infinite',
    pointerEvents:'none',textShadow:'0 0 10px rgba(255,80,20,0.6)',zIndex:12,
  },
  overlay:{
    position:'absolute',inset:0,
    display:'flex',alignItems:'center',justifyContent:'center',
    background:'rgba(7,11,15,0.88)',backdropFilter:'blur(10px)',zIndex:20,
  },
  card:{
    display:'flex',flexDirection:'column',alignItems:'center',gap:10,
    padding:'28px 32px',
    background:'rgba(10,18,32,0.97)',
    border:'1px solid rgba(90,180,255,0.13)',
    borderRadius:18,
    boxShadow:'0 0 60px rgba(0,0,0,0.9)',
    maxWidth:330,width:'90%',
  },
  glyph:{fontSize:36,color:'#5ab4ff',filter:'drop-shadow(0 0 12px #5ab4ff)',lineHeight:1.1},
  cardTitle:{fontSize:22,fontWeight:900,letterSpacing:'0.22em',color:'#5ab4ff',fontFamily:'monospace'},
  cardSub:{fontSize:12,color:'rgba(255,255,255,0.4)',fontFamily:'monospace',textAlign:'center',lineHeight:1.6,fontStyle:'italic'},
  stats:{width:'100%',display:'flex',flexDirection:'column',gap:5,padding:'10px 0',
    borderTop:'1px solid rgba(255,255,255,0.06)',borderBottom:'1px solid rgba(255,255,255,0.06)',margin:'2px 0'},
  statRow:{display:'flex',justifyContent:'space-between',padding:'0 4px'},
  stLbl:{fontSize:11,color:'rgba(255,255,255,0.32)',fontFamily:'monospace',letterSpacing:'0.08em'},
  stVal:{fontSize:15,fontWeight:700,fontFamily:'monospace',color:'#fff'},
  btnPrimary:{
    padding:'12px 0',
    background:'rgba(90,180,255,0.1)',border:'1px solid rgba(90,180,255,0.38)',
    borderRadius:10,color:'#5ab4ff',fontSize:13,fontWeight:700,letterSpacing:'0.14em',
    fontFamily:'monospace',cursor:'pointer',width:'100%',
  },
  btnGhost:{
    padding:'9px 0',
    background:'transparent',border:'1px solid rgba(255,255,255,0.09)',
    borderRadius:10,color:'rgba(255,255,255,0.32)',
    fontSize:11,fontFamily:'monospace',cursor:'pointer',width:'100%',
  },
  settingRow:{
    display:'flex',alignItems:'center',justifyContent:'space-between',
    width:'100%',
    borderBottom:'1px solid rgba(255,255,255,0.05)',
    paddingBottom:8,
  },
  toggleBtn:{
    padding:'5px 10px',
    background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',
    borderRadius:5,color:'rgba(255,255,255,0.3)',
    fontSize:11,fontFamily:'monospace',cursor:'pointer',
  },
  toggleActive:{
    background:'rgba(90,180,255,0.14)',border:'1px solid rgba(90,180,255,0.42)',
    color:'#5ab4ff',
  },
  dpad:{
    position:'absolute',bottom:28,left:18,
    display:'flex',flexDirection:'column',alignItems:'center',gap:3,
    zIndex:10,opacity:0.82,
  },
  drow:{display:'flex',gap:3},
  dbtn:{
    width:50,height:50,
    background:'rgba(14,26,44,0.82)',border:'1px solid rgba(90,180,255,0.16)',
    borderRadius:11,color:'rgba(90,180,255,0.75)',
    fontSize:17,cursor:'pointer',touchAction:'none',userSelect:'none',
    WebkitTapHighlightColor:'transparent',
    display:'flex',alignItems:'center',justifyContent:'center',
  },
  hint:{
    position:'absolute',bottom:36,right:18,
    fontSize:11,color:'rgba(255,255,255,0.22)',
    fontFamily:'monospace',letterSpacing:'0.07em',
    textAlign:'right',pointerEvents:'none',zIndex:10,lineHeight:1.5,
  },
};
