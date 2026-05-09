/* OCEAN PILL NAV
 * Draws the beach texture once instead of repainting every animation frame.
 * The previous per-pixel RAF loop was expensive enough to freeze slower devices.
 */
(function () {
  const pills = document.querySelectorAll('[data-ocean-pill]');
  if (!pills.length) return;

  function drawPill(pill) {
    const canvas = pill.querySelector('.ocean-pill-canvas');
    if (!canvas) return;

    const rect = pill.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const width = Math.max(120, Math.round(rect.width * dpr));
    const height = Math.max(36, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const image = ctx.createImageData(width, height);
    const data = image.data;
    const shore = width * 0.62;

    for (let y = 0; y < height; y++) {
      const wave = Math.sin(y * 0.08) * width * 0.025;
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        const d = x - shore - wave;
        const grain = ((x * 13 + y * 17) % 19) - 9;
        let r;
        let g;
        let b;

        if (d < -8 * dpr) {
          const deep = Math.min(1, Math.abs(d) / width * 2.1);
          r = 42 - deep * 28 + grain * .25;
          g = 156 - deep * 92 + grain * .3;
          b = 186 - deep * 98 + grain * .25;
        } else if (d < 8 * dpr) {
          const foam = 232 + grain * .4;
          r = foam;
          g = foam + 4;
          b = foam + 8;
        } else {
          const dry = Math.min(1, d / Math.max(1, width - shore));
          r = 178 + dry * 46 + grain * .55;
          g = 148 + dry * 40 + grain * .45;
          b = 102 + dry * 38 + grain * .35;
        }

        data[p] = Math.max(0, Math.min(255, r));
        data[p + 1] = Math.max(0, Math.min(255, g));
        data[p + 2] = Math.max(0, Math.min(255, b));
        data[p + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  let resizeTimer = 0;
  function scheduleDraw() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => pills.forEach(drawPill), 120);
  }

  pills.forEach(drawPill);
  window.addEventListener('resize', scheduleDraw, { passive: true });
})();
