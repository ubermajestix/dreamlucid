// ============================================================
// DreamLucid Rack Synth v2.0 — Web Audio Engine
// ============================================================

const SCALES = {
  chromatic:     [0,1,2,3,4,5,6,7,8,9,10,11],
  major:         [0,2,4,5,7,9,11],
  minor:         [0,2,3,5,7,8,10],
  harmonicMinor: [0,2,3,5,7,8,11],
  melodicMinor:  [0,2,3,5,7,9,11],
  dorian:        [0,2,3,5,7,9,10],
  phrygian:      [0,1,3,5,7,8,10],
  lydian:        [0,2,4,6,7,9,11],
  mixolydian:    [0,2,4,5,7,9,10],
  locrian:       [0,1,3,5,6,8,10],
  wholeTone:     [0,2,4,6,8,10],
  blues:         [0,3,5,6,7,10],
  pentatonicMaj: [0,2,4,7,9],
  pentatonicMin: [0,3,5,7,10],
  hungarian:     [0,2,3,6,7,8,11],
  japanese:      [0,1,5,7,8],
};

const CHORD_TYPES = [
  { name: 'NONE',     intervals: [0, 0, 0, 0] },
  { name: 'MAJ',      intervals: [0, 4, 7, 12] },
  { name: 'MIN',      intervals: [0, 3, 7, 12] },
  { name: 'MAJ7',     intervals: [0, 4, 7, 11] },
  { name: 'MIN7',     intervals: [0, 3, 7, 10] },
  { name: 'DOM7',     intervals: [0, 4, 7, 10] },
  { name: 'SUS2',     intervals: [0, 2, 7, 12] },
  { name: 'SUS4',     intervals: [0, 5, 7, 12] },
  { name: 'DIM',      intervals: [0, 3, 6, 12] },
  { name: 'DIM7',     intervals: [0, 3, 6, 9] },
  { name: 'AUG',      intervals: [0, 4, 8, 12] },
  { name: 'MIN9',     intervals: [0, 3, 7, 14] },
  { name: 'MAJ9',     intervals: [0, 4, 7, 14] },
  { name: 'ADD9',     intervals: [0, 4, 7, 14] },
  { name: '6TH',      intervals: [0, 4, 7, 9] },
  { name: 'MIN6',     intervals: [0, 3, 7, 9] },
  { name: '5TH',      intervals: [0, 7, 12, 19] },
  { name: 'MINMAJ7',  intervals: [0, 3, 7, 11] },
  { name: 'AUG7',     intervals: [0, 4, 8, 10] },
  { name: 'HDIM7',    intervals: [0, 3, 6, 10] },
];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Exponential cutoff mapping: slider 0..1 -> 20..20000 Hz
function expCutoff(norm) {
  return 20 * Math.pow(1000, norm);
}

// Inverse: freq -> 0..1
function expCutoffInv(freq) {
  return Math.log(freq / 20) / Math.log(1000);
}

// Filter LFO rate mapping: slider 0..1 -> 0.00833 Hz (120s period) to 20000 Hz
// Use exponential: 0.00833 * (20000/0.00833)^norm
function expFilterLfoRate(norm) {
  const minRate = 1 / 120; // 2 minute period
  const maxRate = 20000;
  return minRate * Math.pow(maxRate / minRate, norm);
}

function formatFilterLfoRate(hz) {
  if (hz >= 1) {
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
    if (hz >= 100) return `${hz.toFixed(0)}Hz`;
    if (hz >= 10) return `${hz.toFixed(1)}Hz`;
    return `${hz.toFixed(2)}Hz`;
  }
  const seconds = 1 / hz;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds >= 10) return `${seconds.toFixed(0)}s`;
  return `${seconds.toFixed(1)}s`;
}

function formatCutoff(freq) {
  if (freq >= 10000) return `${(freq / 1000).toFixed(1)}k`;
  if (freq >= 1000) return `${(freq / 1000).toFixed(2)}k`;
  if (freq >= 100) return `${freq.toFixed(0)}`;
  return `${freq.toFixed(1)}`;
}

// ============================================================
// Rotary Knob UI Component
// ============================================================
class RotaryKnob {
  constructor(container) {
    this.container = container;
    this.input = container.querySelector('input[type="range"]');
    if (!this.input) return;

    this.min = parseFloat(this.input.min);
    this.max = parseFloat(this.input.max);
    this.step = parseFloat(this.input.step) || 0.01;
    this.dragging = false;
    this.startY = 0;
    this.startValue = 0;

    this.build();
    this.bind();
    this.update();
  }

  build() {
    // Create knob visual elements
    this.track = document.createElement('div');
    this.track.className = 'knob-track';
    this.cap = document.createElement('div');
    this.cap.className = 'knob-cap';
    this.indicator = document.createElement('div');
    this.indicator.className = 'knob-indicator';
    this.body = document.createElement('div');
    this.body.className = 'knob-body';

    this.body.appendChild(this.track);
    this.body.appendChild(this.cap);
    this.body.appendChild(this.indicator);
    this.container.insertBefore(this.body, this.input);
  }

