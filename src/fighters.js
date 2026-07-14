import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Luftwaffe fighters. They orbit the bomber, peel into strafing runs firing
// tracers that damage the hull, and can be shot down by the gunners.
// The bomber sits at the world origin; fighters live in scene space around it.
// ---------------------------------------------------------------------------

function fighterModel() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x6b6f6a, flatShading: true, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d38, flatShading: true });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd8b52f, flatShading: true });

  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 5, 8), grey);
  fuse.rotation.x = Math.PI / 2;
  g.add(fuse);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), yellow);
  nose.rotation.x = Math.PI / 2; nose.position.z = 2.8;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.18, 1.4), grey);
  wing.position.z = 0.2; g.add(wing);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.7), grey);
  tailplane.position.z = -2.2; g.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 0.9), grey);
  fin.position.set(0, 0.5, -2.2); g.add(fin);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), dark);
  canopy.position.set(0, 0.35, 0.4); canopy.scale.z = 1.6; g.add(canopy);
  // crosses
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.25), dark);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.9), dark);
  for (const s of [-2.2, 2.2]) {
    const c = cross.clone(); c.position.set(s, 0.1, 0.2); g.add(c);
    const c2 = cross2.clone(); c2.position.set(s, 0.1, 0.2); g.add(c2);
  }
  return g;
}

export class FighterManager {
  constructor(scene, effects, bomber, audio) {
    this.scene = scene;
    this.fx = effects;
    this.bomber = bomber;
    this.audio = audio;
    this.fighters = [];
    this.template = fighterModel();
    this.spawnTimer = 2;
    this.wave = 0;
    this.difficulty = 1;
    this.onHullHit = () => {};
  }

  reset() {
    this.fighters.forEach((f) => this.scene.remove(f.group));
    this.fighters = [];
    this.spawnTimer = 2;
    this.wave = 0;
    this.difficulty = 1;
  }

  spawn() {
    const g = this.template.clone();
    const ang = Math.random() * Math.PI * 2;
    const dist = 420 + Math.random() * 200;
    const height = (Math.random() - 0.4) * 160;
    g.position.set(Math.cos(ang) * dist, height, Math.sin(ang) * dist * 0.6 + (Math.random() - 0.5) * 200);
    this.scene.add(g);
    this.fighters.push({
      group: g,
      hp: 2,
      state: 'approach',
      fireCd: 1 + Math.random(),
      runTimer: 0,
      speed: 120 + Math.random() * 40 + this.difficulty * 6,
      offset: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30 + 10, (Math.random() - 0.5) * 30),
    });
  }

  update(dt, active) {
    // Spawn cadence ramps up over the raid.
    this.spawnTimer -= dt;
    const maxAlive = 3 + Math.floor(this.difficulty);
    if (active && this.spawnTimer <= 0 && this.fighters.length < maxAlive) {
      this.spawn();
      this.spawnTimer = Math.max(1.4, 4.5 - this.difficulty * 0.3);
    }

    const origin = new THREE.Vector3(0, 0, 0);
    for (let i = this.fighters.length - 1; i >= 0; i--) {
      const f = this.fighters[i];
      const g = f.group;
      const toBomber = origin.clone().sub(g.position);
      const dist = toBomber.length();

      if (f.state === 'approach') {
        const aim = origin.clone().add(f.offset);
        this._steer(g, aim, f.speed, dt);
        if (dist < 220) { f.state = 'strafe'; f.runTimer = 2.4; }
      } else if (f.state === 'strafe') {
        // dive across the bomber firing
        const aim = origin.clone().add(new THREE.Vector3(f.offset.x * 0.2, f.offset.y * 0.3, -60));
        this._steer(g, aim, f.speed * 1.15, dt);
        f.fireCd -= dt;
        if (f.fireCd <= 0 && dist < 260) {
          this._fire(f);
          f.fireCd = 0.5 + Math.random() * 0.5;
        }
        f.runTimer -= dt;
        if (f.runTimer <= 0 || dist < 40) { f.state = 'egress'; f.runTimer = 3; }
      } else { // egress — fly away then re-attack or despawn
        const away = g.position.clone().normalize().multiplyScalar(600);
        this._steer(g, away, f.speed, dt);
        f.runTimer -= dt;
        if (f.runTimer <= 0) {
          if (Math.random() < 0.6) { f.state = 'approach'; f.offset.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30 + 10, (Math.random() - 0.5) * 30); }
          else { this._despawn(i); }
        }
      }
      if (dist > 900) this._despawn(i);
    }
  }

  _steer(g, target, speed, dt) {
    const dir = target.clone().sub(g.position);
    const len = dir.length();
    if (len < 0.001) return;
    dir.divideScalar(len);
    // face travel direction, then advance
    const look = new THREE.Matrix4().lookAt(g.position, g.position.clone().add(dir), new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(look);
    g.quaternion.slerp(q, Math.min(1, dt * 2.2));
    g.position.addScaledVector(dir, speed * dt);
    // bank into the turn for style
    g.rotateZ((Math.sin(performance.now() * 0.001 + g.id) * 0.0) );
  }

  _fire(f) {
    const muzzle = f.group.position.clone();
    const dir = new THREE.Vector3(0, 0, 0).sub(muzzle).normalize();
    // spread
    dir.x += (Math.random() - 0.5) * 0.05;
    dir.y += (Math.random() - 0.5) * 0.05;
    this.fx.tracer(muzzle, dir, { color: 0xff5533, speed: 640, life: 0.7 });
    if (this.audio) this.audio.play('enemyGun', 0.25);
    // chance to hit the hull, scaled by difficulty
    if (Math.random() < 0.35 + this.difficulty * 0.03) {
      const dmg = 3 + Math.random() * 4 + this.difficulty;
      this.onHullHit(dmg, muzzle);
    }
  }

  _despawn(i) {
    this.scene.remove(this.fighters[i].group);
    this.fighters.splice(i, 1);
  }

  // Called by the gunner: hitscan along `ray` from `origin`. Returns true on kill.
  shoot(origin, dir, range = 700, coneCos = 0.985) {
    let best = null, bestDot = coneCos, bestDist = Infinity;
    for (const f of this.fighters) {
      const to = f.group.position.clone().sub(origin);
      const d = to.length();
      if (d > range) continue;
      const dot = to.normalize().dot(dir);
      if (dot > bestDot || (dot > coneCos && d < bestDist)) {
        // prefer closest within cone
        if (dot >= coneCos && d < bestDist) { best = f; bestDist = d; bestDot = dot; }
      }
    }
    if (!best) return false;
    best.hp -= 1;
    this.fx.explosion(best.group.position.clone(), { color: 0xffcc55, size: 0.5, count: 5 });
    if (best.hp <= 0) {
      this.fx.explosion(best.group.position.clone(), { color: 0xff7733, size: 1.6, count: 16 });
      if (this.audio) this.audio.play('boom', 0.5);
      const idx = this.fighters.indexOf(best);
      this._despawn(idx);
      return true;
    }
    return false;
  }
}
