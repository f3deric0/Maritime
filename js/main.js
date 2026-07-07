/**
 * main.js
 * UI interactions: loader, intro video, custom cursor,
 * scroll behaviour, horizontal units scroll, reveal animations,
 * counters and micro-interactions.
 */

/* ── LITE MODE ───────────────────────────────────────────────────────
   On Save-Data or 2G connections the ambient videos (~20 MB combined)
   are never fetched; CSS swaps in a static seascape instead. */
const LITE = (() => {
  const c = navigator.connection || {};
  return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
})();
if (LITE) document.body.classList.add('lite');

/* ── FORCE-PLAY ALL MUTED VIDEOS ─────────────────────────────────────
   Browsers block HTML autoplay even when muted. We explicitly call
   play() as soon as the video has data, and retry on the first user
   gesture (which unblocks autoplay in all browsers permanently).
   Ambient videos ship with preload="none" and no autoplay attribute, so
   nothing downloads until this code decides it should.
   ─────────────────────────────────────────────────────────────────── */
(function () {
  if (LITE) return;

  function tryPlay(v) {
    if (!v || !v.muted || !v.paused) return;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }

  function armVideo(v) {
    v.muted = true;
    // fire now if already loaded, else start fetching and wait for data
    if (v.readyState >= 2) { tryPlay(v); return; }
    v.addEventListener('loadeddata', () => tryPlay(v), { once: true });
    v.addEventListener('canplay',    () => tryPlay(v), { once: true });
    if (v.preload === 'none') { v.preload = 'auto'; try { v.load(); } catch (_) {} }
  }

  // Arm every muted video — fire play() as soon as data arrives
  // #svVideo is driven manually by scroll position (see scroll-scrub section
  // below) — it must never be auto-played or it will fight that logic.
  const autoplayVideos = () => [...document.querySelectorAll('video')].filter(v => v.id !== 'svVideo');

  autoplayVideos().forEach(armVideo);

  // IntersectionObserver: play when the video enters the viewport
  if ('IntersectionObserver' in window) {
    const visObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { tryPlay(e.target); } });
    }, { threshold: 0.01 });
    autoplayVideos().forEach(v => visObs.observe(v));
  }

  // On first user gesture, unlock any video still blocked by autoplay policy
  const unlock = () => {
    autoplayVideos().forEach(v => { v.muted = true; tryPlay(v); });
  };
  document.addEventListener('click',      unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true, passive: true });
  document.addEventListener('keydown',    unlock, { once: true });
})();

/* ── MARQUEE ── */
(function () {
  const items = [
    'Blue Economy', 'EU NGO', 'Do-Tank', 'Shipping & Logistics',
    'Blue Policy', 'Defense & Security', 'Offshore Energy',
    'Project Catalysis', 'Expert Network', 'Brussels', 'Maritime Affairs'
  ];
  const html = items
    .map(t => `<span class="m-item">${t}<span class="m-dot"></span></span>`)
    .join('');
  const mq = document.getElementById('mq');
  if (mq) mq.innerHTML = html + html; // duplicate for seamless loop
})();

/* ── LOADER ── */
const lFill = document.getElementById('l-fill');
const lPct  = document.getElementById('l-pct');
const ldr   = document.getElementById('loader');
let lv = 0;

if (ldr && lFill && lPct) {
  const lInt = setInterval(() => {
    lv += Math.random() * 30 + 8;   // faster fill
    if (lv >= 100) {
      lv = 100;
      clearInterval(lInt);
      setTimeout(openLoader, 200);   // shorter pause at 100%
    }
    lFill.style.width = lv + '%';
    lPct.textContent = Math.floor(lv) + '%';
  }, 60);                            // faster tick
} else {
  setTimeout(revealPage, 0);
}

function openLoader() {
  if (!ldr) { revealPage(); return; }
  ldr.querySelectorAll('.l-half').forEach(h =>
    h.classList.add(h.classList.contains('l-top') ? 'exit-top' : 'exit-bot')
  );
  setTimeout(() => {
    ldr.style.display = 'none';
    revealPage();
  }, 700);  // shorter exit animation
}

/* ── SCROLL-DRIVEN VIDEO (generalized) ──
   Support multiple scroll-driven video sections via initScrollVideo({...}).
   Each instance manages its own state (duration, target/current scrub, RAF).
*/

const scrollVideoInstances = [];

