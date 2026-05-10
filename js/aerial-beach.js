/* ═══════════════════════════════════════════════════════════════
   AERIAL BEACH — top-down tropical beach scene on the hero canvas
   Cream/pink sand, turquoise water, animated foam shoreline.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const c = document.getElementById('aerial-beach');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rw = window.innerWidth;
    const rh = window.innerHeight;
    c.width  = Math.round(rw * dpr);
    c.height = Math.round(rh * dpr);
    c.style.width  = rw + 'px';
    c.style.height = rh + 'px';
    W = c.width; H = c.height;
  }
  resize();
  window.addEventListener('resize', resize);

  /* sand grain dots — fixed for stable texture */
  const grains = Array.from({ length: 240 }, () => ({
    rx: Math.random(),
    ry: Math.random(),
    a:  0.05 + Math.random() * 0.12,
    s:  0.6 + Math.random() * 1.6
  }));

  /* water sparkle particles */
  const sparkles = Array.from({ length: 30 }, () => ({
    rx: Math.random(),
    ry: Math.random(),
    phase: Math.random() * Math.PI * 2,
    speed: 0.6 + Math.random() * 1.6,
    size: 0.8 + Math.random() * 1.6
  }));

  const t0 = performance.now();

  function shoreX(yFrac, t) {
    /* the shoreline runs roughly diagonally from upper-mid to lower-right */
    const baseX = 0.34 + yFrac * 0.18;
    const wave  = Math.sin(yFrac * 8 + t * 0.45) * 0.018
                + Math.sin(yFrac * 17 - t * 0.62) * 0.010
                + Math.sin(yFrac * 31 + t * 0.90) * 0.004;
    return (baseX + wave) * W;
  }

  function draw(now) {
    const t = (now - t0) / 1000;

    /* ── 1. SAND base (left side, warm cream/pink) ── */
    const sandG = ctx.createLinearGradient(0, 0, W * 0.55, H);
    sandG.addColorStop(0,    '#f5d8b9');
    sandG.addColorStop(0.4,  '#ecc69e');
    sandG.addColorStop(0.75, '#d8a679');
    sandG.addColorStop(1,    '#b9885d');
    ctx.fillStyle = sandG;
    ctx.fillRect(0, 0, W, H);

    /* ── 2. sand grain texture ── */
    grains.forEach(g => {
      ctx.fillStyle = `rgba(120,75,40,${g.a})`;
      ctx.beginPath();
      ctx.arc(g.rx * W * 0.55, g.ry * H, g.s * dpr, 0, Math.PI * 2);
      ctx.fill();
    });

    /* ── 3. WATER (right side, turquoise) clipped by shoreline ── */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    for (let y = 0; y <= H; y += 6) {
      const x = shoreX(y / H, t);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.clip();

    const waterG = ctx.createLinearGradient(W * 0.4, 0, W, H);
    waterG.addColorStop(0,   '#5fc6c4');
    waterG.addColorStop(0.4, '#2d9a9d');
    waterG.addColorStop(0.8, '#0f6a73');
    waterG.addColorStop(1,   '#073745');
    ctx.fillStyle = waterG;
    ctx.fillRect(0, 0, W, H);

    /* darker depth patches (deeper water further from shore) */
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 5; i++) {
      const cx = W * (0.62 + i * 0.08);
      const cy = H * (0.2 + (i % 3) * 0.3);
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.18);
      rg.addColorStop(0, 'rgba(20,60,80,0.18)');
      rg.addColorStop(1, 'rgba(20,60,80,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';

    /* surface ripples — fine horizontal streaks, drifting */
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const yFrac = (i / 60 + (t * 0.015)) % 1;
      const y = yFrac * H;
      const ox = W * 0.45 + Math.sin(i * 1.7 + t * 0.4) * W * 0.12;
      const len = 60 * dpr + Math.sin(i + t * 0.6) * 30 * dpr;
      const a = 0.04 + Math.sin(i * 2.3 + t * 0.8) * 0.025;
      ctx.strokeStyle = `rgba(200,240,240,${Math.max(0, a)})`;
      ctx.lineWidth = 0.8 * dpr;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + len, y + Math.sin(t + i) * 0.5);
      ctx.stroke();
    }

    /* sparkles */
    sparkles.forEach(s => {
      const x = (s.rx + Math.sin(t * 0.05 + s.phase) * 0.02) * W * 0.55 + W * 0.45;
      const y = (s.ry + Math.cos(t * 0.04 + s.phase) * 0.02) * H;
      const a = Math.max(0, 0.45 + Math.sin(t * s.speed + s.phase) * 0.5);
      const r = s.size * dpr * (1 + Math.sin(t * 2 + s.phase) * 0.3);
      const sg = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      sg.addColorStop(0, `rgba(255,255,255,${a})`);
      sg.addColorStop(0.4, `rgba(180,240,240,${a * 0.5})`);
      sg.addColorStop(1, 'rgba(180,240,240,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    /* ── 4. WET SAND band (right edge of sand, darker) ── */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let y = 0; y <= H; y += 6) {
      const x = shoreX(y / H, t);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.clip();
    /* radial-like darkening near the shoreline */
    for (let y = 0; y <= H; y += 4) {
      const sx = shoreX(y / H, t);
      const grad = ctx.createLinearGradient(sx - 120 * dpr, y, sx, y);
      grad.addColorStop(0, 'rgba(120,80,55,0)');
      grad.addColorStop(1, 'rgba(95,60,35,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 120 * dpr, y, 120 * dpr, 4);
    }
    ctx.restore();

    /* ── 5. FOAM line at the shore — wide soft fringe ── */
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // outer translucent wash extending into the water
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 70 * dpr;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 4) {
      const x = shoreX(y / H, t) + 14 * dpr;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // foam wash extending into the sand
    ctx.strokeStyle = 'rgba(255,250,245,0.55)';
    ctx.lineWidth = 38 * dpr;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 4) {
      const x = shoreX(y / H, t) - 6 * dpr
              + Math.sin(y * 0.05 + t * 1.3) * 4 * dpr;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // bright white crest
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 14 * dpr;
    ctx.beginPath();
    for (let y = 0; y <= H; y += 3) {
      const x = shoreX(y / H, t) - 2 * dpr
              + Math.sin(y * 0.07 + t * 1.6) * 3 * dpr;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // foam bubbles scattered along the crest
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let y = 0; y < H; y += 14 * dpr) {
      const sx = shoreX(y / H, t);
      const off = Math.sin(y * 0.03 + t * 1.1) * 22 * dpr;
      const r = (1.2 + Math.sin(y * 0.1 + t * 2) * 0.8) * dpr;
      ctx.beginPath();
      ctx.arc(sx + off, y, Math.max(0.5, r), 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
