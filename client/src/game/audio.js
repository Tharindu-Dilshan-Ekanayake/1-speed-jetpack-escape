/**
 * Procedural sound effects and music with the Web Audio API — no audio files.
 * The context can only start after a user gesture, so `audio.init()` is
 * called from the Play button.
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12)

class GameAudio {
  constructor() {
    this.ctx = null
    this.sfxVolume = 0.8
    this.musicVolume = 0.35
    this.jet = null
    this.musicTimer = null
  }

  init() {
    if (this.ctx) {
      this.ctx.resume?.()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.masterVolume ?? 0.8
    this.master.connect(this.ctx.destination)
    this.sfx = this.ctx.createGain()
    this.sfx.gain.value = this.sfxVolume
    this.sfx.connect(this.master)
    this.music = this.ctx.createGain()
    this.music.gain.value = this.musicVolume * 0.5
    this.music.connect(this.master)
    this.noiseBuffer = this.makeNoise()
    this.startJetLoop()
    this.startMusic()
  }

  setVolumes(music, sfx, master = 1) {
    this.musicVolume = music
    this.sfxVolume = sfx
    this.masterVolume = master
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05)
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05)
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05)
  }

  makeNoise() {
    const len = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1
    return buffer
  }

  tone({ freq = 440, to, type = 'sine', dur = 0.15, vol = 0.3, delay = 0, attack = 0.005, dest }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(dest || this.sfx)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  noise({ dur = 0.2, vol = 0.2, filter = 'lowpass', freq = 1200, to, q = 1, delay = 0 }) {
    if (!this.ctx) return
    const t = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = this.ctx.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(freq, t)
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.sfx)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  play(name, opts = {}) {
    if (!this.ctx) return
    switch (name) {
      case 'click':
        this.tone({ freq: 900, to: 1300, dur: 0.06, vol: 0.12, type: 'triangle' })
        break
      case 'open':
        this.tone({ freq: 500, to: 900, dur: 0.12, vol: 0.12, type: 'sine' })
        break
      case 'step':
        this.noise({ dur: 0.05, vol: 0.05, freq: 900 })
        break
      case 'jump':
        this.tone({ freq: 280, to: 620, dur: 0.14, vol: 0.14, type: 'triangle' })
        break
      case 'land':
        this.tone({ freq: 140, to: 50, dur: 0.18, vol: Math.min(0.35, 0.1 + (opts.impact || 0) / 300) })
        this.noise({ dur: 0.12, vol: 0.08, freq: 500 })
        break
      case 'bounce':
        this.tone({ freq: 200, to: 900, dur: 0.35, vol: 0.2, type: 'sine' })
        break
      case 'steps':
        this.tone({ freq: 1400 + Math.random() * 200, dur: 0.05, vol: 0.04, type: 'sine' })
        break
      case 'levelUp':
        ;[72, 76, 79, 84].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.25, vol: 0.18, type: 'triangle', delay: i * 0.07 }))
        this.tone({ freq: NOTE(91), dur: 0.5, vol: 0.06, type: 'sine', delay: 0.28 })
        break
      case 'trophy':
        ;[76, 79, 83, 88, 91].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.4, vol: 0.16, type: 'triangle', delay: i * 0.08 }))
        this.noise({ dur: 0.8, vol: 0.06, filter: 'highpass', freq: 6000, delay: 0.1 })
        break
      case 'buy':
        this.tone({ freq: NOTE(84), dur: 0.12, vol: 0.18, type: 'square' })
        this.tone({ freq: NOTE(91), dur: 0.3, vol: 0.15, type: 'square', delay: 0.09 })
        break
      case 'error':
        this.tone({ freq: 160, dur: 0.18, vol: 0.12, type: 'square' })
        break
      case 'tick':
        this.tone({ freq: 1800, dur: 0.03, vol: 0.06, type: 'square' })
        break
      case 'reveal': {
        const rare = opts.rank || 0
        const base = [60, 64, 67, 72, 76]
        base.slice(0, 3 + Math.min(2, rare)).forEach((n, i) => this.tone({ freq: NOTE(n + rare * 2), dur: 0.5, vol: 0.16, type: 'triangle', delay: i * 0.09 }))
        if (rare >= 3) this.noise({ dur: 1.2, vol: 0.08, filter: 'highpass', freq: 5000, delay: 0.3 })
        break
      }
      case 'death':
        this.tone({ freq: 420, to: 140, dur: 0.35, vol: 0.22, type: 'triangle' })
        this.tone({ freq: 210, to: 90, dur: 0.35, vol: 0.12, type: 'square' })
        break
      case 'pumpkin':
        this.tone({ freq: 600, to: 1200, dur: 0.1, vol: 0.15 })
        this.tone({ freq: NOTE(84), dur: 0.3, vol: 0.12, type: 'triangle', delay: 0.08 })
        break
      case 'whoosh':
        this.noise({ dur: 0.45, vol: 0.18, filter: 'bandpass', freq: 400, to: 3000, q: 2 })
        break
      case 'coin': {
        // Classic two-note "bling", climbing a little with each coin in a row.
        const up = Math.min(7, opts.combo || 0)
        this.tone({ freq: NOTE(83 + up), dur: 0.07, vol: 0.13, type: 'square' })
        this.tone({ freq: NOTE(88 + up), dur: 0.22, vol: 0.11, type: 'square', delay: 0.06 })
        break
      }
      case 'quest':
        ;[79, 84, 88].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.3, vol: 0.15, type: 'triangle', delay: i * 0.09 }))
        break
      case 'spin':
        this.noise({ dur: 0.5, vol: 0.07, filter: 'bandpass', freq: 1800, to: 500, q: 3 })
        this.tone({ freq: 520, to: 1040, dur: 0.3, vol: 0.05, type: 'sine' })
        break
      case 'beep':
        this.tone({ freq: opts.go ? 1320 : 660, dur: opts.go ? 0.5 : 0.18, vol: 0.2, type: 'square' })
        break
      case 'rebirth':
        ;[60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone({ freq: NOTE(n), dur: 0.5, vol: 0.14, type: 'triangle', delay: i * 0.06 }))
        this.noise({ dur: 1.5, vol: 0.08, filter: 'highpass', freq: 4000, delay: 0.2 })
        break
      default:
        break
    }
  }

  /* ---- continuous jetpack roar ---------------------------------------- */

  startJetLoop() {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 500
    f.Q.value = 0.8
    const g = this.ctx.createGain()
    g.gain.value = 0
    src.connect(f)
    f.connect(g)
    g.connect(this.sfx)
    src.start()
    this.jet = { f, g }
  }

  /** 0..1 every frame while the local jetpack fires. */
  setJet(amount) {
    if (!this.jet) return
    const t = this.ctx.currentTime
    this.jet.g.gain.setTargetAtTime(amount * 0.22, t, 0.06)
    this.jet.f.frequency.setTargetAtTime(380 + amount * 420, t, 0.1)
  }

  /* ---- music ------------------------------------------------------------ */

  startMusic() {
    const bpm = 92
    const beat = 60 / bpm
    // A minor-ish spooky loop: bass + bell arpeggio.
    const bass = [45, 45, 41, 41, 43, 43, 40, 40]
    const arp = [69, 72, 76, 72, 69, 72, 77, 72, 67, 71, 74, 71, 64, 68, 71, 68]
    let step = 0
    let next = this.ctx.currentTime + 0.5
    const schedule = () => {
      if (!this.ctx) return
      while (next < this.ctx.currentTime + 0.4) {
        const delay = next - this.ctx.currentTime
        if (step % 4 === 0) {
          this.tone({ freq: NOTE(bass[(step / 4) % bass.length]), dur: beat * 3.6, vol: 0.12, type: 'triangle', attack: 0.05, delay, dest: this.music })
        }
        this.tone({ freq: NOTE(arp[step % arp.length] + 12), dur: beat * 0.9, vol: 0.045, type: 'sine', delay, dest: this.music })
        step += 1
        next += beat / 2
      }
    }
    this.musicTimer = setInterval(schedule, 100)
  }
}

export const audio = new GameAudio()
