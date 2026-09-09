// Curve Tool  (Gum Arch)
// Draws an editable, surface-hugging curve on the visible jaw model and shows
// a live parameter panel (#ncArchPanel).
//
// Pipeline
//   1. Raycasting     - every click is cast against the visible teeth meshes to
//      find the exact surface point + face normal ("control point" / anchor).
//   2. Spline         - anchors are fitted with a Catmull-Rom spline, sampled at
//      a fixed real-world "point spacing", and each sample is snapped back onto
//      the mesh surface (nearest-point-on-mesh via a short normal-aligned ray).
//   3. Smoothing      - the snapped polyline is relaxed with N Laplacian passes
//      (the "Smoothing" slider) and re-projected onto the surface.
//   4. Closure        - clicking within tolerance of the first anchor (or the
//      "shape" toggle) closes the loop and selects the enclosed faces.
//
// Editing (matches the panel hint)
//   * Click empty surface      -> add a control point
//   * Click near first point   -> close the loop
//   * Drag a point             -> move it (re-snapped live)
//   * Alt-click a segment      -> insert a point there
//   * Ctrl/Cmd-click a point   -> delete it
//   * Backspace / Esc          -> undo last point / clear all

class CurveTool {
  constructor(sceneManager, stageManager) {
    this.sceneManager = sceneManager;
    this.stageManager = stageManager;

    this.scene = sceneManager.getScene();
    this.camera = sceneManager.getCamera();
    this.dom = sceneManager.getRenderer().domElement;
    this.controls = sceneManager.getControls();

    // Edit helpers (markers / line / preview points) go on layer 1 so the
    // COMBINED mini view can exclude them. The main camera must opt in to see
    // layer 1 as well.
    this.camera.layers.enable(1);

    this.active = false;
    this.closed = false;

    this.anchors = [];        // [{ position: Vector3, normal: Vector3 }]
    this.markers = [];        // anchor sphere meshes, parallel to anchors
    this.snappedPoints = [];  // Vector3[] - last sampled + snapped + smoothed curve
    this.line = null;
    this.previewPoints = null;
    this.selectionMesh = null;

    // Panel parameters
    this.smoothing = 3;        // Laplacian relaxation passes
    this.spacingMm = 0.25;     // distance between sampled points, millimetres
    this.showPreview = true;

    // Real-world scale. Models are authored ~mm then scaled by modelScale, so
    // 1 mm of real geometry == modelScale world units. Tune here if needed.
    this.mmPerUnit = 1 / (AppConfig.modelScale || 1);

    this.raycaster = new THREE.Raycaster();
    this._ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Scale-dependent constants, filled by ensureScale() on first use.
    this.unit = 0;
    this.markerRadius = 1;
    this.surfaceOffset = 0.1;
    this.snapProbe = 5;
    this.closeThreshold = 3;

    this.group = new THREE.Group();
    this.group.name = 'CurveToolGroup';
    this.scene.add(this.group);

    this._drag = null;        // { idx } while dragging an anchor
    this._downPos = null;     // pointer-down screen pos for click detection
    this._downMoved = false;

    // Optional callback: (faceCount) => void
    this.onSelection = null;

    this._bindEvents();
    this._bindPanel();
  }

  // ---------------------------------------------------------------- activation
  setActive(on) {
    this.active = !!on;
    this.dom.style.cursor = this.active ? 'crosshair' : '';

    const panel = document.getElementById('ncArchPanel');
    if (panel) panel.hidden = !this.active;

    // Starting to draw again after a finished loop begins a fresh curve.
    if (this.active && this.closed) this.reset();
    else if (this.active) this._updatePanel();
  }

  isActive() {
    return this.active;
  }

