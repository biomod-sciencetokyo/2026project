import numpy as np
import matplotlib.pyplot as plt
import csv
import time
import multiprocessing as mp

# =========================================================
# 1. 物理計算のコア関数群
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

def get_chained_dna_local(s_vals, kappas, L_seg, seg_edges):
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

def get_membrane_normals(mem):
    tangents = np.roll(mem, -1, axis=0) - np.roll(mem, 1, axis=0)
    norms = np.linalg.norm(tangents, axis=1, keepdims=True) + 1e-9
    t_unit = tangents / norms
    normals = np.column_stack((t_unit[:, 1], -t_unit[:, 0]))
    return normals

def linker_force(anchor_pos, cholesterol, linker_len0, L_contour, k_linker, linker_flex):
    dr = cholesterol - anchor_pos
    distance = np.linalg.norm(dr) + 1e-9
    stretch = distance - linker_len0
    if stretch >= 0.0:
        if distance < L_contour:
            magnitude = k_linker * stretch
        else:
            magnitude = k_linker * linker_flex + 18.0 * (distance - L_contour)
    else:
        magnitude = 3.0 * stretch
    return -magnitude * dr / distance

def add_linker_reaction(d, force_on_dna, dx, dy, gx, gy, cos_a, sin_a, f_dna_pos, f_dna_ang, f_dna_kap):
    f_dna_pos[d] += force_on_dna
    f_dna_ang[d] += (force_on_dna[0] * (-dx * sin_a - dy * cos_a) + force_on_dna[1] * (dx * cos_a - dy * sin_a))
    local_x = force_on_dna[0] * cos_a + force_on_dna[1] * sin_a
    local_y = -force_on_dna[0] * sin_a + force_on_dna[1] * cos_a
    f_dna_kap[d] += local_x * gx + local_y * gy

