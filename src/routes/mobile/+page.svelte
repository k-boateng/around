<script>
  import { onMount, onDestroy } from 'svelte';
  import { Scene }         from '$lib/three/scene.js';
  import { SphereVis }     from '$lib/three/sphere-vis.js';
  import { SpatialEngine } from '$lib/audio/engine.js';

  const DEMOS = [
    { label: 'Footsteps',      file: 'footsteps.mp3',  artist: 'Sound design'   },
    { label: 'Morgan Freeman', file: 'freeman.mp3',    artist: 'Morgan Freeman'  },
    { label: 'Hallelujah',     file: 'hallelujah.mp3', artist: 'Jeff Buckley'   },
    { label: "Don't Worry",    file: 'dontworry.mp3',  artist: 'Bobby McFerrin' },
  ];

  let canvas;
  let scene, vis, engine;

  let playing     = $state(false);
  let loading     = $state(false);
  let error       = $state('');
  let activeDemo  = $state(null);
  let trackTitle  = $state('');
  let trackArtist = $state('');
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
    vis    = new SphereVis(scene, { sourceRadius: 18 });
    engine = new SpatialEngine();

    // Pre-fetch HRTF files in the background after a short delay so the
    // page renders first, then quietly loads HRTF data in the background.
    setTimeout(() => engine.prefetchHRTF(), 1000);

    scene.onFrame((delta, elapsed) => {
      vis.setAmplitude(engine.getAmplitude());
      vis.update(delta, elapsed);
      playing     = engine.isPlaying;
      currentTime = engine.currentTime;
      duration    = engine.duration;
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
        error = 'Gyroscope permission denied.';
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
    activeDemo  = demo.file;
    trackTitle  = demo.label;
    trackArtist = demo.artist;
    try {
      await engine.loadDemo(demo.file);
      await engine.play();
    } catch (e) {
      error = `${demo.label}: ${e?.message ?? e}`;
      activeDemo  = null;
      trackTitle  = '';
      trackArtist = '';
    }
    loading = false;
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    error = '';
    loading = true;
    activeDemo  = null;
    trackTitle  = file.name.replace(/\.[^.]+$/, '');
    trackArtist = '';
    try {
      await engine.loadFile(file);
      await engine.play();
    } catch (e) {
      error = `Upload failed: ${e?.message ?? e}`;
      trackTitle = '';
    }
    loading = false;
  }

  async function togglePlayPause() {
    if (engine.isPlaying) engine.pause();
    else await engine.play();
  }

  // -------------------------------------------------------------------------
  // Seek
  // -------------------------------------------------------------------------

  function formatTime(s) {
    if (!isFinite(s)) return '0:00';
    const m   = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, '0');
    return `${m}:${sec}`;
  }

  function onSeekTouch(e) {
    const bar = e.currentTarget;
    const t   = e.touches[0];
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
    <div class="mode-toggle">
      <button
        class:active={inputMode === 'gyro'}
        onclick={() => setInputMode('gyro')}
        disabled={!gyroAvail}
      >gyro</button>
      <button
        class:active={inputMode === 'touch'}
        onclick={() => setInputMode('touch')}
      >drag</button>
    </div>
  </header>

  {#if inputMode === 'gyro' && gyroGranted}
    <button class="reset-btn" onclick={resetHeading}>reset</button>
  {:else if inputMode === 'gyro' && !gyroGranted && gyroAvail}
    <button class="enable-gyro" onclick={requestGyro}>enable gyroscope</button>
  {/if}

  {#if trackTitle}
    <div class="now-playing">
      <div class="track-title">{trackTitle}</div>
      {#if trackArtist}
        <div class="track-artist">{trackArtist}</div>
      {/if}
    </div>
  {/if}

  <!-- Seek bar lives at the top, below the header -->
  <div class="seek-area">
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
      <div class="seek-track"></div>
      <div class="seek-fill" style="width: {duration ? (currentTime / duration) * 100 : 0}%"></div>
      <div class="seek-thumb" style="left: {duration ? (currentTime / duration) * 100 : 0}%"></div>
    </div>
    <div class="time-row">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(duration)}</span>
    </div>
  </div>

  <footer>
    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="demos">
      {#each DEMOS as demo}
        <button
          class="demo-chip"
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
        Upload
        <input type="file" accept="audio/*" onchange={handleFileUpload} hidden />
      </label>

      {#if loading}
        <span class="loading">loading</span>
      {/if}
    </div>

    <div class="hint">
      {#if inputMode === 'gyro' && gyroGranted}
        move your phone · the sound follows
      {:else if inputMode === 'touch'}
        drag to move the sound
      {/if}
    </div>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #0a0a0a;
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 300;
    color: #e8e6e0;
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

  /* Header */
  header {
    position: fixed;
    top: env(safe-area-inset-top, 20px);
    left: 0; right: 0;
    padding: 20px 20px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    z-index: 10;
    pointer-events: none;
  }

  header > * { pointer-events: auto; }

  .wordmark {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 24px;
    font-weight: 300;
    letter-spacing: -0.02em;
    color: #e8e6e0;
    text-transform: lowercase;
  }

  .mode-toggle {
    display: flex;
    gap: 4px;
  }

  .mode-toggle button {
    background: transparent;
    border: 1px solid #1a1917;
    color: #4a4843;
    padding: 5px 11px;
    border-radius: 999px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .mode-toggle button.active   { border-color: #3a3935; color: #e8e6e0; }
  .mode-toggle button:disabled { opacity: 0.2; cursor: not-allowed; }

  /* Gyro controls */
  .reset-btn {
    position: fixed;
    top: calc(env(safe-area-inset-top, 20px) + 68px);
    left: 20px;
    background: transparent;
    border: 1px solid #1a1917;
    color: #4a4843;
    padding: 5px 12px;
    border-radius: 999px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.08em;
    cursor: pointer;
    z-index: 10;
    transition: border-color 0.2s, color 0.2s;
  }

  .reset-btn:hover { border-color: #3a3935; color: #e8e6e0; }

  .enable-gyro {
    position: fixed;
    top: calc(env(safe-area-inset-top, 20px) + 68px);
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    border: 1px solid #2a2926;
    color: #e8e6e0;
    padding: 10px 24px;
    border-radius: 999px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    cursor: pointer;
    z-index: 10;
  }

  /* Now-playing — centred in viewport */
  .now-playing {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    pointer-events: none;
    z-index: 10;
  }

  .track-title {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 20px;
    font-weight: 300;
    color: #d4d2cc;
    letter-spacing: -0.01em;
  }

  .track-artist {
    font-size: 10px;
    font-weight: 300;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b6862;
    margin-top: 7px;
  }

  /* Footer */
  footer {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 20px calc(env(safe-area-inset-bottom, 0px) + 24px);
    background: linear-gradient(to top, rgba(10,10,10,0.97) 60%, transparent);
    z-index: 10;
  }

  /* Seek area — fixed below header */
  .seek-area {
    position: fixed;
    top: calc(env(safe-area-inset-top, 20px) + 60px);
    left: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 10;
  }

  .seek-bar {
    position: relative;
    width: 100%;
    height: 24px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .seek-track {
    position: absolute;
    left: 0; right: 0;
    height: 1px;
    background: #2a2926;
    border-radius: 1px;
  }

  .seek-fill {
    position: absolute;
    top: 50%; left: 0;
    transform: translateY(-50%);
    height: 1px;
    background: #e8e6e0;
    border-radius: 1px;
    pointer-events: none;
  }

  .seek-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #e8e6e0;
    pointer-events: none;
  }

  .time-row {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    letter-spacing: 0.05em;
    color: #4a4843;
  }

  /* Demo chips */
  .demos {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    width: 100%;
    max-width: 480px;
    padding-bottom: 2px;
    scrollbar-width: none;
    justify-content: center;
    flex-wrap: wrap;
  }

  .demos::-webkit-scrollbar { display: none; }

  .demo-chip {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid #1a1917;
    color: #6b6862;
    font-family: inherit;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.06em;
    padding: 7px 14px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s, border-color 0.2s;
  }

  .demo-chip.active   { color: #e8e6e0; border-color: #3a3935; }
  .demo-chip:disabled { opacity: 0.35; }

  /* Actions */
  .actions { display: flex; align-items: center; gap: 12px; }

  .play-btn {
    width: 48px; height: 48px;
    border-radius: 50%;
    border: 1px solid #2a2926;
    background: transparent;
    color: #e8e6e0;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s;
  }

  .play-btn:disabled { opacity: 0.3; }

  .pill-btn {
    background: transparent;
    border: 1px solid #2a2926;
    color: #6b6862;
    font-family: inherit;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 11px 18px;
    border-radius: 999px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .hint {
    font-size: 10px;
    font-weight: 300;
    letter-spacing: 0.12em;
    text-transform: lowercase;
    color: #4a4843;
    text-align: center;
    min-height: 14px;
  }

  .loading {
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #4a4843;
    animation: pulse 1.4s ease-in-out infinite;
  }

  .error {
    font-size: 11px;
    color: #8b4a52;
    letter-spacing: 0.05em;
    margin: 0;
    text-align: center;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50%       { opacity: 1;   }
  }
</style>