  getNormalized() {
    const val = parseFloat(this.input.value);
    if (this.max === this.min) return 0;
    return (val - this.min) / (this.max - this.min);
  }

  update() {
    const norm = this.getNormalized();
    // Arc: -135 to +135 degrees (270 degree range)
    const angle = -135 + norm * 270;
    this.indicator.style.transform = `rotate(${angle}deg)`;

    // Update track arc
    const arcDeg = norm * 270;
    this.track.style.background = `conic-gradient(
      from 225deg,
      var(--orange-bright) 0deg,
      var(--orange-glow) ${arcDeg}deg,
      transparent ${arcDeg}deg
    )`;
  }

  setValue(val) {
    val = Math.max(this.min, Math.min(this.max, val));
    // Snap to step
    val = Math.round((val - this.min) / this.step) * this.step + this.min;
    val = Math.max(this.min, Math.min(this.max, val));
    this.input.value = val;
    this.update();
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  bind() {
    const onPointerDown = (e) => {
      e.preventDefault();
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = parseFloat(this.input.value);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      this.container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!this.dragging) return;
      const dy = this.startY - e.clientY;
      const range = this.max - this.min;
      // 200px drag = full range
      const sensitivity = range / 200;
      const newVal = this.startValue + dy * sensitivity;
      this.setValue(newVal);
    };

    const onPointerUp = (e) => {
      this.dragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    this.container.addEventListener('pointerdown', onPointerDown);

    // Double-click to reset to default
    this.container.addEventListener('dblclick', () => {
      const def = this.input.getAttribute('value'); // original default
      if (def !== null) {
        this.setValue(parseFloat(def));
      }
    });

    // Mouse wheel
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const range = this.max - this.min;
      const delta = (e.deltaY < 0 ? 1 : -1) * (range / 100);
      this.setValue(parseFloat(this.input.value) + delta);
    }, { passive: false });
  }
}

// Initialize all rotary knobs in a container
function initKnobs(container) {
  container.querySelectorAll('.rotary-knob').forEach(el => {
    if (!el._knob) {
      el._knob = new RotaryKnob(el);
    }
  });
}

// ============================================================
// Audio Context & Global Nodes
// ============================================================
let audioCtx = null;
let masterGain = null;
let globalFilter = null;
let reverbNode = null;
let reverbGain = null;
let reverbSendBus = null;
let mediaRecorder = null;
let recordedChunks = [];
let moduleCounter = 0;
let modules = {};

function ensureAudioContext() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;

  // Global filter — all audio passes through this
  globalFilter = audioCtx.createBiquadFilter();
  globalFilter.type = 'lowpass';
  globalFilter.frequency.value = 20000;
  globalFilter.Q.value = 0;

  // Reverb send bus
  reverbSendBus = audioCtx.createGain();
  reverbSendBus.gain.value = 1;

  // Reverb wet
  reverbGain = audioCtx.createGain();
  reverbGain.gain.value = 0.3;

  // Convolver
  reverbNode = audioCtx.createConvolver();

  // FIXED ROUTING: everything goes through globalFilter before masterGain
  // Dry module path: modules -> globalFilter (connected in SynthModule)
  // Reverb path: reverbSendBus -> reverbNode -> reverbGain -> globalFilter
  globalFilter.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  reverbSendBus.connect(reverbNode);
  reverbNode.connect(reverbGain);
  reverbGain.connect(globalFilter);

  updateReverbIR();
}

