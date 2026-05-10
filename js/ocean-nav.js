/* ═══════════════════════════════════════════════════════════════
   OCEAN PILL NAV — animated ocean inside the nav pill
   Waves, sailboat, gold light sparkles — runs at 60fps via RAF
   ═══════════════════════════════════════════════════════════════ */
(function () {
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
      W = Math.round(r.width * dpr);
      H = Math.round(r.height * dpr);
      canvas.width = W;
      canvas.height = H;
      canvas.style.width  = r.width  + 'px';
      canvas.style.height = r.height + 'px';
    }
    fit();
    new ResizeObserver(() => fit()).observe(pill);

    /* ── sparkle particles ── */
    const sparks = Array.from({ length: 14 }, (_, i) => ({
      x:     Math.random(),
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.2,
      size:  0.8 + Math.random() * 1.4,
      depth: Math.random()
    }));

    /* ── boat ── */
    const boat = { x: -0.12, speed: 0.014 };

    const start = performance.now();

    function draw(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);

      /* 1 – deep ocean background */
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0,    '#02111e');
      bg.addColorStop(0.35, '#053d5c');
      bg.addColorStop(0.72, '#0a5878');
      bg.addColorStop(1,    '#07283a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      /* 2 – wave layers (back → front) */
      const waveDefs = [
        { yFrac:0.82, amp:0.28, freq:0.0038, spd:0.38, cT:'rgba(5,40,66,0.92)',   cB:'rgba(2,14,22,0.96)',  op:1   },
        { yFrac:0.70, amp:0.22, freq:0.0052, spd:0.55, cT:'rgba(9,68,102,0.78)',  cB:'rgba(3,18,30,0.90)',  op:0.9 },
        { yFrac:0.58, amp:0.18, freq:0.0068, spd:0.74, cT:'rgba(14,96,138,0.65)', cB:'rgba(4,24,40,0.85)',  op:0.8 },
        { yFrac:0.46, amp:0.14, freq:0.0085, spd:0.95, cT:'rgba(20,130,175,0.45)',cB:'rgba(6,30,50,0.7)',   op:0.6 },
      ];

      waveDefs.forEach(w => {
        const yBase = H * w.yFrac;
        const amp   = H * w.amp;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W + 4; x += 3) {
          const y = yBase
            + Math.sin(x * w.freq + t * w.spd) * amp
            + Math.sin(x * w.freq * 1.83 - t * w.spd * 0.63) * amp * 0.38
            + Math.sin(x * w.freq * 2.71 + t * w.spd * 1.10)  * amp * 0.18;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        const wg = ctx.createLinearGradient(0, yBase - amp, 0, H);
        wg.addColorStop(0, w.cT);
        wg.addColorStop(1, w.cB);
        ctx.globalAlpha = w.op;
        ctx.fillStyle = wg;
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      /* 3 – foam crests */
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const phase = i * 1.73 + t * 0.8;
        const x     = ((i * 137.5 * dpr + t * 22 * dpr) % W);
        const yBase = H * 0.46;
        const amp   = H * 0.14;
        const y     = yBase
          + Math.sin(x * 0.0085 + t * 0.95) * amp
          + Math.sin(x * 0.0052 - t * 0.55) * amp * 0.38;
        const alpha = Math.max(0, 0.18 + Math.sin(phase * 1.3) * 0.12);
        ctx.fillStyle = `rgba(190,220,235,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(x, y, (22 + Math.sin(phase) * 6) * dpr, 2.5 * dpr, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      /* 4 – gold sunlight sparkles */
      ctx.globalCompositeOperation = 'lighter';
      sparks.forEach((sp, i) => {
        const x  = ((sp.x * W + t * sp.speed * 18 * dpr) % W);
        const yB = H * (0.28 + sp.depth * 0.22);
        const y  = yB + Math.sin(t * sp.speed + sp.phase) * H * 0.07;
        const a  = Math.max(0, 0.55 + Math.sin(t * sp.speed * 2.4 + sp.phase) * 0.45);
        const sz = sp.size * dpr * (0.7 + Math.sin(t * 3 + i) * 0.3);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, sz * 3.5);
        sg.addColorStop(0,   `rgba(255,230,140,${a})`);
        sg.addColorStop(0.4, `rgba(220,170,60,${a * 0.5})`);
        sg.addColorStop(1,   'rgba(180,120,20,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(x, y, sz * 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      /* 5 – sailboat */
      boat.x += 0.0035 * boat.speed;
      if (boat.x > 1.12) boat.x = -0.12;
      const bx  = boat.x * W;
      const bob = Math.sin(t * 1.8) * 1.8 * dpr;
      const by  = H * 0.41 + bob;
      const sc  = dpr * (H / 48);

      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(sc, sc);

      // hull
      ctx.beginPath();
      ctx.moveTo(-9, 2);
      ctx.bezierCurveTo(-9, 5, 9, 5, 9, 2);
      ctx.lineTo(7, 6);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fillStyle = 'rgba(200,145,58,0.92)';
      ctx.fill();

      // mast
      ctx.strokeStyle = 'rgba(255,245,210,0.80)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(0, -14);
      ctx.stroke();

      // mainsail
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(0, 2);
      ctx.lineTo(-7.5, -1.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,250,235,0.85)';
      ctx.fill();

      // jib
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(0, 1);
      ctx.lineTo(6.5, -2.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(232,184,112,0.75)';
      ctx.fill();

      // wake lines
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.7;
      for (let w = 1; w <= 3; w++) {
        ctx.beginPath();
        ctx.moveTo(-9 - w * 3, 4 + w * 0.5);
        ctx.lineTo(-9 - w * 10, 4 + w * 2);
        ctx.stroke();
      }

      ctx.restore();

      /* 6 – top gloss */
      const gloss = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      gloss.addColorStop(0,   'rgba(255,255,255,0.09)');
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      gloss.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, W, H);

      /* 7 – edge fade */
      const eL = ctx.createLinearGradient(0, 0, W * 0.10, 0);
      eL.addColorStop(0, 'rgba(2,10,18,0.65)');
      eL.addColorStop(1, 'rgba(2,10,18,0)');
      ctx.fillStyle = eL; ctx.fillRect(0, 0, W * 0.10, H);

      const eR = ctx.createLinearGradient(W * 0.90, 0, W, 0);
      eR.addColorStop(0, 'rgba(2,10,18,0)');
      eR.addColorStop(1, 'rgba(2,10,18,0.65)');
      ctx.fillStyle = eR; ctx.fillRect(W * 0.90, 0, W * 0.10, H);

      requestAnimationFrame(draw);
    }

    requestAnimationFrame(draw);
  });
})();
