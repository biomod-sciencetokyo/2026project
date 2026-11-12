import numpy as np
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import os

if "SIM_SEED" in os.environ:np.random.seed(int(os.environ["SIM_SEED"]))

# =========================================================
# 1. パラメーター設定
# =========================================================
kBT = 4.11
dt = float(os.environ.get("SIM_DT", "0.0001"))
substeps = int(os.environ.get("SIM_SUBSTEPS", "100"))
total_frames = int(os.environ.get("SIM_TOTAL_FRAMES", "200"))

# リポソーム設定 (R=50nm)
R_liposome = float(os.environ.get("SIM_RADIUS", "500.0"))
n_mem = int(240 * (R_liposome / 150.0))
angles = np.linspace(0, 2 * np.pi, n_mem, endpoint=False)
membrane = np.column_stack((R_liposome * np.cos(angles), R_liposome * np.sin(angles)))

bonds = [True] * n_mem
r0_mem = np.linalg.norm(membrane[1] - membrane[0])
area0 = np.pi * (R_liposome ** 2)

# 膜の力学パラメータ
k_mem = 150.0
k_bend_mem = 25.0 * kBT / r0_mem
k_area = 160.0
critical_tension = 150.0

# --- DNAバンドル設定 ---
# 現在の破断確率探索版と同じ1本のDNAバンドルを用いる。
num_dnas = 1
L_bundle = 3 * R_liposome
n_segments = 5
L_seg = L_bundle / n_segments
seg_edges = np.linspace(-L_bundle / 2.0, L_bundle / 2.0, n_segments + 1)

N_chains = 12
alpha = float(os.environ.get("SIM_ALPHA", "0.1"))  # ★ 0.1 (しなやかに曲がるSAFE) と 0.8 (強靭に直線を保ちLYSIS) で比較

r_dna = 1.25 * np.sqrt(N_chains)

# 【剛性スケーリングの強化】
# alphaが高い領域で剛性が非線形に爆発的に高くなるよう改良（alpha=0.8で圧倒的に硬い棒になる）
L_p_eff = 2.0 * N_chains + 120.0 * ((N_chains * alpha) ** 3.0)
B_dna = L_p_eff * kBT

dna_pos = np.zeros((num_dnas, 2))
dna_angle = np.zeros(num_dnas)
dna_kappas = np.zeros((num_dnas, n_segments))

initial_dist = R_liposome + 20.0
base_angles = np.linspace(0, 2 * np.pi, num_dnas, endpoint=False) + np.random.uniform(-0.03, 0.03, num_dnas)

for d in range(num_dnas):
    dna_pos[d, 0] = initial_dist * np.cos(base_angles[d])
    dna_pos[d, 1] = initial_dist * np.sin(base_angles[d])
    dna_angle[d] = base_angles[d] - np.pi / 2.0

approaching = [True] * num_dnas

# =========================================================
# 2. 接合面（端同士の位置と接線角）の完全固定関数
# =========================================================
def arc_step(ds, k):
    if np.abs(k) < 1e-4:
        dx = ds - (k**2) * (ds**3) / 6.0
        dy = 0.5 * k * (ds**2)
        ddx_dk = -k * (ds**3) / 3.0
        ddy_dk = 0.5 * (ds**2)
    else:
        dx = np.sin(k * ds) / k
        dy = (1.0 - np.cos(k * ds)) / k
        ddx_dk = (ds * np.cos(k * ds) * k - np.sin(k * ds)) / (k**2)
        ddy_dk = (ds * np.sin(k * ds) * k - (1.0 - np.cos(k * ds))) / (k**2)
    return dx, dy, ddx_dk, ddy_dk

