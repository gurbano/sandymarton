/**
 * PlayerManager - Singleton managing player state
 *
 * Simplified system: player uses hitboxes for collision and
 * is rendered as a sprite overlay (no particle body)
 */

import type {
  PlayerState,
  PlayerSettings,
  PlayerDimensions,
  PlayerColors,
} from '../types/PlayerConfig';
import {
  DEFAULT_PLAYER_STATE,
  DEFAULT_PLAYER_SETTINGS,
  DEFAULT_PLAYER_COLORS,
  computeScaledDimensions,
} from '../types/PlayerConfig';

// Player output texture size (4x4 pixels = 16 data points)
export const PLAYER_OUTPUT_SIZE = 4;

class PlayerManager {
  private static instance: PlayerManager | null = null;

  // Core state
  private _enabled: boolean = false;
  private state: PlayerState;
  private settings: PlayerSettings;
  private dimensions: PlayerDimensions;
  private colors: PlayerColors;

  // Input state (raw keyboard state)
  private keys: Set<string> = new Set();

  private constructor() {
    this.state = { ...DEFAULT_PLAYER_STATE };
    this.settings = { ...DEFAULT_PLAYER_SETTINGS };
    this.dimensions = computeScaledDimensions(this.settings.scale);
    this.colors = { ...DEFAULT_PLAYER_COLORS };
  }

  static getInstance(): PlayerManager {
    if (!PlayerManager.instance) {
      PlayerManager.instance = new PlayerManager();
    }
    return PlayerManager.instance;
  }

  static resetInstance(): void {
    PlayerManager.instance = null;
  }

