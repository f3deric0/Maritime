/**
 * fleetwatch.js
 * Fleet Watch — live AIS ship map layered with six real maritime
 * chokepoints (Gibraltar to the Red Sea). Companion to observatory.js;
 * kept separate since it has its own data sources and its own live-poll
 * loop.
 *
 * Data sources:
 *  - assets/data/chokepoints.json — six researched chokepoints (static,
 *    fetched once). Always renders, even if the live feed is down.
 *  - assets/data/coastline.json — simplified real coastline (static,
 *    fetched once). See scripts/build-coastline.py.
 *  - assets/data/fleet-live.json — live ship positions, regenerated every
 *    ~5s on the VPS by scripts/fleet-relay/relay.py (a systemd service
 *    relaying aisstream.io so no visitor ever opens their own WebSocket
 *    or sees the API key). Polled every FLEET_POLL_MS here.
 *
 * Resilience: the chokepoint map + detail cards work with ZERO live data
 * (they only need chokepoints.json + coastline.json). The live-ship layer
 * degrades independently — if fleet-live.json is missing, unparsable, or
 * stale (generatedAt older than STALE_AFTER_MS), the ship layer just
 * hides itself with a small note; nothing else on the page breaks.
 */
(function () {
  var CHOKEPOINTS_URL = 'assets/data/chokepoints.json';
  var COASTLINE_URL = 'assets/data/coastline.json';
  var FLEET_URL = 'assets/data/fleet-live.json';
  var FLEET_POLL_MS = 9000;
  var STALE_AFTER_MS = 120000; // 2 min — relay writes every 5s, so this is generous
  var SHIP_FADE_MS = 2500;

  var LITE = (function () {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
  })();
  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STATIC_MODE = LITE || REDUCED_MOTION;

  // Illustrative "engraved chart" projection, not a navigation chart —
  // deliberately stretched wide (see the plan's design note) so the
  // Gibraltar-to-Red Sea corridor reads as a panel, not a square.
  var MAP_BOUNDS = { lonMin: -9, lonMax: 45, latMin: 10, latMax: 58 };

  function project(lon, lat, w, h) {
    var x = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * w;
    var y = (1 - (lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * h;
    return { x: x, y: y };
  }

  function unproject(x, y, w, h) {
    var lon = MAP_BOUNDS.lonMin + (x / w) * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
    var lat = MAP_BOUNDS.latMax - (y / h) * (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin);
    return { lon: lon, lat: lat };
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function init() {
    var root = document.getElementById('fw-map-wrap');
    if (!root) return; // not on this page

    var canvas = document.getElementById('fw-canvas');
    var detailPanel = document.getElementById('fw-detail');
    var vesselCountEl = document.getElementById('fw-vessel-count');
    var busiestEl = document.getElementById('fw-busiest');
    var liveNoteEl = document.getElementById('fw-live-note');
    var hudEl = document.getElementById('fw-hud');
    var nodesLayer = document.getElementById('fw-nodes');

    var coastline = null;
    var chokepoints = [];
    var shipsById = {}; // mmsi -> { lon, lat, dispLon, dispLat, targetLon, targetLat, chokepoint, firstSeen, lastSeen, fading }
    var liveOK = null; // null = unknown yet — distinct from true/false so the first poll result always applies

    Promise.all([fetchJSON(CHOKEPOINTS_URL), fetchJSON(COASTLINE_URL)])
      .then(function (r) {
        chokepoints = r[0].items;
        coastline = r[1];
        buildNodeButtons();
        draw();
        pollFleet();
        setInterval(pollFleet, FLEET_POLL_MS);
        if (!STATIC_MODE) requestAnimationFrame(tick);
        window.addEventListener('resize', debounce(draw, 200));
      })
      .catch(function (err) {
        console.warn('[fleetwatch] failed to load chokepoints/coastline:', err.message || err);
        if (root) root.innerHTML = '<p class="fw-error">Fleet Watch is temporarily unavailable.</p>';
      });

    function debounce(fn, ms) {
      var t;
      return function () {
        clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    }

    /* ── chokepoint node buttons (real DOM elements — accessible, no canvas hit-testing) ── */
    function buildNodeButtons() {
      if (!nodesLayer) return;
      nodesLayer.innerHTML = '';
      chokepoints.forEach(function (cp) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-node';
        btn.dataset.cp = cp.id;
        btn.setAttribute('aria-label', cp.name + ' — ' + cp.tag);
        btn.innerHTML = '<span class="fw-node-dot"></span><span class="fw-node-label">' + cp.name + '</span>';
        btn.addEventListener('click', function () { selectChokepoint(cp.id); });
        btn.addEventListener('focus', function () { selectChokepoint(cp.id); });
        nodesLayer.appendChild(btn);
      });
      positionNodeButtons();
    }

    function positionNodeButtons() {
      if (!nodesLayer) return;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      Array.prototype.forEach.call(nodesLayer.children, function (btn) {
        var cp = chokepoints.filter(function (c) { return c.id === btn.dataset.cp; })[0];
        if (!cp) return;
        var p = project(cp.lon, cp.lat, w, h);
        btn.style.left = p.x + 'px';
        btn.style.top = p.y + 'px';
      });
    }

    function selectChokepoint(id) {
      var cp = chokepoints.filter(function (c) { return c.id === id; })[0];
      if (!cp || !detailPanel) return;
      Array.prototype.forEach.call(nodesLayer.children, function (b) {
        b.classList.toggle('active', b.dataset.cp === id);
      });
      detailPanel.innerHTML =
        '<div class="fw-detail-tag">' + cp.tag + '</div>' +
        '<h4>' + cp.name + '</h4>' +
        '<p>' + cp.summary + '</p>' +
        '<a href="' + cp.source + '" target="_blank" rel="noopener" class="fw-detail-source">Source: ' + cp.sourceLabel + '</a>';
    }

    /* ── live fleet polling ── */
    function pollFleet() {
      fetchJSON(FLEET_URL)
        .then(function (data) {
          var ageMs = Date.now() - (data.generatedAt * 1000);
          if (!data.vessels || ageMs > STALE_AFTER_MS) throw new Error('stale snapshot');
          applyFleet(data);
          setLiveState(true);
        })
        .catch(function () {
          setLiveState(false);
        });
    }

    function setLiveState(ok) {
      if (ok === liveOK) return;
      liveOK = ok;
      if (root) root.classList.toggle('fw-live-down', !ok);
      if (liveNoteEl) liveNoteEl.style.display = ok ? 'none' : 'block';
      if (!ok) {
        // Let existing ships fade out naturally rather than vanishing —
        // stop feeding new targets, tick() handles the fade.
        if (vesselCountEl) vesselCountEl.textContent = '—';
        if (busiestEl) busiestEl.textContent = '—';
      }
    }

    function applyFleet(data) {
      var now = performance.now();
      var seenIds = {};
      data.vessels.forEach(function (v) {
        seenIds[v.mmsi] = true;
        var existing = shipsById[v.mmsi];
        if (existing) {
          existing.targetLon = v.lon;
          existing.targetLat = v.lat;
          existing.chokepoint = v.chokepoint;
          existing.lastSeen = now;
          existing.fading = false;
        } else {
          shipsById[v.mmsi] = {
            dispLon: v.lon, dispLat: v.lat,
            targetLon: v.lon, targetLat: v.lat,
            chokepoint: v.chokepoint,
            lastSeen: now, fading: false
          };
        }
      });
      Object.keys(shipsById).forEach(function (id) {
        if (!seenIds[id]) shipsById[id].fading = true;
      });

      if (vesselCountEl) vesselCountEl.textContent = data.vesselCount;
      if (busiestEl) busiestEl.textContent = busiestChokepointLabel(data.vessels);

      if (STATIC_MODE) {
        Object.keys(shipsById).forEach(function (id) {
          shipsById[id].dispLon = shipsById[id].targetLon;
          shipsById[id].dispLat = shipsById[id].targetLat;
        });
        draw();
      }
    }

    function busiestChokepointLabel(vessels) {
      var counts = {};
      vessels.forEach(function (v) { counts[v.chokepoint] = (counts[v.chokepoint] || 0) + 1; });
      var bestId = null, bestN = 0;
      Object.keys(counts).forEach(function (id) {
        if (counts[id] > bestN) { bestN = counts[id]; bestId = id; }
      });
      if (!bestId) return '—';
      var cp = chokepoints.filter(function (c) { return c.id === bestId; })[0];
      return (cp ? cp.name : bestId) + ' (' + bestN + ')';
    }

    /* ── animation loop (skipped entirely in STATIC_MODE) ── */
    function tick() {
      var now = performance.now();
      var ease = 0.06;
      Object.keys(shipsById).forEach(function (id) {
        var s = shipsById[id];
        s.dispLon += (s.targetLon - s.dispLon) * ease;
        s.dispLat += (s.targetLat - s.dispLat) * ease;
        if (s.fading && now - s.lastSeen > SHIP_FADE_MS) delete shipsById[id];
      });
      draw();
      requestAnimationFrame(tick);
    }

    /* ── drawing ── */
    function sizeCanvas() {
      var dpr = window.devicePixelRatio || 1;
      var cssW = canvas.clientWidth || root.clientWidth;
      var cssH = Math.round(cssW * 0.42);
      canvas.style.height = cssH + 'px';
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: cssW, h: cssH };
    }

    function draw() {
      if (!canvas || !coastline) return;
      var dim = sizeCanvas(), ctx = dim.ctx, w = dim.w, h = dim.h;
      ctx.clearRect(0, 0, w, h);

      // graticule
      ctx.strokeStyle = 'rgba(200,145,58,.07)';
      ctx.lineWidth = 1;
      for (var gx = 0; gx < w; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (var gy = 0; gy < h; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      // coastline
      ctx.strokeStyle = 'rgba(239,242,241,.4)';
      ctx.lineWidth = 1.1;
      coastline.polylines.forEach(function (line) {
        ctx.beginPath();
        line.forEach(function (pt, i) {
          var p = project(pt[0], pt[1], w, h);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });

      // chokepoint rings (visual anchor under the DOM node buttons)
      chokepoints.forEach(function (cp) {
        var p = project(cp.lon, cp.lat, w, h);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,145,58,.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // live ships
      Object.keys(shipsById).forEach(function (id) {
        var s = shipsById[id];
        var p = project(s.dispLon, s.dispLat, w, h);
        var alpha = s.fading ? Math.max(0, 1 - (performance.now() - s.lastSeen) / SHIP_FADE_MS) : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232,184,112,' + (0.9 * alpha) + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,184,112,' + (0.25 * alpha) + ')';
        ctx.stroke();
      });

      positionNodeButtons();
    }

    /* ── lat/lon HUD on hover (desktop only — callback to the hero's coordinate HUD) ── */
    if (canvas && hudEl && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      canvas.addEventListener('mousemove', function (e) {
        var rect = canvas.getBoundingClientRect();
        var coords = unproject(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
        var latDir = coords.lat >= 0 ? 'N' : 'S', lonDir = coords.lon >= 0 ? 'E' : 'W';
        hudEl.textContent = Math.abs(coords.lat).toFixed(2) + '°' + latDir + ' · ' + Math.abs(coords.lon).toFixed(2) + '°' + lonDir;
        hudEl.style.opacity = '1';
      });
      canvas.addEventListener('mouseleave', function () { hudEl.style.opacity = '0'; });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
