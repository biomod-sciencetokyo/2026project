/* =============================================================================
   Open Sesame - the cover animation
   Strands adrift in the dark gather into one rigid bundle; the bundle runs out
   across the frame and meets a vesicle held at the right edge; the vesicle
   splits along a seam of light, and the title arrives with it.
   Plain canvas, no libraries. It plays once and then drifts.
   Needs: an element with id="hero", and the .hero-canvas / .hero.lit rules.
   ========================================================================== */
(() => {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const cv = document.createElement('canvas');
  cv.className = 'hero-canvas';
  hero.insertBefore(cv, hero.firstChild);
  const g = cv.getContext('2d', { alpha: false });
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIn = t => Math.pow(clamp(t, 0, 1), 2.2);
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---- the beats, in seconds ---- */
  const T = { gather: [0.5, 2.4], lock: [2.1, 2.8], reach: [2.4, 3.4],
              crack: [3.2, 4.1], burst: [3.9, 5.1], settle: [4.9, 7.0] };
  const END = 7.0;

  /* ---- one soft dot per colour ---- */
  const mkDot = (r, gg, b) => {
    const s = 64, c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d'), rg = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    rg.addColorStop(0, `rgba(${r},${gg},${b},1)`);
    rg.addColorStop(0.3, `rgba(${r},${gg},${b},0.55)`);
    rg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = rg; x.fillRect(0, 0, s, s);
    return c;
  };
  const SP_CY = mkDot(98, 197, 213), SP_GOLD = mkDot(230, 196, 116), SP_PALE = mkDot(210, 247, 255);

  let W = 0, H = 0, DPR = 1, S = 1;
  let A, B, ORB, R, CP, NX, NY, AX, AY, LEN;   // bundle ends, vesicle, contact point, axes

  /* ---- the strands ---- */
  const N_B = 900, bundle = [];
  for (let i = 0; i < N_B; i++)
    bundle.push({ u: i / (N_B - 1), strand: i % 6,
                  sx: Math.random(), sy: Math.random(), delay: Math.random(),
                  wob: rnd(0, 6.28), wsp: rnd(0.5, 1.4) });

  /* ---- the vesicle, as a shell of points ---- */
  const N_O = 3000, orb = [];
  {
    const golden = Math.PI * (3 - Math.sqrt(5)), j = 0.03;
    for (let i = 0; i < N_O; i++) {
      const y = 1 - (i / (N_O - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), th = golden * i;
      orb.push({ x: Math.cos(th) * r + rnd(-j, j), y: y + rnd(-j, j), z: Math.sin(th) * r + rnd(-j, j),
                 fly: rnd(0.5, 1.6), dim: rnd(0.5, 1.2) });
    }
  }

  /* ---- the seam, drawn on the face we can see: branches running from the contact ---- */
  const seams = [];
  for (let k = 0; k < 5; k++) {
    const pts = [[0, 0]], n = 16;
    let a = -1.0 + k * 0.5 + rnd(-0.18, 0.18), d = 0;
    for (let i = 0; i < n; i++) {
      a += rnd(-0.19, 0.19); d += rnd(0.03, 0.055);   // it keeps heading out, with a tremble
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    seams.push({ pts, w: rnd(0.8, 1.6), lag: k * 0.09 });
  }

  const motes = [];
  for (let i = 0; i < 110; i++)
    motes.push({ x: Math.random(), y: Math.random(), r: rnd(0.4, 1.7),
                 sp: rnd(0.008, 0.04), ph: rnd(0, 6.28) });

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    S = Math.min(W, H);
    // the vesicle is held at the right edge, mostly outside the frame, so the words keep the middle
    ORB = { x: W * 0.95, y: H * 0.62 };
    R = S * 0.46;
    CP = { x: ORB.x - R * 0.95, y: ORB.y + R * 0.20 };      // where the bundle lands on its limb
    A = { x: -W * 0.06, y: H * 1.14 };                       // the bundle runs in from below left
    B = CP;
    const dx = B.x - A.x, dy = B.y - A.y;
    LEN = Math.hypot(dx, dy); AX = dx / LEN; AY = dy / LEN;  // along the bundle
    NX = -AY; NY = AX;                                       // across it
  }
  addEventListener('resize', resize);
  resize();

  const dot = (x, y, r, sp, al) => {
    if (al <= 0.004 || r <= 0) return;
    g.globalAlpha = al;
    g.drawImage(sp, x - r, y - r, r * 2, r * 2);
  };

  function ground(flash) {
    g.globalAlpha = 1;
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, '#0b1830'); lg.addColorStop(0.6, '#091426'); lg.addColorStop(1, '#0a1730');
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(CP.x, CP.y, 0, CP.x, CP.y, S * 1.25);
    rg.addColorStop(0, `rgba(150,205,230,${0.05 + 0.22 * flash})`);
    rg.addColorStop(0.35, `rgba(98,197,213,${0.03 + 0.10 * flash})`);
    rg.addColorStop(1, 'rgba(13,27,52,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }

  /* ---- a strand: adrift, then locked into the bundle, which then runs out ---- */
  const bp = { x: 0, y: 0, r: 0, a: 0 };
  function strandAt(p, t, gather, lock, reach) {
    const m = clamp((gather - p.delay * 0.45) / 0.55, 0, 1), e = easeOut(m);
    const run = LEN * (0.30 + 0.70 * easeOut(reach));
    const d = p.u * run;
    const th = (d / (S * 0.075)) + p.strand * (Math.PI / 3) + lock * 0.8;
    const rad = S * 0.030 * (0.30 + 0.70 * lock);
    const tx = A.x + AX * d + NX * Math.sin(th) * rad;
    const ty = A.y + AY * d + NY * Math.sin(th) * rad;
    const depth = (Math.cos(th) + 1) / 2;
    const wob = (1 - e) * S * 0.015;
    bp.x = lerp(p.sx * W, tx, e) + Math.sin(t * p.wsp + p.wob) * wob;
    bp.y = lerp(p.sy * H, ty, e) + Math.cos(t * p.wsp * 1.3 + p.wob) * wob;
    bp.r = S * (0.0020 + 0.0026 * depth) * (0.7 + 0.3 * e);
    bp.a = (0.45 + 0.45 * e) * (0.35 + 0.65 * depth);
    return bp;
  }

  /* Once the strands have locked, the bundle is drawn as six continuous helices rather than loose
     points - a line stays solid however far it runs, where a trail of dots thins out as it stretches. */
  function drawStrands(t, lock, reach) {
    if (lock <= 0.01) return;
    const run = LEN * (0.30 + 0.70 * easeOut(reach));
    const rad = S * 0.030 * (0.30 + 0.70 * lock);
    const step = Math.max(3, run / 420);
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      const ph = k * (Math.PI / 3) + lock * 0.8;
      // split the helix where it passes behind, so the braid reads as one body turning
      let open = false, front = false, tap = 0;
      for (let d = 0; d <= run; d += step) {
        const th = d / (S * 0.075) + ph, c = Math.cos(th);
        const x = A.x + AX * d + NX * Math.sin(th) * rad;
        const y = A.y + AY * d + NY * Math.sin(th) * rad;
        const f = c > 0;
        if (!open || f !== front) {
          if (open) strokeStrand(front, lock * tap);
          g.beginPath(); g.moveTo(x, y); open = true; front = f;
          tap = ease(d / (run * 0.22));           // it fades up out of the dark at its tail
        } else g.lineTo(x, y);
      }
      if (open) strokeStrand(front, lock * tap);
    }
    g.globalCompositeOperation = 'source-over';
  }
  function strokeStrand(front, lock) {
    const w = S * 0.0045 * (front ? 1 : 0.7);
    g.strokeStyle = 'rgb(98,197,213)'; g.globalAlpha = (front ? 0.22 : 0.12) * lock;
    g.lineWidth = w * 5; g.stroke();
    g.strokeStyle = front ? 'rgb(170,235,250)' : 'rgb(70,150,170)';
    g.globalAlpha = (front ? 0.95 : 0.45) * lock; g.lineWidth = w; g.stroke();
    g.globalAlpha = 1;
  }

  function drawBundle(t, gather, lock, reach) {
    const fade = 1 - lock;                 // the loose points hand over to the solid helices
    if (fade > 0.01) {
      g.globalCompositeOperation = 'lighter';
      for (const p of bundle) {
        const q = strandAt(p, t, gather, lock, reach);
        dot(q.x, q.y, q.r * 4.0, SP_CY, q.a * 0.20 * fade);
        dot(q.x, q.y, q.r, SP_CY, q.a * fade);
      }
      g.globalCompositeOperation = 'source-over';
    }
    drawStrands(t, lock, reach);
  }

  function drawOrb(t, crack, burst, settle) {
    const open = easeIn(crack), blow = easeOut(burst), rot = t * 0.05;
    g.globalCompositeOperation = 'lighter';
    for (const p of orb) {
      const c = Math.cos(rot), s2 = Math.sin(rot);
      const x = p.x * c - p.z * s2, z = p.x * s2 + p.z * c, y = p.y;
      // how close this point is to where the seam runs
      const near = clamp(1 - Math.hypot(x + 0.90, y - 0.22) * 0.9, 0, 1);
      const push = blow * (0.3 + p.fly) * (0.2 + near) * (1 - 0.45 * settle);
      const rr = R * (1 + push * 0.16);
      const px = ORB.x + x * rr, py = ORB.y + y * rr;
      if (px < -20 || py < -20 || py > H + 20) continue;
      const depth = (z + 1) / 2;
      const base = (0.13 + 0.92 * depth * depth) * p.dim;
      const hot = near * (open * 0.75 + blow * 0.9);
      const r = S * (0.0016 + 0.0022 * depth) * (1 + 0.9 * hot);
      dot(px, py, r * 3.4, SP_CY, base * 0.22 * (1 - 0.25 * blow));
      dot(px, py, r, hot > 0.3 ? SP_GOLD : SP_CY, base * (0.9 + 0.8 * hot));
      if (hot > 0.65) dot(px, py, r * 2.0, SP_PALE, (hot - 0.65) * 0.9);
    }
    g.globalCompositeOperation = 'source-over';

    if (crack <= 0) return;
    // the seam: light running out from the contact, brightest as it breaks, then dying down
    const live = (0.35 + 0.65 * easeOut(burst)) * (1 - 0.8 * settle);
    if (live <= 0.02) return;
    g.save();
    g.beginPath(); g.arc(ORB.x, ORB.y, R * (0.99 + 0.16 * blow), 0, 6.3); g.clip();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const px = i => CP.x + i[0] * R * 1.45, py = i => CP.y + i[1] * R * 1.45;
    for (const s of seams) {
      const grow = clamp((crack - s.lag) / (1 - s.lag), 0, 1);
      if (grow <= 0) continue;
      const n = Math.max(2, Math.round((s.pts.length - 1) * easeOut(grow)));
      g.beginPath(); g.moveTo(px(s.pts[0]), py(s.pts[0]));
      for (let i = 1; i < n; i++) {               // smoothed, so it reads as a tear, not a polygon
        const a = s.pts[i], b = s.pts[Math.min(i + 1, n)];
        g.quadraticCurveTo(px(a), py(a), (px(a) + px(b)) / 2, (py(a) + py(b)) / 2);
      }
      const k = (S / 800) * s.w;
      g.strokeStyle = 'rgb(214,150,40)'; g.globalAlpha = live * 0.40;
      g.lineWidth = k * (3.5 + 5 * blow); g.stroke();
      g.strokeStyle = 'rgb(255,205,105)'; g.globalAlpha = live * 0.8;
      g.lineWidth = k * (1.1 + 1.4 * blow); g.stroke();
      g.strokeStyle = 'rgb(255,250,238)'; g.globalAlpha = live;
      g.lineWidth = k * (0.4 + 0.5 * blow); g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
    g.globalCompositeOperation = 'source-over';
  }

  const sparks = [];
  for (let i = 0; i < 220; i++)
    sparks.push({ a: rnd(-1.5, 1.5), v: rnd(0.3, 1.9), s: rnd(0.5, 2.0), d: rnd(0, 0.4) });
  function drawSparks(burst, settle) {
    if (burst <= 0) return;
    g.globalCompositeOperation = 'lighter';
    for (const s of sparks) {
      const m = clamp((burst - s.d) / (1 - s.d), 0, 1);
      if (m <= 0) continue;
      const d = R * easeOut(m) * s.v * 0.55;
      const x = CP.x - Math.cos(s.a) * d, y = CP.y + Math.sin(s.a) * d;
      dot(x, y, S * 0.0016 * s.s * (1 + m), (s.a * 7 % 1) < 0.45 ? SP_GOLD : SP_PALE,
          (1 - m) * 0.8 * (1 - 0.5 * settle));
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawMotes(t) {
    g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const y = (m.y + t * m.sp) % 1;
      dot(m.x * W, y * H, S * 0.0013 * m.r, SP_CY,
          0.09 + 0.13 * (0.5 + 0.5 * Math.sin(t * 1.1 + m.ph)));
    }
    g.globalCompositeOperation = 'source-over';
  }

  const span = ([a, b], t) => clamp((t - a) / (b - a), 0, 1);
  let lit = false;

  function frame(t) {
    const gather = ease(span(T.gather, t)), lock = ease(span(T.lock, t));
    const reach = span(T.reach, t), crack = span(T.crack, t);
    const burst = span(T.burst, t), settle = ease(span(T.settle, t));
    const flash = easeOut(burst) * (1 - 0.8 * settle);

    ground(flash);
    drawMotes(t);
    drawBundle(t, gather, lock, reach);
    drawOrb(t, crack, burst, settle);
    drawSparks(burst, settle);

    // the moment it gives way
    const hit = Math.max(0, 1 - Math.abs(t - (T.burst[0] + 0.25)) / 0.45);
    if (hit > 0) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1;
      const rg = g.createRadialGradient(CP.x, CP.y, 0, CP.x, CP.y, S * 0.9);
      const k = hit * hit;
      rg.addColorStop(0, `rgba(255,243,219,${0.30 * k})`);
      rg.addColorStop(0.25, `rgba(190,225,240,${0.12 * k})`);
      rg.addColorStop(1, 'rgba(98,197,213,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }

    if (!lit && t > T.burst[0] + 0.3) { lit = true; hero.classList.add('lit'); }
  }

  let t0 = performance.now() / 1000;
  function loop() { frame(performance.now() / 1000 - t0); requestAnimationFrame(loop); }
  if (REDUCED) { frame(END); hero.classList.add('lit'); } else loop();
})();
