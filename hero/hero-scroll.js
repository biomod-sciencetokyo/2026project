/* =============================================================================
   Cover animation for index.html (from HCR-animation/hero-scroll.html)
   The bundle builds itself, then the scroll bar walks it down onto a vesicle until the membrane tears.
   Needs: #hero > .hero-stage, .hero-text, canvas#labels, and hero/hero-anim.json.
   The page shows a static title until this script adds .hero--live, so if WebGL or the data is missing,
   or the visitor prefers reduced motion (index.html does not load this then), the cover stays a still title.
   ========================================================================== */
const heroEl = document.getElementById('hero');
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D = await (await fetch(new URL('./hero-anim.json', import.meta.url))).json();
const f32 = s => new Float32Array(Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer);

/* ---------- a longer bundle from the same data ----------
   The design repeats exactly every two HCR steps: 21 nt is two helical turns, so 42 nt is four, and a nucleotide
   two layers further along has the same orientation and sits 42 x rise further out. So layers 0 and 1 of this
   file are templates: copying them along x, two at a time, lengthens the bundle without changing anything else. */
const LAY_EXT = 20;                       // 20 steps -> about 150 nm, to match the 100 nm vesicle
const [FINAL, HOVER, LOCAL, NNT, NAT] = (() => {
  const F0 = f32(D.final), H0 = f32(D.hover), L0 = f32(D.local);
  const DX = 42 * D.rise;                 // the period of the design, in nm
  const ntsOf = D.names.map(() => []), atomsOf = Array.from({ length: D.ntStrand.length }, () => []);
  D.ntStrand.forEach((si, n) => ntsOf[si].push(n));
  D.atomNt.forEach((n, a) => atomsOf[n].push(a));
  const srcH = [[], []];
  D.names.forEach((nm, si) => { if (nm[0] === 'H') { const L = D.x0[si] / 21 - 1; if (L < 2) srcH[L].push(si); } });

  // the new strand list: the seed, then LAY_EXT rings copied from the two templates
  const srcOf = [], dxOf = [], names = [], x0 = [];
  D.names.forEach((nm, si) => { if (nm[0] === 'S') { srcOf.push(si); dxOf.push(0); names.push(nm); x0.push(0); } });
  for (let n = 0; n < LAY_EXT; n++) for (const si of srcH[n % 2]) {
    srcOf.push(si); dxOf.push(Math.floor(n / 2) * DX); names.push(D.names[si]); x0.push(21 * (n + 1));
  }

  // nucleotides and atoms, copied strand by strand
  const ntStrand = [], ntK = [], ntSrc = [], ntBase = [];
  srcOf.forEach((si, nsi) => { ntBase.push(ntStrand.length); for (const n of ntsOf[si]) { ntStrand.push(nsi); ntK.push(D.ntK[n]); ntSrc.push(n); } });
  const NNT2 = ntStrand.length;
  const atomNt = [], atomSrc = [];
  for (let j = 0; j < NNT2; j++) for (const a of atomsOf[ntSrc[j]]) { atomNt.push(j); atomSrc.push(a); }
  const NAT2 = atomNt.length;

  const FIN = new Float32Array(12 * NNT2), HOV = new Float32Array(12 * NNT2), LOC = new Float32Array(3 * NAT2);
  for (let j = 0; j < NNT2; j++) {
    const n = ntSrc[j], dx = dxOf[ntStrand[j]];
    for (let c = 0; c < 12; c++) { FIN[12 * j + c] = F0[12 * n + c]; HOV[12 * j + c] = H0[12 * n + c]; }
    FIN[12 * j + 9] += dx; HOV[12 * j + 9] += dx;
  }
  for (let a = 0; a < NAT2; a++) for (let c = 0; c < 3; c++) LOC[3 * a + c] = L0[3 * atomSrc[a] + c];

  // Cholesteryl-TEG on both ends of every double hairpin, so the anchors face every way round the tube.
  // A modifier's pose is stored relative to its own host nucleotide, and the three hairpins of a ring are the
  // same strand turned about the tube's axis, so one ring's modifiers serve all three without any change.
  const M0 = D.mods, RF0 = f32(M0.relF), RH0 = f32(M0.relH);
  const modsBySrc = new Map();
  M0.host.forEach((n, mi) => { const si = D.ntStrand[n]; if (!modsBySrc.has(si)) modsBySrc.set(si, []); modsBySrc.get(si).push(mi); });
  const tmpl = [null, null];   // one template per ring parity
  D.names.forEach((nm, si) => {
    if (nm[0] !== 'H') return;
    const L = D.x0[si] / 21 - 1;
    if (L < 2 && modsBySrc.has(si) && !tmpl[L]) tmpl[L] = modsBySrc.get(si);
  });
  const host = [], relF = [], relH = [];
  srcOf.forEach((si, nsi) => {
    if (names[nsi][0] !== 'H') return;
    for (const mi of (tmpl[(x0[nsi] / 21 - 1) % 2] || [])) {
      host.push(ntBase[nsi] + D.ntK[M0.host[mi]]);
      for (let c = 0; c < 12; c++) { relF.push(RF0[12 * mi + c]); relH.push(RH0[12 * mi + c]); }
    }
  });

  Object.assign(D, { names, x0, ntStrand, ntK, atomNt,
    el: atomSrc.map(a => D.el[a]).join(''), base: atomSrc.map(a => D.base[a]).join(''),
    mods: { local: M0.local, el: M0.el, kind: M0.kind, host, relF: Float32Array.from(relF), relH: Float32Array.from(relH) } });
  console.log(`bundle ${LAY_EXT} rings, ${names.length} strands, ${NNT2} nucleotides, ${NAT2} atoms, ${host.length} cholesterols`);
  return [FIN, HOV, LOC, NNT2, NAT2];
})();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* The twelve strand colours of the 2D animation, kept as they are apart from a light touch: a little less
   saturation, and the darkest and palest of them reined in, so they sit with the quieter figures without
   losing the palette anyone who has seen the other films will recognise. */
const tune = hex => {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * 0.82, clamp(hsl.l, 0.33, 0.66)).getHexString().replace(/^/, '#');
};
// the cover keeps to the site's colours: the DNA cool and nearly colourless, the sterols gold
const S_COL = ['#9fc4dd', '#bcd8ea', '#89b3d0', '#a9cadf', '#7ea8c8', '#c6dfee'];
const H_COL = ['#7fb4d4', '#a6cde3', '#6fa6c8', '#95c2db', '#88bcd8', '#b2d4e8'];
const SEED = new URLSearchParams(location.search).has('seed');
const colorOf = name => name[0] === 'S' ? (SEED ? '#7a828c' : S_COL[+name[1] - 1]) : H_COL[+name[1] - 1];
const VDW = { C: 0.18, N: 0.165, O: 0.158, P: 0.19 };

/* ---------- per-nucleotide poses as quaternion + position ---------- */
const m4 = new THREE.Matrix4();
function pose(A, i) {
  const o = i * 12;
  // A holds the rotation column by column, then the translation
  m4.set(A[o], A[o + 3], A[o + 6], A[o + 9], A[o + 1], A[o + 4], A[o + 7], A[o + 10], A[o + 2], A[o + 5], A[o + 8], A[o + 11], 0, 0, 0, 1);
  return { q: new THREE.Quaternion().setFromRotationMatrix(m4), p: new THREE.Vector3(A[o + 9], A[o + 10], A[o + 11]) };
}
const fin = [], hov = [];
for (let i = 0; i < NNT; i++) { fin.push(pose(FINAL, i)); hov.push(D.names[D.ntStrand[i]][0] === 'H' ? pose(HOVER, i) : null); }

// each nucleotide's atom centroid in its own frame, and the spacing to the next one in both shapes
const cLocal = Array.from({ length: NNT }, () => new THREE.Vector3()), cCount = new Uint16Array(NNT);
for (let i = 0; i < NAT; i++) { const n = D.atomNt[i]; cLocal[n].x += LOCAL[3 * i]; cLocal[n].y += LOCAL[3 * i + 1]; cLocal[n].z += LOCAL[3 * i + 2]; cCount[n]++; }
cLocal.forEach((c, n) => c.divideScalar(cCount[n]));
const centre = (P, n) => cLocal[n].clone().applyQuaternion(P.q).add(P.p);
const gapH = new Float32Array(NNT), gapF = new Float32Array(NNT);
for (let i = 0; i + 1 < NNT; i++) {
  if (D.ntStrand[i] !== D.ntStrand[i + 1]) continue;
  gapF[i] = centre(fin[i], i).distanceTo(centre(fin[i + 1], i + 1));
  if (hov[i]) gapH[i] = centre(hov[i], i).distanceTo(centre(hov[i + 1], i + 1));
}

/* ---------- timeline: the seed turns on its own, then H1-H3, H4-H6, H1-H3, H4-H6 bind ring by ring ---------- */
const SEED_HOLD = 3.5, STAG = 0.9, ARRIVE = 1.4, PAUSE = 0.3, ZIP = 2.8, ZW = 0.35;
const strands = D.names.map((name, si) => ({ name, x0: D.x0[si] }));
const layerX0 = [...new Set(strands.filter(s => s.name[0] === 'H').map(s => s.x0))].sort((a, b) => a - b);
let T = SEED_HOLD;
const layerT = [], STEP = 2 * STAG + ARRIVE + PAUSE + ZIP + 0.4;
layerX0.forEach((x0, n) => {
  layerT.push(T);
  const dt = Math.max(0.5, STEP * Math.pow(0.66, n));        // the reaction runs away as it goes
  const stag = Math.min(STAG, dt / 3);
  strands.filter(s => s.name[0] === 'H' && s.x0 === x0).forEach((s, k) => { s.t0 = T + k * stag; });
  T += dt;
});
T += ARRIVE + PAUSE + ZIP;   // the last ring still needs time to arrive and open
const TOTAL_GROW = T + 1.5;   // act one ends a moment after the last ring settles
// each hairpin flies in from outside along the outward direction of its landing site
strands.forEach((s, si) => {
  if (s.name[0] !== 'H') return;
  const c = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < NNT; i++) if (D.ntStrand[i] === si) { c.add(hov[i].p); n++; }
  c.divideScalar(n); s.out = new THREE.Vector3(0, c.y, c.z).normalize();
});

/* ---------- scene ---------- */
// preserveDrawingBuffer is left off: __seek reads the canvas straight after its own render, which works
// without it, and keeping the buffer costs a copy on every frame
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const BG = new THREE.Color('#091426');
scene.background = BG;
scene.add(new THREE.HemisphereLight('#cfe6f5', '#10243c', 0.85));
const sun = new THREE.DirectionalLight('#eaf6ff', 1.9); sun.position.set(-26, 42, 58); scene.add(sun);
const rim = new THREE.DirectionalLight('#5fb6d8', 1.2); rim.position.set(50, -14, -46); scene.add(rim);
const fill = new THREE.DirectionalLight('#9fb6cd', 0.3); fill.position.set(30, -20, -30); scene.add(fill);
const model = new THREE.Group(); scene.add(model);

/* The atoms are placed on the GPU. Every frame the CPU works out where each nucleotide is (five thousand of
   them) and hands that over as a small texture; the vertex shader then puts each of the hundred thousand
   atoms on its nucleotide, with the same sag and flex the bundle is given, so the arithmetic is the one
   that used to run in JavaScript, done where it costs nothing. */
const NT_W = 256, NT_H = Math.ceil(2 * NNT / NT_W);
const ntData = new Float32Array(NT_W * NT_H * 4);
const ntTex = new THREE.DataTexture(ntData, NT_W, NT_H, THREE.RGBAFormat, THREE.FloatType);
ntTex.magFilter = ntTex.minFilter = THREE.NearestFilter;
const AU = { uNt: { value: ntTex }, uBend: { value: 0 }, uWave: { value: 0 }, uWaveT: { value: 0 } };
// built when the shader is first compiled, by which time the bundle's axis and bend are known
const atomVS = () => `
attribute vec3 aLocal;
attribute float aNt;
uniform sampler2D uNt;
uniform float uBend, uWave, uWaveT, uR;
vec4 ntTexel(int k) { return texelFetch(uNt, ivec2(k % ${NT_W}, k / ${NT_W}), 0); }
vec3 atomAt() {
  int n = int(aNt + 0.5);
  vec4 q = ntTexel(2 * n), pn = ntTexel(2 * n + 1);
  vec3 t = 2.0 * cross(q.xyz, aLocal);
  vec3 p = aLocal + q.w * t + cross(q.xyz, t) + pn.xyz;
  float X = p.x - ${XMID.toFixed(6)};
  const vec3 FACE = vec3(${FACE_VEC.x.toFixed(8)}, ${FACE_VEC.y.toFixed(8)}, ${FACE_VEC.z.toFixed(8)});
  const vec3 SIDE = vec3(${SIDE_VEC.x.toFixed(8)}, ${SIDE_VEC.y.toFixed(8)}, ${SIDE_VEC.z.toFixed(8)});
  if (uBend > 0.0) p += FACE * (uBend * X * X / ${(2 * RBEND).toFixed(1)});
  if (uWave > 0.002) {
    float w = 6.283185307179586;
    p += FACE * (uWave * (0.75 * sin(w * X / 170.0 + 0.55 * uWaveT) + 0.3 * sin(w * X / 95.0 - 0.9 * uWaveT + 1.7)));
    p += SIDE * (uWave * 0.5 * sin(w * X / 140.0 - 0.7 * uWaveT + 2.4));
  }
  return p;
}
`;
function atomMaterial(r) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, AU, { uR: { value: r } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + atomVS())
      .replace('#include <begin_vertex>', `vec4 atomOn = ntTexel(2 * int(aNt + 0.5) + 1);
vec3 transformed = position * (atomOn.w > 0.5 ? uR : 0.0) + atomAt();`);
  };
  m.customProgramCacheKey = () => 'atom';
  return m;
}
/* How finely an atom's sphere is cut follows how large it is on screen: the full 16 x 10 while it is big
   enough for the facets to show, fewer once it is only a few pixels across, where a finer sphere draws the
   same disc. [segments around, segments down, smallest on-screen radius in device pixels] */
