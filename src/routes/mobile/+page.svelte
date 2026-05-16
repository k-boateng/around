<script>
  import { onMount, onDestroy } from 'svelte';
  import { Scene }         from '$lib/three/scene.js';
  import { SphereVis }     from '$lib/three/sphere-vis.js';
  import { SpatialEngine } from '$lib/audio/engine.js';

  // Update to match your actual filenames in static/audio/
  const DEMOS = [
    { label: 'Sound of footsteps',     file: 'footsteps.mp3'  },
    { label: "Morgan Freeman's voice", file: 'freeman.mp3'    },
    { label: 'Hallelujah',             file: 'hallelujah.mp3' },
    { label: "Don't Worry",            file: 'dontworry.mp3'  },
  ];

  let canvas;
  let scene, vis, engine;

  let playing     = $state(false);
  let loading     = $state(false);
  let error       = $state('');
  let activeDemo  = $state(null);
  let trackName   = $state('');
  let currentTime = $state(0);
  let duration    = $state(0);
  let azimuth     = $state(0);
  let elevation   = $state(0);

  let inputMode   = $state('gyro');
  let gyroGranted = $state(false);
  let gyroAvail   = $state(false);

  let smoothAz    = 0;
  let smoothEl    = 0;
  let alphaOffset = null;

  let touching = false;
  let lastTX = 0, lastTY = 0;

  onMount(() => {
    scene  = new Scene(canvas);
    vis    = new SphereVis(scene);
    engine = new SpatialEngine();

    // Pre-fetch HRTF files in the background so they're cached before the
    // user taps a track. No AudioContext needed for plain fetch().
    engine.prefetchHRTF();

    scene.onFrame((delta, elapsed) => {
      vis.setAmplitude(engine.getAmplitude());
      vis.update(delta, elapsed);
      playing     = engine.isPlaying;
      currentTime = engine.currentTime;
      duration    = engine.duration;
      trackName   = engine.trackName;
    });

    scene.start();

    gyroAvail = typeof DeviceOrientationEvent !== 'undefined';

    // Android fires without permission — start immediately.
    if (gyroAvail && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', onOrientation);
      gyroGranted = true;
    }
  });

  onDestroy(() => {
    window.removeEventListener('deviceorientation', onOrientation);
    scene?.destroy();
    vis?.destroy();
  });

  // -------------------------------------------------------------------------
  // Gyroscope
  // -------------------------------------------------------------------------

  async function requestGyro() {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        window.addEventListener('deviceorientation', onOrientation);
        gyroGranted = true;
        inputMode = 'gyro';
      } else {
        error = 'Gyroscope permission denied. Using touch drag instead.';
        inputMode = 'touch';
      }
    } catch {
      error = 'Gyroscope not available on this device.';
      inputMode = 'touch';
    }
  }

  function onOrientation(e) {
    if (inputMode !== 'gyro' || e.alpha === null) return;

    if (alphaOffset === null) alphaOffset = e.alpha;

    const rawAz = ((e.alpha - alphaOffset) % 360 + 360) % 360;
    const rawEl = Math.max(-40, Math.min(90, -(e.beta - 90)));

    const SMOOTH = 0.12;
    let diff = rawAz - smoothAz;
    if (diff >  180) diff -= 360;
    if (diff < -180) diff += 360;
    smoothAz = ((smoothAz + SMOOTH * diff) + 360) % 360;
    smoothEl = smoothEl + SMOOTH * (rawEl - smoothEl);

    azimuth   = smoothAz;
    elevation = smoothEl;
    engine.setPosition(smoothAz, smoothEl);
    vis.setPosition(smoothAz, smoothEl);
  }

  function resetHeading() { alphaOffset = null; }

  // -------------------------------------------------------------------------
  // Touch drag
  // -------------------------------------------------------------------------

  function onTouchStart(e) {
    if (inputMode !== 'touch') return;
    const t = e.touches[0];
    touching = true;
    lastTX = t.clientX;
    lastTY = t.clientY;
  }

  function onTouchMove(e) {
    if (inputMode !== 'touch' || !touching) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastTX;
    const dy = t.clientY - lastTY;
    lastTX = t.clientX;
    lastTY = t.clientY;

    azimuth   = ((azimuth + dx * 0.4) % 360 + 360) % 360;
    elevation = Math.max(-40, Math.min(90, elevation - dy * 0.25));
    engine.setPosition(azimuth, elevation);
    vis.setPosition(azimuth, elevation);
  }

  function onTouchEnd() { touching = false; }

  function setInputMode(mode) {
    inputMode = mode;
    if (mode === 'gyro' && !gyroGranted &&
        typeof DeviceOrientationEvent?.requestPermission === 'function') {
      requestGyro();
    }
  }

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------

  async function selectDemo(demo) {
    error = '';
    loading = true;
    activeDemo = demo.file;
    try {
      await engine.loadDemo(demo.file);
      await engine.play();
    } catch {
      error = `Could not load "${demo.label}".`;
      activeDemo = null;
    }
    loading = false;
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    error = '';
    loading = true;
    activeDemo = null;
    try {
      await engine.loadFile(file);
      await engine.play();
    } catch {
      error = 'Could not decode that file.';
    }
    loading = false;
  }

  async function togglePlayPause() {
    if (engine.isPlaying) engine.pause();
    else await engine.play();
  }

  // -------------------------------------------------------------------------
  // Seek bar
  // -------------------------------------------------------------------------

  function formatTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    return `${m}:${sec}`;
  }

  function onSeekTouch(e) {
    const bar = e.currentTarget;
    const t = e.touches[0];
    const pct = Math.max(0, Math.min(1,
      (t.clientX - bar.getBoundingClientRect().left) / bar.clientWidth
    ));
    engine.seek(pct * duration);
  }
