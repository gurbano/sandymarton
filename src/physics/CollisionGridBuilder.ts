/**
 * CollisionGridBuilder - Converts world texture to physics collision geometry
 *
 * Creates optimized collision rectangles from the world texture using greedy meshing.
 * Static materials (16-32) and solid materials (33-63) become colliders.
 */

// Material type ranges (from ParticleTypeConstants)
const STATIC_MIN = 16;
const STATIC_MAX = 32;
const SOLID_MIN = 33;
const SOLID_MAX = 63;

export interface CollisionCell {
  x: number;
  y: number;
}

export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if a material type should be a collider
 */
function isCollisionMaterial(type: number): boolean {
  return (type >= STATIC_MIN && type <= STATIC_MAX) ||
         (type >= SOLID_MIN && type <= SOLID_MAX);
}

/**
 * Sample the world texture at a cell and determine if it's mostly solid
 */
function isCellSolid(
  worldData: Uint8Array,
  worldWidth: number,
  cellX: number,
  cellY: number,
  cellSize: number
): boolean {
  // Sample multiple points in the cell for accuracy
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
    [0.5, 0.5],
  ];

  let solidCount = 0;

  for (const [sx, sy] of samples) {
    const wx = Math.floor(cellX + cellSize * sx);
    const wy = Math.floor(cellY + cellSize * sy);
    const idx = (wy * worldWidth + wx) * 4;
    const type = worldData[idx];

    if (isCollisionMaterial(type)) {
      solidCount++;
    }
  }

  // Cell is solid if majority of samples are static
  return solidCount >= 3;
}

/**
 * Build collision grid from world texture data (unoptimized - returns individual cells)
 */
export function buildCollisionGrid(
  worldData: Uint8Array,
  width: number,
  height: number,
  cellSize: number
): CollisionCell[] {
  const cells: CollisionCell[] = [];
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const cellX = gx * cellSize;
      const cellY = gy * cellSize;

      if (isCellSolid(worldData, width, cellX, cellY, cellSize)) {
        cells.push({ x: cellX, y: cellY });
      }
    }
  }

  return cells;
}

/**
 * Build optimized collision rectangles using greedy meshing
 * Merges adjacent solid cells into larger rectangles to reduce collider count
 *
 * @param worldData - Raw RGBA pixel data from world texture
 * @param width - World texture width
 * @param height - World texture height
 * @param cellSize - Size of each collision cell in pixels
 * @returns Array of merged collision rectangles
 */
export function buildCollisionRects(
  worldData: Uint8Array,
  width: number,
  height: number,
  cellSize: number
): CollisionRect[] {
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);

  // Build solid grid
  const solid: boolean[][] = [];
  for (let gy = 0; gy < gridH; gy++) {
    solid[gy] = [];
    for (let gx = 0; gx < gridW; gx++) {
      const cellX = gx * cellSize;
      const cellY = gy * cellSize;
      solid[gy][gx] = isCellSolid(worldData, width, cellX, cellY, cellSize);
    }
  }

  // Track visited cells
  const visited: boolean[][] = [];
  for (let gy = 0; gy < gridH; gy++) {
    visited[gy] = new Array(gridW).fill(false);
  }

  const rects: CollisionRect[] = [];

  // Greedy meshing: scan row by row
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      // Skip if not solid or already visited
      if (!solid[gy][gx] || visited[gy][gx]) continue;

      // Find maximum width of horizontal run
      let rectWidth = 1;
      while (gx + rectWidth < gridW &&
             solid[gy][gx + rectWidth] &&
             !visited[gy][gx + rectWidth]) {
        rectWidth++;
      }

      // Find maximum height while maintaining width
      let rectHeight = 1;
      let canExtend = true;
      while (canExtend && gy + rectHeight < gridH) {
        // Check if entire row at this height matches
        for (let dx = 0; dx < rectWidth; dx++) {
          if (!solid[gy + rectHeight][gx + dx] || visited[gy + rectHeight][gx + dx]) {
            canExtend = false;
            break;
          }
        }
        if (canExtend) {
          rectHeight++;
        }
      }

      // Mark all cells in rectangle as visited
      for (let dy = 0; dy < rectHeight; dy++) {
        for (let dx = 0; dx < rectWidth; dx++) {
          visited[gy + dy][gx + dx] = true;
        }
      }

      // Add merged rectangle
      rects.push({
        x: gx * cellSize,
        y: gy * cellSize,
        width: rectWidth * cellSize,
        height: rectHeight * cellSize,
      });
    }
  }

  return rects;
}

/**
 * Merge adjacent collision cells into larger rectangles for efficiency
 * @deprecated Use buildCollisionRects instead for better performance
 */
export function mergeAdjacentCells(
  cells: CollisionCell[],
  _cellSize: number
): CollisionCell[] {
  return cells;
}

/**
 * Build a heightmap-style collision from world texture
 * Faster but less accurate - only tracks top surface
 *
 * @param worldData - Raw RGBA pixel data
 * @param width - World width
 * @param height - World height
 * @returns Array of heights per column (y position of first solid from top)
 */
export function buildHeightmap(
  worldData: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const heightmap = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    // Scan from top to bottom
    for (let y = height - 1; y >= 0; y--) {
      const idx = (y * width + x) * 4;
      const type = worldData[idx];

      if (isCollisionMaterial(type)) {
        heightmap[x] = y;
        break;
      }
    }
  }

  return heightmap;
}
