// Every sound is synthesised with WebAudio: short oscillator and noise envelopes for the
// effects, and a lookahead step sequencer for the music (a driving bass line under a
// sparse minor-key arpeggio that gains a layer while a boss is alive). No audio files.
// The context is created lazily and unlocked on the first user gesture, as browsers ask;
// if WebAudio is missing the whole module quietly does nothing.

const BASS_LINE = [55, 0, 55, 55, 0, 55, 0, 65.41, 0, 55, 0, 55, 55, 0, 49, 0]; // A1 pulse with F and G turns
const ARP_NOTES = [220, 261.63, 329.63, 440, 329.63, 261.63, 196, 246.94]; // A minor figure
const STEP_SECONDS = 60 / 116 / 2; // 116 BPM, eighth notes

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let musicTimer = null;
  let nextStepTime = 0;
  let stepIndex = 0;
  let intensity = 0;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function tone(freqFrom, freqTo, seconds, type, volume, delay = 0) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqFrom), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, filterFreq, delay = 0) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreq * 0.2), start + seconds);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  function scheduleStep(step, when) {
    const delay = Math.max(0, when - ctx.currentTime);
    const bass = BASS_LINE[step % BASS_LINE.length];
    if (bass) tone(bass, bass, STEP_SECONDS * 0.95, 'sawtooth', 0.16, delay);
    if (step % 2 === 0) noise(0.03, 0.05, 6000, delay); // hat tick
    if (intensity > 0 || step % 4 === 2) {
      const arp = ARP_NOTES[(step >> 1) % ARP_NOTES.length];
      tone(arp, arp, STEP_SECONDS * 1.4, 'triangle', intensity > 0 ? 0.11 : 0.06, delay);
    }
    if (intensity > 0 && step % 16 === 0) tone(110, 110, STEP_SECONDS * 6, 'sine', 0.14, delay); // boss drone root
  }

  function pumpMusic() {
    if (!ctx) return;
    while (nextStepTime < ctx.currentTime + 0.14) {
      scheduleStep(stepIndex, nextStepTime);
      nextStepTime += STEP_SECONDS;
      stepIndex += 1;
    }
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      return muted;
    },
    /** Boss fights raise the music's intensity; anything else lowers it. */
    setIntensity(value) {
      intensity = value;
    },
    startMusic() {
      if (!ctx || musicTimer !== null) return;
      nextStepTime = ctx.currentTime + 0.06;
      stepIndex = 0;
      musicTimer = window.setInterval(pumpMusic, 40);
    },
    stopMusic() {
      if (musicTimer !== null) window.clearInterval(musicTimer);
      musicTimer = null;
    },
    shoot() {
      tone(920, 240, 0.07, 'square', 0.10);
    },
    hit() {
      noise(0.05, 0.10, 2600);
    },
    explosion(big) {
      noise(big ? 0.5 : 0.22, big ? 0.5 : 0.26, big ? 900 : 1500);
      tone(big ? 120 : 160, 38, big ? 0.5 : 0.25, 'sine', big ? 0.5 : 0.3);
    },
    playerHit() {
      tone(210, 55, 0.22, 'sawtooth', 0.32);
      noise(0.14, 0.2, 900);
    },
    dash() {
      noise(0.12, 0.12, 3200);
    },
    pickup() {
      tone(660, 990, 0.08, 'sine', 0.12);
    },
    uiClick() {
      tone(520, 700, 0.05, 'triangle', 0.14);
    },
    draft() {
      tone(523.25, 523.25, 0.12, 'triangle', 0.16);
      tone(659.25, 659.25, 0.12, 'triangle', 0.16, 0.09);
      tone(783.99, 783.99, 0.2, 'triangle', 0.16, 0.18);
    },
    bossRoar() {
      tone(82, 41, 0.9, 'sawtooth', 0.4);
      tone(110, 55, 0.9, 'square', 0.2, 0.05);
      noise(0.8, 0.16, 500, 0.05);
    },
    waveClear() {
      tone(440, 440, 0.1, 'triangle', 0.14);
      tone(587.33, 587.33, 0.16, 'triangle', 0.14, 0.08);
    },
    gameOver() {
      tone(392, 392, 0.22, 'triangle', 0.2);
      tone(311.13, 311.13, 0.22, 'triangle', 0.2, 0.2);
      tone(233.08, 220, 0.5, 'triangle', 0.22, 0.4);
    },
  };
}
