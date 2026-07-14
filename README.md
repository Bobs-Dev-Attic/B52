# B-52 RAID — WWII Bomber Crew Simulator

A mobile-first, low-poly **3D bomber crew game**. You fly a WWII heavy bomber on
a daylight raid over Germany and switch freely between three crew positions:

| Position | What you do |
| --- | --- |
| 🛩️ **Pilot** | Steer the ship, climb/dive, work the throttle and hold your line through the flak toward the target. |
| 🔫 **Gunner** | Man the four gun turrets (top, tail, nose, belly), track incoming Luftwaffe fighters and splash them before they chew up the hull. Watch the gun heat. |
| 💣 **Bombardier** | Look down through the glazed nose, line the target up under the bombsight, and release your stick of bombs — the predictor shows where they'll actually fall. |

The bomber keeps flying (autopilot holds heading) while you're at a turret or the
bombsight, so a single player runs the whole crew by hopping between stations.

You fly in a **squadron of four B-52s** in a combat box. Use the **SQUADRON**
selector (top of the screen) to jump to any plane in the formation, then pick a
crew position on it — so you can be tail gunner on one ship and pilot on another.
Each plane has **four gun stations** (top, tail, nose, belly), so a full crew
means several gunners covering every angle.

## Gameplay loop

1. **Ingress** — fighters come in waves. Jump to the turrets and shoot them down;
   every hit they land drops your hull integrity.
2. **Line up** — as pilot, drift laterally and set your altitude so the flight
   path runs over the factory complex.
3. **Bomb run** — switch to the bombardier, wait until the target ring slides
   under the red impact predictor, and release. Flak thickens the closer you get.
4. **Egress / score** — once the target passes behind you the raid ends. Score
   comes from fighters splashed, targets destroyed, and hull remaining.

## Controls

**Touch (mobile)**
- Pilot: left **virtual stick** to bank/climb, **throttle** slider for speed.
- Gunner: **drag** anywhere to aim, **FIRE** button to shoot, turret buttons to switch positions.
- Bombardier: **drag** to fine-tune the sight, **DROP BOMBS** to release.
- Tap the bottom bar to switch crew positions at any time.

**Desktop**
- `W A S D` / arrow keys — fly · `Q`/`E` — throttle
- Drag mouse — aim (gunner/bombardier) · `Space` — fire · `B` — drop bombs

## Running it

The game is a static site with **no build step**. Three.js is vendored in
`vendor/` so it works fully offline — just serve the folder over HTTP:

```bash
npm start           # -> http://localhost:8080  (uses the bundled zero-dep server)
# or any static server, e.g.:
python3 -m http.server 8080
```

Then open the URL on your phone or desktop browser. (Opening `index.html`
directly via `file://` won't work because ES modules need HTTP.)

## Tech

- **Three.js** (WebGL) — vendored, no CDN, no bundler.
- All geometry is built from primitives (boxes, cones, cylinders) for a clean
  **low-poly** look with flat shading — no external art assets.
- Sound is synthesized at runtime with the **Web Audio API** — no audio files.

## Project layout

```
index.html        entry point, HUD markup, import map
styles.css        HUD / touch controls / menu styling
serve.js          tiny zero-dependency static file server
vendor/           vendored three.module.js
src/
  main.js         game loop, state, mission logic, flak, wiring
  world.js        sky, terrain, clouds, target complex
  bomber.js       low-poly bomber model + turret / bomb-bay anchors
  fighters.js     enemy fighter spawning & attack AI
  bombs.js        bomb ballistics & target hit detection
  roles.js        pilot / gunner / bombardier camera + controls
  effects.js      tracers, explosions, flak bursts
  input.js        unified touch + keyboard/mouse input
  audio.js        synthesized engine drone & SFX
  hud.js          HUD updates & event feed
```

> Historical note: the real B-52 is a Cold War jet; the WWII USAAF heavy bombers
> were the B-17 and B-24. This game keeps the "B-52" name as requested but models
> a generic four-engine WWII heavy bomber.
