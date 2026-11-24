/**
 * Efectos de sonido sintetizados con WebAudio. Son cuatro pitidos,
 * no merecía la pena cargar ficheros de audio para esto.
 */
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('pa:muted') === '1';

function audio() {
  if (!ctx) ctx = new AudioContext();
  // Chrome deja el contexto suspendido hasta que hay interacción del usuario
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freqFrom: number, freqTo: number, duration: number, type: OscillatorType, volume = 0.15) {
  if (muted) return;
  const ac = audio();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const t = ac.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export const sfx = {
  jump: () => tone(320, 640, 0.12, 'square', 0.08),
  doubleJump: () => tone(480, 960, 0.1, 'square', 0.07),
  bone: () => {
    tone(880, 1320, 0.08, 'triangle', 0.12);
    setTimeout(() => tone(1320, 1760, 0.08, 'triangle', 0.1), 60);
  },
  crash: () => tone(220, 40, 0.45, 'sawtooth', 0.18),
  record: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'square', 0.07), i * 90));
  },
  // duelo
  clank: () => tone(900, 260, 0.07, 'square', 0.06),
  claim: () => {
    tone(660, 990, 0.07, 'triangle', 0.12);
    setTimeout(() => tone(990, 1320, 0.09, 'triangle', 0.1), 50);
  },
  stolen: () => tone(300, 180, 0.15, 'triangle', 0.1),
  late: () => tone(200, 160, 0.08, 'sine', 0.08),
  beep: (high = false) => tone(high ? 880 : 440, high ? 880 : 440, high ? 0.25 : 0.12, 'square', 0.07),
  lose: () => {
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f * 0.97, 0.18, 'triangle', 0.1), i * 160));
  },
};

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  localStorage.setItem('pa:muted', value ? '1' : '0');
}
