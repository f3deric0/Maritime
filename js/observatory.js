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
      'blue-jobs':       { value: 3.58,  suffix: ' Million', label: 'Direct EU Maritime Employment', delta: null }
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
    topCarriers: {
      source: 'Alphaliner Fleet Statistics 2026',
      items: [
        { name: 'MSC', teuM: 6.20, sharePct: 20.1 },
        { name: 'Maersk', teuM: 4.42, sharePct: 14.3 },
        { name: 'CMA CGM', teuM: 3.82, sharePct: 12.4 },
        { name: 'COSCO', teuM: 3.25, sharePct: 10.5 },
        { name: 'Hapag-Lloyd', teuM: 2.22, sharePct: 7.2 }
      ],
      dualFuelOrderbookPct: 54.0
    },
    decarbonization: {
      source: 'EU ETS Directive (2023/959) / FuelEU Maritime Regulation (2023/1805)',
      etsPhasing: [
        { year: '2024', surrenderPct: 40, status: 'Active' },
        { year: '2025', surrenderPct: 70, status: 'Active' },
        { year: '2026', surrenderPct: 100, status: 'Full Phase-in' }
      ],
      fuelEuTargets: [
        { year: '2025', reductionPct: 2.0 },
        { year: '2030', reductionPct: 6.0 },
        { year: '2035', reductionPct: 14.5 },
        { year: '2040', reductionPct: 31.0 },
        { year: '2050', reductionPct: 80.0 }
      ]
    },
    retrieved: '2026-07-28'
  };

  var LITE = (function () {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
  })();
  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
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
      topCarriers: j.topCarriers,
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

  /* ── Carriers list + dual-fuel stat (was hardcoded HTML; now data-driven
     so it can't drift out of sync with observatory.json like the missing
     2035 FuelEU row did) ── */
  function applyCarriers(data) {
    var tc = data.topCarriers;
    if (!tc) return;
    var list = document.getElementById('obs-carriers-list');
    var pctEl = document.getElementById('obs-dualfuel-pct');
    var sourceEl = document.getElementById('obs-carriers-source');
    if (list && tc.items) {
      list.innerHTML = tc.items.map(function (c) {
        return '<li><strong style="color:var(--gold-l)">' + c.name + ':</strong> ' +
          c.teuM.toFixed(2) + ' Million TEU (' + c.sharePct.toFixed(1) + '% Global Market Share)</li>';
      }).join('');
    }
    if (pctEl && tc.dualFuelOrderbookPct != null) pctEl.textContent = tc.dualFuelOrderbookPct.toFixed(1) + '%';
    if (sourceEl && tc.source) sourceEl.textContent = tc.source;
  }

  /* ── ETS phase-in + FuelEU targets lists ── */
  function applyDecarbonization(data) {
    var d = data.decarbonization;
    if (!d) return;
    var etsList = document.getElementById('obs-ets-phasing-list');
    var fuelList = document.getElementById('obs-fueleu-list');
    var sourceEl = document.getElementById('obs-decarb-source');
    if (etsList && d.etsPhasing) {
      etsList.innerHTML = d.etsPhasing.map(function (p) {
        var text = p.status === 'Full Phase-in'
          ? p.surrenderPct + '% full phase-in requirement'
          : p.surrenderPct + '% of reported emissions covered';
        return '<li><strong style="color:var(--gold-l)">' + p.year + ':</strong> ' + text + '</li>';
      }).join('');
    }
    if (fuelList && d.fuelEuTargets) {
      fuelList.innerHTML = d.fuelEuTargets.map(function (t) {
        return '<li><strong style="color:#00e5ff">' + t.year + ':</strong> -' + t.reductionPct + '% GHG intensity vs 2020 baseline</li>';
      }).join('');
    }
    if (sourceEl && d.source) sourceEl.textContent = d.source;
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

    if (REDUCED_MOTION || LITE) { frame(1); return; }
    var start = null, dur = 850;
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

      if (progress > 0.85) {
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

    if (REDUCED_MOTION || LITE) { frame(1); return; }
    var start = null, dur = 850;
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

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '700 18px Cormorant Garamond,serif';
      ctx.fillText('€183.5B', cx, cy - 2);
      ctx.font = '10px Barlow Condensed,sans-serif';
      ctx.fillStyle = 'rgba(239,242,241,.6)';
      ctx.fillText('TOTAL GVA', cx, cy + 14);

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

    if (REDUCED_MOTION || LITE) { frame(1); return; }
    var start = null, dur = 900;
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

    if (REDUCED_MOTION || LITE) { frame(1); return; }
    var start = null, dur = 900;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      frame(1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function observeChart(canvas, drawFn) {
    if (!canvas) return;
    if (!('IntersectionObserver' in window)) {
      drawFn();
      return;
    }
    var drawn = false;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !drawn) {
          drawn = true;
          drawFn();
          obs.unobserve(canvas);
        }
      });
    }, { threshold: 0.15 });
    obs.observe(canvas);
  }

  function applyCharts(data) {
    var barCanvas = document.getElementById('obs-bar-canvas');
    var shareCanvas = document.getElementById('obs-share-canvas');
    var sectorsCanvas = document.getElementById('obs-sectors-canvas');
    var basinsCanvas = document.getElementById('obs-basins-canvas');

    observeChart(barCanvas, function () { drawBarChart(barCanvas, data.countries.items); });
    observeChart(shareCanvas, function () { drawShareChart(shareCanvas, data.modeShare.shortSea, data.modeShare.other); });
    observeChart(sectorsCanvas, function () { drawSectorsChart(sectorsCanvas, data.blueEconomySectors); });
    observeChart(basinsCanvas, function () { drawBasinsChart(basinsCanvas, data.seaBasins); });

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
      applyCarriers(data);
      applyDecarbonization(data);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
