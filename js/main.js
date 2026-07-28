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

function revealPage() {
  // The hero's title/actions are visible from the start now (the scrub is a
  // background effect layered under always-visible content, not a gate the
  // user has to scroll through first) — see design.md "Layout — the hero
  // stage". So this always fires, unconditionally.
  startHero();
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

  // smoothing: lower factor yields buttery smooth scrolling
  const EASE = 0.08;

  function loop() {
    current += (target - current) * EASE;
    if (video && duration && !isNaN(video.duration)) {
      const desired = current * duration;
      // We directly update currentTime. For optimized GOP=1 (all-keyframe) videos,
      // this bypasses lag-inducing seeking state checks and updates instantly.
      try {
        video.currentTime = desired;
      } catch (_) {}
    }
    if (Math.abs(target - current) > .0005) {
      raf = requestAnimationFrame(loop);
    } else {
      current = target;
      if (video && duration && !isNaN(video.duration)) {
        try { video.currentTime = target * duration; } catch(_) {}
      }
      raf = null;
    }
  }

  function onScroll() {
    const p = progress();
    
    // If the user scrolls back up, reset done so they can scrub backward
    if (p < 0.99) {
      done = false;
    }

    if (done) return;

    target = p;
    wrap.classList.toggle('scrolled', p > .02);
    wrap.classList.toggle('ending', p > .92);
    if (ring) ring.style.strokeDashoffset = (SV_RING_C_LOCAL * (1 - p)).toFixed(2);
    if (!raf) raf = requestAnimationFrame(loop);
    if (p >= 1) {
      finish();
    }
  }

  function finish() {
    const wasDone = done;
    done = true;
    
    target = 1;
    current = 1;
    if (video && duration && !isNaN(duration)) {
      try { video.currentTime = duration; } catch (_) {}
    }
    if (ring) ring.style.strokeDashoffset = 0;

    if (!wasDone) {
      const top = wrap.offsetTop + wrap.offsetHeight - window.innerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
    // Reveal navigation menu and start hero animations
    startHero();
  }

  if (skip) skip.addEventListener('click', finish);

  // initial sync on DOM layout complete
  if (document.readyState === 'complete') {
    onScroll();
  } else {
    window.addEventListener('load', onScroll);
  }

  const inst = { wrap, video, skip, ring, onScroll };
  scrollVideoInstances.push(inst);
  return inst;
}

function svOnScrollAll() { scrollVideoInstances.forEach(i => i.onScroll()); }

/* ── HERO SCROLL-FRAME SEQUENCE ──
   Draws a pre-extracted WebP frame onto a canvas per scroll position instead
   of seeking a <video> — see design.md "Why frames, not video seek". Frame
   set paths/counts come from data-* attributes on the canvas so swapping
   footage (scripts/extract-hero-frames.sh) never requires a JS edit.
*/
function initScrollFrames({ wrap, stage, canvas, ring, reducedMotion = false }) {
  if (!wrap || !stage || !canvas || reducedMotion || LITE) {
    if (canvas) canvas.remove();
    return null;
  }

  const isMobile = window.matchMedia('(max-width: 760px)').matches;
  const basePath = isMobile ? canvas.dataset.framesM : canvas.dataset.frames;
  const count = parseInt(isMobile ? canvas.dataset.countM : canvas.dataset.count, 10) || 0;
  if (!basePath || !count) return null;
  // Frame files are immutable-cached for a year under stable names, so bump
  // data-v on #hero-canvas whenever footage is re-extracted with the same
  // filenames — otherwise returning visitors keep the old cached frames.
  const cacheBust = canvas.dataset.v ? `?v=${canvas.dataset.v}` : '';

  const ctx = canvas.getContext('2d');
  const RING_C = 125.66; // circumference for r=20 — matches the ring markup

  let target = 0, current = 0, raf = null, lastDrawn = -1;
  let cw = 0, ch = 0;

  // Cover-fit draw: scale the frame to fill the canvas box, center-cropping
  // whichever axis overflows — the manual equivalent of object-fit:cover
  // for a <canvas> instead of an <img>/<video>.
  function draw(img) {
    if (!img || !img.complete || !img.naturalWidth || !cw || !ch) return;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  // Preload every frame up front, starting immediately (in parallel with the
  // loader) so most/all frames are already decoded by the time scrolling
  // starts. If the frame currently on screen finishes loading late, redraw
  // it — otherwise a slow frame could get stuck showing whatever came before.
  const images = new Array(count);
  for (let i = 0; i < count; i++) {
    const img = new Image();
    img.decoding = 'async';
    img.src = `${basePath}/frame-${String(i + 1).padStart(3, '0')}.webp${cacheBust}`;
    img.addEventListener('load', () => {
      const idxNow = Math.round(current * (count - 1));
      if (i === idxNow && i !== lastDrawn) { draw(img); lastDrawn = i; }
    }, { once: true });
    images[i] = img;
  }

  function resize() {
    cw = canvas.clientWidth;
    ch = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(images[lastDrawn] || images[0]);
  }

  function progress() {
    const total = wrap.offsetHeight - window.innerHeight;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (window.scrollY - wrap.offsetTop) / total));
  }

  const EASE = 0.09;

  function loop() {
    current += (target - current) * EASE;
    const settled = Math.abs(target - current) < .0008;
    const c = settled ? target : current;
    const idx = Math.round(c * (count - 1));
    if (idx !== lastDrawn) { draw(images[idx]); lastDrawn = idx; }
    if (!settled) { raf = requestAnimationFrame(loop); }
    else { current = target; raf = null; }
  }

  function onScrollFrames() {
    const p = progress();
    target = p;
    stage.classList.toggle('scrolled', p > .02);
    stage.classList.toggle('ending', p > .92);
    if (ring) ring.style.strokeDashoffset = (RING_C * (1 - p)).toFixed(2);
    if (!raf) raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  if (document.readyState === 'complete') {
    onScrollFrames();
  } else {
    window.addEventListener('load', onScrollFrames);
  }

  return { onScroll: onScrollFrames };
}

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

  setTimeout(() => {
    const hmark = document.getElementById('hmark');
    if (hmark) hmark.classList.add('show');
  }, 100);

  setTimeout(() => {
    document.querySelector('.nameplate')?.classList.add('show');
  }, 250);

  document.querySelectorAll('.mega-title .word').forEach((w, i) => {
    setTimeout(() => { w.style.animationPlayState = 'running'; }, i * 180 + 200);
  });

  setTimeout(() => { document.getElementById('hsub')?.classList.add('show'); }, 950);
  setTimeout(() => { document.getElementById('hact')?.classList.add('show'); }, 1150);
  setTimeout(() => { document.getElementById('hstats')?.classList.add('show'); }, 1350);
}

