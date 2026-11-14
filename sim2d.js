/* =========================================================
   Interactive 2D CG membrane simulator
   JavaScript port of code/cg2d_membrane_simulation.py
   (same force field, integrator and parameters; the random number
   stream differs from NumPy, so individual trajectories are not
   bit-identical to the Python output, only statistically equivalent).
   ========================================================= */
(function (root) {
    'use strict';

    // ---------- Seeded RNG (mulberry32 + Box-Muller) ----------
    function makeRng(seed) {
        let a = seed >>> 0;
        let spare = null;
        function uniform() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        function normal() {
            if (spare !== null) { const s = spare; spare = null; return s; }
            let u = 0, v = 0;
            while (u === 0) u = uniform();
            v = uniform();
            const r = Math.sqrt(-2.0 * Math.log(u));
            spare = r * Math.sin(2 * Math.PI * v);
            return r * Math.cos(2 * Math.PI * v);
        }
        return { uniform, normal };
    }

    function linspace(a, b, n) {
        const out = new Float64Array(n);
        if (n === 1) { out[0] = a; return out; }
        const step = (b - a) / (n - 1);
        for (let i = 0; i < n; i++) out[i] = a + step * i;
        return out;
    }

    // arc_step: writes dx, dy, ddx/dk, ddy/dk into ARC
    const ARC = new Float64Array(4);
    function arcStep(ds, k) {
        if (Math.abs(k) < 1e-4) {
            ARC[0] = ds - (k * k) * (ds * ds * ds) / 6.0;
            ARC[1] = 0.5 * k * (ds * ds);
            ARC[2] = -k * (ds * ds * ds) / 3.0;
            ARC[3] = 0.5 * (ds * ds);
        } else {
            const kd = k * ds, sn = Math.sin(kd), cs = Math.cos(kd);
            ARC[0] = sn / k;
            ARC[1] = (1.0 - cs) / k;
            ARC[2] = (ds * cs * k - sn) / (k * k);
            ARC[3] = (ds * sn * k - (1.0 - cs)) / (k * k);
        }
    }

    const M = 5;          // n_segments
    const MID = 2;        // M // 2
    const NQ = 3 + M;     // generalized coordinates of the DNA Bundle

    // Solve A x = b (dense, partial pivoting). A is NQxNQ row-major, modified.
    function solveDense(A, b, n) {
        for (let c = 0; c < n; c++) {
            let p = c, best = Math.abs(A[c * n + c]);
            for (let r = c + 1; r < n; r++) {
                const v = Math.abs(A[r * n + c]);
                if (v > best) { best = v; p = r; }
            }
            if (p !== c) {
                for (let k = 0; k < n; k++) {
                    const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t;
                }
                const t = b[c]; b[c] = b[p]; b[p] = t;
            }
            const piv = A[c * n + c];
            for (let r = c + 1; r < n; r++) {
                const f = A[r * n + c] / piv;
                if (f === 0) continue;
                for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
                b[r] -= f * b[c];
            }
        }
        for (let r = n - 1; r >= 0; r--) {
            let s = b[r];
            for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
            b[r] = s / A[r * n + r];
        }
        return b;
    }

    class CG2DSim {
        constructor(opts) {
            const o = opts || {};
            this.R = o.R != null ? o.R : 50;
            this.alpha = o.alpha != null ? o.alpha : 0.9;
            this.l0 = o.l0 != null ? o.l0 : 2.5;
            this.seed = o.seed != null ? o.seed : 1;
            this.rng = makeRng(this.seed);

            // ---- parameters (identical to the Python script) ----
            const kBT = 4.11;
            this.kBT = kBT;
            this.dt = 0.0001;
            this.substeps = 100;
            this.totalFrames = o.totalFrames || 100;

            const R = this.R;
            const n = Math.floor(240 * (R / 150.0));
            this.n = n;
            this.mx = new Float64Array(n);
            this.my = new Float64Array(n);
            for (let i = 0; i < n; i++) {
                const a = 2 * Math.PI * i / n;
                this.mx[i] = R * Math.cos(a);
                this.my[i] = R * Math.sin(a);
            }
            this.bonds = new Uint8Array(n).fill(1);
            this.r0 = Math.hypot(this.mx[1] - this.mx[0], this.my[1] - this.my[0]);
            this.area0 = Math.PI * R * R;

            this.k_mem = 150.0;
            this.k_bend = 25.0 * kBT / this.r0;
            this.k_area = 160.0;
            this.critical = 150.0;

            this.L_bundle = 3 * R;
            this.L_seg = this.L_bundle / M;
            this.edges = linspace(-this.L_bundle / 2, this.L_bundle / 2, M + 1);

            const N_chains = 12;
            this.r_dna = 1.25 * Math.sqrt(N_chains);
            const Lp = 2.0 * N_chains + 120.0 * Math.pow(N_chains * this.alpha, 3.0);
            this.B = Lp * kBT;

            const jitter = this.rng.uniform() * 0.06 - 0.03;
            const base = o.baseAngle != null ? o.baseAngle : jitter;
            const d0 = R + 20.0;
            this.px = d0 * Math.cos(base);
            this.py = d0 * Math.sin(base);
            this.ang = base - Math.PI / 2;
            this.kap = new Float64Array(M);
            this.approaching = true;

            // anchors / cholesterol
            const spacing = 15 * 0.34;
            this.nA = Math.floor(this.L_bundle / spacing) + 1;
            this.anchorS = linspace(-this.L_bundle / 2, this.L_bundle / 2, this.nA);
            this.L_contour = this.l0 + 6.0;
            this.linker_flex = 6.0;
            this.k_linker = 10.0;

            this.gamma_mem = 1.0;
            this.sig_mem = Math.sqrt(2 * this.gamma_mem * kBT * this.dt);
            this.gamma_chol = 0.2;
            this.sig_chol = Math.sqrt(2 * this.gamma_chol * kBT * this.dt);
            this.gamma_trans = 1.5 * (this.L_bundle / 100.0);
            this.gamma_rot = (this.L_bundle * this.L_bundle) / 12.0;
            const w = [1.2, 2.0, 3.2, 2.0, 1.2];
            this.gamma_kap = new Float64Array(M);
            for (let m = 0; m < M; m++) this.gamma_kap[m] = (Math.pow(this.L_seg, 3) / 6.0) * w[m];

            this.r_rep = this.r_dna + 1.0;
            this.k_rep = 200.0;
            this.approach_speed = 70.0;
            this.nP = Math.max(15, Math.floor(this.L_bundle / 3.0));
            this.pointS = linspace(-this.L_bundle / 2, this.L_bundle / 2, this.nP);

            // work buffers
            this.bufA = this._makeChainBuf(this.nA);
            this.bufP = this._makeChainBuf(this.nP);
            this.nodeX = new Float64Array(M + 1);
            this.nodeY = new Float64Array(M + 1);
            this.nodePhi = new Float64Array(M + 1);
            this.dnX = new Float64Array((M + 1) * M);
            this.dnY = new Float64Array((M + 1) * M);
            this.dnPhi = new Float64Array((M + 1) * M);
            this.fmx = new Float64Array(n);
            this.fmy = new Float64Array(n);
            this.nx = new Float64Array(n);
            this.ny = new Float64Array(n);
            this.fcx = new Float64Array(this.nA);
            this.fcy = new Float64Array(this.nA);
            this.fKap = new Float64Array(M);
            this.H = new Float64Array(NQ * NQ);
            this.Aq = new Float64Array(NQ * NQ);
            this.bq = new Float64Array(NQ);
            this.jac0 = new Float64Array(NQ);
            this.jac1 = new Float64Array(NQ);

            // initial cholesterol positions (straight bundle, offset by l0)
            this.cx = new Float64Array(this.nA);
            this.cy = new Float64Array(this.nA);
            this.chain(this.anchorS, this.bufA);
            const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
            for (let i = 0; i < this.nA; i++) {
                const dx = this.bufA.X[i], dy = this.bufA.Y[i] - this.l0;
                this.cx[i] = this.px + dx * ca - dy * sa;
                this.cy[i] = this.py + dx * sa + dy * ca;
            }

            this.frame = 0;
            this.eventFrame = -1;     // first bond rupture (model-defined local event)
            this.ruptureIdx = -1;
            this.maxTension = 0;
        }

        _makeChainBuf(np) {
            return {
                n: np,
                X: new Float64Array(np),
                Y: new Float64Array(np),
                GX: new Float64Array(M * np),   // GX[m * np + i]
                GY: new Float64Array(M * np),
            };
        }

        // Port of get_chained_dna_local (positions + d/dkappa Jacobian)
        chain(s, buf) {
            const kap = this.kap, Ls = this.L_seg, E = this.edges;
            const nX = this.nodeX, nY = this.nodeY, nP = this.nodePhi;
            const dX = this.dnX, dY = this.dnY, dP = this.dnPhi;
            nX.fill(0); nY.fill(0); nP.fill(0); dX.fill(0); dY.fill(0); dP.fill(0);

            const sR = E[MID + 1];
            arcStep(sR, kap[MID]);
            nX[MID + 1] = ARC[0]; nY[MID + 1] = ARC[1];
            nP[MID + 1] = kap[MID] * sR;
            dX[(MID + 1) * M + MID] = ARC[2]; dY[(MID + 1) * M + MID] = ARC[3];
            dP[(MID + 1) * M + MID] = sR;

            const sL = E[MID];
            arcStep(sL, kap[MID]);
            nX[MID] = ARC[0]; nY[MID] = ARC[1];
            nP[MID] = kap[MID] * sL;
            dX[MID * M + MID] = ARC[2]; dY[MID * M + MID] = ARC[3];
            dP[MID * M + MID] = sL;

            for (let m = MID + 1; m < M; m++) {
                const ds = Ls, k = kap[m], phi0 = nP[m];
                const c = Math.cos(phi0), sn = Math.sin(phi0);
                arcStep(ds, k);
                const sx = c * ARC[0] - sn * ARC[1];
                const sy = sn * ARC[0] + c * ARC[1];
                nX[m + 1] = nX[m] + sx;
                nY[m + 1] = nY[m] + sy;
                nP[m + 1] = phi0 + k * ds;
                for (let j = 0; j < M; j++) {
                    const dphi0 = dP[m * M + j];
                    dX[(m + 1) * M + j] = dX[m * M + j] - sy * dphi0;
                    dY[(m + 1) * M + j] = dY[m * M + j] + sx * dphi0;
                    dP[(m + 1) * M + j] = dphi0;
                }
                dX[(m + 1) * M + m] += c * ARC[2] - sn * ARC[3];
                dY[(m + 1) * M + m] += sn * ARC[2] + c * ARC[3];
                dP[(m + 1) * M + m] += ds;
            }

            for (let m = MID - 1; m >= 0; m--) {
                const ds = -Ls, k = kap[m], phi0 = nP[m + 1];
                const c = Math.cos(phi0), sn = Math.sin(phi0);
                arcStep(ds, k);
                const sx = c * ARC[0] - sn * ARC[1];
                const sy = sn * ARC[0] + c * ARC[1];
                nX[m] = nX[m + 1] + sx;
                nY[m] = nY[m + 1] + sy;
                nP[m] = phi0 + k * ds;
                for (let j = 0; j < M; j++) {
                    const dphi0 = dP[(m + 1) * M + j];
                    dX[m * M + j] = dX[(m + 1) * M + j] - sy * dphi0;
                    dY[m * M + j] = dY[(m + 1) * M + j] + sx * dphi0;
                    dP[m * M + j] = dphi0;
                }
                dX[m * M + m] += c * ARC[2] - sn * ARC[3];
                dY[m * M + m] += sn * ARC[2] + c * ARC[3];
                dP[m * M + m] += ds;
            }

            const np = buf.n, X = buf.X, Y = buf.Y, GX = buf.GX, GY = buf.GY;
            GX.fill(0); GY.fill(0);
            for (let i = 0; i < np; i++) {
                const sv = s[i];
                let m = Math.floor((sv - E[0]) / Ls);
                if (m < 0) m = 0; else if (m > M - 1) m = M - 1;
                const k = kap[m];
                if (m === MID) {
                    arcStep(sv, k);
                    X[i] = ARC[0]; Y[i] = ARC[1];
                    GX[m * np + i] = ARC[2]; GY[m * np + i] = ARC[3];
                } else {
                    const node = m > MID ? m : m + 1;
                    const ds = sv - E[node];
                    const phi0 = nP[node];
                    const c = Math.cos(phi0), sn = Math.sin(phi0);
                    arcStep(ds, k);
                    const sx = c * ARC[0] - sn * ARC[1];
                    const sy = sn * ARC[0] + c * ARC[1];
                    X[i] = nX[node] + sx;
                    Y[i] = nY[node] + sy;
                    for (let j = 0; j < M; j++) {
                        const dphi0 = dP[node * M + j];
                        GX[j * np + i] = dX[node * M + j] - sy * dphi0;
                        GY[j * np + i] = dY[node * M + j] + sx * dphi0;
                    }
                    GX[m * np + i] += c * ARC[2] - sn * ARC[3];
                    GY[m * np + i] += sn * ARC[2] + c * ARC[3];
                }
            }
        }

        substep() {
            const n = this.n, mx = this.mx, my = this.my, bonds = this.bonds;
            const fmx = this.fmx, fmy = this.fmy, nx = this.nx, ny = this.ny;
            const fcx = this.fcx, fcy = this.fcy, fKap = this.fKap, H = this.H;
            const dt = this.dt, rng = this.rng;
            fmx.fill(0); fmy.fill(0); fcx.fill(0); fcy.fill(0); fKap.fill(0); H.fill(0);
            let fpx = 0, fpy = 0, fAng = 0;

            // membrane normals
            for (let i = 0; i < n; i++) {
                const ip = (i + 1) % n, im = (i - 1 + n) % n;
                const tx = mx[ip] - mx[im], ty = my[ip] - my[im];
                const nr = Math.hypot(tx, ty) + 1e-9;
                nx[i] = ty / nr;
                ny[i] = -tx / nr;
            }

            // driven approach until the docking distance is reached
            if (this.approaching) {
                const dist = Math.hypot(this.px, this.py);
                if (dist > this.R + this.r_dna + this.l0 * 0.5) {
                    const ux = -this.px / dist * this.approach_speed * dt;
                    const uy = -this.py / dist * this.approach_speed * dt;
                    this.px += ux; this.py += uy;
                    for (let i = 0; i < this.nA; i++) { this.cx[i] += ux; this.cy[i] += uy; }
                } else {
                    this.approaching = false;
                }
            }

            let intact = true;
            for (let i = 0; i < n; i++) if (!bonds[i]) { intact = false; break; }

            // stretching springs + rupture criterion
            for (let i = 0; i < n; i++) {
                if (!bonds[i]) continue;
                const j = (i + 1) % n;
                const dx = mx[j] - mx[i], dy = my[j] - my[i];
                const r = Math.hypot(dx, dy) + 1e-9;
                const tension = this.k_mem * (r - this.r0);
                if (tension > this.critical) {
                    bonds[i] = 0;
                    if (this.eventFrame < 0) { this.eventFrame = this.frame; this.ruptureIdx = i; }
                    continue;
                }
                const fx = tension * dx / r, fy = tension * dy / r;
                fmx[i] += fx; fmy[i] += fy;
                fmx[j] -= fx; fmy[j] -= fy;
            }

            // bending
            const kb = this.k_bend;
            for (let i = 0; i < n; i++) {
                const ip = (i - 1 + n) % n, inx = (i + 1) % n;
                if (bonds[ip] && bonds[i]) {
                    const Cx = mx[ip] - 2 * mx[i] + mx[inx];
                    const Cy = my[ip] - 2 * my[i] + my[inx];
                    const bx = kb * Cx, by = kb * Cy;
                    fmx[ip] -= 0.5 * bx; fmy[ip] -= 0.5 * by;
                    fmx[i] += bx; fmy[i] += by;
                    fmx[inx] -= 0.5 * bx; fmy[inx] -= 0.5 * by;
                }
            }

            // area (osmotic) constraint while the contour is closed
            if (intact) {
                let s = 0;
                for (let i = 0; i < n; i++) {
                    const j = (i + 1) % n;
                    s += mx[i] * my[j] - mx[j] * my[i];
                }
                const area = 0.5 * Math.abs(s);
                const strain = (area - this.area0) / this.area0;
                const fp = -this.k_area * strain * this.r0;
                for (let i = 0; i < n; i++) { fmx[i] += fp * nx[i]; fmy[i] += fp * ny[i]; }
            }

            // ---- DNA Bundle: linkers and cholesterol ----
            const ca = Math.cos(this.ang), sa = Math.sin(this.ang);
            const bA = this.bufA, nA = this.nA;
            this.chain(this.anchorS, bA);
            const l0 = this.l0, Lc = this.L_contour, kL = this.k_linker, flex = this.linker_flex;
            const range = 24.0 + l0;
            const j0 = this.jac0, j1 = this.jac1;

            for (let i = 0; i < nA; i++) {
                const dxl = bA.X[i], dyl = bA.Y[i];
                const ax = this.px + dxl * ca - dyl * sa;
                const ay = this.py + dxl * sa + dyl * ca;
                const cxi = this.cx[i], cyi = this.cy[i];

                let best = Infinity, ci = 0;
                for (let k = 0; k < n; k++) {
                    const ddx = mx[k] - cxi, ddy = my[k] - cyi;
                    const d2 = ddx * ddx + ddy * ddy;
                    if (d2 < best) { best = d2; ci = k; }
                }
                const r_mc = Math.sqrt(best);

                // linker force on cholesterol
                const drx = cxi - ax, dry = cyi - ay;
                const dRaw = Math.hypot(drx, dry);
                const distance = dRaw + 1e-9;
                const stretch = distance - l0;
                let mag;
                if (stretch >= 0) {
                    mag = distance < Lc ? kL * stretch : kL * flex + 18.0 * (distance - Lc);
                } else {
                    mag = 3.0 * stretch;
                }
                const flx = -mag * drx / distance, fly = -mag * dry / distance;
                fcx[i] += flx; fcy[i] += fly;

                // equal and opposite reaction on the DNA coordinates
                const Fx = -flx, Fy = -fly;
                fpx += Fx; fpy += Fy;
                fAng += Fx * (-dxl * sa - dyl * ca) + Fy * (dxl * ca - dyl * sa);
                const lx = Fx * ca + Fy * sa, ly = -Fx * sa + Fy * ca;
                for (let m = 0; m < M; m++) fKap[m] += lx * bA.GX[m * nA + i] + ly * bA.GY[m * nA + i];

                // tangent stiffness for the semi-implicit solve
                const st2 = dRaw - l0;
                const kt = (st2 >= 0 && st2 < flex) ? kL : (st2 < 0 ? 3.0 : 18.0);
                j0[0] = 1; j0[1] = 0; j0[2] = -dxl * sa - dyl * ca;
                j1[0] = 0; j1[1] = 1; j1[2] = dxl * ca - dyl * sa;
                for (let m = 0; m < M; m++) {
                    const gx = bA.GX[m * nA + i], gy = bA.GY[m * nA + i];
                    j0[3 + m] = ca * gx - sa * gy;
                    j1[3 + m] = sa * gx + ca * gy;
                }
                for (let r = 0; r < NQ; r++) {
                    const a0 = kt * j0[r], a1 = kt * j1[r];
                    for (let c = 0; c < NQ; c++) H[r * NQ + c] += a0 * j0[c] + a1 * j1[c];
                }

                // cholesterol–membrane capture
                if (r_mc < range) {
                    const dmx = mx[ci] - cxi, dmy = my[ci] - cyi;
                    const fmag = r_mc > 1.5 ? 32.0 : 120.0 * (r_mc - 1.0);
                    const fvx = fmag * dmx / (r_mc + 1e-9), fvy = fmag * dmy / (r_mc + 1e-9);
                    const dn = fvx * nx[ci] + fvy * ny[ci];
                    const fnx = dn * nx[ci], fny = dn * ny[ci];
                    const im2 = (ci - 2 + n) % n, im1 = (ci - 1 + n) % n;
                    const ip1 = (ci + 1) % n, ip2 = (ci + 2) % n;
                    fmx[ci] -= fnx * 0.40; fmy[ci] -= fny * 0.40;
                    fmx[im1] -= fnx * 0.20; fmy[im1] -= fny * 0.20;
                    fmx[ip1] -= fnx * 0.20; fmy[ip1] -= fny * 0.20;
                    fmx[im2] -= fnx * 0.10; fmy[im2] -= fny * 0.10;
                    fmx[ip2] -= fnx * 0.10; fmy[ip2] -= fny * 0.10;
                    fcx[i] += fvx + rng.normal() * this.sig_chol / dt;
                    fcy[i] += fvy + rng.normal() * this.sig_chol / dt;
                }
            }

            // DNA–membrane excluded volume
            const bP = this.bufP, nP = this.nP;
            this.chain(this.pointS, bP);
            const rr = this.r_rep, kr = this.k_rep;
            for (let s = 0; s < nP; s++) {
                const dxl = bP.X[s], dyl = bP.Y[s];
                const ppx = this.px + dxl * ca - dyl * sa;
                const ppy = this.py + dxl * sa + dyl * ca;
                for (let j = 0; j < n; j++) {
                    const drx = mx[j] - ppx, dry = my[j] - ppy;
                    if (Math.abs(drx) >= rr || Math.abs(dry) >= rr) continue;
                    const d = Math.hypot(drx, dry);
                    if (d >= rr) continue;
                    const f = kr * (rr - d) / (d + 1e-9);
                    const frx = f * drx, fry = f * dry;
                    const dn = frx * nx[j] + fry * ny[j];
                    const rx = dn * nx[j], ry = dn * ny[j];
                    fmx[j] += rx; fmy[j] += ry;
                    const Fx = -rx, Fy = -ry;
                    fpx += Fx; fpy += Fy;
                    fAng += Fx * (-dxl * sa - dyl * ca) + Fy * (dxl * ca - dyl * sa);
                    const lx = Fx * ca + Fy * sa, ly = -Fx * sa + Fy * ca;
                    for (let m = 0; m < M; m++) fKap[m] += lx * bP.GX[m * nP + s] + ly * bP.GY[m * nP + s];
                }
            }

            const BL = this.B * this.L_seg;
            for (let m = 0; m < M; m++) fKap[m] -= BL * this.kap[m];

            // ---- integrate (overdamped) ----
            const gm = this.gamma_mem, sm = this.sig_mem;
            for (let i = 0; i < n; i++) {
                mx[i] += ((fmx[i] + rng.normal() * sm / dt) / gm) * dt;
                my[i] += ((fmy[i] + rng.normal() * sm / dt) / gm) * dt;
            }
            const gc = this.gamma_chol;
            for (let i = 0; i < nA; i++) {
                this.cx[i] += (fcx[i] / gc) * dt;
                this.cy[i] += (fcy[i] / gc) * dt;
            }

            // semi-implicit 8x8 update of DNA translation, rotation and curvature
            const A = this.Aq, b = this.bq;
            for (let k = 0; k < NQ * NQ; k++) A[k] = H[k];
            for (let m = 0; m < M; m++) A[(3 + m) * NQ + (3 + m)] += BL;
            A[0] += this.gamma_trans / dt;
            A[1 * NQ + 1] += this.gamma_trans / dt;
            A[2 * NQ + 2] += this.gamma_rot / dt;
            for (let m = 0; m < M; m++) A[(3 + m) * NQ + (3 + m)] += this.gamma_kap[m] / dt;
            b[0] = fpx; b[1] = fpy; b[2] = fAng;
            for (let m = 0; m < M; m++) b[3 + m] = fKap[m];
            solveDense(A, b, NQ);
            this.px += b[0];
            this.py += b[1];
            this.ang += b[2];
            for (let m = 0; m < M; m++) this.kap[m] += b[3 + m];
        }

        // One animation frame of the Python script (= `substeps` substeps)
        stepFrame() {
            if (this.frame >= this.totalFrames) return false;
            for (let k = 0; k < this.substeps; k++) this.substep();
            this.frame += 1;
            let mt = 0;
            for (let i = 0; i < this.n; i++) {
                if (!this.bonds[i]) continue;
                const j = (i + 1) % this.n;
                const t = this.k_mem * (Math.hypot(this.mx[j] - this.mx[i], this.my[j] - this.my[i]) - this.r0);
                if (t > mt) mt = t;
            }
            this.maxTension = mt;
            return true;
        }

        get done() { return this.frame >= this.totalFrames; }
    }

    CG2DSim.bendingRigidity = function (alpha) {
        return (2.0 * 12 + 120.0 * Math.pow(12 * alpha, 3.0)) * 4.11;
    };

    root.CG2DSim = CG2DSim;
    if (typeof module !== 'undefined' && module.exports) module.exports = CG2DSim;

    // =========================================================
    // UI (only in the browser, only if the simulator block exists)
    // =========================================================
    if (typeof document === 'undefined') return;

    // matplotlib "turbo" colormap (polynomial approximation)
    function turbo(x) {
        x = Math.min(1, Math.max(0, x));
        const r = 0.13572138 + x * (4.61539260 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
        const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
        const b = 0.10667330 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
        const c = v => Math.round(255 * Math.min(1, Math.max(0, v)));
        return `rgb(${c(r)},${c(g)},${c(b)})`;
    }

    function formatSci(v) {
        const e = Math.floor(Math.log10(v));
        const m = v / Math.pow(10, e);
        if (e < 3) return `${Math.round(v)}`;
        return `${m.toFixed(2)} × 10<sup>${e}</sup>`;
    }

    function niceStep(range) {
        const raw = range / 4;
        const p = Math.pow(10, Math.floor(Math.log10(raw)));
        const f = raw / p;
        return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
    }

    function initUI(el) {
        const canvas = el.querySelector('.sim-live-canvas');
        const ctx = canvas.getContext('2d');
        const q = sel => el.querySelector(sel);
        const rButtons = Array.from(el.querySelectorAll('[data-sim-r]'));
        const presetButtons = Array.from(el.querySelectorAll('[data-preset]'));
        const inA = q('[data-sim="alpha"]');
        const inL = q('[data-sim="l0"]');
        const inSeed = q('[data-sim="seed"]');
        const barFrame = q('[data-sim-out="frame-bar"]');
        let currentR = 50;
        const pressed = rButtons.find(b => b.getAttribute('aria-pressed') === 'true');
        if (pressed) currentR = parseFloat(pressed.dataset.simR);

        function setR(v) {
            currentR = v;
            rButtons.forEach(b => b.setAttribute('aria-pressed', parseFloat(b.dataset.simR) === v ? 'true' : 'false'));
        }
        function setPreset(btn) {
            presetButtons.forEach(b => b.classList.toggle('is-active', b === btn));
        }
        function paintRange(inp) {
            const min = parseFloat(inp.min), max = parseFloat(inp.max), v = parseFloat(inp.value);
            inp.style.setProperty('--fill', `${((v - min) / (max - min) * 100).toFixed(2)}%`);
        }
        const FPS = 20;            // fixed playback speed (same as the Python GIF output)
        const btnRun = q('[data-sim="run"]');
        const btnReset = q('[data-sim="reset"]');
        const btnShuffle = q('[data-sim="shuffle"]');
        const outB = q('[data-sim-out="B"]');
        const outL = q('[data-sim-out="l0"]');
        const outFrame = q('[data-sim-out="frame"]');
        const outTension = q('[data-sim-out="tension"]');
        const barTension = q('[data-sim-out="tension-bar"]');
        const outStatus = q('[data-sim-out="status"]');

        let sim = null;
        let running = false;
        let visible = true;
        let carry = 0;
        let lastT = null;

        function readParams() {
            return {
                R: currentR,
                alpha: parseFloat(inA.value),
                l0: parseFloat(inL.value),
                seed: (parseInt(inSeed.value, 10) >>> 0) || 1,
            };
        }

        function updateLabels() {
            const a = parseFloat(inA.value);
            const B = CG2DSim.bendingRigidity(a);
            outB.innerHTML = formatSci(B);
            inA.setAttribute('aria-valuetext', B.toExponential(2) + ' pN nm squared');
            outL.textContent = parseFloat(inL.value).toFixed(1);
            paintRange(inA);
            paintRange(inL);
        }

        function reset() {
            sim = new CG2DSim(readParams());
            carry = 0;
            updateLabels();
            updateReadout();
            draw();
        }

        function setRunning(on) {
            running = on && !sim.done;
            btnRun.innerHTML = running
                ? '<i class="fa-solid fa-pause" aria-hidden="true"></i> Pause'
                : '<i class="fa-solid fa-play" aria-hidden="true"></i> ' + (sim.frame > 0 && !sim.done ? 'Resume' : 'Run');
            btnRun.setAttribute('aria-pressed', running ? 'true' : 'false');
            if (sim.frame > 0) updateReadout();
            if (running) { lastT = null; requestAnimationFrame(tick); }
        }

        function updateReadout() {
            outFrame.textContent = `${sim.frame} / ${sim.totalFrames}`;
            barFrame.style.width = `${(sim.frame / sim.totalFrames * 100).toFixed(1)}%`;
            const t = Math.max(0, sim.maxTension);
            outTension.textContent = sim.eventFrame >= 0 ? `> ${sim.critical.toFixed(0)}` : t.toFixed(1);
            const frac = sim.eventFrame >= 0 ? 1 : Math.min(1, t / sim.critical);
            barTension.style.width = `${(frac * 100).toFixed(1)}%`;
            barTension.style.backgroundColor = turbo(sim.eventFrame >= 0 ? 1 : t / (sim.critical * 0.85));
            if (sim.eventFrame >= 0) {
                outStatus.className = 'sim-live-status is-event';
                outStatus.innerHTML = `<strong>Local pore-formation event</strong> at frame ${sim.eventFrame}`;
            } else if (sim.done) {
                outStatus.className = 'sim-live-status is-safe';
                outStatus.innerHTML = `<strong>No event</strong> within ${sim.totalFrames} frames`;
            } else if (sim.frame === 0) {
                outStatus.className = 'sim-live-status';
                outStatus.textContent = 'Ready — press Run';
            } else {
                outStatus.className = 'sim-live-status' + (running ? ' is-running' : '');
                outStatus.innerHTML = sim.approaching ? 'DNA Bundle approaching the membrane…' : 'DNA Bundle docked — no event yet';
            }
        }

        function tick(now) {
            if (!running) return;
            const dtMs = lastT == null ? 0 : Math.min(now - lastT, 200);
            lastT = now;
            if (visible) {
                carry += dtMs * FPS / 1000;
                let stepped = false;
                while (carry >= 1 && !sim.done) {
                    sim.stepFrame();
                    carry -= 1;
                    stepped = true;
                }
                if (stepped) { updateReadout(); draw(); }
            }
            if (sim.done) { setRunning(false); return; }
            requestAnimationFrame(tick);
        }

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = canvas.clientWidth;
            if (!w) return;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(w * dpr);
            draw();
        }

        function draw() {
            if (!sim || !canvas.width) return;
            const W = canvas.width;
            const range = Math.max(sim.R + 45.0, sim.L_bundle * 0.65);
            const scale = W / (2 * range);
            const X = x => (x + range) * scale;
            const Y = y => (range - y) * scale;
            const pt = W / 560; // ~matplotlib points -> canvas pixels

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, W);

            // grid
            const step = niceStep(2 * range);
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 1 * pt;
            ctx.setLineDash([4 * pt, 4 * pt]);
            ctx.beginPath();
            for (let g = Math.ceil(-range / step) * step; g <= range; g += step) {
                ctx.moveTo(X(g), 0); ctx.lineTo(X(g), W);
                ctx.moveTo(0, Y(g)); ctx.lineTo(W, Y(g));
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // membrane bonds coloured by tension
            const n = sim.n, mx = sim.mx, my = sim.my;
            ctx.lineWidth = 2.5 * pt;
            ctx.lineCap = 'round';
            for (let i = 0; i < n; i++) {
                if (!sim.bonds[i]) continue;
                const j = (i + 1) % n;
                const t = sim.k_mem * (Math.hypot(mx[j] - mx[i], my[j] - my[i]) - sim.r0);
                ctx.strokeStyle = turbo(t / (sim.critical * 0.85));
                ctx.beginPath();
                ctx.moveTo(X(mx[i]), Y(my[i]));
                ctx.lineTo(X(mx[j]), Y(my[j]));
                ctx.stroke();
            }
            ctx.fillStyle = '#000080';
            const pr = Math.max(1, 1.3 * pt);
            for (let i = 0; i < n; i++) {
                ctx.beginPath();
                ctx.arc(X(mx[i]), Y(my[i]), pr, 0, 2 * Math.PI);
                ctx.fill();
            }

            // rupture marker
            if (sim.ruptureIdx >= 0) {
                const i = sim.ruptureIdx, j = (i + 1) % n;
                const rx = X(0.5 * (mx[i] + mx[j])), ry = Y(0.5 * (my[i] + my[j]));
                ctx.strokeStyle = 'rgba(220,20,60,0.85)';
                ctx.lineWidth = 2 * pt;
                ctx.beginPath();
                ctx.arc(rx, ry, 14 * pt, 0, 2 * Math.PI);
                ctx.stroke();
            }

            // DNA Bundle centreline (sampled like the Python plot)
            const ca = Math.cos(sim.ang), sa = Math.sin(sim.ang);
            const sPlot = draw.sPlot && draw.sPlot.L === sim.L_bundle ? draw.sPlot
                : (draw.sPlot = Object.assign(linspace(-sim.L_bundle / 2, sim.L_bundle / 2, 120), { L: sim.L_bundle }));
            if (!draw.bufPlot) draw.bufPlot = sim._makeChainBuf(120);
            sim.chain(sPlot, draw.bufPlot);
            const bp = draw.bufPlot;
            ctx.strokeStyle = '#696969';
            ctx.lineWidth = Math.max(3.0, sim.r_dna * 1.5) * pt;
            ctx.beginPath();
            for (let i = 0; i < 120; i++) {
                const x = sim.px + bp.X[i] * ca - bp.Y[i] * sa;
                const y = sim.py + bp.X[i] * sa + bp.Y[i] * ca;
                if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
            }
            ctx.stroke();

            // linkers + cholesterol
            sim.chain(sim.anchorS, sim.bufA);
            const bA = sim.bufA;
            ctx.lineWidth = 1 * pt;
            for (let i = 0; i < sim.nA; i++) {
                const ax = sim.px + bA.X[i] * ca - bA.Y[i] * sa;
                const ay = sim.py + bA.X[i] * sa + bA.Y[i] * ca;
                const dl = Math.hypot(sim.cx[i] - ax, sim.cy[i] - ay);
                const al = Math.max(0.2, Math.min(1.0, 1.0 - dl / (sim.L_contour * 1.5)));
                ctx.strokeStyle = `rgba(0,0,0,${al.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(X(ax), Y(ay));
                ctx.lineTo(X(sim.cx[i]), Y(sim.cy[i]));
                ctx.stroke();
            }
            ctx.fillStyle = '#800080';
            const cr = Math.max(1.5, 2.2 * pt);
            for (let i = 0; i < sim.nA; i++) {
                ctx.beginPath();
                ctx.arc(X(sim.cx[i]), Y(sim.cy[i]), cr, 0, 2 * Math.PI);
                ctx.fill();
            }

            // scale bar
            const bar = niceStep(range);
            const bx = 16 * pt, by = W - 18 * pt;
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 2.5 * pt;
            ctx.beginPath();
            ctx.moveTo(bx, by); ctx.lineTo(bx + bar * scale, by);
            ctx.stroke();
            ctx.fillStyle = '#222';
            ctx.font = `600 ${Math.round(11 * pt)}px "Helvetica Neue", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${bar} nm`, bx + bar * scale / 2, by - 4 * pt);

            // header line, like the Python title
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#333';
            ctx.font = `${Math.round(11 * pt)}px "Helvetica Neue", Arial, sans-serif`;
            ctx.fillText(`R = ${sim.R} nm   B = ${Math.round(sim.B).toLocaleString('en-US')} pN·nm²   l₀ = ${sim.l0.toFixed(1)} nm   frame ${sim.frame}`, 12 * pt, 10 * pt);
            ctx.textAlign = 'center';
            ctx.font = `700 ${Math.round(13 * pt)}px "Helvetica Neue", Arial, sans-serif`;
            if (sim.eventFrame >= 0) {
                ctx.fillStyle = '#dc143c';
                ctx.fillText('LOCAL PORE-FORMATION EVENT', W / 2, 30 * pt);
            } else {
                ctx.fillStyle = '#228b22';
                ctx.fillText('NO EVENT (resisting tension)', W / 2, 30 * pt);
            }
        }

        // ---- wiring ----
        function onParamChange() {
            setPreset(null);
            const wasRunning = running;
            running = false;
            reset();
            setRunning(wasRunning);
        }
        inA.addEventListener('input', () => { updateLabels(); });
        inL.addEventListener('input', () => { updateLabels(); });
        [inA, inL, inSeed].forEach(x => x.addEventListener('change', onParamChange));
        rButtons.forEach(b => b.addEventListener('click', () => {
            const v = parseFloat(b.dataset.simR);
            if (v === currentR) return;
            setR(v);
            onParamChange();
        }));

        presetButtons.forEach(btn => btn.addEventListener('click', () => {
            const [R, a, l] = btn.dataset.preset.split(',');
            setR(parseFloat(R)); inA.value = a; inL.value = l;
            setPreset(btn);
            running = false;
            reset();
            setRunning(false);
        }));

        btnRun.addEventListener('click', () => {
            if (sim.done) { reset(); setRunning(true); return; }
            setRunning(!running);
        });
        btnReset.addEventListener('click', () => { running = false; reset(); setRunning(false); });
        btnShuffle.addEventListener('click', () => {
            inSeed.value = String(1 + Math.floor(Math.random() * 99999));
            running = false; reset(); setRunning(false);
        });

        if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
        else window.addEventListener('resize', resize);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
            }).observe(el);
        }

        reset();
        resize();
        setRunning(false);
    }

    function boot() {
        document.querySelectorAll('[data-sim-root]').forEach(initUI);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
