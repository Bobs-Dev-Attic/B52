// Small helpers for pushing values into the HUD DOM.

export function feed(dom, text, kind = '') {
  const line = document.createElement('div');
  line.className = `feed-line ${kind}`;
  line.textContent = text;
  dom.feed.appendChild(line);
  setTimeout(() => line.remove(), 2300);
}

export function updateHud(dom, g) {
  const altFt = Math.round((g.bomber.position.y - g.GROUND_Y) * 30);
  dom.alt.textContent = altFt.toLocaleString();
  dom.spd.textContent = Math.round(g.airspeed * 1.7);
  dom.hdg.textContent = String(((g.heading % 360) + 360) % 360 | 0).padStart(3, '0');

  const hull = Math.max(0, g.hull);
  dom.hullBar.style.width = `${hull}%`;
  dom.hullBar.style.background = hull > 55
    ? 'linear-gradient(90deg,#6b9d52,#9ecb5e)'
    : hull > 25 ? 'linear-gradient(90deg,#c9a13a,#e0c04a)'
    : 'linear-gradient(90deg,#b23a2a,#e04a3a)';

  if (!isFinite(g.targetDist)) {
    dom.tgtDist.textContent = '--';
  } else {
    const distMi = Math.max(0, g.targetDist / 1609);
    dom.tgtDist.textContent = distMi > 0.05 ? distMi.toFixed(1) : 'OVER';
  }
  dom.bombs.textContent = g.bombsLeft;
  dom.score.textContent = g.score.toLocaleString();
}
