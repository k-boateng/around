// Ported from hrtf_loader.cpp in the spatial-audio C++ engine.
//
// Dataset layout: static/hrtf/elev{e}/H{e}e{az}a.wav
// Right-side symmetry: only 0–180° stored; az > 180° reconstructed by mirroring + L/R swap.

// Exact azimuth lists per elevation, matching actual KEMAR dataset filenames.
// elev±40 use non-uniform ~6.43° spacing (29 files each).
// elev50 ends at 176°, not 180° (23 files).
// All other elevations use uniform steps.
const AZ_LISTS = new Map([
  [ -40, [0,6,13,19,26,32,39,45,51,58,64,71,77,84,90,96,103,109,116,122,129,135,141,148,154,161,167,174,180] ],
  [ -30, range(0, 180, 6)  ],
  [ -20, range(0, 180, 5)  ],
  [ -10, range(0, 180, 5)  ],
  [   0, range(0, 180, 5)  ],
  [  10, range(0, 180, 5)  ],
  [  20, range(0, 180, 5)  ],
  [  30, range(0, 180, 6)  ],
  [  40, [0,6,13,19,26,32,39,45,51,58,64,71,77,84,90,96,103,109,116,122,129,135,141,148,154,161,167,174,180] ],
  [  50, range(0, 176, 8)  ],  // last file is H50e176a.wav
  [  60, range(0, 180, 10) ],
  [  70, range(0, 180, 15) ],
  [  80, range(0, 180, 30) ],
  [  90, [0]               ],  // single measurement at zenith
]);

function range(start, end, step) {
  const out = [];
  for (let v = start; v <= end; v += step) out.push(v);
  return out;
}

// Ordered elevation list derived from AZ_LISTS (used for bracket search).
const ELEVATIONS = [...AZ_LISTS.keys()].sort((a, b) => a - b).map(elev => ({ elev }));

function hrtfPath(baseUrl, elev, az) {
  const azStr = String(az).padStart(3, '0');
  return `${baseUrl}/elev${elev}/H${elev}e${azStr}a.wav`;
}

export class HRTFLoader {
  constructor() {
    // `${elev},${az}` → { left: Float32Array, right: Float32Array }
    this._store = new Map();
    this._irLength = 0;
    this.loaded = false;
  }

  // Fetch and decode all HRTF WAV files in parallel.
  // audioCtx must be an AudioContext (not OfflineAudioContext).
  async load(audioCtx, baseUrl = '/hrtf') {
    const tasks = [];

    for (const { elev } of ELEVATIONS) {
      for (const az of AZ_LISTS.get(elev)) {
        const url = hrtfPath(baseUrl, elev, az);
        tasks.push(
          fetch(url)
            .then(r => {
              if (!r.ok) throw new Error(`HRTF not found: ${url}`);
              return r.arrayBuffer();
            })
            .then(buf => audioCtx.decodeAudioData(buf))
            .then(decoded => {
              const ir = {
                left:  decoded.getChannelData(0).slice(),
                right: decoded.getChannelData(1).slice(),
              };
              this._store.set(`${elev},${az}`, ir);
              if (decoded.length > this._irLength) this._irLength = decoded.length;
            })
        );
      }
    }

    await Promise.all(tasks);
    this.loaded = true;
  }

  get irLength() { return this._irLength; }

  // Bracket azimuth within a given elevation row.
  // Returns the two bounding IRs and the interpolation alpha.
  // Handles mirror symmetry: az > 180° maps to stored (360-az) with L/R swapped.
  _bracketAz(elevIdx, azimuth) {
    const { elev } = ELEVATIONS[elevIdx];
    const azs = AZ_LISTS.get(elev);

    const mirrored = azimuth > 180;
    const rawAz = mirrored ? 360 - azimuth : azimuth;
    const clamped = Math.max(azs[0], Math.min(azs[azs.length - 1], rawAz));

    let loRaw = azs[0];
    let hiRaw = azs[azs.length - 1];
    for (let i = 0; i < azs.length - 1; i++) {
      if (azs[i] <= clamped && azs[i + 1] >= clamped) {
        loRaw = azs[i];
        hiRaw = azs[i + 1];
        break;
      }
    }

    const alpha = loRaw === hiRaw ? 0 : (clamped - loRaw) / (hiRaw - loRaw);

    const getIR = raw => {
      const ir = this._store.get(`${elev},${raw}`);
      if (!ir) return null;
      // Mirror: swap channels so left-ear data drives the correct ear.
      return mirrored ? { left: ir.right, right: ir.left } : ir;
    };

    return { irLo: getIR(loRaw), irHi: getIR(hiRaw), alpha };
  }

  // Bilinear interpolation over azimuth × elevation.
  // azimuth: 0–360°   elevation: −40–90°
  // Returns { left: Float32Array, right: Float32Array } ready for convolution.
  interpolate(azimuth, elevation) {
    azimuth   = ((azimuth % 360) + 360) % 360;
    elevation = Math.max(ELEVATIONS[0].elev, Math.min(ELEVATIONS[ELEVATIONS.length - 1].elev, elevation));

    // Bracket elevation: find the two rows that straddle the target.
    let loIdx = ELEVATIONS.length - 2;
    for (let i = 0; i < ELEVATIONS.length - 1; i++) {
      if (ELEVATIONS[i + 1].elev > elevation) { loIdx = i; break; }
    }
    const hiIdx  = loIdx + 1;
    const elevLo = ELEVATIONS[loIdx].elev;
    const elevHi = ELEVATIONS[hiIdx].elev;
    const beta   = elevLo === elevHi ? 0 : (elevation - elevLo) / (elevHi - elevLo);

    // Bracket azimuth at each elevation row.
    const { irLo: A, irHi: B, alpha: alphaLo } = this._bracketAz(loIdx, azimuth);
    const { irLo: C, irHi: D, alpha: alphaHi } = this._bracketAz(hiIdx, azimuth);

    // Bilinear weights:
    //   A = (elevLo, azLo)   B = (elevLo, azHi)
    //   C = (elevHi, azLo)   D = (elevHi, azHi)
    const wA = (1 - alphaLo) * (1 - beta);
    const wB =      alphaLo  * (1 - beta);
    const wC = (1 - alphaHi) *      beta;
    const wD =      alphaHi  *      beta;

    const len  = this._irLength;
    const outL = new Float32Array(len);
    const outR = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      outL[i] = wA * (A?.left[i]  ?? 0) + wB * (B?.left[i]  ?? 0)
              + wC * (C?.left[i]  ?? 0) + wD * (D?.left[i]  ?? 0);
      outR[i] = wA * (A?.right[i] ?? 0) + wB * (B?.right[i] ?? 0)
              + wC * (C?.right[i] ?? 0) + wD * (D?.right[i] ?? 0);
    }

    return { left: outL, right: outR };
  }

  // Returns transferable ArrayBuffers for zero-copy postMessage to AudioWorklet.
  interpolateForWorklet(azimuth, elevation) {
    const { left, right } = this.interpolate(azimuth, elevation);
    return {
      left:   left.buffer,
      right:  right.buffer,
      length: left.length,
    };
  }
}