function initScrollVideo({ wrap, video, skip, ring, prefersReducedMotion = false }) {
  if (!wrap || !video || prefersReducedMotion || LITE) {
    if (wrap) wrap.remove();
    return null;
  }

  const SV_RING_C_LOCAL = 125.66; // circumference for r=20
  let duration = 0, target = 0, current = 0, raf = null, done = false;

  // ensure buffering starts only when we're ready
  wrap.style.display = 'block';
  video.preload = 'auto';
  try { video.load(); } catch (_) {}
  video.pause();
  const setDuration = () => { duration = video.duration || 0; };
  if (video.readyState >= 1) setDuration();
  video.addEventListener('loadedmetadata', setDuration, { once: true });

  function progress() {
    const total = wrap.offsetHeight - window.innerHeight;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (window.scrollY - wrap.offsetTop) / total));
  }

  function loop() {
    current += (target - current) * 0.18;
    if (video && duration && !isNaN(video.duration)) {
      try { video.currentTime = current * duration; } catch (_) {}
    }
    if (Math.abs(target - current) > .0008) raf = requestAnimationFrame(loop);
    else raf = null;
  }

  function onScroll() {
    if (done) return;
    const p = progress();
    target = p;
    wrap.classList.toggle('scrolled', p > .02);
    wrap.classList.toggle('ending', p > .92);
    if (ring) ring.style.strokeDashoffset = (SV_RING_C_LOCAL * (1 - p)).toFixed(2);
    if (!raf) raf = requestAnimationFrame(loop);
    if (p >= 1) { done = true; finish(); }
  }

  function finish() {
    if (done) return;
    done = true;
    const top = wrap.offsetTop + wrap.offsetHeight - window.innerHeight;
    window.scrollTo({ top, behavior: 'smooth' });
    // conservative: ensure hero enters when any intro finishes
    startHero();
  }

  if (skip) skip.addEventListener('click', finish);

  // initial sync
  onScroll();

  const inst = { wrap, video, skip, ring, onScroll };
  scrollVideoInstances.push(inst);
  return inst;
}

function svOnScrollAll() { scrollVideoInstances.forEach(i => i.onScroll()); }

// Initialize the existing intro instance if present
const _svWrap = document.getElementById('scrollvid');
const _svVideo = document.getElementById('svVideo');
const _svSkip = document.getElementById('svskip');
const _svRing = document.getElementById('svRing');
const _svReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const svInstance = initScrollVideo({ wrap: _svWrap, video: _svVideo, skip: _svSkip, ring: _svRing, prefersReducedMotion: _svReduceMotion });

// Initialize any other .scrollvid sections on the page (e.g. a second moment)
document.querySelectorAll('.scrollvid').forEach(el => {
  const v = el.querySelector('video');
  if (!v) return;
  if (v.id === 'svVideo') return; // skip the already-initialized intro
  const ring = el.querySelector('.ring-fill') || el.querySelector('#svRing2');
  const skip = el.querySelector('button');
  initScrollVideo({ wrap: el, video: v, skip, ring, prefersReducedMotion: _svReduceMotion });
});

/* ── HERO ENTRANCE ── */
// Pause word animations until after loader
document.querySelectorAll('.mega-title .word').forEach(w =>
  w.style.animationPlayState = 'paused'
);
const navEl = document.getElementById('nav');
if (navEl) {
  navEl.style.opacity    = '0';
  navEl.style.transition = 'opacity .6s, height .4s var(--ease), background .4s, border-color .4s';
}

function startHero() {
  if (navEl) navEl.style.opacity = '1';

  // Kick any pill videos that were blocked while nav was opacity:0
  if (!LITE) document.querySelectorAll('.ocean-pill-video').forEach(v => {
    v.muted = true;
    try { v.currentTime = 0; } catch (_) {}
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  });

  const coords = document.getElementById('coords');
  if (coords) coords.classList.add('show');

  setTimeout(() => {
    const hmark = document.getElementById('hmark');
    if (hmark) hmark.classList.add('show');
  }, 100);

  document.querySelectorAll('.mega-title .word').forEach((w, i) => {
    setTimeout(() => { w.style.animationPlayState = 'running'; }, i * 180 + 200);
  });

  setTimeout(() => { document.getElementById('hsub')?.classList.add('show'); }, 950);
  setTimeout(() => { document.getElementById('hact')?.classList.add('show'); }, 1150);
  setTimeout(() => { document.getElementById('hstats')?.classList.add('show'); }, 1350);
}

