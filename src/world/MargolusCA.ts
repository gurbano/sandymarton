/**
 * Margolus Cellular Automata for Granular Media
 * Based on the paper: "Probabilistic Cellular Automata for Granular Media in Video Games"
 * by Jonathan Devlin and Micah D. Schuster (2020)
 *
 * Implements a modified Margolus neighborhood with probabilistic transitions
 * to simulate friction-like behavior in sand particles.
 */

export interface MargolusConfig {
  width: number;
  height: number;
  /** Probability for vertical stacking transitions (friction parameter) */
  toppleProbability: number;
}

export const CellState = {
  EMPTY: 0,
  SAND: 1,
  DIRT: 2,
  GRAVEL: 3,
  WATER: 4,
  LAVA: 5,
  STATIC: 100, // Immovable boundary (stone/walls)
} as const;

export type CellState = typeof CellState[keyof typeof CellState];

export function isMovable(state: CellState): boolean {
  return state > CellState.EMPTY && state < CellState.STATIC;
}

export function isSolid(state: CellState): boolean {
  return state === CellState.SAND || state === CellState.DIRT || state === CellState.GRAVEL;
}

export function isLiquid(state: CellState): boolean {
  return state === CellState.WATER || state === CellState.LAVA;
}

/**
 * Modified Margolus neighborhood cellular automaton
 *
 * The standard Margolus neighborhood uses 2x2 blocks that shift on alternate iterations.
 * This modified version uses a 4-iteration cycle to prevent directional bias:
 *
 * Iteration 1: Standard (0,0)
 * Iteration 2: Standard shifted (1,1)
 * Iteration 3: Modified (0,1)
 * Iteration 4: Modified (1,0)
 */
export class MargolusCA {
  private width: number;
  private height: number;
  private grid: Uint8Array; // Current state
  private nextGrid: Uint8Array; // Next state
  private iteration: number = 0;
  private toppleProbability: number;

  constructor(config: MargolusConfig) {
    this.width = config.width;
    this.height = config.height;
    this.toppleProbability = config.toppleProbability;

    // Initialize grids
    this.grid = new Uint8Array(this.width * this.height);
    this.nextGrid = new Uint8Array(this.width * this.height);
    this.grid.fill(CellState.EMPTY);
    this.nextGrid.fill(CellState.EMPTY);
  }

