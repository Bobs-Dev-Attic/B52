import * as THREE from 'three';
import { createWorld, GROUND_Y } from './world.js';
import { TargetManager } from './targets.js';
import { createBomber } from './bomber.js';
import { Effects } from './effects.js';
import { FighterManager } from './fighters.js';
import { BombManager } from './bombs.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PilotRole, GunnerRole, BombardierRole } from './roles.js';
import { feed, updateHud } from './hud.js';

// Game version — keep in sync with package.json and CHANGELOG.md.
const VERSION = '0.5.0';

// How many target complexes make up a raid, and how many bombs you carry.
const RAID_TARGETS = 6;
const BOMB_LOAD = 24;
const BUILDINGS_PER_TARGET = 5;

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
  planeName: $('planeName'), version: $('version'), startVer: $('startVer'),
};

// Stamp the version onto the title screen and the persistent tag.
dom.version.textContent = `v${VERSION}`;
dom.startVer.textContent = `v${VERSION}`;

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
  hull: 100, score: 0, kills: 0, bombsLeft: BOMB_LOAD, hits: 0,
  targetDist: Infinity, worldX: 0,
  flakTimer: 0, shake: 0, fuel: 100, engineTemp: 70,
};

// Cached pilot-instrument DOM nodes.
const pi = {
  panel: $('pilotPanel'),
  adiBall: $('adiBall'), compassRose: $('compassRose'), hdgRead: $('hdgRead'),
  asiBar: $('asiBar'), asiVal: $('asiVal'), altBar: $('altBarP'), altVal: $('altValP'),
  fuelBar: $('fuelBar'), fuelVal: $('fuelVal'), tempBar: $('tempBar'), tempVal: $('tempVal'),
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Drive the cockpit instruments from flight state (called while piloting).
function updatePilotInstruments() {
  const rollDeg = THREE.MathUtils.radToDeg(bomber.rotation.z);
  // nose-up (rotation.x < 0) drops the horizon so more sky shows
  const pitchPx = -THREE.MathUtils.radToDeg(bomber.rotation.x) * 2.2;
  pi.adiBall.style.transform = `rotate(${rollDeg}deg) translateY(${pitchPx}px)`;

  pi.compassRose.style.transform = `rotate(${-game.heading}deg)`;
  pi.hdgRead.textContent = String((((game.heading % 360) + 360) % 360) | 0).padStart(3, '0');

  const spd = Math.round(game.airspeed * 1.7);
  pi.asiVal.textContent = spd;
  pi.asiBar.style.width = `${clamp01((spd - 120) / 220) * 100}%`;

  const altFt = Math.round((bomber.position.y - GROUND_Y) * 30);
  pi.altVal.textContent = altFt.toLocaleString();
  pi.altBar.style.width = `${clamp01((altFt - 8000) / 8000) * 100}%`;

  const fuel = Math.max(0, Math.round(game.fuel));
  pi.fuelVal.textContent = fuel;
  pi.fuelBar.style.width = `${fuel}%`;
  pi.fuelBar.style.background = fuel < 20 ? '#e04a3a' : fuel < 40 ? '#e0c04a' : '#6b9d52';

  const temp = Math.round(game.engineTemp);
  pi.tempVal.textContent = temp;
  pi.tempBar.style.width = `${clamp01((temp - 40) / 140) * 100}%`;
  pi.tempBar.style.background = temp > 155 ? '#e04a3a' : temp > 130 ? '#e0c04a' : '#5e9ecb';
}

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

// Crew stations on every plane. Keys map to the crew-alive record; each plane
// can lose stations (crew killed) and, at 0 hull or no crew, is destroyed.
const CREW_KEYS = ['pilot', 'g0', 'g1', 'g2', 'g3', 'bombardier'];
const CREW_LABEL = { pilot: 'PILOT', bombardier: 'BOMBARDIER', g0: 'TOP GUNNER', g1: 'TAIL GUNNER', g2: 'NOSE GUNNER', g3: 'BELLY GUNNER' };
const _tmp = new THREE.Vector3();

function initPlaneState(b) {
  b.userData.hull = 100;
  b.userData.alive = true;
  b.userData.dying = 0;
  b.userData.crew = { pilot: true, g0: true, g1: true, g2: true, g3: true, bombardier: true };
  b.visible = true;
}
squadron.forEach(initPlaneState);

// The crew-station key for the player's current role + turret.
function stationKey() {
  if (game.roleKey === 'gunner') return 'g' + roles.gunner.index;
  return game.roleKey; // 'pilot' | 'bombardier'
}
function anyGunnerAlive(b) { return b.userData.crew.g0 || b.userData.crew.g1 || b.userData.crew.g2 || b.userData.crew.g3; }
function roleAlive(b, role) { return role === 'gunner' ? anyGunnerAlive(b) : b.userData.crew[role]; }

// First still-crewed station on a plane, preferring pilot → gunners → bombardier.
function firstAliveStation(b) {
  const c = b.userData.crew;
  if (c.pilot) return { role: 'pilot' };
  for (let i = 0; i < 4; i++) if (c['g' + i]) return { role: 'gunner', turret: i };
  if (c.bombardier) return { role: 'bombardier' };
  return null;
}

const fighters = new FighterManager(scene, effects, bomber, audio);
const targets = new TargetManager(scene, effects, audio, RAID_TARGETS);
const bombs = new BombManager(scene, effects, targets, audio);
const input = new Input(dom);

Object.assign(game, { audio, effects, world, targets, bomber, squadron, fighters, bombs, input, time: 0 });

// Position the non-active planes relative to the active one, with a gentle bob.
// Downed planes are skipped here — they tumble via updateWrecks().
function layoutSquadron() {
  const activeOff = FORMATION[activePlane].offset;
  for (let i = 0; i < squadron.length; i++) {
    if (i === activePlane) continue;
    const b = squadron[i];
    if (!b.userData.alive) continue;
    const rel = FORMATION[i].offset.clone().sub(activeOff);
    const bob = Math.sin(game.time * 0.6 + i * 2.1) * 1.3;
    b.position.set(rel.x, game.altitude + rel.y + bob, rel.z);
    b.rotation.set(0, 0, Math.sin(game.time * 0.5 + i) * 0.04);
  }
}

// Tumble & smoke for planes that have just been shot down, then hide them.
function updateWrecks(dt) {
  for (const b of squadron) {
    if (b.userData.dying <= 0) continue;
    b.userData.dying -= dt;
    b.position.y -= 34 * dt;
    b.position.z -= 20 * dt;
    b.rotation.z += 0.9 * dt;
    b.rotation.x += 0.5 * dt;
    if (Math.random() < 0.35) effects.explosion(b.getWorldPosition(_tmp).clone(), { color: 0x222222, size: 1, count: 3 });
    if (b.userData.dying <= 0) b.visible = false;
  }
}

// Player-initiated switch to plane i (only to a surviving plane).
function setActivePlane(i) {
  if (game.state !== 'playing' || i === activePlane) return;
  if (!squadron[i].userData.alive) return;
  switchToPlane(i, null);
}

// Take control of plane i at station `st` (or its first surviving station).
function switchToPlane(i, st) {
  activePlane = i;
  bomber = squadron[i];
  game.bomber = bomber;
  bomber.position.set(0, game.altitude, 0);
  bomber.rotation.set(0, 0, 0);
  applyStation(st || firstAliveStation(bomber));
  layoutSquadron();
  dom.planeName.textContent = FORMATION[i].name;
  refreshUI();
}

// Put the player at a specific station on the CURRENT plane.
function applyStation(st) {
  if (!st) return;
  if (st.role === 'gunner') roles.gunner.index = st.turret ?? roles.gunner.index;
  setRole(st.role);
  if (st.role === 'gunner') roles.gunner.setTurret(roles.gunner.index);
  refreshUI();
}

// Sync plane / role / turret buttons to alive + active state.
function refreshUI() {
  document.querySelectorAll('.plane-btn').forEach((el) => {
    const i = Number(el.dataset.plane);
    el.classList.toggle('active', i === activePlane);
    el.classList.toggle('dead', !squadron[i].userData.alive);
  });
  document.querySelectorAll('.role-btn').forEach((el) => {
    el.classList.toggle('active', el.dataset.role === game.roleKey);
    el.classList.toggle('dead', !roleAlive(bomber, el.dataset.role));
  });
  document.querySelectorAll('.turret-btn').forEach((el) => {
    const i = Number(el.dataset.turret);
    el.classList.toggle('active', i === roles.gunner.index);
    el.classList.toggle('dead', !bomber.userData.crew['g' + i]);
  });
}

game.onKill = () => {
  game.kills++; game.score += 100;
  feed(dom, 'FIGHTER DOWN +100', 'good');
};

// Damage a plane; may kill a crew station; destroys the plane at 0 hull.
function damagePlane(b, amt, canKillCrew) {
  if (!b.userData.alive) return;
  b.userData.hull -= amt;
  if (b === bomber) game.shake = Math.min(0.5, game.shake + amt * 0.02);
  if (canKillCrew && Math.random() < 0.16) killRandomCrew(b);
  if (b.userData.hull <= 0) destroyPlane(b);
}

function killRandomCrew(b) {
  const alive = CREW_KEYS.filter((k) => b.userData.crew[k]);
  if (!alive.length) return;
  const k = alive[Math.floor(Math.random() * alive.length)];
  b.userData.crew[k] = false;
  if (b === bomber) {
    feed(dom, CREW_LABEL[k] + ' KILLED', 'bad');
    refreshUI();
    if (k === stationKey()) bailStation();
  }
  if (CREW_KEYS.every((x) => !b.userData.crew[x])) destroyPlane(b);
}

function destroyPlane(b) {
  if (!b.userData.alive) return;
  b.userData.alive = false;
  b.userData.hull = 0;
  b.userData.dying = 3;
  effects.explosion(b.getWorldPosition(_tmp).clone(), { color: 0xff7733, size: 3, count: 24 });
  audio.play('boom', 0.7);
  const idx = squadron.indexOf(b);
  feed(dom, 'SHIP ' + (idx + 1) + ' DOWN', 'bad');
  const survivors = squadron.filter((p) => p.userData.alive);
  if (!survivors.length) { endMission(false); return; }
  if (b === bomber) {
    const j = squadron.indexOf(survivors[0]);
    switchToPlane(j, null);
    feed(dom, 'BAILED TO SHIP ' + (j + 1), 'good');
  } else {
    refreshUI();
  }
}

// Current station's crew was killed: hop to another station, else lose the plane.
function bailStation() {
  const st = firstAliveStation(bomber);
  if (!st) { destroyPlane(bomber); return; }
  applyStation(st);
  feed(dom, 'MOVED TO ' + CREW_LABEL[st.role === 'gunner' ? 'g' + st.turret : st.role], 'good');
}

fighters.onHullHit = (dmg) => {
  // fighters work the whole formation: usually your plane, sometimes a wingman
  const others = squadron.filter((p) => p.userData.alive && p !== bomber);
  const target = (others.length && Math.random() < 0.3)
    ? others[Math.floor(Math.random() * others.length)] : bomber;
  damagePlane(target, dmg, true);
  audio.play('hit', 0.4);
};
bombs.onHit = (hit) => {
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
  pi.panel.classList.toggle('hidden', name !== 'pilot');
  input.setMode(name);
}

// ------------------------------- UI wiring ---------------------------------
document.querySelectorAll('.role-btn').forEach((b) =>
  b.addEventListener('click', () => {
    if (game.state !== 'playing') return;
    const role = b.dataset.role;
    if (!roleAlive(bomber, role)) { feed(dom, 'NO CREW AT THAT STATION', 'bad'); return; }
    if (role === 'gunner' && !bomber.userData.crew['g' + roles.gunner.index]) {
      for (let i = 0; i < 4; i++) if (bomber.userData.crew['g' + i]) { roles.gunner.index = i; break; }
    }
    setRole(role);
    if (role === 'gunner') roles.gunner.setTurret(roles.gunner.index);
    refreshUI();
  }));

document.querySelectorAll('.turret-btn').forEach((b) =>
  b.addEventListener('click', () => {
    if (game.state !== 'playing') return;
    const i = Number(b.dataset.turret);
    if (!bomber.userData.crew['g' + i]) { feed(dom, 'GUNNER DOWN', 'bad'); return; }
    roles.gunner.setTurret(i);
    refreshUI();
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
    hull: 100, score: 0, kills: 0, bombsLeft: BOMB_LOAD, hits: 0,
    targetDist: Infinity, worldX: 0, flakTimer: 0, shake: 0, fuel: 100, engineTemp: 70,
  });
  dropped = 0;
  game.time = 0;
  targets.reset();
  world.setLateral(0);
  activePlane = 0;
  bomber = squadron[0];
  game.bomber = bomber;
  squadron.forEach((b) => { b.position.set(0, 0, 0); b.rotation.set(0, 0, 0); initPlaneState(b); });
  layoutSquadron();
  dom.planeName.textContent = FORMATION[0].name;
  fighters.reset();
  bombs.reset();
  dom.start.classList.add('hidden');
  dom.over.classList.add('hidden');
  dom.hud.classList.remove('hidden');
  setRole('pilot');
  refreshUI();
}

function endMission(won) {
  game.state = 'over';
  dom.hud.classList.add('hidden');
  dom.over.classList.remove('hidden');
  dom.over.classList.toggle('win', won);
  dom.over.classList.toggle('lose', !won);
  const totalB = RAID_TARGETS * BUILDINGS_PER_TARGET;
  const survivors = squadron.filter((p) => p.userData.alive).length;
  const hull = Math.max(0, Math.round(game.hull));
  const hullBonus = hull * 10;
  const shipBonus = survivors * 250;
  game.score += hullBonus + shipBonus;
  dom.overTitle.textContent = won
    ? (game.hits >= totalB ? 'TARGETS OBLITERATED' : 'RAID COMPLETE')
    : 'SQUADRON LOST';
  dom.overStats.innerHTML = `
    <div>Structures destroyed: <b>${game.hits} / ${totalB}</b></div>
    <div>Ships returned: <b>${survivors} / ${squadron.length}</b></div>
    <div>Fighters splashed: <b>${game.kills}</b></div>
    <div>Flagship hull: <b>${hull}%</b></div>
    <div>Bonus: <b>+${hullBonus + shipBonus}</b></div>
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
    // close bursts damage the active plane's hull
    if (p.length() < 55 && Math.random() < 0.5) damagePlane(bomber, 4 + Math.random() * 6, false);
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
    // forward flight: scroll the endless terrain and the targets beneath us
    world.scrollWorld(-game.airspeed * dt);
    targets.update(dt, game.airspeed);
    world.setLateral(game.worldX);
    targets.setLateral(game.worldX);
    game.targetDist = targets.nextDist();
    game.heading = 92 + input.stick.x * 6 + game.worldX * 0.02;

    game.time += dt;
    // spin every plane's propellers
    for (const b of squadron) b.userData.props.forEach((p) => (p.rotation.z += dt * 40));

    current.update(dt, input);
    layoutSquadron();
    updateWrecks(dt);
    fighters.update(dt, true);
    bombs.update(dt);
    effects.update(dt);
    updateFlak(dt);
    // HUD hull tracks the plane you're currently flying
    game.hull = bomber.userData.hull;
    // fuel burn + engine temperature respond to throttle and battle damage
    game.fuel = Math.max(0, game.fuel - (0.25 + input.throttle * 0.9) * dt);
    const tempTarget = 55 + input.throttle * 95 + (100 - bomber.userData.hull) * 0.35;
    game.engineTemp += (tempTarget - game.engineTemp) * Math.min(1, dt * 0.5);
    if (game.roleKey === 'pilot') updatePilotInstruments();
    // bomb count from what's been dropped
    game.bombsLeft = Math.max(0, BOMB_LOAD - dropped);

    // raid ends once every target complex has passed behind us
    if (targets.raidOver() && game.state === 'playing') endMission(true);
    // difficulty ramps over the course of the raid
    fighters.difficulty = 1 + Math.min(4, game.time / 25);

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
game.__debug = {
  damageActive: (a, kill = false) => damagePlane(bomber, a, kill),
  killStation: () => killRandomCrew(bomber),
  destroyActive: () => destroyPlane(bomber),
  squadronAlive: () => squadron.map((p) => p.userData.alive),
  activeIndex: () => activePlane,
};

requestAnimationFrame(frame);
