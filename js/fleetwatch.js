/**
 * fleetwatch.js
 * Fleet Watch — world-scale map: AIS ships, chokepoints, trade routes,
 * top-20 container ports, and critical submarine fiber cables.
 *
 * Data files (all root key = "items"):
 *  - assets/data/chokepoints.json  — { items: [{ id, name, lat, lon, tier, tag, summary }] }
 *  - assets/data/routes.json       — { items: [{ id, name, waypoints, summary }] }
 *  - assets/data/coastline.json    — GeoJSON FeatureCollection
 *  - assets/data/ports.json        — { items: [{ id, rank, name, country, lat, lon, teuM, summary, keyExports }] }
 *  - assets/data/cables.json       — { items: [{ id, name, capacityTbps, lengthKm, landingStations, waypoints, summary }] }
 *  - assets/data/fleet-live.json   — { ships: [{ mmsi, lat, lon, lastSeen }] }
 *  - assets/data/maritime-news.json
 */
(function () {
  'use strict';

  var CHOKEPOINTS_URL = 'assets/data/chokepoints.json';
  var COASTLINE_URL   = 'assets/data/coastline.json';
  var ROUTES_URL      = 'assets/data/routes.json';
  var PORTS_URL       = 'assets/data/ports.json';
  var CABLES_URL      = 'assets/data/cables.json';
  var FLEET_URL       = 'assets/data/fleet-live.json';
  var NEWS_URL        = 'assets/data/maritime-news.json';
  var STALE_AFTER_MS  = 120000;

  /* ── Route palette (no color/dashed fields in JSON) ──
     Muted maritime tones, not the neon set the rest of the redesign
     dropped — multiple routes/cables overlap on screen at once here, so
     (unlike the single-series canvas charts) this genuinely needs several
     distinguishable hues rather than one gold ramp. The clicked/active
     route always resolves to the accent teal (see render()), so that hue
     is deliberately left out of this base set. Named chips remain the
     primary way to identify a route — color here is a secondary cue. */
  var ROUTE_COLORS = [
    'rgba(200,145,58,.55)',   // gold
    'rgba(90,143,168,.55)',   // steel blue
    'rgba(214,168,104,.5)',   // brass-light
    'rgba(143,168,184,.5)',   // fog
    'rgba(168,122,143,.45)',  // muted mauve
    'rgba(143,157,110,.45)',  // muted sage
    'rgba(184,137,74,.45)'    // brass
  ];

  /* Same accent as --chart-accent in css/style.css :root and CHART_ACCENT
     in js/observatory.js — canvas can't read CSS custom properties, so
     it's hardcoded here too. Used for the active route/cable and live
     ship dots ("this is live/selected"), replacing the old raw #00e5ff. */
  var ACCENT = '#4fc3b0';

  var LITE = (function () {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
  })();

  /* ── Equirectangular projection ── */
  var MAP_BOUNDS = { lonMin: -180, lonMax: 180, latMin: -62, latMax: 78 };
  var LAT_SPAN = MAP_BOUNDS.latMax - MAP_BOUNDS.latMin; // 140
  var LON_SPAN = MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin; // 360

  var zoomScale = 1.0;
  var panX = 0;
  var panY = 0;

  /**
   * Project (lon, lat) → canvas pixel (x, y) using current panX/Y/zoomScale.
   * Assumes panX = panY = 0 for the "base" position.
   *
   * Uses a single "cover" scale (max of the two axis scales) so the map
   * never stretches when the container's aspect ratio no longer matches
   * LON_SPAN/LAT_SPAN (the container height is now independent of its
   * width — see size()). This keeps coastlines/routes/cables geometrically
   * correct at any container shape; the world map is centered on the
   * container and the wider axis is cropped rather than squeezed.
   */
  function project(lon, lat, w, h) {
    var s = Math.max(w / LON_SPAN, h / LAT_SPAN);
    var mapW = LON_SPAN * s, mapH = LAT_SPAN * s;
    var offX = (w - mapW) / 2, offY = (h - mapH) / 2;
    var cx = w / 2, cy = h / 2;
    var bx = offX + (lon - MAP_BOUNDS.lonMin) * s;
    var by = offY + (MAP_BOUNDS.latMax - lat) * s;
    return {
      x: (bx - cx) * zoomScale + cx + panX,
      y: (by - cy) * zoomScale + cy + panY
    };
  }

  /** Center the map on (lon, lat) at given zoom, resetting panX/Y. */
  function centerOn(lon, lat, zoom, w, h) {
    zoomScale = zoom;
    panX = 0; panY = 0; // must reset before projecting
    var pt = project(lon, lat, w, h);
    panX = w / 2 - pt.x;
    panY = h / 2 - pt.y;
    constrainPan(w, h);
  }

  function constrainPan(w, h) {
    var mx = (w * (zoomScale - 1)) / 2 + w * 0.4;
    var my = (h * (zoomScale - 1)) / 2 + h * 0.4;
    panX = Math.min(Math.max(panX, -mx), mx);
    panY = Math.min(Math.max(panY, -my), my);
  }

  /** Draw a polyline from [[lon,lat], …] handling anti-meridian wraps. */
  function addGeoPath(ctx, points, w, h) {
    if (!points || !points.length) return;
    var p0 = project(points[0][0], points[0][1], w, h);
    ctx.moveTo(p0.x, p0.y);
    for (var i = 1; i < points.length; i++) {
      var la = points[i - 1][0], lb = points[i][0];
      var delta = lb - la;
      if (Math.abs(delta) > 180) {
        // anti-meridian crossing
        var exit  = delta > 0 ? -180 : 180;
        var enter = -exit;
        var unwrapped = delta > 0 ? lb - 360 : lb + 360;
        var f = (exit - la) / (unwrapped - la);
        var latCross = points[i - 1][1] + f * (points[i][1] - points[i - 1][1]);
        var pe = project(exit,  latCross, w, h);
        var pn = project(enter, latCross, w, h);
        ctx.lineTo(pe.x, pe.y);
        ctx.moveTo(pn.x, pn.y);
      }
      var pt = project(points[i][0], points[i][1], w, h);
      ctx.lineTo(pt.x, pt.y);
    }
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
      return r.json();
    });
  }

  /* ══════════════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════════════ */
  function init() {
    var root             = document.getElementById('fw-map-wrap');
    if (!root) return;

    var canvas           = document.getElementById('fw-canvas');
    var nodesLayer       = document.getElementById('fw-nodes');
    var routesContainer  = document.getElementById('fw-routes');
    var portBoats        = document.getElementById('fw-port-boats');
    var detailPanel      = document.getElementById('fw-detail');
    var vesselCountEl    = document.getElementById('fw-vessel-count');
    var busiestEl        = document.getElementById('fw-busiest');
    var statLbl1         = document.getElementById('fw-stat-lbl-1');
    var statLbl2         = document.getElementById('fw-stat-lbl-2');
    var zoomInBtn        = document.getElementById('fw-zoom-in');
    var zoomOutBtn       = document.getElementById('fw-zoom-out');
    var resetBtn         = document.getElementById('fw-reset-btn');
    var fullscreenBtn    = document.getElementById('fw-fullscreen-btn');

    /* Fullscreen left info panel */
    var fsPanel          = document.getElementById('fw-fs-panel');
    var fsFsChips        = document.getElementById('fw-fs-chips');
    var fsFsBoats        = document.getElementById('fw-fs-boats');
    var fsFsDetail       = document.getElementById('fw-fs-detail');
    var fsFsVesselCount  = document.getElementById('fw-fs-vessel-count');
    var fsFsStatLbl      = document.getElementById('fw-fs-stat-lbl');

    if (!canvas || !nodesLayer) return;

    /* ── State ── */
    var chokepoints  = [];
    var routes       = [];
    var ports        = [];
    var cables       = [];
    var ships        = [];
    var coastline    = null;

    var activeView     = 'fleetwatch';
    var tierFilter     = 'major';
    var activeId       = null;
    var activeRouteId  = null;
    var activePortId   = null;
    var activeCableId  = null;

    /* ── Drag pan ── */
    var isDragging = false, startX = 0, startY = 0, initPanX = 0, initPanY = 0;

    /* ── Canvas sizing ── */

    /**
     * size() — destructive: sets canvas.width/height (clears the bitmap)
     * and canvas.style.height. Called ONLY from render(), which redraws
     * the cleared bitmap immediately after. Must NOT be called from any
     * function that only repositions DOM nodes without redrawing.
     */
    function size() {
      var dpr = window.devicePixelRatio || 1;
      var w = root.clientWidth || 960;
      // Container height is driven by CSS (65vh or fullscreen 100vh).
      // Fall back to 140/360 aspect only when the container hasn't laid
      // out yet (clientHeight === 0).
      var h = root.clientHeight || Math.round(w * 140 / 360);
      canvas.style.height = h + 'px';
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return { w: w, h: h, dpr: dpr };
    }

    /**
     * measure() — non-destructive: reads the same layout dimensions as
     * size() but never touches canvas.width / canvas.height, so the
     * current bitmap is preserved. Use for any code that only needs w/h
     * for geometry (e.g. project() calls in updateNodes()) but does not
     * redraw the canvas itself.
     */
    function measure() {
      var dpr = window.devicePixelRatio || 1;
      var w = root.clientWidth || 960;
      var h = root.clientHeight || Math.round(w * 140 / 360);
      return { w: w, h: h, dpr: dpr };
    }

    /* ── Render ── */
    function render() {
      var s = size();
      var w = s.w, h = s.h, dpr = s.dpr;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* background */
      var bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h));
      bg.addColorStop(0, '#061224');
      bg.addColorStop(1, '#02060d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      /* subtle grid */
      ctx.strokeStyle = 'rgba(200,145,58,.06)';
      ctx.lineWidth = 0.5;
      for (var gx = 0; gx <= w; gx += Math.round(w / 12)) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (var gy = 0; gy <= h; gy += Math.round(h / 6))  { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

      /* coastline — assets/data/coastline.json is { meta, bbox, polylines },
         not a GeoJSON FeatureCollection: polylines is a flat array of
         [lon,lat] point arrays, one per coastline segment. (Pre-existing
         mismatch found via live verification: the old .features check
         silently matched nothing, so the coastline never rendered.) */
      if (coastline && coastline.polylines) {
        ctx.beginPath();
        coastline.polylines.forEach(function (line) { addGeoPath(ctx, line, w, h); });
        ctx.strokeStyle = 'rgba(232,184,112,.32)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      /* trade routes */
      if (activeView === 'fleetwatch') {
        routes.forEach(function (rt, idx) {
          var isAct = rt.id === activeRouteId;
          ctx.beginPath();
          addGeoPath(ctx, rt.waypoints, w, h);
          ctx.strokeStyle = isAct ? ACCENT : (ROUTE_COLORS[idx % ROUTE_COLORS.length]);
          ctx.lineWidth   = isAct ? 2.5 : 1.2;
          ctx.setLineDash(isAct ? [] : [5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      /* submarine cables */
      if (activeView === 'cables') {
        cables.forEach(function (cab, idx) {
          var isAct = cab.id === activeCableId;
          ctx.beginPath();
          addGeoPath(ctx, cab.waypoints, w, h);
          ctx.strokeStyle = isAct ? ACCENT : (ROUTE_COLORS[idx % ROUTE_COLORS.length]);
          ctx.lineWidth   = isAct ? 3.0 : 1.5;
          ctx.shadowColor = ACCENT;
          ctx.shadowBlur  = isAct ? 14 : 5;
          ctx.stroke();
          ctx.shadowBlur  = 0;
        });
      }

      /* live ships */
      if (activeView === 'fleetwatch') {
        var now = Date.now();
        ships.forEach(function (shp) {
          var pt = project(shp.lon, shp.lat, w, h);
          var stale = now - shp.lastSeen * 1000 > STALE_AFTER_MS;
          ctx.fillStyle = stale ? 'rgba(79,195,176,.3)' : 'rgba(79,195,176,.8)';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    /* ── Update DOM node positions ──
       Uses measure() (not size()) so the canvas bitmap is NEVER cleared
       here — only geometry math happens. This is the root fix for the
       "map disappears after every interaction" bug: every handler called
       render() followed by updateNodes(); render() drew the scene, then
       updateNodes() called size() which reset canvas.width and wiped the
       bitmap, leaving a blank canvas for the browser to paint. */
    function updateNodes() {
      var s = measure();
      nodesLayer.querySelectorAll('[data-lon]').forEach(function (el) {
        var pt = project(parseFloat(el.dataset.lon), parseFloat(el.dataset.lat), s.w, s.h);
        el.style.left = pt.x + 'px';
        el.style.top  = pt.y + 'px';
      });
    }

    /* ── Build DOM buttons ── */
    function buildChokeButtons() {
      nodesLayer.innerHTML = '';
      var list = tierFilter === 'major'
        ? chokepoints.filter(function (cp) { return cp.tier === 'major'; })
        : chokepoints;

      list.forEach(function (cp) {
        var sec = cp.tier !== 'major';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-node' + (sec ? ' fw-node--secondary' : '') + (cp.id === activeId ? ' active' : '');
        btn.dataset.lon = cp.lon;
        btn.dataset.lat = cp.lat;
        btn.innerHTML =
          '<span class="fw-node-dot' + (sec ? ' fw-node-dot--secondary' : '') + '"></span>' +
          '<span class="fw-node-label">' + cp.name + '</span>';
        btn.addEventListener('click', function () { selectChokepoint(cp.id); });
        nodesLayer.appendChild(btn);
      });
      updateNodes();
    }

    function buildPortNodeButtons() {
      nodesLayer.innerHTML = '';
      ports.forEach(function (prt, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-port-node' + (prt.id === activePortId ? ' active' : '');
        btn.dataset.lon = prt.lon;
        btn.dataset.lat = prt.lat;
        btn.innerHTML =
          '<span class="fw-port-dot">' + (idx + 1) + '</span>' +
          '<span class="fw-port-label">' + prt.name + ' (' + prt.teuM + 'M TEU)</span>';
        btn.addEventListener('click', function () { selectPort(prt.id); });
        nodesLayer.appendChild(btn);
      });
      updateNodes();
    }

    function buildPortBoats() {
      if (!portBoats) return;
      portBoats.innerHTML = ports.map(function (prt, idx) {
        var isAct = prt.id === activePortId;
        var delay = (idx % 6) * 0.18;
        return (
          '<button type="button" class="fw-boat-btn' + (isAct ? ' active' : '') + '" ' +
          'style="animation-delay:' + delay + 's" data-port-id="' + prt.id + '">' +
          '<div style="font-family:var(--ff-c);font-size:.6rem;font-weight:800;color:var(--gold-l);letter-spacing:.06em">#' + prt.rank + '</div>' +
          '<svg class="fw-boat-svg" viewBox="0 0 36 32" aria-hidden="true">' +
            '<path d="M4 20 L32 20 L27 27 L9 27 Z" />' +
            '<line x1="18" y1="4" x2="18" y2="20" />' +
            '<path d="M18 5 L28 13 L18 13 Z" />' +
          '</svg>' +
          '<span class="fw-boat-name">' + prt.name + '</span>' +
          '<span class="fw-boat-teu">' + prt.teuM + 'M TEU</span>' +
          '</button>'
        );
      }).join('');

      portBoats.querySelectorAll('.fw-boat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { selectPort(btn.dataset.portId); });
      });
    }

    function buildRouteChips() {
      if (!routesContainer) return;
      var chips = routes.map(function (rt) {
        var isAct = rt.id === activeRouteId;
        return '<button type="button" class="fw-route-chip' + (isAct ? ' active' : '') +
          '" data-route-id="' + rt.id + '">' + rt.name + '</button>';
      }).join('');
      routesContainer.innerHTML =
        '<div class="fw-routes-hd">' +
          '<span class="fw-routes-hd-label">Trade Routes</span>' +
          '<span class="fw-routes-hd-count">' + routes.length + ' routes</span>' +
        '</div>' +
        '<div class="fw-routes-strip">' + chips + '</div>';
      routesContainer.querySelectorAll('.fw-route-chip').forEach(function (btn) {
        btn.addEventListener('click', function () { selectRoute(btn.dataset.routeId); });
      });
      syncFsPanel();
    }

    function buildCableChips() {
      if (!routesContainer) return;
      var chips = cables.map(function (cab) {
        var isAct = cab.id === activeCableId;
        return '<button type="button" class="fw-route-chip' + (isAct ? ' active' : '') +
          '" data-cable-id="' + cab.id + '">' + cab.name + '<br><span style="font-size:.6rem;font-weight:400;opacity:.65">' + cab.capacityTbps + ' Tbps &middot; ' + (cab.lengthKm || 'N/A').toLocaleString() + ' km</span></button>';
      }).join('');
      routesContainer.innerHTML =
        '<div class="fw-routes-hd">' +
          '<span class="fw-routes-hd-label">Submarine Cables</span>' +
          '<span class="fw-routes-hd-count">' + cables.length + ' cables</span>' +
        '</div>' +
        '<div class="fw-routes-strip">' + chips + '</div>';
      routesContainer.querySelectorAll('.fw-route-chip').forEach(function (btn) {
        btn.addEventListener('click', function () { selectCable(btn.dataset.cableId); });
      });
      syncFsPanel();
    }

    /* ── Selection handlers ── */
    function selectChokepoint(id) {
      activeId = id;
      activeRouteId = null;
      var cp = chokepoints.find(function (c) { return c.id === id; });
      if (!cp) return;

      var s = size();
      centerOn(cp.lon, cp.lat, 2.2, s.w, s.h);

      if (detailPanel) {
        detailPanel.innerHTML =
          '<span class="fw-detail-tag">Chokepoint · ' + (cp.tier === 'major' ? 'Major' : 'Secondary') + '</span>' +
          '<h4>' + cp.name + '</h4>' +
          '<p>' + cp.summary + '</p>' +
          (cp.tag ? '<div style="font-size:.82rem;color:var(--gold-l);margin-top:.4rem">⚑ ' + cp.tag + '</div>' : '') +
          (cp.sourceLabel ? '<a class="fw-detail-source" href="' + cp.source + '" target="_blank" rel="noopener">Source: ' + cp.sourceLabel + '</a>' : '');
      }
      render();
      buildChokeButtons();
      syncFsPanel();
    }

    function selectPort(id) {
      activePortId = id;
      var prt = ports.find(function (p) { return p.id === id; });
      if (!prt) return;

      var s = size();
      centerOn(prt.lon, prt.lat, 2.6, s.w, s.h);

      if (detailPanel) {
        detailPanel.innerHTML =
          '<span class="fw-detail-tag">Container Port · World Rank #' + prt.rank + '</span>' +
          '<h4>' + prt.name + ', ' + prt.country + '</h4>' +
          '<p>' + prt.summary + '</p>' +
          '<div style="font-size:.82rem;color:rgba(239,242,241,.85);margin-top:.4rem">' +
          '<strong>Annual Throughput:</strong> ' + prt.teuM + ' Million TEU<br>' +
          '<strong>Key Exports:</strong> ' + prt.keyExports +
          '</div>' +
          (prt.sourceLabel ? '<a class="fw-detail-source" href="' + prt.source + '" target="_blank" rel="noopener">Source: ' + prt.sourceLabel + '</a>' : '');
      }
      render();
      buildPortNodeButtons();
      buildPortBoats();
      syncFsPanel();
    }

    function selectRoute(id) {
      activeRouteId = id;
      activeId = null;
      var rt = routes.find(function (r) { return r.id === id; });
      if (!rt) return;

      if (detailPanel) {
        detailPanel.innerHTML =
          '<span class="fw-detail-tag">Major Global Trade Route</span>' +
          '<h4>' + rt.name + '</h4>' +
          '<p>' + rt.summary + '</p>' +
          (rt.tag ? '<div style="font-size:.82rem;color:var(--gold-l);margin-top:.4rem">⚑ ' + rt.tag + '</div>' : '') +
          (rt.sourceLabel ? '<a class="fw-detail-source" href="' + rt.source + '" target="_blank" rel="noopener">Source: ' + rt.sourceLabel + '</a>' : '');
      }
      render();
      buildRouteChips();
    }

    function selectCable(id) {
      activeCableId = id;
      var cab = cables.find(function (c) { return c.id === id; });
      if (!cab) return;

      if (detailPanel) {
        detailPanel.innerHTML =
          '<span class="fw-detail-tag">Critical Submarine Fiber Cable</span>' +
          '<h4>' + cab.name + ' · ' + cab.capacityTbps + ' Tbps</h4>' +
          '<p>' + cab.summary + '</p>' +
          '<div style="font-size:.82rem;color:rgba(239,242,241,.85);margin-top:.4rem">' +
          '<strong>Length:</strong> ' + (cab.lengthKm || 'N/A').toLocaleString() + ' km<br>' +
          '<strong>Landing Stations:</strong> ' + (cab.landingStations || []).join(' → ') +
          '</div>' +
          (cab.sourceLabel ? '<a class="fw-detail-source" href="' + cab.source + '" target="_blank" rel="noopener">Source: ' + cab.sourceLabel + '</a>' : '');
      }
      render();
      buildCableChips();
    }

    /* ── View switcher ── */
    function setView(view) {
      activeView = view;

      var filterToggle = document.getElementById('fw-filter-toggle');
      if (filterToggle) filterToggle.style.display = view === 'fleetwatch' ? 'inline-flex' : 'none';

      if (portBoats) portBoats.style.display = view === 'ports' ? 'flex' : 'none';
      if (routesContainer) routesContainer.style.display = (view === 'fleetwatch' || view === 'cables') ? 'flex' : 'none';

      if (view === 'fleetwatch') {
        if (statLbl1) statLbl1.textContent = 'Vessels tracked';
        if (statLbl2) statLbl2.textContent = 'Busiest chokepoint';
        buildChokeButtons();
        buildRouteChips();
        setDetail('Select a chokepoint or trade route on the map for details.');
      } else if (view === 'ports') {
        if (statLbl1) statLbl1.textContent = 'Top Container Ports';
        if (statLbl2) statLbl2.textContent = 'Combined throughput';
        if (vesselCountEl) vesselCountEl.textContent = '20';
        if (busiestEl) busiestEl.textContent = '389.7M TEU';
        buildPortNodeButtons();
        buildPortBoats();
        setDetail('Select a port on the map or click a vessel card below to view trade data.');
      } else if (view === 'cables') {
        if (statLbl1) statLbl1.textContent = 'Submarine Cables';
        if (statLbl2) statLbl2.textContent = 'Total Capacity';
        if (vesselCountEl) vesselCountEl.textContent = String(cables.length || 13);
        if (busiestEl) busiestEl.textContent = '~1.8 Pbps';
        nodesLayer.innerHTML = '';
        buildCableChips();
        setDetail('Select a submarine cable to highlight its ocean route, bandwidth, and landing stations.');
      }
      render();
    }

    function setDetail(msg) {
      if (detailPanel) detailPanel.innerHTML = '<p class="fw-detail-empty">' + msg + '</p>';
      syncFsPanel();
    }

    /* ── Zoom controls ── */
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', function () {
        zoomScale = Math.min(zoomScale * 1.3, 4.0);
        var s = size(); constrainPan(s.w, s.h);
        render(); updateNodes();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', function () {
        zoomScale = Math.max(zoomScale / 1.3, 0.8);
        var s = size(); constrainPan(s.w, s.h);
        render(); updateNodes();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        zoomScale = 1.0; panX = 0; panY = 0;
        render(); updateNodes();
      });
    }

    /* ── Fullscreen ── */
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function () {
        if (!document.fullscreenElement) {
          (root.requestFullscreen || root.webkitRequestFullscreen || function(){}).call(root);
        } else {
          (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        }
      });
    }
    // Container size changes on entering/exiting fullscreen — redraw so
    // the canvas and DOM markers pick up the new clientWidth/Height.
    //
    // Fix B — cursor visibility in fullscreen:
    // The custom compass cursor (#compass-cursor / #cursor-dot) lives in
    // <body> and is hidden by `body.cursor-on * { cursor: none }`. When
    // #fw-map-wrap goes fullscreen the browser only renders its subtree,
    // so the overlay elements are invisible but the CSS rule still hides
    // the native cursor → no cursor at all. Fix: remove cursor-on while
    // inside map fullscreen; restore it on exit.
    var _cursorWasOn = false;
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl === root) {
          // Entering map fullscreen — suspend custom cursor, open info panel
          _cursorWasOn = document.body.classList.contains('cursor-on');
          if (_cursorWasOn) document.body.classList.remove('cursor-on');
          if (fsPanel) fsPanel.setAttribute('aria-hidden', 'false');
          syncFsPanel();
        } else {
          // Exiting map fullscreen — restore custom cursor, hide info panel
          if (_cursorWasOn) document.body.classList.add('cursor-on');
          _cursorWasOn = false;
          if (fsPanel) fsPanel.setAttribute('aria-hidden', 'true');
        }
        // Resize canvas to new container dimensions and redraw
        render(); updateNodes();
      });
    });

    /* ── fs-panel event delegation ── */
    if (fsPanel) {
      fsPanel.addEventListener('click', function (e) {
        var chip = e.target.closest('.fw-route-chip');
        if (chip) {
          if (chip.dataset.routeId) selectRoute(chip.dataset.routeId);
          if (chip.dataset.cableId) selectCable(chip.dataset.cableId);
          return;
        }
        var boat = e.target.closest('.fw-boat-btn');
        if (boat) { selectPort(boat.dataset.portId); return; }
      });
    }

    /* ── syncFsPanel — detail + selectors + stat ── */
    function syncFsPanel() {
      if (!fsPanel) return;
      if (fsFsDetail && detailPanel)     fsFsDetail.innerHTML  = detailPanel.innerHTML;
      if (fsFsChips  && routesContainer) fsFsChips.innerHTML   = routesContainer.innerHTML;
      if (fsFsBoats  && portBoats)       fsFsBoats.innerHTML   = portBoats.innerHTML;
      if (fsFsVesselCount && vesselCountEl) fsFsVesselCount.textContent = vesselCountEl.textContent;
      if (fsFsStatLbl && statLbl1)          fsFsStatLbl.textContent     = statLbl1.textContent;
    }

    /* News feed removed from fs-panel — no fetch needed */

    /* ── Drag pan ── */
    canvas.addEventListener('mousedown', function (e) {
      isDragging = true; startX = e.clientX; startY = e.clientY;
      initPanX = panX; initPanY = panY;
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      panX = initPanX + (e.clientX - startX);
      panY = initPanY + (e.clientY - startY);
      var s = size(); constrainPan(s.w, s.h);
      render(); updateNodes();
    });
    window.addEventListener('mouseup', function () {
      if (isDragging) { isDragging = false; canvas.style.cursor = 'grab'; }
    });

    /* touch drag */
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        initPanX = panX; initPanY = panY;
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (!isDragging || e.touches.length !== 1) return;
      panX = initPanX + (e.touches[0].clientX - startX);
      panY = initPanY + (e.touches[0].clientY - startY);
      var s = size(); constrainPan(s.w, s.h);
      render(); updateNodes();
    }, { passive: true });
    canvas.addEventListener('touchend', function () { isDragging = false; });

    /* wheel zoom */
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.15 : 0.88;
      zoomScale = Math.min(Math.max(zoomScale * factor, 0.8), 4.0);
      var s = size(); constrainPan(s.w, s.h);
      render(); updateNodes();
    }, { passive: false });

    /* ── Load data ──
       Promise.allSettled (not Promise.all): a single missing/failing data
       file must never disable the tab switcher or the ports boats — it
       should just render with whatever data did load. */
    var DATA_URLS = [CHOKEPOINTS_URL, COASTLINE_URL, ROUTES_URL, PORTS_URL, CABLES_URL];
    Promise.allSettled(DATA_URLS.map(fetchJSON)).then(function (results) {
      function val(r) { return r.status === 'fulfilled' ? r.value : null; }
      results.forEach(function (r, i) {
        if (r.status === 'rejected') console.warn('[fleetwatch] failed to load', DATA_URLS[i], r.reason);
      });

      var chokeRes = val(results[0]);
      var coastRes = val(results[1]);
      var routeRes = val(results[2]);
      var portRes  = val(results[3]);
      var cableRes = val(results[4]);

      chokepoints = (chokeRes && chokeRes.items) || [];
      coastline   = coastRes || null;
      routes      = (routeRes && routeRes.items) || [];
      ports       = (portRes && portRes.items) || [];
      cables      = (cableRes && cableRes.items) || [];

      /* tab switcher — bound unconditionally, regardless of which fetches failed */
      document.querySelectorAll('#fw-view-tabs .fw-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          document.querySelectorAll('#fw-view-tabs .fw-tab').forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          setView(tab.dataset.view);
        });
      });

      /* filter toggle */
      document.querySelectorAll('#fw-filter-toggle .fw-filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#fw-filter-toggle .fw-filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          tierFilter = btn.dataset.filter;
          if (activeView === 'fleetwatch') buildChokeButtons();
        });
      });

      /* live ship poll — fleet-live.json may legitimately be empty (no
         live feed wired up yet), so show an em dash rather than a
         misleading "0" both on success-with-no-ships and on fetch failure */
      function pollShips() {
        fetchJSON(FLEET_URL).then(function (d) {
          ships = (d && (d.ships || d.items)) || [];
          if (activeView === 'fleetwatch') {
            if (vesselCountEl) vesselCountEl.textContent = ships.length ? String(ships.length) : '…';
            render();
          }
        }).catch(function () {
          if (vesselCountEl && activeView === 'fleetwatch') vesselCountEl.textContent = '…';
        });
        setTimeout(pollShips, 9000);
      }
      pollShips();

      /* initial render — wait one frame so clientWidth is available */
      requestAnimationFrame(function () {
        setView('fleetwatch');
      });

      window.addEventListener('resize', function () {
        render(); updateNodes();
      });

    }).catch(function (err) {
      console.warn('[fleetwatch] init error:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
