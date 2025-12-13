/**
 * PhysicsRenderer - Renders physics particles and rigid bodies using Three.js
 *
 * Uses point sprites for particles and instanced meshes for rigid bodies.
 * Updates buffers from PhysicsManager each frame.
 */

import {
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  Scene,
  OrthographicCamera,
  DynamicDrawUsage,
  InstancedMesh,
  PlaneGeometry,
  MeshBasicMaterial,
  Matrix4,
  Vector3,
  Quaternion,
  CircleGeometry,
} from 'three';
import type { PhysicsManager } from './PhysicsManager';
import { ParticleColors } from '../world/ParticleTypes';
import { MAX_PHYSICS_PARTICLES, MAX_RIGID_BODIES } from '../types/PhysicsConfig';

// Maximum number of collision rects to render
const MAX_COLLISION_RECTS = 2000;

// Default color for unknown particle types
const DEFAULT_COLOR: [number, number, number, number] = [255, 255, 255, 255];

/**
 * Get normalized RGB color for a particle type
 */
function getParticleColor(type: number): { r: number; g: number; b: number } {
  const color = ParticleColors[type] || DEFAULT_COLOR;
  return {
    r: color[0] / 255,
    g: color[1] / 255,
    b: color[2] / 255,
  };
}

export class PhysicsRenderer {
  // Particle rendering
  private particleGeometry: BufferGeometry;
  private particleMaterial: PointsMaterial;
  private particlePoints: Points;
  private particlePositions: BufferAttribute;
  private particleColors: BufferAttribute;

  // Rigid body rendering - boxes
  private boxGeometry: PlaneGeometry;
  private boxMaterial: MeshBasicMaterial;
  private boxMesh: InstancedMesh;

  // Rigid body rendering - circles
  private circleGeometry: CircleGeometry;
  private circleMaterial: MeshBasicMaterial;
  private circleMesh: InstancedMesh;

  // Collision rect debug rendering
  private collisionRectGeometry: PlaneGeometry;
  private collisionRectMaterial: MeshBasicMaterial;
  private collisionRectMesh: InstancedMesh;
  private showCollisionRects = false;

  // Scene and camera for rendering
  public scene: Scene;
  public camera: OrthographicCamera;

  // Temporary matrix for instanced updates
  private tempMatrix: Matrix4;
  private tempPosition: Vector3;
  private tempQuaternion: Quaternion;
  private tempScale: Vector3;

  // World height for Y coordinate conversion (Rapier Y-up to screen Y-down)
  private worldHeight: number;

  constructor(worldWidth: number, worldHeight: number) {
    this.tempMatrix = new Matrix4();
    this.tempPosition = new Vector3();
    this.tempQuaternion = new Quaternion();
    this.tempScale = new Vector3();

    // Create scene
    this.scene = new Scene();

    // Store world height for Y coordinate conversion
    this.worldHeight = worldHeight;

    // Create orthographic camera in standard Three.js orientation
    this.camera = new OrthographicCamera(
      0,          // left
      worldWidth, // right
      worldHeight, // top
      0,          // bottom
      -1,
      1
    );

    // Initialize particle rendering
    this.particleGeometry = new BufferGeometry();

    const positions = new Float32Array(MAX_PHYSICS_PARTICLES * 3);
    this.particlePositions = new BufferAttribute(positions, 3);
    this.particlePositions.setUsage(DynamicDrawUsage);
    this.particleGeometry.setAttribute('position', this.particlePositions);

    const colors = new Float32Array(MAX_PHYSICS_PARTICLES * 3);
    this.particleColors = new BufferAttribute(colors, 3);
    this.particleColors.setUsage(DynamicDrawUsage);
    this.particleGeometry.setAttribute('color', this.particleColors);

    this.particleMaterial = new PointsMaterial({
      size: 2,
      vertexColors: true,
      sizeAttenuation: false,
    });

    this.particlePoints = new Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particlePoints);

    // Initialize box rigid body rendering
    this.boxGeometry = new PlaneGeometry(1, 1);
    this.boxMaterial = new MeshBasicMaterial({
      color: 0x8b4513, // Saddle brown
    });
    this.boxMesh = new InstancedMesh(
      this.boxGeometry,
      this.boxMaterial,
      MAX_RIGID_BODIES
    );
    this.boxMesh.count = 0;
    this.scene.add(this.boxMesh);

    // Initialize circle rigid body rendering
    this.circleGeometry = new CircleGeometry(1, 16);
    this.circleMaterial = new MeshBasicMaterial({
      color: 0x654321, // Dark brown
    });
    this.circleMesh = new InstancedMesh(
      this.circleGeometry,
      this.circleMaterial,
      MAX_RIGID_BODIES
    );
    this.circleMesh.count = 0;
    this.scene.add(this.circleMesh);

