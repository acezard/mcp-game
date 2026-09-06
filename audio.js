const MUSIC_URL = 'https://raw.githubusercontent.com/acezard/aceforceone/master/public/assets/spaceharrier.mp3';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const hpEl = document.getElementById('hp');
const powerEl = document.getElementById('power');
const statusEl = document.getElementById('status');

const music = new Audio(MUSIC_URL);
music.loop = true;
music.preload = 'auto';
music.volume = 0.34;

let context = null;
let master = null;
let sfxBus = null;
let muted = false;
let running = false;
let lastScore = Number(scoreEl.textContent) || 0;
let lastHp = Number(hpEl.textContent) || 100;
const lastPlayed = new Map();

function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!context && AudioContextClass) {
    context = new AudioContextClass();
    master = context.createGain();
    sfxBus = context.createGain();
    master.gain.value = muted ? 0 : 0.72;
    sfxBus.gain.value = 0.75;
    sfxBus.connect(master);
    master.connect(context.destination);
  }

  if (context?.state === 'suspended') context.resume();
  music.muted = muted;
  if (music.paused) music.play().catch(() => {});
}

function canPlay(name, gap = 0) {
  if (!context || muted) return false;
  const now = context.currentTime;
  if (now - (lastPlayed.get(name) || -Infinity) < gap) return false;
  lastPlayed.set(name, now);
  return true;
}

function tone({ name, start, end = start, duration = 0.08, gain = 0.04, type = 'square', gap = 0 }) {
  if (!canPlay(name, gap)) return;

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(envelope);
  envelope.connect(sfxBus);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function noise({ name, duration = 0.12, gain = 0.05, cutoff = 1200, gap = 0 }) {
  if (!canPlay(name, gap)) return;

  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const now = context.currentTime;

  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(sfxBus);
  source.start(now);
}

const sfx = {
  playerShot() {
    tone({ name: 'player-shot', start: 920, end: 430, duration: 0.055, gain: 0.022, type: 'sawtooth', gap: 0.09 });
  },
  hit() {
    tone({ name: 'hit', start: 560, end: 300, duration: 0.035, gain: 0.018, type: 'triangle', gap: 0.03 });
  },
  explosion() {
    noise({ name: 'explosion', duration: 0.16, gain: 0.045, cutoff: 850, gap: 0.05 });
    tone({ name: 'explosion-body', start: 110, end: 55, duration: 0.14, gain: 0.025, type: 'sine', gap: 0.05 });
  },
  damage() {
    noise({ name: 'damage', duration: 0.22, gain: 0.065, cutoff: 600, gap: 0.2 });
    tone({ name: 'damage-tone', start: 150, end: 55, duration: 0.24, gain: 0.05, type: 'sawtooth', gap: 0.2 });
  },
  ultimate() {
    tone({ name: 'ultimate', start: 170, end: 1450, duration: 0.48, gain: 0.06, type: 'sawtooth', gap: 0.5 });
    noise({ name: 'ultimate-noise', duration: 0.28, gain: 0.035, cutoff: 2200, gap: 0.5 });
  },
};

function setRunningFromOverlay() {
  running = overlay.classList.contains('hidden');
  if (!running && !music.paused) music.pause();
}

function toggleMute() {
  muted = !muted;
  music.muted = muted;

  if (master && context) {
    master.gain.setTargetAtTime(muted ? 0 : 0.72, context.currentTime, 0.015);
  }

  statusEl.textContent = muted ? 'AUDIO MUTED' : 'AUDIO ON';
}

// Browser audio must be unlocked by a user gesture. Start/restart clicks are ideal.
document.addEventListener('pointerdown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.matches('#start, #restart')) {
    ensureAudio();
    music.currentTime = 0;
    music.play().catch(() => {});
  }
}, true);

// The original main weapon fires every 500 ms; mirror that cadence without coupling audio to game state.
window.setInterval(() => {
  if (running) sfx.playerShot();
}, 500);

const overlayObserver = new MutationObserver(setRunningFromOverlay);
overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
setRunningFromOverlay();

const scoreObserver = new MutationObserver(() => {
  const next = Number(scoreEl.textContent) || 0;
  if (next > lastScore) {
    const delta = next - lastScore;
    if (delta >= 40) sfx.explosion();
    else sfx.hit();
  }
  lastScore = next;
});
scoreObserver.observe(scoreEl, { childList: true, characterData: true, subtree: true });

const hpObserver = new MutationObserver(() => {
  const next = Number(hpEl.textContent) || 0;
  if (next < lastHp) sfx.damage();
  lastHp = next;
});
hpObserver.observe(hpEl, { childList: true, characterData: true, subtree: true });

canvas.addEventListener('pointerdown', () => {
  if (running && powerEl.textContent.trim() === '100%') sfx.ultimate();
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'm' && !event.repeat) toggleMute();
});
