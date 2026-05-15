import * as THREE from 'three';

export class Scene {
  constructor(canvas) {
    // Renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060f); // deep navy-black
    this.scene.fog = new THREE.FogExp2(0x04060f, 0.08);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 4.5);

    // Lighting
    // Dim ambient so the scene reads as dark space.
    const ambient = new THREE.AmbientLight(0x0a0f2a, 1.5);
    this.scene.add(ambient);

    // Warm fill from above — gives the sphere subtle depth.
    const fill = new THREE.DirectionalLight(0x3344aa, 0.4);
    fill.position.set(0, 5, 3);
    this.scene.add(fill);

    // Orb point light — attached to the audio source orb position.
    // Intensity driven by audio amplitude in sphere-vis.js.
    this.orbLight = new THREE.PointLight(0x88aaff, 2, 8, 2);
    this.scene.add(this.orbLight);

    // Animation loop
    this._callbacks = [];
    this._rafId     = null;
    this._clock     = new THREE.Clock();

    // Resize observer keeps renderer and camera in sync with the canvas.
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(canvas);
    this._canvas = canvas;
  }

  // Register a per-frame callback: fn(delta, elapsed)
  onFrame(fn) {
    this._callbacks.push(fn);
  }

  start() {
    if (this._rafId !== null) return;
    const loop = () => {
      this._rafId = requestAnimationFrame(loop);
      const delta   = this._clock.getDelta();
      const elapsed = this._clock.getElapsedTime();
      for (const fn of this._callbacks) fn(delta, elapsed);
      this._renderer.render(this.scene, this.camera);
    };
    this._clock.start();
    loop();
  }

  stop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._clock.stop();
  }

  destroy() {
    this.stop();
    this._resizeObserver.disconnect();
    this._renderer.dispose();
  }

  _onResize() {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    this._renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
