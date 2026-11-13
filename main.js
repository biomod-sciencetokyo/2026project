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

// 目次の現在地表示と追従
// Bootstrap のスクロールスパイは、画面の何倍もある長いセクションや入れ子の目次で現在地を見失うため、
// 「見出しが画面上部を通過した最後の項目」を現在地とする単純な方式で自前に判定する。
// 目次が画面より長い時は、現在地の項目が目次の表示範囲に入るよう目次側もスクロールさせる。
// 章と 2 桁目（1.1, 2.1 …）は常に表示。その下の 3 段目の項目は本文の見出しから自動で作り、
// 今読んでいる 2 桁目・押した 2 桁目の分だけ開く。
(function () {
    const toc = document.querySelector('.sidebar-toc');
    if (!toc) return;

    // 3 段目以降の目次項目を、各 2 桁目の範囲にある見出しから生成する
    //   トピック見出し（h4.section-subtitle, .wet-exp-title）→ 3 段目
    //   小見出し（.wet-subhead）→ 直前のトピックの下
    //   ラベル（MATERIALS, OVERVIEW など .wet-label / .exp-label）→ 直前の小見出し（なければトピック）の下。
    //   親がない場合は 1 つ上の段に並べる
    const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    const usedIds = new Set();
    const makeList = (cls) => {
        const el = document.createElement('div');
        el.className = 'nav flex-column sidebar-toc-subnav ' + cls;
        return el;
    };
    const makeLink = (h, label, preferredId) => {
        let id = h.id || preferredId;
        if (!id) {
            const base = 'toc-' + slug(label);
            id = base;
            let n = 2;
            while (document.getElementById(id)) id = base + '-' + n++;
            h.id = id;
        }
        usedIds.add(id);
        const a = document.createElement('a');
        a.className = 'nav-link';
        a.href = '#' + id;
        a.textContent = label;
        return a;
    };
    toc.querySelectorAll(':scope > .sidebar-toc-subnav > a.nav-link[href^="#"]').forEach(link => {
        const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
        if (!target) return;
        // 目次の行き先が見出しそのものの場合は、その見出しを含むまとまり全体を範囲にする
        const scope = target.matches('h2, h3') ? target.parentElement : target;
        const nodes = [...scope.querySelectorAll('h4.section-subtitle, .wet-exp-title, .wet-subhead, .wet-label, .exp-label')]
            .filter(h => !h.closest('.content-box, figure, table'));
        if (!nodes.length) return;
        const sub = makeList('toc-sub3');
        let topicList = null; // 直前のトピックの下のリスト
        let subheadList = null; // 直前の小見出しの下のリスト
        nodes.forEach(h => {
            const isLabel = h.matches('.wet-label, .exp-label');
            const tag = h.querySelector('.wet-exp-id');
            const text = (tag ? tag.textContent : h.textContent).replace(/\s+/g, ' ').trim();
            const label = isLabel ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text;
            const block = h.parentElement.closest('[id]');
            const preferred = (!isLabel && block && block !== target && block !== scope && !usedIds.has(block.id)
                && block.firstElementChild === h) ? block.id : null;
            const a = makeLink(h, label, preferred);
            if (isLabel) {
                (subheadList || topicList || sub).appendChild(a);
            } else if (h.matches('.wet-subhead')) {
                const parent = topicList || sub;
                parent.appendChild(a);
                subheadList = makeList('toc-sub5');
                parent.appendChild(subheadList);
            } else {
                sub.appendChild(a);
                topicList = makeList('toc-sub4');
                sub.appendChild(topicList);
                subheadList = null;
            }
        });
        sub.querySelectorAll('.toc-sub4, .toc-sub5').forEach(l => { if (!l.children.length) l.remove(); });
        link.after(sub);
    });
    const items = [...toc.querySelectorAll('a.nav-link[href^="#"]')]
        .map(link => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
        .filter(item => item.target);
    if (!items.length) return;

    const ACTIVE_LINE = 140; // 固定ヘッダーの少し下
    let current = null;

    // 開閉するのは 3 段目以降のリスト。現在地（または押した項目）の祖先のリストと、その項目の直下のリストだけ開く
    const groups = [...toc.querySelectorAll('.toc-sub3, .toc-sub4, .toc-sub5')];
    if (groups.length) toc.classList.add('toc-collapsible');
    let lockUntil = 0; // 項目を押した直後のスクロール中は、通過した章を開かない

    function openFor(link) {
        const open = new Set();
        if (link) {
            groups.forEach(g => { if (g.contains(link)) open.add(g); });
            const next = link.nextElementSibling;
            if (next && groups.includes(next)) open.add(next);
        }
        groups.forEach(g => {
            const isOpen = open.has(g);
            g.classList.toggle('is-open', isOpen);
            const parent = g.previousElementSibling;
            if (parent) parent.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    toc.addEventListener('click', (event) => {
        const link = event.target.closest('a.nav-link');
        if (!link || !groups.length) return;
        openFor(link);
        lockUntil = Date.now() + 1200;
    });

    function keepInView(link) {
        if (toc.scrollHeight <= toc.clientHeight) return;
        const tocRect = toc.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();
        if (linkRect.top < tocRect.top + 40 || linkRect.bottom > tocRect.bottom - 40) {
            toc.scrollTo({
                top: toc.scrollTop + (linkRect.top - tocRect.top) - toc.clientHeight / 3,
                behavior: 'smooth'
            });
        }
    }

    function update() {
        let next = items[0];
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        for (const item of items) {
            const top = item.target.getBoundingClientRect().top;
            if (top <= ACTIVE_LINE || (atBottom && top < window.innerHeight)) next = item;
        }
        if (next === current) return;
        current = next;
        toc.querySelectorAll('.nav-link.active').forEach(el => el.classList.remove('active'));
        next.link.classList.add('active');
        // 入れ子の目次では、親の項目（1. → 1.1 → 1.1.1）もすべて現在地として光らせる
        let subnav = next.link.closest('.sidebar-toc-subnav');
        while (subnav) {
            const parent = subnav.previousElementSibling;
            if (parent && parent.classList.contains('nav-link')) parent.classList.add('active');
            subnav = subnav.parentElement.closest('.sidebar-toc-subnav');
        }
        if (groups.length && Date.now() >= lockUntil) openFor(next.link);
        keepInView(next.link);
    }

    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; update(); });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Bootstrap のスクロールスパイは window の load 時に data-bs-spy を見て自動起動する。起動後に止めても
    // 目次クリック時の処理が残ってエラーになるため、起動前に属性を外してこちらの判定に一本化する
    // （レイアウトの CSS は :has(.sidebar-toc) でも当たるので影響しない）
    document.querySelectorAll('[data-bs-spy="scroll"]').forEach(el => el.removeAttribute('data-bs-spy'));
    window.addEventListener('load', () => {
        current = null;
        update();
    });
    update();
})();
