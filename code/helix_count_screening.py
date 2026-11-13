import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import interp1d

# --- 1. 物理パラメーターと定数 ---
R0 = 50.0                 # リポソーム初期半径 [nm]
L_bundle = 150.0           # DNA束の長さ [nm]
H_crit = 0.067            # 膜破壊の臨界平均曲率 [1/nm]

# --- 2. 弾性力学に基づく厳密な解析モデル ---
def compute_analytical_curvature(N):
    # 1. DNA束の剛性スケーリング (N^2で硬くなる)
    B_dna_factor = 50.0 * (N**2) * L_bundle 
    
    # 2. 膜の有効復元力 
    k_mem_eff = 30000.0
    
    # 3. 力の釣り合いによるDNAの平衡曲率 kappa_dna の決定
    kappa_dna = (k_mem_eff / (B_dna_factor + k_mem_eff)) * (1.0 / R0)
    
    # 4. 幾何学的ミスマッチ
    mismatch_kappa = (1.0 / R0) - kappa_dna
    
    # 5. ミスマッチが膜に与える局所最大曲率
    amp_factor = 3.0
    H_max = (1.0 / R0) + amp_factor * mismatch_kappa
    
    return H_max

# --- 3. 連続曲線のデータ生成 (範囲を20までに縮小) ---
N_vals = np.linspace(0, 20, 200)
H_vals = np.array([compute_analytical_curvature(n) for n in N_vals])

# --- 4. 膜破壊の臨界点 (交点) の特定 ---
try:
    above_threshold = np.where(H_vals >= H_crit)[0]
    if len(above_threshold) > 0:
        idx = above_threshold[0]
        x_points = [H_vals[idx-1], H_vals[idx]]
        y_points = [N_vals[idx-1], N_vals[idx]]
        interp_func = interp1d(x_points, y_points)
        critical_N = float(interp_func(H_crit))
        has_rupture = True
    else:
        critical_N = None
        has_rupture = False
except Exception:
    critical_N = None
    has_rupture = False

# --- 5. 美しい可視化 ---
plt.figure(figsize=(12, 8)) 

# 曲線の描画（線を太く: linewidth=6）
plt.plot(N_vals, H_vals, color='#3457D5', linewidth=6, label='Max Membrane Curvature ($H_{max}$)')

# 破壊限界の赤い破線（線を太く: linewidth=4）
plt.axhline(y=H_crit, color='#B72334', linestyle='--', linewidth=4)

if has_rupture:
    # Safe Zone と Rupture Zone の背景色を追加
    plt.axvspan(0, critical_N, color='#2E8B57', alpha=0.12, zorder=0)
    plt.axvspan(critical_N, 20, color='#B72334', alpha=0.12, zorder=0)

    # ★ 副題を削除し、曲線よりも上（Y=0.084付近）に配置して被りを完全回避
    plt.text(critical_N * 0.5, 0.084, 'SAFE ZONE', 
             color='#1E5F3B', fontsize=20, fontweight='bold',
             ha='center', va='center', zorder=1)
    
    plt.text(critical_N + (20 - critical_N) * 0.5, 0.084, 'PORE-FORMATION ZONE', 
             color='#8B1A25', fontsize=20, fontweight='bold',
             ha='center', va='center', zorder=1)

    # 臨界点の垂直点線
    plt.axvline(x=critical_N, color='#2C3243', linestyle=':', linewidth=4)
    # 臨界点のドット
    plt.scatter([critical_N], [H_crit], color='#B72334', s=350, zorder=5)
    
    # 臨界点のラベル
    plt.text(critical_N + 0.6, H_crit - 0.003, 
             f'Critical Point\nN = {int(np.round(critical_N))} Helices', 
             bbox=dict(boxstyle="round,pad=0.7", fc="#2C3243", ec="none", alpha=0.9),
             color="white", fontsize=18, fontweight='bold',
             ha='left', va='top')

# 破壊限界のラベル
plt.text(max(N_vals) * 0.98, H_crit, f'Pore-Formation Limit = {H_crit} /nm',
         bbox=dict(boxstyle="round,pad=0.6", fc="#B72334", ec="none", alpha=0.9),
         color="white", fontsize=18, fontweight='bold',
         ha='right', va='center')

# タイトルと軸ラベルの設定
plt.title('Membrane Deformation Analysis', fontsize=26, fontweight='bold', loc='left', pad=25)
plt.xlabel('Number of DNA Helices in Bundle (N)', fontsize=20, fontweight='bold', labelpad=10)
plt.ylabel('Max Local Curvature $H_{max}$ [1/nm]', fontsize=20, fontweight='bold', labelpad=10)

# 目盛り設定
plt.xticks([0, 5, 10, 15, 20], fontsize=16)
plt.yticks([0.02, 0.04, 0.05, 0.067, 0.08], ['0.02', '0.04', '0.05', '0.067', '0.08'], fontsize=16)

# Y軸のY=0.067を赤文字でさらに大きく強調
for label in plt.gca().get_yticklabels():
    if label.get_text() == '0.067':
        label.set_color('#B72334')
        label.set_fontweight('bold')
        label.set_fontsize(20)

plt.xlim(0, 20)
# ★ グラフの上限を 0.088 まで広げ、一番上にテキスト用スペースを確保
plt.ylim(0.02, 0.088) 

# グリッドの設定
plt.grid(True, linestyle='-', alpha=0.7, linewidth=1.2)

# 凡例の設定
plt.legend(loc='lower right', fontsize=20, frameon=True, edgecolor='gray', borderpad=0.8)

plt.tight_layout()
plt.show()