/* ── CUSTOM COMPASS CURSOR ── */
const cursorEl = document.getElementById('compass-cursor');
const dotEl    = document.getElementById('cursor-dot');

if (cursorEl && dotEl && window.matchMedia('(pointer: fine)').matches) {
  // Only now is it safe to hide the native pointer (see body.cursor-on in CSS)
  document.body.classList.add('cursor-on');
  const needle = cursorEl.querySelector('.needle');
  let mx = 0, my = 0, cx = 0, cy = 0, angle = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!document.body.classList.contains('cursor-live')) {
      cx = mx; cy = my; // snap into place, then reveal
      document.body.classList.add('cursor-live');
    }
  });

  (function tick() {
    cx += (mx - cx) * .12;
    cy += (my - cy) * .12;
    const dx = mx - cx, dy = my - cy;
    if (Math.abs(dx) + Math.abs(dy) > .5) {
      angle = Math.atan2(dx, dy) * (180 / Math.PI);
    }
    cursorEl.style.left = cx + 'px';
    cursorEl.style.top  = cy + 'px';
    dotEl.style.left    = mx + 'px';
    dotEl.style.top     = my + 'px';
    needle.style.transform = `rotate(${angle}deg)`;
    requestAnimationFrame(tick);
  })();

  document.querySelectorAll('a, button').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('hovering'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('hovering'));
  });
} else {
  cursorEl?.remove();
  dotEl?.remove();
}

/* ── PROGRESS BAR ── */
const pbar = document.getElementById('bar');

window.addEventListener('scroll', () => {
  const h = document.documentElement;
  if (pbar) pbar.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight)})`;
  svOnScrollAll();
  onScroll();
}, { passive: true });

/* ── SCROLL HANDLER ── */
function onScroll() {
  const sy = window.scrollY;

  // Nav state
  navEl?.classList.toggle('dark', sy > 60);

  // Hero video parallax
  const hvid = document.getElementById('hvid');
  if (hvid) hvid.style.transform = `translateY(${sy * .35}px) scale(1.06)`;

  doUnitsScroll(sy);
  revealCheck(sy);
  updateCoords(sy);

  // The HUD lives in the same corner as the footer links — yield to them
  const coordsEl = document.getElementById('coords');
  const footerEl = document.querySelector('footer');
  if (coordsEl && footerEl && coordsEl.classList.contains('show')) {
    const footerVisible = footerEl.getBoundingClientRect().top < window.innerHeight - 80;
    coordsEl.style.opacity = footerVisible ? '0' : '';
  }
}

/* ── HORIZONTAL UNITS SCROLL ── */
function doUnitsScroll(sy) {
  const outer = document.getElementById('units');
  if (!outer) return;
  const oTop = outer.offsetTop;
  const oH   = outer.offsetHeight - window.innerHeight;
  const prog = Math.max(0, Math.min(1, (sy - oTop) / oH));
  const cards = document.getElementById('ucards');
  if (!cards) return;
  const maxX = cards.scrollWidth - window.innerWidth + (window.innerWidth * .1);
  cards.style.transform = `translateX(${-maxX * prog}px)`;
  const ufill = document.getElementById('ufill');
  if (ufill) ufill.style.width = (prog * 100) + '%';
}

/* ── SCROLL REVEAL ── */
const revEls = [...document.querySelectorAll('[data-r]')];

function revealCheck(sy) {
  const vpH = window.innerHeight;
  revEls.forEach(el => {
    if (el.classList.contains('on')) return;
    const top = el.getBoundingClientRect().top + sy;
    if (sy + vpH * .82 >= top) {
      const delay = parseInt(el.dataset.rd || 0);
      setTimeout(() => el.classList.add('on'), delay);
    }
  });
}
revealCheck(window.scrollY);

/* ── COUNTER ANIMATION ── */
const cObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el  = e.target;
    const end = parseFloat(el.dataset.count);
    const sfx = el.dataset.suffix || '';
    if (!end) return;
    const dur = 1800, s = performance.now();
    const step = n => {
      const t    = Math.min((n - s) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.floor(ease * end).toLocaleString() + sfx;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = end.toLocaleString() + sfx;
    };
    requestAnimationFrame(step);
    cObs.unobserve(el);
  });
}, { threshold: .5 });
document.querySelectorAll('[data-count]').forEach(el => cObs.observe(el));

/* ── WORD-BY-WORD H2 REVEAL ── */
const h2Obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    el.innerHTML = el.innerHTML.replace(
      /(<em>[\s\S]*?<\/em>|<br\s*\/?>|[\w''%+\u00C0-\u024F&;]+)/g,
      match => {
        if (match.match(/^<br/)) return match;
        return `<span style="display:inline-block;opacity:0;transform:translateY(16px);transition:opacity .55s var(--ease),transform .55s var(--ease)">${match}</span>`;
      }
    );
    let i = 0;
    el.querySelectorAll('span').forEach(s => {
      setTimeout(() => { s.style.opacity = '1'; s.style.transform = 'none'; }, 70 + i * 60);
      i++;
    });
    h2Obs.unobserve(el);
  });
}, { threshold: .35 });
document.querySelectorAll('.h2').forEach(el => h2Obs.observe(el));

/* ── 3D TILT ON CARDS ── */
document.querySelectorAll('.mission-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - .5;
    const y = (e.clientY - r.top)  / r.height - .5;
    card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-8px)`;
  });
  card.addEventListener('mouseleave', () => card.style.transform = '');
});

