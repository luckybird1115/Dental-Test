// Mini View
// A small independent 3D preview of the working scene, drawn into the
// "COMBINED" card of the right-hand panel. It SHARES the main scene - so the
// jaw model and the curve-tool selection overlay show up automatically - but
// renders it with its own WebGL canvas and a fixed camera angle.
//
// Layer convention: edit helpers (curve anchors / line / preview points) live
// on layer 1 and are excluded here; the model and the selection mesh stay on
// layer 0 and are shown.

class MiniView {
  constructor(scene, mountEl, mainCamera) {
    this.scene = scene;
    this.mount = mountEl;
    this.mainCamera = mainCamera || null;

    const w = mountEl.clientWidth || 140;
    const h = mountEl.clientHeight || 120;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.setClearColor(0x1e1e1e, 1);
    mountEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, w / h, 1, 5000);
    this.camera.layers.set(0); // model + selection only, no edit helpers

    // Fallback viewing direction until the main camera drives orientation.
    this._dir = new THREE.Vector3(0.42, 0.56, 0.70).normalize();
    this._center = new THREE.Vector3();
    this._fitDist = 300;
    this._framed = false;

    this._back = new THREE.Vector3();

    this._loop = this._loop.bind(this);
    this._loop();

    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = this.mount.clientWidth;
    const h = this.mount.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Fit the camera to the currently visible jaw meshes. Returns false until
  // there is something to frame.
  frame() {
    const meshes = [];
    const collect = (models) => (models || []).forEach((m) => {
      if (m && m.visible) m.traverse((c) => { if (c.isMesh && c.visible) meshes.push(c); });
    });
    collect(AppConfig.maxillaryModels());
    collect(AppConfig.mandibularModels());
    if (!meshes.length) return false;

    const box = new THREE.Box3();
    meshes.forEach((m) => box.expandByObject(m));
    if (box.isEmpty()) return false;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z) || 100;
    const dist = (maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360))) * 1.5;

    this._center.copy(center);
    this._fitDist = dist;
    this.camera.near = Math.max(dist / 100, 0.1);
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();

    this._framed = true;
    this._syncToMainCamera();
    return true;
  }

  // Match the main camera's orientation, kept at a fixed fit distance so the
  // preview rotates with the main view but ignores its zoom/pan.
  _syncToMainCamera() {
    if (this.mainCamera) {
      this.camera.quaternion.copy(this.mainCamera.quaternion);
      this._back.set(0, 0, 1).applyQuaternion(this.camera.quaternion);
      this.camera.position.copy(this._center).addScaledVector(this._back, this._fitDist);
    } else {
      this.camera.position.copy(this._center).addScaledVector(this._dir, this._fitDist);
      this.camera.lookAt(this._center);
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    if (!this._framed && !this.frame()) return;

    this._syncToMainCamera();

    // Render without the main scene background so the card keeps its own colour.
    const prevBg = this.scene.background;
    this.scene.background = null;
    this.renderer.render(this.scene, this.camera);
    this.scene.background = prevBg;
  }
}

// Export for use in other modules
window.MiniView = MiniView;
