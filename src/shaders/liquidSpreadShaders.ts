/**
 * Liquid spread shader for horizontal liquid spreading behavior
 * Uses the Margolus Cellular Automata framework with liquid-specific transitions
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export const liquidSpreadVertexShader = margolusVertexShader;

const liquidSpreadTransitions = `
    // LIQUID-SPECIFIC TRANSITIONS
    // Liquids spread horizontally when resting on solid ground
    // Liquids also cascade down diagonally when encountering edges

    // Priority 1: Cascade down into gaps (helps liquid flow down from narrow to wide layers)
    // Liquid falls diagonally down-left when there's a gap: [L,0,0,L] -> [0,0,L,L]
    if (!transitionApplied && isLiquid(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isLiquid(br)) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = tl; br_new = br;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = tl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }

    // Liquid falls diagonally down-right when there's a gap: [0,L,L,0] -> [0,0,L,L]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isLiquid(tr) && isLiquid(bl) && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = tr;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = tr_orig;
      transitionApplied = true;
    }

    // Priority 2: Horizontal spread when resting on any support (solid or liquid)
    // Liquid horizontal spread left: [0,L,?,?] -> [L,0,?,?] if tr has support below
    if (!transitionApplied && tl == INTERNAL_EMPTY && isLiquid(tr) && br != INTERNAL_EMPTY) {
      tl_new = tr; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = br;
      tl_new_orig = tr_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }

    // Liquid horizontal spread right: [L,0,?,?] -> [0,L,?,?] if tl has support below
    if (!transitionApplied && isLiquid(tl) && tr == INTERNAL_EMPTY && bl != INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = tl; bl_new = bl; br_new = br;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }
`;

export const liquidSpreadFragmentShader = createMargolusFragmentShader(liquidSpreadTransitions);