  /**
   * Get cell state at position
   */
  getCell(x: number, y: number): CellState {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return CellState.STATIC; // Treat out of bounds as static
    }
    return this.grid[y * this.width + x] as CellState;
  }

  /**
   * Set cell state at position
   */
  setCell(x: number, y: number, state: CellState): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    this.grid[y * this.width + x] = state;
  }

  /**
   * Get the entire grid data
   */
  getGrid(): Uint8Array {
    return this.grid;
  }

  /**
   * Set the topple probability (friction parameter)
   */
  setToppleProbability(p: number): void {
    this.toppleProbability = Math.max(0, Math.min(1, p));
  }

  /**
   * Update one step of the simulation
   */
  step(): void {
    // Copy current grid to next grid
    this.nextGrid.set(this.grid);

    // Determine block offset based on iteration number (4-cycle)
    const offsetX = this.iteration % 2;
    const offsetY = Math.floor(this.iteration / 2) % 2;

    // Process all 2x2 blocks with current offset
    for (let y = offsetY; y < this.height - 1; y += 2) {
      for (let x = offsetX; x < this.width - 1; x += 2) {
        this.processBlock(x, y);
      }
    }

    // Swap grids
    const temp = this.grid;
    this.grid = this.nextGrid;
    this.nextGrid = temp;

    // Increment iteration counter
    this.iteration = (this.iteration + 1) % 4;
  }

  /**
   * Process a single 2x2 Margolus block
   * Applies the transitions from Figure 2 in the paper
   */
  private processBlock(x: number, y: number): void {
    // Read the 2x2 block (clockwise from top-left)
    const tl = this.getCell(x, y);         // Top-left
    const tr = this.getCell(x + 1, y);     // Top-right
    const br = this.getCell(x + 1, y + 1); // Bottom-right
    const bl = this.getCell(x, y + 1);     // Bottom-left

    // Don't modify blocks containing static cells
    if (tl === CellState.STATIC || tr === CellState.STATIC ||
        br === CellState.STATIC || bl === CellState.STATIC) {
      return;
    }

    // Helper functions for readability
    const isEmpty = (c: CellState) => c === CellState.EMPTY;
    const isMovable = (c: CellState) => c > CellState.EMPTY && c < CellState.STATIC;

    // Apply transitions based on the patterns from Figure 2
    // Format: [tl, tr, br, bl] -> [tl', tr', br', bl']

    // Transition (a): Particle falls straight down
    // [1, 0, 0, 0] -> [0, 0, 0, 1]
    if (isMovable(tl) && isEmpty(tr) &&
        isEmpty(br) && isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, CellState.EMPTY, CellState.EMPTY, tl);
      return;
    }

    // Transition (b): Particle falls straight down (right side)
    // [0, 1, 0, 0] -> [0, 0, 1, 0]
    if (isEmpty(tl) && isMovable(tr) &&
        isEmpty(br) && isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, CellState.EMPTY, tr, CellState.EMPTY);
      return;
    }

    // Transition (c): Two particles fall straight down
    // [1, 1, 0, 0] -> [0, 0, 1, 1]
    if (isMovable(tl) && isMovable(tr) &&
        isEmpty(br) && isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, CellState.EMPTY, tr, tl);
      return;
    }

    // Transition (d): Horizontal pair rotates down
    // [1, 1, 1, 0] -> [0, 1, 1, 1]
    if (isMovable(tl) && isMovable(tr) &&
        isMovable(br) && isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, tr, br, tl);
      return;
    }

    // Transition (e): Full stack slides left
    // [1, 1, 1, 1] -> [1, 1, 1, 1] (no change - stable)
    // This is implicitly handled by doing nothing

    // Transition (f): Particle topples right
    // [0, 1, 1, 0] -> [0, 0, 1, 1]
    if (isEmpty(tl) && isMovable(tr) &&
        isMovable(br) && isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, CellState.EMPTY, br, tr);
      return;
    }

    // Transition (g): Particle topples left
    // [1, 0, 0, 1] -> [1, 1, 0, 0]
    if (isMovable(tl) && isEmpty(tr) &&
        isEmpty(br) && isMovable(bl)) {
      this.setNextBlock(x, y, tl, bl, CellState.EMPTY, CellState.EMPTY);
      return;
    }

    // Transition (h): Three-quarter stack topples
    // [1, 1, 0, 1] -> [1, 1, 1, 0]
    if (isMovable(tl) && isMovable(tr) &&
        isEmpty(br) && isMovable(bl)) {
      this.setNextBlock(x, y, tl, tr, bl, CellState.EMPTY);
      return;
    }

    // PROBABILISTIC TRANSITIONS
    // These represent friction-like behavior

    // Transition (i): Vertical stack topples right (PROBABILISTIC)
    // [0, 1, 0, 1] -> [0, 0, 1, 1] with probability p
    if (isEmpty(tl) && isMovable(tr) &&
        isEmpty(br) && isMovable(bl)) {
      if (Math.random() < this.toppleProbability) {
        this.setNextBlock(x, y, CellState.EMPTY, CellState.EMPTY, bl, tr);
      }
      return;
    }

    // Transition (j): Vertical stack topples left (PROBABILISTIC)
    // [1, 0, 1, 0] -> [1, 1, 0, 0] with probability p
    if (isMovable(tl) && isEmpty(tr) &&
        isMovable(br) && isEmpty(bl)) {
      if (Math.random() < this.toppleProbability) {
        this.setNextBlock(x, y, tl, br, CellState.EMPTY, CellState.EMPTY);
      }
      return;
    }

    // LIQUID-SPECIFIC TRANSITIONS
    // Liquids spread horizontally ONLY when resting on solid ground
    // These have lower priority than all vertical/diagonal movements

    // Liquid horizontal spread right when both liquids are resting
    // [0, L, S, S] -> [L, 0, S, S] (liquid spreads left on platform)
    if (isEmpty(tl) && isLiquid(tr) &&
        !isEmpty(br) && !isEmpty(bl)) {
      this.setNextBlock(x, y, tr, CellState.EMPTY, br, bl);
      return;
    }

    // Liquid horizontal spread left when both liquids are resting
    // [L, 0, S, S] -> [0, L, S, S] (liquid spreads right on platform)
    if (isLiquid(tl) && isEmpty(tr) &&
        !isEmpty(br) && !isEmpty(bl)) {
      this.setNextBlock(x, y, CellState.EMPTY, tl, br, bl);
      return;
    }

    // No transition matches - block stays the same (already copied)
  }

  /**
   * Set the next state of a 2x2 block
   */
  private setNextBlock(x: number, y: number, tl: CellState, tr: CellState, br: CellState, bl: CellState): void {
    this.nextGrid[y * this.width + x] = tl;
    this.nextGrid[y * this.width + (x + 1)] = tr;
    this.nextGrid[(y + 1) * this.width + (x + 1)] = br;
    this.nextGrid[(y + 1) * this.width + x] = bl;
  }

  /**
   * Clear the grid to empty state
   */
  clear(): void {
    this.grid.fill(CellState.EMPTY);
    this.nextGrid.fill(CellState.EMPTY);
    this.iteration = 0;
  }

  /**
   * Create an hourglass shape with static boundaries
   */
  createHourglass(centerX: number, centerY: number, width: number, height: number): void {
    const halfWidth = Math.floor(width / 2);
    const halfHeight = Math.floor(height / 2);
    const neckWidth = Math.floor(width / 8); // Narrow neck in the middle

    // Draw the hourglass outline
    for (let dy = -halfHeight; dy <= halfHeight; dy++) {
      const y = centerY + dy;
      if (y < 0 || y >= this.height) continue;

      // Calculate width at this height
      // Hourglass shape: wider at top and bottom, narrow in middle
      const normalizedY = Math.abs(dy) / halfHeight; // 0 at center, 1 at edges
      const currentWidth = neckWidth + (halfWidth - neckWidth) * normalizedY;

      // Draw left and right walls
      const leftX = Math.floor(centerX - currentWidth);
      const rightX = Math.floor(centerX + currentWidth);

      if (leftX >= 0 && leftX < this.width) {
        this.setCell(leftX, y, CellState.STATIC);
      }
      if (rightX >= 0 && rightX < this.width) {
        this.setCell(rightX, y, CellState.STATIC);
      }
    }

    // Fill in the walls more solidly (make them thicker)
    for (let dy = -halfHeight; dy <= halfHeight; dy++) {
      const y = centerY + dy;
      if (y < 0 || y >= this.height) continue;

      const normalizedY = Math.abs(dy) / halfHeight;
      const currentWidth = neckWidth + (halfWidth - neckWidth) * normalizedY;

      const leftX = Math.floor(centerX - currentWidth);
      const rightX = Math.floor(centerX + currentWidth);

      // Make walls 2 pixels thick
      for (let thickness = 0; thickness < 2; thickness++) {
        if (leftX - thickness >= 0) {
          this.setCell(leftX - thickness, y, CellState.STATIC);
        }
        if (rightX + thickness < this.width) {
          this.setCell(rightX + thickness, y, CellState.STATIC);
        }
      }
    }
  }

  /**
   * Add sand particles in a region (for the hourglass source)
   */
  addSandSource(x: number, y: number, width: number, height: number, density: number = 1.0, particleType: CellState = CellState.SAND): void {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.width && py >= 0 && py < this.height) {
          if (Math.random() < density && this.getCell(px, py) === CellState.EMPTY) {
            this.setCell(px, py, particleType);
          }
        }
      }
    }
  }
}
