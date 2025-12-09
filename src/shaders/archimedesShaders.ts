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
      tl_new_temp = bl_temp; tr_new_temp = br_temp; bl_new_temp = tl_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Left column: solid above liquid: [S, ?, L, ?] -> [L, ?, S, ?]
    if (!transitionApplied && isSolid(tl) && isLiquid(bl)) {
      tl_new = bl; bl_new = tl;
      tl_new_orig = bl_orig; bl_new_orig = tl_orig;
      tl_new_temp = bl_temp; bl_new_temp = tl_temp;
      transitionApplied = true;
    }

    // Right column: solid above liquid: [?, S, ?, L] -> [?, L, ?, S]
    if (!transitionApplied && isSolid(tr) && isLiquid(br)) {
      tr_new = br; br_new = tr;
      tr_new_orig = br_orig; br_new_orig = tr_orig;
      tr_new_temp = br_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Both columns: denser liquid above lighter liquid: [L1, L1, L2, L2] -> [L2, L2, L1, L1]
    // where density(L1) > density(L2), OR same density but bottom is hotter (hot rises)
    if (!transitionApplied && isLiquid(tl) && isLiquid(tr) && isLiquid(bl) && isLiquid(br)) {
      float topDensity = (computeEffectiveDensity(tl_orig, tl_temp) + computeEffectiveDensity(tr_orig, tr_temp)) * 0.5;
      float bottomDensity = (computeEffectiveDensity(bl_orig, bl_temp) + computeEffectiveDensity(br_orig, br_temp)) * 0.5;

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.25) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 1.0) {
        // Same density - check temperature from particle texture (hot fluid rises)
        float topTemp = (tl_temp + tr_temp) * 0.5;
        float bottomTemp = (bl_temp + br_temp) * 0.5;

        // Hot fluid rises - swap if bottom is significantly hotter
        if (bottomTemp > topTemp + 6.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
        tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
        tl_new_temp = bl_temp; tr_new_temp = br_temp; bl_new_temp = tl_temp; br_new_temp = tr_temp;
        transitionApplied = true;
      }
    }

    // Left column: denser liquid above lighter liquid: [L1, ?, L2, ?] -> [L2, ?, L1, ?]
    // OR same density but bottom is hotter (hot rises)
    if (!transitionApplied && isLiquid(tl) && isLiquid(bl)) {
      float topDensity = computeEffectiveDensity(tl_orig, tl_temp);
      float bottomDensity = computeEffectiveDensity(bl_orig, bl_temp);

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.25) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 1.0) {
        // Same density - check temperature from particle texture
        if (bl_temp > tl_temp + 6.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tl_new = bl; bl_new = tl;
        tl_new_orig = bl_orig; bl_new_orig = tl_orig;
        tl_new_temp = bl_temp; bl_new_temp = tl_temp;
        transitionApplied = true;
      }
    }

    // Right column: denser liquid above lighter liquid: [?, L1, ?, L2] -> [?, L2, ?, L1]
    // OR same density but bottom is hotter (hot rises)
    if (!transitionApplied && isLiquid(tr) && isLiquid(br)) {
      float topDensity = computeEffectiveDensity(tr_orig, tr_temp);
      float bottomDensity = computeEffectiveDensity(br_orig, br_temp);

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.25) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 1.0) {
        // Same density - check temperature from particle texture
        if (br_temp > tr_temp + 6.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tr_new = br; br_new = tr;
        tr_new_orig = br_orig; br_new_orig = tr_orig;
        tr_new_temp = br_temp; br_new_temp = tr_temp;
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
        tl_new_temp = isLiquid(tr) ? tr_temp : bl_temp; tr_new_temp = tl_temp; bl_new_temp = bl_temp; br_new_temp = br_temp;
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
        tl_new_temp = tr_temp; tr_new_temp = isLiquid(tl) ? tl_temp : br_temp; bl_new_temp = bl_temp; br_new_temp = br_temp;
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
        float movingDensity = computeEffectiveDensity(tr_orig, tr_temp);
        float destDensity = computeEffectiveDensity(tl_orig, tl_temp);
        if (movingDensity >= destDensity - 0.35) {
          canMoveLeft = true;
        }
      }
      if (canMoveLeft) {
        tl_new = tr; tr_new = tl; bl_new = bl; br_new = br;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        tl_new_temp = tr_temp; tr_new_temp = tl_temp; bl_new_temp = bl_temp; br_new_temp = br_temp;
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
        float movingDensity = computeEffectiveDensity(tl_orig, tl_temp);
        float destDensity = computeEffectiveDensity(tr_orig, tr_temp);
        if (movingDensity >= destDensity - 0.35) {
          canMoveRight = true;
        }
      }
      if (canMoveRight) {
        tl_new = tr; tr_new = tl; bl_new = bl; br_new = br;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
        tl_new_temp = tr_temp; tr_new_temp = tl_temp; bl_new_temp = bl_temp; br_new_temp = br_temp;
        transitionApplied = true;
      }
    }

    // GAS BUOYANCY TRANSITIONS
    // Gases rise through solids and liquids (very light, always float up)

    // Both columns have gas below solid: [S, S, G, G] -> [G, G, S, S]
    if (!transitionApplied && isSolid(tl) && isSolid(tr) && isGas(bl) && isGas(br)) {
      tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
      tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
      tl_new_temp = bl_temp; tr_new_temp = br_temp; bl_new_temp = tl_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Left column: gas below solid: [S, ?, G, ?] -> [G, ?, S, ?]
    if (!transitionApplied && isSolid(tl) && isGas(bl)) {
      tl_new = bl; bl_new = tl;
      tl_new_orig = bl_orig; bl_new_orig = tl_orig;
      tl_new_temp = bl_temp; bl_new_temp = tl_temp;
      transitionApplied = true;
    }

    // Right column: gas below solid: [?, S, ?, G] -> [?, G, ?, S]
    if (!transitionApplied && isSolid(tr) && isGas(br)) {
      tr_new = br; br_new = tr;
      tr_new_orig = br_orig; br_new_orig = tr_orig;
      tr_new_temp = br_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Both columns have gas below liquid: [L, L, G, G] -> [G, G, L, L]
    if (!transitionApplied && isLiquid(tl) && isLiquid(tr) && isGas(bl) && isGas(br)) {
      tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
      tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
      tl_new_temp = bl_temp; tr_new_temp = br_temp; bl_new_temp = tl_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Left column: gas below liquid: [L, ?, G, ?] -> [G, ?, L, ?]
    if (!transitionApplied && isLiquid(tl) && isGas(bl)) {
      tl_new = bl; bl_new = tl;
      tl_new_orig = bl_orig; bl_new_orig = tl_orig;
      tl_new_temp = bl_temp; bl_new_temp = tl_temp;
      transitionApplied = true;
    }

    // Right column: gas below liquid: [?, L, ?, G] -> [?, G, ?, L]
    if (!transitionApplied && isLiquid(tr) && isGas(br)) {
      tr_new = br; br_new = tr;
      tr_new_orig = br_orig; br_new_orig = tr_orig;
      tr_new_temp = br_temp; br_new_temp = tr_temp;
      transitionApplied = true;
    }

    // Gas density ordering: denser gas above lighter gas swaps
    // Both columns: [G1, G1, G2, G2] -> [G2, G2, G1, G1] where density(G1) > density(G2)
    // OR same density but bottom is hotter (hot rises)
    if (!transitionApplied && isGas(tl) && isGas(tr) && isGas(bl) && isGas(br)) {
      float topDensity = (computeEffectiveDensity(tl_orig, tl_temp) + computeEffectiveDensity(tr_orig, tr_temp)) * 0.5;
      float bottomDensity = (computeEffectiveDensity(bl_orig, bl_temp) + computeEffectiveDensity(br_orig, br_temp)) * 0.5;

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.05) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 0.1) {
        // Same density - check temperature from particle texture (hot gas rises)
        float topTemp = (tl_temp + tr_temp) * 0.5;
        float bottomTemp = (bl_temp + br_temp) * 0.5;

        if (bottomTemp > topTemp + 10.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tl_new = bl; tr_new = br; bl_new = tl; br_new = tr;
        tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = tr_orig;
        tl_new_temp = bl_temp; tr_new_temp = br_temp; bl_new_temp = tl_temp; br_new_temp = tr_temp;
        transitionApplied = true;
      }
    }

    // Left column: denser gas above lighter gas: [G1, ?, G2, ?] -> [G2, ?, G1, ?]
    // OR same density but bottom is hotter
    if (!transitionApplied && isGas(tl) && isGas(bl)) {
      float topDensity = computeEffectiveDensity(tl_orig, tl_temp);
      float bottomDensity = computeEffectiveDensity(bl_orig, bl_temp);

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.05) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 0.1) {
        // Check temperature from particle texture
        if (bl_temp > tl_temp + 10.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tl_new = bl; bl_new = tl;
        tl_new_orig = bl_orig; bl_new_orig = tl_orig;
        tl_new_temp = bl_temp; bl_new_temp = tl_temp;
        transitionApplied = true;
      }
    }

    // Right column: denser gas above lighter gas: [?, G1, ?, G2] -> [?, G2, ?, G1]
    // OR same density but bottom is hotter
    if (!transitionApplied && isGas(tr) && isGas(br)) {
      float topDensity = computeEffectiveDensity(tr_orig, tr_temp);
      float bottomDensity = computeEffectiveDensity(br_orig, br_temp);

      bool shouldSwap = false;
      if (topDensity > bottomDensity + 0.05) {
        shouldSwap = true;
      } else if (abs(topDensity - bottomDensity) < 0.1) {
        // Check temperature from particle texture
        if (br_temp > tr_temp + 10.0) {
          shouldSwap = true;
        }
      }

      if (shouldSwap) {
        tr_new = br; br_new = tr;
        tr_new_orig = br_orig; br_new_orig = tr_orig;
        tr_new_temp = br_temp; br_new_temp = tr_temp;
        transitionApplied = true;
      }
    }
`;

export const archimedesFragmentShader = createMargolusFragmentShader(archimedesTransitions);