const ATOM_LOD = [[16, 10, 9], [11, 7, 4.5], [8, 5, 0]];
function pickLOD() {
  const px = renderer.domElement.height / (cam.top - cam.bottom);   // device pixels per nm
  for (const { mesh, r } of meshes) {
    const rp = r * px, k = ATOM_LOD.findIndex(l => rp >= l[2]);
    mesh.geometry = mesh.userData.lods[k];
  }
}
function draw() { pickLOD(); renderer.render(scene, cam); }
const white = new THREE.Color('#f2f6fb');   // what a base is tinted towards
const meshes = [];
for (const el of 'CNOP') {
  const idx = [];
  for (let i = 0; i < NAT; i++) if (D.el[i] === el) idx.push(i);
  const loc = new Float32Array(3 * idx.length), nts = new Float32Array(idx.length);
  idx.forEach((ai, j) => { loc.set([LOCAL[3 * ai], LOCAL[3 * ai + 1], LOCAL[3 * ai + 2]], 3 * j); nts[j] = D.atomNt[ai]; });
  const aLoc = new THREE.InstancedBufferAttribute(loc, 3), aNt = new THREE.InstancedBufferAttribute(nts, 1);
  const lods = ATOM_LOD.map(([ws, hs]) => {
    const geo = new THREE.SphereGeometry(1, ws, hs);
    geo.setAttribute('aLocal', aLoc); geo.setAttribute('aNt', aNt);
    return geo;
  });
  const mesh = new THREE.InstancedMesh(lods[0], atomMaterial(VDW[el]), idx.length);
  mesh.userData.lods = lods;
  mesh.frustumCulled = false;
  idx.forEach((i, j) => {
    const c = new THREE.Color(colorOf(D.names[D.ntStrand[D.atomNt[i]]]));
    mesh.setColorAt(j, D.base[i] === '1' ? c.lerp(white, 0.28) : c);
  });
  meshes.push({ mesh, idx, r: VDW[el] });
  model.add(mesh);
}

