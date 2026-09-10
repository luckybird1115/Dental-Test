// Stone Setter  (pavé)
// Fills each Template-Brush zone with a grid of faceted gems plus gold setting
// beads ("prongs"), sitting on the generated shell (or the tooth if no shell).
// Visual-match fidelity: convincing layout + faceted gem silhouette, not a
// manufacturing-grade stone-setting.
//
//   Pattern      straight | honeycomb | invisible | corner
//   Stone size   gem diameter (mm)
//   Gap          metal shown between stones (mm); invisible forces ~0
//   Prong size   bead radius as % of stone radius
//   Stone margin keep-out from the zone edge (mm)

class StoneSetter {
  constructor({ sceneManager, brushTool, curveTool }) {
    this.scene = sceneManager.getScene();
    this.camera = sceneManager.getCamera();
    this.brushTool = brushTool;
    this.curveTool = curveTool;

    this.raycaster = new THREE.Raycaster();
    this.mmPerUnit = 1 / (AppConfig.modelScale || 1);

    this.enabled = false;
    this.count = 0;
    this._applyTimer = null;

    this.params = {
      pattern: 'straight',
      stoneSizeMm: 1.0,      // gem diameter
      gapMm: 0.10,
      prongScaleWithStone: true,
      prongPct: 20,
      stoneMarginMm: 0.20
    };

    this.group = new THREE.Group();
    this.group.name = 'StoneSetterGroup';
    this.scene.add(this.group);

    this._gemGeo = this._makeGemGeometry();
    this._prongGeo = new THREE.SphereGeometry(1, 12, 10);
    this._gemMat = new THREE.MeshStandardMaterial({
      color: 0xcfeaff, roughness: 0.04, metalness: 0.1,
      flatShading: true, side: THREE.DoubleSide,
      emissive: 0x24506a, emissiveIntensity: 0.45,
      envMapIntensity: 1.3
    });
    this._prongMat = new THREE.MeshStandardMaterial({
      color: 0xe7b64a, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.4
    });

    this._bindPanel();
  }

  // ------------------------------------------------------------------ gem mesh
  // Round-brilliant silhouette: octagonal crown frustum + pavilion cone.
  // Unit girdle radius, +Y up (table up, culet down).
  _makeGemGeometry() {
    const sides = 8;
    const girdleR = 1, tableR = 0.52, crownH = 0.62, pavH = 1.15;
    const ring = (r, y) => {
      const out = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
        out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      return out;
    };
    const girdle = ring(girdleR, 0);
    const table = ring(tableR, crownH);
    const culet = new THREE.Vector3(0, -pavH, 0);
    const tableC = new THREE.Vector3(0, crownH, 0);

    const tris = [];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      // crown facets (outward)
      tris.push(girdle[i], girdle[j], table[j]);
      tris.push(girdle[i], table[j], table[i]);
      // table top (faces +Y)
      tris.push(table[j], table[i], tableC);
      // pavilion facets (outward, down to the culet)
      tris.push(girdle[j], girdle[i], culet);
    }
    const arr = new Float32Array(tris.length * 3);
    for (let k = 0; k < tris.length; k++) {
      arr[k * 3] = tris[k].x; arr[k * 3 + 1] = tris[k].y; arr[k * 3 + 2] = tris[k].z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  }

  // --------------------------------------------------------------- public API
  setEnabled(on) {
    this.enabled = !!on;
    if (this.enabled) this.apply();
    else this.clear();
  }

  // Debounced re-run, for slider drags.
  scheduleApply() {
    if (!this.enabled) return;
    clearTimeout(this._applyTimer);
    this._applyTimer = setTimeout(() => this.apply(), 120);
  }

  clear() {
    for (let i = this.group.children.length - 1; i >= 0; i--) {
      this.group.remove(this.group.children[i]);
    }
    this._updateCount(0);
  }

  apply() {
    this.clear();
    if (!this.enabled) return;

    const regions = this.brushTool ? this.brushTool.getTemplateRegions() : [];
    if (!regions.length) { this._updateCount(0); return; }

    const shells = (this.curveTool && this.curveTool.shells) ? this.curveTool.shells.filter(Boolean) : [];

    let total = 0;
    regions.forEach((r) => { total += this._fillRegion(r, shells); });
    this._updateCount(total);
  }

