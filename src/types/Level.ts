/**
 * Level system types
 */

export interface LevelTextures {
  particles: string; // Path to particles texture PNG
  // Future: could add other textures like background, overlay, etc.
}

export interface Level {
  id: string;
  name: string;
  description?: string;
  textures: LevelTextures;
}

export interface LevelIndex {
  levels: Level[];
}
