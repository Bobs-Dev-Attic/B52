import * as THREE from 'three';
import { GROUND_Y } from './world.js';

// ---------------------------------------------------------------------------
// A raid's worth of ground targets. The manager pre-places a line of factory
// complexes far ahead along the route; they scroll toward the bomber with the
// world. Each complex has a red marker ring for the bombardier and several
// buildings to flatten. The raid is over once every target has passed behind.
// ---------------------------------------------------------------------------

const LAYOUT = [
  [0, 0, 60, 30, 34], [70, 0, 40, 24, 28], [-70, 10, 46, 26, 30],
  [30, -70, 54, 30, 32], [-40, -60, 38, 20, 26],
];

export class TargetManager {
  constructor(scene, effects, audio, total = 6) {
    this.scene = scene;
    this.fx = effects;
    this.audio = audio;
    this.total = total;
    this.spacing = 5200;
    this.first = 5200;
    this.group = new THREE.Group();
    this.group.position.y = GROUND_Y;
    scene.add(this.group);
    this.targets = [];
    this.spawned = 0;
    this.destroyed = 0;
    this.passed = 0;
    this.onResult = () => {};
    this._rand = 1;
  }

  reset() {
    for (const t of this.targets) this.group.remove(t.grp);
    this.targets = [];
    this.spawned = 0;
    this.destroyed = 0;
    this.passed = 0;
    for (let i = 0; i < this.total; i++) this._spawn(this.first + i * this.spacing, i);
  }

  _spawn(z, idx) {
    const grp = new THREE.Group();
    // deterministic-ish lateral offset so the pilot has to line each one up
    const lx = ((idx * 97) % 160) - 80;
    grp.position.set(lx, 0, z);

    const buildings = [];
    for (const [bx, bz, w, h, d] of LAYOUT) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x6a5f52, flatShading: true, roughness: 1 }));
      b.position.set(bx, h / 2, bz);
      grp.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 3, d * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x54483d, flatShading: true }));
      roof.position.set(bx, h + 1.5, bz);
      grp.add(roof);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 34, 8),
        new THREE.MeshStandardMaterial({ color: 0x7a4a3a, flatShading: true }));
      stack.position.set(bx + w * 0.3, 17, bz + d * 0.3);
      grp.add(stack);
      buildings.push({ mesh: b, roof, stack, x: bx, z: bz, w, d, destroyed: false });
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(90, 100, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 2;
    grp.add(ring);

    this.group.add(grp);
    this.targets.push({ grp, z, lx, buildings, ring });
    this.spawned++;
  }

  setLateral(x) { this.group.position.x = x; }

  update(dt, speed) {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      t.z -= speed * dt;
      t.grp.position.z = t.z;
      if (t.z < -900) {
        this.passed++;
        this.group.remove(t.grp);
        this.targets.splice(i, 1);
      }
    }
  }

  // Distance (world +z) to the nearest target still ahead; Infinity if none.
  nextDist() {
    let best = Infinity;
    for (const t of this.targets) if (t.z > -150 && t.z < best) best = t.z;
    return best;
  }

  raidOver() { return this.spawned >= this.total && this.targets.length === 0; }

  // Bomb impact at world (wx, wz): flatten the first live building hit.
  impact(wx, wz) {
    const ox = this.group.position.x;
    for (const t of this.targets) {
      for (const b of t.buildings) {
        if (b.destroyed) continue;
        const bwx = ox + t.grp.position.x + b.x;
        const bwz = t.grp.position.z + b.z;
        if (Math.abs(wx - bwx) < b.w / 2 + 14 && Math.abs(wz - bwz) < b.d / 2 + 14) {
          b.destroyed = true;
          b.mesh.visible = false; b.roof.visible = false; b.stack.visible = false;
          this.destroyed++;
          this.fx.explosion(new THREE.Vector3(bwx, GROUND_Y + 10, bwz), { color: 0xffbb33, size: 4, count: 26 });
          return true;
        }
      }
    }
    return false;
  }
}
