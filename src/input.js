// ---------------------------------------------------------------------------
// Unified input for touch and desktop. Exposes a small state object the role
// controllers read every frame:
//   stick {x,y}   virtual joystick / WASD    (pilot)
//   throttle      0..1                        (pilot)
//   aim {dx,dy}   accumulated look delta      (gunner / bombardier) - consumed
//   firing        gun trigger held
//   dropRequested one-shot bomb release
// ---------------------------------------------------------------------------

export class Input {
  constructor(dom) {
    this.stick = { x: 0, y: 0 };
    this.throttle = 0.7;
    this.aim = { dx: 0, dy: 0 };
    this.firing = false;
    this.dropRequested = false;
    this.mode = 'pilot';

    this._keys = {};
    this._aimPointer = null;
    this._stickPointer = null;
    this.dom = dom;

    this._bindKeyboard();
    this._bindStick(dom.stick);
    this._bindThrottle(dom.throttle);
    this._bindAim(dom.canvas);
    this._bindButtons(dom);
  }

  setMode(mode) { this.mode = mode; this.firing = false; }

  // Called once per frame by each role after reading; folds in keyboard.
  sample() {
    // keyboard steering overrides stick when pressed
    let kx = 0, ky = 0;
    if (this._keys['a'] || this._keys['arrowleft']) kx -= 1;
    if (this._keys['d'] || this._keys['arrowright']) kx += 1;
    if (this._keys['w'] || this._keys['arrowup']) ky -= 1;
    if (this._keys['s'] || this._keys['arrowdown']) ky += 1;
    if (kx || ky) { this.stick.x = kx; this.stick.y = ky; }
    else if (!this._stickPointer) { this.stick.x *= 0.85; this.stick.y *= 0.85; }

    if (this._keys['q']) this.throttle = Math.max(0, this.throttle - 0.01);
    if (this._keys['e']) this.throttle = Math.min(1, this.throttle + 0.01);

    this.firing = this._btnFire || !!this._keys[' '];
  }

  consumeAim() { const a = { ...this.aim }; this.aim.dx = 0; this.aim.dy = 0; return a; }
  consumeDrop() { const d = this.dropRequested; this.dropRequested = false; return d; }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      this._keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'b') this.dropRequested = true;
    });
    addEventListener('keyup', (e) => { this._keys[e.key.toLowerCase()] = false; });
  }

  _bindStick(el) {
    if (!el) return;
    const knob = el.querySelector('#stickKnob');
    const R = 48;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      this.stick.x = dx / R;
      this.stick.y = dy / R;
      if (knob) knob.style.transform = `translate(${dx - 27}px, ${dy - 27}px)`;
    };
    el.addEventListener('pointerdown', (e) => { this._stickPointer = e.pointerId; el.setPointerCapture(e.pointerId); move(e); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => { if (this._stickPointer === e.pointerId) move(e); });
    const end = (e) => {
      if (this._stickPointer === e.pointerId) {
        this._stickPointer = null;
        if (knob) knob.style.transform = 'translate(-27px,-27px)';
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  _bindThrottle(el) {
    if (!el) return;
    const fill = el.querySelector('#throttleFill');
    const set = (e) => {
      const r = el.getBoundingClientRect();
      const t = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      this.throttle = t;
      if (fill) fill.style.height = `${t * 100}%`;
    };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); this._thrPointer = e.pointerId; set(e); e.preventDefault(); });
    el.addEventListener('pointermove', (e) => { if (this._thrPointer === e.pointerId) set(e); });
    el.addEventListener('pointerup', (e) => { if (this._thrPointer === e.pointerId) this._thrPointer = null; });
  }

  _bindAim(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'pilot') return;
      this._aimPointer = e.pointerId;
      this._lastAim = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this._aimPointer !== e.pointerId) return;
      this.aim.dx += e.clientX - this._lastAim.x;
      this.aim.dy += e.clientY - this._lastAim.y;
      this._lastAim = { x: e.clientX, y: e.clientY };
    });
    const end = (e) => { if (this._aimPointer === e.pointerId) this._aimPointer = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // Desktop: hold left mouse to look even without a captured stick
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindButtons(dom) {
    const hold = (el, on, off) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { on(); e.preventDefault(); });
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    };
    hold(dom.fireBtn, () => { this._btnFire = true; }, () => { this._btnFire = false; });
    if (dom.dropBtn) dom.dropBtn.addEventListener('pointerdown', (e) => { this.dropRequested = true; e.preventDefault(); });
  }
}
