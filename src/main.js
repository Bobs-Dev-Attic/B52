import * as THREE from 'three';
import { createWorld, GROUND_Y, TARGET_START_DIST } from './world.js';
import { createBomber } from './bomber.js';
import { Effects } from './effects.js';
import { FighterManager } from './fighters.js';
import { BombManager } from './bombs.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PilotRole, GunnerRole, BombardierRole } from './roles.js';
import { feed, updateHud } from './hud.js';

// ------------------------------- DOM refs ----------------------------------
const $ = (id) => document.getElementById(id);
const dom = {
  canvas: $('scene'), hud: $('hud'), start: $('start'), over: $('over'),
  roleName: $('roleName'), alt: $('alt'), spd: $('spd'), hdg: $('hdg'),
  hullBar: $('hullBar'), tgtDist: $('tgtDist'), bombs: $('bombs'), score: $('score'),
  reticle: $('reticle'), bombsight: $('bombsight'), bombPredict: $('bombPredict'),
  feed: $('feed'), roles: $('roles'), turrets: $('turrets'), gunInfo: $('gunInfo'),
  heatBar: $('heatBar'), fireBtn: $('fireBtn'), dropBtn: $('dropBtn'),
  stick: $('stick'), throttle: $('throttle'),
  startBtn: $('startBtn'), againBtn: $('againBtn'),
  overTitle: $('overTitle'), overStats: $('overStats'),
  planeName: $('planeName'),
};

// ------------------------------- Renderer ----------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);

// ------------------------------- Game state --------------------------------
const game = {
  scene, camera, dom, GROUND_Y,
  state: 'menu',
  airspeed: 140, altitude: 0, heading: 92,
  hull: 100, score: 0, kills: 0, bombsLeft: 12, hits: 0,
  targetDist: TARGET_START_DIST,
  flakTimer: 0, shake: 0,
};

const audio = new Audio();
const effects = new Effects(scene);
const world = createWorld(scene);

// ------------------------------- Squadron ----------------------------------
// A flight of four B-52s in a combat box. The player's ACTIVE plane sits at the
// world origin (the world scrolls beneath it); the others hold formation at a
// fixed offset relative to it. You can jump to any plane and any crew station.
const FORMATION = [
  { name: 'LEAD',  offset: new THREE.Vector3(0, 0, 0),      tail: 0xf0f0e0 },
  { name: 'LEFT',  offset: new THREE.Vector3(-74, -6, -48), tail: 0xffcc44 },
  { name: 'RIGHT', offset: new THREE.Vector3(74, -6, -48),  tail: 0x5e9ecb },
  { name: 'HIGH',  offset: new THREE.Vector3(0, 13, -94),   tail: 0xe04a3a },
];
const squadron = FORMATION.map((f) => {
  const b = createBomber(f.tail);
  scene.add(b);
  return b;
});
let activePlane = 0;
let bomber = squadron[activePlane];

const fighters = new FighterManager(scene, effects, bomber, audio);
const bombs = new BombManager(scene, effects, world, audio);
const input = new Input(dom);

Object.assign(game, { audio, effects, world, bomber, squadron, fighters, bombs, input, time: 0 });

// Position the non-active planes relative to the active one, with a gentle bob.
function layoutSquadron() {
  const activeOff = FORMATION[activePlane].offset;
  for (let i = 0; i < squadron.length; i++) {
    if (i === activePlane) continue;
    const b = squadron[i];
    const rel = FORMATION[i].offset.clone().sub(activeOff);
    const bob = Math.sin(game.time * 0.6 + i * 2.1) * 1.3;
    b.position.set(rel.x, game.altitude + rel.y + bob, rel.z);
    b.rotation.set(0, 0, Math.sin(game.time * 0.5 + i) * 0.04);
  }
}

function setActivePlane(i) {
  if (i === activePlane || game.state !== 'playing') return;
  activePlane = i;
  bomber = squadron[i];
  game.bomber = bomber;
  bomber.position.set(0, game.altitude, 0);
  bomber.rotation.set(0, 0, 0);
  // re-enter the current role so the camera reparents onto the new plane
  if (current) { current.exit(); current.enter(); }
  layoutSquadron();
  document.querySelectorAll('.plane-btn').forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.plane) === i));
  dom.planeName.textContent = FORMATION[i].name;
}

game.onKill = () => {
  game.kills++; game.score += 100;
  feed(dom, 'FIGHTER DOWN +100', 'good');
};
game.damageHull = (amt) => {
  game.hull -= amt;
  game.shake = Math.min(0.5, game.shake + amt * 0.02);
  if (game.hull <= 0 && game.state === 'playing') endMission(false);
};

fighters.onHullHit = (dmg) => { game.damageHull(dmg); audio.play('hit', 0.4); };
bombs.onHit = (hit, bld) => {
  if (hit) {
    game.hits++; game.score += 500;
    feed(dom, 'TARGET DESTROYED +500', 'good');
  } else {
    feed(dom, 'BOMB MISSED', 'bad');
  }
};

// ------------------------------- Roles -------------------------------------
const roles = {
  pilot: new PilotRole(game),
  gunner: new GunnerRole(game),
  bombardier: new BombardierRole(game),
};
let current = null;

// bomb-drop counter + guard (declared here so startGame can reset it)
let dropped = 0;
const origDrop = bombs.drop.bind(bombs);
bombs.drop = (bay) => {
  if (game.bombsLeft <= 0) { feed(dom, 'BOMB BAY EMPTY', 'bad'); return; }
  dropped++;
  origDrop(bay);
};