</script>

<main
  ontouchstart={onTouchStart}
  ontouchmove={onTouchMove}
  ontouchend={onTouchEnd}
>
  <canvas bind:this={canvas}></canvas>

  <header>
    <span class="wordmark">around</span>
  </header>

  <div class="mode-toggle">
    <button
      class:active={inputMode === 'gyro'}
      onclick={() => setInputMode('gyro')}
      disabled={!gyroAvail}
    >
      gyro
    </button>
    <button
      class:active={inputMode === 'touch'}
      onclick={() => setInputMode('touch')}
    >
      drag
    </button>
  </div>

  {#if inputMode === 'gyro' && gyroGranted}
    <div class="gyro-hint">move your phone · sound follows</div>
    <button class="reset-btn" onclick={resetHeading}>⊹ reset</button>
  {:else if inputMode === 'gyro' && !gyroGranted && gyroAvail}
    <button class="enable-gyro" onclick={requestGyro}>enable gyroscope</button>
  {:else if inputMode === 'touch'}
    <div class="gyro-hint">drag to move the sound</div>
  {/if}

  <div class="readout">
    <span>{Math.round(azimuth)}°</span>
    <span class="sep">·</span>
    <span>{Math.round(elevation)}°</span>
  </div>

  <footer>
    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if trackName}
      <p class="track-name">{trackName}</p>
    {/if}

    <div
      class="seek-bar"
      ontouchstart={onSeekTouch}
      ontouchmove={onSeekTouch}
      role="slider"
      aria-label="Seek"
      aria-valuemin="0"
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabindex="0"
    >
      <div class="seek-fill" style="width: {duration ? (currentTime / duration) * 100 : 0}%"></div>
      <div class="seek-thumb" style="left: {duration ? (currentTime / duration) * 100 : 0}%"></div>
    </div>

    <div class="time-row">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(duration)}</span>
    </div>

    <div class="demos">
      {#each DEMOS as demo}
        <button
          class="demo-btn"
          class:active={activeDemo === demo.file}
          onclick={() => selectDemo(demo)}
          disabled={loading}
        >
          {demo.label}
        </button>
      {/each}
    </div>

    <div class="actions">
      <button class="play-btn" onclick={togglePlayPause} disabled={loading || !duration}>
        {playing ? '⏸' : '▶'}
      </button>

      <label class="pill-btn">
        ↑ Upload
        <input type="file" accept="audio/*" onchange={handleFileUpload} hidden />
      </label>

      {#if loading}
        <span class="loading">loading…</span>
      {/if}
    </div>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #04060f;
    font-family: 'SF Pro Display', system-ui, sans-serif;
    color: #c8d8ff;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  main {
    position: fixed;
    inset: 0;
    touch-action: none;
  }

  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  header {
    position: fixed;
    top: env(safe-area-inset-top, 20px);
    left: 0; right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 10;
    padding-top: 16px;
  }

  .wordmark {
    font-size: 1.1rem;
    font-weight: 300;
    letter-spacing: 0.22em;
    color: #dde8ff;
    text-transform: lowercase;
  }

  .mode-toggle {
    position: fixed;
    top: env(safe-area-inset-top, 20px);
    right: 20px;
    display: flex;
    gap: 4px;
    z-index: 10;
    margin-top: 16px;
  }

  .mode-toggle button {
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #334477;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .mode-toggle button.active {
    border-color: #4466aa;
    color: #88aaff;
    background: rgba(60,90,200,0.1);
  }

  .mode-toggle button:disabled { opacity: 0.25; cursor: not-allowed; }

  .gyro-hint {
    position: fixed;
    top: 72px;
    left: 0; right: 0;
    text-align: center;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: #2a3a6a;
    pointer-events: none;
    z-index: 10;
  }

  .enable-gyro {
    position: fixed;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(40,60,160,0.2);
    border: 1px solid #3355aa;
    color: #88aaff;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    cursor: pointer;
    z-index: 10;
  }

  .reset-btn {
    position: fixed;
    top: 64px;
    left: 20px;
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #334477;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    z-index: 10;
    transition: border-color 0.2s, color 0.2s;
  }

  .reset-btn:hover { border-color: #3355aa; color: #88aaff; }

  .readout {
    position: fixed;
    top: 64px;
    right: 20px;
    display: flex;
    gap: 4px;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    color: #2a3a6a;
    pointer-events: none;
    z-index: 10;
  }

  .sep { color: #1a2a4a; }

  footer {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 20px);
    background: linear-gradient(to top, rgba(4,6,15,0.97) 65%, transparent);
    z-index: 10;
  }

  .track-name {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: #8899cc;
    text-transform: lowercase;
    text-align: center;
  }

  .seek-bar {
    position: relative;
    width: 100%;
    max-width: 480px;
    height: 20px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .seek-bar::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    height: 3px;
    background: #0e1530;
    border-radius: 2px;
  }

  .seek-fill {
    position: absolute;
    top: 50%; left: 0;
    transform: translateY(-50%);
    height: 3px;
    background: #3355aa;
    border-radius: 2px;
    pointer-events: none;
  }

  .seek-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #88aaff;
    pointer-events: none;
    box-shadow: 0 0 8px rgba(136,170,255,0.7);
  }

  .time-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 480px;
    font-size: 0.62rem;
    letter-spacing: 0.05em;
    color: #334466;
  }

  .demos {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    width: 100%;
    max-width: 480px;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .demos::-webkit-scrollbar { display: none; }

  .demo-btn {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #4466aa;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.2s, color 0.2s;
  }

  .demo-btn.active   { border-color: #5577cc; color: #aabbff; background: rgba(80,100,200,0.1); }
  .demo-btn:disabled { opacity: 0.4; }

  .actions { display: flex; align-items: center; gap: 14px; }

  .play-btn {
    width: 52px; height: 52px;
    border-radius: 50%;
    border: 1px solid #3355aa;
    background: rgba(40,60,160,0.2);
    color: #aabbff;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .play-btn:disabled { opacity: 0.3; }

  .pill-btn {
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #4466aa;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.72rem;
    letter-spacing: 0.07em;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .loading {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: #4455aa;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .error {
    font-size: 0.7rem;
    color: #aa4455;
    letter-spacing: 0.05em;
    margin: 0;
    text-align: center;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 1; }
  }
</style>
