// Brush Tool  (Template Brush)
// Freehand-paints a blob-shaped area on the visible teeth and, on release,
// converts the boundary of the painted area into an editable, closed point
// system - similar in spirit to CurveTool's editable loop, but generated
// from a brush stroke instead of individual clicks, and supporting several
// independent "template areas" at once.
//
// Pipeline
//   1. Stroke        - while the mouse is down, every move raycasts against
//      the mesh under the cursor and selects the triangles whose centroid
//      falls within "radius" of the hit point (cached in local mesh space
//      for speed). The growing set is shown as a solid highlight.
//   2. Boundary       - on release, the selected triangles' edges are welded
//      by position and the edges used by exactly one triangle form the
//      outline of the painted blob (there can be more than one, e.g. if the
//      stroke crossed a gap - each becomes its own template area).
//   3. Resample       - each outline is resampled to an evenly spaced set of
//      points (real-world mm spacing) - these become the editable anchors.
//   4. Template area  - the anchors are rendered as draggable markers joined
//      by a closed line and added to the template list in the panel.
//
// Editing (matches the panel hint)
//   * Drag a point              -> move it (re-projected onto its mesh)
//   * Alt-click a line segment  -> insert a point there
//   * Ctrl/Cmd-click a point    -> delete it (removes the template if <3 left)

class BrushTool {
  constructor(sceneManager, stageManager) {
    this.sceneManager = sceneManager;
    this.stageManager = stageManager;

    this.scene = sceneManager.getScene();
    this.camera = sceneManager.getCamera();
    this.dom = sceneManager.getRenderer().domElement;
    this.controls = sceneManager.getControls();

    // Same convention as CurveTool: edit helpers live on layer 1 so the
    // COMBINED mini view can exclude them.
    this.camera.layers.enable(1);

    this.active = false;
    this.painting = false;
    this.radiusMm = 1.5;
    this.category = 'stones';

    this.templates = [];   // { id, category, mesh, anchors:[{position,normal}], markers:[], line }
    this._nextId = 1;

    this.mmPerUnit = 1 / (AppConfig.modelScale || 1);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._scaleV = new THREE.Vector3();

    // Scale-dependent constants, filled by ensureScale() on first use.
    this.unit = 0;
    this.markerRadius = 1;
    this.surfaceOffset = 0.1;

    this._topoCache = new WeakMap(); // geometry -> { pos, index, triCount, centroids }

    this.group = new THREE.Group();
    this.group.name = 'BrushToolGroup';
    this.scene.add(this.group);

    this.hoverRing = null;
    this._strokeOverlay = null;
    this._strokeMesh = null;
    this._strokeTris = null;
    this._lastDabPoint = null;
    this._pointerId = null;

    this._drag = null; // { tpl, idx, downX, downY, moved }

    this._bindEvents();
    this._bindPanel();
  }

  // ---------------------------------------------------------------- activation
  setActive(on) {
    this.active = !!on;
    this.dom.style.cursor = this.active ? 'crosshair' : '';

    const panel = document.getElementById('ncBrushPanel');
    if (panel) panel.hidden = !this.active;

    if (!this.active) {
      this._hideHoverRing();
      if (this.painting) this._cancelStroke();
    }
  }

  isActive() {
    return this.active;
  }

