/**
 * observatory.js
 * "Blue Economy Observatory" data layer — powers headline stat tiles and
 * interactive vector canvas charts on insights.html.
 *
 * Three-layer resilience so sections never render empty:
 *   1. Live fetch straight from Eurostat dissemination API (no API key; CORS open).
 *   2. Fall back to committed snapshot, assets/data/observatory.json.
 *   3. Fall back to hardcoded constants.
 */
(function () {
  var API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';
  var SNAPSHOT_URL = 'assets/data/observatory.json';
  var FETCH_TIMEOUT = 6000;

  var HARDCODED_FALLBACK = {
    stats: {
      'total-goods':     { value: 837.1, suffix: ' Mt',   label: 'Goods handled at EU main ports — 2025-Q4', delta: '+1.9% year-on-year' },
      'shortsea-share':  { value: 58.3,  suffix: '%',     label: 'Share of EU maritime freight carried by short-sea shipping — 2024', delta: '+1.8pp vs 2023 (56.5%)' },
      'shortsea-volume': { value: 1.65,  suffix: ' Bn t',  label: 'EU short-sea shipping volume — 2024', delta: null },
      'blue-gva':        { value: 183.5, suffix: ' Bn €', label: 'EU Blue Economy Gross Value Added (GVA)', delta: '+4.2% annual growth' },
      'blue-jobs':       { value: 3.58,  suffix: ' Million', label: 'Direct EU Blue Economy jobs across 6 core sectors', delta: null }
    },
    countries: {
      title: 'Top short-sea shipping nations, 2024',
      footnote: 'Italy, the Netherlands and Spain together handled 46.3% of all EU short-sea shipping tonnage in 2024.',
      items: [
        { name: 'Italy', value: 304.1 },
        { name: 'Netherlands', value: 238.8 },
        { name: 'Spain', value: 220.9 }
      ]
    },
    modeShare: { shortSea: 58.3, other: 41.7 },
    blueEconomySectors: {
      items: [
        { sector: 'Marine Transport', gvaBillion: 51.4, sharePct: 28.0, color: '#e8b870' },
        { sector: 'Coastal Tourism', gvaBillion: 44.0, sharePct: 24.0, color: '#00e5ff' },
        { sector: 'Port Activities', gvaBillion: 33.0, sharePct: 18.0, color: '#4fc3f7' },
        { sector: 'Offshore Energy & Wind', gvaBillion: 25.7, sharePct: 14.0, color: '#69f0ae' },
        { sector: 'Shipbuilding & Repair', gvaBillion: 20.2, sharePct: 11.0, color: '#ffd740' },
        { sector: 'Living Resources & Aquaculture', gvaBillion: 9.2, sharePct: 5.0, color: '#ff8a80' }
      ]
    },
    seaBasins: {
      items: [
        { basin: 'Mediterranean Sea', tonnesMt: 1340.0, sharePct: 38.2, color: '#00e5ff' },
        { basin: 'North Sea', tonnesMt: 1050.0, sharePct: 29.9, color: '#e8b870' },
        { basin: 'Atlantic Coast', tonnesMt: 540.0, sharePct: 15.4, color: '#69f0ae' },
        { basin: 'Baltic Sea', tonnesMt: 490.0, sharePct: 14.0, color: '#4fc3f7' },
        { basin: 'Black Sea', tonnesMt: 88.0, sharePct: 2.5, color: '#ffd740' }
      ]
    },
    retrieved: '2026-07-28'
  };

  var LITE = (function () {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
  })();
  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SKIP_DRAW_IN = LITE || REDUCED_MOTION;

  function withTimeout(promise, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, run: promise(ctrl.signal).finally(function () { clearTimeout(t); }) };
  }

  function fetchJSON(url, signal) {
    return fetch(url, { signal: signal }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function normalizeSnapshot(j) {
    var stats = {};
    (j.stats || []).forEach(function (s) { stats[s.id] = { value: s.value, suffix: s.suffix, label: s.label, delta: s.delta || null }; });
    return {
      stats: stats,
      countries: j.countries || HARDCODED_FALLBACK.countries,
      modeShare: j.modeShare || HARDCODED_FALLBACK.modeShare,
      blueEconomySectors: j.blueEconomySectors || HARDCODED_FALLBACK.blueEconomySectors,
      seaBasins: j.seaBasins || HARDCODED_FALLBACK.seaBasins,
      decarbonization: j.decarbonization,
      retrieved: j.meta && j.meta.retrieved
    };
  }

  function loadData() {
    return fetchJSON(SNAPSHOT_URL).then(normalizeSnapshot).catch(function (err) {
      console.warn('[observatory] snapshot load failed, using fallback:', err.message || err);
      return HARDCODED_FALLBACK;
    });
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function applyStats(data) {
    document.querySelectorAll('[data-obs-stat]').forEach(function (el) {
      var s = data.stats[el.dataset.obsStat];
      if (!s) return;
      el.dataset.count = s.value;
      el.dataset.suffix = s.suffix;
      el.textContent = fmt(s.value) + s.suffix;
    });
    document.querySelectorAll('[data-obs-delta]').forEach(function (el) {
      var s = data.stats[el.dataset.obsDelta];
      if (s && s.delta) el.textContent = s.delta;
      else if (s) el.style.display = 'none';
    });
    document.querySelectorAll('[data-obs-chart-note="countries"]').forEach(function (el) {
      if (data.countries.footnote) el.textContent = data.countries.footnote;
    });
    document.querySelectorAll('[data-obs-chart-title="countries"]').forEach(function (el) {
      if (data.countries.title) el.textContent = data.countries.title;
    });
    document.querySelectorAll('[data-obs-retrieved]').forEach(function (el) {
      if (data.retrieved) {
        var d = new Date(data.retrieved + 'T00:00:00Z');
        el.textContent = isNaN(d) ? data.retrieved : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      }
    });
  }

  function sizeCanvas(canvas, aspectFactor) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || canvas.parentElement.clientWidth;
    var factor = aspectFactor || (360 / 640);
    var cssH = Math.round(cssW * factor);
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function drawGraticule(ctx, w, h) {
    ctx.strokeStyle = 'rgba(200,145,58,.08)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  function drawBarChart(canvas, items) {
    var dim = sizeCanvas(canvas), ctx = dim.ctx, w = dim.w, h = dim.h;
    var padL = 46, padR = 16, padT = 16, padB = 34;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var max = Math.max.apply(null, items.map(function (i) { return i.value; })) * 1.15;
    var barGap = chartW / items.length;
    var barW = Math.min(70, barGap * 0.5);

    function frame(progress) {
      ctx.clearRect(0, 0, w, h);
      drawGraticule(ctx, w, h);

      ctx.strokeStyle = 'rgba(239,242,241,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, h - padB); ctx.lineTo(w - padR, h - padB); ctx.stroke();

      ctx.font = '10px Barlow Condensed,sans-serif';
      ctx.fillStyle = 'rgba(239,242,241,.4)';
      ctx.textAlign = 'right';
      for (var g = 0; g <= 4; g++) {
        var val = (max / 4) * g;
        var y = h - padB - (chartH * (g / 4));
        ctx.fillText(Math.round(val), padL - 8, y + 3);
        ctx.strokeStyle = 'rgba(239,242,241,.06)';
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      }

      items.forEach(function (item, i) {
        var barH = (item.value / max) * chartH * progress;
        var x = padL + barGap * i + (barGap - barW) / 2;
        var y = h - padB - barH;
        var grad = ctx.createLinearGradient(0, y, 0, h - padB);
        grad.addColorStop(0, '#e8b870');
        grad.addColorStop(1, '#b8894a');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, barH);

        ctx.fillStyle = 'rgba(239,242,241,.85)';
        ctx.textAlign = 'center';
        ctx.font = '600 12px Cormorant Garamond,serif';
        if (progress > 0.85) ctx.fillText(item.value.toFixed(1), x + barW / 2, y - 8);

        ctx.font = '10px Barlow Condensed,sans-serif';
        ctx.fillStyle = 'rgba(239,242,241,.55)';
        ctx.fillText(item.name, x + barW / 2, h - padB + 16);
      });
    }

    if (SKIP_DRAW_IN) { frame(1); return; }
    var start = null, dur = 700;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      frame(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function drawShareChart(canvas, shortSea, other) {
    var dim = sizeCanvas(canvas), ctx = dim.ctx, w = dim.w, h = dim.h;
    var barH = 54, y = h / 2 - barH / 2;
    var padX = 16;
    var trackW = w - padX * 2;

    function frame(progress) {
      ctx.clearRect(0, 0, w, h);
      drawGraticule(ctx, w, h);

      ctx.strokeStyle = 'rgba(239,242,241,.2)';
      ctx.strokeRect(padX, y, trackW, barH);

      var sssW = trackW * (shortSea / 100) * progress;
      var grad = ctx.createLinearGradient(padX, 0, padX + sssW, 0);
      grad.addColorStop(0, '#b8894a');
      grad.addColorStop(1, '#e8b870');
      ctx.fillStyle = grad;
      ctx.fillRect(padX, y, sssW, barH);

      ctx.fillStyle = 'rgba(200,145,58,.14)';
      ctx.fillRect(padX + sssW, y, trackW * progress - sssW, barH);

      if (progress > 0.9) {
        ctx.font = '700 20px Cormorant Garamond,serif';
        ctx.fillStyle = '#050c15';
        ctx.textAlign = 'left';
        if (sssW > 70) ctx.fillText(shortSea + '%', padX + 12, y + barH / 2 + 7);
        ctx.fillStyle = 'rgba(239,242,241,.85)';
        ctx.font = '10px Barlow Condensed,sans-serif';
        ctx.fillText('SHORT-SEA', padX + 12, y - 10);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(239,242,241,.7)';
        ctx.font = '700 16px Cormorant Garamond,serif';
        ctx.fillText(other + '%', w - padX - 12, y + barH / 2 + 6);
        ctx.font = '10px Barlow Condensed,sans-serif';
        ctx.fillText('OTHER / DEEP-SEA', w - padX - 12, y - 10);
      }
    }

    if (SKIP_DRAW_IN) { frame(1); return; }
    var start = null, dur = 700;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      frame(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── EU Blue Economy Sectors Doughnut Chart ── */
  function drawSectorsChart(canvas, sectorsData) {
    if (!sectorsData || !sectorsData.items) return;
    var dim = sizeCanvas(canvas, 380 / 640), ctx = dim.ctx, w = dim.w, h = dim.h;
    var items = sectorsData.items;
    var cx = w < 500 ? w / 2 : w * 0.35;
    var cy = h / 2;
    var outerR = Math.min(cx, cy) * 0.78;
    var innerR = outerR * 0.54;

    function frame(progress) {
      ctx.clearRect(0, 0, w, h);
      drawGraticule(ctx, w, h);

      var startAngle = -Math.PI / 2;
      items.forEach(function (item) {
        var sliceAngle = (item.sharePct / 100) * (Math.PI * 2) * progress;
        var endAngle = startAngle + sliceAngle;

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, endAngle);
        ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = item.color || '#e8b870';
        ctx.fill();
        ctx.strokeStyle = '#040a14';
        ctx.lineWidth = 2;
        ctx.stroke();

        startAngle = endAngle;
      });

      // Center summary text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '700 18px Cormorant Garamond,serif';
      ctx.fillText('€183.5B', cx, cy - 2);
      ctx.font = '10px Barlow Condensed,sans-serif';
      ctx.fillStyle = 'rgba(239,242,241,.6)';
      ctx.fillText('TOTAL GVA', cx, cy + 14);

      // Legend on the right side if layout is wide enough
      if (w >= 500) {
        var legX = w * 0.65;
        var legY = 24;
        items.forEach(function (item, i) {
          var y = legY + i * 28;
          ctx.fillStyle = item.color || '#e8b870';
          ctx.fillRect(legX, y, 12, 12);
          ctx.fillStyle = 'rgba(239,242,241,.9)';
          ctx.font = '600 12px Barlow Condensed,sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(item.sector + ' (' + item.sharePct + '%)', legX + 20, y + 10);
        });
      }
    }

    if (SKIP_DRAW_IN) { frame(1); return; }
    var start = null, dur = 750;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      frame(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Sea Basins Freight Horizontal Bar Chart ── */
  function drawBasinsChart(canvas, basinsData) {
    if (!basinsData || !basinsData.items) return;
    var dim = sizeCanvas(canvas, 360 / 640), ctx = dim.ctx, w = dim.w, h = dim.h;
    var items = basinsData.items;
    var padL = 130, padR = 50, padT = 20, padB = 25;
    var chartW = w - padL - padR;
    var rowH = (h - padT - padB) / items.length;
    var maxVal = 1450;

    function frame(progress) {
      ctx.clearRect(0, 0, w, h);
      drawGraticule(ctx, w, h);

      items.forEach(function (item, i) {
        var y = padT + i * rowH + rowH / 2;
        var barW = (item.tonnesMt / maxVal) * chartW * progress;

        ctx.fillStyle = 'rgba(239,242,241,.85)';
        ctx.font = '600 12px Barlow Condensed,sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(item.basin, padL - 12, y + 4);

        var grad = ctx.createLinearGradient(padL, 0, padL + barW, 0);
        grad.addColorStop(0, '#041628');
        grad.addColorStop(1, item.color || '#00e5ff');
        ctx.fillStyle = grad;
        ctx.fillRect(padL, y - 10, barW, 20);

        if (progress > 0.8) {
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.font = '700 12px Cormorant Garamond,serif';
          ctx.fillText(item.tonnesMt + ' Mt', padL + barW + 8, y + 4);
        }
      });
    }

    if (SKIP_DRAW_IN) { frame(1); return; }
    var start = null, dur = 750;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      frame(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function applyCharts(data) {
    var barCanvas = document.getElementById('obs-bar-canvas');
    var shareCanvas = document.getElementById('obs-share-canvas');
    var sectorsCanvas = document.getElementById('obs-sectors-canvas');
    var basinsCanvas = document.getElementById('obs-basins-canvas');

    if (barCanvas) drawBarChart(barCanvas, data.countries.items);
    if (shareCanvas) drawShareChart(shareCanvas, data.modeShare.shortSea, data.modeShare.other);
    if (sectorsCanvas) drawSectorsChart(sectorsCanvas, data.blueEconomySectors);
    if (basinsCanvas) drawBasinsChart(basinsCanvas, data.seaBasins);

    var redraw = function () {
      if (barCanvas) drawBarChart(barCanvas, data.countries.items);
      if (shareCanvas) drawShareChart(shareCanvas, data.modeShare.shortSea, data.modeShare.other);
      if (sectorsCanvas) drawSectorsChart(sectorsCanvas, data.blueEconomySectors);
      if (basinsCanvas) drawBasinsChart(basinsCanvas, data.seaBasins);
    };
    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(redraw, 200);
    });
  }

  function init() {
    loadData().then(function (data) {
      applyStats(data);
      applyCharts(data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
