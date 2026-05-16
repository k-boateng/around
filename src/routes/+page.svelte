<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let visible = $state(false);

  onMount(() => {
    setTimeout(() => (visible = true), 120);
  });

  function isMobile() {
    return (
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  function enter() {
    goto(isMobile() ? '/mobile' : '/desktop');
  }
</script>

<main class:visible>
  <div class="rings" aria-hidden="true">
    <div class="ring ring-1"></div>
    <div class="ring ring-2"></div>
    <div class="ring ring-3"></div>
  </div>

  <div class="content">
    <h1 class="wordmark">around</h1>
    <p class="sub">spatial audio · headphones recommended</p>

    <button class="enter-btn" onclick={enter}>
      enter
    </button>

    <p class="footnote">
      move the sound around you ·
      powered by HRTF binaural rendering
    </p>
  </div>
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
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.8s ease;
  }

  main.visible { opacity: 1; }

  .rings {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(80, 120, 255, 0.08);
    animation: expand 6s ease-out infinite;
  }

  .ring-1 { width: 300px; height: 300px; animation-delay: 0s; }
  .ring-2 { width: 500px; height: 500px; animation-delay: 2s; }
  .ring-3 { width: 700px; height: 700px; animation-delay: 4s; }

  @keyframes expand {
    0%   { transform: scale(0.85); opacity: 0.6; }
    100% { transform: scale(1.15); opacity: 0;   }
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    z-index: 10;
    text-align: center;
    padding: 0 24px;
  }

  .wordmark {
    font-size: clamp(3rem, 12vw, 6rem);
    font-weight: 200;
    letter-spacing: 0.3em;
    color: #dde8ff;
    margin: 0;
    text-transform: lowercase;
  }

  .sub {
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    color: #2a3a6a;
    text-transform: lowercase;
    margin: 0;
  }

  .enter-btn {
    margin-top: 24px;
    background: transparent;
    border: 1px solid #2a3a7a;
    color: #6688cc;
    padding: 12px 48px;
    border-radius: 32px;
    font-size: 0.8rem;
    letter-spacing: 0.22em;
    text-transform: lowercase;
    cursor: pointer;
    transition: border-color 0.3s, color 0.3s, box-shadow 0.3s;
  }

  .enter-btn:hover {
    border-color: #5577cc;
    color: #aabbff;
    box-shadow: 0 0 24px rgba(80, 120, 255, 0.15);
  }

  .footnote {
    margin-top: 8px;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: #1a2440;
    text-transform: lowercase;
  }
</style>
