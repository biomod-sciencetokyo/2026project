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
    fetch('header.html?v=20261113-2')
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
    fetch('footer.html?v=20261113-2')
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
            const label = h.dataset.tocLabel || (isLabel ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text);
            const block = h.parentElement.closest('[id]');
            const preferred = (!isLabel && block && block !== target && block !== scope && !usedIds.has(block.id)
                && block.firstElementChild === h) ? block.id : null;
            const a = makeLink(h, label, preferred);
            if (isLabel) a.classList.add('toc-label');
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

// miRNA プリンセス：全ページ右下の「トップへ戻る」ボタン
// 少しスクロールすると現れてふわふわ浮く。マウスを乗せると歩き、押すとバク転してから先頭へ戻る
(function () {
    if (document.body.classList.contains('no-princess-top')) return; // 姫の隠しページでは出さない
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'princess-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.title = 'Back to top';
    btn.innerHTML = '<span class="princess-bubble" aria-hidden="true">TOP</span><span class="princess-sprite" aria-hidden="true"></span>';
    document.body.appendChild(btn);

    // ページごとに待機ポーズを変える（ホバー＝歩く／クリック＝バク転は全ページ共通）
    const poses = {
        'index.html': 'princess_wave.gif',       // HOME：手を振ってお出迎え
        'project.html': 'princess_step.gif',     // PROJECT：足踏みで出発
        'simulation.html': 'princess_turn.gif',  // SIMULATION：3Dモデルのようにくるっと回転
        'experiment.html': 'princess_handstand.gif', // EXPERIMENT：体を張って実験
        'discussion.html': 'princess_look.gif',  // DISCUSSION：きょろきょろ考察
        'elsi.html': 'princess_sway.gif',        // ELSI：ゆったり揺れて思案
        'team.html': 'princess_jump.gif',        // TEAM：ぴょんぴょん喜ぶ
        'appendix.html': 'princess_wave.gif'     // APPENDIX：最後にバイバイ
    };
    const page = location.pathname.split('/').pop() || 'index.html';
    const pose = poses[page];
    if (pose) {
        const sprite = btn.querySelector('.princess-sprite');
        sprite.style.setProperty('--princess-idle', `url("img/mascot/${pose}")`);
        // 回転GIFだけ 128px キャンバスなので、他(160px)と姫の大きさを揃える
        if (pose === 'princess_turn.gif') sprite.style.setProperty('--princess-idle-size', '80%');
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const toggle = () => btn.classList.toggle('is-visible', window.scrollY > 600);
    window.addEventListener('scroll', toggle, { passive: true });
    toggle();

    const goTop = () => window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    btn.addEventListener('click', () => {
        if (reduceMotion.matches || btn.classList.contains('is-flipping')) {
            goTop();
            return;
        }
        btn.classList.add('is-flipping');
        const sprite = btn.querySelector('.princess-sprite');
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            btn.classList.remove('is-flipping');
            goTop();
        };
        sprite.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, 1200); // アニメーションが動かない環境でも必ず戻る
    });
})();