// ============================================================
// Reverb IR Generation (BigSky-inspired)
// ============================================================
function updateReverbIR() {
  if (!audioCtx) return;

  const algo = document.getElementById('reverb-algorithm').value;
  const decay = parseFloat(document.getElementById('reverb-decay').value);
  const damping = parseFloat(document.getElementById('reverb-damping').value);
  const predelay = parseFloat(document.getElementById('reverb-predelay').value) / 1000;
  const mod = parseFloat(document.getElementById('reverb-mod').value);

  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * Math.min(decay + predelay, 16));
  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  const predelaySamples = Math.floor(predelay * sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = predelaySamples; i < length; i++) {
      const t = (i - predelaySamples) / sampleRate;
      const env = Math.exp(-3 * t / decay);
      const dampFactor = 1 - damping * (t / decay);

      let sample = (Math.random() * 2 - 1) * env * Math.max(dampFactor, 0.05);

      switch (algo) {
        case 'room':
          if (t < 0.05) sample *= 2.5;
          break;
        case 'hall':
          sample *= Math.min(1, t * 10);
          break;
        case 'plate':
          sample *= (1 + 0.3 * Math.sin(t * 200));
          break;
        case 'spring':
          sample *= (1 + 0.5 * Math.sin(t * 80) * Math.exp(-t * 3));
          break;
        case 'shimmer':
          sample += 0.15 * Math.sin(t * 1200 * (1 + ch * 0.01)) * env * 0.5;
          sample += 0.1 * Math.sin(t * 2400 * (1 + ch * 0.02)) * env * 0.3;
          break;
        case 'cloud':
          sample *= Math.min(1, t * 3) * (0.7 + 0.3 * Math.sin(t * 0.5));
          break;
        case 'bloom':
          const bloom = Math.sin(Math.PI * Math.min(t / (decay * 0.4), 1));
          sample *= bloom;
          break;
      }

      if (mod > 0) {
        const modFreq = 0.5 + ch * 0.3;
        sample *= 1 + mod * 0.1 * Math.sin(2 * Math.PI * modFreq * t);
      }

      data[i] = sample;
    }
  }

  try {
    reverbNode.buffer = buffer;
  } catch(e) {
    const newReverb = audioCtx.createConvolver();
    newReverb.buffer = buffer;
    reverbSendBus.disconnect(reverbNode);
    reverbNode.disconnect();
    reverbSendBus.connect(newReverb);
    newReverb.connect(reverbGain);
    reverbNode = newReverb;
  }
}

// ============================================================
// Synth Module
// ============================================================
class SynthModule {
  constructor(id, element) {
    this.id = id;
    this.el = element;
    this.powered = true;
    this.chordIndex = 0;
    this.octaveShift = 0;
    this.oscillators = [];
    // Module-level LFO (volume)
    this.lfo = null;
    this.lfoGain = null;
    // Filter LFO
    this.filterLfo = null;
    this.filterLfoGain = null;
    // Nodes
    this.moduleVolume = null;
    this.moduleGain = null; // LFO target
    this.filter = null;
    this.panner = null;
    this.reverbSend = null;
    this.dryGain = null;

    this.init();
    this.bindEvents();
  }

  init() {
    ensureAudioContext();

    // Module volume (user-controlled)
    this.moduleVolume = audioCtx.createGain();
    this.moduleVolume.gain.value = 0.7;

    // Module gain (LFO modulation target)
    this.moduleGain = audioCtx.createGain();
    this.moduleGain.gain.value = 1;

    // Ladder filter
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0;

    // Panner
    this.panner = audioCtx.createStereoPanner();
    this.panner.pan.value = 0;

    // Reverb send
    this.reverbSend = audioCtx.createGain();
    this.reverbSend.gain.value = 0.2;

    // Dry path
    this.dryGain = audioCtx.createGain();
    this.dryGain.gain.value = 0.8;

    // Volume LFO
    this.lfo = audioCtx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1 / 4;
    this.lfoGain = audioCtx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.moduleGain.gain);
    this.lfo.start();

    // Filter LFO
    this.filterLfo = audioCtx.createOscillator();
    this.filterLfo.type = 'sine';
    this.filterLfo.frequency.value = 1;
    this.filterLfoGain = audioCtx.createGain();
    this.filterLfoGain.gain.value = 0;
    this.filterLfo.connect(this.filterLfoGain);
    this.filterLfoGain.connect(this.filter.frequency);
    this.filterLfo.start();

    // Create 4 oscillators with per-osc panning and LFO
    for (let i = 0; i < 4; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const panner = audioCtx.createStereoPanner();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = midiToFreq(60);
      gain.gain.value = 0.7;
      panner.pan.value = 0;

      // Per-osc LFO -> gain
      lfo.type = 'sine';
      lfo.frequency.value = 1 / 4;
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();

      // Routing: osc -> gain -> panner -> filter
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.filter);
      osc.start();

