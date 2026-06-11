import type { Position, FlashCell } from './types';

/** Iterative DFS — perfect maze, gridSize must be odd. */
export function generateMaze(gridSize: number): boolean[][] {
  const w = gridSize, h = gridSize;
  const cells: boolean[][] = Array.from({ length: h }, () => Array(w).fill(true));
  const stack: Position[] = [{ x: 1, y: 1 }];
  cells[1][1] = false;

  while (stack.length) {
    const { x, y } = stack[stack.length - 1];
    const nb: Position[] = [];
    for (const [dx, dy] of [[0,-2],[2,0],[0,2],[-2,0]]) {
      const nx = x+dx, ny = y+dy;
      if (nx>0 && nx<w-1 && ny>0 && ny<h-1 && cells[ny][nx])
        nb.push({ x: nx, y: ny });
    }
    if (!nb.length) { stack.pop(); continue; }
    const next = nb[Math.floor(Math.random() * nb.length)];
    cells[(y+next.y)>>1][(x+next.x)>>1] = false;
    cells[next.y][next.x] = false;
    stack.push(next);
  }
  return cells;
}

/** BFS reachability check. */
export function isReachable(
  cells: boolean[][], from: Position, to: Position, w: number, h: number,
): boolean {
  if (cells[from.y][from.x] || cells[to.y][to.x]) return false;
  const q: Position[] = [from];
  const vis = new Set<number>([from.y * w + from.x]);
  while (q.length) {
    const { x, y } = q.shift()!;
    if (x === to.x && y === to.y) return true;
    for (const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nx=x+dx, ny=y+dy, k=ny*w+nx;
      if (nx>=0&&nx<w&&ny>=0&&ny<h&&!cells[ny][nx]&&!vis.has(k)) { vis.add(k); q.push({x:nx,y:ny}); }
    }
  }
  return false;
}

/**
 * Find a new exit position: far from player, reachable.
 * Uses single BFS for efficiency.
 */
export function findNewExit(
  cells: boolean[][], player: Position, w: number, h: number,
): Position | null {
  // BFS to collect all reachable floor cells
  const q: Position[] = [player];
  const vis = new Set<number>([player.y * w + player.x]);
  while (q.length) {
    const { x, y } = q.shift()!;
    for (const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nx=x+dx, ny=y+dy, k=ny*w+nx;
      if (nx>=0&&nx<w&&ny>=0&&ny<h&&!cells[ny][nx]&&!vis.has(k)) { vis.add(k); q.push({x:nx,y:ny}); }
    }
  }
  const far: Position[] = [], any: Position[] = [];
  for (const k of vis) {
    const kx=k%w, ky=Math.floor(k/w);
    if (kx===player.x && ky===player.y) continue;
    any.push({ x:kx, y:ky });
    if (Math.hypot(kx-player.x, ky-player.y) >= 5) far.push({ x:kx, y:ky });
  }
  const pool = far.length ? far : any;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/** How many walls change per shift, scaled with level. */
export function getMutationCount(level: number): number {
  return Math.min(1 + level, 7);
}

/**
 * Mutate maze: remove + add walls.
 * - Protected zone: player + 8 Chebyshev neighbours + exit.
 * - Unstable cells (visited often) are 2× more likely to be selected.
 * - Every wall addition is validated with BFS.
 */
export function mutateMaze(
  cells: boolean[][],
  player: Position,
  exit: Position,
  w: number,
  h: number,
  mutationCount = 3,
  unstableCells: ReadonlySet<number> = new Set(),
): { newCells: boolean[][]; changed: FlashCell[] } {
  const newCells = cells.map(row => [...row]);
  const changed: FlashCell[] = [];
  const used = new Set<number>();

  const isProtected = (x: number, y: number) =>
    (x === exit.x && y === exit.y) ||
    Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) <= 1;

  /** Pick a cell matching wantWall, biased toward unstable. */
  const pick = (wantWall: boolean): Position | null => {
    // 50 % chance: prefer an unstable cell
    if (unstableCells.size && Math.random() < 0.5) {
      const pool: Position[] = [];
      for (const k of unstableCells) {
        const kx = k % w, ky = Math.floor(k / w);
        if (!isProtected(kx,ky) && !used.has(k) && newCells[ky][kx] === wantWall)
          pool.push({ x:kx, y:ky });
      }
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    // Random fallback
    for (let a = 0; a < 60; a++) {
      const x = 1 + Math.floor(Math.random() * (w-2));
      const y = 1 + Math.floor(Math.random() * (h-2));
      const k = y*w+x;
      if (!isProtected(x,y) && !used.has(k) && newCells[y][x] === wantWall) return {x,y};
    }
    return null;
  };

  // --- Remove walls (open passages) ---
  for (let i = 0; i < mutationCount; i++) {
    const p = pick(true); if (!p) break;
    used.add(p.y*w+p.x);
    newCells[p.y][p.x] = false;
    changed.push({ x:p.x, y:p.y, alpha:1, isWall:false });
  }

  // --- Add walls (close passages) ---
  for (let i = 0; i < mutationCount; i++) {
    const p = pick(false); if (!p) break;
    const k = p.y*w+p.x;
    used.add(k);
    newCells[p.y][p.x] = true;
    if (isReachable(newCells, player, exit, w, h)) {
      changed.push({ x:p.x, y:p.y, alpha:1, isWall:true });
    } else {
      newCells[p.y][p.x] = false; // revert — would trap player
    }
  }

  return { newCells, changed };
}
