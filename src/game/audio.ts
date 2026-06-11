class AudioManager {
  private ctx: AudioContext | null = null;
  public muted = false;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch { /* not supported */ }
  }

  private get ac(): AudioContext | null {
    if (this.muted || !this.ctx) return null;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Soft step blip — quiet navigation feedback. */
  playMove() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(300, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.06);
    g.gain.setValueAtTime(0.04, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    o.start(); o.stop(ac.currentTime + 0.09);
  }

  /** Low bass thud + noise — maze shifted. */
  playShift() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, ac.currentTime + 0.45);
    g.gain.setValueAtTime(0.16, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.55);
    o.start(); o.stop(ac.currentTime + 0.6);
    // Noise burst
    const len = Math.floor(ac.sampleRate * 0.18);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(); n.buffer = buf;
    const ng = ac.createGain(); n.connect(ng); ng.connect(ac.destination);
    ng.gain.setValueAtTime(0.05, ac.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    n.start();
  }

  /** Ascending arpeggio — maze escaped. */
  playEscape() {
    const ac = this.ac; if (!ac) return;
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.connect(g); g.connect(ac!.destination);
      o.type = 'sine';
      const t = ac!.currentTime + i * 0.11;
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      o.start(t); o.stop(t + 0.4);
    });
  }

  /** Short dull thud — invalid move. */
  playBump() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(120, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.06);
    g.gain.setValueAtTime(0.04, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
    o.start(); o.stop(ac.currentTime + 0.1);
  }

  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
}

export const audio = new AudioManager();
