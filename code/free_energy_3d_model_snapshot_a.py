import numpy as np
import matplotlib.pyplot as plt
from scipy.optimize import minimize
from matplotlib import cm
from matplotlib.colors import LightSource
import os

# --- 1. 物理パラメーターの設定 ---
kBT = 4.11e-21            # [J] (300K)
R0 = 50.0                 # リポソーム初期半径 [nm]
L_bundle = 100.0           # DNA束の長さ [nm]
r_dna = 4.0               # DNA束の半径 [nm] (直径 16nm)
kappa_m = 20.0 * kBT      # 膜曲げ弾性率 [J]
gamma_m = 1.0e-4 * 1e-18  # 膜張力 [J/nm^2]

# コレステロール接着パラメーター
num_bundles = int(os.environ.get("SIM_NUM_BUNDLES", "2"))
if num_bundles < 1:
    raise ValueError("SIM_NUM_BUNDLES must be at least 1.")

N_chol_per_bundle = 22
epsilon_chol = 4.5 * kBT
E_adh_per_bundle = N_chol_per_bundle * epsilon_chol

# Independent multi-Bundle extension.  A single Bundle attacks at the north
# pole to preserve the original geometry.  For two or more Bundles, contact
# sites are distributed at different azimuthal directions around the vesicle.
# Their energies add independently; this is not a model of Bundle–Bundle or
# membrane-mediated cooperative interactions.
if num_bundles == 1:
    attack_polar_angles = np.array([0.0])
    attack_azimuth_angles = np.array([0.0])
else:
    attack_polar_angle_deg = float(
        os.environ.get("SIM_ATTACK_POLAR_ANGLE_DEG", "89.0")
    )
    if not 0.0 < attack_polar_angle_deg < 90.0:
        raise ValueError(
            "SIM_ATTACK_POLAR_ANGLE_DEG must be between 0 and 90 degrees "
            "when SIM_NUM_BUNDLES is greater than 1."
        )
    attack_polar_angles = np.full(
        num_bundles,
        np.deg2rad(attack_polar_angle_deg)
    )
    attack_azimuth_angles = np.linspace(
        0.0,
        2.0 * np.pi,
        num_bundles,
        endpoint=False
    )

attack_frames = []
for polar_angle, azimuth_angle in zip(
    attack_polar_angles,
    attack_azimuth_angles
):
    normal = np.array([
        np.sin(polar_angle) * np.cos(azimuth_angle),
        np.sin(polar_angle) * np.sin(azimuth_angle),
        np.cos(polar_angle),
    ])
    tangent_along_bundle = np.array([
        np.cos(polar_angle) * np.cos(azimuth_angle),
        np.cos(polar_angle) * np.sin(azimuth_angle),
        -np.sin(polar_angle),
    ])
    tangent_across_bundle = np.array([
        -np.sin(azimuth_angle),
        np.cos(azimuth_angle),
        0.0,
    ])
    attack_frames.append((normal, tangent_along_bundle, tangent_across_bundle))

# DNA束の剛性
P_L_hcr = 5.0            # パーシステンス長 [nm]
B_dna = P_L_hcr * kBT

# --- 2. 厳密な自由エネルギー汎関数の最小化 (熱力学平衡探索) ---
def rigorous_energy_functional(params):
    z_indent, R_bend, w_y = params
    cos_val = np.clip(1.0 - z_indent / r_dna, -1.0, 1.0)
    theta_contact = np.arccos(cos_val)
    A_contact_per_bundle = L_bundle * (2.0 * r_dna * theta_contact)
    A_contact_total = num_bundles * A_contact_per_bundle

    E_adhesion = - (E_adh_per_bundle / (L_bundle * r_dna)) * A_contact_total
    E_dna_bend = num_bundles * 0.5 * B_dna * (1.0 / R_bend)**2 * L_bundle

    lambda_m = np.sqrt(kappa_m / gamma_m)
    E_membrane_bend = 0.5 * kappa_m * (z_indent / w_y**2)**2 * A_contact_total
    E_membrane_tension = 0.5 * gamma_m * (z_indent / w_y)**2 * A_contact_total * (lambda_m / w_y)

    F_total = (E_adhesion + E_dna_bend + E_membrane_bend + E_membrane_tension) / kBT
    return F_total

