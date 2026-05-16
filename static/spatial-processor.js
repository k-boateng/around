// AudioWorklet processor: runs on the audio thread.
// Ports three C++ classes from the spatial-audio engine:
//   - StreamingConvolver  (streaming_convolver.cpp) — overlap-add FFT convolution
//   - DistanceProcessor   (distance.cpp)            — 1/r gain + air absorption LPF
//   - Reverb              (reverb.cpp)              — Schroeder reverberator

const BLOCK = 128; // Web Audio API's fixed quantum size

// Overlap-add convolver (one instance per ear)

class OverlapAddConvolver {
  constructor(irLength) {
    this._fftSize  = nextPow2(BLOCK + irLength - 1);
    this._irFreq   = null; // set via setIR()
    this._tail     = new Float32Array(this._fftSize);
    this._fft      = new FFT(this._fftSize);
  }

  setIR(ir) {
    // Zero-pad IR to FFT size and transform to frequency domain.
    const padded = new Float32Array(this._fftSize);
    padded.set(ir);
    this._irFreq = this._fft.forward(padded);
  }

  // Clear accumulated tail so a fresh crossfade target starts clean.
  resetTail() {
    this._tail.fill(0);
  }

  process(input) {
    if (!this._irFreq) return new Float32Array(BLOCK);

    const fftSize = this._fftSize;

    // Zero-pad input block to FFT size.
    const padded = new Float32Array(fftSize);
    padded.set(input);

    // Convolve in frequency domain.
    const inFreq  = this._fft.forward(padded);
    const outFreq = complexMultiply(inFreq, this._irFreq, fftSize);
    const outTime = this._fft.inverse(outFreq);

    // Overlap-add: add tail from previous block.
    for (let i = 0; i < fftSize; i++) outTime[i] += this._tail[i];

    // Save the tail (samples past the block boundary) for the next block.
    this._tail.fill(0);
    for (let i = BLOCK; i < fftSize; i++) this._tail[i - BLOCK] += outTime[i];

    return outTime.subarray(0, BLOCK);
  }
}

// Schroeder reverberator (reverb.cpp)
// 4 parallel comb filters → 2 series allpass filters

class CombFilter {
  constructor(delayFrames, feedback) {
    this._buf      = new Float32Array(delayFrames);
    this._feedback = feedback;
    this._pos      = 0;
  }

  process(x) {
    const y = this._buf[this._pos];
    this._buf[this._pos] = x + y * this._feedback;
    this._pos = (this._pos + 1) % this._buf.length;
    return y;
  }
}

class AllpassFilter {
  constructor(delayFrames, feedback) {
    this._buf      = new Float32Array(delayFrames);
    this._feedback = feedback;
    this._pos      = 0;
  }

  process(x) {
    const delayed = this._buf[this._pos];
    const v       = x + delayed * this._feedback;
    this._buf[this._pos] = v;
    this._pos = (this._pos + 1) % this._buf.length;
    return delayed - v * this._feedback;
  }
}

class Reverb {
  constructor() {
    const fb = 0.84; // ~500 ms RT60, matching reverb.cpp
    this._combs = [
      new CombFilter(1116, fb),
      new CombFilter(1188, fb),
      new CombFilter(1277, fb),
      new CombFilter(1356, fb),
    ];
    this._allpasses = [
      new AllpassFilter(225, 0.5),
      new AllpassFilter(556, 0.5),
    ];
  }

  // Returns a single wet sample.
  processSample(x) {
    let out = 0;
    for (const c of this._combs) out += c.process(x);
    out /= this._combs.length;
    for (const a of this._allpasses) out = a.process(out);
    return out;
  }
}

// Distance processor (distance.cpp)
// 1/r amplitude + 1-pole air absorption low-pass filter

class DistanceProcessor {
  constructor() {
    this._distance = 1;
    this._alpha    = 0;   // LPF coefficient
    this._y        = 0;   // filter state
    this._setDistance(1);
  }

  setDistance(d) {
    this._distance = Math.max(0.5, d);
    this._setDistance(this._distance);
  }

  _setDistance(d) {
    const cutoff  = Math.min(20000, 20000 / Math.sqrt(d));
    const omega   = (2 * Math.PI * cutoff) / sampleRate; // sampleRate is global in worklet
    this._alpha   = 1 - Math.exp(-omega);
    this._gain    = 1 / d;
  }

  processSample(x) {
    const attenuated = x * this._gain;
    this._y = this._alpha * attenuated + (1 - this._alpha) * this._y;
    return this._y;
  }
}


// Minimal real-valued FFT (Cooley-Tukey, radix-2 DIT)
// Stores spectrum as interleaved [re0, im0, re1, im1, ...].

