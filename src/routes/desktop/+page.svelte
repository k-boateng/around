<script>
  import { onMount, onDestroy } from 'svelte';
  import { Scene }        from '$lib/three/scene.js';
  import { SphereVis }    from '$lib/three/sphere-vis.js';
  import { SpatialEngine } from '$lib/audio/engine.js';

  // Update these to match your actual filenames in static/audio/
  const DEMOS = [
    { label: 'Sound of footsteps, file: 'footsteps.mp3' },
    { label: 'Morgan Freeman's voice', file: 'freeman.mp3' },
    { label: 'Hallelujah by Jeff Buckley', file: 'hallelujah.mp3' },
    { label: 'Don't Worry by Bobby McFerrin', file: "don'tworry.mp3"}
  ];

  let canvas;
  let scene, vis, engine;

  let playing     = false;
  let loading     = false;
  let error       = '';
  let activeDemo  = null;
  let urlInput    = '';
  let showUrl     = false;
  let trackName   = '';
  let currentTime = 0;
  let duration    = 0;

  let azimuth   = 0;
  let elevation = 0;

  // Mouse drag state
  let dragging = false;
  let lastX = 0, lastY = 0;

  // Seek bar drag state
  let seekDragging = false;

  onMount(() => {
    scene  = new Scene(canvas);
    vis    = new SphereVis(scene);
    engine = new SpatialEngine();

    scene.onFrame((delta, elapsed) => {
      vis.setAmplitude(engine.getAmplitude());
      vis.update(delta, elapsed);
      // Sync player state from engine each frame
      playing     = engine.isPlaying;
      currentTime = engine.currentTime;
      duration    = engine.duration;
      trackName   = engine.trackName;
    });

    scene.start();
  });

  onDestroy(() => {
    scene?.destroy();
    vis?.destroy();
  });

  // -------------------------------------------------------------------------
  // Audio controls
  // -------------------------------------------------------------------------

  async function selectDemo(demo) {
    error = '';
    loading = true;
    activeDemo = demo.file;
    try {
      await engine.loadDemo(demo.file);
      await engine.play();
    } catch (e) {
      error = `Could not load "${demo.label}". Make sure ${demo.file} is in static/audio/.`;
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
    } catch (e) {
      error = 'Could not decode that file. Make sure it is a valid MP3 or WAV.';
    }
    loading = false;
  }

  async function handleUrl() {
    if (!urlInput.trim()) return;
    error = '';
    loading = true;
    activeDemo = null;
    try {
      await engine.loadUrl(urlInput.trim());
      await engine.play();
      showUrl  = false;
      urlInput = '';
    } catch (e) {
      error = 'Could not fetch that URL. The server must allow CORS.';
    }
    loading = false;
  }

  async function togglePlayPause() {
    if (engine.isPlaying) {
      engine.pause();
    } else {
      await engine.play();
    }
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

  function onSeekClick(e) {
    const bar = e.currentTarget;
    const pct = (e.clientX - bar.getBoundingClientRect().left) / bar.clientWidth;
    engine.seek(pct * duration);
  }

  function onSeekMouseDown(e) {
    seekDragging = true;
    onSeekClick(e);
  }

  function onSeekMouseMove(e) {
    if (!seekDragging) return;
    const bar = e.currentTarget;
    const pct = Math.max(0, Math.min(1, (e.clientX - bar.getBoundingClientRect().left) / bar.clientWidth));
    engine.seek(pct * duration);
  }

  function onSeekMouseUp() { seekDragging = false; }

  // -------------------------------------------------------------------------
  // Canvas mouse drag → azimuth / elevation
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

  function onMouseUp()    { dragging = false; }
  function onMouseLeave() { dragging = false; }
</script>

<svelte:window on:mouseup={onMouseUp} on:mouseup={onSeekMouseUp} />

<main>
  <canvas
    bind:this={canvas}
    on:mousedown={onMouseDown}
    on:mousemove={onMouseMove}
    on:mouseleave={onMouseLeave}
    class:dragging
  />

  <!-- Title -->
  <header>
    <span class="wordmark">around</span>
    <span class="hint">drag to move · headphones recommended</span>
  </header>

  <!-- Spatial readout -->
  <div class="readout">
    <span>az <strong>{Math.round(azimuth)}°</strong></span>
    <span>el <strong>{Math.round(elevation)}°</strong></span>
  </div>

  <!-- Controls panel -->
  <footer>
    {#if error}
      <p class="error">{error}</p>
    {/if}

    <!-- Track name -->
    {#if trackName}
      <p class="track-name">{trackName}</p>
    {/if}

    <!-- Seek bar -->
    <div
      class="seek-bar"
      on:mousedown={onSeekMouseDown}
      on:mousemove={onSeekMouseMove}
      on:mouseup={onSeekMouseUp}
      role="slider"
      aria-label="Seek"
      aria-valuemin="0"
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      tabindex="0"
    >
      <div class="seek-fill" style="width: {duration ? (currentTime / duration) * 100 : 0}%" />
      <div class="seek-thumb" style="left: {duration ? (currentTime / duration) * 100 : 0}%" />
    </div>

    <div class="time-row">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(duration)}</span>
    </div>

    <!-- Demo track selector -->
    <div class="demos">
      {#each DEMOS as demo}
        <button
          class="demo-btn"
          class:active={activeDemo === demo.file}
          on:click={() => selectDemo(demo)}
          disabled={loading}
        >
          {demo.label}
        </button>
      {/each}
    </div>

    <!-- Playback actions -->
    <div class="actions">
      <button class="play-btn" on:click={togglePlayPause} disabled={loading || !duration}>
        {playing ? '⏸' : '▶'}
      </button>

      <label class="pill-btn" title="Upload audio file">
        ↑ Upload
        <input type="file" accept="audio/*" on:change={handleFileUpload} hidden />
      </label>

      <button class="pill-btn" on:click={() => showUrl = !showUrl}>
        ⊕ URL
      </button>

      {#if loading}
        <span class="loading">loading…</span>
      {/if}
    </div>

    {#if showUrl}
      <div class="url-row">
        <input
          class="url-input"
          type="url"
          placeholder="https://example.com/track.mp3"
          bind:value={urlInput}
          on:keydown={e => e.key === 'Enter' && handleUrl()}
        />
        <button class="url-go" on:click={handleUrl}>Go</button>
      </div>
    {/if}
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #04060f;
    font-family: 'SF Pro Display', system-ui, sans-serif;
    color: #c8d8ff;
  }

  main {
    position: fixed;
    inset: 0;
  }

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

  /* Header */
  header {
    position: fixed;
    top: 28px;
    left: 36px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
    z-index: 10;
  }

  .wordmark {
    font-size: 1.5rem;
    font-weight: 300;
    letter-spacing: 0.18em;
    color: #dde8ff;
    text-transform: lowercase;
  }

  .hint {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: #4455aa;
    text-transform: lowercase;
  }

  /* Spatial readout */
  .readout {
    position: fixed;
    top: 28px;
    right: 36px;
    display: flex;
    gap: 18px;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: #445588;
    pointer-events: none;
    z-index: 10;
  }

  .readout strong { color: #8899cc; font-weight: 500; }

  /* Footer */
  footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 32px 28px;
    background: linear-gradient(to top, rgba(4,6,15,0.97) 60%, transparent);
    z-index: 10;
  }

  /* Track name */
  .track-name {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    color: #8899cc;
    text-transform: lowercase;
  }

  /* Seek bar */
  .seek-bar {
    position: relative;
    width: 100%;
    max-width: 520px;
    height: 3px;
    background: #0e1530;
    border-radius: 2px;
    cursor: pointer;
    user-select: none;
  }

  .seek-fill {
    position: absolute;
    top: 0; left: 0; bottom: 0;
    background: #3355aa;
    border-radius: 2px;
    pointer-events: none;
    transition: width 0.1s linear;
  }

  .seek-thumb {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #88aaff;
    pointer-events: none;
    transition: left 0.1s linear;
    box-shadow: 0 0 6px rgba(136,170,255,0.6);
  }

  .seek-bar:hover .seek-thumb { transform: translate(-50%, -50%) scale(1.3); }

  /* Time */
  .time-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    max-width: 520px;
    font-size: 0.65rem;
    letter-spacing: 0.06em;
    color: #334466;
  }

  /* Demo buttons */
  .demos {
    display: flex;
    gap: 8px;
  }

  .demo-btn {
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #4466aa;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .demo-btn:hover    { border-color: #3355aa; color: #88aaff; }
  .demo-btn.active   { border-color: #5577cc; color: #aabbff; background: rgba(80,100,200,0.1); }
  .demo-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Actions row */
  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .play-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid #3355aa;
    background: rgba(40,60,160,0.2);
    color: #aabbff;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-btn:hover    { background: rgba(60,90,200,0.35); border-color: #5577cc; }
  .play-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .pill-btn {
    background: transparent;
    border: 1px solid #1e2d5a;
    color: #4466aa;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.75rem;
    letter-spacing: 0.07em;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }

  .pill-btn:hover { border-color: #3355aa; color: #88aaff; }

  /* URL input */
  .url-row {
    display: flex;
    gap: 8px;
    width: 100%;
    max-width: 520px;
  }

  .url-input {
    flex: 1;
    background: rgba(10,15,40,0.8);
    border: 1px solid #1e2d5a;
    border-radius: 8px;
    color: #c8d8ff;
    padding: 7px 12px;
    font-size: 0.78rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .url-input:focus       { border-color: #4466aa; }
  .url-input::placeholder { color: #2a3a6a; }

  .url-go {
    background: rgba(40,60,160,0.3);
    border: 1px solid #3355aa;
    border-radius: 8px;
    color: #aabbff;
    padding: 7px 16px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .url-go:hover { background: rgba(60,90,200,0.45); }

  .loading {
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    color: #4455aa;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .error {
    font-size: 0.72rem;
    color: #aa4455;
    letter-spacing: 0.05em;
    margin: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 1; }
  }
</style>
