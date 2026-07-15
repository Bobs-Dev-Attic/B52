import * as THREE from 'three';
import { GROUND_Y } from './world.js';

// ---------------------------------------------------------------------------
// Crew positions. Each role owns the shared camera while active and reads the
// input state. Flight parameters live on the game object so the bomber keeps
// flying (autopilot holds heading) while you man a turret or the bombsight.
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _eye = new THREE.Vector3(0, 0, 0);

// Orient a camera so its local -z points along `dir` with a stable, level up.
// (setFromUnitVectors is degenerate for dir ≈ +z and flips the view.)
function lookLocal(camera, dir) {
  _m.lookAt(_eye, dir, _up);
  camera.quaternion.setFromRotationMatrix(_m);
}

function aimDir(yaw, pitch) {
  // yaw/pitch where (0,0) => bomber forward (+z)
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch)
  ).normalize();
}

// ----------------------------- PILOT ---------------------------------------
export class PilotRole {
  constructor(game) { this.game = game; }
  enter() {
    const { camera, bomber } = this.game;
    bomber.userData.pilotSeat.add(camera);
    camera.position.set(0, 0.15, -0.2);
    this.game.dom.stick.classList.remove('hidden');
    this.game.dom.throttle.classList.remove('hidden');
  }
  exit() {
    this.game.dom.stick.classList.add('hidden');
    this.game.dom.throttle.classList.add('hidden');
  }
  update(dt, input) {
    const g = this.game, b = g.bomber;
    // bank & pitch visuals
    const targetRoll = -input.stick.x * 0.45;
    const targetPitch = input.stick.y * 0.22;
    b.rotation.z += (targetRoll - b.rotation.z) * Math.min(1, dt * 3);
    b.rotation.x += (targetPitch - b.rotation.x) * Math.min(1, dt * 3);
    // altitude: pull back (stick up = negative y) to climb
    g.altitude += -input.stick.y * 55 * dt;
    g.altitude = THREE.MathUtils.clamp(g.altitude, -70, 150);
    b.position.y += (g.altitude - b.position.y) * Math.min(1, dt * 2);
    // lateral drift steers the flight path across the map
    g.worldX -= input.stick.x * 60 * dt;
    // throttle -> airspeed
    g.airspeed = 80 + input.throttle * 105;
    g.audio.setThrottle(input.throttle);
    // camera faces forward (+z), tilted a touch up so the horizon sits mid-screen
    lookLocal(g.camera, _dir.set(0, 0.14, 1).normalize());
  }
}

// ----------------------------- GUNNER --------------------------------------
const TURRET_AIM = [
  { yaw: 0,        pitch: 0.12, range: Math.PI * 0.9 }, // top
  { yaw: Math.PI,  pitch: 0.12, range: 1.2 },           // tail
  { yaw: 0,        pitch: -0.1, range: 1.1 },           // nose
  { yaw: 0,        pitch: -0.55, range: Math.PI * 0.9 },// belly
];