  // ------------------------------------------------------------ region filling
  _fillRegion(region, shells) {
    const anchors = region.anchors;
    if (!anchors || anchors.length < 3) return 0;

    // Tangent-plane basis at the zone centroid.
    const centroid = new THREE.Vector3();
    anchors.forEach((a) => centroid.add(a.position));
    centroid.multiplyScalar(1 / anchors.length);

    const nrm = new THREE.Vector3();
    anchors.forEach((a) => nrm.add(a.normal));
    if (nrm.lengthSq() < 1e-6) nrm.set(0, 1, 0);
    nrm.normalize();

    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(nrm.dot(u)) > 0.9) u.set(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(nrm, u).normalize();
    u = new THREE.Vector3().crossVectors(v, nrm).normalize();

    const to2D = (p) => {
      const d = new THREE.Vector3().subVectors(p, centroid);
      return { x: d.dot(u), y: d.dot(v) };
    };
    const poly = anchors.map((a) => to2D(a.position));

    const pattern = this.params.pattern;
    const rWorld = (this.params.stoneSizeMm / this.mmPerUnit) / 2;
    const gapWorld = pattern === 'invisible'
      ? rWorld * 0.04
      : this.params.gapMm / this.mmPerUnit;
    const marginWorld = this.params.stoneMarginMm / this.mmPerUnit;
    const spacing = 2 * rWorld + gapWorld;
    if (spacing < 1e-6) return 0;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    poly.forEach((p) => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });

    const rowH = pattern === 'honeycomb' ? spacing * Math.sin(Math.PI / 3) : spacing;
    const centers = [];
    let row = 0;
    for (let y = minY; y <= maxY + 1e-6; y += rowH, row++) {
      const xOff = (pattern === 'honeycomb' && (row & 1)) ? spacing / 2 : 0;
      for (let x = minX + xOff; x <= maxX + 1e-6; x += spacing) {
        const pt = { x, y };
        if (!this._pointInPoly(pt, poly)) continue;
        if (this._distToPolyEdge(pt, poly) < rWorld + marginWorld) continue;
        centers.push(pt);
      }
    }
    if (!centers.length) return 0;

    const targets = shells.length ? shells : [region.mesh];

    centers.forEach((c2) => {
      const world = centroid.clone().addScaledVector(u, c2.x).addScaledVector(v, c2.y);
      const s = this._dropToSurface(world, nrm, rWorld, targets, region.mesh);
      this._addStone(s.point, s.normal, rWorld);
    });

    if (pattern !== 'invisible') {
      this._addProngs(centers, centroid, u, v, nrm, spacing, rWorld, targets, region.mesh);
    }