// 姫の隠しページ（princess.html）
// ふだんは真ん中でふわふわ待機し、放っておくと自分からきょろきょろ・ゆらゆら。
// カーソルを乗せると手を振って "tap me!"、タップでランダムに反応。5 連打で逆立ち、ハートの節目で特別なセリフ（どちらも紙吹雪）
(function () {
    const stage = document.getElementById('princess-stage');
    if (!stage) return;
    const actor = stage.querySelector('.princess-actor');
    const react = stage.querySelector('.princess-react');
    const say = stage.querySelector('.princess-say');
    const heartsEl = document.getElementById('princess-hearts');

    // ms = GIF 1 周の長さ（コマ数 × 200ms）
    const poses = {
        wave: { gif: 'princess_wave.gif', ms: 1800 },
        jump: { gif: 'princess_jump.gif', ms: 1400 },
        turn: { gif: 'princess_turn.gif', ms: 1600, small: true },
        look: { gif: 'princess_look.gif', ms: 1800 },
        sway: { gif: 'princess_sway.gif', ms: 4200 },
        step: { gif: 'princess_step.gif', ms: 1800 },
        handstand: { gif: 'princess_handstand.gif', ms: 4200 }
    };
    // タップ時のランダム反応（逆立ちは 5 連打のごほうびなので入れない）
    const tapReactions = [
        ['wave', 'Hello!'],
        ['jump', 'Yay!'],
        ['turn', 'Ta-da!'],
        ['look', 'Hm? What was that?'],
        ['sway', 'La la la ♪'],
        ['step', 'One, two! One, two!']
    ];
    const fidgets = ['look', 'sway']; // 放っておいたときの仕草
    const milestones = {
        10: 'Thank you for playing with me!',
        50: 'Wow, 50 hearts! You are my best friend!',
        100: '100 hearts!! I love you all!',
        200: 'You are a true royal friend!',
        500: 'Five hundred?! I am so happy!',
        1000: 'A thousand hearts... my hero!'
    };
    const goals = Object.keys(milestones).map(Number);
    const meter = document.getElementById('princess-meter');
    const meterBar = meter && meter.parentElement;
    const nextEl = document.getElementById('princess-next');
    const COMBO_GAP = 700;  // この間隔以内のタップを連打とみなす
    const COMBO_COUNT = 5;

    Object.values(poses).forEach(p => { new Image().src = `img/mascot/${p.gif}`; }); // 先読み

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canHover = window.matchMedia('(hover: hover)');

    // ハートの数はこの閲覧者のブラウザにだけ覚えておく（使えない環境でも動く）
    let hearts = 0;
    try { hearts = parseInt(localStorage.getItem('princessHearts'), 10) || 0; } catch (e) { /* ignore */ }
    // 好感度ゲージ：前の節目から次の節目までの進み具合
    const updateMeter = () => {
        heartsEl.textContent = hearts;
        if (!meter) return;
        const next = goals.find(g => g > hearts);
        if (next === undefined) {
            meter.style.width = '100%';
            meterBar.setAttribute('aria-valuenow', '100');
            nextEl.textContent = 'Maximum royal affection!';
            return;
        }
        const prev = [0, ...goals].filter(g => g <= hearts).pop();
        const pct = Math.round(((hearts - prev) / (next - prev)) * 100);
        meter.style.width = `${pct}%`;
        meterBar.setAttribute('aria-valuenow', String(pct));
        nextEl.textContent = `Next surprise at ${next} hearts`;
    };
    updateMeter();

    // 別タブで押した分も、このタブの表示に反映する
    window.addEventListener('storage', event => {
        if (event.key !== 'princessHearts') return;
        const v = parseInt(event.newValue, 10) || 0;
        if (v > hearts) {
            hearts = v;
            updateMeter();
        }
    });

    // 紙吹雪（5 連打・節目のとき）
    const confetti = () => {
        if (reduceMotion.matches) return;
        const colors = ['#ff8fc8', '#f6d27a', '#ffffff', '#e2457f', '#c9a6ff'];
        for (let k = 0; k < 36; k++) {
            const c = document.createElement('span');
            c.className = 'royal-confetti';
            c.style.left = `${Math.random() * 100}%`;
            c.style.background = colors[k % colors.length];
            c.style.animationDelay = `${Math.random() * 0.4}s`;
            c.style.setProperty('--fall', `${1.8 + Math.random() * 1.4}s`);
            c.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
            c.style.setProperty('--spin', `${(Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540)}deg`);
            stage.appendChild(c);
            c.addEventListener('animationend', () => c.remove(), { once: true });
            setTimeout(() => c.remove(), 4000);
        }
    };

    let mode = 'rest';      // rest / hover / tap / fidget
    let hovering = false;
    let timer = null;
    let fidgetTimer = null;
    let lastTap = -1;
    let combo = 0;
    let lastTapAt = 0;

    // GIF を 1 コマ目から再生（ms を渡すとその後 rest に戻る。null ならループし続ける）
    const play = (key, line, nextMode, ms) => {
        const p = poses[key];
        clearTimeout(timer);
        clearTimeout(fidgetTimer);
        mode = nextMode;
        react.src = `img/mascot/${p.gif}?play=${Date.now()}`;
        react.classList.toggle('is-small-canvas', !!p.small);
        react.hidden = false;
        stage.classList.add('is-reacting');
        if (line) {
            say.textContent = line;
            say.classList.add('is-shown');
        } else {
            say.classList.remove('is-shown');
        }
        timer = ms === null ? null : setTimeout(rest, ms || p.ms);
    };

    const scheduleFidget = () => {
        clearTimeout(fidgetTimer);
        if (reduceMotion.matches) return;
        fidgetTimer = setTimeout(() => {
            if (mode === 'rest' && !document.hidden) {
                play(fidgets[Math.floor(Math.random() * fidgets.length)], null, 'fidget');
            } else {
                scheduleFidget();
            }
        }, 6000 + Math.random() * 5000);
    };

    function rest() {
        timer = null;
        if (hovering) {
            play('wave', 'tap me!', 'hover', null);
            return;
        }
        mode = 'rest';
        stage.classList.remove('is-reacting');
        react.hidden = true;
        react.removeAttribute('src');
        say.classList.remove('is-shown');
        scheduleFidget();
    }

    actor.addEventListener('mouseenter', () => {
        if (!canHover.matches) return;
        hovering = true;
        if (mode !== 'tap') play('wave', 'tap me!', 'hover', null);
    });
    actor.addEventListener('mouseleave', () => {
        hovering = false;
        if (mode === 'hover') rest();
    });

    const floatHeart = () => {
        const heart = document.createElement('i');
        heart.className = 'fa-solid fa-heart princess-heart';
        heart.setAttribute('aria-hidden', 'true');
        const a = actor.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        heart.style.left = `${a.left - s.left + a.width * (0.3 + Math.random() * 0.4)}px`;
        heart.style.top = `${a.top - s.top + a.height * 0.2}px`;
        stage.appendChild(heart);
        heart.addEventListener('animationend', () => heart.remove(), { once: true });
        setTimeout(() => heart.remove(), 1500);
    };

    actor.addEventListener('click', () => {
        const now = Date.now();
        combo = now - lastTapAt < COMBO_GAP ? combo + 1 : 1;
        lastTapAt = now;

        // 別タブで増えた分を上書きしないよう、保存済みの最新値に 1 を足す
        try { hearts = Math.max(hearts, parseInt(localStorage.getItem('princessHearts'), 10) || 0); } catch (e) { /* ignore */ }
        hearts += 1;
        updateMeter();
        stage.dispatchEvent(new CustomEvent('princess-heart')); // 寄せ書き帳が「この訪問のハート数」を数える
        try { localStorage.setItem('princessHearts', String(hearts)); } catch (e) { /* ignore */ }
        floatHeart();

        let key;
        let line;
        if (combo >= COMBO_COUNT) {
            key = 'handstand';
            line = 'Watch this!';
            combo = 0;
            confetti();
        } else {
            let i;
            do { i = Math.floor(Math.random() * tapReactions.length); } while (i === lastTap);
            lastTap = i;
            [key, line] = tapReactions[i];
        }
        let ms = poses[key].ms;
        if (milestones[hearts]) {
            line = milestones[hearts];
            ms = Math.max(ms, 3000); // 特別なセリフは読めるだけ長く出す
            confetti();
        }
        play(key, line, 'tap', ms);
    });

    scheduleFidget();
})();