res = minimize(
    rigorous_energy_functional,
    x0=[4.0, R0, r_dna * 1.5],
    bounds=[(0.5, r_dna * 1.8), (R0 * 0.7, R0 * 5.0), (r_dna * 0.8, r_dna * 3.0)],
    method='L-BFGS-B',
    options={'ftol': 1e-12, 'gtol': 1e-12, 'maxiter': 1000}
)

z_indent_eq, R_bend_eq, w_y_eq = res.x

print("=" * 60)
print(f"【熱力学平衡状態の幾何座標・計算結果】")
print(f"DNA Bundle数 (independent attacks) : {num_bundles}")
if num_bundles > 1:
    print(f"攻撃位置の極角                 : {attack_polar_angle_deg:.1f} deg")
print(f"DNA束の膜めり込み深さ (z_indent) : {z_indent_eq:.3f} nm")
print(f"膜の変形ポケット幅 (w_y)       : {w_y_eq:.3f} nm (DNA半径 {r_dna}nm を包み込む)")
print(f"DNA束の平衡曲げ半径 (R_bend)    : {R_bend_eq:.2f} nm")
print(f"最小自由エネルギー (F_min)       : {res.fun:.3f} kBT")
if num_bundles > 1:
    print("注: 複数Bundleの自由エネルギーは異方向の独立Bundleの加算です。"
          "Bundle間相互作用・協同性・膜変形の重なりは含みません。")
print("=" * 60)

# --- 3. 高解像度グリッド生成 (計算時間をかけ精密にメッシュ構築) ---
n_theta, n_phi = 300, 600
eps = 1e-4
theta = np.linspace(eps, np.pi - eps, n_theta)
phi = np.linspace(0, 2 * np.pi, n_phi)
THETA, PHI = np.meshgrid(theta, phi)

X0 = R0 * np.sin(THETA) * np.cos(PHI)
Y0 = R0 * np.sin(THETA) * np.sin(PHI)
Z0 = R0 * np.cos(THETA)

# --- 4. めり込み座標系 (Helfrich連続変形モデル) の適用 ---
# Combine directionally separated local indentations without making their
# overlap deeper than the prescribed one-Bundle indentation.
indentation_envelope = np.zeros_like(X0)
for normal, tangent_along_bundle, tangent_across_bundle in attack_frames:
    local_along = (
        X0 * tangent_along_bundle[0]
        + Y0 * tangent_along_bundle[1]
        + Z0 * tangent_along_bundle[2]
    )
    local_across = (
        X0 * tangent_across_bundle[0]
        + Y0 * tangent_across_bundle[1]
        + Z0 * tangent_across_bundle[2]
    )
    local_cosine = (
        X0 * normal[0] + Y0 * normal[1] + Z0 * normal[2]
    ) / R0
    local_angular_distance = np.arccos(np.clip(local_cosine, -1.0, 1.0))
    f_along = np.exp(-((local_along / (L_bundle / 2.0))**6))
    f_across = np.exp(-((local_across / w_y_eq)**2))
    f_local_surface = np.exp(
        -((local_angular_distance / (np.pi / 3.0))**2)
    )
    local_indentation = f_along * f_across * f_local_surface
    indentation_envelope = (
        1.0 - (1.0 - indentation_envelope) * (1.0 - local_indentation)
    )

dr = - z_indent_eq * indentation_envelope
R_membrane = R0 + dr

X_mem = R_membrane * np.sin(THETA) * np.cos(PHI)
Y_mem = R_membrane * np.sin(THETA) * np.sin(PHI)
Z_mem = R_membrane * np.cos(THETA)