// Cholesteryl-TEG on both ends of H1 and H4: rigid on its end nucleotide, turned outwards from the
// hairpin while it flies in and outwards from the tube once it has landed
const M = D.mods, MLOC = f32(M.local), MRF = M.relF, MRH = M.relH;
const CHOL = new THREE.Color('#d8b96f'), LINK = new THREE.Color('#46566c');   // a gold sterol on a slate linker (black read far too hard beside the pastel strands)
const relF = M.host.map((_, i) => pose(MRF, i)), relH = M.host.map((_, i) => pose(MRH, i));
const NMA = M.el.length;
const modMeshes = [];
for (const el of 'CNOP') {
  const idx = [];
  for (let i = 0; i < NMA; i++) if (M.el[i] === el) idx.push(i);
  if (!idx.length) continue;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }), idx.length * M.host.length);
  mesh.frustumCulled = false;
  M.host.forEach((_, m) => idx.forEach((i, j) => mesh.setColorAt(m * idx.length + j, M.kind[i] === 'c' ? CHOL : LINK)));
  modMeshes.push({ mesh, idx, r: VDW[el] });
  model.add(mesh);
}
const rq = new THREE.Quaternion(), rp = new THREE.Vector3();
function updateMods() {
  for (const { mesh, idx, r } of modMeshes) {
    const a = mesh.instanceMatrix.array;
    M.host.forEach((n, m) => {
      const w = ntW[n];
      rq.slerpQuaternions(relH[m].q, relF[m].q, w); rp.lerpVectors(relH[m].p, relF[m].p, w);
      idx.forEach((i, j) => {
        const si2 = D.ntStrand[n];
        const o = (m * idx.length + j) * 16, sc = (ntOn[n] && !(PRO_ON && PRO_SI.has(si2))) ? r : 0;
        v.set(MLOC[3 * i], MLOC[3 * i + 1], MLOC[3 * i + 2]).applyQuaternion(rq).add(rp).applyQuaternion(ntQ[n]).add(ntP[n]);
        if (INS > 0) v.addScaledVector(FACE_VEC, INS * INS_REACH * MOD_DOWN[m] * (M.kind[i] === 'c' ? 1 : 0.45));
        if (BEND > 0) v.addScaledVector(FACE_VEC, BEND * sagF(v.x));
        if (WAVE > 0.002) flexAt(v);
        a.fill(0, o, o + 16); a[o] = a[o + 5] = a[o + 10] = sc; a[o + 15] = 1;
        a[o + 12] = v.x; a[o + 13] = v.y; a[o + 14] = v.z;
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
}


/* ---------- act two: the finished bundle anchors to an EV and tears its membrane ----------
   The vesicle lives in its own group, turned so that its local +z (the side the bundle lies on) points to
   world +y, which is where the bundle is. Everything inside it is therefore written in the same frame as
   before: the bundle along local x, the contact strip at local +z.
   adhesion -> tension -> a pore at the contact line -> leakage -> the torn membrane curls into small vesicles. */
const smooth2 = (a, b, x) => smooth((x - a) / (b - a));
const ease = t => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
let rseed = 12345;
const rnd = () => { rseed = (rseed * 16807) % 2147483647; return (rseed - 1) / 2147483646; };

const R_OUT = 49.5, R_IN = 45.5, RM = (R_OUT + R_IN) / 2, HALF_T = (R_OUT - R_IN) / 2;   // head-bead centres, nm
const AREA = 0.65;   // nm^2 per lipid
const W_C = 5.0;     // half-width of the strip that sticks to the bundle (the six-helix tube is ~6.4 nm across)
// The membrane is only pressed in where the bundle actually touches it: a shallow groove the width of the
// tube, running the length of the contact.
/* The membrane does not just sag: it wraps the bundle, and the cross-section of that wrap is made of two
   circular arcs, not a smooth step - a step has a far sharper floor than a membrane can take. The inner arc
   has the bundle's own radius, so the membrane lies on it out to 60 degrees, which is where the next row of
   sterols sits; the outer arc brings the surface back up. The curvatures are then 1/(2*5.5) = 0.091 on the
   floor and 1/(2*7.5) = 0.067 on the shoulder, which is the range the colour scale is drawn for. */
const R_C = 5.5, TH1 = Math.PI / 3, R_S = 7.5;
const D_CORE = (R_C + R_S) * (1 - Math.cos(TH1));
const Y1 = R_C * Math.sin(TH1), Y2 = (R_C + R_S) * Math.sin(TH1);
const coreDepth = y => {
  if (y >= Y2) return 0;
  if (y <= Y1) return D_CORE - (R_C - Math.sqrt(Math.max(0, R_C * R_C - y * y)));
  const sf = Math.sin(TH1) - (y - Y1) / R_S, cf = Math.sqrt(Math.max(0, 1 - sf * sf));
  return D_CORE - R_C * (1 - Math.cos(TH1)) - R_S * (cf - Math.cos(TH1));
};
const W_OUT = 20.0, D_BASIN = 1.8;
const DIMPLE = D_CORE + D_BASIN;                // how far the bundle itself goes down with it
const L_IN = 16.0, L_OUT = 42.0;                // how far it reaches along the bundle once the membrane has spread
// The curvature shown on the membrane is drawn rather than measured. Deriving it from this surface gives a
// pattern that depends on how the surface was written rather than on the physics, so instead the field the
// membrane simulation produces is painted on directly: a trough along the contact itself, a band of high
// curvature just outside it on either side, fading away towards the ends of the bundle, and the vesicle's
// own curvature everywhere else. The pore then opens on that band, where the bending is worst.
const H_BASE = 0.021, H_PEAK = 0.0726, H_DIP = 0.021, Y_LOBE = 8.0, Y_SIG = 3.2;   // the peak sits on the shoulder of the wrap
const XMID = 0.5 * (() => { let mx = 0; for (let i = 0; i < NNT; i++) mx = Math.max(mx, fin[i].p.x); return mx; })();
const EVC = new THREE.Vector3(XMID, -(R_OUT + 12), 0);   // where the vesicle sits

function evFib(N, R) {
  const out = new Float32Array(3 * N), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const z = 1 - 2 * (i + 0.5) / N, r = Math.sqrt(1 - z * z), p = i * ga;
    const j = 0.35 / R;   // a little jitter so the packing does not look like a lattice
    let x = r * Math.cos(p) + (rnd() - .5) * j, y = r * Math.sin(p) + (rnd() - .5) * j, zz = z + (rnd() - .5) * j;
    const l = Math.hypot(x, y, zz); out.set([x / l, y / l, zz / l], 3 * i);
  }
  return out;
}
const NO = Math.round(4 * Math.PI * R_OUT * R_OUT / AREA), NI = Math.round(4 * Math.PI * R_IN * R_IN / AREA), NL = NO + NI;
const LDIR = new Float32Array(3 * NL); LDIR.set(evFib(NO, R_OUT), 0); LDIR.set(evFib(NI, R_IN), 3 * NO);

// e = stretch along the bundle (volume kept), Lc = half-length of the zipped contact, kc = how flat it lies,
// def = deflation after the leak, U = ripple amplitude
const EVSH = { e: 0, Lc: 0, kc: 0, def: 0, U: 0.6, t: 0, la: 8, lb: 20 };   // la,lb: how far the trough reaches along the bundle
function evS(out, x, y, z) {
  const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
  const s = 1 / Math.sqrt(1 + EVSH.e);
  const ax = RM * (1 + EVSH.e) * (1 + 0.12 * EVSH.def), by = RM * s * (1 - 0.3 * EVSH.def), cz = RM * s * (1 - 0.3 * EVSH.def);
  let X = ax * x, Yv = by * y, Z = cz * z + (RM - cz);   // the top stays on the bundle
  if (EVSH.def > 0 && z > 0) Z += EVSH.def * 0.35 * (RM - Z) * Math.exp(-((Yv / 24) ** 2)) * (1 - smooth2(EVSH.Lc, EVSH.Lc + 15, Math.abs(X)));
  const along = z > 0 ? (1 - smooth2(EVSH.la, EVSH.lb, Math.abs(X))) : 0;
  const basin = (1 - smooth2(0, W_OUT, Math.abs(Yv))) * along;
  const strip = basin;
  const dip = EVSH.kc * (coreDepth(Math.abs(Yv)) * along + D_BASIN * basin);
  X -= dip * x; Yv -= dip * y; Z -= dip * z;
  if (EVSH.U > 0) {   // thermal ripples, pinned where the membrane is stuck to the bundle
    const th = Math.acos(clamp(z, -1, 1)), ph = Math.atan2(y, x), tt = EVSH.t;
    const u = EVSH.U * (1 - strip) * (0.5 * Math.sin(3 * ph + 1.1 * tt) * Math.sin(th) + 0.45 * Math.sin(4 * th + 0.8 * tt + 1)
      + 0.35 * Math.sin(5 * ph - 1.3 * tt + 2) * Math.sin(2 * th) + 0.25 * Math.sin(7 * ph + 2 * th + 1.7 * tt));
    X += u * x; Yv += u * y; Z += u * z;
  }
  out[0] = X; out[1] = Yv; out[2] = Z;
  return out;
}
const EF1 = [0, 0, 0], EF2 = [0, 0, 0], EPa = [0, 0, 0], EPb = [0, 0, 0];
// the curvature as the simulation shows it, at a point given by its direction on the undeformed vesicle
function paintedH(x, y, z) {
  if (z <= 0) return H_BASE;
  const X = RM * x, Y = RM * y;
  // the colours reach exactly as far along the bundle as the trough does
  const along = (1 - smooth2(EVSH.la, EVSH.lb, Math.abs(X))) * smooth2(0, 0.25, z);
  const lobe = Math.exp(-(((Math.abs(Y) - Y_LOBE) / Y_SIG) ** 2));
  const under = Math.exp(-((Y / (Y_LOBE * 0.6)) ** 2));
  return H_BASE + EVSH.kc * along * ((H_PEAK - H_BASE) * lobe - (H_BASE - H_DIP) * under);
}
// The membrane carries this colouring the whole way through, so nothing about it changes when the film
// stops - the stop only brings up the scale. The range is that of the simulation figures, 0.02 to 0.08 1/nm
// with rupture at 0.067, in this film's colours: an undeformed vesicle keeps the slate blue it has had all
// along, and the colour runs warm and then red where the bending is worst.
const H_LO = 0.02, H_HI = 0.08, H_THR = 0.067;
const RAMP = [[0, 0x8e, 0x9a, 0xb2], [0.35, 0xbd, 0xb9, 0xa8], [0.6, 0xe3, 0xa7, 0x63], [0.8, 0xdd, 0x60, 0x38], [1, 0xa3, 0x1d, 0x18]];
function ramp(t) {
  t = clamp(t, 0, 1);
  let k = 0;
  while (k < RAMP.length - 2 && t > RAMP[k + 1][0]) k++;
  const A = RAMP[k], B = RAMP[k + 1], f = (t - A[0]) / (B[0] - A[0]);
  return [1, 2, 3].map(c => (A[c] + (B[c] - A[c]) * f) / 255);
}
const etframe = (x, y, z, e1, e2) => {
  const a = Math.abs(z) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let ex = y * a[2] - z * a[1], ey = z * a[0] - x * a[2], ez = x * a[1] - y * a[0]; const l = Math.hypot(ex, ey, ez);
  e1[0] = ex / l; e1[1] = ey / l; e1[2] = ez / l;
  e2[0] = y * e1[2] - z * e1[1]; e2[1] = z * e1[0] - x * e1[2]; e2[2] = x * e1[1] - y * e1[0];
};
function evSurf(x, y, z, pos, nrm) {
  evS(pos, x, y, z);
  evNormal(x, y, z, pos, nrm);
}
// the normal at a point whose position (pos) has already been worked out
function evNormal(x, y, z, pos, nrm) {
  const h = 0.01;
  etframe(x, y, z, EF1, EF2);
  evS(EPa, x + h * EF1[0], y + h * EF1[1], z + h * EF1[2]);
  evS(EPb, x + h * EF2[0], y + h * EF2[1], z + h * EF2[2]);
  const ux = EPa[0] - pos[0], uy = EPa[1] - pos[1], uz = EPa[2] - pos[2], vx = EPb[0] - pos[0], vy = EPb[1] - pos[1], vz = EPb[2] - pos[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) * (nx * x + ny * y + nz * z < 0 ? -1 : 1);
  nrm[0] = nx / l; nrm[1] = ny / l; nrm[2] = nz / l;
}

/* ---------- act two's clock ---------- */
const A2 = TOTAL_GROW;                       // the bundle is finished
const T_TURN = [0, 2.8], T_APPROACH = [0, 6.5], T_INSERT = [7.0, 9.5], T_SPREAD = [9.5, 18.5], T_RUP = 19.2;
const PRO = 11.8;   // the prologue: the blocker comes off before anything else happens
const ANIM_END = PRO + A2 + T_RUP + 2.2;   // the action ends once the pore has opened

/* ---------- captions ----------
   The film is for the Approach section of the wiki, so it stops whenever something new is on screen and names
   it. Names only; a caption may point at several things at once, and the parts of an anchor are named a beat
   after the hairpin itself so the eye has somewhere to go. The clock holds still while a stop is up. */
const STOPS = [
  { a: 1.4, dur: 3.0, items: [
    { t: 'Seed', ats: () => [onBundle(7)], dir: [-0.4, -1], noLead: true },
    { t: 'Blocker', ats: () => [blockerAnchor()], dir: [0.9, -0.6] },
  ] },
  { a: 4.6, dur: 2.6, items: [{ t: 'Trigger', ats: () => [triggerAnchor()], dir: [1, 0.5], noLead: true }] },
  { a: PRO + 5.6, dur: 3.0, items: [{ t: 'Double-Hairpin DNAs', ats: () => onFlying(3), dir: [0.2, -1] }] },
  // once the first ring has hybridised, its anchors are in plain sight
  { a: PRO + 10.4, dur: 3.4, items: [
    { t: 'TEG linker', ats: () => [onMod('l')], dir: [-1, -0.4] },
    { t: 'Cholesterol', ats: () => [onMod('c')], dir: [1, -0.5] },
  ] },
  { a: PRO + A2 - 1.2, dur: 2.6, items: [{ t: 'DNA bundle', ats: () => [onBundle(XMID)], dir: [0, -1], noLead: true }] },
  { a: PRO + A2 + 4.6, dur: 2.4, items: [{ t: 'Lipid membrane', ats: () => [onEV(-0.55, -0.5, 0.67)], dir: [-1, 0.25] }] },
  // and once it has gone in, what is holding the bundle there
  { a: PRO + A2 + 10.2, dur: 2.8, items: [{ t: 'Cholesterol anchoring', ats: () => [onModIn()], dir: [-1, 0.6] }] },
];
let PSUM = 0;
for (const p of STOPS) { p.t0 = p.a + PSUM; PSUM += p.dur; }
// a name that simply sits in the corner while something is going on, rather than stopping the film for it
const BANNERS = [
  { t: 'Bundled HCR', a0: SEED_HOLD, a1: A2 - 1.2, fi: 1.1, fo: 0.9 },   // for as long as the hairpins keep coming
];
const bannerFade = (b, a) => Math.min(smooth((a - b.a0) / b.fi), 1 - smooth((a - (b.a1 - b.fo)) / b.fo));
// real time -> animation clock, holding still through each stop
function animTime(T) {
  let a = T, hold = null;
  for (const p of STOPS) {
    if (T < p.t0) break;
    if (T < p.t0 + p.dur) { a = p.a; hold = p; break; }
    a = T - (p.t0 + p.dur) + p.a;
  }
  return { a, hold };
}
const TOTAL = ANIM_END + PSUM;
const evTension = te => te < T_RUP ? smooth((te - 11) / 7.5) : 1 - smooth((te - T_RUP) / 1.2);

// the pore: on the contact line beside the bundle, on the side facing us; ragged, elongated along the bundle
// on the band of highest curvature, on the side facing us (the group is turned a quarter turn)
const PC = (() => { const y = -Y_LOBE / RM; return [0, y, Math.sqrt(1 - y * y)]; })();
const PX = [1, 0, 0], PY = [PC[1] * PX[2] - PC[2] * PX[1], PC[2] * PX[0] - PC[0] * PX[2], PC[0] * PX[1] - PC[1] * PX[0]];
const PORE = { along: 26, across: 8.5 };
const poreSize = tp => tp <= 0 ? 0 : (1 - Math.exp(-tp / 0.35)) * (1 - 0.4 * smooth((tp - 1.2) / 4));

/* ---------- break-up: the torn bilayer comes apart, and each piece curls and seals into a small vesicle ---------- */
const NP = 16, STRIP = NP;
const pseeds = Float32Array.from({ length: 3 * NP }, () => rnd() * 2 - 1);
const PK = new Int16Array(NL), RHO = new Float32Array(NL), BETA = new Float32Array(NL), UU = new Float32Array(NL);
const PAT = Array.from({ length: NP + 1 }, () => ({ c: [0, 0, 0], n: 0, no: 0 }));
for (let i = 0; i < NL; i++) {
  const x = LDIR[3 * i], y = LDIR[3 * i + 1], z = LDIR[3 * i + 2];
  let k = 0, best = -2;
  for (let j = 0; j < NP; j++) {
    const sx = pseeds[3 * j], sy = pseeds[3 * j + 1], sz = pseeds[3 * j + 2], l = Math.hypot(sx, sy, sz);
    const d = (x * sx + y * sy + z * sz) / l;
    if (d > best) { best = d; k = j; }
  }
  if (z > 0 && Math.abs(RM * y) < W_C + 1.5 && Math.abs(RM * x) < 44) k = STRIP;   // this strip stays on the bundle
  PK[i] = k; const P = PAT[k]; P.c[0] += x; P.c[1] += y; P.c[2] += z; P.n++; if (i < NO) P.no++;
}
const NB = 36;
PAT.forEach(P => {
  const l = Math.hypot(...P.c); P.c = P.c.map(v2 => v2 / l);
  const a = Math.abs(P.c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let t1 = [P.c[1] * a[2] - P.c[2] * a[1], P.c[2] * a[0] - P.c[0] * a[2], P.c[0] * a[1] - P.c[1] * a[0]];
  const lt = Math.hypot(...t1); t1 = t1.map(v2 => v2 / lt);
  P.t1 = t1; P.t2 = [P.c[1] * t1[2] - P.c[2] * t1[1], P.c[2] * t1[0] - P.c[0] * t1[2], P.c[0] * t1[1] - P.c[1] * t1[0]];
  P.r = Math.sqrt(P.no * AREA / (4 * Math.PI)) * RM / R_OUT;   // the small vesicle it seals into
  P.edge = new Float32Array(NB);
  const dp = Math.acos(clamp(P.c[0] * PC[0] + P.c[1] * PC[1] + P.c[2] * PC[2], -1, 1)) * RM;
  P.tb = T_RUP + 0.6 + dp / 40 + 0.3 * rnd();   // the cracks run out from the pore at about 40 nm/s
  P.curl = 1.8 + 1.2 * rnd();
  const out = new THREE.Vector3(P.c[0], P.c[1], P.c[2] - 0.35).normalize();
  P.dir = out.add(new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(0.5)).normalize();
  P.speed = 10 + 8 * rnd();
  P.axis = new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize();
  P.spin = (rnd() - .5) * 1.4;
});
for (let i = 0; i < NL; i++) {
  const P = PAT[PK[i]], x = LDIR[3 * i], y = LDIR[3 * i + 1], z = LDIR[3 * i + 2];
  RHO[i] = Math.acos(clamp(x * P.c[0] + y * P.c[1] + z * P.c[2], -1, 1)) * RM;
  BETA[i] = Math.atan2(x * P.t2[0] + y * P.t2[1] + z * P.t2[2], x * P.t1[0] + y * P.t1[1] + z * P.t1[2]);
  const b = Math.floor((BETA[i] + Math.PI) / (2 * Math.PI) * NB) % NB;
  P.edge[b] = Math.max(P.edge[b], RHO[i]);
}
PAT.forEach(P => {
  const e = Float32Array.from(P.edge, (_, b) => Math.max(P.edge[(b + NB - 1) % NB], P.edge[b], P.edge[(b + 1) % NB]));
  P.edge = e.map(v2 => v2 || 1);
});
for (let i = 0; i < NL; i++) {
  const P = PAT[PK[i]], b = Math.floor((BETA[i] + Math.PI) / (2 * Math.PI) * NB) % NB;
  UU[i] = Math.min(1, RHO[i] / P.edge[b]);
}
const PQ = new THREE.Quaternion(), PV = new THREE.Vector3(), PN = new THREE.Vector3(), POLE = [0, 0, 0], PNRM = [0, 0, 0];
function patchLipid(i, tau, out, nrm) {
  const P = PAT[PK[i]], m = smooth(tau / P.curl);
  const R = 1 / lerp(1 / RM, 1 / P.r, m);
  const rho = lerp(RHO[i], UU[i] * 2 * P.r, m);   // area-keeping: the rim reaches the far pole when sealed
  const th = Math.acos(clamp(1 - rho * rho / (2 * R * R), -1, 1)), cb = Math.cos(BETA[i]), sb = Math.sin(BETA[i]);
  const s = i < NO ? 1 : -1;
  let lx = R * Math.sin(th) * cb, ly = R * Math.sin(th) * sb, lz = -R * (1 - Math.cos(th));
  let ox = s * Math.sin(th) * cb, oy = s * Math.sin(th) * sb, oz = s * Math.cos(th);
  const e = (1 - UU[i]) * rho / Math.max(UU[i], 1e-3);
  if (e < HALF_T && m < 0.98) {   // the open edge: the leaflets turn round and meet until the piece has sealed
    const ph = (1 - e / HALF_T) * Math.PI / 2 * (1 - m), tx = Math.cos(th) * cb, ty = Math.cos(th) * sb, tz = -Math.sin(th);
    ox = ox * Math.cos(ph) + tx * Math.sin(ph); oy = oy * Math.cos(ph) + ty * Math.sin(ph); oz = oz * Math.cos(ph) + tz * Math.sin(ph);
  }
  lx += HALF_T * ox; ly += HALF_T * oy; lz += HALF_T * oz;
  evSurf(P.c[0], P.c[1], P.c[2], POLE, PNRM);
  PQ.setFromAxisAngle(P.axis, P.spin * tau);
  const f = (vv, a, b, c) => vv.set(a * P.t1[0] + b * P.t2[0] + c * P.c[0], a * P.t1[1] + b * P.t2[1] + c * P.c[1], a * P.t1[2] + b * P.t2[2] + c * P.c[2]).applyQuaternion(PQ);
  f(PV, lx, ly, lz); f(PN, ox, oy, oz);
  const travel = P.speed * 2.2 * (1 - Math.exp(-tau / 2.2));
  out.set(POLE[0] + PV.x, POLE[1] + PV.y, POLE[2] + PV.z).addScaledVector(P.dir, travel);
  nrm.copy(PN).normalize();
}
const fragPos = new THREE.Vector3(), fragNrm = new THREE.Vector3();
const BREAK_UP = false;   // the source film can carry on past the pore and curl the pieces into small vesicles; the cover stops before that, and its GPU-posed lipids do not do it

/* ---------- the vesicle's lipids ---------- */
const evGroup = new THREE.Group();
evGroup.rotation.x = -Math.PI / 2;   // its local +z, the side the bundle lies on, points to world +y
evGroup.position.copy(EVC);
scene.add(evGroup);
const HEAD_COL = new THREE.Color('#5d7390'), TAIL_COL = new THREE.Color('#3a4d65');   // slate-blue heads, pale periwinkle tails
const HEAD_IN = new THREE.Color('#78839b');
/* The lipids are posed on the GPU as well: each carries its direction on the undeformed vesicle, and the
   vertex shader runs the same surface (stretch, trough, deflation), the same opening (its area-keeping
   retraction and ragged rim) and the same turn of the leaflets at the rim that used to run here for each of
   them, three surface evaluations apiece. All the CPU does is hand over the handful of numbers that shape
   the membrane this frame. */
const LU = { uE: { value: 0 }, uLc: { value: 0 }, uKc: { value: 0 }, uDef: { value: 0 }, uLa: { value: 8 }, uLb: { value: 20 },
  uG: { value: 0 }, uPa: { value: 0.4 }, uPb: { value: 0.2 } };
const glf = x => Number(x).toFixed(8);
const glv = a => `vec3(${glf(a[0])}, ${glf(a[1])}, ${glf(a[2])})`;
const lipidLib = () => `
uniform float uE, uLc, uKc, uDef, uLa, uLb, uG, uPa, uPb;
const float RM_ = ${glf(RM)}, HT_ = ${glf(HALF_T)}, W_OUT_ = ${glf(W_OUT)}, D_BASIN_ = ${glf(D_BASIN)};
const float R_C_ = ${glf(R_C)}, R_S_ = ${glf(R_S)}, TH1_ = ${glf(TH1)}, D_CORE_ = ${glf(D_CORE)}, Y1_ = ${glf(Y1)}, Y2_ = ${glf(Y2)};
const vec3 PC_ = ${glv(PC)}, PX_ = ${glv(PX)}, PY_ = ${glv(PY)};
float lsm(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float lsm2(float a, float b, float x) { return lsm((x - a) / (b - a)); }
float coreDepthG(float y) {
  if (y >= Y2_) return 0.0;
  if (y <= Y1_) return D_CORE_ - (R_C_ - sqrt(max(0.0, R_C_ * R_C_ - y * y)));
  float sf = sin(TH1_) - (y - Y1_) / R_S_, cf = sqrt(max(0.0, 1.0 - sf * sf));
  return D_CORE_ - R_C_ * (1.0 - cos(TH1_)) - R_S_ * (cf - cos(TH1_));
}
vec3 evSG(vec3 d) {
  d = normalize(d);
  float s = 1.0 / sqrt(1.0 + uE);
  float ax = RM_ * (1.0 + uE) * (1.0 + 0.12 * uDef), by = RM_ * s * (1.0 - 0.3 * uDef), cz = by;
  float X = ax * d.x, Y = by * d.y, Z = cz * d.z + (RM_ - cz);
  if (uDef > 0.0 && d.z > 0.0) Z += uDef * 0.35 * (RM_ - Z) * exp(-((Y / 24.0) * (Y / 24.0))) * (1.0 - lsm2(uLc, uLc + 15.0, abs(X)));
  float along = d.z > 0.0 ? (1.0 - lsm2(uLa, uLb, abs(X))) : 0.0;
  float basin = (1.0 - lsm2(0.0, W_OUT_, abs(Y))) * along;
  float dip = uKc * (coreDepthG(abs(Y)) * along + D_BASIN_ * basin);
  return vec3(X, Y, Z) - dip * d;
}
vec3 qrot(vec4 q, vec3 v) { vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
vec3 lipidPos; vec4 lipidQ;
void poseLipidAt(vec3 dir0, int id) {
  vec3 d = dir0, w = vec3(0.0);
  float rim = -1.0, cd = dot(d, PC_);
  if (uG > 0.0 && cd > 0.1) {
    float dx = RM_ * dot(d, PX_), dy = RM_ * dot(d, PY_);
    if (length(vec2(dx, dy)) < 1e-3) { float fi = float(id); dx = 1e-3 * cos(fi); dy = 1e-3 * sin(fi); }
    float psi = atan(dy / uPb, dx / uPa);
    float rag = 1.0 + 0.22 * sin(3.0 * psi + 1.0) + 0.12 * sin(5.0 * psi + 2.3) + 0.06 * sin(11.0 * psi);
    float rho = length(vec2(dx / uPa, dy / uPb)) / rag, per = length(vec2(dx, dy)) / rho;
    float fade = lsm2(0.1, 0.6, cd), k = mix(1.0, sqrt(rho * rho + 1.0) / rho, fade);
    float ddx = dx * (k - 1.0), ddy = dy * (k - 1.0);
    d = normalize(d + (ddx * PX_ + ddy * PY_) / RM_);
    float e = (sqrt(rho * rho + 1.0) - 1.0) * per;
    if (fade > 0.99 && e < HT_) { rim = e; w = normalize(-(dx * PX_ + dy * PY_)); }
  }
  vec3 pos = evSG(d);
  // the normal, from two nearby points on the surface, as on the CPU
  vec3 a = abs(d.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(d, a)), e2 = cross(d, e1);
  vec3 n = cross(evSG(d + 0.01 * e1) - pos, evSG(d + 0.01 * e2) - pos);
  n = normalize(n) * (dot(n, d) < 0.0 ? -1.0 : 1.0);
  vec3 o = (id < ${NO} ? 1.0 : -1.0) * n;
  if (rim >= 0.0) { float ph = (1.0 - rim / HT_) * 1.5707963267948966; o = o * cos(ph) + w * sin(ph); }
  lipidPos = pos + HT_ * o;
  vec3 nv = normalize(o);
  float r = nv.y + 1.0;
  lipidQ = r < 1e-7 ? vec4(0.0, 0.0, 1.0, 0.0) : normalize(vec4(nv.z, 0.0, -nv.x, r));
}
`;
/* Each lipid's pose depends only on the lipid, not on the vertex, so it is worked out once per lipid per
   frame, in a pass of its own that writes position and turn into a float texture (two texels a lipid);
   the meshes then just read it. Where float render targets are not available the meshes work the pose out
   themselves, vertex by vertex - the same result, only slower. */
const POSE_W = 512, POSE_H = Math.ceil(NL / POSE_W);
const poseOK = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
const poseRT = poseOK ? new THREE.WebGLRenderTarget(2 * POSE_W, POSE_H,
  { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }) : null;
const dirData = new Float32Array(POSE_W * POSE_H * 4);
for (let i = 0; i < NL; i++) dirData.set([LDIR[3 * i], LDIR[3 * i + 1], LDIR[3 * i + 2], 0], 4 * i);
const dirTex = new THREE.DataTexture(dirData, POSE_W, POSE_H, THREE.RGBAFormat, THREE.FloatType);
dirTex.needsUpdate = true;
const poseCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), poseScene = new THREE.Scene();
if (poseOK) poseScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: Object.assign({ uDir: { value: dirTex } }, LU),
  vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',   // replaced on first use, once its constants exist
})));
let poseReady = false;
function poseLipids() {               // the per-frame pass; called from updateEV
  if (!poseOK) return;
  if (!poseReady) {
    const m = poseScene.children[0].material;
    m.fragmentShader = `precision highp float;\nuniform sampler2D uDir;\n${lipidLib()}
void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int id = px.y * ${POSE_W} + px.x / 2;
  if (id >= ${NL}) { gl_FragColor = vec4(0.0); return; }
  poseLipidAt(texelFetch(uDir, ivec2(id % ${POSE_W}, id / ${POSE_W}), 0).xyz, id);
  gl_FragColor = (px.x % 2 == 0) ? vec4(lipidPos, 1.0) : lipidQ;
}`;
    m.needsUpdate = true; poseReady = true;
  }
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(poseRT);
  renderer.render(poseScene, poseCam);
  renderer.setRenderTarget(prev);
}
function lipidMaterial(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, LU, { uPose: { value: poseRT && poseRT.texture } });
    const pose = poseOK
      ? `uniform sampler2D uPose;
void poseLipid() {
  int id = gl_InstanceID;
  ivec2 c = ivec2(2 * (id % ${POSE_W}), id / ${POSE_W});
  lipidPos = texelFetch(uPose, c, 0).xyz; lipidQ = texelFetch(uPose, c + ivec2(1, 0), 0);
}`
      : 'attribute vec3 aDir;\nvoid poseLipid() { poseLipidAt(aDir, gl_InstanceID); }';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + lipidLib() + pose)
      .replace('#include <beginnormal_vertex>', 'poseLipid();\nvec3 objectNormal = qrot(lipidQ, normal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = qrot(lipidQ, position) + lipidPos;');
  };
  m.customProgramCacheKey = () => 'lipid';
  return m;
}
const aDir = new THREE.InstancedBufferAttribute(LDIR, 3);
const headGeo = new THREE.SphereGeometry(0.45, 10, 7); headGeo.setAttribute('aDir', aDir);
const heads = new THREE.InstancedMesh(headGeo, lipidMaterial({ roughness: 0.6 }), NL);
const tailGeo = mergeGeometries([-0.2, 0.2].map(dx => new THREE.CylinderGeometry(0.17, 0.12, 1.6, 6, 1).translate(dx, -1.25, 0)));
tailGeo.setAttribute('aDir', aDir);
const tails = new THREE.InstancedMesh(tailGeo, lipidMaterial({ roughness: 0.7, color: TAIL_COL }), NL);
heads.frustumCulled = tails.frustumCulled = false;
for (let i = 0; i < NL; i++) heads.setColorAt(i, i < NO ? HEAD_COL : HEAD_IN);
evGroup.add(heads, tails);
/* Inside the vesicle, a ball the colour of the page. It is never seen until the membrane is torn open,
   and then it is what the hole looks through to - which is the page itself, as far as the eye can tell.
   It is kept well clear of the wall so the dimple the bundle presses in never reaches it. */