    // Initialize collision rect debug rendering
    this.collisionRectGeometry = new PlaneGeometry(1, 1);
    this.collisionRectMaterial = new MeshBasicMaterial({
      color: 0xffffff, //white
      transparent: false,
      opacity: 1.0,
      depthTest: false,
    });
    this.collisionRectMesh = new InstancedMesh(
      this.collisionRectGeometry,
      this.collisionRectMaterial,
      MAX_COLLISION_RECTS
    );
    this.collisionRectMesh.count = 0;
    this.collisionRectMesh.renderOrder = -1; // Render behind particles
    this.scene.add(this.collisionRectMesh);
  }

  /**
   * Update camera for new world dimensions
   */
  updateCamera(worldWidth: number, worldHeight: number): void {
    this.camera.left = 0;
    this.camera.right = worldWidth;
    this.camera.top = worldHeight;
    this.camera.bottom = 0;
    this.worldHeight = worldHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update particle rendering from physics manager
   */
  updateParticles(physicsManager: PhysicsManager): void {
    const positions = this.particlePositions.array as Float32Array;
    const colors = this.particleColors.array as Float32Array;

    const count = physicsManager.particleCount;

    for (let i = 0; i < count; i++) {
      const x = physicsManager.particlePositions[i * 2];
      const y = physicsManager.particlePositions[i * 2 + 1];
      const type = physicsManager.particleTypes[i];

      // Position (add 0.5 to center on pixel)
      // Flip Y: convert Rapier Y-up to screen Y-down for texture overlay
      positions[i * 3] = x + 0.5;
      positions[i * 3 + 1] = this.worldHeight - y + 0.5;
      positions[i * 3 + 2] = 0;

      // Color from particle type
      const color = getParticleColor(type);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    this.particlePositions.needsUpdate = true;
    this.particleColors.needsUpdate = true;
    this.particleGeometry.setDrawRange(0, count);
  }

  /**
   * Update rigid body rendering from physics manager
   */
  updateRigidBodies(physicsManager: PhysicsManager): void {
    let boxCount = 0;
    let circleCount = 0;

    const count = physicsManager.rigidBodyCount;

    for (let i = 0; i < count; i++) {
      const x = physicsManager.rigidBodyPositions[i * 2];
      const y = physicsManager.rigidBodyPositions[i * 2 + 1];
      const rotation = physicsManager.rigidBodyRotations[i];
      const width = physicsManager.rigidBodySizes[i * 2];
      const height = physicsManager.rigidBodySizes[i * 2 + 1];

      // Flip Y: convert Rapier Y-up to screen Y-down for texture overlay
      const screenY = this.worldHeight - y;

      // Determine if box or circle (circle has equal width/height from radius*2)
      const isCircle = Math.abs(width - height) < 0.1;

      if (isCircle) {
        this.tempPosition.set(x, screenY, 0);
        this.tempQuaternion.setFromAxisAngle(new Vector3(0, 0, 1), -rotation); // Negate rotation for Y flip
        this.tempScale.set(width / 2, height / 2, 1); // Radius

        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.circleMesh.setMatrixAt(circleCount, this.tempMatrix);
        circleCount++;
      } else {
        this.tempPosition.set(x, screenY, 0);
        this.tempQuaternion.setFromAxisAngle(new Vector3(0, 0, 1), -rotation); // Negate rotation for Y flip
        this.tempScale.set(width, height, 1);

        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.boxMesh.setMatrixAt(boxCount, this.tempMatrix);
        boxCount++;
      }
    }

    if (boxCount > 0) {
      this.boxMesh.instanceMatrix.needsUpdate = true;
    }
    this.boxMesh.count = boxCount;

    if (circleCount > 0) {
      this.circleMesh.instanceMatrix.needsUpdate = true;
    }
    this.circleMesh.count = circleCount;
  }

  /**
   * Update collision rect debug rendering from physics manager
   */
  updateCollisionRects(physicsManager: PhysicsManager): void {
    if (!this.showCollisionRects) {
      this.collisionRectMesh.count = 0;
      return;
    }

    const count = Math.min(physicsManager.collisionRectCount, MAX_COLLISION_RECTS);

    for (let i = 0; i < count; i++) {
      const x = physicsManager.collisionRects[i * 4];
      const y = physicsManager.collisionRects[i * 4 + 1];
      const width = physicsManager.collisionRects[i * 4 + 2];
      const height = physicsManager.collisionRects[i * 4 + 3];

      // Flip Y: convert Rapier Y-up to screen Y-down for texture overlay
      // Rapier Y is bottom of rect, so screen Y of top = worldHeight - (rapierY + height)
      const screenY = this.worldHeight - y - height;

      // Position at center of rect
      this.tempPosition.set(x + width / 2, screenY + height / 2, 0);
      this.tempQuaternion.identity();
      this.tempScale.set(width, height, 1);

      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.collisionRectMesh.setMatrixAt(i, this.tempMatrix);
    }

    if (count > 0) {
      this.collisionRectMesh.instanceMatrix.needsUpdate = true;
    }
    this.collisionRectMesh.count = count;
  }

  /**
   * Update all rendering from physics manager
   */
  update(physicsManager: PhysicsManager): void {
    this.updateParticles(physicsManager);
    this.updateRigidBodies(physicsManager);
    this.updateCollisionRects(physicsManager);
  }

  /**
   * Set particle point size (for zoom)
   */
  setPointSize(size: number): void {
    this.particleMaterial.size = size;
  }

  /**
   * Toggle collision rect debug visualization
   */
  setShowCollisionRects(show: boolean): void {
    this.showCollisionRects = show;
    if (!show) {
      this.collisionRectMesh.count = 0;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.boxGeometry.dispose();
    this.boxMaterial.dispose();
    this.boxMesh.dispose();
    this.circleGeometry.dispose();
    this.circleMaterial.dispose();
    this.circleMesh.dispose();
    this.collisionRectGeometry.dispose();
    this.collisionRectMaterial.dispose();
    this.collisionRectMesh.dispose();
  }
}
