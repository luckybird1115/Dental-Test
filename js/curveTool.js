// Curve Tool
// Lets the user draw a surface-hugging curve on the visible jaw model.
//
// How it works:
//  1. Raycasting  - each click is cast against the visible teeth meshes to find
//     the exact surface point + face normal under the cursor (an "anchor").
//  2. Spline      - a Catmull-Rom spline is fitted through the anchors and
//     sampled densely; every sample is then "snapped" back onto the mesh
//     surface (nearest-point-on-mesh via a short normal-aligned raycast) so the
//     curve follows the tooth edge instead of cutting through it.
//  3. Closure     - when a new click lands within a tolerance of the first
//     anchor the curve is closed into a loop and the enclosed surface is
//     selected (faces whose centroid projects inside the loop polygon).
//
// Click vs. orbit: a pointerdown/up pair that moved less than a few pixels is
// treated as a click; anything more is an OrbitControls drag and ignored here.

class CurveTool {
  constructor(sceneManager, stageManager) {
    this.sceneManager = sceneManager;
    this.stageManager = stageManager;

    this.scene = sceneManager.getScene();
    this.camera = sceneManager.getCamera();
    this.dom = sceneManager.getRenderer().domElement;

    this.active = false;
    this.closed = false;

    this.anchors = [];        // [{ position: Vector3, normal: Vector3 }]
    this.markers = [];        // anchor sphere meshes
    this.snappedPoints = [];  // Vector3[] - last sampled + surface-snapped curve
    this.line = null;
    this.selectionMesh = null;

    this.raycaster = new THREE.Raycaster();
    this._ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Scale-dependent constants, filled in by ensureScale() on first use.
    this.unit = 0;
    this.markerRadius = 1;
    this.surfaceOffset = 0.1;
    this.snapProbe = 5;
    this.closeThreshold = 3;

    this.group = new THREE.Group();
    this.group.name = 'CurveToolGroup';
    this.scene.add(this.group);

    // Optional callback: (faceCount) => void
    this.onSelection = null;

    this._bindEvents();
  }

  // ---------------------------------------------------------------- activation
  setActive(on) {
    this.active = !!on;
    this.dom.style.cursor = this.active ? 'crosshair' : '';

    const hint = document.getElementById('ncCurveHint');
    if (hint) hint.hidden = !this.active;

    // Starting to draw again after a finished loop begins a fresh curve.
    if (this.active && this.closed) this.reset();
  }

  isActive() {
    return this.active;
  }

  // ------------------------------------------------------------------- events
  _bindEvents() {
    this._onDown = (e) => {
      if (!this.active || e.button !== 0) return;
      this._downPos = { x: e.clientX, y: e.clientY };
    };

    this._onUp = (e) => {
      if (!this.active || e.button !== 0 || !this._downPos) return;
      const moved = Math.hypot(e.clientX - this._downPos.x, e.clientY - this._downPos.y);
      this._downPos = null;
      if (moved > 6) return; // OrbitControls drag, not a click
      this._handleClick(e);
    };

    this._onKey = (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') {
        this.reset();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.undoLast();
      }
    };