const inside = new THREE.Mesh(new THREE.SphereGeometry(R_IN - 11, 48, 32),
  new THREE.MeshBasicMaterial({ color: 0x071120 }));
inside.renderOrder = -1;   // drawn first, so that once it stops painting it still hides the far wall
evGroup.add(inside);

/* ---------- where the bundle goes in act two ----------
   The cholesterols all come out on one face: find it, turn that face down towards the vesicle, and work out
   how far down the bundle has to sit for their tips to reach into the outer leaflet. */
let CH_FACE = 0, CH_TIP = 0;
{
  // the face is where the sterols actually sit, not where their linkers are rooted
  const p = new THREE.Vector3(), c = new THREE.Vector2(), xax = new THREE.Vector3(1, 0, 0);
  let rmax = 0;
  const each = fn => M.host.forEach((n, mi) => {
    for (let i = 0; i < NMA; i++) {
      if (M.kind[i] !== 'c') continue;
      p.set(MLOC[3 * i], MLOC[3 * i + 1], MLOC[3 * i + 2]).applyQuaternion(relF[mi].q).add(relF[mi].p)
        .applyQuaternion(fin[n].q).add(fin[n].p);
      fn(p);
    }
  });
  each(q => { const r = Math.hypot(q.y, q.z), ang = Math.atan2(q.z, q.y); rmax = Math.max(rmax, r); c.x += r * Math.cos(ang); c.y += r * Math.sin(ang); });
  CH_FACE = Math.atan2(c.y, c.x);
  const down = Math.PI - CH_FACE;   // the turn that puts the sterol face at -y
  each(q => { CH_TIP = Math.min(CH_TIP, q.clone().applyAxisAngle(xax, down).y); });
  console.log(`cholesterol face ${(CH_FACE * 180 / Math.PI).toFixed(0)} deg, sterols reach ${rmax.toFixed(2)} nm, lowest ${CH_TIP.toFixed(2)} nm`);
}
// the lowest DNA atom on that face, so the tube itself never pushes into the lipid heads
let DNA_LOW = 0;
{
  const p = new THREE.Vector3(), xax = new THREE.Vector3(1, 0, 0), down = Math.PI - CH_FACE;
  for (let a2 = 0; a2 < NAT; a2 += 5) {
    p.set(LOCAL[3 * a2], LOCAL[3 * a2 + 1], LOCAL[3 * a2 + 2]).applyQuaternion(fin[D.atomNt[a2]].q).add(fin[D.atomNt[a2]].p).applyAxisAngle(xax, down);
    DNA_LOW = Math.min(DNA_LOW, p.y);
  }
  console.log(`lowest DNA atom ${DNA_LOW.toFixed(2)} nm below the axis`);
}
const FACE_DOWN = Math.PI - CH_FACE;                    // turn that face to -y, where the vesicle is
// deep enough for the sterols to reach the leaflet, but never so deep that the DNA touches the heads
const Z_STUCK = Math.max(R_OUT - 1.6 - CH_TIP, R_OUT + 1.8 - DNA_LOW);
const INS_REACH = Math.max(0, (Z_STUCK + CH_TIP) - (R_OUT - 1.6));   // how much further the flexible TEG must stretch
const BUNDLE_Y = EVC.y + Z_STUCK;
/* ---------- how the bundle bends ----------
   It follows the membrane's own profile along the contact, which is what keeps it lying on the surface instead
   of cutting into it, but it can never bend more sharply than a stiff tube would: beyond the vesicle it runs
   off on the gentle curve of hcr-ev-rupture-3d.html. The sag is the smaller of the two. */
const FACE_VEC = new THREE.Vector3(0, Math.cos(CH_FACE), Math.sin(CH_FACE));   // from the axis towards the membrane
// with anchors all round the tube, only those pointing at the membrane reach into it
const MOD_DOWN = Float32Array.from(M.host, (n, mi) => {
  const q = relF[mi].p.clone().applyQuaternion(fin[n].q).add(fin[n].p);
  return clamp(new THREE.Vector3(0, q.y, q.z).normalize().dot(FACE_VEC), 0, 1);
});
// One parabola over the whole length: a gentle U with the same curvature everywhere, so there is no point
// where the curve kinks. It follows the membrane as closely as it can without reaching the lipid heads: at
// 40 nm out the bundle has dropped 2.4 nm while the flattened membrane under it has dropped 1.2 nm, and by
// the ends, which overhang the vesicle, it has come down 9 nm.
/* A six-helix bundle costs about 0.3 kT per nm to bend to the vesicle's curvature and the sterols give back
   several kT per nm, so where it is stuck down it follows the vesicle, and where it is not it runs straight
   on from there. RBEND is the vesicle's own radius of curvature at the apex plus the bundle; LWRAP is how
   far the sterols hold it. */
/* One plain arc over the whole bundle and nothing else - no joins, no corrections, so there is nothing that
   can kink. The radius is as tight as it can be while the bundle still stays inside the trough all the way
   to where the trough ends: any tighter and the ends would be left buried in the membrane. */
const RBEND = 170;
const sagF = x => { const X = x - XMID; return X * X / (2 * RBEND); };
let SINK = 0;   // how far the bundle has settled into the trough