# =========================================================
# 2. 1回のシミュレーション試行を実行する関数
# =========================================================
def run_simulation(args):
    """
    並列処理用に引数をタプルで受け取る関数
    args: (R_liposome, alpha, linker_len0, max_frames, seed, trial_id)
    """
    R_liposome, alpha, linker_len0, max_frames, seed, trial_id = args
    np.random.seed(seed)

    kBT = 4.11
    dt = 0.0001
    substeps = 100

    # 半径に応じた解像度設定
    n_mem = int(240 * (R_liposome / 150.0))
    angles = np.linspace(0, 2 * np.pi, n_mem, endpoint=False)
    membrane = np.column_stack((R_liposome * np.cos(angles), R_liposome * np.sin(angles)))

    bonds = [True] * n_mem
    r0_mem = np.linalg.norm(membrane[1] - membrane[0])
    area0 = np.pi * (R_liposome ** 2)

    k_mem = 150.0
    k_bend_mem = 25.0 * kBT / r0_mem
    k_area = 160.0
    critical_tension = 150.0

    num_dnas = 1
    # バンドル長は半径の3倍に連動
    L_bundle = 3.0 * R_liposome
    n_segments = 5
    L_seg = L_bundle / n_segments
    seg_edges = np.linspace(-L_bundle / 2.0, L_bundle / 2.0, n_segments + 1)

    N_chains = 12
    r_dna = 1.25 * np.sqrt(N_chains)

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

    chol_bp_interval = 15
    spacing_nm = chol_bp_interval * 0.34
    n_anchors = int(L_bundle / spacing_nm) + 1
    anchor_s = np.linspace(-L_bundle/2, L_bundle/2, n_anchors)
    cholesterol_pos = np.zeros((num_dnas, n_anchors, 2))

    linker_flex = 6.0
    L_contour = linker_len0 + linker_flex
    k_linker = 10.0

    for d in range(num_dnas):
        cos_a, sin_a = np.cos(dna_angle[d]), np.sin(dna_angle[d])
        dx_a, dy_a, _, _, _ = get_chained_dna_local(anchor_s, dna_kappas[d], L_seg, seg_edges)
        for i in range(n_anchors):
            c_x = dna_pos[d, 0] + dx_a[i] * cos_a - (dy_a[i] - linker_len0) * sin_a
            c_y = dna_pos[d, 1] + dx_a[i] * sin_a + (dy_a[i] - linker_len0) * cos_a
            cholesterol_pos[d, i] = np.array([c_x, c_y])

    gamma_mem = 1.0
    sigma_brown_mem = np.sqrt(2 * gamma_mem * kBT * dt)
    gamma_chol = 0.2
    sigma_brown_chol = np.sqrt(2 * gamma_chol * kBT * dt)

    # バンドル長に比例して摩擦をスケーリング
    gamma_dna_trans = 1.5 * (L_bundle / 100.0)
    gamma_dna_rot = 1.0 * (L_bundle**2) / 12.0
    seg_weights = np.array([1.2, 2.0, 3.2, 2.0, 1.2])
    gamma_kappa_seg = ( (L_seg ** 3) / 6.0 ) * seg_weights

    r_mem_dna_repulsion = r_dna + 1.0
    k_mem_dna_repulsion = 200.0
    approach_speed = 70.0
    n_dna_points = max(15, int(L_bundle / 3.0))
    dna_s_points = np.linspace(-L_bundle/2, L_bundle/2, n_dna_points)

    for frame in range(max_frames):
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
                        return alpha, B_dna, linker_len0, True, frame, trial_id

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
                dx_a, dy_a, phi_a, gx_a, gy_a = get_chained_dna_local(anchor_s, dna_kappas[d], L_seg, seg_edges)

                for i in range(n_anchors):
                    a_pos = np.array([
                        dna_pos[d, 0] + dx_a[i] * cos_a - dy_a[i] * sin_a,
                        dna_pos[d, 1] + dx_a[i] * sin_a + dy_a[i] * cos_a
                    ])
                    c_pos = cholesterol_pos[d, i]

                    f_linker_vec = linker_force(a_pos, c_pos, linker_len0, L_contour, k_linker, linker_flex)
                    f_chol[d, i] += f_linker_vec
                    add_linker_reaction(d, -f_linker_vec, dx_a[i], dy_a[i], gx_a[:, i], gy_a[:, i], cos_a, sin_a, f_dna_pos, f_dna_ang, f_dna_kap)

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
                    jac[:, 2] = (-dx_a[i] * sin_a - dy_a[i] * cos_a, dx_a[i] * cos_a - dy_a[i] * sin_a)
                    jac[0, 3:] = cos_a * gx_a[:, i] - sin_a * gy_a[:, i]
                    jac[1, 3:] = sin_a * gx_a[:, i] + cos_a * gy_a[:, i]
                    h_dna_q[d] += k_tangent * (jac.T @ jac)

                    distances = np.linalg.norm(membrane - c_pos, axis=1)
                    closest_idx = np.argmin(distances)
                    r_mc = distances[closest_idx]

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

                        idx_m2, idx_m1, idx_0, idx_p1, idx_p2 = (closest_idx - 2) % n_mem, (closest_idx - 1) % n_mem, closest_idx, (closest_idx + 1) % n_mem, (closest_idx + 2) % n_mem
                        f_mem[idx_0]  -= f_normal_vec * 0.40
                        f_mem[idx_m1] -= f_normal_vec * 0.20
                        f_mem[idx_p1] -= f_normal_vec * 0.20
                        f_mem[idx_m2] -= f_normal_vec * 0.10
                        f_mem[idx_p2] -= f_normal_vec * 0.10

                        f_chol[d, i] += f_vec + np.random.normal(0, sigma_brown_chol, size=2) / dt

            dx_p, dy_p, _, gx_p, gy_p = get_chained_dna_local(dna_s_points, dna_kappas[d], L_seg, seg_edges)
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

    return alpha, B_dna, linker_len0, False, -1, trial_id

