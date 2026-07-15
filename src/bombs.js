import * as THREE from 'three';
import { GROUND_Y } from './world.js';

// ---------------------------------------------------------------------------
// Bomb ballistics. The bomber is stationary at the origin and the world
// scrolls beneath it, so a released bomb simply falls under gravity while the
// terrain slides past — which reproduces real bomb "throw": you must release
// early, before the target is directly below. `predictLeadZ()` tells the
// bombsight how far ahead the impact point currently is.
// ---------------------------------------------------------------------------

export const GRAVITY = 42;

export class BombManager {
  constructor(scene, effects, targets, audio) {
    this.scene = scene;
    this.fx = effects;
    this.targets = targets;
    this.audio = audio;
    this.bombs = [];
    this.geo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 6);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3a3d38, flatShading: true, metalness: 0.3 });
    this.onHit = () => {};
  }

  reset() {
    this.bombs.forEach((b) => this.scene.remove(b.mesh));
    this.bombs = [];
  }

  drop(bombBay) {
    const pos = bombBay.getWorldPosition(new THREE.Vector3());
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(pos);
    m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    this.bombs.push({ mesh: m, vy: 0, x: pos.x, z: pos.z });
    if (this.audio) this.audio.play('drop', 0.4);
  }

  // Distance ahead (world +z) that a bomb released NOW would land, given the
  // current airspeed. Used to draw the falling-bomb predictor.
  predictLeadZ(bombBayY, airspeed) {
    const h = bombBayY - GROUND_Y;
    const t = Math.sqrt((2 * h) / GRAVITY);
    return airspeed * t;
  }

  update(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vy -= GRAVITY * dt;
      b.mesh.position.y += b.vy * dt;
      // nose-over as it falls
      b.mesh.rotation.x = Math.min(Math.PI / 2 + 0.9, b.mesh.rotation.x + dt * 0.4);

      if (b.mesh.position.y <= GROUND_Y) {
        this._impact(b);
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  _impact(b) {
    const wx = b.mesh.position.x;
    const wz = b.mesh.position.z;
    this.fx.explosion(new THREE.Vector3(wx, GROUND_Y + 4, wz), { color: 0xff9933, size: 3, count: 22 });
    if (this.audio) this.audio.play('boom', 0.7);
    this.onHit(this.targets.impact(wx, wz));
  }
}
