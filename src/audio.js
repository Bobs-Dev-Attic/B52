// ---------------------------------------------------------------------------
// Tiny synthesized sound engine (WebAudio). No audio files to download; every
// effect is generated procedurally. A low engine drone runs continuously.
// ---------------------------------------------------------------------------

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { this.enabled = false; return; }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startEngine();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _startEngine() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.10; g.connect(this.master);
    // two detuned saws + lowpass = four-engine drone
    for (const f of [55, 82, 110]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      o.connect(lp); lp.connect(g); o.start();
    }
    this.engineGain = g;
  }

  setThrottle(t) { if (this.engineGain) this.engineGain.gain.value = 0.06 + t * 0.10; }

  play(name, vol = 0.5) {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    const g = c.createGain(); g.connect(this.master);
    switch (name) {
      case 'gun': {
        const o = c.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(180, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.05);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        const n = this._noise(0.05, vol * 0.6); n.connect(g);
        o.connect(g); o.start(now); o.stop(now + 0.07);
        break;
      }
      case 'enemyGun': {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(120, now);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        o.connect(g); o.start(now); o.stop(now + 0.06);
        break;
      }
      case 'boom': {
        const src = this._noise(0.5, vol);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, now);
        lp.frequency.exponentialRampToValueAtTime(90, now + 0.4);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        src.connect(lp); lp.connect(g);
        break;
      }
      case 'drop': {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(700, now);
        o.frequency.exponentialRampToValueAtTime(120, now + 0.5);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.connect(g); o.start(now); o.stop(now + 0.5);
        break;
      }
      case 'hit': {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, now);
        o.frequency.exponentialRampToValueAtTime(60, now + 0.2);
        g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o.connect(g); o.start(now); o.stop(now + 0.25);
        break;
      }
    }
  }

  _noise(dur, vol) {
    const c = this.ctx, now = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = vol; src.connect(g); src.start(now);
    return g;
  }
}