// A finished bundle is stiff but not a rod: a six-helix bundle of this length has a persistence length of
// about a micrometre, so thermal bending leaves it a nanometre or so out of true, slowly drifting. It shows
// from the moment it is complete until the membrane pins it down.
const SIDE_VEC = new THREE.Vector3(1, 0, 0).cross(FACE_VEC).normalize();
let WAVE = 0, WAVE_T = 0;
function flexAt(v) {
  const X = v.x - XMID, w = 2 * Math.PI;
  v.addScaledVector(FACE_VEC, WAVE * (0.75 * Math.sin(w * X / 170 + 0.55 * WAVE_T) + 0.3 * Math.sin(w * X / 95 - 0.9 * WAVE_T + 1.7)));
  v.addScaledVector(SIDE_VEC, WAVE * 0.5 * Math.sin(w * X / 140 - 0.7 * WAVE_T + 2.4));
}
let BEND = 0, INS = 0;   // the bundle's sag onto the membrane, and how far the TEG linkers have stretched in

/* ---------- state at time t ---------- */
const ntQ = Array.from({ length: NNT }, () => new THREE.Quaternion()), ntP = Array.from({ length: NNT }, () => new THREE.Vector3());
const ntOn = new Uint8Array(NNT), ntW = new Float32Array(NNT);
const C = Array.from({ length: NNT }, () => new THREE.Vector3());
const strandRange = D.names.map(() => [Infinity, -1]);
D.ntStrand.forEach((si, i) => { strandRange[si][0] = Math.min(strandRange[si][0], i); strandRange[si][1] = i + 1; });

/* ---------- the prologue: a blocker caps the seed until a trigger takes it off ----------
   The seed's free ends are covered by a long blocker strand wound over the growing end, so no hairpin can
   bind there. A trigger strand comes in, pairs with the blocker from its free end, and the two leave
   together, uncovering the seed. The design is not settled yet, so this is drawn as the sketch has it: one
   long lid, one trigger, taken off end first.
   The two strands are borrowed from the last ring of the bundle, which is not on screen for another minute;
   they are given their own colours so they read as something apart from the bundle. */
const N0 = strands.length;
const BLS = [N0 - 1, N0 - 2];      // the lid: two strands' worth of atoms
const TRS = [N0 - 3, N0 - 4];      // the trigger, complementary to the whole lid
const PRO_SI = new Set([...BLS, ...TRS]);
const COLS = [];   // no prologue on the cover, so the borrowed strands stay part of the bundle
for (const { mesh, idx } of meshes) {
  idx.forEach((ai, j) => {
    const si = D.ntStrand[D.atomNt[ai]];
    for (const [list, hex] of COLS) if (list.includes(si)) mesh.setColorAt(j, new THREE.Color(hex));
  });
  mesh.instanceColor.needsUpdate = true;
}
// the first and last base of a borrowed strand are chain ends, missing a phosphate, so their atoms sit
// off-centre; skipping them keeps the join between two borrowed strands invisible
const slotsOf = list => { const a = []; for (const si of list) { const [x, y] = strandRange[si]; for (let i = x + 1; i < y - 1; i++) a.push(i); } return a; };
const BSLOT = slotsOf(BLS), TSLOT = slotsOf(TRS);

/* The blocker has to cover every free arm of the seed, or it blocks nothing. The seed's six helices all run
   on past the point where S1/S3/S5 stop, so there are six single-stranded arms at the growing end, and the
   first ring of hairpins takes two each. So the lid is built from the six stretches of that ring which lie
   on the seed - read straight out of the finished tube, so they sit exactly on the arms - walked one after
   another with a short crossover between, the way a real strand would hop from helix to helix. */
const BPATH = (() => {
  const LINK = 8, path = [];
  let xSeed = 0;
  for (let i = 0; i < NNT; i++) if (strands[D.ntStrand[i]].name[0] === 'S') xSeed = Math.max(xSeed, fin[i].p.x);
  const runs = [];
  strands.forEach((s, si) => {
    if (s.name[0] !== 'H' || s.x0 !== layerX0[0]) return;
    const [a, b] = strandRange[si];
    let cur = null;
    for (let i = a; i < b; i++) {
      if (fin[i].p.x <= xSeed + 0.2) { (cur || (runs.push(cur = []), cur)).push({ p: fin[i].p.clone(), q: fin[i].q.clone() }); }
      else cur = null;
    }
  });
  runs.forEach(r => { if (r[0].p.x > r[r.length - 1].p.x) r.reverse(); });   // each run read from the seed outwards
  runs.sort((A, B) => Math.atan2(A[0].p.z, A[0].p.y) - Math.atan2(B[0].p.z, B[0].p.y));
  runs.forEach((seg, n) => {
    const run = n % 2 ? [...seg].reverse() : seg;        // every other arm is walked back, so the crossovers stay short
    if (path.length) {
      const P0 = path[path.length - 1], P1 = run[0];
      for (let j = 1; j <= LINK; j++) {
        const u = j / (LINK + 1), q = P0.q.clone().slerp(P1.q, u);
        const pv = P0.p.clone().lerp(P1.p, u);
        pv.addScaledVector(new THREE.Vector3(0, pv.y, pv.z).normalize(), 1.0 * Math.sin(Math.PI * u));
        path.push({ p: pv, q });
      }
    }
    run.forEach(nt => path.push({ p: nt.p.clone(), q: nt.q.clone() }));
  });
  console.log(`blocker ${runs.length} seed arms, ${path.length} nt (${BSLOT.length} available)`);
  return path;
})();
let PRO_ON = false;
const PP = new THREE.Vector3(), PR = new THREE.Vector3(), PU = new THREE.Vector3(), PQ2 = new THREE.Quaternion();
const AWAY = new THREE.Vector3(0.1, 0.5, 0.86).normalize();

/* What the trigger does is strand displacement, and that is what is drawn. The blocker is let go one base
   at a time from its free end, and each base it lets go pairs with the trigger instead, so a plain double
   helix grows out of the open end while the lid on the seed shrinks. Both the lid and that helix are made
   of poses taken from the design itself - the lid from the hairpin ring, the helix from a straight stretch
   of the seed - so nothing here is bent or stretched into a shape the rest of the film does not use. */
const [RODB, RODT, RODAX] = (() => {
  // one helix of the bundle, read out of the design: a nucleotide of S2, its partner in S1, and the step
  // from one base to the next. Repeating that step builds a plain double helix of any length, exactly the
  // shape the rest of the film is made of.
  const a2 = strandRange[1][0], up = fin[a2 + 1].p.x > fin[a2].p.x ? 1 : -1;
  const i0 = up > 0 ? a2 : a2 + 41, i1 = i0 + up;
  const step = fin[i1].p.clone().sub(fin[i0].p);
  const qd = fin[i1].q.clone().multiply(fin[i0].q.clone().invert());
  let best = -1, bd = 1e9;
  for (let i = strandRange[0][0]; i < strandRange[0][1]; i++) {
    const d = fin[i].p.distanceTo(fin[i0].p);
    if (d < bd) { bd = d; best = i; }
  }
  const B = [], T = [], qb = fin[i0].q.clone(), qt = fin[best].q.clone();
  for (let j = 0; j <= BSLOT.length + 1; j++) {
    B.push({ p: step.clone().multiplyScalar(j), q: qb.clone() });
    T.push({ p: step.clone().multiplyScalar(j), q: qt.clone() });
    qb.premultiply(qd); qt.premultiply(qd);
  }
  return [B, T, step.clone().normalize()];
})();
const PDIR = new THREE.Vector3(0.82, 0.38, 0.43).normalize();   // the way the freed helix points
const QROD = new THREE.Quaternion().setFromUnitVectors(RODAX, PDIR);
// the part of the trigger not yet paired leaves the same branch point, straight, splayed off to one side
const QTAIL = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0).cross(PDIR).normalize(), 0.62).multiply(QROD);
/* The lid does not end where the seed does: a stretch of it hangs free out of the open end, with nothing to
   pair with - a toehold. That is where the trigger takes hold. */
const TOE = Math.min(7, BSLOT.length - BPATH.length);   // 4-8 bases is what a toehold really is
{
  const base = BPATH[BPATH.length - 1].p.clone();
  for (let j = 1; j <= TOE; j++)
    BPATH.push({ p: RODB[j].p.clone().applyQuaternion(QROD).add(base), q: RODB[j].q.clone().premultiply(QROD) });
}
const BL_N = Math.min(BPATH.length, BSLOT.length);
const TR_N = Math.min(BL_N, TSLOT.length);
// where the branch point sits, smoothed so the freed helix does not jitter as it walks along the lid
const BBASE = BPATH.map((_, k) => {
  const v = new THREE.Vector3(); let n = 0;
  for (let j = Math.max(0, k - 5); j <= Math.min(BPATH.length - 1, k + 5); j++) { v.add(BPATH[j].p); n++; }
  return v.divideScalar(n);
});
const CORR = new THREE.Vector3();
/* The borrowed strands are hairpins, and a few of their bases - the ones at a turn or at a chain end - carry
   their atoms well off the frame origin. Laid out as a straight helix that shows up as a hole. So each base
   is placed by where its atoms should sit, not by its origin: CM is the average offset, and every base is
   shifted by the difference between that and its own. */
const CM = (() => { const v = new THREE.Vector3(), all = [...BSLOT, ...TSLOT];
  for (const i of all) v.add(cLocal[i]); return v.divideScalar(all.length); })();
const CQ = new THREE.Vector3();
const evenOut = (i, j, outP, outQ) => outP.addScaledVector(
  CQ.copy(CM).sub(cLocal[i]).applyQuaternion(outQ), clamp(j / 4, 0, 1));
const rodPose = (ROD, j, Q, base, outP, outQ) => {      // j may fall between two bases
  const j0 = clamp(Math.floor(j), 0, ROD.length - 2), f = clamp(j - j0, 0, 1);
  outP.copy(ROD[j0].p).lerp(ROD[j0 + 1].p, f).applyQuaternion(Q).add(base);
  outQ.copy(ROD[j0].q).slerp(ROD[j0 + 1].q, f).premultiply(Q);
  // the first few bases are pulled onto the branch point itself, so the chain is not broken there
  outP.addScaledVector(CORR, Math.max(0, 1 - j / 9));
};
const BASE = new THREE.Vector3(), BX = new THREE.Vector3();
const P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion();
/* A strand that is no longer paired to anything does not keep the shape it had while it was: it curls up.
   These are the shapes the blocker and the trigger take once they are free - a wandering chain, one base
   every 0.332 nm, the same spacing as everywhere else, so nothing is stretched or broken. */
const CDIR = PDIR.clone().multiplyScalar(0.5).addScaledVector(new THREE.Vector3(0, 1, 0.25), 0.95).normalize();   // free strands lie clear of the seed
const makeCoil = (ph, TPL) => {
  const C = [], p = new THREE.Vector3(), nd = new THREE.Vector3(), dq = new THREE.Quaternion();
  const U1 = new THREE.Vector3(0, 1, 0).cross(CDIR).normalize(), U2 = CDIR.clone().cross(U1).normalize();
  const dir = CDIR.clone(), q = new THREE.Quaternion().setFromUnitVectors(RODAX, dir);
  for (let m = 0; m < BSLOT.length + 2; m++) {
    C.push({ p: p.clone(), q: TPL[m].q.clone().premultiply(q) });
    const a = m * 0.075 + ph, b = m * 0.17 + ph * 2;
    const fw = 0.28 + 0.64 * Math.exp(-m / 7);                  // it leaves the seed first, then wanders
    nd.copy(CDIR).multiplyScalar(fw + (1 - fw) * Math.cos(a))
      .addScaledVector(U1, 0.9 * Math.sin(a) * Math.cos(b)).addScaledVector(U2, 0.9 * Math.sin(a) * Math.sin(b)).normalize();
    dq.setFromUnitVectors(dir, nd); q.premultiply(dq); dir.copy(nd);
    p.addScaledVector(nd, 0.332);
  }
  return C;
};
const COILT = makeCoil(2.1, RODT), QID = new THREE.Quaternion();
/* The trigger takes the toehold, then works back along the lid one base at a time - the only way a strand
   can take another one off - and it is followed all the way. What leaves is therefore what really leaves:
   one plain double helix of the whole length, 166 base pairs of it, which is long. That is the size this
   reaction actually has. */
function posePrologue(tp) {
  PRO_ON = tp < PRO;
  if (!PRO_ON) return;
  const arr = easeOut((tp - 2.4) / 1.8);              // the trigger comes in and takes the toehold
  const prog = smooth((tp - 5.6) / 4.2);              // it works back along the lid, to the end
  const gone = smooth((tp - 10.0) / 1.4);             // and the pair drifts off
  const kb = (BL_N - 1 - TOE) * (1 - prog);           // where the two strands part company
  const k0 = clamp(Math.floor(kb), 0, BL_N - 2), aw = 36 * gone;
  BASE.copy(BBASE[k0]).lerp(BBASE[k0 + 1], kb - k0).addScaledVector(AWAY, aw);
  BX.copy(BPATH[k0].p).lerp(BPATH[k0 + 1].p, kb - k0).addScaledVector(AWAY, aw);
  CORR.subVectors(BX, BASE);

  for (let k = 0; k < BL_N; k++) {
    const i = BSLOT[k];
    if (k > kb) { rodPose(RODB, k - kb, QROD, BASE, ntP[i], ntQ[i]); evenOut(i, k - kb, ntP[i], ntQ[i]); }
    else { ntP[i].copy(BPATH[k].p).addScaledVector(AWAY, aw); ntQ[i].copy(BPATH[k].q); }
    ntOn[i] = gone < 0.98 ? 1 : 0; ntW[i] = 1;
  }
  for (let k = BL_N; k < BSLOT.length; k++) ntOn[BSLOT[k]] = 0;

  for (let k = 0; k < TR_N; k++) {
    const i = TSLOT[k];
    if (k > kb) { rodPose(RODT, k - kb, QROD, BASE, ntP[i], ntQ[i]); evenOut(i, k - kb, ntP[i], ntQ[i]); }
    else { rodPose(COILT, kb - k, QID, BASE, ntP[i], ntQ[i]); evenOut(i, kb - k, ntP[i], ntQ[i]); }
    ntP[i].addScaledVector(AWAY, 26 * (1 - arr));
    ntOn[i] = arr > 0.002 && gone < 0.98 ? 1 : 0; ntW[i] = 1;
  }
  for (let k = TR_N; k < TSLOT.length; k++) ntOn[TSLOT[k]] = 0;
}
const LIDX = (() => { let s = 0; for (let k = 0; k < BPATH.length - TOE; k++) s += BPATH[k].p.x; return s / (BPATH.length - TOE); })();
const blockerAnchor = () => {   // half way along the lid, on the side of it that faces the camera
  let best = BSLOT[0], bd = 1e9;
  for (let k = 0; k < BL_N - TOE; k++) {
    if (Math.abs(ntP[BSLOT[k]].x - LIDX) > 1.6) continue;
    const d = model.localToWorld(AW.copy(ntP[BSLOT[k]])).distanceToSquared(cam.position);
    if (d < bd) { bd = d; best = BSLOT[k]; }
  }
  return model.localToWorld(AW.copy(ntP[best])).clone();
};
const triggerAnchor = () => model.localToWorld(PP.copy(ntP[TSLOT[TR_N >> 1]])).clone();