function setRole(name) {
  if (current) current.exit();
  current = roles[name];
  game.roleKey = name;
  current.enter();
  dom.roleName.textContent = name.toUpperCase();
  document.querySelectorAll('.role-btn').forEach((b) => b.classList.toggle('active', b.dataset.role === name));
  input.setMode(name);
}

// ------------------------------- UI wiring ---------------------------------
document.querySelectorAll('.role-btn').forEach((b) =>
  b.addEventListener('click', () => { if (game.state === 'playing') setRole(b.dataset.role); }));

document.querySelectorAll('.turret-btn').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.turret-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    roles.gunner.setTurret(Number(b.dataset.turret));
  }));

document.querySelectorAll('.plane-btn').forEach((b) =>
  b.addEventListener('click', () => setActivePlane(Number(b.dataset.plane))));

dom.startBtn.addEventListener('click', startGame);
dom.againBtn.addEventListener('click', startGame);

function startGame() {
  audio.init(); audio.resume();
  // reset state
  Object.assign(game, {
    state: 'playing', airspeed: 140, altitude: 0, heading: 92,
    hull: 100, score: 0, kills: 0, bombsLeft: 12, hits: 0,
    targetDist: TARGET_START_DIST, flakTimer: 0, shake: 0,
  });
  dropped = 0;
  world.ground.position.set(0, GROUND_Y, 0);
  world.targetBuildings.forEach((b) => { b.destroyed = false; b.mesh.visible = true; });
  activePlane = 0;
  bomber = squadron[0];
  game.bomber = bomber;
  squadron.forEach((b) => { b.position.set(0, 0, 0); b.rotation.set(0, 0, 0); });
  layoutSquadron();
  document.querySelectorAll('.plane-btn').forEach((b) =>
    b.classList.toggle('active', Number(b.dataset.plane) === 0));
  dom.planeName.textContent = FORMATION[0].name;
  fighters.reset();
  bombs.reset();
  dom.start.classList.add('hidden');
  dom.over.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  setRole('pilot');
}

function endMission(won) {
  game.state = 'over';
  dom.hud.classList.add('hidden');
  dom.over.classList.remove('hidden');
  dom.over.classList.toggle('win', won);
  dom.over.classList.toggle('lose', !won);
  const total = world.targetBuildings.length;
  const hullBonus = Math.max(0, Math.round(game.hull) * 10);
  game.score += hullBonus;
  dom.overTitle.textContent = won
    ? (game.hits === total ? 'TARGET OBLITERATED' : 'RAID COMPLETE')
    : 'SHOT DOWN';
  dom.overStats.innerHTML = `
    <div>Targets destroyed: <b>${game.hits} / ${total}</b></div>
    <div>Fighters splashed: <b>${game.kills}</b></div>
    <div>Hull remaining: <b>${Math.max(0, Math.round(game.hull))}%</b></div>
    <div>Hull bonus: <b>+${hullBonus}</b></div>
    <div style="margin-top:8px;font-size:20px">SCORE: <b>${game.score.toLocaleString()}</b></div>`;
}

// ------------------------------- Flak --------------------------------------
function updateFlak(dt) {
  const near = Math.abs(game.targetDist) < 2000;
  if (!near) return;
  const intensity = 1 - Math.min(1, Math.abs(game.targetDist) / 2000);
  game.flakTimer -= dt;
  if (game.flakTimer <= 0) {
    game.flakTimer = 0.5 - intensity * 0.35 + Math.random() * 0.3;
    const p = new THREE.Vector3(
      (Math.random() - 0.5) * 160,
      bomber.position.y + (Math.random() - 0.5) * 90,
      (Math.random() - 0.3) * 220
    );
    effects.flakBurst(p);
    audio.play('boom', 0.18);
    // close bursts damage the hull
    if (p.length() < 55 && Math.random() < 0.5) game.damageHull(4 + Math.random() * 6);
  }
}

// ------------------------------- Loop --------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.state === 'playing') {
    input.sample();
    // forward flight: scroll the world beneath the bomber
    world.scrollGround(-game.airspeed * dt);
    game.targetDist = world.ground.position.z + TARGET_START_DIST;
    game.heading = 92 + input.stick.x * 6 + world.ground.position.x * 0.02;

    game.time += dt;
    // spin every plane's propellers
    for (const b of squadron) b.userData.props.forEach((p) => (p.rotation.z += dt * 40));

    current.update(dt, input);
    layoutSquadron();
    fighters.update(dt, true);
    bombs.update(dt);
    effects.update(dt);
    updateFlak(dt);
    // bomb count from what's been dropped
    game.bombsLeft = Math.max(0, 12 - dropped);

    // mission end when target passes behind
    if (game.targetDist < -700 && game.state === 'playing') {
      endMission(true);
    }
    // difficulty ramps as we near the target
    fighters.difficulty = 1 + (1 - Math.min(1, Math.abs(game.targetDist) / TARGET_START_DIST)) * 4;

    // screen shake
    if (game.shake > 0) {
      game.shake = Math.max(0, game.shake - dt * 1.2);
      camera.position.x += (Math.random() - 0.5) * game.shake;
      camera.position.y += (Math.random() - 0.5) * game.shake;
    }

    // drift clouds slowly
    world.clouds.position.z -= game.airspeed * dt * 0.6;
    if (world.clouds.position.z < -1400) world.clouds.position.z += 2800;

    updateHud(dom, game);
  } else {
    // menu: show the formation drifting with props turning
    game.time += dt;
    for (const b of squadron) b.userData.props.forEach((p) => (p.rotation.z += dt * 40));
    layoutSquadron();
    effects.update(dt);
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// position the menu camera
camera.position.set(18, 6, 26);
camera.lookAt(0, 0, 0);

// expose for debugging / automated testing
window.__game = game;

requestAnimationFrame(frame);