  // ------------------------------------------------------------ pointer events
  _bindEvents() {
    this._onDown = (e) => {
      if (!this.active || e.button !== 0) return;

      const picked = this._pickAnchor(e);
      if (picked) {
        if (e.ctrlKey || e.metaKey) {   // delete
          e.preventDefault();
          this._deletePoint(picked.tpl, picked.idx);
          return;
        }
        e.preventDefault();
        this._drag = { tpl: picked.tpl, idx: picked.idx, downX: e.clientX, downY: e.clientY, moved: false };
        if (this.controls) this.controls.enabled = false;
        this._capture(e);
        return;
      }

      if (e.altKey) {                   // insert on a segment
        const seg = this._pickSegment(e);
        if (seg) {
          e.preventDefault();
          this._insertPoint(seg.tpl, seg.index, seg.point, seg.normal);
          return;
        }
      }

      const hit = this._raycastSurface(e);
      if (!hit) return;

      e.preventDefault();
      this.ensureScale();
      this.painting = true;
      this._strokeMesh = hit.object;
      this._strokeTris = new Set();
      this._lastDabPoint = hit.point.clone();
      if (this.controls) this.controls.enabled = false;
      this._capture(e);
      this._paintDab(hit.point, this._strokeMesh);
      this._updateHoverRing(hit.point, hit.normal);
    };

    this._onMove = (e) => {
      if (!this.active) return;

      if (this._drag) {
        if (!this._drag.moved) {
          const d = Math.hypot(e.clientX - this._drag.downX, e.clientY - this._drag.downY);
          if (d > 3) this._drag.moved = true;
        }
        const { tpl, idx } = this._drag;
        const hit = this._raycastMesh(e, tpl.mesh);
        if (hit) {
          tpl.anchors[idx] = { position: hit.point, normal: hit.normal };
          this._placeMarker(tpl.markers[idx], tpl.anchors[idx]);
          this._rebuildLine(tpl);
        }
        return;
      }

      if (this.painting) {
        const hit = this._raycastMesh(e, this._strokeMesh);
        if (hit) {
          this._updateHoverRing(hit.point, hit.normal);
          const spacing = (this.radiusMm / this.mmPerUnit) * 0.4;
          if (!this._lastDabPoint || hit.point.distanceTo(this._lastDabPoint) > spacing) {
            this._lastDabPoint = hit.point.clone();
            this._paintDab(hit.point, this._strokeMesh);
          }
        }
        return;
      }

      // Pure hover: preview the brush radius on the surface.
      const hit = this._raycastSurface(e);
      if (hit) this._updateHoverRing(hit.point, hit.normal);
      else this._hideHoverRing();
    };

    this._onUp = (e) => {
      if (!this.active || e.button !== 0) return;

      if (this._drag) {
        this._drag = null;
        if (this.controls) this.controls.enabled = true;
        this._release(e);
        return;
      }

      if (this.painting) {
        this.painting = false;
        if (this.controls) this.controls.enabled = true;
        this._release(e);
        this._commitStroke();
      }
    };

    this._onKey = (e) => {
      if (!this.active) return;
      if (e.key === 'Escape' && this.painting) this._cancelStroke();
    };

    this.dom.addEventListener('pointerdown', this._onDown);
    this.dom.addEventListener('pointermove', this._onMove);
    this.dom.addEventListener('pointerup', this._onUp);
    window.addEventListener('keydown', this._onKey);
  }

  _capture(e) {
    this._pointerId = e.pointerId;
    try { this.dom.setPointerCapture(e.pointerId); } catch (err) {}
  }

  _release(e) {
    try { this.dom.releasePointerCapture(e.pointerId); } catch (err) {}
    this._pointerId = null;
  }