/* ── CURSOR GLOW ON UNIT CARDS ── */
document.querySelectorAll('.u-card').forEach(card => {
  const g = card.querySelector('.u-glow');
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    g.style.left = (e.clientX - r.left) + 'px';
    g.style.top  = (e.clientY - r.top)  + 'px';
  });
});

/* ── CTA RADIAL GLOW ── */
document.querySelectorAll('.cta-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--cx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--cy', (e.clientY - r.top)  + 'px');
  });
});

/* ── MAGNETIC BUTTONS ── */
document.querySelectorAll('.btn, .nav-btn').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const r  = btn.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width  / 2) * .25;
    const dy = (e.clientY - r.top  - r.height / 2) * .25;
    btn.style.transform = `translate(${dx}px,${dy}px)`;
    btn.style.setProperty('--bx', (e.clientX - r.left) + 'px');
    btn.style.setProperty('--by', (e.clientY - r.top)  + 'px');
  });
  btn.addEventListener('mouseleave', () => btn.style.transform = '');
});

/* ── COORDINATE HUD ── */
const coordList = [
  { lat: '48°51′N', lon: '002°21′E', loc: 'Brussels'   },
  { lat: '37°59′N', lon: '023°44′E', loc: 'Athens'     },
  { lat: '41°54′N', lon: '012°27′E', loc: 'Rome'       },
  { lat: '55°40′N', lon: '012°34′E', loc: 'Copenhagen' },
  { lat: '43°18′N', lon: '005°22′E', loc: 'Marseille'  },
];
let lastCoordIdx = -1;

function updateCoords(sy) {
  const total = document.body.scrollHeight - window.innerHeight;
  const idx   = Math.floor((sy / total) * coordList.length) % coordList.length;
  if (idx === lastCoordIdx) return;
  lastCoordIdx = idx;

  const latEl = document.getElementById('coord-lat');
  const lonEl = document.getElementById('coord-lon');
  const secEl = document.getElementById('coord-sec');
  if (!latEl) return;

  [latEl, lonEl, secEl].forEach(el => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(4px)';
  });
  setTimeout(() => {
    const co = coordList[idx];
    latEl.textContent = co.lat;
    lonEl.textContent = co.lon;
    secEl.textContent = '— ' + co.loc;
    [latEl, lonEl, secEl].forEach(el => {
      el.style.transition = 'all .4s var(--ease)';
      el.style.opacity    = '';
      el.style.transform  = '';
    });
  }, 200);
}

/* ── SMOOTH ANCHOR SCROLL ── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

/* ── MOBILE DRAWER MENU ── */
(function () {
  const toggle = document.getElementById('menu-toggle');
  const drawer = document.getElementById('drawer');
  if (!toggle || !drawer) return;

  let open = false;

  function setOpen(next) {
    open = next;
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    drawer.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      const first = drawer.querySelector('a');
      if (first) setTimeout(() => first.focus(), 400);
    } else {
      toggle.focus();
    }
  }

  toggle.addEventListener('click', () => setOpen(!open));
  drawer.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => setOpen(false))
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) setOpen(false);
  });
})();