# --- 5. 平均曲率 H の高精度数値微分 ---
dX_dth, dY_dth, dZ_dth = np.gradient(X_mem, axis=1), np.gradient(Y_mem, axis=1), np.gradient(Z_mem, axis=1)
dX_dph, dY_dph, dZ_dph = np.gradient(X_mem, axis=0), np.gradient(Y_mem, axis=0), np.gradient(Z_mem, axis=0)

E = dX_dth**2 + dY_dth**2 + dZ_dth**2
F = dX_dth*dX_dph + dY_dth*dY_dph + dZ_dth*dZ_dph
G = dX_dph**2 + dY_dph**2 + dZ_dph**2

Nx = dY_dth * dZ_dph - dZ_dth * dY_dph
Ny = dZ_dth * dX_dph - dX_dth * dZ_dph
Nz = dX_dth * dY_dph - dY_dth * dX_dph

normN = np.sqrt(Nx**2 + Ny**2 + Nz**2)
normN = np.where(normN == 0, 1e-12, normN)
nx, ny, nz = Nx/normN, Ny/normN, Nz/normN

d2X_dth2, d2Y_dth2, d2Z_dth2 = np.gradient(dX_dth, axis=1), np.gradient(dY_dth, axis=1), np.gradient(dZ_dth, axis=1)
d2X_dph2, d2Y_dph2, d2Z_dph2 = np.gradient(dX_dph, axis=0), np.gradient(dY_dph, axis=0), np.gradient(dZ_dph, axis=0)
d2X_dthdph, d2Y_dthdph, d2Z_dthdph = np.gradient(dX_dth, axis=0), np.gradient(dY_dth, axis=0), np.gradient(dZ_dph, axis=0)

L_ff = d2X_dth2 * nx + d2Y_dth2 * ny + d2Z_dth2 * nz
M_ff = d2X_dthdph * nx + d2Y_dthdph * ny + d2Z_dthdph * nz
N_ff = d2X_dph2 * nx + d2Y_dph2 * ny + d2Z_dph2 * nz

denom = 2.0 * (E * G - F**2)
denom = np.where(np.abs(denom) < 1e-12, 1e-12, denom)
H = np.abs((E * N_ff - 2.0 * F * M_ff + G * L_ff) / denom)
H = np.clip(H, 0.015, 0.075)

# --- 6. 3D可視化 (食い込んだ膜 ＋ 半径8nm DNA束の組み合わせ) ---
fig = plt.figure(figsize=(11, 9))
ax = fig.add_subplot(111, projection='3d')

norm = plt.Normalize(vmin=0.018, vmax=0.065)
base_colors = cm.jet(norm(H))
ls = LightSource(azdeg=315, altdeg=45)
shaded_colors = ls.shade_rgb(base_colors[:, :, :3], Z_mem)

surf = ax.plot_surface(
    X_mem, Y_mem, Z_mem, facecolors=shaded_colors,
    rstride=1, cstride=1, linewidth=0, antialiased=True, shade=False, alpha=0.92
)

u_tube = np.linspace(- (L_bundle / 2.0) / R_bend_eq, (L_bundle / 2.0) / R_bend_eq, 100)
v_tube = np.linspace(0, 2 * np.pi, 40)
U_tube, V_tube = np.meshgrid(u_tube, v_tube)

R_dna_center = R_bend_eq - z_indent_eq + r_dna
X_center = R_dna_center * np.sin(U_tube)
Z_center = R_dna_center * np.cos(U_tube) - (R_bend_eq - R0)

dna_tubes = []
for normal, tangent_along_bundle, tangent_across_bundle in attack_frames:
    local_along = X_center
    local_across = r_dna * np.cos(V_tube)
    local_normal = Z_center + r_dna * np.sin(V_tube)
    X_dna_tube = (
        local_along * tangent_along_bundle[0]
        + local_across * tangent_across_bundle[0]
        + local_normal * normal[0]
    )
    Y_dna_tube = (
        local_along * tangent_along_bundle[1]
        + local_across * tangent_across_bundle[1]
        + local_normal * normal[1]
    )
    Z_dna_tube = (
        local_along * tangent_along_bundle[2]
        + local_across * tangent_across_bundle[2]
        + local_normal * normal[2]
    )
    dna_tubes.append((X_dna_tube, Y_dna_tube, Z_dna_tube))
    ax.plot_surface(
        X_dna_tube, Y_dna_tube, Z_dna_tube,
        color='black', alpha=0.95, rstride=1, cstride=1
    )

