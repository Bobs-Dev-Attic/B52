import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Pooled visual effects: tracer bullets, explosion puffs, flak bursts.
// Everything is billboards/primitives updated each frame; no textures needed.
// ---------------------------------------------------------------------------

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.bursts = [];
    this.debris = [];

    this._tracerGeo = new THREE.CylinderGeometry(0.12, 0.12, 4, 5);
    this._tracerGeo.rotateX(Math.PI / 2);
  }

  // A fast glowing round travelling along `dir` from `origin`.
  tracer(origin, dir, { color = 0xffdd66, speed = 900, life = 1.2, homing = null } = {}) {
    const m = new THREE.Mesh(this._tracerGeo, new THREE.MeshBasicMaterial({ color }));
    m.position.copy(origin);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    this.scene.add(m);
    this.tracers.push({ mesh: m, vel: dir.clone().normalize().multiplyScalar(speed), life, color, homing });
    return m;
  }

  explosion(pos, { color = 0xff8833, size = 1, count = 10 } = {}) {
    const grp = new THREE.Group();
    grp.position.copy(pos);
    for (let i = 0; i < count; i++) {
      const s = (0.6 + Math.random() * 1.4) * size;
      const p = new THREE.Mesh(
        new THREE.IcosahedronGeometry(s, 0),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0x2a2a2a : color, transparent: true, opacity: 1 })
      );
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      grp.add(p);
      this.debris.push({ mesh: p, vel: dir.multiplyScalar((6 + Math.random() * 10) * size), grp });
    }
    this.scene.add(grp);
    this.bursts.push({ grp, life: 0.9, size });
  }

  flakBurst(pos) {
    const grp = new THREE.Group();
    grp.position.copy(pos);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3 + Math.random() * 2, 0),
      new THREE.MeshBasicMaterial({ color: 0x33322f, transparent: true, opacity: 0.9 })
    );
    grp.add(core);
    this.scene.add(grp);
    this.bursts.push({ grp, life: 1.4, size: 3, smoke: true });
  }

  update(dt) {
    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      if (t.homing && t.homing.parent) {
        const to = t.homing.getWorldPosition(new THREE.Vector3()).sub(t.mesh.position);
        t.vel.lerp(to.normalize().multiplyScalar(t.vel.length()), 0.04);
        t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.vel.clone().normalize());
      }
      t.mesh.position.addScaledVector(t.vel, dt);
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.material.dispose(); this.tracers.splice(i, 1); }
    }
    // explosion debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(0.92);
      if (!d.grp.parent) this.debris.splice(i, 1);
    }
    // bursts fade
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const k = Math.max(0, b.life / (b.smoke ? 1.4 : 0.9));
      b.grp.children.forEach((c) => {
        if (c.material) c.material.opacity = k;
        if (b.smoke) c.scale.setScalar(1 + (1 - k) * 3);
      });
      if (b.life <= 0) {
        this.scene.remove(b.grp);
        b.grp.traverse((o) => o.material && o.material.dispose());
        this.bursts.splice(i, 1);
      }
    }
  }
}
