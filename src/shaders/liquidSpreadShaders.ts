/**
 * Liquid spread shader for horizontal liquid spreading behavior
 * Uses the Margolus Cellular Automata framework with liquid-specific transitions
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export const liquidSpreadVertexShader = margolusVertexShader;

const liquidSpreadTransitions = `
    // LIQUID-SPECIFIC TRANSITIONS
    // Liquids spread horizontally ONLY when resting on solid ground
    // These have lower priority than all vertical/diagonal movements

    // Liquid horizontal spread right when both cells are resting
    // [0,L,S,S] -> [L,0,S,S]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isLiquid(tr) && br != INTERNAL_EMPTY && bl != INTERNAL_EMPTY) {
      tl_new = tr; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = br;
      tl_new_orig = tr_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }

    // Liquid horizontal spread left when both cells are resting
    // [L,0,S,S] -> [0,L,S,S]
    if (!transitionApplied && isLiquid(tl) && tr == INTERNAL_EMPTY && br != INTERNAL_EMPTY && bl != INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = tl; bl_new = bl; br_new = br;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }
`;

export const liquidSpreadFragmentShader = createMargolusFragmentShader(liquidSpreadTransitions);