      this.oscillators.push({
        osc, gain, panner, lfo, lfoGain,
        pitchSemitones: 0, fineCents: 0
      });
    }

    // Routing: filter -> moduleVolume -> moduleGain -> panner -> (dry -> globalFilter, wet -> reverbSendBus)
    this.filter.connect(this.moduleVolume);
    this.moduleVolume.connect(this.moduleGain);
    this.moduleGain.connect(this.panner);
    this.panner.connect(this.dryGain);
    this.panner.connect(this.reverbSend);
    this.dryGain.connect(globalFilter);
    this.reverbSend.connect(reverbSendBus);

    this.updateLCD('ACTIVE');
  }

  updateLCD(text) {
    const lcd = this.el.querySelector('.lcd-text');
    if (lcd) lcd.textContent = text;
  }

  getBaseMidi() {
    const root = parseInt(this.el.querySelector('.root-select').value);
    const octave = parseInt(this.el.querySelector('.octave-select').value);
    return root + (octave + 1) * 12 + (this.octaveShift * 12);
  }

  updateOscFrequencies() {
    const baseMidi = this.getBaseMidi();
    const chord = CHORD_TYPES[this.chordIndex];

    this.oscillators.forEach((o, i) => {
      const chordOffset = chord.intervals[i] || 0;
      const midi = baseMidi + chordOffset + o.pitchSemitones;
      const freq = midiToFreq(midi) * Math.pow(2, o.fineCents / 1200);
      o.osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    });

    const rootName = NOTE_NAMES[parseInt(this.el.querySelector('.root-select').value)];
    const octave = parseInt(this.el.querySelector('.octave-select').value) + this.octaveShift;
    const scale = this.el.querySelector('.scale-select').value.toUpperCase().slice(0, 6);
    this.updateLCD(`${rootName}${octave} ${scale} ${chord.name}`);
  }

  cycleChord() {
    this.chordIndex = (this.chordIndex + 1) % CHORD_TYPES.length;
    const chord = CHORD_TYPES[this.chordIndex];
    this.el.querySelector('.chord-btn').textContent = chord.name;

    const oscChannels = this.el.querySelectorAll('.osc-channel');
    chord.intervals.forEach((interval, i) => {
      if (oscChannels[i]) {
        const pitchInput = oscChannels[i].querySelector('.osc-pitch');
        const clamped = Math.max(-24, Math.min(24, interval));
        pitchInput.value = clamped;
        this.oscillators[i].pitchSemitones = clamped;
        oscChannels[i].querySelector('.osc-pitch-display').textContent = clamped > 0 ? `+${clamped}` : clamped;
        // Update the rotary knob visual
        const knobEl = pitchInput.closest('.rotary-knob');
        if (knobEl && knobEl._knob) knobEl._knob.update();
      }
    });

    this.updateOscFrequencies();
  }

  setPower(on) {
    this.powered = on;
    if (on) {
      this.moduleGain.gain.setValueAtTime(1, audioCtx.currentTime);
      this.el.classList.remove('powered-off');
      this.el.querySelector('.module-power').classList.remove('off');
      this.el.querySelector('.module-power').textContent = 'PWR';
      this.updateLCD('ACTIVE');
    } else {
      this.moduleGain.gain.setValueAtTime(0, audioCtx.currentTime);
      this.el.classList.add('powered-off');
      this.el.querySelector('.module-power').classList.add('off');
      this.el.querySelector('.module-power').textContent = 'OFF';
      this.updateLCD('STANDBY');
    }
  }

  destroy() {
    this.oscillators.forEach(o => {
      o.osc.stop();
      o.osc.disconnect();
      o.gain.disconnect();
      o.panner.disconnect();
      o.lfo.stop();
      o.lfo.disconnect();
      o.lfoGain.disconnect();
    });
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.filterLfo.stop();
    this.filterLfo.disconnect();
    this.filterLfoGain.disconnect();
    this.filter.disconnect();
    this.moduleVolume.disconnect();
    this.moduleGain.disconnect();
    this.panner.disconnect();
    this.reverbSend.disconnect();
    this.dryGain.disconnect();
    this.el.remove();
  }

  // Serialize state for presets
  serialize() {
    const el = this.el;
    return {
      root: el.querySelector('.root-select').value,
      octave: el.querySelector('.octave-select').value,
      scale: el.querySelector('.scale-select').value,
      chordIndex: this.chordIndex,
      octaveShift: this.octaveShift,
      powered: this.powered,
      oscillators: this.oscillators.map((o, i) => {
        const ch = el.querySelectorAll('.osc-channel')[i];
        return {
          pitch: parseInt(ch.querySelector('.osc-pitch').value),
          fine: parseInt(ch.querySelector('.osc-fine').value),
          level: parseFloat(ch.querySelector('.osc-level').value),
          wave: ch.querySelector('.osc-wave').value,
          pan: parseFloat(ch.querySelector('.osc-pan').value),
          lfoRate: parseFloat(ch.querySelector('.osc-lfo-rate').value),
          lfoDepth: parseFloat(ch.querySelector('.osc-lfo-depth').value),
        };
      }),
      lfoRate: parseFloat(el.querySelector('.lfo-rate').value),
      lfoDepth: parseFloat(el.querySelector('.lfo-depth').value),
      lfoWave: el.querySelector('.lfo-wave').value,
      filterCutoff: parseFloat(el.querySelector('.filter-cutoff').value),
      filterRes: parseFloat(el.querySelector('.filter-res').value),
      filterLfoRate: parseFloat(el.querySelector('.filter-lfo-rate').value),
      filterLfoDepth: parseFloat(el.querySelector('.filter-lfo-depth').value),
      filterLfoWave: el.querySelector('.filter-lfo-wave').value,
      moduleVolume: parseFloat(el.querySelector('.module-volume').value),
      pan: parseFloat(el.querySelector('.pan-control').value),
      reverbSend: parseFloat(el.querySelector('.reverb-send').value),
    };
  }

  // Restore state from preset data
  restore(data) {
    const el = this.el;

    el.querySelector('.root-select').value = data.root;
    el.querySelector('.octave-select').value = data.octave;
    el.querySelector('.scale-select').value = data.scale;
    this.chordIndex = data.chordIndex || 0;
    this.octaveShift = data.octaveShift || 0;
    el.querySelector('.chord-btn').textContent = CHORD_TYPES[this.chordIndex].name;
    el.querySelector('.oct-shift-display').textContent = this.octaveShift;

    // Restore oscillator settings
    data.oscillators.forEach((od, i) => {
      const ch = el.querySelectorAll('.osc-channel')[i];
      if (!ch) return;

      setInputValue(ch, '.osc-pitch', od.pitch);
      setInputValue(ch, '.osc-fine', od.fine);
      setInputValue(ch, '.osc-level', od.level);
      ch.querySelector('.osc-wave').value = od.wave;
      setInputValue(ch, '.osc-pan', od.pan);
      setInputValue(ch, '.osc-lfo-rate', od.lfoRate);
      setInputValue(ch, '.osc-lfo-depth', od.lfoDepth);

      this.oscillators[i].pitchSemitones = od.pitch;
      this.oscillators[i].fineCents = od.fine;
      this.oscillators[i].osc.type = od.wave;
      this.oscillators[i].gain.gain.setValueAtTime(od.level, audioCtx.currentTime);
      this.oscillators[i].panner.pan.setValueAtTime(od.pan, audioCtx.currentTime);
      this.oscillators[i].lfo.frequency.setValueAtTime(od.lfoRate, audioCtx.currentTime);
      this.oscillators[i].lfoGain.gain.setValueAtTime(od.lfoDepth, audioCtx.currentTime);

      ch.querySelector('.osc-pitch-display').textContent = od.pitch > 0 ? `+${od.pitch}` : od.pitch;
      const panVal = od.pan;
      let panText = 'C';
      if (panVal < -0.01) panText = `L${Math.abs(Math.round(panVal * 100))}`;
      else if (panVal > 0.01) panText = `R${Math.round(panVal * 100)}`;
      ch.querySelector('.osc-pan-display').textContent = panText;
    });

    // Module LFO
    setInputValue(el, '.lfo-rate', data.lfoRate);
    setInputValue(el, '.lfo-depth', data.lfoDepth);
    el.querySelector('.lfo-wave').value = data.lfoWave;
    this.lfo.type = data.lfoWave;
    this.lfo.frequency.setValueAtTime(1 / data.lfoRate, audioCtx.currentTime);
    this.lfoGain.gain.setValueAtTime(data.lfoDepth, audioCtx.currentTime);
    el.querySelector('.lfo-rate-display').textContent = data.lfoRate >= 10 ? `${data.lfoRate.toFixed(0)}s` : `${data.lfoRate.toFixed(1)}s`;

    // Filter
    setInputValue(el, '.filter-cutoff', data.filterCutoff);
    setInputValue(el, '.filter-res', data.filterRes);
    const cutoffFreq = expCutoff(data.filterCutoff);
    this.filter.frequency.setValueAtTime(cutoffFreq, audioCtx.currentTime);
    this.filter.Q.setValueAtTime(data.filterRes, audioCtx.currentTime);
    el.querySelector('.filter-cutoff-display').textContent = formatCutoff(cutoffFreq);

    // Filter LFO
    setInputValue(el, '.filter-lfo-rate', data.filterLfoRate);
    setInputValue(el, '.filter-lfo-depth', data.filterLfoDepth);
    el.querySelector('.filter-lfo-wave').value = data.filterLfoWave;
    this.filterLfo.type = data.filterLfoWave;
    const fLfoHz = expFilterLfoRate(data.filterLfoRate);
    this.filterLfo.frequency.setValueAtTime(fLfoHz, audioCtx.currentTime);
    this.filterLfoGain.gain.setValueAtTime(data.filterLfoDepth, audioCtx.currentTime);
    el.querySelector('.filter-lfo-rate-display').textContent = formatFilterLfoRate(fLfoHz);

    // Output
    setInputValue(el, '.module-volume', data.moduleVolume);
    setInputValue(el, '.pan-control', data.pan);
    setInputValue(el, '.reverb-send', data.reverbSend);
    this.moduleVolume.gain.setValueAtTime(data.moduleVolume, audioCtx.currentTime);
    this.panner.pan.setValueAtTime(data.pan, audioCtx.currentTime);
    this.reverbSend.gain.setValueAtTime(data.reverbSend, audioCtx.currentTime);
    this.dryGain.gain.setValueAtTime(1 - data.reverbSend, audioCtx.currentTime);

    el.querySelector('.module-vol-display').textContent = data.moduleVolume.toFixed(2);
    el.querySelector('.reverb-send-display').textContent = data.reverbSend.toFixed(2);
    const pv = data.pan;
    let pt = 'C';
    if (pv < -0.01) pt = `L${Math.abs(Math.round(pv * 100))}`;
    else if (pv > 0.01) pt = `R${Math.round(pv * 100)}`;
    el.querySelector('.pan-display').textContent = pt;

    // Update all knob visuals
    el.querySelectorAll('.rotary-knob').forEach(k => { if (k._knob) k._knob.update(); });

    this.updateOscFrequencies();

    if (data.powered === false) {
      this.setPower(false);
    }
  }

  bindEvents() {
    const el = this.el;

    // Power
    el.querySelector('.module-power').addEventListener('click', () => {
      this.setPower(!this.powered);
    });

    // Remove
    el.querySelector('.module-remove').addEventListener('click', () => {
      this.destroy();
      delete modules[this.id];
    });

    // Chord cycle
    el.querySelector('.chord-btn').addEventListener('click', () => {
      this.cycleChord();
    });

    // Octave shift
    el.querySelector('.oct-down').addEventListener('click', () => {
      if (this.octaveShift > -3) {
        this.octaveShift--;
        el.querySelector('.oct-shift-display').textContent = this.octaveShift;
        this.updateOscFrequencies();
      }
    });
    el.querySelector('.oct-up').addEventListener('click', () => {
      if (this.octaveShift < 3) {
        this.octaveShift++;
        el.querySelector('.oct-shift-display').textContent = this.octaveShift;
        this.updateOscFrequencies();
      }
    });

    // Root / Octave / Scale changes
    el.querySelector('.root-select').addEventListener('change', () => this.updateOscFrequencies());
    el.querySelector('.octave-select').addEventListener('change', () => this.updateOscFrequencies());
    el.querySelector('.scale-select').addEventListener('change', () => this.updateOscFrequencies());

    // Oscillator controls
    el.querySelectorAll('.osc-channel').forEach((ch, i) => {
      ch.querySelector('.osc-pitch').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        this.oscillators[i].pitchSemitones = val;
        ch.querySelector('.osc-pitch-display').textContent = val > 0 ? `+${val}` : val;
        this.updateOscFrequencies();
      });

      ch.querySelector('.osc-fine').addEventListener('input', (e) => {
        this.oscillators[i].fineCents = parseInt(e.target.value);
        this.updateOscFrequencies();
      });

      ch.querySelector('.osc-wave').addEventListener('change', (e) => {
        this.oscillators[i].osc.type = e.target.value;
      });

      ch.querySelector('.osc-level').addEventListener('input', (e) => {
        this.oscillators[i].gain.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
      });

      // Per-osc panning
      ch.querySelector('.osc-pan').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.oscillators[i].panner.pan.setValueAtTime(val, audioCtx.currentTime);
        let display = 'C';
        if (val < -0.01) display = `L${Math.abs(Math.round(val * 100))}`;
        else if (val > 0.01) display = `R${Math.round(val * 100)}`;
        ch.querySelector('.osc-pan-display').textContent = display;
      });

      // Per-osc LFO
      ch.querySelector('.osc-lfo-rate').addEventListener('input', (e) => {
        this.oscillators[i].lfo.frequency.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
      });

      ch.querySelector('.osc-lfo-depth').addEventListener('input', (e) => {
        this.oscillators[i].lfoGain.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
      });
    });

    // Module volume LFO
    el.querySelector('.lfo-rate').addEventListener('input', (e) => {
      const seconds = parseFloat(e.target.value);
      this.lfo.frequency.setValueAtTime(1 / seconds, audioCtx.currentTime);
      el.querySelector('.lfo-rate-display').textContent = seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
    });

    el.querySelector('.lfo-depth').addEventListener('input', (e) => {
      this.lfoGain.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
    });

    el.querySelector('.lfo-wave').addEventListener('change', (e) => {
      this.lfo.type = e.target.value;
    });

    // Filter (exponential cutoff)
    el.querySelector('.filter-cutoff').addEventListener('input', (e) => {
      const norm = parseFloat(e.target.value);
      const freq = expCutoff(norm);
      this.filter.frequency.setValueAtTime(freq, audioCtx.currentTime);
      el.querySelector('.filter-cutoff-display').textContent = formatCutoff(freq);
    });

    el.querySelector('.filter-res').addEventListener('input', (e) => {
      this.filter.Q.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
    });

    // Filter LFO
    el.querySelector('.filter-lfo-rate').addEventListener('input', (e) => {
      const norm = parseFloat(e.target.value);
      const hz = expFilterLfoRate(norm);
      this.filterLfo.frequency.setValueAtTime(hz, audioCtx.currentTime);
      el.querySelector('.filter-lfo-rate-display').textContent = formatFilterLfoRate(hz);
    });

    el.querySelector('.filter-lfo-depth').addEventListener('input', (e) => {
      this.filterLfoGain.gain.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
    });

    el.querySelector('.filter-lfo-wave').addEventListener('change', (e) => {
      this.filterLfo.type = e.target.value;
    });

    // Module volume
    el.querySelector('.module-volume').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.moduleVolume.gain.setValueAtTime(val, audioCtx.currentTime);
      el.querySelector('.module-vol-display').textContent = val.toFixed(2);
    });

    // Pan
    el.querySelector('.pan-control').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.panner.pan.setValueAtTime(val, audioCtx.currentTime);
      let display = 'C';
      if (val < -0.01) display = `L${Math.abs(Math.round(val * 100))}`;
      else if (val > 0.01) display = `R${Math.round(val * 100)}`;
      el.querySelector('.pan-display').textContent = display;
    });

    // Reverb send
    el.querySelector('.reverb-send').addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.reverbSend.gain.setValueAtTime(val, audioCtx.currentTime);
      this.dryGain.gain.setValueAtTime(1 - val, audioCtx.currentTime);
      el.querySelector('.reverb-send-display').textContent = val.toFixed(2);
    });
  }
}

