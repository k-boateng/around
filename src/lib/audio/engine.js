// Main-thread audio engine.
// Owns the AudioContext, loads the AudioWorklet and HRTF dataset,
// and exposes a simple API for the UI to call.
//
// Uses MediaElementAudioSourceNode so full tracks stream natively —
// no full decode into RAM, seeking and duration work out of the box.

import { HRTFLoader } from './hrtf-loader.js';

const WORKLET_URL = '/spatial-processor.js'; // served from static/
const HRTF_URL    = '/hrtf';                 // served from static/hrtf/

export class SpatialEngine {
  constructor() {
    this._ctx       = null;
    this._node      = null;   // AudioWorkletNode
    this._source    = null;   // MediaElementAudioSourceNode (created once)
    this._gainNode  = null;
    this._analyser  = null;
    this._ampBuf    = null;
    this._audioEl   = null;   // <audio> element — the actual playback engine
    this._loader    = new HRTFLoader();

    this._azimuth   = 0;
    this._elevation = 0;
    this._distance  = 1;

    this._trackName   = '';
    this._objectUrl   = null; // revoke previous blob URL on track change
    this._ready       = false;
  }

  // Must be called from a user-gesture handler (click/touch) to satisfy
  // browser autoplay policy. Safe to call more than once.
  async init() {
    if (this._ready) return;

    this._ctx = new AudioContext({ sampleRate: 44100 });

    // One <audio> element lives for the lifetime of the engine.
    // Changing tracks = changing audioEl.src, not creating new nodes.
    this._audioEl      = new Audio();
    this._audioEl.loop = true;

    // Wrap in Web Audio graph (created once, reused for all tracks).
    this._source = this._ctx.createMediaElementSource(this._audioEl);

    // Force the gain node to mono so the spatial worklet always gets
    // a single channel regardless of whether the track is stereo or mono.
    this._gainNode = this._ctx.createGain();
    this._gainNode.channelCount          = 1;
    this._gainNode.channelCountMode      = 'explicit';
    this._gainNode.channelInterpretation = 'speakers';

    // Analyser taps the pre-spatialization signal for amplitude reads.
    this._analyser        = this._ctx.createAnalyser();
    this._analyser.fftSize = 256;
    this._ampBuf          = new Uint8Array(this._analyser.fftSize);

    // Register the worklet processor.
    await this._ctx.audioWorklet.addModule(WORKLET_URL);

    this._node = new AudioWorkletNode(this._ctx, 'spatial-processor', {
      numberOfInputs:     1,
      numberOfOutputs:    1,
      outputChannelCount: [2],
    });

    // Graph: <audio> → gain (mono) → analyser
    //                             → spatial worklet → destination
    this._source.connect(this._gainNode);
    this._gainNode.connect(this._analyser);
    this._gainNode.connect(this._node);
    this._node.connect(this._ctx.destination);

    // Load the full HRTF dataset (parallel fetches).
    await this._loader.load(this._ctx, HRTF_URL);

    // Send initial HRTF to worklet.
    this._sendIR(this._azimuth, this._elevation);

    this._ready = true;
  }

  // Audio source loading

  // Load one of the bundled demo tracks from static/audio/.
  async loadDemo(filename) {
    await this._ensureReady();
    const name = filename.replace(/\.[^.]+$/, ''); // strip extension
    await this._loadFromUrl(`/audio/${filename}`, name);
  }

  // Load a File from a user's <input type="file">.
  async loadFile(file) {
    await this._ensureReady();
    this._revokeObjectUrl();
    this._objectUrl = URL.createObjectURL(file);
    const name = file.name.replace(/\.[^.]+$/, '');
    await this._loadFromUrl(this._objectUrl, name);
  }

  // Fetch a track from an arbitrary URL (must allow CORS).
  async loadUrl(url) {
    await this._ensureReady();
    const name = url.split('/').pop().replace(/\.[^.]+$/, '') || url;
    await this._loadFromUrl(url, name);
  }

  async _loadFromUrl(url, trackName = '') {
    // External URLs need crossOrigin for Web Audio to process them.
    const isExternal = /^https?:\/\//.test(url);
    this._audioEl.crossOrigin = isExternal ? 'anonymous' : '';

    this._audioEl.pause();
    this._audioEl.src = url;
    this._trackName   = trackName;

    // Wait until the browser has enough data to report duration.
    await new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error(`Failed to load: ${url}`)); };
      const cleanup = () => {
        this._audioEl.removeEventListener('canplay', onReady);
        this._audioEl.removeEventListener('error',   onError);
      };
      this._audioEl.addEventListener('canplay', onReady,  { once: true });
      this._audioEl.addEventListener('error',   onError,  { once: true });
    });
  }

  // Playback control

  async play() {
    if (!this._ready || !this._audioEl.src) return;
    await this._ctx.resume();
    await this._audioEl.play();
  }

  pause() {
    this._audioEl?.pause();
  }

  seek(seconds) {
    if (this._audioEl) this._audioEl.currentTime = seconds;
  }

  setLoop(loop) {
    if (this._audioEl) this._audioEl.loop = loop;
  }

  // Spatial parameters — call on every gyroscope / mouse update

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
    this._node?.port.postMessage({ type: 'distance', value: meters });
  }

  setWetMix(amount) {
    this._node?.port.postMessage({ type: 'wetMix', value: amount });
  }

  setGain(value) {
    if (this._gainNode) {
      this._gainNode.gain.setTargetAtTime(value, this._ctx.currentTime, 0.01);
    }
  }

  // Amplitude — call once per animation frame

  getAmplitude() {
    if (!this._analyser) return 0;
    this._analyser.getByteTimeDomainData(this._ampBuf);
    let sum = 0;
    for (let i = 0; i < this._ampBuf.length; i++) {
      const s = (this._ampBuf[i] - 128) / 128;
      sum += s * s;
    }
    return Math.sqrt(sum / this._ampBuf.length);
  }

  // Getters

  get isReady()    { return this._ready; }
  get isPlaying()  { return this._audioEl ? !this._audioEl.paused : false; }
  get currentTime(){ return this._audioEl?.currentTime ?? 0; }
  get duration()   { return this._audioEl?.duration    ?? 0; }
  get trackName()  { return this._trackName; }
  get azimuth()    { return this._azimuth; }
  get elevation()  { return this._elevation; }
  get distance()   { return this._distance; }

  // Internal

  _sendIR(azimuth, elevation) {
    if (!this._node || !this._loader.loaded) return;
    const { left, right, length } = this._loader.interpolateForWorklet(azimuth, elevation);
    this._node.port.postMessage({ type: 'ir', left, right, length }, [left, right]);
  }

  _revokeObjectUrl() {
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
      this._objectUrl = null;
    }
  }

  async _ensureReady() {
    if (!this._ready) await this.init();
  }
}
