/**
 * canvas.js
 * Nautical chart overlay rendered on the hero canvas.
 * Draws animated wave paths, a compass rose, depth contours and grid lines.
 */
(function () {
  const c = document.getElementById('chart-canvas');
  if (!c) return;

  const ctx = c.getContext('2d');
  let W, H;

  function resize() {
    W = c.width  = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const frameInterval = 1000 / 30;
  let lastFrame = 0;

  /* ── comets (shooting stars over the sea) ── */
  const comets = [];
  function spawnComet() {
    const fromLeft = Math.random() < 0.5;
    const startY   = H * (0.05 + Math.random() * 0.35);
    const angle    = (15 + Math.random() * 20) * Math.PI / 180; // descending
    const speed    = 7 + Math.random() * 6;
    const vx       = (fromLeft ? 1 : -1) * speed * Math.cos(angle);
    const vy       = speed * Math.sin(angle);
    comets.push({
      x: fromLeft ? -120 : W + 120,
      y: startY,
      vx, vy,
      life: 0,
      maxLife: 110 + Math.random() * 60,
      size: 1.4 + Math.random() * 1.2
    });
  }
  let nextSpawn = 0;

  function draw(now) {
    if (document.hidden) {
      requestAnimationFrame(draw);
      return;
    }
    if (now - lastFrame < frameInterval) {
      requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;

    ctx.clearRect(0, 0, W, H);

    /* ── grid lines (chart graticules) ── */
    ctx.strokeStyle = 'rgba(200,145,58,.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    /* ── depth contour circles ── */
    const cx2 = W * .38, cy2 = H * .6;
    for (let r = 80; r < 500; r += 70) {
      ctx.beginPath();
      ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200,145,58,${.04 - r * .00005})`;
      ctx.lineWidth = .8;
      ctx.stroke();
    }

    /* ── decorative compass rose (top-right) ── */
    const cr = { x: W * .82, y: H * .25, r: 90 };
    for (let i = 0; i < 360; i += 15) {
      const rad = i * Math.PI / 180;
      const len = i % 90 === 0 ? cr.r * .7 : i % 45 === 0 ? cr.r * .5 : cr.r * .3;
      ctx.beginPath();
      ctx.moveTo(cr.x + Math.cos(rad) * 20, cr.y + Math.sin(rad) * 20);
      ctx.lineTo(cr.x + Math.cos(rad) * len, cr.y + Math.sin(rad) * len);
      ctx.strokeStyle = i % 90 === 0 ? 'rgba(200,145,58,.2)' : 'rgba(200,145,58,.08)';
      ctx.lineWidth   = i % 90 === 0 ? 1.2 : .7;
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(200,145,58,.08)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(cr.x, cr.y, cr.r * .15, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(200,145,58,.15)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 11px Barlow Condensed,sans-serif';
    ctx.fillStyle = 'rgba(200,145,58,.3)';
    ctx.textAlign = 'center';
    ctx.fillText('N', cr.x, cr.y - cr.r * .8);

    /* ── animated wave paths ── */
    const t = Date.now() * .001;
    for (let layer = 0; layer < 4; layer++) {
      const yBase = H * (.52 + layer * .06);
      const amp   = 12 + layer * 6;
      const freq  = .005 - layer * .0006;
      const speed = .8 + layer * .4;
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      for (let x = 0; x < W; x += 4) {
        ctx.lineTo(x, yBase + Math.sin(x * freq + t * speed + layer) * amp);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      ctx.fillStyle = `rgba(200,145,58,${.035 - layer * .006})`;
      ctx.fill();
    }

    /* ── comets ── */
    nextSpawn--;
    if (nextSpawn <= 0) {
      spawnComet();
      nextSpawn = 30 + Math.floor(Math.random() * 90); // spawn every 1–4s @30fps
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = comets.length - 1; i >= 0; i--) {
      const cm = comets[i];
      cm.x += cm.vx;
      cm.y += cm.vy;
      cm.life++;
      if (cm.life > cm.maxLife || cm.x < -200 || cm.x > W + 200 || cm.y > H * 0.75) {
        comets.splice(i, 1);
        continue;
      }
      const fade = cm.life < 20
        ? cm.life / 20
        : Math.min(1, (cm.maxLife - cm.life) / 30);
      // tail
      const tailLen = 110;
      const tx = cm.x - cm.vx * (tailLen / 8);
      const ty = cm.y - cm.vy * (tailLen / 8);
      const grad = ctx.createLinearGradient(tx, ty, cm.x, cm.y);
      grad.addColorStop(0,   'rgba(200,145,58,0)');
      grad.addColorStop(0.6, `rgba(232,184,112,${0.35 * fade})`);
      grad.addColorStop(1,   `rgba(255,235,180,${0.95 * fade})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = cm.size * 1.6;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(cm.x, cm.y);
      ctx.stroke();
      // head glow
      const hg = ctx.createRadialGradient(cm.x, cm.y, 0, cm.x, cm.y, cm.size * 14);
      hg.addColorStop(0,   `rgba(255,245,210,${0.95 * fade})`);
      hg.addColorStop(0.3, `rgba(232,184,112,${0.55 * fade})`);
      hg.addColorStop(1,   'rgba(200,145,58,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cm.x, cm.y, cm.size * 14, 0, Math.PI * 2);
      ctx.fill();
      // bright core
      ctx.fillStyle = `rgba(255,250,235,${fade})`;
      ctx.beginPath();
      ctx.arc(cm.x, cm.y, cm.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* ── coordinate tick labels ── */
    ctx.font = '10px Barlow Condensed,sans-serif';
    ctx.fillStyle = 'rgba(200,145,58,.18)';
    ctx.textAlign = 'left';
    for (let i = 0; i < W; i += 160) { ctx.fillText((i / 16).toFixed(0) + '°E', i + 4, H - 8); }
    ctx.textAlign = 'right';
    for (let i = 0; i < H; i += 120) { ctx.fillText((50 - i * .02).toFixed(1) + '°N', W - 4, i + 12); }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
