/* OCEAN PILL NAV — high-resolution top-down sea→beach (per-pixel ImageData) */
(function(){
  const pills = document.querySelectorAll('[data-ocean-pill]');
  if (!pills.length) return;

  pills.forEach(pill => {
    const c = pill.querySelector('.ocean-pill-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    let W = 0, H = 0, image = null, buf = null, dpr = 1;

    function fit(){
      const r = pill.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(80, Math.round(r.width  * dpr));
      H = Math.max(20, Math.round(r.height * dpr));
      c.width  = W;
      c.height = H;
      c.style.width  = r.width + 'px';
      c.style.height = r.height + 'px';
      image = ctx.createImageData(W, H);
      buf = image.data;
      // pre-fill alpha to 255
      for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
    }
    fit();
    new ResizeObserver(fit).observe(pill);
    window.addEventListener('resize', fit);

    function hash(x, y){
      let h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      return h - Math.floor(h);
    }
    function noise(x, y){
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
      const a = hash(xi, yi),     b = hash(xi+1, yi);
      const cc = hash(xi, yi+1),  d = hash(xi+1, yi+1);
      return a*(1-u)*(1-v) + b*u*(1-v) + cc*(1-u)*v + d*u*v;
    }
    function fbm(x, y){
      let v = 0, a = 0.5;
      for (let i = 0; i < 4; i++){ v += noise(x, y) * a; x *= 2.03; y *= 2.03; a *= 0.5; }
      return v;
    }
    // smoothstep
    const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t*t*(3 - 2*t); };

    const start = performance.now();

    function tick(now){
      const t = (now - start) / 1000;

      // shore baseline at ~62% of width; sway slowly
      const baseShore = W * 0.62;
      const swayAmp   = W * 0.045;

      let p = 0;
      for (let y = 0; y < H; y++){
        // shore offset for this row (smooth, not jagged)
        const shore = baseShore
          + Math.sin(y * 0.020 / dpr + t * 0.45) * swayAmp * 0.55
          + Math.sin(y * 0.035 / dpr - t * 0.31) * swayAmp * 0.30
          + (fbm(y * 0.018 / dpr, t * 0.12) - 0.5) * swayAmp * 0.55;

        // foam half-width breathes
        const foamHW = (8 + Math.sin(y * 0.045 / dpr + t * 0.7) * 4) * dpr;

        for (let x = 0; x < W; x++, p += 4){
          let r, g, b;

          // distance from shore (positive = beach side)
          const d = x - shore;

          // SEA  d < -foamHW
          // FOAM -foamHW <= d <= +foamHW*0.5
          // SAND d > foamHW*0.5
          if (d < -foamHW){
            const dist = (-d) / W; // 0..0.6
            const ripple = fbm(x * 0.045 / dpr + t * 0.8, y * 0.045 / dpr) * 0.55
                         + Math.sin((x + y) * 0.06 / dpr + t * 1.4) * 0.05;
            const tDeep = Math.min(1, dist * 1.7);
            // turquoise (45,167,194) → deep (8,36,58)
            r = (1 - tDeep) * 45  + tDeep * 8   + ripple * 36;
            g = (1 - tDeep) * 167 + tDeep * 36  + ripple * 28;
            b = (1 - tDeep) * 194 + tDeep * 58  + ripple * 22;

            // anti-alias edge into foam
            const k = ss(-foamHW - 2, -foamHW + 2, d);
            if (k > 0){
              const churn = fbm(x * 0.14 / dpr + t * 1.6, y * 0.14 / dpr - t * 0.5);
              const fr = 235, fg = 240, fb = 245;
              r = r * (1 - k) + fr * k * (.5 + churn * .8);
              g = g * (1 - k) + fg * k * (.5 + churn * .8);
              b = b * (1 - k) + fb * k * (.5 + churn * .8);
            }
          } else if (d <= foamHW * 0.5){
            // pure foam band
            const churn = fbm(x * 0.14 / dpr + t * 1.6, y * 0.14 / dpr - t * 0.5);
            const k = .55 + churn * .8;
            r = 235 * Math.min(1, k);
            g = 240 * Math.min(1, k);
            b = 245 * Math.min(1, k);
          } else {
            // sand: wet → dry
            const dist = (d - foamHW * 0.5) / Math.max(1, W - shore);
            const grain = (hash(x * 0.6, y * 0.6) - 0.5) * 16;
            r = 184 + dist * 42 + grain;
            g = 152 + dist * 47 + grain;
            b = 104 + dist * 50 + grain;
            // anti-alias edge from foam
            const k = ss(foamHW * 0.5 - 2, foamHW * 0.5 + 2, d);
            if (k < 1){
              const fr = 235, fg = 240, fb = 245;
              r = fr * (1 - k) + r * k;
              g = fg * (1 - k) + g * k;
              b = fb * (1 - k) + b * k;
            }
          }

          // warm gold tint multiply (matches site palette)
          const tintR = 200/255, tintG = 175/255, tintB = 120/255;
          const mix = 0.42; // strength
          r = r * (1 - mix) + r * tintR * mix * 1.55;
          g = g * (1 - mix) + g * tintG * mix * 1.55;
          b = b * (1 - mix) + b * tintB * mix * 1.55;

          // vignette top/bottom
          const vy = y / H;
          const vign = 1 - Math.pow(Math.abs(vy - 0.5) * 2, 2.4) * 0.22;
          r *= vign; g *= vign; b *= vign;

          buf[p]     = r < 0 ? 0 : r > 255 ? 255 : r | 0;
          buf[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
          buf[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
          // alpha already 255
        }
      }

      ctx.putImageData(image, 0, 0);

      // subtle gold glints on the sea (drawn after, soft)
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,225,160,.55)';
      for (let i = 0; i < 6; i++){
        const sx = ((i * 91 * dpr + t * 14 * dpr) % (W * 0.55));
        const sy = (i * 17 * dpr + Math.sin(t * 1.5 + i) * 4 * dpr + H * 0.3) % H;
        const a = 0.4 + Math.sin(t * 3 + i) * 0.4;
        if (a > 0.4){
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