def get_chained_dna_local(s_vals, kappas):
    s_vals = np.asarray(s_vals, dtype=float)
    n_pts = len(s_vals)
    M = len(kappas)
    mid_m = M // 2

    node_X = np.zeros(M + 1)
    node_Y = np.zeros(M + 1)
    node_phi = np.zeros(M + 1)
    dnode_X = np.zeros((M + 1, M))
    dnode_Y = np.zeros((M + 1, M))
    dnode_phi = np.zeros((M + 1, M))

    s_right = seg_edges[mid_m + 1]
    dx, dy, gx, gy = arc_step(s_right, kappas[mid_m])
    node_X[mid_m + 1], node_Y[mid_m + 1] = dx, dy
    node_phi[mid_m + 1] = kappas[mid_m] * s_right
    dnode_X[mid_m + 1, mid_m], dnode_Y[mid_m + 1, mid_m] = gx, gy
    dnode_phi[mid_m + 1, mid_m] = s_right

    s_left = seg_edges[mid_m]
    dx, dy, gx, gy = arc_step(s_left, kappas[mid_m])
    node_X[mid_m], node_Y[mid_m] = dx, dy
    node_phi[mid_m] = kappas[mid_m] * s_left
    dnode_X[mid_m, mid_m], dnode_Y[mid_m, mid_m] = gx, gy
    dnode_phi[mid_m, mid_m] = s_left

    for m in range(mid_m + 1, M):
        ds = L_seg
        k = kappas[m]
        phi0 = node_phi[m]
        c, s = np.cos(phi0), np.sin(phi0)
        dx, dy, gx, gy = arc_step(ds, k)

        step_x = c * dx - s * dy
        step_y = s * dx + c * dy
        node_X[m + 1] = node_X[m] + step_x
        node_Y[m + 1] = node_Y[m] + step_y
        node_phi[m + 1] = phi0 + k * ds

        for j in range(M):
            dphi0 = dnode_phi[m, j]
            dnode_X[m + 1, j] = dnode_X[m, j] - step_y * dphi0
            dnode_Y[m + 1, j] = dnode_Y[m, j] + step_x * dphi0
            dnode_phi[m + 1, j] = dphi0
        dnode_X[m + 1, m] += c * gx - s * gy
        dnode_Y[m + 1, m] += s * gx + c * gy
        dnode_phi[m + 1, m] += ds

    for m in range(mid_m - 1, -1, -1):
        ds = -L_seg
        k = kappas[m]
        phi0 = node_phi[m + 1]
        c, s = np.cos(phi0), np.sin(phi0)
        dx, dy, gx, gy = arc_step(ds, k)

        step_x = c * dx - s * dy
        step_y = s * dx + c * dy
        node_X[m] = node_X[m + 1] + step_x
        node_Y[m] = node_Y[m + 1] + step_y
        node_phi[m] = phi0 + k * ds

        for j in range(M):
            dphi0 = dnode_phi[m + 1, j]
            dnode_X[m, j] = dnode_X[m + 1, j] - step_y * dphi0
            dnode_Y[m, j] = dnode_Y[m + 1, j] + step_x * dphi0
            dnode_phi[m, j] = dphi0
        dnode_X[m, m] += c * gx - s * gy
        dnode_Y[m, m] += s * gx + c * gy
        dnode_phi[m, m] += ds

    X = np.zeros(n_pts)
    Y = np.zeros(n_pts)
    PHI = np.zeros(n_pts)
    GX = np.zeros((M, n_pts))
    GY = np.zeros((M, n_pts))

    for i, s_val in enumerate(s_vals):
        m = int(np.floor((s_val - seg_edges[0]) / L_seg))
        m = np.clip(m, 0, M - 1)
        k = kappas[m]

        if m == mid_m:
            ds = s_val
            dx, dy, gx, gy = arc_step(ds, k)
            X[i], Y[i] = dx, dy
            PHI[i] = k * ds
            GX[m, i], GY[m, i] = gx, gy
        elif m > mid_m:
            ds = s_val - seg_edges[m]
            phi0 = node_phi[m]
            c, s = np.cos(phi0), np.sin(phi0)
            dx, dy, gx, gy = arc_step(ds, k)
            step_x = c * dx - s * dy
            step_y = s * dx + c * dy
            X[i] = node_X[m] + step_x
            Y[i] = node_Y[m] + step_y
            PHI[i] = phi0 + k * ds
            for j in range(M):
                dphi0 = dnode_phi[m, j]
                GX[j, i] = dnode_X[m, j] - step_y * dphi0
                GY[j, i] = dnode_Y[m, j] + step_x * dphi0
            GX[m, i] += c * gx - s * gy
            GY[m, i] += s * gx + c * gy
        else:
            ds = s_val - seg_edges[m + 1]
            phi0 = node_phi[m + 1]
            c, s = np.cos(phi0), np.sin(phi0)
            dx, dy, gx, gy = arc_step(ds, k)
            step_x = c * dx - s * dy
            step_y = s * dx + c * dy
            X[i] = node_X[m + 1] + step_x
            Y[i] = node_Y[m + 1] + step_y
            PHI[i] = phi0 + k * ds
            for j in range(M):
                dphi0 = dnode_phi[m + 1, j]
                GX[j, i] = dnode_X[m + 1, j] - step_y * dphi0
                GY[j, i] = dnode_Y[m + 1, j] + step_x * dphi0
            GX[m, i] += c * gx - s * gy
            GY[m, i] += s * gx + c * gy

    return X, Y, PHI, GX, GY

