/* ═══════════════════════════════════════════════════════════════
   OCEAN PILL NAV — onde.mp4 video looped inside the nav pill
   Falls back silently if no video element is present.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  // Force-play every pill video as soon as data is available.
  // This runs before main.js and catches the pill on every page.
  function kickPillVideos() {
    document.querySelectorAll('.ocean-pill-video').forEach(v => {
      v.muted = true;
      const go = () => { if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } };
      if (v.readyState >= 2) go();
      else { v.addEventListener('loadeddata', go, { once: true }); v.addEventListener('canplay', go, { once: true }); }
    });
  }
  kickPillVideos();
  // Also retry once the DOM settles
  if (document.readyState !== 'complete') window.addEventListener('load', kickPillVideos, { once: true });

  const pills = document.querySelectorAll('[data-ocean-pill]');
  if (!pills.length) return;

  pills.forEach(pill => {
    const canvas = pill.querySelector('.ocean-pill-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1;

    function fit() {
      const r = pill.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.round(r.width  * dpr);
      H = Math.round(r.height * dpr);
      canvas.width  = W;
      canvas.height = H;
      canvas.style.width  = r.width  + 'px';
      canvas.style.height = r.height + 'px';
    }
    fit();
    new ResizeObserver(() => fit()).observe(pill);

    /* sand grain dots — fixed */
    const grains = Array.from({ length: 70 }, () => ({
      rx: Math.random(),
      ry: Math.random(),
      a:  0.05 + Math.random() * 0.14,
      s:  0.5 + Math.random() * 1.2
    }));

    /* water sparkles */
    const sparkles = Array.from({ length: 18 }, () => ({
      rx: Math.random(),
      ry: Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 1.6,
      size:  0.6 + Math.random() * 1.2
    }));

    const t0 = performance.now();

    /* shoreline runs horizontally near the middle, gently wavy */
    function shoreY(xFrac, t) {
      const baseY = 0.46;
      const wave  = Math.sin(xFrac * 9   + t * 0.55) * 0.038
                  + Math.sin(xFrac * 19  - t * 0.78) * 0.020
                  + Math.sin(xFrac * 33  + t * 1.10) * 0.008;
      return (baseY + wave) * H;
    }

    function draw(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      /* ── 1. WATER (top half) ── */
      const waterG = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      waterG.addColorStop(0,   '#5fc6c4');
      waterG.addColorStop(0.5, '#2d9a9d');
      waterG.addColorStop(1,   '#0e6770');
      ctx.fillStyle = waterG;
      ctx.fillRect(0, 0, W, H);

      /* surface ripples */
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 20; i++) {
        const xFrac = (i / 20 + t * 0.04) % 1;
        const x = xFrac * W;
        const y = H * (0.05 + (i % 5) * 0.07);
        const len = 28 * dpr + Math.sin(i + t * 0.6) * 12 * dpr;
        ctx.strokeStyle = `rgba(200,240,240,${0.05 + Math.sin(i * 1.7 + t) * 0.04})`;
        ctx.lineWidth = 0.7 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + len, y + Math.sin(t * 0.7 + i) * 0.3);
        ctx.stroke();
      }

      /* sparkles */
      sparkles.forEach(s => {
        const x = ((s.rx + Math.sin(t * 0.05 + s.phase) * 0.04) * W);
        const y = (s.ry * 0.42 + 0.04) * H;
        const a = Math.max(0, 0.4 + Math.sin(t * s.speed + s.phase) * 0.5);
        const r = s.size * dpr * (1 + Math.sin(t * 2 + s.phase) * 0.3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.4, `rgba(180,240,240,${a * 0.5})`);
        g.addColorStop(1, 'rgba(180,240,240,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      /* ── 2. SAND (bottom half) clipped below shoreline ── */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        ctx.lineTo(x, shoreY(x / W, t));
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.clip();

      const sandG = ctx.createLinearGradient(0, H * 0.4, 0, H);
      sandG.addColorStop(0,    '#f5d8b9');
      sandG.addColorStop(0.45, '#ecc69e');
      sandG.addColorStop(1,    '#c89970');
      ctx.fillStyle = sandG;
      ctx.fillRect(0, 0, W, H);

      /* sand grains */
      grains.forEach(g => {
        ctx.fillStyle = `rgba(120,75,40,${g.a})`;
        ctx.beginPath();
        ctx.arc(g.rx * W, H * 0.5 + g.ry * H * 0.5, g.s * dpr, 0, Math.PI * 2);
        ctx.fill();
      });

      /* wet sand band immediately below the shoreline */
      for (let x = 0; x <= W; x += 4) {
        const sy = shoreY(x / W, t);
        const grad = ctx.createLinearGradient(x, sy, x, sy + 22 * dpr);
        grad.addColorStop(0, 'rgba(95,60,35,0.45)');
        grad.addColorStop(1, 'rgba(120,80,55,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, sy, 4, 22 * dpr);
      }
      ctx.restore();

      /* ── 3. FOAM at the shore (horizontal wave) ── */
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      // outer translucent fringe extending into the water
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 14 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = shoreY(x / W, t) - 3 * dpr;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // foam wash over wet sand
      ctx.strokeStyle = 'rgba(255,250,245,0.55)';
      ctx.lineWidth = 8 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = shoreY(x / W, t) + 1 * dpr
                + Math.sin(x * 0.05 + t * 1.4) * 0.8 * dpr;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // bright crest
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const y = shoreY(x / W, t)
                + Math.sin(x * 0.08 + t * 1.8) * 0.6 * dpr;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // foam bubbles
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = 0; x < W; x += 8 * dpr) {
        const sy = shoreY(x / W, t);
        const off = Math.sin(x * 0.04 + t * 1.1) * 4 * dpr;
        const r = (0.5 + Math.sin(x * 0.1 + t * 2) * 0.4) * dpr;
        ctx.beginPath();
        ctx.arc(x, sy + off, Math.max(0.3, r), 0, Math.PI * 2);
        ctx.fill();
      }

      /* ── 4. edge fade vignettes ── */
      const eL = ctx.createLinearGradient(0, 0, W * 0.10, 0);
      eL.addColorStop(0, 'rgba(2,10,18,0.55)');
      eL.addColorStop(1, 'rgba(2,10,18,0)');
      ctx.fillStyle = eL; ctx.fillRect(0, 0, W * 0.10, H);

      const eR = ctx.createLinearGradient(W * 0.90, 0, W, 0);
      eR.addColorStop(0, 'rgba(2,10,18,0)');
      eR.addColorStop(1, 'rgba(2,10,18,0.55)');
      ctx.fillStyle = eR; ctx.fillRect(W * 0.90, 0, W * 0.10, H);

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  });
})();
