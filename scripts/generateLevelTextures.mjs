/**
 * Generate example level textures
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORLD_SIZE = 2048;

// Particle types (must match src/world/ParticleTypes.ts)
const EMPTY_TYPE = 0;
const STONE_TYPE = 17;
const SAND_TYPE = 35;
const DIRT_TYPE = 37;
const GRAVEL_TYPE = 39;
const WATER_TYPE = 65;
const LAVA_TYPE = 80;
const SLIME_TYPE = 96;
const ACID_TYPE = 97;

/**
 * Generate empty level - all particles are EMPTY_TYPE
 */
function generateEmptyLevel() {
  const canvas = createCanvas(WORLD_SIZE, WORLD_SIZE);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(WORLD_SIZE, WORLD_SIZE);

  // Fill with empty particles
  for (let i = 0; i < WORLD_SIZE * WORLD_SIZE; i++) {
    const offset = i * 4;
    imageData.data[offset] = EMPTY_TYPE;     // R: Particle type
    imageData.data[offset + 1] = 128;        // G: Velocity X (0)
    imageData.data[offset + 2] = 128;        // B: Velocity Y (0)
    imageData.data[offset + 3] = 255;        // A: Unused (opaque)
  }

  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(__dirname, '../public/levels/empty/particles.png');
  writeFileSync(outputPath, buffer);
  console.log('Generated: public/levels/empty/particles.png');
}

/**
 * Generate sandbox level - pools for liquids, platforms for solids, scattered shapes
 */