// Helper: set input value and update knob visual
function setInputValue(container, selector, value) {
  const input = container.querySelector(selector);
  if (!input) return;
  input.value = value;
  const knobEl = input.closest('.rotary-knob');
  if (knobEl && knobEl._knob) knobEl._knob.update();
}

// ============================================================
// Module Creation
// ============================================================
function addModule(presetData) {
  ensureAudioContext();
  moduleCounter++;
  const template = document.getElementById('module-template');
  const clone = template.content.cloneNode(true);
  const unit = clone.querySelector('.rack-unit');
  unit.dataset.moduleId = moduleCounter;
  unit.querySelector('.module-num').textContent = moduleCounter;

  document.getElementById('modules-container').appendChild(clone);

  const insertedUnit = document.querySelector(`.rack-unit[data-module-id="${moduleCounter}"]`);
  initKnobs(insertedUnit);

  const mod = new SynthModule(moduleCounter, insertedUnit);
  modules[moduleCounter] = mod;

  if (presetData) {
    mod.restore(presetData);
  }

  return mod;
}

// ============================================================
// Global Controls Binding
// ============================================================
function initGlobalControls() {
  // Init global knobs
  initKnobs(document.getElementById('global-controls'));

  // Master volume
  document.getElementById('master-volume').addEventListener('input', (e) => {
    ensureAudioContext();
    const val = parseFloat(e.target.value);
    masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
    document.getElementById('master-vol-display').textContent = val.toFixed(2);
  });

  // Global filter (exponential cutoff)
  document.getElementById('global-filter-cutoff').addEventListener('input', (e) => {
    ensureAudioContext();
    const norm = parseFloat(e.target.value);
    const freq = expCutoff(norm);
    globalFilter.frequency.setValueAtTime(freq, audioCtx.currentTime);
    document.getElementById('global-cutoff-display').textContent = formatCutoff(freq);
  });

  document.getElementById('global-filter-res').addEventListener('input', (e) => {
    ensureAudioContext();
    globalFilter.Q.setValueAtTime(parseFloat(e.target.value), audioCtx.currentTime);
    document.getElementById('global-res-display').textContent = parseFloat(e.target.value).toFixed(1);
  });

  // Reverb controls
  const reverbControlIds = ['reverb-algorithm', 'reverb-decay', 'reverb-damping', 'reverb-predelay', 'reverb-mod'];
  reverbControlIds.forEach(id => {
    const handler = () => {
      ensureAudioContext();
      updateReverbIR();
      document.getElementById('reverb-decay-display').textContent =
        parseFloat(document.getElementById('reverb-decay').value).toFixed(1) + 's';
      document.getElementById('reverb-damp-display').textContent =
        parseFloat(document.getElementById('reverb-damping').value).toFixed(2);
      document.getElementById('reverb-predelay-display').textContent =
        document.getElementById('reverb-predelay').value + 'ms';
      document.getElementById('reverb-mod-display').textContent =
        parseFloat(document.getElementById('reverb-mod').value).toFixed(2);
    };
    document.getElementById(id).addEventListener('input', handler);
    document.getElementById(id).addEventListener('change', handler);
  });

  document.getElementById('reverb-mix').addEventListener('input', (e) => {
    ensureAudioContext();
    const val = parseFloat(e.target.value);
    reverbGain.gain.setValueAtTime(val, audioCtx.currentTime);
    document.getElementById('reverb-mix-display').textContent = val.toFixed(2);
  });

  // Add module button
  document.getElementById('btn-add-module').addEventListener('click', () => addModule());

  // Recording
  document.getElementById('btn-record').addEventListener('click', startRecording);
  document.getElementById('btn-stop-record').addEventListener('click', stopRecording);

  // Presets
  document.getElementById('btn-save-preset').addEventListener('click', savePreset);
  document.getElementById('btn-load-preset').addEventListener('click', () => {
    document.getElementById('preset-file-input').click();
  });
  document.getElementById('preset-file-input').addEventListener('change', loadPreset);
}

