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

  let playing      = $state(false);
  let loading      = $state(false);
  let error        = $state('');
  let activeDemo   = $state(null);
  let trackTitle   = $state('');
  let trackArtist  = $state('');
  let currentTime  = $state(0);
  let duration     = $state(0);
  let azimuth      = $state(0);
  let elevation    = $state(0);
  let urlInput     = $state('');
  let showUrl      = $state(false);

  let dragging     = false;
  let seekDragging = false;
  let lastX = 0, lastY = 0;

  onMount(() => {
    scene  = new Scene(canvas);
    vis    = new SphereVis(scene);
    engine = new SpatialEngine();

    engine.prefetchHRTF();

    scene.onFrame((delta, elapsed) => {
      vis.setAmplitude(engine.getAmplitude());
      vis.update(delta, elapsed);
      playing     = engine.isPlaying;
      currentTime = engine.currentTime;
      duration    = engine.duration;
    });

    scene.start();
  });

  onDestroy(() => {
    scene?.destroy();
    vis?.destroy();
  });

  // -------------------------------------------------------------------------
  // Audio
  // -------------------------------------------------------------------------

  async function selectDemo(demo) {
    error = '';
    loading = true;
    activeDemo = demo.file;
    trackTitle  = demo.label;
    trackArtist = demo.artist;
    try {
      await engine.loadDemo(demo.file);
      await engine.play();
    } catch (e) {
      error = `${demo.label}: ${e?.message ?? e}`;
      activeDemo = null;
      trackTitle = '';
      trackArtist = '';
    }
    loading = false;
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    error = '';
    loading = true;
    activeDemo = null;
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

  async function handleUrl() {
    if (!urlInput.trim()) return;
    error = '';
    loading = true;
    activeDemo = null;
    trackTitle  = urlInput.trim().split('/').pop().replace(/\.[^.]+$/, '') || 'stream';
    trackArtist = '';
    try {
      await engine.loadUrl(urlInput.trim());
      await engine.play();
      showUrl  = false;
      urlInput = '';
    } catch (e) {
      error = `URL failed: ${e?.message ?? e}`;
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

  function seekTo(e) {
    const bar = e.currentTarget;
    const pct = Math.max(0, Math.min(1,
      (e.clientX - bar.getBoundingClientRect().left) / bar.clientWidth
    ));
    engine.seek(pct * duration);
  }

  function onSeekMouseDown(e) { seekDragging = true; seekTo(e); }
  function onSeekMouseMove(e) { if (seekDragging) seekTo(e); }
  function onSeekMouseUp()    { seekDragging = false; }

  // -------------------------------------------------------------------------
  // Canvas drag → azimuth / elevation
  // -------------------------------------------------------------------------

  function onMouseDown(e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    azimuth   = ((azimuth + dx * 0.4) % 360 + 360) % 360;
    elevation = Math.max(-40, Math.min(90, elevation - dy * 0.25));
    engine.setPosition(azimuth, elevation);
    vis.setPosition(azimuth, elevation);
  }

  function onMouseUp() {
    dragging     = false;
    seekDragging = false;
  }
</script>

<svelte:window onmouseup={onMouseUp} />

<main>
  <canvas
    bind:this={canvas}
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseleave={() => dragging = false}
    class:dragging
  ></canvas>

  <header>
    <a class="wordmark" href="/">around</a>
    <span class="hint">drag to move · headphones recommended</span>
  </header>

  <div class="readout">
    <span>{Math.round(azimuth)}°</span>
    <span class="sep">·</span>
    <span>{Math.round(elevation)}°</span>
  </div>

  {#if trackTitle}
    <div class="now-playing">
      <div class="track-title">{trackTitle}</div>
      {#if trackArtist}
        <div class="track-artist">{trackArtist}</div>
      {/if}
    </div>
  {/if}

  <footer>
    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div
      class="seek-bar"
      onmousedown={onSeekMouseDown}
      onmousemove={onSeekMouseMove}
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

      <button class="pill-btn" onclick={() => showUrl = !showUrl}>
        URL
      </button>

      {#if loading}
        <span class="loading">loading</span>
      {/if}
    </div>

    {#if showUrl}
      <div class="url-row">
        <input
          class="url-input"
          type="url"
          placeholder="https://example.com/track.mp3"
          bind:value={urlInput}
          onkeydown={e => e.key === 'Enter' && handleUrl()}
        />
        <button class="url-go" onclick={handleUrl}>Go</button>
      </div>
    {/if}
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
  }

  main { position: fixed; inset: 0; }

  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }

  canvas.dragging { cursor: grabbing; }

  header {
    position: fixed;
    top: 28px;
    left: 0; right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;
    z-index: 10;
  }

  .wordmark {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 28px;
    font-weight: 300;
    letter-spacing: -0.02em;
    color: #e8e6e0;
    text-transform: lowercase;
    text-decoration: none;
    pointer-events: auto;
    transition: opacity 0.2s;
  }

  .wordmark:hover { opacity: 0.6; }

  .hint {
    font-size: 11px;
    font-weight: 300;
    letter-spacing: 0.1em;
    text-transform: lowercase;
    color: #6b6862;
  }

  .readout {
    position: fixed;
    top: 28px;
    right: 28px;
    display: flex;
    gap: 4px;
    font-size: 11px;
    letter-spacing: 0.06em;
    color: #3a3835;
    pointer-events: none;
    z-index: 10;
  }

  .sep { color: #2a2926; }

  /* Now-playing — centred in the viewport */
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
    font-size: 22px;
    font-weight: 300;
    color: #d4d2cc;
    letter-spacing: -0.01em;
  }

  .track-artist {
    font-size: 11px;
    font-weight: 300;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #6b6862;
    margin-top: 8px;
  }

  footer {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 20px 32px 32px;
    background: linear-gradient(to top, rgba(10,10,10,0.97) 55%, transparent);
    z-index: 10;
  }

  /* Seek bar */
  .seek-bar {
    position: relative;
    width: 100%;
    max-width: 520px;
    height: 20px;
    display: flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
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
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #e8e6e0;
    pointer-events: none;
  }

  .time-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 520px;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: #4a4843;
  }

  /* Demo chips */
  .demos {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 520px;
  }

  .demo-chip {
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
    transition: color 0.2s, border-color 0.2s;
    white-space: nowrap;
  }

  .demo-chip:hover    { color: #d4d2cc; border-color: #3a3935; }
  .demo-chip.active   { color: #e8e6e0; border-color: #3a3935; }
  .demo-chip:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Actions */
  .actions { display: flex; align-items: center; gap: 12px; }

  .play-btn {
    width: 44px; height: 44px;
    border-radius: 50%;
    border: 1px solid #2a2926;
    background: transparent;
    color: #e8e6e0;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s, background 0.2s;
  }

  .play-btn:hover    { border-color: #e8e6e0; background: rgba(255,255,255,0.03); }
  .play-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .pill-btn {
    background: transparent;
    border: 1px solid #2a2926;
    color: #6b6862;
    font-family: inherit;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 18px;
    border-radius: 999px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .pill-btn:hover { border-color: #e8e6e0; color: #e8e6e0; }

  /* URL row */
  .url-row { display: flex; gap: 8px; width: 100%; max-width: 520px; }

  .url-input {
    flex: 1;
    background: rgba(10,10,10,0.9);
    border: 1px solid #2a2926;
    border-radius: 8px;
    color: #e8e6e0;
    padding: 8px 12px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 300;
    outline: none;
    transition: border-color 0.2s;
  }

  .url-input:focus        { border-color: #6b6862; }
  .url-input::placeholder { color: #3a3835; }

  .url-go {
    background: transparent;
    border: 1px solid #2a2926;
    border-radius: 8px;
    color: #e8e6e0;
    padding: 8px 16px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .url-go:hover { border-color: #e8e6e0; }

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