const v = new THREE.Vector3();
function update(T) {
  const { a: tAll, hold } = animTime(T);
  const t = tAll - PRO;   // everything that was here now runs after the prologue
  const te = t - A2, act2 = te > -0.2;
  if (act2) setEVShape(te);
  BEND = act2 ? smooth2(T_INSERT[0], T_SPREAD[1], te) : 0;
  // it flexes once it is finished, and is held still again as the membrane takes hold of it
  WAVE = 1.15 * smooth2(A2 - 2.5, A2 + 0.5, t) * (1 - 0.82 * BEND);
  WAVE_T = t;
  INS = act2 ? smooth2(T_INSERT[0] - 0.8, T_INSERT[1], te) : 0;
  for (let i = 0; i < NNT; i++) {
    const s = strands[D.ntStrand[i]];
    if (s.name[0] === 'S') { ntQ[i].copy(fin[i].q); ntP[i].copy(fin[i].p); ntOn[i] = 1; ntW[i] = 1; continue; }
    if (t < s.t0) { ntOn[i] = 0; ntW[i] = 0; continue; }
    ntOn[i] = 1;
    const tz = s.t0 + ARRIVE + PAUSE;
    if (t < tz) {   // flying in as a closed hairpin
      ntQ[i].copy(hov[i].q);
      ntP[i].copy(hov[i].p).addScaledVector(s.out, 22 * (1 - easeOut((t - s.t0) / ARRIVE)));
      ntW[i] = 0;
      continue;
    }
    // the K*A* root lands first, then both stems open outwards onto the tube
    const k = D.ntK[i], ord = Math.abs(k - 41.5) / 41.5;
    const w = smooth(((t - tz) / ZIP * (1 + ZW) - ord) / ZW);
    ntQ[i].slerpQuaternions(hov[i].q, fin[i].q, w);
    ntP[i].lerpVectors(hov[i].p, fin[i].p, w);
    ntW[i] = w;
  }
  // keep each strand in one piece while it opens: walk out from its most settled nucleotide and put every
  // neighbour back at its own spacing (blended between the two shapes), along the interpolated direction
  strandRange.forEach(([a, b], si) => {
    if (strands[si].name[0] !== 'H' || !ntOn[a]) return;
    let m = a;
    for (let i = a; i < b; i++) if (ntW[i] > ntW[m]) m = i;
    if (ntW[m] <= 0 || ntW[a] >= 1 && ntW[b - 1] >= 1) return;
    for (let i = a; i < b; i++) C[i].copy(cLocal[i]).applyQuaternion(ntQ[i]).add(ntP[i]);
    const fix = (i, j) => {
      const g = Math.min(i, j), L = lerp(gapH[g], gapF[g], (ntW[i] + ntW[j]) / 2);
      v.subVectors(C[j], C[i]); const d = v.length() || 1;
      C[j].copy(C[i]).addScaledVector(v, L / d);
      ntP[j].copy(C[j]).sub(cLocal[j].clone().applyQuaternion(ntQ[j]));
    };
    for (let i = m; i < b - 1; i++) fix(i, i + 1);
    for (let i = m; i > a; i--) fix(i, i - 1);
  });
  posePrologue(tAll);
  // the atoms themselves are placed by the GPU: it only needs every nucleotide's pose
  for (let n = 0; n < NNT; n++) {
    const q = ntQ[n], p = ntP[n], o = 8 * n;
    ntData[o] = q.x; ntData[o + 1] = q.y; ntData[o + 2] = q.z; ntData[o + 3] = q.w;
    ntData[o + 4] = p.x; ntData[o + 5] = p.y; ntData[o + 6] = p.z; ntData[o + 7] = ntOn[n];
  }
  ntTex.needsUpdate = true;
  AU.uBend.value = BEND; AU.uWave.value = WAVE; AU.uWaveT.value = WAVE_T;
  updateMods();
  if (!act2) {   // act one: the tube turns on its own
    model.rotation.x = -0.3 * t;
    model.position.set(0, 0, 0);
  } else {       // act two: it stops turning, puts its cholesterol face down and settles onto the vesicle
    const from = -0.3 * A2;
    let to = FACE_DOWN;
    while (to - from > Math.PI) to -= 2 * Math.PI;
    while (from - to > Math.PI) to += 2 * Math.PI;
    model.rotation.x = lerp(from, to, ease((te - T_TURN[0]) / (T_TURN[1] - T_TURN[0])));
    const pa = ease((te - T_APPROACH[0]) / (T_APPROACH[1] - T_APPROACH[0]));
    const pin = ease((te - T_INSERT[0]) / (T_INSERT[1] - T_INSERT[0]));
    // it carries on from where act one left it and settles the last few nanometres onto the membrane
    model.position.set(0, lerp(0, BUNDLE_Y, pa) - 1.2 * pin - SINK, 0);   // it settles into the trough it makes
  }
  evGroup.visible = act2;
  // the vesicle drifts up into the shot while the camera comes down to it
  if (act2) evGroup.position.y = EVC.y - 80 * (1 - ease(te / 5.0));
  if (act2) updateEV(te);
  if (tAll < PRO) {   // a touch wider, so the trigger can be seen arriving
    act1Frame(-1, A1);
    const f = ease((tAll - (PRO - 1.3)) / 1.3);
    const g = smooth((tAll - 4.6) / 4.0);   // close on the seed, then open out: what leaves is 55 nm long
    setCam(DIR, ACT1_UP, lerp(lerp(17, 34, g), A1.half, f),
      new THREE.Vector3(lerp(10, 30, g), lerp(0, 9, g), 0).lerp(A1.tgt, f));
  } else if (t < A2) frameCam(t); else frameCam2(te);
  CUR = { hold, u: hold ? T - hold.t0 : 0, a: t };
}
let CUR = { hold: null, u: 0 };


/* ---------- the vesicle, frame by frame ---------- */
const esp = [0, 0, 0], esn = [0, 0, 0];   // a point on the membrane and its normal, for the captions

function setEVShape(te) {
  const pin = ease((te - T_INSERT[0]) / (T_INSERT[1] - T_INSERT[0]));
  const sp1 = ease((te - T_SPREAD[0]) / (T_SPREAD[1] - T_SPREAD[0])), after = smooth((te - T_RUP - 0.3) / 5);
  EVSH.t = te;
  EVSH.Lc = lerp(0, 6, pin) + 40 * sp1 + 12 * after;
  EVSH.kc = lerp(0, 0.55, pin) + 0.4 * sp1;
  SINK = DIMPLE * EVSH.kc;                              // the bundle settles into the trough, point by point
  const gl = 0.3 * pin + 0.7 * sp1;                     // the trough starts short and runs out along the bundle
  EVSH.la = lerp(5, L_IN, gl); EVSH.lb = lerp(14, L_OUT, gl);
  EVSH.e = 0.12 * smooth((te - 11) / 7.5) + 0.08 * after;
  EVSH.def = after;
  EVSH.U = 0;   // no thermal ripple: the DNA is not jittering either, so the membrane should not
}
// every outer lipid takes the colour of the curvature at its own place; redone only when the shape has
// moved on enough to matter, since it costs nine surface evaluations per lipid
let curvKey = '';
const tmpJ = new THREE.Color();
function refreshCurv() {
  // no curvature map on the cover, so the colour never changes: painted once
  if (curvKey) return false;
  curvKey = 'flat';
  for (let i = 0; i < NO; i++) {
    const c = [0.365, 0.451, 0.565];   // no curvature map on the cover: one slate for every head
    heads.setColorAt(i, tmpJ.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace));
  }
  return true;
}
function updateEV(te) {
  if (refreshCurv()) heads.instanceColor.needsUpdate = true;
  // the shape of the membrane and the size of the opening this frame; the lipids are posed from these on the GPU
  const g = poreSize(te - T_RUP);
  LU.uE.value = EVSH.e; LU.uLc.value = EVSH.Lc; LU.uKc.value = EVSH.kc; LU.uDef.value = EVSH.def;
  LU.uLa.value = EVSH.la; LU.uLb.value = EVSH.lb;
  LU.uG.value = g; LU.uPa.value = PORE.along * g + 0.4; LU.uPb.value = PORE.across * g + 0.2;
  poseLipids();
}

/* ---------- act two's camera: the shots of hcr-ev-rupture-3d.html, on the same camera as act one ----------
   There the vesicle sat at the origin with the bundle above it in +z and the camera's up along +y, so a point
   of that scene maps here to EVC + (x, z, -y) and a direction to (x, z, -y). Its perspective distances become
   parallel half-heights through d * tan(14 deg), which frames the same amount of the scene. The camera is never
   cut: it starts from act one's framing and travels down to the vesicle. */
const toHere = (x, y, z) => new THREE.Vector3(XMID + x, EVC.y + z, -y);
const dirHere = (x, y, z) => new THREE.Vector3(x, z, -y).normalize();
const K_HALF = Math.tan(28 / 2 * Math.PI / 180);
const EV_UP = dirHere(0, 1, 0);
const WIDE = { dir: dirHere(-0.22, 0.32, 1), half: 250 * K_HALF, tgt: toHere(0, 0, 6) };
const CLOSE = { dir: dirHere(0.12, -1, 0.3), half: 42 * K_HALF, tgt: toHere(-4, 0, 50) };
const WIDER = { dir: dirHere(-0.22, 0.42, 1), half: WIDE.half, tgt: WIDE.tgt };   // the same framing, tipped just enough for the trough to read
const shots2 = [
  { t: 0, from1: true },                 // whatever act one was showing
  { t: 4.0, ...WIDE }, { t: 5, ...WIDE },
  { t: 7.5, ...CLOSE }, { t: 10, ...CLOSE },
  { t: 12.5, ...WIDE }, { t: 13.5, ...WIDE }, { t: 17.5, ...WIDER },   // settled on the tilted view before the pore opens
];
const SD = new THREE.Vector3(), SU = new THREE.Vector3(), ST = new THREE.Vector3();
function shotAt(sh, te) {
  if (!sh.from1) return { dir: sh.dir, up: EV_UP, half: sh.half, tgt: sh.tgt };
  act1Frame(A2, A1);
  return { dir: DIR, up: ACT1_UP, half: A1.half, tgt: A1.tgt };
}
function frameCam2(te) {
  let k = 0;
  shots2.forEach((sh, i) => { if (te >= sh.t) k = i; });
  const A = shotAt(shots2[k], te), B = shotAt(shots2[Math.min(k + 1, shots2.length - 1)], te);
  const ta = shots2[k].t, tb = shots2[Math.min(k + 1, shots2.length - 1)].t;
  const f = tb > ta ? ease((te - ta) / (tb - ta)) : 0;
  SD.copy(A.dir).lerp(B.dir, f).normalize();
  SU.copy(A.up).lerp(B.up, f).normalize();
  ST.copy(A.tgt).lerp(B.tgt, f);
  const half = Math.exp(lerp(Math.log(A.half), Math.log(B.half), f));
  if (te > 12.5) SD.applyAxisAngle(EV_UP, 0.025 * (te - 12.5));   // the same slow drift round
  setCam(SD, SU, half, ST);
}

/* ---------- camera: oblique and orthographic, panning along as the tube grows ---------- */
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 900);
const DIR = new THREE.Vector3(-0.3, 0.45, 1).normalize();
const ACT1_UP = DIR.clone().cross(new THREE.Vector3(1, 0, 0)).normalize();
cam.up.copy(ACT1_UP);
const reach = n => (n < 0 ? 42 : layerX0[n] + 42) * D.rise;   // right end of the double-stranded part after layer n
// how much of the tube is double-stranded, as one smooth monotonic curve: the sum of a sigmoid per ring.
// (Easing to each ring in turn made the pan restart every time a ring landed, which read as a judder.)
function grown(t) {
  let nf = 0;
  for (let i = 0; i < layerT.length; i++) nf += smooth((t - layerT[i] - (ARRIVE + PAUSE)) / ZIP);
  return (42 + 21 * nf) * D.rise + 3;
}
function act1Frame(t, out) {
  const xb = grown(t);
  out.half = Math.max(11, (xb + 4) / 2 / (innerWidth / innerHeight) * 1.08);
  // the tube sits a little above the middle, which keeps the band along the bottom clear for the key phrase
  out.tgt.set((xb - 1) / 2, 0, 0).addScaledVector(ACT1_UP, -0.2 * out.half);
  return out;
}
const A1 = { half: 11, tgt: new THREE.Vector3() };
function frameCam(t) {
  act1Frame(t, A1);
  setCam(DIR, ACT1_UP, A1.half, A1.tgt);
}
function setCam(dir, up, half, target) {
  const asp = innerWidth / innerHeight;
  cam.left = -half * asp; cam.right = half * asp; cam.top = half; cam.bottom = -half;
  cam.up.copy(up);
  cam.position.copy(target).addScaledVector(dir, 200);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
}

