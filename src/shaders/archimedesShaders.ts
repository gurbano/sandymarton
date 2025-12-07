/**
 * Archimedes shader for buoyancy and fluid displacement behavior
 * Uses the Margolus Cellular Automata framework
 */

import { margolusVertexShader, createMargolusFragmentShader } from './margolusShaderUtils';

export const archimedesVertexShader = margolusVertexShader;

const archimedesTransitions = `
    // ARCHIMEDES PRINCIPLE TRANSITIONS
    // Handle buoyancy and fluid displacement
    // No transitions implemented yet
`;

export const archimedesFragmentShader = createMargolusFragmentShader(archimedesTransitions);