# =========================================================
# 3. マルチプロセス実行・データ集計・ヒートマップ作成（連続実行対応）
# =========================================================
if __name__ == '__main__':
    # 探索条件の設定（メッシュサイズ）
    alpha_list = np.linspace(0.1, 1.0, 8)
    linker_list = np.linspace(2.0, 20.0, 8)
    num_trials = 50
    max_frames = 100

    # 連続で実行したい半径をここに指定
    target_radii = [250.0, 300.0]

    for R_val in target_radii:
        print(f"\n{'='*60}")
        print(f" Starting Heatmap Generation for Radius = {R_val:.1f} nm ")
        print(f"{'='*60}")

        raw_data_file = f'rupture_heatmap_data_R{int(R_val)}.csv'
        total_tasks = len(alpha_list) * len(linker_list) * num_trials
        num_cores = min(mp.cpu_count(), total_tasks)
        print(f"Using {num_cores} CPU cores for {total_tasks} parallel tasks...\n")

        # 実行タスクのリストを作成
        tasks = []
        for alpha in alpha_list:
            for linker_len in linker_list:
                for trial in range(num_trials):
                    # R_valも引数に追加してタスクを作成
                    seed = int((alpha * 1000) + (linker_len * 100) + (R_val * 10) + trial + int(time.time()))
                    tasks.append((R_val, alpha, linker_len, max_frames, seed, trial))

        # CSVヘッダーの書き込み
        with open(raw_data_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["Alpha", "B_dna(pN.nm^2)", "Linker_Length_nm", "Trial", "Rupture_Success", "Rupture_Frame"])

        start_time = time.time()

        # マルチプロセスで実行
        results_list = []
        with mp.Pool(processes=num_cores) as pool:
            for i, res in enumerate(pool.imap_unordered(run_simulation, tasks)):
                alpha_res, B_dna_res, linker_res, is_ruptured, rupture_frame, trial_id = res
                results_list.append(res)

                status = f"RUPTURE (Frame {rupture_frame})" if is_ruptured else "SAFE"
                print(f"[R={R_val:.0f} | Done {i+1}/{total_tasks}] B_dna={B_dna_res:.0f}, Linker={linker_res:.1f}nm, Trial={trial_id}: {status}")

                with open(raw_data_file, 'a', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow([alpha_res, B_dna_res, linker_res, trial_id, is_ruptured, rupture_frame])

        elapsed = time.time() - start_time
        print(f"\nCompleted R={R_val:.1f}nm in {elapsed:.1f} seconds.")

        # --- データの集計 ---
        N_chains = 12
        kBT = 4.11
        B_dna_list = [(2.0 * N_chains + 120.0 * ((N_chains * a) ** 3.0)) * kBT for a in alpha_list]
        prob_matrix = np.zeros((len(alpha_list), len(linker_list)))

        for res in results_list:
            alpha_res, _, linker_res, is_ruptured, _, _ = res
            i = np.argmin(np.abs(alpha_list - alpha_res))
            j = np.argmin(np.abs(linker_list - linker_res))
            if is_ruptured:
                prob_matrix[i, j] += 1.0

        prob_matrix = (prob_matrix / num_trials) * 100.0

        # --- ヒートマップの描画と保存 ---
        fig, ax = plt.subplots(figsize=(10, 8))
        cax = ax.imshow(prob_matrix, cmap='YlOrRd', origin='lower', aspect='auto', vmin=0, vmax=100)

        cbar = fig.colorbar(cax, ax=ax)
        cbar.set_label('Rupture Probability (%)', fontsize=14)

        ax.set_xticks(np.arange(len(linker_list)))
        ax.set_xticklabels([f"{l:.1f}" for l in linker_list], fontsize=12)
        ax.set_xlabel('Linker Natural Length (nm)', fontsize=14)

        ax.set_yticks(np.arange(len(alpha_list)))
        ax.set_yticklabels([f"{b:.0f}" for b in B_dna_list], fontsize=12)
        ax.set_ylabel('Bending Stiffness $B_{dna}$ (pN$\cdot$nm$^2$)', fontsize=14)

        for i in range(len(alpha_list)):
            for j in range(len(linker_list)):
                val = prob_matrix[i, j]
                text_color = "white" if val > 50 else "black"
                ax.text(j, i, f"{int(val)}%", ha="center", va="center", color=text_color, fontweight='bold', fontsize=14)

        plt.title(f'Membrane Rupture Probability Heatmap (R = {R_val:.1f} nm)\n(Stiffness vs Linker Length)', fontsize=16, fontweight='bold')

        # R の値ごとに出力ファイル名を変更して保存
        graph_file = f'rupture_heatmap_R{int(R_val)}.png'
        plt.savefig(graph_file, dpi=300, bbox_inches='tight')
        print(f"Heatmap saved to {graph_file}\n")

        # ★ 画像保存後に図を閉じてメモリを解放（画面描画による処理停止を防ぐ）
        plt.close(fig)