# --- アンカーとコレステロールの初期設定 ---
chol_bp_interval = 15
spacing_nm = chol_bp_interval * 0.34
n_anchors = int(L_bundle / spacing_nm) + 1
anchor_s = np.linspace(-L_bundle/2, L_bundle/2, n_anchors)
cholesterol_pos = np.zeros((num_dnas, n_anchors, 2))

# 探索版では横軸の値そのものをアンカー–コレステロール間の自然長
# l0 として使う。確率ヒートマップと同じ一点を再現するには、対応する
# SIM_LINKER_LENGTH を与える（探索範囲の既定値として20 nm）。
linker_len0 = float(os.environ.get("SIM_LINKER_LENGTH", "20"))
linker_flex = 6.0
L_contour = linker_len0 + linker_flex
k_linker = 10.0
max_linker_force = 38.0

for d in range(num_dnas):
    cos_a, sin_a = np.cos(dna_angle[d]), np.sin(dna_angle[d])
    dx_a, dy_a, _, _, _ = get_chained_dna_local(anchor_s, dna_kappas[d])
    for i in range(n_anchors):
        c_x = dna_pos[d, 0] + dx_a[i] * cos_a - (dy_a[i] - linker_len0) * sin_a
        c_y = dna_pos[d, 1] + dx_a[i] * sin_a + (dy_a[i] - linker_len0) * cos_a
        cholesterol_pos[d, i] = np.array([c_x, c_y])

# --- 粘性抵抗の調整 ---
gamma_mem = 1.0
sigma_brown_mem = np.sqrt(2 * gamma_mem * kBT * dt)

gamma_chol = 0.2
sigma_brown_chol = np.sqrt(2 * gamma_chol * kBT * dt)

# 探索版と同じく、バンドル長に比例する並進摩擦を用いる。
gamma_dna_trans = 1.5 * (L_bundle / 100.0)
gamma_dna_rot = 1.0 * (L_bundle**2) / 12.0

seg_weights = np.array([1.2, 2.0, 3.2, 2.0, 1.2])
gamma_kappa_seg = ( (L_seg ** 3) / 6.0 ) * seg_weights

r_mem_dna_repulsion = r_dna + 1.0
k_mem_dna_repulsion = 200.0
approach_speed = 70.0
# 探索版と同じDNA–膜排除体積の離散化。
n_dna_points = max(15, int(L_bundle / 3.0))
dna_s_points = np.linspace(-L_bundle/2, L_bundle/2, n_dna_points)

def get_membrane_normals(mem):
    tangents = np.roll(mem, -1, axis=0) - np.roll(mem, 1, axis=0)
    norms = np.linalg.norm(tangents, axis=1, keepdims=True) + 1e-9
    t_unit = tangents / norms
    normals = np.column_stack((t_unit[:, 1], -t_unit[:, 0]))
    return normals

def linker_force(anchor_pos, cholesterol):
    """Force on cholesterol from one linker; continuous at every extension."""
    dr = cholesterol - anchor_pos
    distance = np.linalg.norm(dr) + 1e-9
    stretch = distance - linker_len0
    if stretch >= 0.0:
        if distance < L_contour:
            magnitude = k_linker * stretch
        else:
            # A finite-contour linker must become stiffer beyond L_contour.
            # The old 38 pN cap removed this restoring branch, allowing the
            # 20.8 nm linker to extend by hundreds of nanometres.
            magnitude = k_linker * linker_flex + 18.0 * (distance - L_contour)
    else:
        # Preserve the original softer compression branch.
        magnitude = 3.0 * stretch
    return -magnitude * dr / distance

def add_linker_reaction(d, force_on_dna, dx, dy, gx, gy, cos_a, sin_a,
                        f_dna_pos, f_dna_ang, f_dna_kap):
    """Transfer the equal-and-opposite linker force to DNA coordinates."""
    f_dna_pos[d] += force_on_dna
    f_dna_ang[d] += (force_on_dna[0] * (-dx * sin_a - dy * cos_a)
                     + force_on_dna[1] * (dx * cos_a - dy * sin_a))
    local_x = force_on_dna[0] * cos_a + force_on_dna[1] * sin_a
    local_y = -force_on_dna[0] * sin_a + force_on_dna[1] * cos_a
    f_dna_kap[d] += local_x * gx + local_y * gy