  // ------------------------------------------------------------ pointer events
  _bindEvents() {
    this._onDown = (e) => {
      if (!this.active || e.button !== 0) return;

      const idx = this._pickAnchor(e);
      if (idx >= 0) {
        if (e.ctrlKey || e.metaKey) {   // delete
          e.preventDefault();
          this._deleteAnchor(idx);
          return;
        }
        // begin drag (or, if it turns out to be a tap, a close/select gesture)
        e.preventDefault();
        this._drag = { idx, downX: e.clientX, downY: e.clientY, moved: false };
        if (this.controls) this.controls.enabled = false;
        return;
      }

      if (e.altKey) {                   // insert on a segment
        const seg = this._pickSegment(e);
        if (seg) {
          e.preventDefault();
          this._insertAnchor(seg.index, seg.point, seg.normal);
          return;
        }
      }

      this._downPos = { x: e.clientX, y: e.clientY };
      this._downMoved = false;
    };

    this._onMove = (e) => {
      if (!this.active) return;

      if (this._drag) {
        if (!this._drag.moved) {
          const d = Math.hypot(e.clientX - this._drag.downX, e.clientY - this._drag.downY);
          if (d > 3) this._drag.moved = true;
        }
        if (!this._drag.moved) return;
        const hit = this._raycastSurface(e);
        if (hit) {
          this.anchors[this._drag.idx] = { position: hit.point, normal: hit.normal };
          this._moveMarker(this._drag.idx);
          this.refresh();
        }
        return;
      }

      if (this._downPos) {
        const moved = Math.hypot(e.clientX - this._downPos.x, e.clientY - this._downPos.y);
        if (moved > 4) this._downMoved = true;
      }
    };

    this._onUp = (e) => {
      if (!this.active || e.button !== 0) return;

      if (this._drag) {
        const { idx, moved } = this._drag;
        this._drag = null;
        if (this.controls) this.controls.enabled = true;

        if (!moved) {
          // A tap on the first point closes an open curve of 3+ points.
          if (idx === 0 && !this.closed && this.anchors.length >= 3) {
            this.closed = true;
            this._syncShape();
            this.refresh();
            this.computeSelection();
          }
          return;
        }

        if (this.closed) this.computeSelection();
        this._updatePanel();
        return;
      }

      if (!this._downPos) return;
      const moved = this._downMoved;
      this._downPos = null;
      if (moved) return;               // was an OrbitControls drag
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
    this.dom.addEventListener('pointermove', this._onMove);
    this.dom.addEventListener('pointerup', this._onUp);
    window.addEventListener('keydown', this._onKey);
  }

  // -------------------------------------------------------------- panel wiring
  _bindPanel() {
    const close = document.getElementById('ncArchClose');
    const shape = document.getElementById('ncArchShape');
    const smoothing = document.getElementById('ncArchSmoothing');
    const smoothingVal = document.getElementById('ncArchSmoothingVal');
    const preview = document.getElementById('ncArchPreview');
    const spacing = document.getElementById('ncArchSpacing');
    const spacingVal = document.getElementById('ncArchSpacingVal');

    close?.addEventListener('click', () => {
      this.setActive(false);
      // Return the toolbar to the Select tool.
      const selectBtn = document.querySelector('#ncLeftToolbar .nc-tool-btn[data-tool="select"]');
      if (selectBtn) {
        document.querySelectorAll('#ncLeftToolbar .nc-tool-btn')
          .forEach((b) => b.classList.remove('active'));
        selectBtn.classList.add('active');
      }
    });

    shape?.addEventListener('click', () => {
      if (this.anchors.length < 3) return;
      this.closed = !this.closed;
      this._syncShape();
      this.refresh();
      if (this.closed) this.computeSelection();
      else this._clearSelection();
      this._updatePanel();
    });

    smoothing?.addEventListener('input', (e) => {
      this.smoothing = parseFloat(e.target.value);
      if (smoothingVal) smoothingVal.textContent = this.smoothing.toFixed(2);
      this.refresh();
      if (this.closed) this.computeSelection();
    });

    preview?.addEventListener('change', (e) => {
      this.showPreview = e.target.checked;
      this.refresh();
    });

    spacing?.addEventListener('input', (e) => {
      this.spacingMm = parseFloat(e.target.value);
      if (spacingVal) spacingVal.textContent = this.spacingMm.toFixed(2) + ' mm';
      this.refresh();
      if (this.closed) this.computeSelection();
    });

    const shellBtn = document.getElementById('ncGenerateShell');
    shellBtn?.addEventListener('click', () => {
      if (shellBtn.disabled) return;
      const faces = this.selectionMesh
        ? this.selectionMesh.geometry.attributes.position.count / 3
        : 0;
      console.log(`Generate shell: ${faces} selected faces`);
      if (typeof this.onGenerateShell === 'function') {
        this.onGenerateShell(this.selectionMesh, this.snappedPoints);
      }
    });
    this._updateShellButton();
  }

  // Enable + highlight "Generate shell" only when a closed loop has a selection.
  _updateShellButton() {
    const btn = document.getElementById('ncGenerateShell');
    if (!btn) return;
    const ready = this.closed && !!this.selectionMesh;
    btn.classList.toggle('is-ready', ready);
    btn.disabled = !ready;
  }

  _syncShape() {
    const shape = document.getElementById('ncArchShape');
    if (shape) shape.textContent = this.closed ? 'closed loop' : 'open line';
  }

  _updatePanel() {
    const pointsEl = document.getElementById('ncArchPoints');
    const lengthEl = document.getElementById('ncArchLength');
    if (pointsEl) pointsEl.textContent = String(this.anchors.length);
    if (lengthEl) {
      let len = 0;
      const p = this.snappedPoints;
      for (let i = 1; i < p.length; i++) len += p[i].distanceTo(p[i - 1]);
      if (this.closed && p.length > 1) len += p[p.length - 1].distanceTo(p[0]);
      lengthEl.textContent = (len * this.mmPerUnit).toFixed(1) + ' mm';
    }
  }

  // ------------------------------------------------------------- mesh helpers
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

  // ------------------------------------------------------------- raycast utils
  _raycastSurface(e) {
    this.ensureScale();
    const meshes = this.getTargetMeshes();
    if (!meshes.length) return null;

    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;

    const h = hits[0];
    const normal = h.face
      ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0);
    return { point: h.point.clone(), normal };
  }