/* Straight to the canvas. With the occlusion pass gone there is nothing left for a post chain to do, and
   an off-screen target of this size is the first thing Safari fails to give us - which showed up as a page
   that kept running at sixty frames a second with nothing on it. */
// no ambient occlusion on the cover: it is the most expensive pass and it holds several full-size
// buffers open even when disabled, which is what a small GPU runs out of first
let dirty = true;                    // set when something other than the scroll changes the frame
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); dirty = true; });

/* ---------- the captions, drawn over the render ---------- */
const AW = new THREE.Vector3();
const onBundle = x => model.localToWorld(AW.set(x, 0, 0)).clone();
const onEV = (x, y, z) => { evSurf(x, y, z, esp, esn); return evGroup.localToWorld(AW.set(esp[0] + 3 * esn[0], esp[1] + 3 * esn[1], esp[2] + 3 * esn[2])).clone(); };
const strandTip = si => {   // the middle of a hairpin: off the tube, but not at an extreme that leaves the frame
  const [a, b] = strandRange[si];
  AW.set(0, 0, 0);
  for (let i = a; i < b; i++) AW.add(ntP[i]);
  return model.localToWorld(AW.divideScalar(b - a)).clone();
};
// the hairpins that have arrived but not yet finished opening, nearest the tube first
const onFlying = n => {
  const out = [];
  strands.forEach((sh, si) => {
    if (sh.name[0] !== 'H') return;
    const a = strandRange[si][0];
    if (!ntOn[a] || ntW[a] >= 0.98) return;
    const p = strandTip(si);
    SQ.copy(p).project(cam);                       // and well inside the frame
    if (SQ.z > 1 || Math.abs(SQ.x) > 0.78 || Math.abs(SQ.y) > 0.70) return;
    out.push(p);
  });
  out.sort((p, q) => p.distanceToSquared(cam.position) - q.distanceToSquared(cam.position));   // nearest first
  return out.length ? out.slice(0, n) : [onTip()];
};
const onTip = () => {   // the end of the tube, where the next ring is landing
  let best = 0, bx = -1e9;
  for (let i = 0; i < NNT; i++) if (ntOn[i] && ntP[i].x > bx) { bx = ntP[i].x; best = i; }
  return model.localToWorld(AW.copy(ntP[best])).clone();
};
// one atom of a modifier on a hairpin that is currently in the air: 'c' the sterol, 'l' the linker
const MOD_ATOM = { c: 0, l: 0 };
{
  let far = -1;
  for (let i = 0; i < NMA; i++) {
    const r = Math.hypot(MLOC[3 * i], MLOC[3 * i + 1], MLOC[3 * i + 2]);
    if (M.kind[i] === 'c' && r > far) { far = r; MOD_ATOM.c = i; }
  }
  // the linker atom half way between the DNA and the sterol, so its leader lands on the visible tether
  const C = [MLOC[3 * MOD_ATOM.c], MLOC[3 * MOD_ATOM.c + 1], MLOC[3 * MOD_ATOM.c + 2]];
  let best = 1e9;
  for (let i = 0; i < NMA; i++) {
    if (M.kind[i] !== 'l') continue;
    const d = Math.hypot(MLOC[3 * i] - C[0], MLOC[3 * i + 1] - C[1], MLOC[3 * i + 2] - C[2]);
    if (Math.abs(d - far * 0.55) < best) { best = Math.abs(d - far * 0.55); MOD_ATOM.l = i; }
  }
}
let AWLY = 0;   // the local height of the last modifier atom asked for: negative means it points at the membrane
const modAtomAt = (mi, i) => {
  const n = M.host[mi], w = ntW[n];
  rq.slerpQuaternions(relH[mi].q, relF[mi].q, w); rp.lerpVectors(relH[mi].p, relF[mi].p, w);
  AW.set(MLOC[3 * i], MLOC[3 * i + 1], MLOC[3 * i + 2]).applyQuaternion(rq).add(rp).applyQuaternion(ntQ[n]).add(ntP[n]);
  if (BEND > 0) AW.addScaledVector(FACE_VEC, BEND * sagF(AW.x));   // the same bend the atoms are drawn with
  AWLY = AW.y;
  return model.localToWorld(AW).clone();
};
// The anchor a leader points at has to be settled on the tube and well inside the frame - a hairpin that has
// only just set off is still tens of nanometres away, often off screen - and of those, the nearest the camera.
const SQ = new THREE.Vector3();
const onMod = kind => {
  let best = null, bd = Infinity;
  for (let k = 0; k < M.host.length; k++) {
    const n = M.host[k];
    if (!ntOn[n] || ntW[n] < 0.98) continue;
    const p = modAtomAt(k, MOD_ATOM.c);
    SQ.copy(p).project(cam);
    if (SQ.z > 1 || Math.abs(SQ.x) > 0.86 || Math.abs(SQ.y) > 0.78) continue;
    const d = p.distanceToSquared(cam.position);
    if (d < bd) { bd = d; best = k; }
  }
  return best === null ? onTip() : modAtomAt(best, MOD_ATOM[kind]);
};
// the same, but only the sterols on the underside - the ones that have gone into the membrane
const onModIn = () => {
  let best = null, bd = Infinity;
  for (let k = 0; k < M.host.length; k++) {
    const n = M.host[k];
    if (!ntOn[n] || ntW[n] < 0.98) continue;
    const p = modAtomAt(k, MOD_ATOM.c);
    if (AWLY > -3) continue;
    SQ.copy(p).project(cam);
    if (SQ.z > 1 || Math.abs(SQ.x) > 0.86 || Math.abs(SQ.y) > 0.78) continue;
    const d = p.distanceToSquared(cam.position);
    if (d < bd) { bd = d; best = k; }
  }
  return best === null ? onMod('c') : modAtomAt(best, MOD_ATOM.c);
};
const labCv = document.getElementById('labels'), lctx = labCv.getContext('2d');
const LP = new THREE.Vector3();

/* A name is put wherever the frame is empty. The rendered image is read back at a coarse grid, every cell
   that is not white counts as taken, and each name is tried at rings of positions around the thing it points
   at - in its preferred direction first - until one is found where the whole box, and a margin, is clear.
   Names placed earlier in the same stop are marked as taken too, so they never cover one another. */
const OGW = 120, OGH = 68;
const occCv = document.createElement('canvas'); occCv.width = OGW; occCv.height = OGH;
const octx = occCv.getContext('2d', { willReadFrequently: true });
const OCC = new Uint8Array(OGW * OGH), RAW = new Uint8Array(OGW * OGH);
function readOccupancy() {
  octx.clearRect(0, 0, OGW, OGH);
  octx.drawImage(renderer.domElement, 0, 0, OGW, OGH);
  const d = octx.getImageData(0, 0, OGW, OGH).data;
  for (let i = 0; i < RAW.length; i++) RAW[i] = (d[4 * i] > 243 && d[4 * i + 1] > 243 && d[4 * i + 2] > 243) ? 0 : 1;
  for (let y = 0; y < OGH; y++) for (let x = 0; x < OGW; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1 && !v; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < OGW && yy >= 0 && yy < OGH && RAW[yy * OGW + xx]) v = 1;
    }
    OCC[y * OGW + x] = v;
  }
}
function boxFree(cx, cy, hw, hh) {
  if (cx - hw < 0.5 || cx + hw > OGW - 0.5 || cy - hh < 0.5 || cy + hh > OGH - 0.5) return false;
  for (let y = Math.floor(cy - hh); y <= Math.ceil(cy + hh); y++)
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++)
      if (OCC[y * OGW + x]) return false;
  return true;
}
function markBox(cx, cy, hw, hh) {
  for (let y = Math.max(0, Math.floor(cy - hh)); y <= Math.min(OGH - 1, Math.ceil(cy + hh)); y++)
    for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(OGW - 1, Math.ceil(cx + hw)); x++)
      OCC[y * OGW + x] = 1;
}
function freeSpot(gx, gy, hw, hh, dir) {
  const pa = Math.atan2(dir[1], dir[0]);
  for (const R of [10, 14, 18, 23, 28, 34, 41]) {
    let best = null, bestTurn = 9;
    for (let k = 0; k < 28; k++) {
      const turn = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 14);
      const ang = pa + turn;
      const cx = gx + Math.cos(ang) * R, cy = gy + Math.sin(ang) * R;
      if (!boxFree(cx, cy, hw, hh)) continue;
      if (Math.abs(turn) < bestTurn) { bestTurn = Math.abs(turn); best = [cx, cy]; }
    }
    if (best) return best;
  }
  return null;
}
// the scale of the simulation figures, so the colours on the membrane can be read off
function drawScale(g, W, H, dpr, alpha) {
  const x0 = W - 196 * dpr, bw = 40 * dpr, y0 = H * 0.17, y1 = H * 0.83, bh = y1 - y0;
  g.globalAlpha = alpha;
  for (let k = 0; k < 120; k++) {
    const t = 1 - k / 119, c = ramp(t);
    g.fillStyle = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
    g.fillRect(x0, y0 + bh * k / 120, bw, bh / 120 + 1);
  }
  g.strokeStyle = '#1d2733'; g.lineWidth = 1.6 * dpr;
  g.strokeRect(x0, y0, bw, bh);
  g.font = `500 ${Math.round(16 * dpr)}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'left'; g.fillStyle = '#1d2733';
  for (let v = H_LO; v <= H_HI + 1e-9; v += 0.01) {
    const y = y1 - (v - H_LO) / (H_HI - H_LO) * bh;
    g.beginPath(); g.moveTo(x0 + bw, y); g.lineTo(x0 + bw + 7 * dpr, y); g.stroke();
    g.fillText(v.toFixed(2), x0 + bw + 12 * dpr, y + 5.5 * dpr);
  }
  const yt = y1 - (H_THR - H_LO) / (H_HI - H_LO) * bh;   // where the bilayer gives way
  g.save();
  g.strokeStyle = '#ffffff'; g.lineWidth = 4 * dpr; g.setLineDash([9 * dpr, 7 * dpr]);
  g.beginPath(); g.moveTo(x0 - 2 * dpr, yt); g.lineTo(x0 + bw + 2 * dpr, yt); g.stroke();
  g.restore();
  g.save();
  g.translate(W - 26 * dpr, (y0 + y1) / 2);
  g.rotate(Math.PI / 2);
  g.textAlign = 'center';
  g.font = `700 ${Math.round(19 * dpr)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillText('Local Curvature H [1/nm]', 0, 0);
  g.restore();
  g.globalAlpha = 1;
}

const SCALE_IN = A2 + 12.5;   // as the camera pulls back off the close-up   // drawCaption is given the clock that starts after the prologue
function drawCaption(hold, u, a) {
  const dpr = Math.min(devicePixelRatio, 2), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (labCv.width !== W || labCv.height !== H) { labCv.width = W; labCv.height = H; }
  lctx.clearRect(0, 0, W, H);
  // the scale fades up while the membrane is being pulled out of shape, and stays - the film no longer stops for it
  const sa = smooth((a - SCALE_IN) / 1.2);
  if (sa > 0.01) drawScale(lctx, W, H, dpr, sa);
  const live = BANNERS.filter(b => bannerFade(b, a) > 0.01);
  if (!hold && !live.length) return;
  readOccupancy();
  const fB = Math.max(26 * dpr, W / 36);   // the project's key phrase, so it carries some weight
  lctx.textAlign = 'center'; lctx.lineJoin = 'round';
  lctx.font = `700 ${Math.round(fB)}px "Helvetica Neue", Arial, sans-serif`;
  for (const b of live) {
    const tw = lctx.measureText(b.t).width;
    const hw = (tw / 2 + 16 * dpr) / W * OGW, hh = (fB * 0.75 + 12 * dpr) / H * OGH;
    markBox(OGW * 0.5, OGH - 4.5, hw, hh);   // reserved, so the other names keep off it
    const bx = W * 0.5, by = H - 58 * dpr;
    lctx.globalAlpha = bannerFade(b, a);
    lctx.strokeStyle = '#ffffff'; lctx.lineWidth = fB * 0.3;
    lctx.strokeText(b.t, bx, by);
    lctx.fillStyle = '#1d2733'; lctx.fillText(b.t, bx, by);
    lctx.globalAlpha = 1;
  }
  if (!hold) return;
  const f = Math.max(19 * dpr, W / 52);
  lctx.font = `700 ${Math.round(f)}px "Helvetica Neue", Arial, sans-serif`;
  lctx.textAlign = 'center'; lctx.lineJoin = 'round';
  for (const it of hold.items) {
    const from = it.from || 0, to = it.to === undefined ? hold.dur : it.to;
    const fade = Math.min(smooth((u - from) / 0.35), 1 - smooth((u - (to - 0.3)) / 0.3));
    if (fade <= 0.01) continue;
    const pts = it.ats().map(v => { LP.copy(v).project(cam); return [(LP.x * 0.5 + 0.5) * W, (-LP.y * 0.5 + 0.5) * H]; });
    const mx = pts.reduce((a2, q) => a2 + q[0], 0) / pts.length, my = pts.reduce((a2, q) => a2 + q[1], 0) / pts.length;
    const sw = it.swatch ? f * 1.5 : 0;
    const tw = lctx.measureText(it.t).width + sw, th = f * 1.25;
    const hw = (tw / 2 + 12 * dpr) / W * OGW, hh = (th / 2 + 10 * dpr) / H * OGH;
    const spot = freeSpot(mx / W * OGW, my / H * OGH, hw, hh, it.dir || [0, -1]);
    const cx = spot ? spot[0] / OGW * W : clamp(mx, tw / 2 + 24 * dpr, W - tw / 2 - 24 * dpr);
    const cy = (spot ? spot[1] / OGH * H : clamp(my - 150 * dpr, f + 30 * dpr, H - 40 * dpr)) + f * 0.36;
    if (spot) markBox(spot[0], spot[1], hw, hh);
    lctx.globalAlpha = fade;
    lctx.strokeStyle = '#1d2733'; lctx.lineWidth = 1.6 * dpr;
    for (const [px, py] of (it.noLead ? [] : pts)) {
      lctx.beginPath();
      lctx.moveTo(cx, cy + (py > cy ? f * 0.42 : -f * 0.98));
      lctx.lineTo(px, py);
      lctx.stroke();
      lctx.beginPath(); lctx.arc(px, py, 4.5 * dpr, 0, 2 * Math.PI); lctx.fillStyle = '#1d2733'; lctx.fill();
    }
    lctx.strokeStyle = '#ffffff'; lctx.lineWidth = f * 0.34;
    lctx.strokeText(it.t, cx + sw / 2, cy);
    lctx.fillStyle = '#1d2733'; lctx.fillText(it.t, cx + sw / 2, cy);
    if (it.swatch) {
      const r = f * 0.4, px = cx - tw / 2 + r + f * 0.1, py = cy - f * 0.33;
      lctx.beginPath(); lctx.arc(px, py, r, 0, 2 * Math.PI);
      lctx.fillStyle = it.swatch; lctx.fill();
      lctx.strokeStyle = '#ffffff'; lctx.lineWidth = 2.4 * dpr; lctx.stroke();
    }
    lctx.globalAlpha = 1;
  }
}

/* ---------- the cover: the scroll bar is the clock ----------
   The bundle stands upright in the frame and the vesicle waits below it, so scrolling down is the bundle
   coming down. The camera looks at it square on, across the bundle rather than along it. */
const hero = heroEl;
document.querySelector('.hero-stage').appendChild(renderer.domElement);
hero.classList.add('hero--live');   // from here on the scroll track and the fixed title take over
/* two movements: the bundle builds itself, on its own clock; then the scroll bar takes over and walks it
   down onto the vesicle. The title arrives between the two, when the bundle is finished. */
const INTRO = 7.0;
const GROW_A = PRO + layerT[Math.max(0, layerT.length - 12)], GROW_B = PRO + TOTAL_GROW + 0.4;
const HERO_A = GROW_B, HERO_B = PRO + A2 + T_RUP + 3.4;   // right through the rupture
/* The scroll does not run at an even rate through the film. The part worth looking at is the moment the
   membrane gives way, so most of the scroll is spent on the seconds around it, and the approach before it
   (which, seen from above, is mostly the camera swinging round) is passed over quickly.
   Times are given on act two's clock (te: 0 = the bundle is finished, T_RUP = the membrane tears). */
const TE = te => PRO + A2 + te;
/* The last third of the track is shared with the page: the text after the cover rises over the stage
   while the camera passes through the opening, so the dive slows there and runs on until the torn rim has
   left the frame - the inside of the hole and the page behind it are the same dark blue. */
const KNOTS = [[0, HERO_A], [0.18, TE(11)], [0.36, TE(17.2)], [0.50, TE(19.0)],
               [0.667, TE(20.6)], [0.92, TE(21.7)], [1, HERO_B]];
function timeAt(p) {
  for (let i = 0; i < KNOTS.length - 1; i++) {
    const [pa, ta] = KNOTS[i], [pb, tb] = KNOTS[i + 1];
    if (p <= pb || i === KNOTS.length - 2) return lerp(ta, tb, clamp((p - pa) / (pb - pa), 0, 1));
  }
  return HERO_B;
}
let lastCur = NaN, lastProg = NaN, lastClear = null;
let cur = HERO_A, want = HERO_A, phase = 1, started = performance.now() / 1000;
// update() is fed the playback clock, which runs longer than the animation clock by every pause in it
const realFor = a => a + STOPS.reduce((n, st) => n + (st.a <= a ? st.dur : 0), 0);

/* One camera move, then none: as soon as the title has gone the camera swings round, in a single motion
   while it pulls back, onto the axis of the opening that is about to tear, and from then on it stays on
   that axis and only comes closer - so the last dive goes straight in, with no change of angle on the way.
   The opening sits on top of the vesicle, just to our side of the bundle, so that axis looks down on it. */
const CUP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);                                     // the intro's square-on view
const HOLE_DIR = new THREE.Vector3(...PC).applyEuler(evGroup.rotation).normalize();   // out of the opening
const atTe = te => (TE(te) - HERO_A) / (HERO_B - HERO_A);
const SHOTS = [
  // where the intro leaves it: square on, riding the growing end
  { at: 0, top: 0, half: 13, tx: grown(HERO_A - PRO) - 6.5 - XMID, pore: 0 },
  // swung round onto the opening's axis and pulled back to take in the vesicle as it rises into place
  { at: atTe(5.0), top: 1, half: 60, tx: 0, pore: 0 },
  { at: atTe(13.7), top: 1, half: 60, tx: 0, pore: 0 },
  // the tear itself, held at a size where it can be read before anything else happens
  { at: atTe(16.4), top: 1, half: 34, tx: 0, pore: 0.45 },
  { at: atTe(19.9), top: 1, half: 22, tx: 0, pore: 0.6 },
  // and only then into it, until the torn edge has passed out of the frame
  { at: atTe(21.7), top: 1, half: 3.2, tx: 0, pore: 1 },
  { at: 1.00, top: 1, half: 3.2, tx: 0, pore: 1 },
];
const CD = new THREE.Vector3(), CT = new THREE.Vector3(), CE = new THREE.Vector3();
function coverCam(p) {
  let i = 0;
  for (let k = 0; k < SHOTS.length - 1; k++) if (p >= SHOTS[k].at) i = k;
  const A = SHOTS[i], B = SHOTS[Math.min(i + 1, SHOTS.length - 1)];
  const f = B.at > A.at ? smooth((p - A.at) / (B.at - A.at)) : 0;
  const top = lerp(A.top, B.top, f), po = lerp(A.pore, B.pore, f);
  CD.copy(SIDE).lerp(HOLE_DIR, top).normalize();
  // the aim: on the bundle while square on; on the opening once on its axis, sliding from just outside the
  // wall to well inside it during the dive, so the torn rim passes the frame
  CT.set(XMID + lerp(A.tx, B.tx, f), model.position.y, 0);
  CE.copy(evGroup.position).addScaledVector(HOLE_DIR, lerp(RM + 4, -RM * 0.15, smooth((po - 0.45) / 0.55)));
  CT.lerp(CE, top);
  setCam(CD, CUP, Math.exp(lerp(Math.log(A.half), Math.log(B.half), f)), CT);
}

