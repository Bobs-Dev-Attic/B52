import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The world the raid flies over: sky dome, sun, low-poly German countryside
// that scrolls beneath the (stationary) bomber, drifting clouds, the target
// complex, and the flak field around it.
// ---------------------------------------------------------------------------

export const GROUND_Y = -320;         // altitude of terrain below the bomber
export const TARGET_START_DIST = 5200; // metres of "route" until the target

export function createWorld(scene) {
  scene.background = new THREE.Color(0x93b4cf);
  scene.fog = new THREE.Fog(0x9fbdd6, 1300, 4600);

  // Sun / sky lighting
  const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x556044, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
  sun.position.set(-200, 260, 180);
  scene.add(sun);

  // Ground plane — a big low-poly field grid tinted like farmland
  const ground = new THREE.Group();
  ground.position.y = GROUND_Y;
  scene.add(ground);

  const fieldColors = [0x6f7d46, 0x7d8a4f, 0x8a7f4a, 0x5f6d40, 0x93894f];
  const tile = 260;
  const half = 8;
  for (let ix = -half; ix <= half; ix++) {
    for (let iz = -half; iz <= half; iz++) {
      const geo = new THREE.PlaneGeometry(tile, tile);
      const m = new THREE.MeshStandardMaterial({
        color: fieldColors[(Math.abs(ix * 7 + iz * 3)) % fieldColors.length],
        flatShading: true, roughness: 1,
      });
      const p = new THREE.Mesh(geo, m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(ix * tile, 0, iz * tile);
      ground.add(p);
    }
  }

  // A winding river ribbon
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(90, tile * (half * 2 + 1)),
    new THREE.MeshStandardMaterial({ color: 0x4a6d8a, roughness: 0.4, metalness: 0.2, flatShading: true })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(-260, 1, 0);
  ground.add(river);

  // Scatter low-poly hills / forests as cones + boxes
  const rand = mulberry32(1337);
  for (let i = 0; i < 90; i++) {
    const x = (rand() - 0.5) * tile * (half * 2);
    const z = (rand() - 0.5) * tile * (half * 2);
    if (rand() > 0.5) {
      const h = 12 + rand() * 40;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(20 + rand() * 30, h, 6),
        new THREE.MeshStandardMaterial({ color: 0x556b3d, flatShading: true, roughness: 1 }));
      hill.position.set(x, h / 2, z);
      ground.add(hill);
    } else {
      const s = 6 + rand() * 10;
      const tree = new THREE.Mesh(new THREE.ConeGeometry(s * 0.7, s * 2.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x2f4a2a, flatShading: true, roughness: 1 }));
      tree.position.set(x, s * 1.1, z);
      ground.add(tree);
    }
  }

  // ---- Target complex (factories) placed far "ahead"; slides toward bomber
  const target = new THREE.Group();
  target.position.set(40, 4, TARGET_START_DIST);
  ground.add(target);

  const targets = [];
  const layout = [
    [0, 0, 60, 30, 34], [70, 0, 40, 24, 28], [-70, 10, 46, 26, 30],
    [30, -70, 54, 30, 32], [-40, -60, 38, 20, 26],
  ];
  for (const [lx, lz, w, h, d] of layout) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: 0x6a5f52, flatShading: true, roughness: 1 }));
    b.position.set(lx, h / 2, lz);
    target.add(b);
    // roof detail
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 3, d * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x54483d, flatShading: true }));
    roof.position.set(lx, h + 1.5, lz);
    target.add(roof);
    // smokestacks
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 34, 8),
      new THREE.MeshStandardMaterial({ color: 0x7a4a3a, flatShading: true }));
    stack.position.set(lx + w * 0.3, 17, lz + d * 0.3);
    target.add(stack);
    targets.push({ mesh: b, x: lx, z: lz, w, d, destroyed: false });
  }
  target.userData.buildings = targets;

  // Marker ring so the bombardier can find the aim point
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(90, 100, 32),
    new THREE.MeshBasicMaterial({ color: 0xff5533, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2;
  target.add(ring);

  // Clouds (billboarded flat planes)
  const clouds = new THREE.Group();
  scene.add(clouds);
  for (let i = 0; i < 26; i++) {
    const c = makeCloud(rand);
    c.position.set((rand() - 0.5) * 2600, -40 - rand() * 120, (rand() - 0.5) * 2600);
    clouds.add(c);
  }

  return {
    ground, clouds, target,
    targetBuildings: targets,
    scrollGround(dz) { ground.position.z += dz; },
  };
}

function makeCloud(rand) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xf3f6fa, flatShading: true, roughness: 1, transparent: true, opacity: 0.9 });
  const puffs = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const s = 24 + rand() * 34;
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), m);
    puff.position.set((rand() - 0.5) * 90, (rand() - 0.5) * 18, (rand() - 0.5) * 60);
    puff.scale.y = 0.6;
    g.add(puff);
  }
  return g;
}

// Deterministic PRNG so the terrain looks the same each run.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