# =========================================================
# 3. 物理計算ループと描画
# =========================================================
fig, ax = plt.subplots(figsize=(9, 9))

def init_plot():
    max_range = max(R_liposome + 45.0, L_bundle * 0.65)
    ax.set_xlim(-max_range, max_range)
    ax.set_ylim(-max_range, max_range)
    ax.set_aspect('equal')
    ax.set_title(
        f"Joint-Fixed Rod Model (R={R_liposome} nm, alpha={alpha}, "
        f"l0={linker_len0} nm, Bundles={num_dnas})",
        fontsize=12,
    )
    ax.grid(True, linestyle='--', alpha=0.3)

def update(frame):
    global membrane, bonds, dna_pos, dna_angle, dna_kappas, cholesterol_pos, approaching

    for _ in range(substeps):
        f_mem = np.zeros_like(membrane)
        f_dna_pos = np.zeros((num_dnas, 2))
        f_dna_ang = np.zeros(num_dnas)
        f_dna_kap = np.zeros((num_dnas, n_segments))
        h_dna_q = np.zeros((num_dnas, 3 + n_segments, 3 + n_segments))
        f_chol = np.zeros_like(cholesterol_pos)

        normals = get_membrane_normals(membrane)

        for d in range(num_dnas):
            if approaching[d]:
                dist_to_center = np.linalg.norm(dna_pos[d])
                # 探索版と同じ停止位置。リンカー自然長の半分まで
                # 接近した後は、外力ではなく相互作用で運動させる。
                if dist_to_center > R_liposome + r_dna + linker_len0 * 0.5:
                    dir_vec = -dna_pos[d] / dist_to_center
                    dna_pos[d] += dir_vec * approach_speed * dt
                    cholesterol_pos[d] += dir_vec * approach_speed * dt
                else:
                    approaching[d] = False

        intact = all(bonds)
        for i in range(n_mem):
            next_i = (i + 1) % n_mem
            if bonds[i]:
                dr = membrane[next_i] - membrane[i]
                r = np.linalg.norm(dr) + 1e-9
                tension = k_mem * (r - r0_mem)

                if tension > critical_tension:
                    bonds[i] = False
                    continue

                f_spring = tension * (dr / r)
                f_mem[i] += f_spring
                f_mem[next_i] -= f_spring

        for i in range(n_mem):
            prev_i, next_i = (i - 1) % n_mem, (i + 1) % n_mem
            if bonds[prev_i] and bonds[i]:
                C = membrane[prev_i] - 2*membrane[i] + membrane[next_i]
                f_bend = k_bend_mem * C
                f_mem[prev_i] -= 0.5 * f_bend
                f_mem[i]   += 1.0 * f_bend
                f_mem[next_i] -= 0.5 * f_bend

        if intact:
            x, y = membrane[:, 0], membrane[:, 1]
            current_area = 0.5 * np.abs(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))
            area_strain = (current_area - area0) / area0
            f_pressure = -k_area * area_strain * r0_mem
            f_mem += f_pressure * normals

        for d in range(num_dnas):
            cos_a, sin_a = np.cos(dna_angle[d]), np.sin(dna_angle[d])
            dx_a, dy_a, phi_a, gx_a, gy_a = get_chained_dna_local(anchor_s, dna_kappas[d])

            for i in range(n_anchors):
                a_pos = np.array([
                    dna_pos[d, 0] + dx_a[i] * cos_a - dy_a[i] * sin_a,
                    dna_pos[d, 1] + dx_a[i] * sin_a + dy_a[i] * cos_a
                ])

                c_pos = cholesterol_pos[d, i]
                distances = np.linalg.norm(membrane - c_pos, axis=1)
                closest_idx = np.argmin(distances)
                r_mc = distances[closest_idx]

                # A linker is present whether or not this cholesterol is
                # inside the membrane capture range.  Previously the DNA saw
                # no linker reaction outside r_mc < 24 nm, while cholesterol
                # was pinned independently.  Once an end left this range the
                # DNA end was therefore unconstrained and produced the fan of
                # long linkers seen in the R=500 nm trajectory.
                f_linker = linker_force(a_pos, c_pos)
                f_chol[d, i] += f_linker
                add_linker_reaction(
                    d, -f_linker, dx_a[i], dy_a[i], gx_a[:, i], gy_a[:, i],
                    cos_a, sin_a, f_dna_pos, f_dna_ang, f_dna_kap
                )

                # Jacobian and positive tangent stiffness of this linker for
                # the semi-implicit DNA solve below.
                stretch = np.linalg.norm(c_pos - a_pos) - linker_len0
                if 0.0 <= stretch < linker_flex:
                    k_tangent = k_linker
                elif stretch < 0.0:
                    k_tangent = 3.0
                else:
                    k_tangent = 18.0
                jac = np.zeros((2, 3 + n_segments))
                jac[:, 0] = (1.0, 0.0)
                jac[:, 1] = (0.0, 1.0)
                jac[:, 2] = (-dx_a[i] * sin_a - dy_a[i] * cos_a,
                              dx_a[i] * cos_a - dy_a[i] * sin_a)
                jac[0, 3:] = cos_a * gx_a[:, i] - sin_a * gy_a[:, i]
                jac[1, 3:] = sin_a * gx_a[:, i] + cos_a * gy_a[:, i]
                h_dna_q[d] += k_tangent * (jac.T @ jac)

                # 探索版と同じく、リンカー自然長を含む距離までを
                # コレステロール–膜相互作用の有効範囲とする。
                interaction_range = 24.0 + linker_len0
                if r_mc < interaction_range:
                    dr_mc = membrane[closest_idx] - c_pos
                    if r_mc > 1.5:
                        f_mag = 32.0
                    else:
                        f_mag = 120.0 * (r_mc - 1.0)

                    f_vec = f_mag * (dr_mc / (r_mc + 1e-9))
                    n_vec = normals[closest_idx]
                    f_normal_vec = np.dot(f_vec, n_vec) * n_vec

                    idx_m2 = (closest_idx - 2) % n_mem
                    idx_m1 = (closest_idx - 1) % n_mem
                    idx_0  = closest_idx
                    idx_p1 = (closest_idx + 1) % n_mem
                    idx_p2 = (closest_idx + 2) % n_mem

                    f_mem[idx_0]  -= f_normal_vec * 0.40
                    f_mem[idx_m1] -= f_normal_vec * 0.20
                    f_mem[idx_p1] -= f_normal_vec * 0.20
                    f_mem[idx_m2] -= f_normal_vec * 0.10
                    f_mem[idx_p2] -= f_normal_vec * 0.10

                    f_chol[d, i] += f_vec + np.random.normal(0, sigma_brown_chol, size=2) / dt

            dx_p, dy_p, _, gx_p, gy_p = get_chained_dna_local(dna_s_points, dna_kappas[d])
            for idx_s in range(n_dna_points):
                p_pos = np.array([
                    dna_pos[d, 0] + dx_p[idx_s] * cos_a - dy_p[idx_s] * sin_a,
                    dna_pos[d, 1] + dx_p[idx_s] * sin_a + dy_p[idx_s] * cos_a
                ])

                dists_pm = np.linalg.norm(membrane - p_pos, axis=1)
                close_mask = dists_pm < r_mem_dna_repulsion
                for j in np.where(close_mask)[0]:
                    dist_pm = dists_pm[j]
                    dr_pm = membrane[j] - p_pos
                    f_rep_raw = k_mem_dna_repulsion * (r_mem_dna_repulsion - dist_pm) * (dr_pm / (dist_pm+1e-9))

                    n_vec = normals[j]
                    f_rep = np.dot(f_rep_raw, n_vec) * n_vec
                    f_mem[j] += f_rep

                    F_ax, F_ay = -f_rep[0], -f_rep[1]
                    f_dna_pos[d, 0] += F_ax
                    f_dna_pos[d, 1] += F_ay
                    f_dna_ang[d] += F_ax * (-dx_p[idx_s] * sin_a - dy_p[idx_s] * cos_a) + F_ay * (dx_p[idx_s] * cos_a - dy_p[idx_s] * sin_a)

                    F_local_x = F_ax * cos_a + F_ay * sin_a
                    F_local_y = -F_ax * sin_a + F_ay * cos_a
                    f_dna_kap[d] += F_local_x * gx_p[:, idx_s] + F_local_y * gy_p[:, idx_s]

            f_dna_kap[d] -= B_dna * L_seg * dna_kappas[d]

        membrane += ((f_mem + np.random.normal(0, sigma_brown_mem, size=membrane.shape)/dt) / gamma_mem) * dt
        cholesterol_pos += (f_chol / gamma_chol) * dt
        # Linkers stiffly couple DNA translation, rotation and curvature.
        # 探索版と同じく、DNAの並進・回転・曲率はこの8x8半陰的解だけで
        # 更新する。陽的更新を追加しないことで一般化力を二重に積分しない。
        for d in range(num_dnas):
            h_dna_q[d, 3:, 3:] += np.eye(n_segments) * (B_dna * L_seg)
            gamma_q = np.concatenate((
                (gamma_dna_trans, gamma_dna_trans, gamma_dna_rot),
                gamma_kappa_seg,
            ))
            force_q = np.concatenate((f_dna_pos[d], (f_dna_ang[d],), f_dna_kap[d]))
            delta_q = np.linalg.solve(np.diag(gamma_q / dt) + h_dna_q[d], force_q)
            dna_pos[d] += delta_q[:2]
            dna_angle[d] += delta_q[2]
            dna_kappas[d] += delta_q[3:]

    # --- 描画処理 ---
    ax.clear()
    init_plot()

    has_ruptured = False
    for i in range(n_mem):
        next_i = (i + 1) % n_mem
        if bonds[i]:
            dr = np.linalg.norm(membrane[next_i] - membrane[i])
            tension = k_mem * (dr - r0_mem)
            color = plt.cm.turbo(min(max(tension / (critical_tension * 0.85), 0.0), 1.0))
            ax.plot([membrane[i,0], membrane[next_i,0]], [membrane[i,1], membrane[next_i,1]], '-', color=color, lw=2.5, zorder=2)
        else:
            has_ruptured = True

    ax.scatter(membrane[:,0], membrane[:,1], color='navy', s=6, zorder=3)

    max_range = max(R_liposome + 45.0, L_bundle * 0.65)
    status_y = max_range * 0.88
    if has_ruptured:
        ax.text(0, status_y, "STATUS: LYSIS (Tension > Threshold)", color='crimson', fontsize=14, fontweight='bold', ha='center')
    else:
        ax.text(0, status_y, "STATUS: SAFE (Resisting Tension)", color='forestgreen', fontsize=12, fontweight='bold', ha='center')

    s_plot = np.linspace(-L_bundle/2, L_bundle/2, 120)
    line_width = max(3.0, r_dna * 1.5)

    for d in range(num_dnas):
        cos_a, sin_a = np.cos(dna_angle[d]), np.sin(dna_angle[d])
        dx_p, dy_p, _, _, _ = get_chained_dna_local(s_plot, dna_kappas[d])
        x_plot = dna_pos[d, 0] + dx_p * cos_a - dy_p * sin_a
        y_plot = dna_pos[d, 1] + dx_p * sin_a + dy_p * cos_a
        ax.plot(x_plot, y_plot, color='dimgray', lw=line_width, solid_capstyle='round', zorder=10)

        dx_a, dy_a, _, _, _ = get_chained_dna_local(anchor_s, dna_kappas[d])
        for i in range(n_anchors):
            a_x = dna_pos[d, 0] + dx_a[i] * cos_a - dy_a[i] * sin_a
            a_y = dna_pos[d, 1] + dx_a[i] * sin_a + dy_a[i] * cos_a

            dist_l = np.linalg.norm(cholesterol_pos[d, i] - np.array([a_x, a_y]))
            alpha_l = max(0.2, min(1.0, 1.0 - (dist_l / (L_contour * 1.5))))
            ax.plot([a_x, cholesterol_pos[d, i, 0]], [a_y, cholesterol_pos[d, i, 1]], 'k-', lw=1.0, zorder=9, alpha=alpha_l)
            ax.plot(cholesterol_pos[d, i, 0], cholesterol_pos[d, i, 1], 'o', color='purple', ms=4, zorder=11)

ani = animation.FuncAnimation(fig, update, frames=total_frames, init_func=init_plot, repeat=False)
output_file = (
    f'guv_tension_r{int(R_liposome)}_a{int(alpha*10):02d}_'
    f'l{linker_len0:.1f}_b{num_dnas}_pure_chained.gif'
)
print(f"Generating Simulation ({output_file})...")
ani.save(output_file, writer=animation.PillowWriter(fps=20))
print("Complete!")
