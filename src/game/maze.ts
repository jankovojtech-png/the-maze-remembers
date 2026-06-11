import type { Position, FlashCell } from './types';

// ─── BFS distance map ─────────────────────────────────────────────────────────
const DIRS4: [number, number][] = [[0,1],[0,-1],[1,0],[-1,0]];

/**
 * Full BFS from `from` — returns a flat distance array (−1 = unreachable).
 * Used by exit placement and reachability checks.
 */
function bfsDistances(cells: boolean[][], from: Position, w: number, h: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  dist[from.y * w + from.x] = 0;
  const q: number[] = [from.y * w + from.x];
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % w, y = (k / w) | 0;
    const d = dist[k];
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nk = ny * w + nx;
      if (cells[ny][nx] || dist[nk] !== -1) continue;
      dist[nk] = d + 1;
      q.push(nk);
    }
  }
  return dist;
}

// ─── Maze generation ─────────────────────────────────────────────────────────

/** Iterative DFS — creates a perfect maze (all corridors reachable, no loops). */
function dfsGenerate(w: number, h: number): boolean[][] {
  const cells: boolean[][] = Array.from({ length: h }, () => Array(w).fill(true));
  const stack: Position[] = [{ x: 1, y: 1 }];
  cells[1][1] = false;
  while (stack.length) {
    const { x, y } = stack[stack.length - 1];
    const nb: Position[] = [];
    for (const [dx, dy] of [[0,-2],[2,0],[0,2],[-2,0]] as [number,number][]) {
      const nx = x+dx, ny = y+dy;
      if (nx > 0 && nx < w-1 && ny > 0 && ny < h-1 && cells[ny][nx])
        nb.push({ x: nx, y: ny });
    }
    if (!nb.length) { stack.pop(); continue; }
    const next = nb[Math.floor(Math.random() * nb.length)];
    cells[(y + next.y) >> 1][(x + next.x) >> 1] = false;
    cells[next.y][next.x] = false;
    stack.push(next);
  }
  return cells;
}

/**
 * Punch random loops into a perfect maze by removing a fraction of interior walls.
 * This creates occasional shortcuts and makes the maze feel less predictable.
 * Only removes walls that have at least two floor neighbours (avoids creating tiny
 * isolated pockets and keeps the change meaningful).
 */
function addLoops(cells: boolean[][], w: number, h: number, chance: number) {
  for (let row = 2; row < h - 2; row++) {
    for (let col = 2; col < w - 2; col++) {
      if (!cells[row][col]) continue; // already floor
      if (Math.random() >= chance)    continue;
      // Count adjacent floor cells
      let adj = 0;
      for (const [dx, dy] of DIRS4) {
        if (!cells[row + dy]?.[col + dx]) adj++;
      }
      // Only break walls that border at least 2 corridors — creates useful shortcuts
      if (adj >= 2) cells[row][col] = false;
    }
  }
}

/**
 * Generate a maze. loopChance ∈ [0,1] controls how many extra loops are punched
 * in after DFS, making the maze less tree-like.
 */
export function generateMaze(gridSize: number, loopChance = 0.045): boolean[][] {
  const cells = dfsGenerate(gridSize, gridSize);
  if (loopChance > 0) addLoops(cells, gridSize, gridSize, loopChance);
  return cells;
}

// ─── Exit placement ───────────────────────────────────────────────────────────

/**
 * Place the exit far from the player using BFS distance, not fixed coordinates.
 *
 * Algorithm:
 * 1. BFS from player start — collect all reachable floor cells with distances.
 * 2. Sort by distance descending.
 * 3. Pick randomly from the top `topFraction` (default 15 %) of farthest cells.
 *
 * This ensures the exit is always reachable, always far, but never in the exact
 * same corner every run.
 */
export function findDynamicExit(
  cells: boolean[][],
  start: Position,
  w: number,
  h: number,
  topFraction = 0.15,
): Position {
  const dist = bfsDistances(cells, start, w, h);

  // Collect all reachable floor cells (except the start itself)
  const reachable: Array<{ pos: Position; d: number }> = [];
  for (let k = 0; k < dist.length; k++) {
    const d = dist[k];
    if (d <= 0) continue; // unreachable or start
    const x = k % w, y = (k / w) | 0;
    if (!cells[y][x]) reachable.push({ pos: { x, y }, d });
  }

  if (reachable.length === 0) return { x: w - 2, y: h - 2 }; // safety fallback

  // Sort farthest-first
  reachable.sort((a, b) => b.d - a.d);

  // Pool: top N% but at least 3 candidates
  const poolSize = Math.max(3, Math.floor(reachable.length * topFraction));
  const pool = reachable.slice(0, poolSize);

  return pool[Math.floor(Math.random() * pool.length)].pos;
}

// ─── Reachability check ───────────────────────────────────────────────────────

/** Quick BFS reachability check — used to validate wall additions during shifts. */
export function isReachable(
  cells: boolean[][], from: Position, to: Position, w: number, h: number,
): boolean {
  if (cells[from.y][from.x] || cells[to.y][to.x]) return false;
  const dist = bfsDistances(cells, from, w, h);
  return dist[to.y * w + to.x] >= 0;
}

// ─── Maze mutation ────────────────────────────────────────────────────────────

/**
 * Mutate maze: open `mutationCount` walls + close `mutationCount` corridors.
 *
 * Safety rules (never violated):
 * - Never modify the player cell or its 8 Chebyshev neighbours.
 * - Never modify the exit cell.
 * - Every wall-addition is validated with BFS before committing.
 */
export function mutateMaze(
  cells: boolean[][],
  player: Position,
  exit: Position,
  w: number,
  h: number,
  mutationCount = 3,
): { newCells: boolean[][]; changed: FlashCell[] } {
  const newCells = cells.map(row => [...row]);
  const changed: FlashCell[] = [];
  const used = new Set<number>();

  const isProtected = (x: number, y: number) =>
    (x === exit.x && y === exit.y) ||
    Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) <= 1;

  const pick = (wantWall: boolean): Position | null => {
    for (let a = 0; a < 80; a++) {
      const x = 1 + Math.floor(Math.random() * (w - 2));
      const y = 1 + Math.floor(Math.random() * (h - 2));
      const k = y * w + x;
      if (!isProtected(x, y) && !used.has(k) && newCells[y][x] === wantWall)
        return { x, y };
    }
    return null;
  };

  // Open walls (remove) — always safe, improves connectivity
  for (let i = 0; i < mutationCount; i++) {
    const p = pick(true); if (!p) break;
    used.add(p.y * w + p.x);
    newCells[p.y][p.x] = false;
    changed.push({ x: p.x, y: p.y, alpha: 1, isWall: false });
  }

  // Close corridors (add walls) — BFS validate each one
  for (let i = 0; i < mutationCount; i++) {
    const p = pick(false); if (!p) break;
    const k = p.y * w + p.x;
    used.add(k);
    newCells[p.y][p.x] = true;
    if (isReachable(newCells, player, exit, w, h)) {
      changed.push({ x: p.x, y: p.y, alpha: 1, isWall: true });
    } else {
      newCells[p.y][p.x] = false; // revert — would trap player
    }
  }

  return { newCells, changed };
}
