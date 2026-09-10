// Shell Builder
// Turns a selected surface patch (the triangle soup produced by CurveTool's
// closed-loop selection) into a solid, manufacturable "shell": the patch is
// the inner face that hugs the tooth, a copy offset along the surface normals
// is the outer face, and the open boundary between them is walled shut.
//
//   inner face  (patch, reversed winding -> normals point into the tooth)
//   outer face  (patch offset by `thickness` along vertex normals)
//   side wall   (one quad per boundary edge, joining inner rim to outer rim)
//
// Input geometry is expected in world space and non-indexed (3 unique vertices
// per triangle), which is exactly what CurveTool._showSelection() builds.

class ShellBuilder {
  // sourceGeometry : non-indexed BufferGeometry, world space, triangle soup
  // thickness      : offset distance in world units (already converted from mm)
  // returns        : indexed BufferGeometry for the solid, or null
  static build(sourceGeometry, thickness) {
    const pos = sourceGeometry.attributes.position;
    if (!pos || pos.count < 3) return null;

    const triCount = Math.floor(pos.count / 3);

    // Precision for welding coincident vertices, relative to patch size.
    sourceGeometry.computeBoundingBox();
    const bb = sourceGeometry.boundingBox;
    const span = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 1;
    const prec = Math.max(span * 1e-4, 1e-5);
    const keyOf = (x, y, z) =>
      Math.round(x / prec) + ',' + Math.round(y / prec) + ',' + Math.round(z / prec);

    const weld = new Map();          // position key -> welded index
    const wPos = [];                 // THREE.Vector3[]  welded positions
    const wNrm = [];                 // THREE.Vector3[]  accumulated (area-weighted) normals
    const triW = new Int32Array(triCount * 3);

    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), fn = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      va.fromBufferAttribute(pos, t * 3);
      vb.fromBufferAttribute(pos, t * 3 + 1);
      vc.fromBufferAttribute(pos, t * 3 + 2);

      // Area-weighted face normal (cross product magnitude == 2 * area).
      fn.copy(ab.subVectors(vb, va)).cross(ac.subVectors(vc, va));

      const verts = [va, vb, vc];
      for (let k = 0; k < 3; k++) {
        const p = verts[k];
        const kk = keyOf(p.x, p.y, p.z);
        let wi = weld.get(kk);
        if (wi === undefined) {
          wi = wPos.length;
          weld.set(kk, wi);
          wPos.push(p.clone());
          wNrm.push(new THREE.Vector3());
        }
        wNrm[wi].add(fn);
        triW[t * 3 + k] = wi;
      }
    }

    const wCount = wPos.length;
    if (wCount < 3) return null;

    for (let i = 0; i < wCount; i++) {
      if (wNrm[i].lengthSq() < 1e-12) wNrm[i].set(0, 1, 0);
      else wNrm[i].normalize();
    }

    // Boundary edges: those used by exactly one triangle. Keep the direction
    // the edge had in its owning triangle so the wall winds consistently.
    const edgeCount = new Map();
    const edgeDir = new Map();
    const ek = (i, j) => (i < j ? i + '|' + j : j + '|' + i);
    const addEdge = (i, j) => {
      const k = ek(i, j);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
      if (!edgeDir.has(k)) edgeDir.set(k, [i, j]);
    };
    for (let t = 0; t < triCount; t++) {
      const i0 = triW[t * 3], i1 = triW[t * 3 + 1], i2 = triW[t * 3 + 2];
      addEdge(i0, i1);
      addEdge(i1, i2);
      addEdge(i2, i0);
    }
    const boundary = [];
    edgeCount.forEach((cnt, k) => {
      if (cnt === 1) boundary.push(edgeDir.get(k));
    });
    if (!boundary.length) return null;

    // Relax the rim so the shell edge reads as a smooth curve instead of the
    // raw mesh zig-zag. Only the boundary vertices move (toward the midpoint of
    // their two rim neighbours); inner/outer faces follow since both derive
    // from wPos.
    ShellBuilder._smoothRim(wPos, boundary, 4, 0.5);

    // Vertex buffer: [0 .. wCount)  inner rim, [wCount .. 2*wCount)  outer rim.
    const positions = new Float32Array(wCount * 2 * 3);
    for (let i = 0; i < wCount; i++) {
      const p = wPos[i], n = wNrm[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      const o = (wCount + i) * 3;
      positions[o] = p.x + n.x * thickness;
      positions[o + 1] = p.y + n.y * thickness;
      positions[o + 2] = p.z + n.z * thickness;
    }

    const indices = [];

    // Inner face - reversed winding so its normal points into the tooth.
    for (let t = 0; t < triCount; t++) {
      indices.push(triW[t * 3], triW[t * 3 + 2], triW[t * 3 + 1]);
    }
    // Outer face - original winding, offset vertices.
    for (let t = 0; t < triCount; t++) {
      indices.push(wCount + triW[t * 3], wCount + triW[t * 3 + 1], wCount + triW[t * 3 + 2]);
    }
    // Side wall - a quad per boundary edge (a -> b on the rim, a' -> b' offset).
    for (let e = 0; e < boundary.length; e++) {
      const a = boundary[e][0], b = boundary[e][1];
      const a2 = wCount + a, b2 = wCount + b;
      indices.push(a, b, b2);
      indices.push(a, b2, a2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  // Laplacian relaxation of the boundary polylines. `boundary` is a list of
  // [i,j] rim edges; each rim vertex is nudged toward the average of its two
  // rim-connected neighbours.
  static _smoothRim(wPos, boundary, passes, weight) {
    const nbr = new Map();
    const link = (i, j) => {
      if (!nbr.has(i)) nbr.set(i, []);
      const a = nbr.get(i);
      if (a.length < 2 && !a.includes(j)) a.push(j);
    };
    for (let e = 0; e < boundary.length; e++) {
      link(boundary[e][0], boundary[e][1]);
      link(boundary[e][1], boundary[e][0]);
    }

    const ids = Array.from(nbr.keys());
    for (let p = 0; p < passes; p++) {
      const moved = ids.map((i) => {
        const ns = nbr.get(i);
        if (ns.length < 2) return null;
        const a = wPos[ns[0]], b = wPos[ns[1]], cur = wPos[i];
        return new THREE.Vector3(
          cur.x + ((a.x + b.x) * 0.5 - cur.x) * weight,
          cur.y + ((a.y + b.y) * 0.5 - cur.y) * weight,
          cur.z + ((a.z + b.z) * 0.5 - cur.z) * weight
        );
      });
      for (let k = 0; k < ids.length; k++) {
        if (moved[k]) wPos[ids[k]].copy(moved[k]);
      }
    }
  }
}

window.ShellBuilder = ShellBuilder;