  // --- Enable/Disable ---

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled) {
      this.state.velocityX = 0;
      this.state.velocityY = 0;
      this.state.walkPhase = 0;
    }
  }

  // --- Position/Velocity ---

  get position(): { x: number; y: number } {
    return { x: this.state.x, y: this.state.y };
  }

  get velocity(): { x: number; y: number } {
    return { x: this.state.velocityX, y: this.state.velocityY };
  }

  setPosition(x: number, y: number): void {
    this.state.x = x;
    this.state.y = y;
  }

  setVelocity(vx: number, vy: number): void {
    this.state.velocityX = vx;
    this.state.velocityY = vy;
  }

  // --- State Access ---

  get currentState(): Readonly<PlayerState> {
    return this.state;
  }

  get currentSettings(): Readonly<PlayerSettings> {
    return this.settings;
  }

  getDimensions(): PlayerDimensions {
    return this.dimensions;
  }

  getColors(): PlayerColors {
    return this.colors;
  }

  // --- Input handling ---

  handleKeyDown(key: string): void {
    this.keys.add(key.toLowerCase());
    this.updateInputState();
  }

  handleKeyUp(key: string): void {
    this.keys.delete(key.toLowerCase());
    this.updateInputState();
  }

  private updateInputState(): void {
    // Horizontal input
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    this.state.inputX = (right ? 1 : 0) - (left ? 1 : 0);

    // Vertical input
    const up = this.keys.has('w') || this.keys.has('arrowup') || this.keys.has(' ');
    const down = this.keys.has('s') || this.keys.has('arrowdown');
    this.state.inputY = (up ? 1 : 0) - (down ? 1 : 0);

    // Jump
    this.state.jumping = up;
  }

  // --- GPU communication ---

  /**
   * Get uniforms for the physics shader
   */
  getPhysicsUniforms(): Record<string, { value: unknown }> {
    const s = this.state;
    const set = this.settings;
    const dim = this.dimensions;

    return {
      uPlayerEnabled: { value: this._enabled ? 1.0 : 0.0 },
      uPlayerPosition: { value: [s.x, s.y] },
      uPlayerVelocity: { value: [s.velocityX, s.velocityY] },
      uPlayerInput: { value: [s.inputX, s.inputY] },
      uPlayerJumping: { value: s.jumping ? 1.0 : 0.0 },
      uWalkPhase: { value: s.walkPhase },

      // Settings
      uPlayerSpeed: { value: set.speed },
      uPlayerJumpStrength: { value: set.jumpStrength },
      uPlayerGravity: { value: set.gravity },
      uPlayerMass: { value: set.mass },
      uPlayerFriction: { value: set.friction },
      uPlayerAirResistance: { value: set.airResistance },
      uPushOutStrength: { value: set.pushOutStrength },

      // Dimensions (for hitbox collision)
      uPlayerWidth: { value: dim.width },
      uPlayerHeight: { value: dim.height },
      uHeadRadius: { value: dim.headRadius },
      uBodyWidth: { value: dim.bodyWidth },
      uLegWidth: { value: dim.legWidth },
      uFootOffset: { value: dim.footOffset },
    };
  }

  /**
   * Get uniforms for the sprite renderer
   */
  getSpriteUniforms(): Record<string, { value: unknown }> {
    const s = this.state;
    const dim = this.dimensions;
    const col = this.colors;

    return {
      uPlayerEnabled: { value: this._enabled ? 1.0 : 0.0 },
      uPlayerPosition: { value: [s.x, s.y] },
      uWalkPhase: { value: s.walkPhase },
      uPlayerGrounded: { value: s.grounded ? 1.0 : 0.0 },
      uPlayerInLiquid: { value: s.inLiquid ? 1.0 : 0.0 },

      // Dimensions
      uPlayerHeight: { value: dim.height },
      uHeadRadius: { value: dim.headRadius },
      uBodyWidth: { value: dim.bodyWidth },
      uBodyHeight: { value: dim.bodyHeight },
      uLegWidth: { value: dim.legWidth },
      uLegHeight: { value: dim.legHeight },
      uFootOffset: { value: dim.footOffset },

      // Colors
      uHeadColor: { value: col.head },
      uBodyColor: { value: col.body },
      uLegColor: { value: col.legs },
    };
  }

  /**
   * Read feedback from GPU output texture
   */
  readOutputFromGPU(pixels: Float32Array): void {
    if (!this._enabled || pixels.length < 16) return;

    // Pixel 0: Position (R=x, G=y)
    this.state.x = pixels[0];
    this.state.y = pixels[1];

    // Pixel 1: Velocity (R=vx, G=vy)
    this.state.velocityX = pixels[4];
    this.state.velocityY = pixels[5];

    // Pixel 2: Status (R=grounded, G=liquidDensity, B=damage)
    this.state.grounded = pixels[8] > 0.5;
    this.state.liquidDensity = pixels[9] * 10000;
    this.state.damageFlags = Math.round(pixels[10] * 255);
    this.state.inLiquid = this.state.liquidDensity > 0;

    // Pixel 3: Animation (R=walkPhase, G=inLiquid)
    this.state.walkPhase = pixels[12];
  }

  // --- Configuration ---

  setDimensions(dimensions: Partial<PlayerDimensions>): void {
    this.dimensions = { ...this.dimensions, ...dimensions };
  }

  setSettings(settings: Partial<PlayerSettings>): void {
    this.settings = { ...this.settings, ...settings };
    // Recalculate dimensions if scale changed
    if (settings.scale !== undefined) {
      this.dimensions = computeScaledDimensions(this.settings.scale);
    }
  }

  setColors(colors: Partial<PlayerColors>): void {
    this.colors = { ...this.colors, ...colors };
  }

  updateSettings(settings: Partial<PlayerSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  // --- Spawn/Reset ---

  spawn(x: number, y: number): void {
    this.state = {
      ...DEFAULT_PLAYER_STATE,
      x,
      y,
    };
    this._enabled = true;
  }

  reset(): void {
    this.state = { ...DEFAULT_PLAYER_STATE };
    this.settings = { ...DEFAULT_PLAYER_SETTINGS };
    this.dimensions = computeScaledDimensions(this.settings.scale);
    this.keys.clear();
    this._enabled = false;
  }
}

// Export singleton getter
export function getPlayerManager(): PlayerManager {
  return PlayerManager.getInstance();
}

export function resetPlayerManager(): void {
  PlayerManager.resetInstance();
}

export { PlayerManager };
