import numpy as np
import matplotlib.pyplot as plt
from scipy.interpolate import interp1d

# --- 1. 物理パラメーター ---
R0 = 50.0                 # リポソーム初期半径 [nm]
L_bundle = 60.0           # DNA束の長さ [nm]
H_crit = 0.067            # 膜破壊の臨界平均曲率 [1/nm]

# --- 2. 解析力学モデル (alpha対応版) ---
def compute_analytical_curvature(N, alpha):
    B_dna_factor = alpha * 50.0 * (N**2) * L_bundle
    k_mem_eff = 30000.0
    kappa_dna = (k_mem_eff / (B_dna_factor + k_mem_eff)) * (1.0 / R0)
    mismatch_kappa = (1.0 / R0) - kappa_dna
    amp_factor = 3.0
    H_max = (1.0 / R0) + amp_factor * mismatch_kappa
    return H_max

# --- 3. データ生成 ---
N_vals = np.linspace(0, 40, 200)
alpha_list = [1.0, 0.5, 0.1]
colors = ['#3457D5', '#2E8B57', '#9932CC']
labels = [r'Perfect rigid ($\alpha=1.0$)', r'Semi-flexible ($\alpha=0.5$)', r'Loosely bundled ($\alpha=0.1$)']

results_H = []
critical_Ns = []

for alpha in alpha_list:
    H_vals = np.array([compute_analytical_curvature(n, alpha) for n in N_vals])
    results_H.append(H_vals)

    try:
        above_threshold = np.where(H_vals >= H_crit)[0]
        if len(above_threshold) > 0:
            idx = above_threshold[0]
            interp_func = interp1d([H_vals[idx-1], H_vals[idx]], [N_vals[idx-1], N_vals[idx]])
            crit_N = float(interp_func(H_crit))
        else:
            crit_N = None
    except Exception:
        crit_N = None

    critical_Ns.append(crit_N)

# --- 4. グラフ描画（スッキリ改善版） ---
plt.figure(figsize=(14, 9))

# 破壊閾値の赤い破線
plt.axhline(y=H_crit, color='#B72334', linestyle='--', linewidth=4)
plt.text(39.5, H_crit + 0.001, f'Rupture Limit = {H_crit} /nm',
         bbox=dict(boxstyle="round,pad=0.5", fc="#B72334", ec="none", alpha=0.9),
         color="white", fontsize=18, fontweight='bold', ha='right', va='bottom')


# --- X軸の目盛りの被り防止処理 ---
# 限界本数と近すぎる標準目盛り（10, 20など）を間引いてスッキリさせる
base_ticks_vals = [0, 10, 20, 30, 40]
valid_crit_Ns = [n for n in critical_Ns if n is not None]
safe_base_ticks = []

for bt in base_ticks_vals:
    # 限界本数の数値から「距離が2.5以上」離れている標準目盛りのみ残す
    if all(abs(bt - cn) > 2.5 for cn in valid_crit_Ns):
        safe_base_ticks.append(bt)

tick_data = [(x, str(x), 'black', 16, 'normal') for x in safe_base_ticks]

# 各 alpha の曲線をプロット
for i in range(len(alpha_list)):
    alpha = alpha_list[i]
    H_vals = results_H[i]
    crit_N = critical_Ns[i]
    color = colors[i]

    # メインの曲線
    plt.plot(N_vals, H_vals, color=color, linewidth=6, label=labels[i])

    if crit_N:
        # 交点のドットと垂直点線のみ描画（ごちゃつくテキストは排除）
        plt.scatter([crit_N], [H_crit], color=color, s=400, zorder=5, edgecolors='white', linewidth=2.5)
        plt.vlines(x=crit_N, ymin=0.02, ymax=H_crit, color=color, linestyle=':', linewidth=4)

        # X軸の目盛りに限界本数を強烈にアピール（色付き、極太字、特大サイズ）
        tick_data.append((crit_N, f'{crit_N:.1f}', color, 24, 'bold'))

# --- 目盛りとラベルの適用 ---
tick_data.sort(key=lambda item: item[0])
ticks = [item[0] for item in tick_data]
tick_labels = [item[1] for item in tick_data]

plt.xticks(ticks, tick_labels)
ax = plt.gca()

# X軸の目盛りの色とスタイルを適用
for tick_label, data in zip(ax.get_xticklabels(), tick_data):
    tick_label.set_color(data[2])
    tick_label.set_fontsize(data[3])
    tick_label.set_fontweight(data[4])

# タイトルと軸ラベル
plt.title('Effect of Cross-linking Efficiency ($\\alpha$) on Membrane Rupture', fontsize=26, fontweight='bold', pad=25)
plt.xlabel('Number of DNA Helices in Bundle (N)', fontsize=22, fontweight='bold', labelpad=15)
plt.ylabel('Max Local Curvature $H_{max}$ [1/nm]', fontsize=22, fontweight='bold', labelpad=15)

plt.xlim(0, 40)
plt.ylim(0.02, 0.09)

# Y軸の目盛り設定（0.067を赤色・特大サイズで強調）
base_yticks = [0.02, 0.04, 0.06, 0.067, 0.08]
plt.yticks(base_yticks, ['0.02', '0.04', '0.06', '0.067', '0.08'], fontsize=16)
for label in ax.get_yticklabels():
    if label.get_text() == '0.067':
        label.set_color('#B72334')
        label.set_fontweight('bold')
        label.set_fontsize(20)

plt.grid(True, linestyle='-', alpha=0.5, linewidth=1.2)
# 凡例を大きくして右下に配置（これでどの線が何か完璧に分かります）
plt.legend(loc='lower right', fontsize=20, frameon=True, edgecolor='gray', borderpad=0.8)
plt.tight_layout()
plt.show()