class FFT {
  constructor(size) {
    this._n  = size;
    this._wr = new Float32Array(size / 2);
    this._wi = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this._wr[i] = Math.cos(angle);
      this._wi[i] = Math.sin(angle);
    }
  }

  // Returns interleaved complex spectrum (length = 2 * n).
  forward(real) {
    const n   = this._n;
    const out = new Float32Array(n * 2);
    // Copy real input into interleaved buffer.
    for (let i = 0; i < n; i++) { out[2*i] = real[i]; out[2*i+1] = 0; }
    this._transform(out);
    return out;
  }

  // Inverse FFT, returns real part normalised by 1/n.
  inverse(spectrum) {
    const n   = this._n;
    const buf = new Float32Array(n * 2);
    // Conjugate.
    for (let i = 0; i < n; i++) { buf[2*i] = spectrum[2*i]; buf[2*i+1] = -spectrum[2*i+1]; }
    this._transform(buf);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = buf[2*i] / n;
    return out;
  }

  _transform(buf) {
    const n = this._n;
    // Bit-reversal permutation.
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [buf[2*i], buf[2*j]] = [buf[2*j], buf[2*i]];
        [buf[2*i+1], buf[2*j+1]] = [buf[2*j+1], buf[2*i+1]];
      }
    }
    // Butterfly.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const wr = this._wr[k * step];
          const wi = this._wi[k * step];
          const ur = buf[2*(i+k)],       ui = buf[2*(i+k)+1];
          const vr = buf[2*(i+k+half)],  vi = buf[2*(i+k+half)+1];
          const tr = wr*vr - wi*vi,      ti = wr*vi + wi*vr;
          buf[2*(i+k)]       = ur + tr;  buf[2*(i+k)+1]       = ui + ti;
          buf[2*(i+k+half)]  = ur - tr;  buf[2*(i+k+half)+1]  = ui - ti;
        }
      }
    }
  }
}

// Helpers

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Complex multiply of two interleaved spectra, returns new interleaved array.
function complexMultiply(a, b, fftSize) {
  const out = new Float32Array(fftSize * 2);
  for (let i = 0; i < fftSize; i++) {
    const ar = a[2*i], ai = a[2*i+1];
    const br = b[2*i], bi = b[2*i+1];
    out[2*i]   = ar*br - ai*bi;
    out[2*i+1] = ar*bi + ai*br;
  }
  return out;
}

// AudioWorkletProcessor

class SpatialProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this._irLength = 256;

    // "Current" pair — always running, produces the live output.
    this._convL = new OverlapAddConvolver(this._irLength);
    this._convR = new OverlapAddConvolver(this._irLength);

    // "Next" pair — runs only during a crossfade, then gets promoted.
    this._nextL = new OverlapAddConvolver(this._irLength);
    this._nextR = new OverlapAddConvolver(this._irLength);

    // Crossfade state.
    // 512 samples ≈ 12 ms at 44100 Hz — long enough to hide the IR boundary,
    // short enough that position lag is imperceptible.
    this._crossfading    = false;
    this._crossfadePos   = 0;
    this._crossfadeLen   = 512;
    this._hasIR          = false;

    this._reverb   = new Reverb();
    this._distance = new DistanceProcessor();
    this._wetMix   = 0.35;

    // Messages from the main thread:
    //   { type: 'ir',       left: ArrayBuffer, right: ArrayBuffer, length: number }
    //   { type: 'distance', value: number }
    //   { type: 'wetMix',   value: number }
    this.port.onmessage = ({ data }) => {
      if (data.type === 'ir') {
        const left  = new Float32Array(data.left);
        const right = new Float32Array(data.right);

        if (!this._hasIR) {
          // First IR ever: apply directly with no crossfade.
          this._convL.setIR(left);
          this._convR.setIR(right);
          this._hasIR = true;
          return;
        }

        if (!this._crossfading) {
          // Start a fresh crossfade: clear next-pair tails so they begin clean.
          this._nextL.resetTail();
          this._nextR.resetTail();
          this._crossfadePos = 0;
          this._crossfading  = true;
        }
        // (If already crossfading, just update the target IR. The fade continues
        // from its current position — no restart, no extra click.)
        this._nextL.setIR(left);
        this._nextR.setIR(right);

      } else if (data.type === 'distance') {
        this._distance.setDistance(data.value);
      } else if (data.type === 'wetMix') {
        this._wetMix = Math.max(0, Math.min(1, data.value));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const outL  = outputs[0][0];
    const outR  = outputs[0][1];

    if (!input || input.length === 0) return true;

    // Distance attenuation + air absorption (mono).
    const distOut = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      distOut[i] = this._distance.processSample(input[i]);
    }

    // Reverb (wet signal, mono pre-spatialization).
    const reverbOut = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      reverbOut[i] = this._reverb.processSample(distOut[i]);
    }

    // Mix dry + wet before HRTF convolution.
    const mixed = new Float32Array(BLOCK);
    const wet = this._wetMix, dry = 1 - wet;
    for (let i = 0; i < BLOCK; i++) {
      mixed[i] = dry * distOut[i] + wet * reverbOut[i];
    }

    // HRTF convolution — current pair always runs.
    const spatL = this._convL.process(mixed);
    const spatR = this._convR.process(mixed);

    if (this._crossfading) {
      // Next pair also processes the same block so its tail stays in sync.
      const nxtL = this._nextL.process(mixed);
      const nxtR = this._nextR.process(mixed);

      for (let i = 0; i < BLOCK; i++) {
        // Linear ramp within this block — no per-sample branch.
        const alpha = Math.min(1, (this._crossfadePos + i) / this._crossfadeLen);
        const inv   = 1 - alpha;
        outL[i] = inv * spatL[i] + alpha * nxtL[i];
        outR[i] = inv * spatR[i] + alpha * nxtR[i];
      }

      this._crossfadePos += BLOCK;

      if (this._crossfadePos >= this._crossfadeLen) {
        // Promote: next becomes current, old current becomes the standby pair.
        const tmpL = this._convL, tmpR = this._convR;
        this._convL = this._nextL; this._convR = this._nextR;
        this._nextL = tmpL;        this._nextR = tmpR;
        this._crossfading = false;
      }
    } else {
      for (let i = 0; i < BLOCK; i++) {
        outL[i] = spatL[i];
        outR[i] = spatR[i];
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('spatial-processor', SpatialProcessor);
