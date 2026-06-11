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

  playMove() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(360, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.07);
    g.gain.setValueAtTime(0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.09);
    o.start(); o.stop(ac.currentTime + 0.1);
  }

  playWarningPulse() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.35);
    g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(0.13, ac.currentTime+0.04);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    o.start(); o.stop(ac.currentTime + 0.45);
  }

  playShift() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(130, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(35, ac.currentTime + 0.5);
    g.gain.setValueAtTime(0.22, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.65);
    o.start(); o.stop(ac.currentTime + 0.7);
    // Noise burst
    const len = Math.floor(ac.sampleRate * 0.25);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0); for (let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const n = ac.createBufferSource(); n.buffer = buf;
    const ng = ac.createGain(); n.connect(ng); ng.connect(ac.destination);
    ng.gain.setValueAtTime(0.07, ac.currentTime); ng.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.25);
    n.start();
  }

  playKeyCollect() {
    const ac = this.ac; if (!ac) return;
    [880, 1108].forEach((freq, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.connect(g); g.connect(ac!.destination);
      o.type = 'sine';
      const t = ac!.currentTime + i * 0.065;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.28);
      o.start(t); o.stop(t+0.32);
    });
  }

  playLevelComplete() {
    const ac = this.ac; if (!ac) return;
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.connect(g); g.connect(ac!.destination);
      o.type = 'sine';
      const t = ac!.currentTime + i * 0.13;
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t+0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t+0.4);
      o.start(t); o.stop(t+0.45);
    });
  }

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

  playGameOver() {
    const ac = this.ac; if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 1.5);
    g.gain.setValueAtTime(0.18, ac.currentTime); g.gain.setValueAtTime(0.18, ac.currentTime+1.0);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.8);
    o.start(); o.stop(ac.currentTime + 2.0);
  }

  toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
}

export const audio = new AudioManager();