export class GunnerRole {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.yawOff = 0; this.pitchOff = 0;
    this.heat = 0; this.overheated = false;
    this.fireCd = 0;
  }
  enter() {
    const g = this.game;
    g.bomber.add(g.camera);
    this.setTurret(this.index);
    g.dom.turrets.classList.remove('hidden');
    g.dom.reticle.classList.remove('hidden');
    g.dom.fireBtn.classList.remove('hidden');
    g.dom.gunInfo.classList.remove('hidden');
  }
  exit() {
    const g = this.game;
    g.dom.turrets.classList.add('hidden');
    g.dom.reticle.classList.add('hidden');
    g.dom.fireBtn.classList.add('hidden');
    g.dom.gunInfo.classList.add('hidden');
  }
  setTurret(i) {
    this.index = i;
    this.yawOff = 0; this.pitchOff = 0;
    this.base = TURRET_AIM[i];
    this.turret = this.game.bomber.userData.turrets[i];
  }
  update(dt, input) {
    const g = this.game;
    const aim = input.consumeAim();
    const sens = 0.0034;
    // drag right → view swings right (dx was inverted before)
    this.yawOff = THREE.MathUtils.clamp(this.yawOff - aim.dx * sens, -this.base.range, this.base.range);
    this.pitchOff = THREE.MathUtils.clamp(this.pitchOff - aim.dy * sens, -1.2, 1.2);

    const yaw = this.base.yaw + this.yawOff;
    const pitch = THREE.MathUtils.clamp(this.base.pitch + this.pitchOff, -1.35, 1.35);
    const dir = aimDir(yaw, pitch);

    // seat camera at the turret and point it
    g.camera.position.set(this.turret.view[0], this.turret.view[1], this.turret.view[2]);
    lookLocal(g.camera, dir);

    // turret visual
    this.turret.group.rotation.y = this.yawOff * (this.index === 1 ? -1 : 1);
    if (this.turret.yoke) this.turret.yoke.rotation.x = -pitch;

    // cooling
    if (this.overheated) { this.heat -= dt * 0.35; if (this.heat <= 0.2) this.overheated = false; }
    else this.heat = Math.max(0, this.heat - dt * 0.25);

    // firing
    this.fireCd -= dt;
    if (input.firing && !this.overheated && this.fireCd <= 0) {
      this._shoot(dir);
      this.fireCd = 0.09;
      this.heat += 0.05;
      if (this.heat >= 1) { this.heat = 1; this.overheated = true; }
    }
    g.dom.heatBar.style.width = `${this.heat * 100}%`;
    g.dom.heatBar.style.background = this.overheated ? '#e04a3a' : '';
  }
  _shoot(localDir) {
    const g = this.game;
    const origin = g.camera.getWorldPosition(_v.clone());
    const worldDir = g.camera.getWorldDirection(_dir.clone());
    // muzzle tracer
    g.effects.tracer(origin.clone().addScaledVector(worldDir, 3), worldDir, { color: 0xffee88, speed: 1100, life: 0.6 });
    g.audio.play('gun', 0.3);
    const kill = g.fighters.shoot(origin, worldDir);
    if (kill) g.onKill();
  }
}

// --------------------------- BOMBARDIER ------------------------------------
export class BombardierRole {
  constructor(game) { this.game = game; this.yawOff = 0; this.pitchOff = 0; this.dropCd = 0; }
  enter() {
    const g = this.game;
    g.bomber.add(g.camera);
    g.camera.position.set(0, -0.3, 8.7); // just ahead of the glazed nose for a clear view down
    g.dom.bombsight.classList.remove('hidden');
    g.dom.dropBtn.classList.remove('hidden');
  }
  exit() {
    const g = this.game;
    g.dom.bombsight.classList.add('hidden');
    g.dom.dropBtn.classList.add('hidden');
    g.dom.bombPredict.style.display = 'none';
  }
  update(dt, input) {
    const g = this.game;
    const aim = input.consumeAim();
    this.yawOff = THREE.MathUtils.clamp(this.yawOff + aim.dx * 0.0022, -0.5, 0.5);
    this.pitchOff = THREE.MathUtils.clamp(this.pitchOff - aim.dy * 0.0022, -0.35, 0.35);
    const dir = aimDir(this.yawOff, -0.62 + this.pitchOff);
    lookLocal(g.camera, dir);

    // drop
    this.dropCd -= dt;
    if (input.consumeDrop() && this.dropCd <= 0) {
      g.bombs.drop(g.bomber.userData.bombBay);
      this.dropCd = 0.25;
    }

    // predictor: where a bomb dropped now would land, projected to screen
    const bombBayY = g.bomber.position.y - 0.7;
    const lead = g.bombs.predictLeadZ(bombBayY, g.airspeed);
    _v.set(0, GROUND_Y, lead);
    _v.project(g.camera);
    const el = g.dom.bombPredict;
    if (_v.z < 1 && Math.abs(_v.x) < 1.4 && Math.abs(_v.y) < 1.4) {
      el.style.display = 'block';
      el.style.left = `${(_v.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-_v.y * 0.5 + 0.5) * innerHeight}px`;
    } else {
      el.style.display = 'none';
    }
  }
}