// ============================================================
// Preset Save / Load
// ============================================================
function savePreset() {
  const preset = {
    version: 2,
    global: {
      masterVolume: parseFloat(document.getElementById('master-volume').value),
      filterCutoff: parseFloat(document.getElementById('global-filter-cutoff').value),
      filterRes: parseFloat(document.getElementById('global-filter-res').value),
      reverbAlgorithm: document.getElementById('reverb-algorithm').value,
      reverbDecay: parseFloat(document.getElementById('reverb-decay').value),
      reverbDamping: parseFloat(document.getElementById('reverb-damping').value),
      reverbPredelay: parseFloat(document.getElementById('reverb-predelay').value),
      reverbMix: parseFloat(document.getElementById('reverb-mix').value),
      reverbMod: parseFloat(document.getElementById('reverb-mod').value),
    },
    modules: Object.values(modules).map(m => m.serialize()),
  };

  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dreamlucid-preset-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadPreset(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const preset = JSON.parse(reader.result);
      applyPreset(preset);
    } catch (err) {
      console.error('Failed to load preset:', err);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be loaded again
}

function applyPreset(preset) {
  ensureAudioContext();

  // Restore global settings
  const g = preset.global;
  setGlobalInput('master-volume', g.masterVolume);
  masterGain.gain.setValueAtTime(g.masterVolume, audioCtx.currentTime);
  document.getElementById('master-vol-display').textContent = g.masterVolume.toFixed(2);

  setGlobalInput('global-filter-cutoff', g.filterCutoff);
  const gFreq = expCutoff(g.filterCutoff);
  globalFilter.frequency.setValueAtTime(gFreq, audioCtx.currentTime);
  document.getElementById('global-cutoff-display').textContent = formatCutoff(gFreq);

  setGlobalInput('global-filter-res', g.filterRes);
  globalFilter.Q.setValueAtTime(g.filterRes, audioCtx.currentTime);
  document.getElementById('global-res-display').textContent = g.filterRes.toFixed(1);

  document.getElementById('reverb-algorithm').value = g.reverbAlgorithm;
  setGlobalInput('reverb-decay', g.reverbDecay);
  setGlobalInput('reverb-damping', g.reverbDamping);
  setGlobalInput('reverb-predelay', g.reverbPredelay);
  setGlobalInput('reverb-mix', g.reverbMix);
  setGlobalInput('reverb-mod', g.reverbMod);

  reverbGain.gain.setValueAtTime(g.reverbMix, audioCtx.currentTime);
  document.getElementById('reverb-decay-display').textContent = g.reverbDecay.toFixed(1) + 's';
  document.getElementById('reverb-damp-display').textContent = g.reverbDamping.toFixed(2);
  document.getElementById('reverb-predelay-display').textContent = g.reverbPredelay + 'ms';
  document.getElementById('reverb-mix-display').textContent = g.reverbMix.toFixed(2);
  document.getElementById('reverb-mod-display').textContent = g.reverbMod.toFixed(2);

  updateReverbIR();

  // Remove existing modules
  Object.values(modules).forEach(m => m.destroy());
  modules = {};
  moduleCounter = 0;

  // Recreate modules from preset
  if (preset.modules) {
    preset.modules.forEach(md => addModule(md));
  }
}

function setGlobalInput(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  input.value = value;
  const knobEl = input.closest('.rotary-knob');
  if (knobEl && knobEl._knob) knobEl._knob.update();
}

// ============================================================
// WAV Recording
// ============================================================
let recDest = null;

function startRecording() {
  ensureAudioContext();
  recDest = audioCtx.createMediaStreamDestination();
  masterGain.connect(recDest);

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(recDest.stream, { mimeType: 'audio/webm;codecs=opus' });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result;
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const wavBlob = audioBufferToWav(audioBuffer);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dreamlucid-${Date.now()}.wav`;
        a.click();
        URL.revokeObjectURL(url);
      } catch(err) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dreamlucid-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    reader.readAsArrayBuffer(blob);
    try { masterGain.disconnect(recDest); } catch(e) {}
    recDest = null;
  };

  mediaRecorder.start(100);
  document.getElementById('btn-record').disabled = true;
  document.getElementById('btn-stop-record').disabled = false;
  document.getElementById('rec-indicator').classList.add('recording');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  document.getElementById('btn-record').disabled = false;
  document.getElementById('btn-stop-record').disabled = true;
  document.getElementById('rec-indicator').classList.remove('recording');
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const val = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, val, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initGlobalControls();
  addModule();

  const resumeAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  };
  document.addEventListener('click', resumeAudio);
  document.addEventListener('keydown', resumeAudio);
  document.addEventListener('pointerdown', resumeAudio);
});
