// Main-thread audio engine.
// Owns the AudioContext, loads the AudioWorklet and HRTF dataset,
// and exposes a simple API for the UI to call.

import { HRTFLoader } from './hrtf-loader.js';

const WORKLET_URL = '/spatial-processor.js'; // served from static/
const HRTF_URL    = '/hrtf';                 // served from static/hrtf/

export class SpatialEngine {
  constructor() {
    this._ctx       = null;
    this._node      = null;   // AudioWorkletNode
    this._source    = null;   // AudioBufferSourceNode | MediaElementAudioSourceNode
    this._gainNode  = null;
    this._loader    = new HRTFLoader();

    this._azimuth   = 0;
    this._elevation = 0;
    this._distance  = 1;

    this._ready     = false;
    this._playing   = false;
  }

  // Must be called from a user-gesture handler to satisfy
  // browser autoplay policy. Safe to call more than once.
  async init() {
    if (this._ready) return;

    this._ctx = new AudioContext({ sampleRate: 44100 });

    // Register the worklet processor.
    await this._ctx.audioWorklet.addModule(WORKLET_URL);

    // Build the graph: source → gain → spatial worklet → destination
    this._node = new AudioWorkletNode(this._ctx, 'spatial-processor', {
      numberOfInputs:  1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this._gainNode = this._ctx.createGain();
    this._gainNode.connect(this._node);
    this._node.connect(this._ctx.destination);

    // Load the full HRTF dataset (parallel fetches).
    await this._loader.load(this._ctx, HRTF_URL);

    // Send initial HRTF to worklet.
    this._sendIR(this._azimuth, this._elevation);

    this._ready = true;
  }


  // Audio source loading section

  // Load one of the bundled demo files from static/audio/.
  async loadDemo(filename) {
    await this._ensureReady();
    await this._loadFromUrl(`/audio/${filename}`);
  }

  // Load a File object from a user's <input type="file">.
  async loadFile(file) {
    await this._ensureReady();
    const url = URL.createObjectURL(file);
    await this._loadFromUrl(url);
  }

  // Fetch a mono audio file from an arbitrary URL and decode it.
  async loadUrl(url) {
    await this._ensureReady();
    await this._loadFromUrl(url);
  }

  async _loadFromUrl(url) {
    this._stop();

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Audio fetch failed: ${url}`);
    const buf     = await res.arrayBuffer();
    const decoded = await this._ctx.decodeAudioData(buf);

    // Downmix to mono by averaging channels if needed.
    const mono = toMono(decoded, this._ctx);

    const sourceNode = this._ctx.createBufferSource();
    sourceNode.buffer = mono;
    sourceNode.loop   = true;
    sourceNode.connect(this._gainNode);
    this._source = sourceNode;
  }

  // Playback control

  play() {
    if (!this._ready || !this._source || this._playing) return;
    this._source.start(0);
    this._playing = true;
    if (this._ctx.state === 'suspended') this._ctx.resume();
  }

  pause() {
    if (!this._playing) return;
    this._ctx.suspend();
    this._playing = false;
  }

  resume() {
    if (this._playing) return;
    this._ctx.resume();
    this._playing = true;
  }

  _stop() {
    if (this._source) {
      try { this._source.stop(); } catch (_) {}
      this._source.disconnect();
      this._source = null;
    }
    this._playing = false;
  }

  // Spatial parameters — call these whenever gyroscope / mouse changes

  setAzimuth(deg) {
    this._azimuth = deg;
    this._sendIR(this._azimuth, this._elevation);
  }

  setElevation(deg) {
    this._elevation = deg;
    this._sendIR(this._azimuth, this._elevation);
  }

  setPosition(azimuth, elevation) {
    this._azimuth   = azimuth;
    this._elevation = elevation;
    this._sendIR(azimuth, elevation);
  }

  setDistance(meters) {
    this._distance = meters;
    if (!this._node) return;
    this._node.port.postMessage({ type: 'distance', value: meters });
  }

  setWetMix(amount) {
    if (!this._node) return;
    this._node.port.postMessage({ type: 'wetMix', value: amount });
  }

  setGain(value) {
    if (this._gainNode) this._gainNode.gain.setTargetAtTime(value, this._ctx.currentTime, 0.01);
  }

  // Internal

  _sendIR(azimuth, elevation) {
    if (!this._node || !this._loader.loaded) return;
    const { left, right, length } = this._loader.interpolateForWorklet(azimuth, elevation);
    // Transfer ownership of ArrayBuffers (zero-copy).
    this._node.port.postMessage({ type: 'ir', left, right, length }, [left, right]);
  }

  async _ensureReady() {
    if (!this._ready) await this.init();
  }

  get isReady()   { return this._ready; }
  get isPlaying() { return this._playing; }
  get azimuth()   { return this._azimuth; }
  get elevation() { return this._elevation; }
  get distance()  { return this._distance; }
}

// Helper: downmix AudioBuffer to mono

function toMono(audioBuffer, ctx) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer;

  const mono   = ctx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
  const output = mono.getChannelData(0);
  const nCh    = audioBuffer.numberOfChannels;

  for (let ch = 0; ch < nCh; ch++) {
    const channel = audioBuffer.getChannelData(ch);
    for (let i = 0; i < audioBuffer.length; i++) output[i] += channel[i];
  }
  for (let i = 0; i < output.length; i++) output[i] /= nCh;

  return mono;
}
