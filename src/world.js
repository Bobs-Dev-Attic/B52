import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Endless, procedurally-recycled countryside. The bomber is stationary at the
// world origin; the terrain scrolls beneath it. Terrain is built from a ring of
// strip "chunks": once a chunk falls behind the bomber it is teleported back to
// the front of the ring and its fields/scenery are re-randomised, so the ground
// never runs out and never looks quite the same twice.
// ---------------------------------------------------------------------------

export const GROUND_Y = -320;         // altitude of the terrain below the bomber

const TILE = 350;                     // field cell size
const NX = 12;                        // cells across (x)
const NZ = 3;                         // cells deep per chunk (z)
const CHUNK_LEN = TILE * NZ;          // 1050
const CHUNK_W = TILE * NX;            // 4200
const NCHUNKS = 8;                    // enough to cover from behind out past the fog
const REAR_Z = -1400;                 // recycle a chunk once its centre passes this

const FIELD_COLORS = [0x6f7d46, 0x7d8a4f, 0x8a7f4a, 0x5f6d40, 0x93894f, 0x788a4a];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(scene) {
  scene.background = new THREE.Color(0x93b4cf);
  scene.fog = new THREE.Fog(0x9fbdd6, 1300, 4600);

  const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x556044, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
  sun.position.set(-200, 260, 180);
  scene.add(sun);

  const rand = mulberry32(20260715);

  const terrain = new THREE.Group();
  terrain.position.y = GROUND_Y;
  scene.add(terrain);

  const coneGeo = new THREE.ConeGeometry(1, 1, 6); // unit cone, scaled per feature

  // Re-randomise a chunk's field colours and scatter its hills/forests.
  function scatterChunk(chunk) {
    for (const m of chunk.userData.tiles) {
      m.material.color.setHex(FIELD_COLORS[Math.floor(rand() * FIELD_COLORS.length)]);
    }
    for (const h of chunk.userData.scenery) {
      const forest = rand() > 0.5;
      const r = forest ? 4 + rand() * 4 : 18 + rand() * 26;
      const ht = forest ? 12 + rand() * 22 : 12 + rand() * 40;
      h.scale.set(r, ht, r);
      h.material.color.setHex(forest ? 0x2f4a2a : 0x556b3d);
      h.position.set((rand() - 0.5) * CHUNK_W * 0.92, ht / 2, (rand() - 0.5) * CHUNK_LEN);
    }
  }

  const chunks = [];
  for (let c = 0; c < NCHUNKS; c++) {
    const chunk = new THREE.Group();
    chunk.position.z = -CHUNK_LEN + c * CHUNK_LEN;
    const tiles = [];
    for (let ix = 0; ix < NX; ix++) {
      for (let iz = 0; iz < NZ; iz++) {
        const t = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE, TILE),
          new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 })
        );
        t.rotation.x = -Math.PI / 2;
        t.position.set((ix - (NX - 1) / 2) * TILE, 0, (iz - (NZ - 1) / 2) * TILE);
        chunk.add(t);
        tiles.push(t);
      }
    }
    const scenery = [];
    for (let s = 0; s < 9; s++) {
      const h = new THREE.Mesh(coneGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 }));
      chunk.add(h);
      scenery.push(h);
    }
    chunk.userData = { tiles, scenery };
    scatterChunk(chunk);
    terrain.add(chunk);
    chunks.push(chunk);
  }

  // Clouds
  const clouds = new THREE.Group();
  scene.add(clouds);
  for (let i = 0; i < 26; i++) {
    const cl = makeCloud(rand);
    cl.position.set((rand() - 0.5) * 2600, -40 - rand() * 120, (rand() - 0.5) * 2600);
    clouds.add(cl);
  }

  return {
    terrain, clouds, chunks,
    // Scroll the terrain by dz (negative as the bomber advances) and recycle
    // any chunk that has fallen behind to the front of the ring.
    scrollWorld(dz) {
      for (const ch of chunks) {
        ch.position.z += dz;
        if (ch.position.z < REAR_Z) {
          ch.position.z += NCHUNKS * CHUNK_LEN;
          scatterChunk(ch);
        }
      }
    },
    setLateral(x) { terrain.position.x = x; },
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
