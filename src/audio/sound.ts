// ============================================================
// KotoNardy — синтез звуков через WebAudio (без внешних файлов)
// ============================================================

export type SoundName =
  | 'dice'
  | 'place'
  | 'select'
  | 'hit'
  | 'victory'
  | 'meow'
  | 'undo';

interface SoundSettings {
  volume: number; // 0..1
  soundsOn: boolean;
  musicOn: boolean;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  settings: SoundSettings = { volume: 0.7, soundsOn: true, musicOn: false };

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.applyVolume();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  applyVolume(): void {
    if (this.master) this.master.gain.value = this.settings.soundsOn ? this.settings.volume : 0;
  }

  setSettings(s: Partial<SoundSettings>): void {
    this.settings = { ...this.settings, ...s };
    this.applyVolume();
    if (this.settings.musicOn) this.startMusic();
    else this.stopMusic();
  }

  /** вызвать на первом жесте пользователя */
  unlock(): void {
    this.ensure();
  }

  play(name: SoundName): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.settings.soundsOn) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'dice': {
        // шум броска + два стука
        this.noiseBurst(t, 0.18, 900, 0.5);
        this.thump(t + 0.12, 140, 0.5);
        this.thump(t + 0.24, 110, 0.4);
        break;
      }
      case 'place': {
        // деревянный стук лапки
        this.thump(t, 190, 0.55);
        this.noiseBurst(t, 0.05, 1400, 0.16);
        break;
      }
      case 'select': {
        this.tone(t, 660, 0.05, 0.12, 'sine');
        break;
      }
      case 'hit': {
        // сбивание: резкий стук + тихое «мяу»
        this.thump(t, 90, 0.8);
        this.noiseBurst(t, 0.08, 700, 0.4);
        this.meowAt(t + 0.05, 0.25);
        break;
      }
      case 'undo': {
        this.tone(t, 440, 0.07, 0.1, 'triangle');
        this.tone(t + 0.06, 330, 0.08, 0.1, 'triangle');
        break;
      }
      case 'victory': {
        const notes = [523, 659, 784, 1047, 784, 1047];
        notes.forEach((f, i) => this.tone(t + i * 0.13, f, 0.22, 0.16, 'triangle'));
        this.meowAt(t + 0.8, 0.5);
        break;
      }
      case 'meow': {
        this.meowAt(t, 0.45);
        break;
      }
    }
  }

  private tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private thump(t: number, freq: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.09);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + 0.15);
  }

  private noiseBurst(t: number, dur: number, cutoff: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master!);
    src.start(t);
  }

  private meowAt(t: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2.5;
    o.type = 'sawtooth';
    // «мяу»: подъём-тягучее падение
    o.frequency.setValueAtTime(620, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(f);
    f.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + 0.6);
  }

  /** Тихая генеративная музыка — медленные аккорды, без мяуканья */
  startMusic(): void {
    const ctx = this.ensure();
    if (!ctx || this.musicTimer !== null) return;
    const chords = [
      [220, 277, 330], // Am
      [196, 247, 294], // G
      [175, 220, 262], // F
      [220, 262, 330], // C/G
    ];
    let step = 0;
    const playChord = () => {
      if (!this.ctx || !this.musicGain || !this.settings.musicOn) return;
      const t = this.ctx.currentTime;
      const chord = chords[step % chords.length];
      step++;
      for (const f of chord) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09, t + 1.4);
        g.gain.linearRampToValueAtTime(0.0, t + 5.2);
        o.connect(g);
        g.connect(this.musicGain);
        o.start(t);
        o.stop(t + 5.4);
      }
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 5200);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const sound = new SoundManager();
