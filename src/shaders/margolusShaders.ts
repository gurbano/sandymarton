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

    // Transition (g): [1,0,0,1] -> [1,1,0,0]
    if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isMovable(br)) {
      tl_new = tl; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
      tl_new_orig = tl_orig; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
      transitionApplied = true;
    }

    // Transition (h): [1,1,0,1] -> [1,1,1,0]
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && bl == INTERNAL_EMPTY && isMovable(br)) {
      tl_new = tl; tr_new = tr; bl_new = br; br_new = INTERNAL_EMPTY;
      tl_new_orig = tl_orig; tr_new_orig = tr_orig; bl_new_orig = br_orig; br_new_orig = EMPTY_TYPE;
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
        float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
        float rand = random(blockStart, uRandomSeed);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = br; br_new = tr;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = br_orig; br_new_orig = tr_orig;
          transitionApplied = true;
        }
      }
      if (!transitionApplied && isSolid(tl) && !isSolid(tr) && isSolid(bl) && !isSolid(br)) {
        float baseFriction = (getMaterialFriction(tl_orig) + getMaterialFriction(bl_orig)) * 0.5;
        float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
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
        float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
        float rand = random(blockStart, uRandomSeed + 1.0);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = tr; br_new = br;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = tr_orig; br_new_orig = br_orig;
          transitionApplied = true;
        }
      }
      if (!transitionApplied && !isSolid(tl) && isSolid(tr) && !isSolid(bl) && isSolid(br)) {
        float baseFriction = (getMaterialFriction(tr_orig) + getMaterialFriction(br_orig)) * 0.5;
        float toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0);
        float rand = random(blockStart, uRandomSeed);
        if (rand < toppleProbability) {
          tl_new = tl; tr_new = bl; bl_new = br; br_new = tr;
          tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = br_orig; br_new_orig = tr_orig;
          transitionApplied = true;
        }
      }
    }
`;

export const margolusFragmentShader = createMargolusFragmentShader(margolusTransitions);
