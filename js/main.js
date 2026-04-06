/**
 * main.js
 * UI interactions: loader, intro video, custom cursor,
 * scroll behaviour, horizontal units scroll, reveal animations,
 * counters and micro-interactions.
 */

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

const lInt = setInterval(() => {
  lv += Math.random() * 22 + 4;
  if (lv >= 100) {
    lv = 100;
    clearInterval(lInt);
    setTimeout(openLoader, 400);
  }
  lFill.style.width    = lv + '%';
  lPct.textContent     = Math.floor(lv) + '%';
}, 80);

function openLoader() {
  ldr.querySelectorAll('.l-half').forEach(h =>
    h.classList.add(h.classList.contains('l-top') ? 'exit-top' : 'exit-bot')
  );
  setTimeout(() => {
    ldr.style.display = 'none';
    startHero();
  }, 1200);
}

/* ── INTRO VIDEO ── */
const introEl = document.getElementById('intro');
const ivEl    = document.getElementById('iv');
const iskip   = document.getElementById('iskip');

function closeIntro() {
  introEl.classList.add('gone');
  setTimeout(() => introEl.style.display = 'none', 1200);
}

if (ivEl) {
  ivEl.addEventListener('ended', () => setTimeout(closeIntro, 400));
  setTimeout(closeIntro, 6500); // fallback
}
if (iskip) iskip.addEventListener('click', closeIntro);

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

if (cursorEl && dotEl) {
  const needle = cursorEl.querySelector('.needle');
  let mx = 0, my = 0, cx = 0, cy = 0, angle = 0;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

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
}

/* ── PROGRESS BAR ── */
const pbar = document.getElementById('bar');

window.addEventListener('scroll', () => {
  const h = document.documentElement;
  if (pbar) pbar.style.transform = `scaleX(${h.scrollTop / (h.scrollHeight - h.clientHeight)})`;
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