// 姫の寄せ書き帳（princess.html）：ニックネームとこの訪問で押したハート数を Google スプレッドシートへ送り、
// 全員分を時系列（古い→新しい）で並べる。保存先 URL は #princess-guestbook の data-endpoint
// （作り方：tools/princess-guestbook/README.md）
(function () {
    const book = document.getElementById('princess-guestbook');
    if (!book) return;
    const endpoint = (book.dataset.endpoint || '').trim();
    const stage = document.getElementById('princess-stage');
    const form = book.querySelector('.guestbook-form');
    const input = document.getElementById('guestbook-nickname');
    const button = form.querySelector('.guestbook-submit');
    const status = document.getElementById('guestbook-status');
    const sessionEl = document.getElementById('guestbook-session-hearts');
    const list = document.getElementById('guestbook-list');
    const empty = document.getElementById('guestbook-empty');
    const totalBox = document.getElementById('princess-total');
    const totalEl = document.getElementById('princess-total-count');

    const showEmpty = text => {
        empty.textContent = text;
        empty.hidden = !text;
    };

    if (!endpoint) {
        form.hidden = true;
        showEmpty('The guestbook is opening soon!');
        return;
    }

    let session = 0;
    let signed = false;
    let sending = false;
    let mine = null; // 自分が今書いた行（一覧で目立たせる）

    const refreshButton = () => {
        button.disabled = sending || signed || session < 1;
    };

    try { input.value = localStorage.getItem('princessNickname') || ''; } catch (e) { /* ignore */ }

    // ---- 全員の合計タップ数：タップは数秒ぶんまとめて送る（1 タップごとには送らない） ----
    const MAX_BATCH = 300;   // Code.gs の MAX_TAPS_PER_POST と合わせる
    let serverTotal = null;  // 保存先から最後に受け取った合計（古い Code.gs なら null のまま＝表示しない）
    let pending = 0;         // まだ送っていないタップ
    let inFlight = 0;        // 送信中のタップ
    let flushTimer = null;
    let tapSeq = 0;          // 送信が終わるたびに増える（古い読み込み結果で合計を戻さないため）

    const showTotal = () => {
        if (serverTotal === null) return;
        totalEl.textContent = (serverTotal + inFlight + pending).toLocaleString('en-US');
        totalBox.hidden = false;
    };
    const tapBody = count => JSON.stringify({ type: 'taps', count });

    const flush = () => {
        clearTimeout(flushTimer);
        flushTimer = null;
        if (!pending || inFlight) return;
        const count = Math.min(pending, MAX_BATCH);
        pending -= count;
        inFlight = count;
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: tapBody(count)
        })
            .then(r => r.json())
            .then(data => {
                if (!data || !data.ok) throw new Error('rejected');
                if (typeof data.total === 'number') serverTotal = data.total;
            })
            .catch(() => { pending += count; }) // 失敗したら次の送信に回す
            .finally(() => {
                inFlight = 0;
                tapSeq += 1;
                showTotal();
                if (pending) flushTimer = setTimeout(flush, 3000);
            });
    };

    stage.addEventListener('princess-heart', () => {
        pending += 1;
        showTotal();
        if (pending >= MAX_BATCH) flush();
        else if (!flushTimer) flushTimer = setTimeout(flush, 2000);
    });

    // ページを離れる・タブを切り替えるときは、残りをまとめて送る（返事は待たない）
    const flushOnLeave = () => {
        if (!pending) return;
        const count = Math.min(pending, MAX_BATCH);
        const blob = new Blob([tapBody(count)], { type: 'text/plain;charset=utf-8' });
        if (navigator.sendBeacon && navigator.sendBeacon(endpoint, blob)) {
            pending -= count;
            if (serverTotal !== null) serverTotal += count;
        }
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushOnLeave();
    });
    window.addEventListener('pagehide', flushOnLeave);

    stage.addEventListener('princess-heart', () => {
        session += 1;
        sessionEl.textContent = session;
        if (!signed && session === 1) status.textContent = 'When you are ready, sign the guestbook!';
        refreshButton();
    });

    const pad = n => String(n).padStart(2, '0');
    const formatTime = iso => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    let firstRender = true;
    const render = entries => {
        // いちばん下（最新）を見ていたときだけ、更新後も最新までスクロールする
        const atBottom = firstRender || list.scrollHeight - list.scrollTop - list.clientHeight < 40;
        const keepScroll = list.scrollTop;
        firstRender = false;
        list.replaceChildren();
        if (!entries.length) {
            showEmpty('No signatures yet. Be the first!');
            return;
        }
        showEmpty('');
        let mineMarked = false;
        // 新しいほうから探して、自分の行を 1 つだけ目立たせる
        const mineIndex = mine
            ? entries.map(e => e.nickname === mine.nickname && e.hearts === mine.hearts).lastIndexOf(true)
            : -1;
        entries.forEach((entry, i) => {
            const li = document.createElement('li');
            const time = document.createElement('time');
            time.className = 'guestbook-time';
            time.dateTime = entry.time;
            time.textContent = formatTime(entry.time);
            const name = document.createElement('span');
            name.className = 'guestbook-name';
            name.textContent = entry.nickname; // textContent なので HTML として解釈されない
            const hearts = document.createElement('span');
            hearts.className = 'guestbook-hearts';
            hearts.textContent = `♥ ${entry.hearts}`;
            li.append(time, name, hearts);
            if (i === mineIndex && !mineMarked) {
                li.classList.add('is-mine');
                mineMarked = true;
            }
            list.appendChild(li);
        });
        list.scrollTop = atBottom ? list.scrollHeight : keepScroll;
    };

    const load = () => {
        const seqAtStart = tapSeq;
        return fetch(endpoint)
        .then(r => r.json())
        .then(data => {
            if (!data || !data.ok || !Array.isArray(data.entries)) throw new Error('bad response');
            if (typeof data.total === 'number' && !inFlight && seqAtStart === tapSeq) {
                serverTotal = data.total;
                showTotal();
            }
            render(data.entries);
        })
        .catch(() => {
            if (list.children.length) return; // 定期更新の失敗なら、今の表示をそのまま残す
            showEmpty('Could not load the guestbook. Please try again later.');
        });
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (button.disabled) return;
        const nickname = input.value.replace(/\s+/g, ' ').trim().slice(0, 20);
        sending = true;
        refreshButton();
        status.classList.remove('is-error');
        status.textContent = 'Signing…';

        // text/plain で送ると、Apps Script へのリクエストで事前確認（CORS preflight）が起きない
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ nickname, hearts: session })
        })
            .then(r => r.json())
            .then(data => {
                if (!data || !data.ok) throw new Error('rejected');
                signed = true;
                mine = { nickname: nickname || 'Anonymous', hearts: session };
                try { localStorage.setItem('princessNickname', nickname); } catch (e) { /* ignore */ }
                input.disabled = true;
                button.textContent = 'Signed ♥';
                status.textContent = `Thank you, ${mine.nickname}! The princess will remember you.`;
                return load();
            })
            .catch(() => {
                status.classList.add('is-error');
                status.textContent = 'Could not sign the guestbook. Please try again.';
            })
            .finally(() => {
                sending = false;
                refreshButton();
            });
    });

    load();
    // 開いている間は 30 秒ごとに読み直す（他の人のハート・サインを反映。タブが裏にあるときは休む）
    setInterval(() => {
        if (document.visibilityState === 'visible') load();
    }, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') load();
    });
})();