  // -------------------------------------------------------------- panel wiring
  _bindPanel() {
    const close = document.getElementById('ncBrushClose');
    const radius = document.getElementById('ncBrushRadius');
    const radiusVal = document.getElementById('ncBrushRadiusVal');
    const tabs = document.querySelectorAll('#ncBrushPanel .nc-brush-tab');

    close?.addEventListener('click', () => {
      this.setActive(false);
      const selectBtn = document.querySelector('#ncLeftToolbar .nc-tool-btn[data-tool="select"]');
      if (selectBtn) {
        document.querySelectorAll('#ncLeftToolbar .nc-tool-btn')
          .forEach((b) => b.classList.remove('active'));
        selectBtn.classList.add('active');
      }
    });

    radius?.addEventListener('input', (e) => {
      this.radiusMm = parseFloat(e.target.value);
      if (radiusVal) radiusVal.textContent = this.radiusMm.toFixed(2) + ' mm';
    });

    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabs.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.category = btn.dataset.brushcat;
      });
    });

    this._updateList();
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
  }

  _getTopology(mesh) {
    let topo = this._topoCache.get(mesh.geometry);
    if (topo) return topo;

    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const centroids = new Float32Array(triCount * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      centroids[t * 3] = (a.x + b.x + c.x) / 3;
      centroids[t * 3 + 1] = (a.y + b.y + c.y) / 3;
      centroids[t * 3 + 2] = (a.z + b.z + c.z) / 3;
    }

    topo = { pos, index, triCount, centroids };
    this._topoCache.set(mesh.geometry, topo);
    return topo;
  }

  // ------------------------------------------------------------- raycast utils
  _raycastSurface(e) {
    const meshes = this.getTargetMeshes();
    if (!meshes.length) return null;
    return this._raycastList(e, meshes);
  }

  _raycastMesh(e, mesh) {
    if (!mesh) return null;
    return this._raycastList(e, [mesh]);
  }

  _raycastList(e, meshes) {
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
    return { point: h.point.clone(), normal, object: h.object };
  }

  _screenPos(v) {
    const p = v.clone().project(this.camera);
    const rect = this.dom.getBoundingClientRect();
    return {
      x: (p.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-p.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  _distToSegment(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // -------------------------------------------------------------------- paint
  _paintDab(worldPoint, mesh) {
    const topo = this._getTopology(mesh);
    const scale = mesh.getWorldScale(this._scaleV).x || 1;
    const localRadius = (this.radiusMm / this.mmPerUnit) / scale;
    const r2 = localRadius * localRadius;

    const local = mesh.worldToLocal(worldPoint.clone());
    const { centroids, triCount } = topo;
    let added = false;

    for (let t = 0; t < triCount; t++) {
      if (this._strokeTris.has(t)) continue;
      const dx = centroids[t * 3] - local.x;
      const dy = centroids[t * 3 + 1] - local.y;
      const dz = centroids[t * 3 + 2] - local.z;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._strokeTris.add(t);
        added = true;
      }
    }

    if (added) this._rebuildStrokeOverlay(mesh);
  }

  _rebuildStrokeOverlay(mesh) {
    const topo = this._getTopology(mesh);
    const { pos, index } = topo;

    const verts = new Float32Array(this._strokeTris.size * 9);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let o = 0;
    this._strokeTris.forEach((t) => {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      verts[o++] = a.x; verts[o++] = a.y; verts[o++] = a.z;
      verts[o++] = b.x; verts[o++] = b.y; verts[o++] = b.z;
      verts[o++] = c.x; verts[o++] = c.y; verts[o++] = c.z;
    });

    if (!this._strokeOverlay) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff7a29,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      this._strokeOverlay = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      this._strokeOverlay.renderOrder = 997;
      this.group.add(this._strokeOverlay);
    }

    this._strokeOverlay.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    this._strokeOverlay.geometry = geo;
  }

  _clearStrokeOverlay() {
    if (!this._strokeOverlay) return;
    this.group.remove(this._strokeOverlay);
    this._strokeOverlay.geometry.dispose();
    this._strokeOverlay.material.dispose();
    this._strokeOverlay = null;
  }

  _cancelStroke() {
    this.painting = false;
    this._clearStrokeOverlay();
    this._strokeMesh = null;
    this._strokeTris = null;
    this._lastDabPoint = null;
    if (this.controls) this.controls.enabled = true;
  }

  _commitStroke() {
    const mesh = this._strokeMesh;
    const tris = this._strokeTris;
    this._clearStrokeOverlay();
    this._strokeMesh = null;
    this._strokeTris = null;
    this._lastDabPoint = null;

    if (!mesh || !tris || tris.size === 0) return;

    const loops = this._computeBoundaryLoops(mesh, tris);
    loops.forEach((loop) => this._createTemplate(mesh, loop));
  }

  // -------------------------------------------------- boundary loop extraction
  _computeBoundaryLoops(mesh, triSet) {
    this.ensureScale();
    const topo = this._getTopology(mesh);
    const { pos, index } = topo;
    const prec = Math.max(this.unit * 1e-4, 1e-6);
    const keyOf = (v) => Math.round(v.x / prec) + ',' + Math.round(v.y / prec) + ',' + Math.round(v.z / prec);

    const edgeMap = new Map();   // edgeKey -> { count, k1, k2 }
    const nodePos = new Map();   // vertKey -> Vector3 (local)
    const nodeNormal = new Map(); // vertKey -> Vector3 accumulator (local)

    const addEdge = (p1, k1, p2, k2, n) => {
      const ek = k1 < k2 ? (k1 + '|' + k2) : (k2 + '|' + k1);
      let e = edgeMap.get(ek);
      if (!e) { e = { count: 0, k1, k2 }; edgeMap.set(ek, e); }
      e.count++;
      if (!nodePos.has(k1)) nodePos.set(k1, p1.clone());
      if (!nodePos.has(k2)) nodePos.set(k2, p2.clone());
      if (!nodeNormal.has(k1)) nodeNormal.set(k1, new THREE.Vector3());
      if (!nodeNormal.has(k2)) nodeNormal.set(k2, new THREE.Vector3());
      nodeNormal.get(k1).add(n);
      nodeNormal.get(k2).add(n);
    };

    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    triSet.forEach((t) => {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);

      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      const ka = keyOf(a), kb = keyOf(b), kc = keyOf(c);
      addEdge(a, ka, b, kb, n);
      addEdge(b, kb, c, kc, n);
      addEdge(c, kc, a, ka, n);
    });

    const adj = new Map();
    edgeMap.forEach((e) => {
      if (e.count !== 1) return;
      if (!adj.has(e.k1)) adj.set(e.k1, []);
      if (!adj.has(e.k2)) adj.set(e.k2, []);
      adj.get(e.k1).push(e.k2);
      adj.get(e.k2).push(e.k1);
    });

    const visited = new Set();
    const loops = [];
    adj.forEach((_, startKey) => {
      if (visited.has(startKey)) return;
      const loopKeys = [];
      let prevKey = null;
      let curKey = startKey;
      let guard = 0;
      while (curKey && !visited.has(curKey) && guard++ < 50000) {
        visited.add(curKey);
        loopKeys.push(curKey);
        const neighbors = adj.get(curKey) || [];
        let nextKey = neighbors.find((k) => k !== prevKey && !visited.has(k));
        if (!nextKey) nextKey = neighbors.find((k) => k === startKey && loopKeys.length > 2);
        prevKey = curKey;
        curKey = nextKey;
      }
      if (loopKeys.length >= 3) {
        const points = loopKeys.map((k) => nodePos.get(k).clone().applyMatrix4(mesh.matrixWorld));
        const normals = loopKeys.map((k) => {
          const nAvg = nodeNormal.get(k).clone();
          if (nAvg.lengthSq() < 1e-8) nAvg.set(0, 1, 0); else nAvg.normalize();
          return nAvg.transformDirection(mesh.matrixWorld).normalize();
        });
        loops.push({ points, normals });
      }
    });

    return loops;
  }

  // Arc-length resample a closed polyline (+ its per-point normals) to an
  // even mm spacing, clamped to a sane number of control points.
  _resampleClosedLoop(points, normals, targetSpacingMm) {
    const n = points.length;
    if (n < 3) return { points: [], normals: [] };

    const segLen = [];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = points[i].distanceTo(points[(i + 1) % n]);
      segLen.push(d);
      total += d;
    }
    if (total < 1e-6) return { points: [], normals: [] };

    const totalMm = total * this.mmPerUnit;
    let count = Math.round(totalMm / targetSpacingMm);
    count = Math.max(10, Math.min(48, count));

    const step = total / count;
    const outPoints = [];
    const outNormals = [];
    let segIdx = 0;
    let accumulated = 0;

    for (let k = 0; k < count; k++) {
      const dist = k * step;
      while (segIdx < n - 1 && accumulated + segLen[segIdx] < dist) {
        accumulated += segLen[segIdx];
        segIdx++;
      }
      const segT = segLen[segIdx] > 1e-9 ? (dist - accumulated) / segLen[segIdx] : 0;
      const t = Math.min(Math.max(segT, 0), 1);
      const p0 = points[segIdx];
      const p1 = points[(segIdx + 1) % n];
      outPoints.push(p0.clone().lerp(p1, t));
      const n0 = normals[segIdx];
      const n1 = normals[(segIdx + 1) % n];
      outNormals.push(n0.clone().lerp(n1, t).normalize());
    }

    return { points: outPoints, normals: outNormals };
  }

  // ------------------------------------------------------------------ markers
  _makeMarker() {
    const geo = new THREE.SphereGeometry(this.markerRadius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7a29, depthTest: false });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.renderOrder = 1001;
    sphere.layers.set(1);
    return sphere;
  }

  _placeMarker(sphere, anchor) {
    sphere.position.copy(anchor.position).addScaledVector(anchor.normal, this.surfaceOffset);
  }

  _addMarker(tpl, idx) {
    const sphere = this._makeMarker();
    this._placeMarker(sphere, tpl.anchors[idx]);
    this.group.add(sphere);
    tpl.markers.splice(idx, 0, sphere);
  }

  _rebuildLine(tpl) {
    if (tpl.line) {
      this.group.remove(tpl.line);
      tpl.line.geometry.dispose();
      tpl.line.material.dispose();
      tpl.line = null;
    }
    const pts = tpl.anchors.map((a) => a.position.clone().addScaledVector(a.normal, this.surfaceOffset));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xff7a29, transparent: true, opacity: 0.95, depthTest: false });
    tpl.line = new THREE.LineLoop(geo, mat);
    tpl.line.renderOrder = 1000;
    tpl.line.layers.set(1);
    this.group.add(tpl.line);
  }

  // --------------------------------------------------------------- templates
  _createTemplate(mesh, loop) {
    const { points, normals } = this._resampleClosedLoop(loop.points, loop.normals, 1.1);
    if (points.length < 3) return;

    const tpl = {
      id: this._nextId++,
      category: this.category,
      mesh,
      anchors: points.map((p, i) => ({ position: p, normal: normals[i] })),
      markers: [],
      line: null
    };
    tpl.anchors.forEach((_, i) => this._addMarker(tpl, i));
    this._rebuildLine(tpl);

    this.templates.push(tpl);
    this._updateList();
  }

  deleteTemplate(id) {
    const idx = this.templates.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const tpl = this.templates[idx];
    tpl.markers.forEach((m) => {
      this.group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    if (tpl.line) {
      this.group.remove(tpl.line);
      tpl.line.geometry.dispose();
      tpl.line.material.dispose();
    }
    this.templates.splice(idx, 1);
    this._updateList();
  }

  // ------------------------------------------------------------------ editing
  _pickAnchor(e) {
    let best = null;
    let bestD = 12; // px
    this.templates.forEach((tpl) => {
      tpl.anchors.forEach((a, i) => {
        const s = this._screenPos(a.position);
        const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
        if (d < bestD) { bestD = d; best = { tpl, idx: i }; }
      });
    });
    return best;
  }

  _pickSegment(e) {
    let best = null;
    let bestD = 10; // px
    this.templates.forEach((tpl) => {
      const n = tpl.anchors.length;
      if (n < 2) return;
      const pts = tpl.anchors.map((a) => this._screenPos(a.position));
      for (let i = 0; i < n; i++) {
        const d = this._distToSegment(e.clientX, e.clientY, pts[i], pts[(i + 1) % n]);
        if (d < bestD) { bestD = d; best = { tpl, index: i + 1 }; }
      }
    });
    if (!best) return null;

    const hit = this._raycastMesh(e, best.tpl.mesh);
    const point = hit ? hit.point : best.tpl.anchors[0].position.clone();
    const normal = hit ? hit.normal : best.tpl.anchors[0].normal.clone();
    return { tpl: best.tpl, index: best.index, point, normal };
  }

  _insertPoint(tpl, index, point, normal) {
    tpl.anchors.splice(index, 0, { position: point.clone(), normal: normal.clone() });
    const sphere = this._makeMarker();
    this._placeMarker(sphere, tpl.anchors[index]);
    this.group.add(sphere);
    tpl.markers.splice(index, 0, sphere);
    this._rebuildLine(tpl);
  }

  _deletePoint(tpl, idx) {
    if (tpl.anchors.length <= 3) {
      this.deleteTemplate(tpl.id);
      return;
    }
    tpl.anchors.splice(idx, 1);
    const m = tpl.markers.splice(idx, 1)[0];
    this.group.remove(m);
    m.geometry.dispose();
    m.material.dispose();
    this._rebuildLine(tpl);
  }

  // ----------------------------------------------------------------- hover UI
  _ensureHoverRing() {
    if (this.hoverRing) return;
    const geo = new THREE.RingGeometry(1, 1.1, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff7a29,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthTest: false
    });
    this.hoverRing = new THREE.Mesh(geo, mat);
    this.hoverRing.renderOrder = 1002;
    this.hoverRing.layers.set(1);
    this.hoverRing.visible = false;
    this.group.add(this.hoverRing);
  }

  _updateHoverRing(point, normal) {
    this.ensureScale();
    this._ensureHoverRing();
    const radiusWorld = this.radiusMm / this.mmPerUnit;
    this.hoverRing.scale.setScalar(radiusWorld);
    this.hoverRing.position.copy(point).addScaledVector(normal, this.surfaceOffset * 1.5);
    this.hoverRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this.hoverRing.visible = true;
  }

  _hideHoverRing() {
    if (this.hoverRing) this.hoverRing.visible = false;
  }

  // ------------------------------------------------------------------- panel
  _categoryLabel(cat) {
    if (!cat) return 'Template';
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  _updateList() {
    const list = document.getElementById('ncBrushList');
    if (!list) return;
    list.innerHTML = '';

    if (!this.templates.length) {
      const p = document.createElement('p');
      p.className = 'nc-brush-empty';
      p.textContent = 'No template areas yet.';
      list.appendChild(p);
      return;
    }

    this.templates.forEach((tpl, i) => {
      const row = document.createElement('div');
      row.className = 'nc-brush-item';

      const label = document.createElement('span');
      label.textContent = `${this._categoryLabel(tpl.category)} ${i + 1} · ${tpl.anchors.length} pts`;

      const del = document.createElement('button');
      del.className = 'nc-brush-item-del';
      del.textContent = '×';
      del.title = 'Delete template area';
      del.addEventListener('click', () => this.deleteTemplate(tpl.id));

      row.appendChild(label);
      row.appendChild(del);
      list.appendChild(row);
    });
  }
}

// Export for use in other modules
window.BrushTool = BrushTool;
