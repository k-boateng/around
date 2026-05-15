import * as THREE from 'three';

const SPHERE_RADIUS = 2;
const ORB_RADIUS    = 0.07;
const TRAIL_LENGTH  = 50;
const PULSE_POOL    = 8;

// Spherical → Cartesian  (azimuth 0° = front/+Z, 90° = right/+X, elevation 90° = top/+Y)
export function azElToVec3(azimuth, elevation, r = SPHERE_RADIUS) {
  const az = (azimuth  * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    r * Math.cos(el) * Math.cos(az)
  );
}

export class SphereVis {
  constructor(scene) {
    this._scene    = scene;   // Scene instance from scene.js
    this._azimuth  = 0;
    this._elevation = 0;
    this._amplitude = 0;
    this._smoothAmp = 0;

    // --- Wireframe sphere ---
    const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 36, 18);
    const wireGeo   = new THREE.WireframeGeometry(sphereGeo);
    const wireMat   = new THREE.LineBasicMaterial({
      color:       0x1a3a7a,
      transparent: true,
      opacity:     0.28,
      depthWrite:  false,
    });
    this._wire = new THREE.LineSegments(wireGeo, wireMat);
    scene.scene.add(this._wire);
    sphereGeo.dispose(); // wireGeo owns the data now

    // --- Orb ---
    const orbGeo = new THREE.SphereGeometry(ORB_RADIUS, 20, 20);
    const orbMat = new THREE.MeshStandardMaterial({
      color:             0xffffff,
      emissive:          new THREE.Color(0x6699ff),
      emissiveIntensity: 3,
      roughness:         0.05,
      metalness:         0,
    });
    this._orb = new THREE.Mesh(orbGeo, orbMat);
    scene.scene.add(this._orb);

    // Halo ring around the orb (always faces camera via billboard logic in update)
    const haloGeo = new THREE.RingGeometry(ORB_RADIUS * 1.8, ORB_RADIUS * 2.6, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color:       0x88aaff,
      transparent: true,
      opacity:     0.35,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this._halo = new THREE.Mesh(haloGeo, haloMat);
    this._orb.add(this._halo); // child of orb so it moves with it

    // --- Motion trail ---
    this._trailPos  = new Float32Array(TRAIL_LENGTH * 3);
    const trailGeo  = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this._trailPos, 3));
    trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.LineBasicMaterial({
      color:       0x4466cc,
      transparent: true,
      opacity:     0.45,
      depthWrite:  false,
    });
    this._trail        = new THREE.Line(trailGeo, trailMat);
    this._trailHistory = []; // THREE.Vector3[]
    scene.scene.add(this._trail);

    //Pulse ring pool
    // Rings expand outward from the orb on amplitude peaks.
    this._pulsePool = Array.from({ length: PULSE_POOL }, () => {
      const geo  = new THREE.TorusGeometry(0.1, 0.006, 6, 56);
      const mat  = new THREE.MeshBasicMaterial({
        color:       0x88aaff,
        transparent: true,
        opacity:     0,
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.scene.add(mesh);
      return { mesh, active: false, scale: 1, opacity: 0 };
    });
    this._lastPulseTime = 0;

    this._updateOrbPosition();
  }

  // Called by the Svelte page when gyroscope / mouse changes the source position.
  setPosition(azimuth, elevation) {
    this._azimuth   = azimuth;
    this._elevation = elevation;
    this._updateOrbPosition();
  }

  // Called each frame with a 0–1 amplitude value from the AnalyserNode.
  setAmplitude(amp) {
    this._amplitude = amp;
  }

  // Register this as a scene.onFrame() callback.
  update(delta, elapsed) {
    // Smooth amplitude with a 1-pole filter.
    this._smoothAmp += (this._amplitude - this._smoothAmp) * 0.18;

    // Pulse the orb emissive and point light with audio amplitude.
    this._orb.material.emissiveIntensity = 3 + this._smoothAmp * 5;
    this._scene.orbLight.intensity       = 2 + this._smoothAmp * 8;

    // Billboard the halo to always face the camera.
    this._halo.quaternion.copy(this._scene.camera.quaternion);

    // Slowly drift the wireframe sphere for a living feel.
    this._wire.rotation.y += delta * 0.035;
    this._wire.rotation.x += delta * 0.008;

    // Update motion trail.
    const p = this._orb.position;
    if (
      this._trailHistory.length === 0 ||
      this._trailHistory[this._trailHistory.length - 1].distanceTo(p) > 0.01
    ) {
      this._trailHistory.push(p.clone());
      if (this._trailHistory.length > TRAIL_LENGTH) this._trailHistory.shift();
    }
    for (let i = 0; i < this._trailHistory.length; i++) {
      const h = this._trailHistory[i];
      this._trailPos[i * 3]     = h.x;
      this._trailPos[i * 3 + 1] = h.y;
      this._trailPos[i * 3 + 2] = h.z;
    }
    this._trail.geometry.setDrawRange(0, this._trailHistory.length);
    this._trail.geometry.attributes.position.needsUpdate = true;

    // Spawn a pulse ring on amplitude peaks, rate-limited to avoid spam.
    if (this._smoothAmp > 0.25 && elapsed - this._lastPulseTime > 0.15) {
      this._spawnPulse(p);
      this._lastPulseTime = elapsed;
    }

    // Animate active pulses: expand + fade.
    for (const slot of this._pulsePool) {
      if (!slot.active) continue;
      slot.scale   += delta * 3;
      slot.opacity -= delta * 2;
      slot.mesh.scale.setScalar(slot.scale);
      slot.mesh.material.opacity = Math.max(0, slot.opacity);
      if (slot.opacity <= 0) {
        slot.active      = false;
        slot.mesh.visible = false;
      }
    }
  }

  _updateOrbPosition() {
    const v = azElToVec3(this._azimuth, this._elevation);
    this._orb.position.copy(v);
    this._scene.orbLight.position.copy(v);
  }

  _spawnPulse(position) {
    const slot = this._pulsePool.find(p => !p.active);
    if (!slot) return;

    slot.active  = true;
    slot.scale   = 1;
    slot.opacity = 0.65;

    slot.mesh.position.copy(position);
    // Orient ring to face outward from sphere centre.
    slot.mesh.lookAt(0, 0, 0);
    slot.mesh.rotateX(Math.PI / 2);
    slot.mesh.scale.setScalar(1);
    slot.mesh.material.opacity = 0.65;
    slot.mesh.visible = true;
  }

  destroy() {
    [this._wire, this._orb, this._trail].forEach(obj => {
      obj.geometry.dispose();
      obj.material.dispose();
    });
    this._halo.geometry.dispose();
    this._halo.material.dispose();
    for (const { mesh } of this._pulsePool) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
