import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Low-poly heavy bomber. Built entirely from primitives so there are no asset
// downloads. Exposes named turret anchors + a bomb-bay anchor the crew roles
// attach their cameras to.
// ---------------------------------------------------------------------------

const OLIVE = 0x5b6b45;
const OLIVE_DK = 0x3f4a30;
const METAL = 0x8a8f84;
const GLASS = 0x9fd0e0;

function mat(color, flat = true) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: flat,
    roughness: 0.85,
    metalness: 0.15,
  });
}

function makeEngine() {
  const g = new THREE.Group();
  const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.6, 8), mat(OLIVE_DK));
  nacelle.rotation.z = Math.PI / 2;
  g.add(nacelle);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 8), mat(METAL));
  hub.rotation.z = -Math.PI / 2;
  hub.position.x = 1.6;
  g.add(hub);
  // spinning prop
  const prop = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.22), mat(0x24261d));
  prop.add(blade);
  const blade2 = blade.clone(); blade2.rotation.x = Math.PI / 2; prop.add(blade2);
  prop.position.x = 1.75;
  prop.rotation.z = Math.PI / 2;
  g.add(prop);
  g.userData.prop = prop;
  return g;
}

function makeTurret(color = METAL) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(GLASS));
  dome.material.transparent = true;
  dome.material.opacity = 0.55;
  dome.material.metalness = 0.4;
  g.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 10), mat(color));
  base.position.y = -0.12;
  g.add(base);
  // twin barrels
  const yoke = new THREE.Group();
  const barrelGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6);
  const b1 = new THREE.Mesh(barrelGeo, mat(0x2a2c22)); b1.rotation.x = Math.PI / 2; b1.position.set(-0.14, 0.15, 0.6);
  const b2 = new THREE.Mesh(barrelGeo, mat(0x2a2c22)); b2.rotation.x = Math.PI / 2; b2.position.set(0.14, 0.15, 0.6);
  yoke.add(b1, b2);
  g.add(yoke);
  g.userData.yoke = yoke;
  return g;
}

export function createBomber() {
  const bomber = new THREE.Group();
  bomber.name = 'bomber';

  // Fuselage
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 14, 12), mat(OLIVE));
  fuse.rotation.x = Math.PI / 2;
  bomber.add(fuse);

  // Nose cone (glazed bombardier position)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), mat(GLASS));
  nose.material.transparent = true; nose.material.opacity = 0.5; nose.material.metalness = 0.4;
  nose.scale.set(1, 1, 1.4);
  nose.position.z = 7;
  bomber.add(nose);

  // Cockpit
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 2), mat(GLASS));
  cockpit.material.transparent = true; cockpit.material.opacity = 0.55; cockpit.material.metalness = 0.4;
  cockpit.position.set(0, 0.75, 4.4);
  bomber.add(cockpit);

  // Tail cone
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 12), mat(OLIVE));
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -8;
  bomber.add(tail);

  // Main wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(24, 0.3, 3.4), mat(OLIVE));
  wing.position.set(0, 0.1, 1);
  bomber.add(wing);

  // Tailplane + fin
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(9, 0.25, 1.6), mat(OLIVE));
  tailplane.position.set(0, 0.4, -7.4);
  bomber.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 1.8), mat(OLIVE));
  fin.position.set(0, 1.7, -7.4);
  bomber.add(fin);

  // Engines (4, two per wing)
  const engineX = [-8.5, -4.5, 4.5, 8.5];
  bomber.userData.props = [];
  for (const x of engineX) {
    const e = makeEngine();
    e.position.set(x, -0.2, 1.4);
    bomber.add(e);
    bomber.userData.props.push(e.userData.prop);
  }

  // Star insignia on wings (simple emblem)
  const starGeo = new THREE.CircleGeometry(0.9, 5);
  for (const s of [-6, 6]) {
    const star = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xf0f0e0, side: THREE.DoubleSide }));
    star.rotation.x = -Math.PI / 2;
    star.position.set(s, 0.27, 1);
    bomber.add(star);
  }

  // ------- Turrets (index order matches HUD selector) -------
  // 0 top, 1 tail, 2 nose, 3 belly
  const turretDefs = [
    { name: 'top',   pos: [0, 1.0, 0.5],   yaw: 0,          view: [0, 2.4, 0.5],  forward: [0, 0.15, 1] },
    { name: 'tail',  pos: [0, 0.4, -8.6],  yaw: Math.PI,    view: [0, 1.2, -10],  forward: [0, 0.1, -1] },
    { name: 'nose',  pos: [0, -0.2, 7.4],  yaw: 0,          view: [0, 0.4, 8.6],  forward: [0, -0.05, 1] },
    { name: 'belly', pos: [0, -1.0, 0.5],  yaw: 0,          view: [0, -2.2, 0.5], forward: [0, -0.2, 1] },
  ];
  const turrets = [];
  for (const def of turretDefs) {
    const t = makeTurret();
    t.position.set(...def.pos);
    if (def.name === 'belly') t.rotation.x = Math.PI; // dome points down
    bomber.add(t);
    turrets.push({ ...def, group: t, yoke: t.userData.yoke });
  }
  bomber.userData.turrets = turrets;

  // Bomb-bay anchor (bombardier drops from here)
  const bay = new THREE.Object3D();
  bay.position.set(0, -0.7, 0.5);
  bomber.add(bay);
  bomber.userData.bombBay = bay;

  // Pilot camera anchor
  const pilotSeat = new THREE.Object3D();
  pilotSeat.position.set(0, 0.9, 5.0);
  bomber.add(pilotSeat);
  bomber.userData.pilotSeat = pilotSeat;

  return bomber;
}
