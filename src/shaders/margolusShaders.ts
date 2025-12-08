/**
 * GPU-accelerated Margolus Cellular Automata shaders
 * Implements the algorithm from "Probabilistic Cellular Automata for Granular Media in Video Games"
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export { margolusVertexShader };

const margolusTransitions = `
    // Randomize transition (a) vs (b) priority to eliminate directional bias
    float abPriority = random(blockStart, uRandomSeed + 10.0);

    // Transition (a): [1,0,0,0] -> [0,0,0,1]
    // Transition (b): [0,1,0,0] -> [0,0,1,0]
    // Check in random order based on block position
    if (abPriority < 0.5) {
      // Check (a) first, then (b)
      if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tl;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tl_orig;
        transitionApplied = true;
      }
      if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tr;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tr_orig;
        transitionApplied = true;
      }
    } else {
      // Check (b) first, then (a)
      if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tr;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tr_orig;
        transitionApplied = true;
      }
      if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tl;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tl_orig;
        transitionApplied = true;
      }
    }

    // Transition (c): [1,1,0,0] -> [0,0,1,1]
    // Add randomness to which particle goes where
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
      float randSwap = random(blockStart, uRandomSeed + 2.0);
      if (randSwap < 0.5) {
        // Original: tr->bl, tl->br
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = tr; br_new = tl;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = tr_orig; br_new_orig = tl_orig;
      } else {
        // Swapped: tl->bl, tr->br
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = tl; br_new = tr;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = tl_orig; br_new_orig = tr_orig;
      }
      transitionApplied = true;
    }

    // Transition (d): [1,1,1,0] -> [0,1,1,1]
    // Add randomness to which top particle falls into the gap
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && isMovable(bl) && br == INTERNAL_EMPTY) {
      float randSwap = random(blockStart, uRandomSeed + 3.0);
      if (randSwap < 0.5) {
        // Original: tl falls to br
        tl_new = INTERNAL_EMPTY; tr_new = tr; bl_new = bl; br_new = tl;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = tr_orig; bl_new_orig = bl_orig; br_new_orig = tl_orig;
      } else {
        // Swapped: tr falls to br
        tl_new = tl; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = tr;
        tl_new_orig = tl_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = tr_orig;
      }
      transitionApplied = true;
    }

    // Transition (f): [0,1,1,0] -> [0,0,1,1]
    // Add randomness to the arrangement when both fall
    if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && isMovable(bl) && br == INTERNAL_EMPTY) {
      float randSwap = random(blockStart, uRandomSeed + 4.0);
      if (randSwap < 0.5) {
        // Original: tr->br, bl->bl
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = tr;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = tr_orig;
      } else {
        // Swapped: tr->bl, bl->br
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = tr; br_new = bl;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = tr_orig; br_new_orig = bl_orig;
      }
      transitionApplied = true;
    }

    // Transition (g): [1,0,0,1] -> [1,1,0,0] or [0,1,1,0] (randomize left vs right)
    // Add randomness to eliminate left-right bias
    if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isMovable(br)) {
      float randSide = random(blockStart, uRandomSeed + 5.0);
      if (randSide < 0.5) {
        // Original: particles stay on their sides (tl->tl, br->tr)
        tl_new = tl; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = tl_orig; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
      } else {
        // Mirrored: particles swap sides (tl->tr, br->bl)
        tl_new = INTERNAL_EMPTY; tr_new = tl; bl_new = br; br_new = INTERNAL_EMPTY;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = EMPTY_TYPE;
      }
      transitionApplied = true;
    }

    // Transition (h): [1,1,0,1] -> [1,1,1,0]
    // Add randomness to which particle moves down
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && bl == INTERNAL_EMPTY && isMovable(br)) {
      float randChoice = random(blockStart, uRandomSeed + 6.0);
      if (randChoice < 0.5) {
        // Original: br moves to bl
        tl_new = tl; tr_new = tr; bl_new = br; br_new = INTERNAL_EMPTY;
        tl_new_orig = tl_orig; tr_new_orig = tr_orig; bl_new_orig = br_orig; br_new_orig = EMPTY_TYPE;
      } else {
        // Alternative: tl moves to bl
        tl_new = INTERNAL_EMPTY; tr_new = tr; bl_new = tl; br_new = br;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = tr_orig; bl_new_orig = tl_orig; br_new_orig = br_orig;
      }
      transitionApplied = true;
    }

    // PROBABILISTIC TRANSITIONS
    // Use material-specific friction for topple probability
    // Solids can topple into empty OR liquid spaces (handled by Archimedes for swapping)

    // Randomize transition (i) vs (j) priority to eliminate directional bias
    float ijPriority = random(blockStart, uRandomSeed + 11.0);

    // Transition (i): [E/L,S,E/L,S] -> [E/L,E/L,S,S] with probability p
    // Transition (j): [S,E/L,S,E/L] -> [S,S,E/L,E/L] with probability p
    // Check in random order based on block position
    if (ijPriority < 0.5) {
      // Check (i) first, then (j)
      if (!transitionApplied && !isSolid(tl) && isSolid(tr) && !isSolid(bl) && isSolid(br)) {
        float baseFriction = (getMaterialFriction(tr_orig) + getMaterialFriction(br_orig)) * 0.5;
        float toppleProbability = pow(1.0 - baseFriction, uFrictionAmplifier);
        float rand = random(blockStart, uRandomSeed);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = br; br_new = tr;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = br_orig; br_new_orig = tr_orig;
          transitionApplied = true;
        }
      }
      if (!transitionApplied && isSolid(tl) && !isSolid(tr) && isSolid(bl) && !isSolid(br)) {
        float baseFriction = (getMaterialFriction(tl_orig) + getMaterialFriction(bl_orig)) * 0.5;
        float toppleProbability = pow(1.0 - baseFriction, uFrictionAmplifier);
        float rand = random(blockStart, uRandomSeed + 1.0);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = tr; br_new = br;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = tr_orig; br_new_orig = br_orig;
          transitionApplied = true;
        }
      }
    } else {
      // Check (j) first, then (i)
      if (!transitionApplied && isSolid(tl) && !isSolid(tr) && isSolid(bl) && !isSolid(br)) {
        float baseFriction = (getMaterialFriction(tl_orig) + getMaterialFriction(bl_orig)) * 0.5;
        float toppleProbability = pow(1.0 - baseFriction, uFrictionAmplifier);
        float rand = random(blockStart, uRandomSeed + 1.0);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = tr; br_new = br;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = tr_orig; br_new_orig = br_orig;
          transitionApplied = true;
        }
      }
      if (!transitionApplied && !isSolid(tl) && isSolid(tr) && !isSolid(bl) && isSolid(br)) {
        float baseFriction = (getMaterialFriction(tr_orig) + getMaterialFriction(br_orig)) * 0.5;
        float toppleProbability = pow(1.0 - baseFriction, uFrictionAmplifier);
        float rand = random(blockStart, uRandomSeed);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = br; br_new = tr;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = br_orig; br_new_orig = tr_orig;
          transitionApplied = true;
        }
      }
    }

    // GAS RISING TRANSITIONS
    // Gases rise upward (inverse of solid falling transitions)
    // Randomize left vs right gas priority to eliminate directional bias
    float gasLRPriority = random(blockStart, uRandomSeed + 20.0);

    // Single gas rises from bottom-left: [E, E, G, E] -> [G, E, E, E]
    // Single gas rises from bottom-right: [E, E, E, G] -> [E, G, E, E]
    if (gasLRPriority < 0.5) {
      // Check left first, then right
      if (!transitionApplied && tl == INTERNAL_EMPTY && tr == INTERNAL_EMPTY && isGas(bl) && br == INTERNAL_EMPTY) {
        tl_new = bl; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = bl_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
        transitionApplied = true;
      }
      if (!transitionApplied && tl == INTERNAL_EMPTY && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isGas(br)) {
        tl_new = INTERNAL_EMPTY; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
        transitionApplied = true;
      }
    } else {
      // Check right first, then left
      if (!transitionApplied && tl == INTERNAL_EMPTY && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isGas(br)) {
        tl_new = INTERNAL_EMPTY; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
        transitionApplied = true;
      }
      if (!transitionApplied && tl == INTERNAL_EMPTY && tr == INTERNAL_EMPTY && isGas(bl) && br == INTERNAL_EMPTY) {
        tl_new = bl; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = bl_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
        transitionApplied = true;
      }
    }

    // Two gases rise together: [E, E, G, G] -> [G, G, E, E]
    if (!transitionApplied && tl == INTERNAL_EMPTY && tr == INTERNAL_EMPTY && isGas(bl) && isGas(br)) {
      float randSwap = random(blockStart, uRandomSeed + 21.0);
      if (randSwap < 0.5) {
        // bl->tl, br->tr
        tl_new = bl; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = bl_orig; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
      } else {
        // bl->tr, br->tl (swap positions)
        tl_new = br; tr_new = bl; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = br_orig; tr_new_orig = bl_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
      }
      transitionApplied = true;
    }

    // Gas rises into gap above: [E, G, G, G] -> [G, E, G, G] or [G, G, E, G]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isGas(tr) && isGas(bl) && isGas(br)) {
      float randChoice = random(blockStart, uRandomSeed + 22.0);
      if (randChoice < 0.5) {
        // bl rises to tl
        tl_new = bl; tr_new = tr; bl_new = INTERNAL_EMPTY; br_new = br;
        tl_new_orig = bl_orig; tr_new_orig = tr_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = br_orig;
      } else {
        // br rises to tl
        tl_new = br; tr_new = tr; bl_new = bl; br_new = INTERNAL_EMPTY;
        tl_new_orig = br_orig; tr_new_orig = tr_orig; bl_new_orig = bl_orig; br_new_orig = EMPTY_TYPE;
      }
      transitionApplied = true;
    }

    // Gas rises into gap above (mirror): [G, E, G, G] -> [G, G, E, G] or [G, G, G, E]
    if (!transitionApplied && isGas(tl) && tr == INTERNAL_EMPTY && isGas(bl) && isGas(br)) {
      float randChoice = random(blockStart, uRandomSeed + 23.0);
      if (randChoice < 0.5) {
        // bl rises to tr
        tl_new = tl; tr_new = bl; bl_new = INTERNAL_EMPTY; br_new = br;
        tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = br_orig;
      } else {
        // br rises to tr
        tl_new = tl; tr_new = br; bl_new = bl; br_new = INTERNAL_EMPTY;
        tl_new_orig = tl_orig; tr_new_orig = br_orig; bl_new_orig = bl_orig; br_new_orig = EMPTY_TYPE;
      }
      transitionApplied = true;
    }

    // Gas diagonal rise: [G, E, E, G] -> [E, G, G, E] (similar to solid diagonal fall but inverted)
    if (!transitionApplied && isGas(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isGas(br)) {
      float randSide = random(blockStart, uRandomSeed + 24.0);
      if (randSide < 0.5) {
        // Gases rise on their sides
        tl_new = INTERNAL_EMPTY; tr_new = br; bl_new = tl; br_new = INTERNAL_EMPTY;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = br_orig; bl_new_orig = tl_orig; br_new_orig = EMPTY_TYPE;
      } else {
        // Gases cross over
        tl_new = INTERNAL_EMPTY; tr_new = tl; bl_new = br; br_new = INTERNAL_EMPTY;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = EMPTY_TYPE;
      }
      transitionApplied = true;
    }

    // GAS TOPPLING TRANSITIONS (inverse of solid toppling)
    // Gas columns spread horizontally when blocked, like solids topple when supported
    // Randomize left vs right priority to eliminate directional bias
    float gasTopplePriority = random(blockStart, uRandomSeed + 25.0);

    if (gasTopplePriority < 0.5) {
      // Check right topple first, then left
      // Gas topple right: [G, E, G, E] -> [E, G, E, G] (gas column on left spreads right)
      if (!transitionApplied && isGas(tl) && !isGas(tr) && isGas(bl) && !isGas(br)) {
        tl_new = tr; tr_new = tl; bl_new = br; br_new = bl;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = bl_orig;
        transitionApplied = true;
      }
      // Gas topple left: [E, G, E, G] -> [G, E, G, E] (gas column on right spreads left)
      if (!transitionApplied && !isGas(tl) && isGas(tr) && !isGas(bl) && isGas(br)) {
        tl_new = tr; tr_new = tl; bl_new = br; br_new = bl;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = bl_orig;
        transitionApplied = true;
      }
    } else {
      // Check left topple first, then right
      // Gas topple left: [E, G, E, G] -> [G, E, G, E] (gas column on right spreads left)
      if (!transitionApplied && !isGas(tl) && isGas(tr) && !isGas(bl) && isGas(br)) {
        tl_new = tr; tr_new = tl; bl_new = br; br_new = bl;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = bl_orig;
        transitionApplied = true;
      }
      // Gas topple right: [G, E, G, E] -> [E, G, E, G] (gas column on left spreads right)
      if (!transitionApplied && isGas(tl) && !isGas(tr) && isGas(bl) && !isGas(br)) {
        tl_new = tr; tr_new = tl; bl_new = br; br_new = bl;
        tl_new_orig = tr_orig; tr_new_orig = tl_orig; bl_new_orig = br_orig; br_new_orig = bl_orig;
        transitionApplied = true;
      }
    }
`;

export const margolusFragmentShader = createMargolusFragmentShader(margolusTransitions);
