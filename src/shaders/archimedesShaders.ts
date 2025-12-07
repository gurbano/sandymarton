/**
 * Archimedes shader for buoyancy and fluid displacement behavior
 * Uses the Margolus Cellular Automata framework
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export const archimedesVertexShader = margolusVertexShader;

const archimedesTransitions = `
    // ARCHIMEDES PRINCIPLE TRANSITIONS
    // Solids sink through liquids, liquids rise through solids (buoyancy)

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
`;

export const archimedesFragmentShader = createMargolusFragmentShader(archimedesTransitions);