    return centers.length;
  }

  // Raycast down the plane normal onto the shell/tooth so pieces sit on it.
  _dropToSurface(world, nrm, r, targets, fallbackMesh) {
    this.raycaster.set(world.clone().addScaledVector(nrm, r * 8), nrm.clone().negate());
    this.raycaster.far = r * 20;
    let hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit && fallbackMesh) hit = this.raycaster.intersectObject(fallbackMesh, false)[0];
    if (!hit) return { point: world, normal: nrm.clone() };
    const n = hit.face
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : nrm.clone();
    return { point: hit.point.clone(), normal: n };
  }

  _addStone(pos, normal, radius) {
    const m = new THREE.Mesh(this._gemGeo, this._gemMat);
    // A hair smaller than the cell so metal shows between stones.
    m.scale.setScalar(radius * 0.9);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    // Girdle sits a touch above the metal so the crown reads clearly.
    m.position.copy(pos).addScaledVector(normal, radius * 0.32);
    m.renderOrder = 6;
    this.group.add(m);
  }

  // Gold beads at the points where stone corners meet (dual lattice), which
  // also catch the fringe stones.
  _addProngs(centers, centroid, u, v, nrm, spacing, rWorld, targets, fallbackMesh) {
    const half = spacing / 2;
    const seen = new Set();
    const q = spacing * 0.25;
    const key = (x, y) => Math.round(x / q) + ',' + Math.round(y / q);

    let prongR = this.params.prongScaleWithStone
      ? rWorld * (this.params.prongPct / 100)
      : (this.params.stoneSizeMm / this.mmPerUnit) / 2 * 0.2;
    prongR = Math.max(prongR, rWorld * 0.06);

    const reach = spacing * 0.95;   // must exceed the stone->gap diagonal (~half*sqrt2)
    const gaps = [];
    centers.forEach((c) => {
      [[half, half], [half, -half], [-half, half], [-half, -half]].forEach((d) => {
        const gx = c.x + d[0], gy = c.y + d[1];
        const k = key(gx, gy);
        if (seen.has(k)) return;
        seen.add(k);
        let near = 0;
        for (let i = 0; i < centers.length; i++) {
          const dx = centers[i].x - gx, dy = centers[i].y - gy;
          if (dx * dx + dy * dy < reach * reach) near++;
          if (near >= 2) break;
        }
        if (near >= 2) gaps.push({ x: gx, y: gy });
      });
    });

    gaps.forEach((g2) => {
      const world = centroid.clone().addScaledVector(u, g2.x).addScaledVector(v, g2.y);
      const s = this._dropToSurface(world, nrm, rWorld, targets, fallbackMesh);
      const bead = new THREE.Mesh(this._prongGeo, this._prongMat);
      bead.scale.setScalar(prongR);
      bead.position.copy(s.point).addScaledVector(s.normal, prongR * 0.4);
      bead.renderOrder = 6;
      this.group.add(bead);
    });
  }

  // --------------------------------------------------------------- 2D helpers
  _pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      const hit = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  _distToPolyEdge(pt, poly) {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x, ay = poly[j].y, bx = poly[i].x, by = poly[i].y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-9;
      let t = ((pt.x - ax) * dx + (pt.y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x - (ax + t * dx), pt.y - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  }

  // ------------------------------------------------------------------- panel
  _updateCount(n) {
    this.count = n;
    const el = document.getElementById('ncStoneCount');
    if (el) el.textContent = String(n);
  }

  _bindPanel() {
    const num = (id, fmt) => {
      const slider = document.getElementById(id);
      const label = document.getElementById(id + 'Val');
      return { slider, label, fmt };
    };

    const size = num('ncStoneSize');
    size.slider?.addEventListener('input', (e) => {
      this.params.stoneSizeMm = parseFloat(e.target.value);
      if (size.label) size.label.textContent = this.params.stoneSizeMm.toFixed(2) + ' mm';
      this.scheduleApply();
    });

    const gap = num('ncStoneGap');
    gap.slider?.addEventListener('input', (e) => {
      this.params.gapMm = parseFloat(e.target.value);
      if (gap.label) gap.label.textContent = this.params.gapMm.toFixed(2) + ' mm';
      this.scheduleApply();
    });

    const prong = num('ncProngSize');
    prong.slider?.addEventListener('input', (e) => {
      this.params.prongPct = parseFloat(e.target.value);
      if (prong.label) prong.label.textContent = Math.round(this.params.prongPct) + ' %';
      this.scheduleApply();
    });

    const margin = num('ncStoneMargin');
    margin.slider?.addEventListener('input', (e) => {
      this.params.stoneMarginMm = parseFloat(e.target.value);
      if (margin.label) margin.label.textContent = this.params.stoneMarginMm.toFixed(2) + ' mm';
      this.scheduleApply();
    });

    document.getElementById('ncProngScale')?.addEventListener('change', (e) => {
      this.params.prongScaleWithStone = e.target.checked;
      this.scheduleApply();
    });

    const patternGroup = document.getElementById('ncStonePattern');
    patternGroup?.querySelectorAll('.nc-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        patternGroup.querySelectorAll('.nc-toggle').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.params.pattern = btn.dataset.pattern;
        this.scheduleApply();
      });
    });

    document.getElementById('ncPlaceStones')?.addEventListener('click', () => {
      this.enabled = true;
      this.apply();
      this._syncDecorationToggle('diamonds');
    });
  }

  _syncDecorationToggle(which) {
    document.querySelectorAll('#ncSidebar [data-deco]').forEach((b) => {
      b.classList.toggle('active', b.dataset.deco === which);
    });
  }
}

window.StoneSetter = StoneSetter;
