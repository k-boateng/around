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

<div class="rings" aria-hidden="true">
  <div class="ring ring-1"></div>
  <div class="ring ring-2"></div>
  <div class="ring ring-3"></div>
</div>

<main class:visible>
  <div class="content">
    <div class="wordmark-block">
      <h1 class="wordmark">around</h1>
      <p class="byline">by Kwame Boateng</p>
    </div>

    <p class="tagline">spatial audio · headphones recommended</p>

    <button class="enter-btn" onclick={enter}>enter</button>

    <div class="about">
      <div class="divider"></div>
      <p>
        around renders sound in three dimensions using your ears' natural geometry.
        each ear receives a slightly different signal — delayed, filtered, reflected —
        and your brain resolves the difference into a position in space.
      </p>
      <p>
        built on the mit kemar dataset and a custom binaural dsp engine.
      </p>
      <a
        class="github-link"
        href="https://github.com/k-boateng/spatial-audio"
        target="_blank"
        rel="noopener noreferrer"
      >source on github →</a>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0a0a0a;
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 300;
    color: #e8e6e0;
    overflow-x: hidden;
  }

  /* Rings stay fixed regardless of scroll */
  .rings {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 0;
  }

  .ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(232, 230, 224, 0.04);
    animation: expand 7s ease-out infinite;
  }

  .ring-1 { width: 300px; height: 300px; animation-delay: 0s; }
  .ring-2 { width: 520px; height: 520px; animation-delay: 2.3s; }
  .ring-3 { width: 740px; height: 740px; animation-delay: 4.6s; }

  @keyframes expand {
    0%   { transform: scale(0.88); opacity: 0.5; }
    100% { transform: scale(1.12); opacity: 0;   }
  }

  /* Main scrolls; rings stay behind */
  main {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.8s ease;
    z-index: 1;
  }

  main.visible { opacity: 1; }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    text-align: center;
    padding: 80px 32px;
    max-width: 480px;
    width: 100%;
  }

  .wordmark-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .wordmark {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(3rem, 12vw, 5.5rem);
    font-weight: 300;
    letter-spacing: -0.02em;
    color: #e8e6e0;
    margin: 0;
    text-transform: lowercase;
  }

  .byline {
    font-size: 0.7rem;
    font-weight: 300;
    letter-spacing: 0.12em;
    color: #4a4843;
    text-transform: lowercase;
    margin: 0;
  }

  .tagline {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: #6b6862;
    text-transform: lowercase;
    margin: 0;
  }

  .enter-btn {
    margin-top: 12px;
    background: transparent;
    border: 1px solid #2a2926;
    color: #e8e6e0;
    padding: 14px 48px;
    border-radius: 999px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 400;
    letter-spacing: 0.12em;
    text-transform: lowercase;
    cursor: pointer;
    transition: border-color 0.3s ease, background 0.3s ease;
  }

  .enter-btn:hover {
    border-color: #e8e6e0;
    background: rgba(255, 255, 255, 0.03);
  }

  /* About section */
  .about {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    margin-top: 16px;
    width: 100%;
  }

  .divider {
    width: 40px;
    height: 1px;
    background: #1a1917;
  }

  .about p {
    font-size: 0.68rem;
    font-weight: 300;
    letter-spacing: 0.04em;
    color: #3a3835;
    margin: 0;
    line-height: 1.9;
    text-transform: lowercase;
  }

  .github-link {
    font-size: 0.62rem;
    font-weight: 300;
    letter-spacing: 0.1em;
    color: #2a2926;
    text-decoration: none;
    text-transform: lowercase;
    transition: color 0.2s;
    margin-top: 4px;
  }

  .github-link:hover { color: #6b6862; }
</style>
