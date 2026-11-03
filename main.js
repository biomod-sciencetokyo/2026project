document.addEventListener('DOMContentLoaded', () => {

    // ヘッダーの読み込み
    fetch('header.html')
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