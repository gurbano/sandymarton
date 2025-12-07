/**
 * Archimedes shader for buoyancy and fluid displacement behavior
 * Uses the Margolus Cellular Automata framework
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export const archimedesVertexShader = margolusVertexShader;

const archimedesTransitions = `
    // ARCHIMEDES PRINCIPLE TRANSITIONS
    // Solids sink through liquids, liquids rise through solids (buoyancy)
    // Denser liquids sink below lighter liquids

    // Both columns have solid above liquid: [S, S, L, L] -> [L, L, S, S]
    if (!transitionApplied && isSolid(tl) && isSolid(tr) && isLiquid(bl) && isLiquid(br)) {
      tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
      tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
      transitionApplied = true;
    }

    // Left column: solid above liquid: [S, ?, L, ?] -> [L, ?, S, ?]
    if (!transitionApplied && isSolid(tl) && isLiquid(bl)) {
      tl_new = bl; bl_new = tl;
      tl_new_orig = bl_orig; bl_new_orig = tl_orig;
      transitionApplied = true;
    }

    // Right column: solid above liquid: [?, S, ?, L] -> [?, L, ?, S]
    if (!transitionApplied && isSolid(tr) && isLiquid(br)) {
      tr_new = br; br_new = tr;
      tr_new_orig = br_orig; br_new_orig = tr_orig;
      transitionApplied = true;
    }

    // Both columns: denser liquid above lighter liquid: [L1, L1, L2, L2] -> [L2, L2, L1, L1]
    // where density(L1) > density(L2)
    if (!transitionApplied && isLiquid(tl) && isLiquid(tr) && isLiquid(bl) && isLiquid(br)) {
      float topDensity = (getMaterialDensity(tl_orig) + getMaterialDensity(tr_orig)) * 0.5;
      float bottomDensity = (getMaterialDensity(bl_orig) + getMaterialDensity(br_orig)) * 0.5;
      if (topDensity > bottomDensity) {
        tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
        tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
        transitionApplied = true;
      }
    }

    // Left column: denser liquid above lighter liquid: [L1, ?, L2, ?] -> [L2, ?, L1, ?]
    if (!transitionApplied && isLiquid(tl) && isLiquid(bl)) {
      float topDensity = getMaterialDensity(tl_orig);
      float bottomDensity = getMaterialDensity(bl_orig);
      if (topDensity > bottomDensity) {
        tl_new = bl; bl_new = tl;
        tl_new_orig = bl_orig; bl_new_orig = tl_orig;
        transitionApplied = true;
      }
    }

    // Right column: denser liquid above lighter liquid: [?, L1, ?, L2] -> [?, L2, ?, L1]
    if (!transitionApplied && isLiquid(tr) && isLiquid(br)) {
      float topDensity = getMaterialDensity(tr_orig);
      float bottomDensity = getMaterialDensity(br_orig);
      if (topDensity > bottomDensity) {
        tr_new = br; br_new = tr;
        tr_new_orig = br_orig; br_new_orig = tr_orig;
        transitionApplied = true;
      }
    }

    // Topple right through liquid: [S, E/L, L, E/L] -> [E/L, S, L, E/L]
    // Solid on left resting on liquid, topples right with friction
    if (!transitionApplied && isSolid(tl) && !isSolid(tr) && isLiquid(bl) && !isSolid(br)) {
      // Use average friction of the two particles involved, amplified by global parameter
      float baseFriction = (getMaterialFriction(tl_orig) + getMaterialFriction(bl_orig)) * 0.5;
      float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
      float rand = random(blockStart, uRandomSeed);
      if (rand < toppleProbability) {
        tl_new = isLiquid(tr) ? tr : bl; tr_new = tl; bl_new = bl; br_new = br;
        tl_new_orig = isLiquid(tr) ? tr_orig : bl_orig; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        transitionApplied = true;
      }
    }

    // Topple left through liquid: [E/L, S, E/L, L] -> [S, E/L, E/L, L]
    // Solid on right resting on liquid, topples left with friction
    if (!transitionApplied && !isSolid(tl) && isSolid(tr) && !isSolid(bl) && isLiquid(br)) {
      // Use average friction of the two particles involved, amplified by global parameter
      float baseFriction = (getMaterialFriction(tr_orig) + getMaterialFriction(br_orig)) * 0.5;
      float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
      float rand = random(blockStart, uRandomSeed + 1.0);
      if (rand < toppleProbability) {
        tl_new = tr; tr_new = isLiquid(tl) ? tl : br; bl_new = bl; br_new = br;
        tl_new_orig = tr_orig; tr_new_orig = isLiquid(tl) ? tl_orig : br_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        transitionApplied = true;
      }
    }

    // Liquid horizontal leveling: [E/L, L1, ?, L2] -> [L1, E/L, ?, L2]
    // L1 can move left only if: tl is empty OR tl is liquid with density <= L1's density
    if (!transitionApplied && isLiquid(tr) && isLiquid(br)) {
      bool canMoveLeft = false;
      if (tl == INTERNAL_EMPTY) {
        canMoveLeft = true;
      } else if (isLiquid(tl)) {
        float movingDensity = getMaterialDensity(tr_orig);
        float destDensity = getMaterialDensity(tl_orig);
        if (movingDensity >= destDensity) {
          canMoveLeft = true;
        }
      }
      if (canMoveLeft) {
        tl_new = tr; tr_new = tl; bl_new = bl; br_new = br;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        transitionApplied = true;
      }
    }

    // Liquid horizontal leveling: [L1, E/L, L2, ?] -> [E/L, L1, L2, ?]
    // L1 can move right only if: tr is empty OR tr is liquid with density <= L1's density
    if (!transitionApplied && isLiquid(tl) && isLiquid(bl)) {
      bool canMoveRight = false;
      if (tr == INTERNAL_EMPTY) {
        canMoveRight = true;
      } else if (isLiquid(tr)) {
        float movingDensity = getMaterialDensity(tl_orig);
        float destDensity = getMaterialDensity(tr_orig);
        if (movingDensity >= destDensity) {
          canMoveRight = true;
        }
      }
      if (canMoveRight) {
        tl_new = tr; tr_new = tl; bl_new = bl; br_new = br;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        transitionApplied = true;
      }
    }
`;

export const archimedesFragmentShader = createMargolusFragmentShader(archimedesTransitions);