    this.dom.addEventListener('pointerdown', this._onDown);
    this.dom.addEventListener('pointerup', this._onUp);
    window.addEventListener('keydown', this._onKey);
  }

  // ------------------------------------------------------------- mesh helpers
  // All meshes belonging to currently visible jaw models.
  getTargetMeshes() {
    const meshes = [];
    const collect = (models) => {
      (models || []).forEach((model) => {
        if (!model || !model.visible) return;
        model.traverse((child) => {
          if (child.isMesh && child.visible) meshes.push(child);
        });
      });
    };
    collect(AppConfig.maxillaryModels());
    collect(AppConfig.mandibularModels());
    return meshes;
  }

  // Derive working scale from the model bounding box (done once).
  ensureScale() {
    if (this.unit) return;
    const meshes = this.getTargetMeshes();
    if (meshes.length) {
      const box = new THREE.Box3();
      meshes.forEach((m) => box.expandByObject(m));
      const size = new THREE.Vector3();
      box.getSize(size);
      this.unit = Math.max(size.x, size.y, size.z) || 40;
    } else {
      this.unit = 40;
    }
    this.markerRadius = this.unit * 0.006;
    this.surfaceOffset = this.unit * 0.004;
    this.snapProbe = this.unit * 0.12;
    this.closeThreshold = this.unit * 0.06;
  }

  // -------------------------------------------------------------- click -> point
  _handleClick(e) {
    this.ensureScale();

    const meshes = this.getTargetMeshes();
    if (!meshes.length) return;

    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;

    const hit = hits[0];
    const normal = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);

    this.placePoint(hit.point.clone(), normal);
  }

  placePoint(position, normal) {
    if (this.closed) return;

    // Close the loop if we're near the first anchor.
    if (this.anchors.length >= 3 &&
        position.distanceTo(this.anchors[0].position) < this.closeThreshold) {
      this.closed = true;
      this.refresh();
      this.computeSelection();
      return;
    }

    this.anchors.push({ position, normal });
    this._addMarker(position, normal);
    this.refresh();
  }

  _addMarker(position, normal) {
    const geo = new THREE.SphereGeometry(this.markerRadius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8b98a, depthTest: false });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.copy(position).addScaledVector(normal, this.surfaceOffset);
    sphere.renderOrder = 1000;
    this.group.add(sphere);
    this.markers.push(sphere);
  }

  // ---------------------------------------------------------- surface snapping
  // Nearest surface point around `point`, probing along the local normal.
  snapToSurface(point, normal, meshes) {
    if (!meshes.length) return point.clone();

    this._ray.set(point.clone().addScaledVector(normal, this.snapProbe), normal.clone().negate());
    this._ray.far = this.snapProbe * 2.2;
    let hits = this._ray.intersectObjects(meshes, false);
    if (hits.length) return hits[0].point.clone().addScaledVector(normal, this.surfaceOffset);

    // Sample may sit just under the surface - probe the other way too.
    this._ray.set(point.clone().addScaledVector(normal, -this.snapProbe), normal.clone());
    this._ray.far = this.snapProbe * 2.2;
    hits = this._ray.intersectObjects(meshes, false);
    if (hits.length) return hits[0].point.clone().addScaledVector(normal, this.surfaceOffset);

    return point.clone();
  }

  nearestNormal(point) {
    let best = null;
    let bestD = Infinity;
    for (const a of this.anchors) {
      const d = a.position.distanceToSquared(point);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best ? best.normal.clone() : new THREE.Vector3(0, 1, 0);
  }

  // ------------------------------------------------------------- curve rebuild
  refresh() {
    this._clearLine();
    if (this.anchors.length < 2) { this.snappedPoints = []; return; }

    const pts = this.anchors.map((a) => a.position.clone());
    const curve = new THREE.CatmullRomCurve3(pts, this.closed, 'catmullrom', 0.5);
    const divisions = Math.max(64, pts.length * 24);

    const meshes = this.getTargetMeshes();
    const snapped = curve.getPoints(divisions)
      .map((p) => this.snapToSurface(p, this.nearestNormal(p), meshes));
    this.snappedPoints = snapped;

    const geo = new THREE.BufferGeometry().setFromPoints(snapped);
    const mat = new THREE.LineDashedMaterial({
      color: 0x2196f3,
      dashSize: this.unit * 0.02,
      gapSize: this.unit * 0.014,
      transparent: true,
      depthTest: false
    });
    this.line = this.closed ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
    this.line.computeLineDistances();
    this.line.renderOrder = 999;
    this.group.add(this.line);
  }

  // -------------------------------------------------- enclosed-face selection
  computeSelection() {
    const curvePts = this.snappedPoints;
    if (!curvePts || curvePts.length < 3) return;

    // Best-fit plane: curve centroid + averaged anchor normal.
    const centroid = new THREE.Vector3();
    curvePts.forEach((p) => centroid.add(p));
    centroid.multiplyScalar(1 / curvePts.length);

    const planeN = new THREE.Vector3();
    this.anchors.forEach((a) => planeN.add(a.normal));
    if (planeN.lengthSq() < 1e-6) planeN.set(0, 1, 0);
    planeN.normalize();

    // Orthonormal basis (u, v) spanning that plane.
    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(planeN.dot(u)) > 0.9) u.set(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(planeN, u).normalize();
    u = new THREE.Vector3().crossVectors(v, planeN).normalize();

    const to2D = (p) => {
      const d = new THREE.Vector3().subVectors(p, centroid);
      return { x: d.dot(u), y: d.dot(v), z: d.dot(planeN) };
    };

    const poly = curvePts.map(to2D);
    const band = this.snapProbe * 4; // only keep faces near the curve's plane

    const meshes = this.getTargetMeshes();
    const selectedVerts = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centre = new THREE.Vector3();

    meshes.forEach((mesh) => {
      const g = mesh.geometry;
      const pos = g.attributes.position;
      if (!pos) return;
      const index = g.index;
      const triCount = index ? index.count : pos.count;

      for (let i = 0; i < triCount; i += 3) {
        const ia = index ? index.getX(i) : i;
        const ib = index ? index.getX(i + 1) : i + 1;
        const ic = index ? index.getX(i + 2) : i + 2;

        a.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
        centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);

        const p2 = to2D(centre);
        if (Math.abs(p2.z) > band) continue;
        if (!this._pointInPolygon(p2, poly)) continue;

        selectedVerts.push(a.clone(), b.clone(), c.clone());
      }
    });

    this._showSelection(selectedVerts);

    const faceCount = selectedVerts.length / 3;
    const el = document.getElementById('ncPaintedFaces');
    if (el) el.textContent = String(faceCount);
    if (typeof this.onSelection === 'function') this.onSelection(faceCount);
    console.log(`CurveTool: closed loop selected ${faceCount} faces`);
  }

  _pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const hit = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  _showSelection(verts) {
    if (this.selectionMesh) {
      this.group.remove(this.selectionMesh);
      this.selectionMesh.geometry.dispose();
      this.selectionMesh.material.dispose();
      this.selectionMesh = null;
    }
    if (!verts.length) return;

    const arr = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      arr[i * 3] = verts[i].x;
      arr[i * 3 + 1] = verts[i].y;
      arr[i * 3 + 2] = verts[i].z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();

    const m = new THREE.MeshBasicMaterial({
      color: 0x2fbfae,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    this.selectionMesh = new THREE.Mesh(g, m);
    this.selectionMesh.renderOrder = 998;
    this.group.add(this.selectionMesh);
  }

  // ------------------------------------------------------------------ editing
  undoLast() {
    if (this.closed) {
      this.closed = false;
      if (this.selectionMesh) {
        this.group.remove(this.selectionMesh);
        this.selectionMesh.geometry.dispose();
        this.selectionMesh.material.dispose();
        this.selectionMesh = null;
      }
      const el = document.getElementById('ncPaintedFaces');
      if (el) el.textContent = '0';
    } else {
      const marker = this.markers.pop();
      if (marker) {
        this.group.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
      }
      this.anchors.pop();
    }
    this.refresh();
  }

  reset() {
    this._clearLine();
    this.markers.forEach((m) => {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this.markers = [];
    if (this.selectionMesh) {
      this.group.remove(this.selectionMesh);
      this.selectionMesh.geometry.dispose();
      this.selectionMesh.material.dispose();
      this.selectionMesh = null;
    }
    this.anchors = [];
    this.snappedPoints = [];
    this.closed = false;

    const el = document.getElementById('ncPaintedFaces');
    if (el) el.textContent = '0';
  }

  _clearLine() {
    if (!this.line) return;
    this.group.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.line = null;
  }
}

// Export for use in other modules
window.CurveTool = CurveTool;
