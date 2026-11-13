// ライト / ダーク テーマ：選択は localStorage に保存し、全ページで引き継ぐ（既定はダーク）
const THEME_KEY = 'site-theme';
const applyTheme = (theme) => {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
};
try {
    applyTheme(localStorage.getItem(THEME_KEY));
} catch (e) { /* localStorage が使えない環境ではダークのまま */ }

const setupThemeToggle = (button) => {
    const sync = () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        button.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
        button.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    };
    sync();
    button.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 保存できなくても切り替えは有効 */ }
        sync();
    });
};

document.addEventListener('DOMContentLoaded', () => {

    // ヘッダーの読み込み
    fetch('header.html?v=20261113-1')
        .then(response => response.text())
        .then(data => {
            const headerPlaceholder = document.getElementById('header-placeholder');
            if (headerPlaceholder) {
                headerPlaceholder.innerHTML = data;

                // 現在のページに合わせてナビゲーションをハイライトする処理
                const currentPath = window.location.pathname;
                const currentPage = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';
                const navLinks = headerPlaceholder.querySelectorAll('.nav-link');

                navLinks.forEach(link => {
                    link.classList.remove('active');
                    const href = link.getAttribute('href');
                    const linkPage = href.substring(href.lastIndexOf('/') + 1);
                    if (currentPage === linkPage) {
                        link.classList.add('active');
                    }
                });

                const themeToggle = headerPlaceholder.querySelector('.theme-toggle');
                if (themeToggle) setupThemeToggle(themeToggle);
            }
        });

    // フッターの読み込み
    fetch('footer.html')
        .then(response => response.text())
        .then(data => {
            const footerPlaceholder = document.getElementById('footer-placeholder');
            if (footerPlaceholder) {
                footerPlaceholder.innerHTML = data;
            }
        });

    // スクロールアニメーション
    const sections = document.querySelectorAll('.fade-in-section');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {
        rootMargin: '0px 0px -40px 0px',
        threshold: 0
    });

    // シミュレーション環境図：ドットのみ＋共通要素バーによる左右同時スポットライト比較
    const DOT_LAYOUTS = {
        'sim2d_real': {
            bundle: { label: 'DNA bundle', dot: [22.0, 14.0] },
            linker: { label: 'TEG linker', dot: [34.3, 25.5] },
            chol: { label: 'Cholesterol', dot: [62.2, 31.5] },
            membrane: { label: 'Lipid membrane', dot: [50.0, 56.0] }
        },
        'sim2d_model': {
            bundle: { label: 'DNA bundle', dot: [22.8, 11.0] },
            linker: { label: 'TEG linker', dot: [35.6, 20.0] },
            chol: { label: 'Cholesterol', dot: [61.0, 27.3] },
            membrane: { label: 'Lipid membrane', dot: [50.0, 45.5] }
        },
        'sim3d_real': {
            bundle: { label: 'DNA bundle', dot: [48.5, 23.5] },
            chol: { label: 'Cholesterol anchors', dot: [39.7, 32.3] },
            membrane: { label: 'Lipid membrane', dot: [64.0, 76.0] }
        },
        'sim3d_model': {
            bundle: { label: 'DNA bundle', dot: [48.5, 23.5] },
            chol: { label: 'Cholesterol anchors', dot: [39.7, 32.3] },
            membrane: { label: 'Lipid membrane', dot: [64.0, 76.0] }
        }
    };

    document.querySelectorAll('[data-sim-env]').forEach(env => {
        // 共通の要素バー（.sim-env-parts）を比較パネルのすぐ上に配置
        const partsList = env.querySelector('.sim-env-parts');
        const panels = env.querySelector('.sim-env-panels');
        if (partsList && panels) {
            env.insertBefore(partsList, panels);
        }

        env.querySelectorAll('.sim-env-canvas').forEach(canvas => {
            const img = canvas.querySelector('img');
            if (!img) return;
            const src = img.getAttribute('src') || '';
            const key = Object.keys(DOT_LAYOUTS).find(k => src.includes(k));
            if (!key) return;
            const layout = DOT_LAYOUTS[key];

            canvas.querySelectorAll('.sim-env-marker').forEach(marker => {
                const part = marker.dataset.part;
                const cfg = layout[part];
                if (!cfg) return;

                marker.classList.add('sim-env-beacon');
                marker.style.left = `${cfg.dot[0]}%`;
                marker.style.top = `${cfg.dot[1]}%`;
                marker.dataset.label = cfg.label;
                marker.textContent = '';
            });
        });

        const parts = env.querySelectorAll('[data-part]');
        let pinned = null;

        const highlight = (name) => {
            env.classList.toggle('has-active', Boolean(name));
            if (name) {
                env.dataset.activePart = name;
            } else {
                delete env.dataset.activePart;
            }
            parts.forEach(el => el.classList.toggle('is-active', el.dataset.part === name));
        };

        parts.forEach(el => {
            el.addEventListener('mouseenter', () => highlight(el.dataset.part));
            el.addEventListener('mouseleave', () => highlight(pinned));
            el.addEventListener('focus', () => highlight(el.dataset.part));
            el.addEventListener('blur', () => highlight(pinned));
            el.addEventListener('click', () => {
                pinned = pinned === el.dataset.part ? null : el.dataset.part;
                highlight(pinned);
            });
        });
    });

    // Approach アニメーション：再生位置に合わせて Step の文章を切り替える
    const approachPlayer = document.getElementById('approach-player');
    if (approachPlayer) {
        const video = approachPlayer.querySelector('.approach-video');
        const toggle = approachPlayer.querySelector('.approach-toggle');
        const steps = [...approachPlayer.querySelectorAll('.approach-tab')].map(el => ({
            el,
            panel: document.getElementById(el.getAttribute('aria-controls')),
            bar: el.querySelector('.approach-tab-bar span'),
            start: parseFloat(el.dataset.start),
            end: parseFloat(el.dataset.end)
        }));
        let userPaused = false;

        video.muted = true;
        video.playsInline = true;

        const render = () => {
            const t = video.currentTime;
            const end = video.duration || Infinity;
            steps.forEach(s => {
                const sEnd = Math.min(s.end, end);
                const active = t >= s.start && t < sEnd;
                s.el.classList.toggle('is-active', active);
                s.el.classList.toggle('is-done', t >= sEnd);
                s.el.setAttribute('aria-selected', active ? 'true' : 'false');
                s.panel.classList.toggle('is-active', active);
                const p = Math.max(0, (t - s.start) / (sEnd - s.start));
                s.bar.style.width = active ? (p * 100) + '%' : '';
            });
            const current = steps.findIndex(s => s.el.classList.contains('is-active'));
            if (current >= 0) approachPlayer.style.setProperty('--step', current);
            approachPlayer.classList.toggle('is-paused', video.paused);
            toggle.setAttribute('aria-label', video.paused ? 'Play animation' : 'Pause animation');
        };
        // 描画ループは常に1本だけ（play と playing の両方で呼ばれても二重にならない）
        let rafId = 0;
        const loop = () => {
            rafId = 0;
            render();
            if (!video.paused) startLoop();
        };
        const startLoop = () => {
            if (!rafId) rafId = requestAnimationFrame(loop);
        };
        video.addEventListener('play', startLoop);
        video.addEventListener('playing', startLoop);
        video.addEventListener('timeupdate', render);
        video.addEventListener('pause', render);
        video.addEventListener('seeked', render);
        video.addEventListener('loadedmetadata', render);

        const play = () => {
            video.muted = true;
            const p = video.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => render());
            }
        };
        const togglePlay = () => {
            userPaused = !video.paused;
            if (userPaused) video.pause(); else play();
        };
        toggle.addEventListener('click', togglePlay);
        video.addEventListener('click', togglePlay);
        steps.forEach(s => {
            s.el.addEventListener('click', () => {
                video.currentTime = s.start + 0.01;
                userPaused = false;
                play();
            });
        });

        // 画面に入ったら再生、外れたら一時停止
        new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !userPaused) play();
                else if (!entry.isIntersecting) video.pause();
            });
        }, { threshold: 0.2 }).observe(video);
        render();
        if (!video.paused) startLoop();
    }

    sections.forEach(section => {
        // 初期読み込み時に画面内（ビューポート）に既に表示されている要素は即座にフェードイン
        const rect = section.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            section.classList.add('is-visible');
        } else {
            observer.observe(section);
        }
    });
});