function progress() {
  const h = hero.offsetHeight - innerHeight;
  return h > 0 ? clamp(scrollY / h, 0, 1) : 0;
}
const txt = document.querySelector('.hero-text');
function titleAt(v) {
  txt.style.opacity = String(v);
  txt.style.transform = `translateY(${(1 - v) * 26}px)`;
  txt.style.visibility = v < 0.005 ? 'hidden' : 'visible';
  if (v > 0.02) txt.classList.add('is-revealed');
}
function fade() {
  const p = progress();
  const away = clamp(p / 0.20, 0, 1);            // the words leave early
  titleAt(1 - away);
  txt.style.transform = `translateY(${-away * 46}px)`;
  hero.classList.toggle('gone', away > 0.85);
}

// while it is building, the camera rides the growing end; by the end it has settled into the first shot
const ZDIR = new THREE.Vector3(0, 0, 1);
function introCam(e, a) {
  CT.set(grown(a - PRO) - 6.5, model.position.y, 0);
  setCam(ZDIR, CUP, 13, CT);
}

renderer.setAnimationLoop(() => {
  if (phase === 1) {
    let e = (performance.now() / 1000 - started) / INTRO;
    if (scrollY > 4) e = 1;                      // a scroll means: get on with it
    e = clamp(e, 0, 1);
    const a = GROW_A + (GROW_B - GROW_A) * ease(e);
    update(realFor(a)); introCam(e, a); draw(); note();
    titleAt(clamp((e - 0.74) / 0.26, 0, 1));
    if (e >= 1) { phase = 2; cur = want = HERO_A; }
    return;
  }
  want = timeAt(progress());
  cur += (want - cur) * 0.24;        // close enough to the scroll that the end is reached before the page is
  const pc = clamp((cur - HERO_A) / (HERO_B - HERO_A), 0, 1);
  // on the site the cover hands over to the page: while the camera dives into the hole, the scene dissolves
  // into the page behind it, so nothing of the model is left on screen when the cover scrolls away
  // (also tied to the scroll bar itself, so on a slow device, where the eased clock lags, the scene is still
  // gone by the time the cover ends)
  const out = Math.max(smooth((pc - 0.97) / 0.03), smooth((progress() - 0.88) / 0.10));
  // the scene sits in front of the page, so once the page starts to rise the empty space goes clear: the
  // page is seen only through the opening, and the torn rim passes in front of it
  const clear = progress() > 0.45;   // switched while the membrane fills the frame, so it cannot be seen
  scene.background = clear ? null : BG;
  inside.material.colorWrite = !clear;   // the ball inside still hides the far wall, but paints nothing
  renderer.domElement.style.opacity = String(1 - out);
  fade();
  if (out >= 1) {                    // fully dissolved: nothing left to draw
    if (progress() >= 1) seal();      // and through the hole: there is no way back out
    return;
  }
  // the frame is a function of cur and the scroll alone: when neither has moved, the last one still stands
  const prog = progress();
  if (!dirty && Math.abs(cur - lastCur) < 1e-4 && prog === lastProg && clear === lastClear) return;
  dirty = false; lastCur = cur; lastProg = prog; lastClear = clear;
  update(realFor(cur));
  coverCam(pc);
  draw(); note();
});

/* One way only: once the camera is through the hole the cover closes behind it. The track is replaced by
   a still title band and the scroll position moved by the difference in the same frame, so nothing on
   screen moves - but scrolling up now ends at the title instead of playing the film backwards. The scene is shut down too, which hands the GPU back to the rest of the page. */
let sealed = false;
function seal() {
  if (sealed) return;
  sealed = true;
  renderer.setAnimationLoop(null);
  const next = hero.nextElementSibling, before = next ? next.getBoundingClientRect().top : 0;
  // the whole track is swapped, in one go, for a still title band above the page; the scroll is moved by
  // whatever that changed, so the page stays exactly where it is on screen, and scrolling back up now
  // ends at the title instead of the film
  txt.style.cssText = '';           // drop the opacity / offset the scroll animation left on it
  hero.classList.add('hero--done', 'hero--titled');
  // measure rather than trust the arithmetic: browsers that anchor the scroll may already have moved it
  // instant: Bootstrap makes the page scroll smoothly, which would turn this correction into a visible slide
  if (next) scrollBy({ top: next.getBoundingClientRect().top - before, behavior: 'instant' });
  if (poseRT) poseRT.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  renderer.domElement.remove();
}

console.log(`cover ${HERO_A.toFixed(1)} - ${HERO_B.toFixed(1)} s`);
window.__total = 1;
// frame grabs: the first half of the range is the intro, the second half is the scroll
window.__seek = u => {
  renderer.setAnimationLoop(null);   // a frame grab holds still
  phase = 2;
  if (u < 0.5) { const e = u * 2, a = GROW_A + (GROW_B - GROW_A) * ease(e);
    update(realFor(a)); introCam(e, a); titleAt(clamp((e - 0.74) / 0.26, 0, 1)); }
  else { const p = (u - 0.5) * 2; cur = want = timeAt(p);
    const pc = clamp((cur - HERO_A) / (HERO_B - HERO_A), 0, 1);
      update(realFor(cur)); coverCam(clamp((cur - HERO_A) / (HERO_B - HERO_A), 0, 1)); titleAt(clamp(1 - p / 0.2, 0, 1)); }
  draw(); return renderer.domElement.toDataURL('image/png');
};
const dbg = document.createElement('div');
dbg.style.cssText = 'position:fixed;left:10px;top:10px;z-index:9;font:12px/1.6 monospace;color:#62c5d5;' +
  'background:rgba(7,17,32,.8);padding:8px 10px;border:1px solid #2b405d;white-space:pre';
if (location.search.includes('debug')) document.body.appendChild(dbg);
let frames = 0, fpsT = performance.now(), fps = 0;
function note() {
  frames++;
  const now = performance.now();
  if (now - fpsT > 500) { fps = frames / ((now - fpsT) / 1000); frames = 0; fpsT = now; }
  const r = renderer.info.render, m = renderer.info.memory;
  dbg.textContent = `fps ${fps.toFixed(0)}  phase ${phase}  prog ${progress().toFixed(2)}\n` +
    `geom ${m.geometries} tex ${m.textures}  draw ${r.calls}\n` +
    `atoms ${NAT}  lipids ${NL}  dpr ${renderer.getPixelRatio()}`;
}

renderer.domElement.addEventListener('webglcontextlost', e => {
  if (sealed) return;                    // our own shutdown after the seal, not a failure
  dbg.textContent = 'WEBGL CONTEXT LOST';
  document.body.appendChild(dbg);
  e.preventDefault(); console.warn('webgl context lost');
  renderer.setAnimationLoop(null);
  renderer.domElement.style.opacity = '0';
  hero.classList.remove('hero--live');   // back to the still title
});
window.__state = () => ({ phase, cur: +cur.toFixed(2), prog: +progress().toFixed(3),
  tris: renderer.info.render.triangles, calls: renderer.info.render.calls });
window.__ready = true;