// Initialize the hero's frame-scrub background, if present on this page
const _hfWrap = document.getElementById('hero');
const _hfStage = document.getElementById('heroStage');
const _hfCanvas = document.getElementById('hero-canvas');
const _hfRing = document.getElementById('heroRingFill');
const _reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const heroFrames = initScrollFrames({ wrap: _hfWrap, stage: _hfStage, canvas: _hfCanvas, ring: _hfRing, reducedMotion: _reduceMotion });



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
  heroFrames?.onScroll();
  onScroll();
}, { passive: true });

/* ── SCROLL HANDLER ── */
function onScroll() {
  const sy = window.scrollY;

  // Nav state
  navEl?.classList.toggle('dark', sy > 60);

  doUnitsScroll(sy);
  revealCheck(sy);
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
  const maxX = Math.max(0, cards.scrollWidth - window.innerWidth + (window.innerWidth * .1));
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
    const isFloat = end % 1 !== 0;
    const dec = isFloat ? (String(end).split('.')[1] || '').length : 0;
    const step = n => {
      const t    = Math.min((n - s) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const val  = ease * end;
      el.textContent = isFloat ? val.toFixed(dec) + sfx : Math.floor(val).toLocaleString('en-US') + sfx;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = end.toLocaleString('en-US', { maximumFractionDigits: 2 }) + sfx;
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