function generateSandboxLevel() {
  const canvas = createCanvas(WORLD_SIZE, WORLD_SIZE);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(WORLD_SIZE, WORLD_SIZE);

  // Helper to set a pixel
  const setPixel = (x, y, type) => {
    if (x < 0 || x >= WORLD_SIZE || y < 0 || y >= WORLD_SIZE) return;
    const offset = (y * WORLD_SIZE + x) * 4;
    imageData.data[offset] = type;
    imageData.data[offset + 1] = 128; // Velocity X = 0
    imageData.data[offset + 2] = 128; // Velocity Y = 0
    imageData.data[offset + 3] = 255; // Alpha = 255
  };

  // Helper to fill a rectangle
  const fillRect = (x1, y1, width, height, type) => {
    for (let y = y1; y < y1 + height; y++) {
      for (let x = x1; x < x1 + width; x++) {
        setPixel(x, y, type);
      }
    }
  };

  // Helper to draw a hollow rectangle (border only)
  const strokeRect = (x1, y1, width, height, thickness, type) => {
    // Top and bottom
    fillRect(x1, y1, width, thickness, type);
    fillRect(x1, y1 + height - thickness, width, thickness, type);
    // Left and right
    fillRect(x1, y1, thickness, height, type);
    fillRect(x1 + width - thickness, y1, thickness, height, type);
  };

  // Helper to draw an open-top pool (bottom, left, right walls - top is open)
  // Note: Y=0 is at bottom of screen, so y1 is bottom and y1+height is top
  const drawOpenPool = (x1, y1, width, height, thickness, type) => {
    // Bottom wall at y1 (to hold liquid)
    fillRect(x1, y1, width, thickness, type);
    // Left and right walls
    fillRect(x1, y1, thickness, height, type);
    fillRect(x1 + width - thickness, y1, thickness, height, type);
    // No top wall at y1+height - particles can fall in
  };

  // Fill with empty particles
  fillRect(0, 0, WORLD_SIZE, WORLD_SIZE, EMPTY_TYPE);

  // Thick stone border (20 pixels)
  const borderThickness = 20;
  strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE, borderThickness, STONE_TYPE);

  const margin = borderThickness + 10;

  // LIQUID POOLS (top section - open top)
  const poolWidth = 350;
  const poolHeight = 400;
  const poolWallThickness = 10;
  const poolSpacing = 100;
  const poolY = WORLD_SIZE - margin - poolHeight; // Position at top of screen (Y=0 is bottom)

  // Pool 1: Water
  let poolX = margin;
  drawOpenPool(poolX, poolY, poolWidth, poolHeight, poolWallThickness, STONE_TYPE);
  // Fill liquid from bottom, leaving some empty space at top for overflow
  const liquidFillHeight = poolHeight - poolWallThickness - 50;
  fillRect(poolX + poolWallThickness, poolY + poolWallThickness,
           poolWidth - 2 * poolWallThickness, liquidFillHeight, WATER_TYPE);

  // Pool 2: Lava
  poolX += poolWidth + poolSpacing;
  drawOpenPool(poolX, poolY, poolWidth, poolHeight, poolWallThickness, STONE_TYPE);
  fillRect(poolX + poolWallThickness, poolY + poolWallThickness,
           poolWidth - 2 * poolWallThickness, liquidFillHeight, LAVA_TYPE);

  // Pool 3: Slime
  poolX += poolWidth + poolSpacing;
  drawOpenPool(poolX, poolY, poolWidth, poolHeight, poolWallThickness, STONE_TYPE);
  fillRect(poolX + poolWallThickness, poolY + poolWallThickness,
           poolWidth - 2 * poolWallThickness, liquidFillHeight, SLIME_TYPE);

  // Pool 4: Acid
  poolX += poolWidth + poolSpacing;
  drawOpenPool(poolX, poolY, poolWidth, poolHeight, poolWallThickness, STONE_TYPE);
  fillRect(poolX + poolWallThickness, poolY + poolWallThickness,
           poolWidth - 2 * poolWallThickness, liquidFillHeight, ACID_TYPE);

  // SOLID PLATFORMS (middle section - below pools)
  const platformY = poolY - 300;
  const platformWidth = 400;
  const platformBaseHeight = 30;
  const platformMaterialHeight = 100;

  // Platform 1: Sand
  let platformX = margin + 200;
  fillRect(platformX, platformY, platformWidth, platformBaseHeight, STONE_TYPE);
  fillRect(platformX, platformY + platformBaseHeight, platformWidth, platformMaterialHeight, SAND_TYPE);

  // Platform 2: Dirt
  platformX += platformWidth + 200;
  fillRect(platformX, platformY, platformWidth, platformBaseHeight, STONE_TYPE);
  fillRect(platformX, platformY + platformBaseHeight, platformWidth, platformMaterialHeight, DIRT_TYPE);

  // Platform 3: Gravel
  platformX += platformWidth + 200;
  fillRect(platformX, platformY, platformWidth, platformBaseHeight, STONE_TYPE);
  fillRect(platformX, platformY + platformBaseHeight, platformWidth, platformMaterialHeight, GRAVEL_TYPE);

  // SCATTERED SHAPES (lower section - below platforms)
  const shapesY = platformY - 350;

  // Pyramid of sand
  const pyramidSize = 80;
  for (let i = 0; i < pyramidSize; i++) {
    fillRect(margin + 300 - i / 2, shapesY + i, i, 1, SAND_TYPE);
  }

  // Stone tower
  fillRect(margin + 600, shapesY - 100, 40, 250, STONE_TYPE);
  fillRect(margin + 580, shapesY - 120, 80, 20, STONE_TYPE); // Top cap

  // Dirt mound
  const moundX = margin + 900;
  for (let i = 0; i < 60; i++) {
    const width = 120 - i * 2;
    fillRect(moundX - width / 2, shapesY + i, width, 1, DIRT_TYPE);
  }

  // Stone box
  strokeRect(margin + 1200, shapesY - 50, 100, 100, 15, STONE_TYPE);

  // Scattered stone blocks
  fillRect(margin + 100, shapesY + 100, 50, 50, STONE_TYPE);
  fillRect(margin + 1400, shapesY - 20, 60, 60, STONE_TYPE);
  fillRect(margin + 1600, shapesY + 80, 40, 40, STONE_TYPE);

  // Some floating platforms (stone) - positioned between pools and platforms
  const floatingY = poolY - 150;
  fillRect(margin + 400, floatingY, 200, 20, STONE_TYPE);
  fillRect(margin + 800, floatingY - 100, 200, 20, STONE_TYPE);
  fillRect(margin + 1200, floatingY - 50, 200, 20, STONE_TYPE);

  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  const outputPath = join(__dirname, '../public/levels/sandbox/particles.png');
  writeFileSync(outputPath, buffer);
  console.log('Generated: public/levels/sandbox/particles.png');
}

// Generate both levels
generateEmptyLevel();
generateSandboxLevel();

console.log('\nLevel textures generated successfully!');