lim = R0 * 1.25
ax.set_xlim([-lim, lim])
ax.set_ylim([-lim, lim])
ax.set_zlim([-lim, lim])

ax.set_box_aspect([1, 1, 1])
ax.view_init(elev=18, azim=40)

cb = fig.colorbar(cm.ScalarMappable(cmap=cm.jet, norm=norm), ax=ax, shrink=0.55, pad=0.08)
cb.set_label('Mean Curvature H [1/nm]', fontsize=11)

ax.set_title(
    f'Thermodynamic Indentation Equilibrium\n'
    f'(Bundles = {num_bundles}, Indent = {z_indent_eq:.2f} nm, DNA Radius = {r_dna} nm)',
    fontsize=12, fontweight='bold'
)
ax.set_xlabel('X [nm]')
ax.set_ylabel('Y [nm]')
ax.set_zlabel('Z [nm]')

plt.tight_layout()

# --- 7. Web用3Dモデル (GLB形式) のエクスポート ---
print("GLBファイルの書き出しを開始します...")
try:
    import trimesh

    def surface_to_mesh(X, Y, Z, colors=None):
        rows, cols = X.shape
        vertices = np.vstack([X.flatten(), Y.flatten(), Z.flatten()]).T

        faces = []
        for i in range(rows - 1):
            for j in range(cols - 1):
                p0 = i * cols + j
                p1 = p0 + 1
                p2 = (i + 1) * cols + j
                p3 = p2 + 1

                # 表向きの面
                faces.append([p0, p2, p1])
                faces.append([p1, p2, p3])
                # 裏向きの面も追加（強制的に両面描画にして透けを防止！）
                faces.append([p0, p1, p2])
                faces.append([p1, p3, p2])

        # process=False を指定して色の配列ズレを防ぐ
        mesh = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            vertex_colors=colors,
            process=False
        )

        # Web表示時のライティングで色が白飛びしないよう、マットな質感に設定
        if hasattr(mesh.visual, 'material'):
            mesh.visual.material.roughnessFactor = 1.0
            mesh.visual.material.metallicFactor = 0.0

        return mesh

    # 1. リポソーム膜のメッシュ化（曲率Hのカラーマップを適用）
    H_flat = H.flatten()
    colors_mem_rgba = cm.jet(norm(H_flat))
    colors_mem_uint8 = (colors_mem_rgba * 255).astype(np.uint8)
    mesh_mem = surface_to_mesh(X_mem, Y_mem, Z_mem, colors=colors_mem_uint8)

    # 2. DNA束のメッシュ化（黒色）
    mesh_dna_list = []
    for X_dna_tube, Y_dna_tube, Z_dna_tube in dna_tubes:
        colors_dna = np.array(
            [[30, 30, 30, 255]] * X_dna_tube.size,
            dtype=np.uint8
        )
        mesh_dna_list.append(
            surface_to_mesh(X_dna_tube, Y_dna_tube, Z_dna_tube, colors=colors_dna)
        )

    # 3. メッシュを結合して1つのシーンにする
    scene = trimesh.Scene([mesh_mem, *mesh_dna_list])
    output_filename = (
        "liposome_model.glb"
        if num_bundles == 1
        else f"liposome_model_{num_bundles}bundles.glb"
    )
    scene.export(output_filename)
    print(f"成功: '{output_filename}' を保存しました！")

except ImportError:
    print("エラー: trimeshライブラリが見つかりません。'pip install trimesh' を実行してください。")

# グラフの表示 (最後に実行されます)
plt.show()