  _screenPos(v) {
    const p = v.clone().project(this.camera);
    const rect = this.dom.getBoundingClientRect();
    return {
      x: (p.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-p.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  _pickAnchor(e) {
    let best = -1;
    let bestD = 12; // px
    for (let i = 0; i < this.anchors.length; i++) {
      const s = this._screenPos(this.anchors[i].position);
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _pickSegment(e) {
    const n = this.anchors.length;
    if (n < 2) return null;

    const pts = this.anchors.map((a) => this._screenPos(a.position));
    const limit = this.closed ? n : n - 1;
    let bestIndex = -1;
    let bestD = 10; // px
    for (let i = 0; i < limit; i++) {
      const d = this._distToSegment(e.clientX, e.clientY, pts[i], pts[(i + 1) % n]);
      if (d < bestD) { bestD = d; bestIndex = i; }
    }
    if (bestIndex < 0) return null;

    const insertAt = bestIndex + 1;
    const hit = this._raycastSurface(e);
    const point = hit
      ? hit.point
      : this.anchors[bestIndex].position.clone()
          .lerp(this.anchors[(bestIndex + 1) % n].position, 0.5);
    const normal = hit ? hit.normal : this.nearestNormal(point);
    return { index: insertAt, point, normal };
  }

  _distToSegment(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // --------------------------------------------------------- click -> control point
  _handleClick(e) {
    const hit = this._raycastSurface(e);
    if (!hit) return;
    if (this.closed) return;

    if (this.anchors.length >= 3 &&
        hit.point.distanceTo(this.anchors[0].position) < this.closeThreshold) {
      this.closed = true;
      this._syncShape();
      this.refresh();
      this.computeSelection();
      return;
    }

    this.anchors.push({ position: hit.point, normal: hit.normal });
    this._addMarker(this.anchors.length - 1);
    this.refresh();
  }

  // ---------------------------------------------------------------- anchor markers
  _makeMarker() {
    const geo = new THREE.SphereGeometry(this.markerRadius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8b98a, depthTest: false });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.renderOrder = 1000;
    sphere.layers.set(1);
    return sphere;
  }

  _placeMarker(sphere, anchor) {
    sphere.position.copy(anchor.position).addScaledVector(anchor.normal, this.surfaceOffset);
  }

  _addMarker(idx) {
    const sphere = this._makeMarker();
    this._placeMarker(sphere, this.anchors[idx]);
    this.group.add(sphere);
    this.markers.splice(idx, 0, sphere);
  }

  _moveMarker(idx) {
    if (this.markers[idx]) this._placeMarker(this.markers[idx], this.anchors[idx]);
  }

  _rebuildMarkers() {
    this.markers.forEach((m) => {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this.markers = [];
    this.anchors.forEach((_, i) => this._addMarker(i));
  }

  _deleteAnchor(idx) {
    this.anchors.splice(idx, 1);
    const m = this.markers.splice(idx, 1)[0];
    if (m) {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    if (this.closed && this.anchors.length < 3) {
      this.closed = false;
      this._syncShape();
      this._clearSelection();
    }
    this.refresh();
    if (this.closed) this.computeSelection();
  }

  _insertAnchor(index, position, normal) {
    this.anchors.splice(index, 0, { position: position.clone(), normal: normal.clone() });
    this._rebuildMarkers();
    this.refresh();
    if (this.closed) this.computeSelection();
  }

  // ---------------------------------------------------------- surface snapping
  snapToSurface(point, normal, meshes) {
    if (!meshes.length) return point.clone();

    this._ray.set(point.clone().addScaledVector(normal, this.snapProbe), normal.clone().negate());
    this._ray.far = this.snapProbe * 2.2;
    let hits = this._ray.intersectObjects(meshes, false);
    if (hits.length) return hits[0].point.clone().addScaledVector(normal, this.surfaceOffset);

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

  // Laplacian relaxation of a polyline (endpoints fixed unless closed).
  _relax(points, passes, closed) {
    let pts = points;
    const w = 0.5;
    for (let p = 0; p < passes; p++) {
      const next = pts.map((v) => v.clone());
      const n = pts.length;
      const start = closed ? 0 : 1;
      const end = closed ? n : n - 1;
      for (let i = start; i < end; i++) {
        const prev = pts[(i - 1 + n) % n];
        const cur = pts[i];
        const nxt = pts[(i + 1) % n];
        next[i].copy(cur).multiplyScalar(1 - w)
          .add(prev.clone().add(nxt).multiplyScalar(w * 0.5));
      }
      pts = next;
    }
    return pts;
  }

  // ------------------------------------------------------------- curve rebuild
  refresh() {
    this.ensureScale();
    this._clearLine();
    this._clearPreviewPoints();

    if (this.anchors.length < 2) {
      this.snappedPoints = this.anchors.map((a) => a.position.clone());
      this._updatePanel();
      return;
    }

    const pts = this.anchors.map((a) => a.position.clone());
    const curve = new THREE.CatmullRomCurve3(pts, this.closed, 'catmullrom', 0.5);

    // Sample at the requested real-world spacing.
    const approxLen = curve.getLength() || this.unit;
    const worldSpacing = Math.max(this.spacingMm / this.mmPerUnit, this.unit * 0.002);
    let divisions = Math.ceil(approxLen / worldSpacing);
    divisions = Math.min(Math.max(divisions, 24), 3000);

    const meshes = this.getTargetMeshes();
    let sampled = curve.getPoints(divisions)
      .map((p) => this.snapToSurface(p, this.nearestNormal(p), meshes));

    const passes = Math.round(this.smoothing);
    if (passes > 0) {
      sampled = this._relax(sampled, passes, this.closed);
      sampled = sampled.map((p) => this.snapToSurface(p, this.nearestNormal(p), meshes));
    }
    this.snappedPoints = sampled;

    // Curve line
    const geo = new THREE.BufferGeometry().setFromPoints(sampled);
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
    this.line.layers.set(1);
    this.group.add(this.line);

    // Preview points
    if (this.showPreview) {
      const step = Math.max(1, Math.floor(sampled.length / 600));
      const shown = step === 1 ? sampled : sampled.filter((_, i) => i % step === 0);
      const pgeo = new THREE.BufferGeometry().setFromPoints(shown);
      const pmat = new THREE.PointsMaterial({
        color: 0x2196f3,
        size: 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      });
      this.previewPoints = new THREE.Points(pgeo, pmat);
      this.previewPoints.renderOrder = 999;
      this.previewPoints.layers.set(1);
      this.group.add(this.previewPoints);
    }

    this._updatePanel();
  }

  // -------------------------------------------------- enclosed-face selection
  computeSelection() {
    const curvePts = this.snappedPoints;
    if (!this.closed || !curvePts || curvePts.length < 3) return;

    const centroid = new THREE.Vector3();
    curvePts.forEach((p) => centroid.add(p));
    centroid.multiplyScalar(1 / curvePts.length);

    const planeN = new THREE.Vector3();
    this.anchors.forEach((a) => planeN.add(a.normal));
    if (planeN.lengthSq() < 1e-6) planeN.set(0, 1, 0);
    planeN.normalize();

    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(planeN.dot(u)) > 0.9) u.set(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(planeN, u).normalize();
    u = new THREE.Vector3().crossVectors(v, planeN).normalize();

    const to2D = (p) => {
      const d = new THREE.Vector3().subVectors(p, centroid);
      return { x: d.dot(u), y: d.dot(v), z: d.dot(planeN) };
    };

    const poly = curvePts.map(to2D);
    const band = this.snapProbe * 4;

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
    this._clearSelection();
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
    this._updateShellButton();
  }

  _clearSelection() {
    if (this.selectionMesh) {
      this.group.remove(this.selectionMesh);
      this.selectionMesh.geometry.dispose();
      this.selectionMesh.material.dispose();
      this.selectionMesh = null;
    }
    const el = document.getElementById('ncPaintedFaces');
    if (el) el.textContent = '0';
    this._updateShellButton();
  }

  // ------------------------------------------------------------------ editing
  undoLast() {
    if (this.closed) {
      this.closed = false;
      this._syncShape();
      this._clearSelection();
    } else if (this.anchors.length) {
      this._deleteAnchor(this.anchors.length - 1);
      return;
    }
    this.refresh();
  }

  reset() {
    this._clearLine();
    this._clearPreviewPoints();
    this._clearSelection();
    this.markers.forEach((m) => {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    this.markers = [];
    this.anchors = [];
    this.snappedPoints = [];
    this.closed = false;
    this._syncShape();
    this._updatePanel();
  }

  _clearLine() {
    if (!this.line) return;
    this.group.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
    this.line = null;
  }

  _clearPreviewPoints() {
    if (!this.previewPoints) return;
    this.group.remove(this.previewPoints);
    this.previewPoints.geometry.dispose();
    this.previewPoints.material.dispose();
    this.previewPoints = null;
  }
}

// Export for use in other modules
window.CurveTool = CurveTool;
