# Changelog

All notable changes to **B-52 Raid** are recorded here. Versioning follows
`MAJOR.MINOR.PATCH`. The version is shown on the game's title screen and as a
tag in the corner, and is kept in sync across `package.json`, `src/main.js`
(`VERSION`), and this file.

## [0.2.0] — 2026-07-14
### Added
- **Squadron of four B-52s** flying in a combat box. A new **SQUADRON** selector
  lets you jump to any plane in the formation and take any crew position on it.
- Coloured tail-fin bands so squadron ships are easy to tell apart.
- On-screen **version indicator** (title screen + persistent corner tag).

### Fixed
- **Propellers** now mount at the wing leading edge facing forward — they sit in
  front of the wings instead of pointing out sideways.
- **Gunner turret aim**: the horizontal axis was inverted; dragging right now
  swings the view right.

## [0.1.0] — 2026-07-14
### Added
- Initial release: mobile low-poly 3D WWII heavy-bomber crew simulator.
- Three crew positions — **pilot** (fly/climb/throttle), **gunner** (four turrets:
  top/tail/nose/belly), and **bombardier** (bombsight with impact predictor).
- Enemy Luftwaffe fighter waves with attack AI, flak over the target, hull
  integrity, scoring, and a full ingress → bomb-run → egress mission loop.
- Fully self-contained: low-poly primitives (no art assets), Web Audio SFX,
  Three.js vendored locally (no CDN, no build step).
