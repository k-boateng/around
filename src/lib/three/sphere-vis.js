import * as THREE from 'three';

const SPHERE_RADIUS = 11;
const SOURCE_RADIUS = 38; // source dot orbits outside the sphere

// Spherical → Cartesian
// azimuth 0° = front (+Z), 90° = right (+X), elevation 90° = top (+Y)
export function azElToVec3(azimuth, elevation, r = SOURCE_RADIUS) {
  const az = (azimuth  * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(el) * Math.sin(az),
    r * Math.sin(el),
    r * Math.cos(el) * Math.cos(az)
  );
}

export class SphereVis {
  constructor(scene, { sourceRadius = SOURCE_RADIUS } = {}) {
    this._scene        = scene;
    this._sourceRadius = sourceRadius;
    this._azimuth      = 0;
    this._elevation    = 0;
    this._amplitude    = 0;
    this._smoothAmp    = 0;

    // --- Solid sphere (the listener's space) ---
    const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 48);
    const sphereMat = new THREE.MeshStandardMaterial({
      color:       0x5a5854,
      roughness:   0.85,
      metalness:   0,
      transparent: true,
      opacity:     0.65,
    });
    this._sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.scene.add(this._sphere);

    // --- Faint guide ring (billboard, always faces camera) ---
    const ringInner = SPHERE_RADIUS * 1.18;
    const ringOuter = SPHERE_RADIUS * 1.19;
    const guideGeo  = new THREE.RingGeometry(ringInner, ringOuter, 128);
    const guideMat  = new THREE.MeshBasicMaterial({
      color:       0xe8e6e0,
      transparent: true,
      opacity:     0.12,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this._guideRing = new THREE.Mesh(guideGeo, guideMat);
    scene.scene.add(this._guideRing);

    // --- Source dot (small bright sphere at the audio source position) ---
    const dotGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xe8e6e0 });
    this._sourceDot = new THREE.Mesh(dotGeo, dotMat);
    scene.scene.add(this._sourceDot);

    // --- Source ring (thin faint ring around the dot, billboard) ---
    const srcRingGeo = new THREE.RingGeometry(1.3, 1.45, 32);
    const srcRingMat = new THREE.MeshBasicMaterial({
      color:       0xe8e6e0,
      transparent: true,
      opacity:     0.18,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    this._sourceRing = new THREE.Mesh(srcRingGeo, srcRingMat);
    scene.scene.add(this._sourceRing);

    this._updateSourcePosition();
  }

  setPosition(azimuth, elevation) {
    this._azimuth   = azimuth;
    this._elevation = elevation;
    this._updateSourcePosition();
  }

  setAmplitude(amp) {
    this._amplitude = amp;
  }

  update(delta, elapsed) {
    // Gentle idle pulse so the scene feels alive even before audio starts.
    const idle   = (Math.sin(elapsed * 0.8) * 0.5 + 0.5) * 0.15;
    const target = Math.max(this._amplitude, idle);
    this._smoothAmp += (target - this._smoothAmp) * 0.08;

    const amp = this._smoothAmp;

    // Source position and normalised direction from centre.
    const src    = azElToVec3(this._azimuth, this._elevation, this._sourceRadius);
    const srcDir = src.clone().normalize();

    // Move source dot + its ring.
    this._sourceDot.position.copy(src);
    this._sourceRing.position.copy(src);
    this._sourceRing.lookAt(this._scene.camera.position);

    // Guide ring: billboard + gentle scale with pulse.
    this._guideRing.lookAt(this._scene.camera.position);
    this._guideRing.scale.setScalar(1.0 + amp * 0.025);

    // Sphere: lean toward source, stretch along that axis, pulse with amplitude.
    const pulseScale    = 1.0 + amp * 0.08;
    const leanAmount    = amp * 0.6 + 0.2;
    const stretchFactor = 0.04 + amp * 0.06;

    // Orient sphere so its local X axis points toward the source, then stretch X.
    const xAxis = new THREE.Vector3(1, 0, 0);
    const quat  = new THREE.Quaternion().setFromUnitVectors(xAxis, srcDir);
    this._sphere.quaternion.copy(quat);
    this._sphere.position.copy(srcDir.clone().multiplyScalar(leanAmount));
    this._sphere.scale.set(
      pulseScale * (1 + stretchFactor),
      pulseScale * (1 - stretchFactor * 0.5),
      pulseScale * (1 - stretchFactor * 0.5)
    );
  }

  _updateSourcePosition() {
    const src = azElToVec3(this._azimuth, this._elevation, this._sourceRadius);
    this._sourceDot.position.copy(src);
    this._sourceRing.position.copy(src);
  }

  destroy() {
    for (const obj of [this._sphere, this._guideRing, this._sourceDot, this._sourceRing]) {
      obj.geometry.dispose();
      obj.material.dispose();
      this._scene.scene.remove(obj);
    }
  }
}
