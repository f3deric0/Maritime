/**
 * fleetwatch.js
 * Fleet Watch — a live, world-scale AIS ship map layered with real maritime
 * chokepoints, major trade routes, top world container ports, and critical
 * submarine fiber-optic cables.
 *
 * Data sources:
 *  - assets/data/chokepoints.json — researched chokepoints
 *  - assets/data/routes.json — major global trade routes
 *  - assets/data/coastline.json — high-precision world coastline (Natural Earth 10m)
 *  - assets/data/ports.json — Top 20 world container ports dataset
 *  - assets/data/cables.json — Critical submarine telecom cables dataset
 *  - assets/data/fleet-live.json — live AIS ship positions from VPS relay
 */
(function () {
  var CHOKEPOINTS_URL = 'assets/data/chokepoints.json';
  var COASTLINE_URL = 'assets/data/coastline.json';
  var ROUTES_URL = 'assets/data/routes.json';
  var PORTS_URL = 'assets/data/ports.json';
  var CABLES_URL = 'assets/data/cables.json';
  var FLEET_URL = 'assets/data/fleet-live.json';
  var FLEET_POLL_MS = 9000;
  var STALE_AFTER_MS = 120000;
  var SHIP_FADE_MS = 2500;

  var LITE = (function () {
    var c = navigator.connection || {};
    return !!(c.saveData || /(^|\b)(slow-)?2g$/.test(c.effectiveType || ''));
  })();
  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var STATIC_MODE = LITE || REDUCED_MOTION;

  // Natural distortion-free Equirectangular bounds (360x140 aspect ratio: 140/360 = 0.38888)
  var MAP_BOUNDS = { lonMin: -180, lonMax: 180, latMin: -62, latMax: 78 };
  var LAT_SPAN = MAP_BOUNDS.latMax - MAP_BOUNDS.latMin; // 140
  var LON_SPAN = MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin; // 360

  function project(lon, lat, w, h) {
    var x = ((lon - MAP_BOUNDS.lonMin) / LON_SPAN) * w;
    var y = ((MAP_BOUNDS.latMax - lat) / LAT_SPAN) * h;
    return { x: x, y: y };
  }

  function unproject(x, y, w, h) {
    var lon = MAP_BOUNDS.lonMin + (x / w) * LON_SPAN;
    var lat = MAP_BOUNDS.latMax - (y / h) * LAT_SPAN;
    return { lon: lon, lat: lat };
  }

  // Appends polyline segments to an existing path (supports single-stroke batching)
  function addGeoPolylinePath(ctx2d, points, w, h) {
    if (!points || !points.length) return;
    var p0 = project(points[0][0], points[0][1], w, h);
    ctx2d.moveTo(p0.x, p0.y);
    for (var i = 1; i < points.length; i++) {
      var lonA = points[i - 1][0], latA = points[i - 1][1];
      var lonB = points[i][0], latB = points[i][1];
      var rawDelta = lonB - lonA;
      if (rawDelta > 180 || rawDelta < -180) {
        var exitLon = rawDelta > 180 ? -180 : 180;
        var enterLon = rawDelta > 180 ? 180 : -180;
        var unwrappedB = rawDelta > 180 ? lonB - 360 : lonB + 360;
        var f = (exitLon - lonA) / (unwrappedB - lonA);
        var latCross = latA + f * (latB - latA);
        var pExit = project(exitLon, latCross, w, h);
        ctx2d.lineTo(pExit.x, pExit.y);
        var pEnter = project(enterLon, latCross, w, h);
        ctx2d.moveTo(pEnter.x, pEnter.y);
        var pB = project(lonB, latB, w, h);
        ctx2d.lineTo(pB.x, pB.y);
      } else {
        var p = project(lonB, latB, w, h);
        ctx2d.lineTo(p.x, p.y);
      }
    }
  }

  function strokeGeoPolyline(ctx2d, points, w, h) {
    ctx2d.beginPath();
    addGeoPolylinePath(ctx2d, points, w, h);
    ctx2d.stroke();
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function init() {
    var root = document.getElementById('fw-map-wrap');
    if (!root) return;

    var canvas = document.getElementById('fw-canvas');
    var detailPanel = document.getElementById('fw-detail');
    var vesselCountEl = document.getElementById('fw-vessel-count');
    var busiestEl = document.getElementById('fw-busiest');
    var statLbl1 = document.getElementById('fw-stat-lbl-1');
    var statLbl2 = document.getElementById('fw-stat-lbl-2');
    var liveNoteEl = document.getElementById('fw-live-note');
    var hudEl = document.getElementById('fw-hud');
    var nodesLayer = document.getElementById('fw-nodes');
    var routesLayer = document.getElementById('fw-routes');
    var tabsWrap = document.getElementById('fw-view-tabs');
    var filterWrap = document.getElementById('fw-filter-toggle');

    var activeView = 'fleetwatch'; // 'fleetwatch' | 'ports' | 'cables'
    var tierFilter = 'major'; // 'major' | 'all'
    var coastline = null;
    var chokepoints = [];
    var routes = [];
    var ports = [];
    var cables = [];
    var selectedRouteId = null;
    var selectedCableId = null;
    var selectedPortId = null;
    var selectedCpId = null;
    var shipsById = {};
    var liveOK = null;

    var staticCanvas = document.createElement('canvas');
    var ctx = null, staticCtx = null, dpr = 1, mapW = 0, mapH = 0;

    Promise.all([
      fetchJSON(CHOKEPOINTS_URL),
      fetchJSON(COASTLINE_URL),
      fetchJSON(ROUTES_URL).catch(function () { return { items: [] }; }),
      fetchJSON(PORTS_URL).catch(function () { return { items: [] }; }),
      fetchJSON(CABLES_URL).catch(function () { return { items: [] }; })
    ])
      .then(function (r) {
        chokepoints = r[0].items || [];
        coastline = r[1];
        routes = r[2].items || [];
        ports = r[3].items || [];
        cables = r[4].items || [];

        bindTabsAndFilters();
        updateActiveViewUI();
        resize();
        pollFleet();
        setInterval(pollFleet, FLEET_POLL_MS);
        if (!STATIC_MODE) requestAnimationFrame(tick);
        window.addEventListener('resize', debounce(resize, 200));
      })
      .catch(function (err) {
        console.warn('[fleetwatch] failed to load data:', err.message || err);
        if (root) root.innerHTML = '<p class="fw-error">Fleet Watch is temporarily unavailable.</p>';
      });

    function debounce(fn, ms) {
      var t;
      return function () {
        clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    }

    /* ── Tab Switcher & Chokepoint Filter Logic ── */
    function bindTabsAndFilters() {
      if (tabsWrap) {
        var tabs = tabsWrap.querySelectorAll('.fw-tab');
        tabs.forEach(function (tab) {
          tab.addEventListener('click', function () {
            var view = tab.dataset.view;
            if (view === activeView) return;
            activeView = view;
            tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.view === view); });
            selectedRouteId = null;
            selectedCableId = null;
            selectedPortId = null;
            selectedCpId = null;
            updateActiveViewUI();
            renderStatic();
            draw();
          });
        });
      }

      if (filterWrap) {
        var fBtns = filterWrap.querySelectorAll('.fw-filter-btn');
        fBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var filter = btn.dataset.filter;
            if (filter === tierFilter) return;
            tierFilter = filter;
            fBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.filter === filter); });
            if (activeView === 'fleetwatch') {
              buildNodeButtons();
            }
          });
        });
      }
    }

    function updateActiveViewUI() {
      if (filterWrap) filterWrap.style.display = (activeView === 'fleetwatch') ? 'inline-flex' : 'none';

      if (activeView === 'fleetwatch') {
        if (statLbl1) statLbl1.textContent = 'Vessels tracked now';
        if (statLbl2) statLbl2.textContent = 'Busiest chokepoint';
        buildNodeButtons();
        buildRouteChips();
        showDetailPlaceholder('Select a chokepoint or trade route on the map for details.');
      } else if (activeView === 'ports') {
        if (statLbl1) statLbl1.textContent = 'Top Container Ports';
        if (statLbl2) statLbl2.textContent = 'Total Volume (TEU)';
        if (vesselCountEl) vesselCountEl.textContent = '20';
        if (busiestEl) busiestEl.textContent = '389.7M';
        buildPortNodeButtons();
        buildPortChips();
        showDetailPlaceholder('Select a container port on the map to view annual TEU throughput and trade roles.');
      } else if (activeView === 'cables') {
        if (statLbl1) statLbl1.textContent = 'Critical Fiber Cables';
        if (statLbl2) statLbl2.textContent = 'Total Capacity';
        if (vesselCountEl) vesselCountEl.textContent = '10';
        if (busiestEl) busiestEl.textContent = '~1.1 Pbps';
        if (nodesLayer) nodesLayer.innerHTML = '';
        buildCableChips();
        showDetailPlaceholder('Select a submarine cable to highlight its ocean route, bandwidth, and landing points.');
      }
    }

    function showDetailPlaceholder(msg) {
      if (detailPanel) {
        detailPanel.innerHTML = '<p class="fw-detail-empty">' + msg + '</p>';
      }
    }

    /* ── Chokepoint Buttons (Fleet Watch View) — Sub-Pixel Percentage Anchored ── */
    function buildNodeButtons() {
      if (!nodesLayer) return;
      nodesLayer.innerHTML = '';
      var list = tierFilter === 'major'
        ? chokepoints.filter(function (cp) { return cp.tier === 'major'; })
        : chokepoints;

      list.forEach(function (cp) {
        var secondary = cp.tier === 'secondary';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-node' + (secondary ? ' fw-node--secondary' : '');
        btn.dataset.cp = cp.id;
        btn.setAttribute('aria-label', cp.name + ' — ' + cp.tag);

        // Exact percentage positioning matching projection math (lon -180..180 -> 0..100%, lat -62..78 -> 100..0%)
        var leftPct = ((cp.lon + 180) / 3.6).toFixed(4);
        var topPct = ((78 - cp.lat) / 1.4).toFixed(4);
        btn.style.left = leftPct + '%';
        btn.style.top = topPct + '%';

        btn.innerHTML = '<span class="fw-node-dot' + (secondary ? ' fw-node-dot--secondary' : '') + '"></span><span class="fw-node-label">' + cp.name + '</span>';
        btn.addEventListener('click', function () { selectChokepoint(cp.id); });
        btn.addEventListener('focus', function () { selectChokepoint(cp.id); });
        nodesLayer.appendChild(btn);
      });
    }

    function selectChokepoint(id) {
      var cp = chokepoints.filter(function (c) { return c.id === id; })[0];
      if (!cp || !detailPanel) return;
      selectedCpId = id;
      selectedRouteId = null;
      if (nodesLayer) {
        Array.prototype.forEach.call(nodesLayer.children, function (b) {
          b.classList.toggle('active', b.dataset.cp === id);
        });
      }
      if (routesLayer) Array.prototype.forEach.call(routesLayer.children, function (b) { b.classList.remove('active'); });
      detailPanel.innerHTML =
        '<div class="fw-detail-tag">' + cp.tag + ' · ' + cp.tier.toUpperCase() + ' CHOKEPOINT</div>' +
        '<h4>' + cp.name + '</h4>' +
        '<p>' + cp.summary + '</p>' +
        '<a href="' + cp.source + '" target="_blank" rel="noopener" class="fw-detail-source">Source: ' + cp.sourceLabel + '</a>';
    }

    function buildRouteChips() {
      if (!routesLayer) return;
      routesLayer.innerHTML = '';
      routes.forEach(function (rt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-route-chip';
        btn.dataset.route = rt.id;
        btn.textContent = rt.name;
        btn.addEventListener('click', function () { selectRoute(rt.id); });
        routesLayer.appendChild(btn);
      });
    }

    function selectRoute(id) {
      var rt = routes.filter(function (r) { return r.id === id; })[0];
      if (!rt || !detailPanel) return;
      selectedRouteId = id;
      selectedCpId = null;
      Array.prototype.forEach.call(routesLayer.children, function (b) {
        b.classList.toggle('active', b.dataset.route === id);
      });
      if (nodesLayer) Array.prototype.forEach.call(nodesLayer.children, function (b) { b.classList.remove('active'); });
      detailPanel.innerHTML =
        '<div class="fw-detail-tag">' + rt.tag + '</div>' +
        '<h4>' + rt.name + '</h4>' +
        '<p>' + rt.summary + '</p>' +
        '<a href="' + rt.source + '" target="_blank" rel="noopener" class="fw-detail-source">Source: ' + rt.sourceLabel + '</a>';
      renderStatic();
      draw();
    }

    /* ── Port Nodes (Ports View) — Sub-Pixel Percentage Anchored ── */
    function buildPortNodeButtons() {
      if (!nodesLayer) return;
      nodesLayer.innerHTML = '';
      ports.forEach(function (pt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-port-node';
        btn.dataset.port = pt.id;
        btn.setAttribute('aria-label', '#' + pt.rank + ' ' + pt.name + ' — ' + pt.teuM + 'M TEU');

        // Exact percentage positioning matching projection math
        var leftPct = ((pt.lon + 180) / 3.6).toFixed(4);
        var topPct = ((78 - pt.lat) / 1.4).toFixed(4);
        btn.style.left = leftPct + '%';
        btn.style.top = topPct + '%';

        btn.innerHTML = '<span class="fw-port-dot">' + pt.rank + '</span><span class="fw-port-label">' + pt.name + ' (' + pt.teuM + 'M TEU)</span>';
        btn.addEventListener('click', function () { selectPort(pt.id); });
        btn.addEventListener('focus', function () { selectPort(pt.id); });
        nodesLayer.appendChild(btn);
      });
    }

    function buildPortChips() {
      if (!routesLayer) return;
      routesLayer.innerHTML = '';
      ports.slice(0, 10).forEach(function (pt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-route-chip';
        btn.dataset.port = pt.id;
        btn.textContent = '#' + pt.rank + ' ' + pt.name;
        btn.addEventListener('click', function () { selectPort(pt.id); });
        routesLayer.appendChild(btn);
      });
    }

    function selectPort(id) {
      var pt = ports.filter(function (p) { return p.id === id; })[0];
      if (!pt || !detailPanel) return;
      selectedPortId = id;
      if (nodesLayer) {
        Array.prototype.forEach.call(nodesLayer.children, function (b) {
          b.classList.toggle('active', b.dataset.port === id);
        });
      }
      if (routesLayer) {
        Array.prototype.forEach.call(routesLayer.children, function (b) {
          b.classList.toggle('active', b.dataset.port === id);
        });
      }
      detailPanel.innerHTML =
        '<div class="fw-detail-tag">World Rank #' + pt.rank + ' · ' + pt.country + '</div>' +
        '<h4>' + pt.name + ' — ' + pt.teuM + ' Million TEU/yr</h4>' +
        '<p>' + pt.summary + '</p>' +
        '<p style="margin-top:-.4rem;font-size:.84rem;color:#00e5ff;"><strong>Key Exports/Cargo:</strong> ' + pt.keyExports + '</p>' +
        '<a href="' + pt.source + '" target="_blank" rel="noopener" class="fw-detail-source">Source: ' + pt.sourceLabel + '</a>';
    }

    /* ── Submarine Cable Chips (Cables View) ── */
    function buildCableChips() {
      if (!routesLayer) return;
      routesLayer.innerHTML = '';
      cables.forEach(function (cb) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-route-chip';
        btn.dataset.cable = cb.id;
        btn.textContent = cb.name;
        btn.addEventListener('click', function () { selectCable(cb.id); });
        routesLayer.appendChild(btn);
      });
    }

    function selectCable(id) {
      var cb = cables.filter(function (c) { return c.id === id; })[0];
      if (!cb || !detailPanel) return;
      selectedCableId = id;
      Array.prototype.forEach.call(routesLayer.children, function (b) {
        b.classList.toggle('active', b.dataset.cable === id);
      });
      detailPanel.innerHTML =
        '<div class="fw-detail-tag">' + cb.tag + ' · Installed ' + cb.yearInstalled + '</div>' +
        '<h4>' + cb.name + ' (' + cb.capacityTbps + ' Tbps · ' + cb.lengthKm.toLocaleString() + ' km)</h4>' +
        '<p>' + cb.summary + '</p>' +
        '<p style="margin-top:-.4rem;font-size:.84rem;color:#00e5ff;"><strong>Landing Stations:</strong> ' + cb.landingStations.join(' · ') + '</p>' +
        '<a href="' + cb.source + '" target="_blank" rel="noopener" class="fw-detail-source">Source: ' + cb.sourceLabel + '</a>';
      renderStatic();
      draw();
    }

    /* ── Live fleet polling ── */
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
      if (liveNoteEl) liveNoteEl.style.display = (ok || activeView !== 'fleetwatch') ? 'none' : 'block';
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
          existing.name = v.name;
          existing.destination = v.destination;
          existing.eta = v.eta;
          existing.isCargo = v.isCargo;
          existing.lastSeen = now;
          existing.fading = false;
        } else {
          shipsById[v.mmsi] = {
            dispLon: v.lon, dispLat: v.lat,
            targetLon: v.lon, targetLat: v.lat,
            chokepoint: v.chokepoint,
            name: v.name, destination: v.destination, eta: v.eta, isCargo: v.isCargo,
            lastSeen: now, fading: false
          };
        }
      });
      Object.keys(shipsById).forEach(function (id) {
        if (!seenIds[id]) shipsById[id].fading = true;
      });

      if (activeView === 'fleetwatch') {
        if (vesselCountEl) vesselCountEl.textContent = data.vesselCount;
        if (busiestEl) busiestEl.textContent = busiestChokepointLabel(data.vessels);
      }

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

    /* ── Animation loop ── */
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

    /* ── Sizing & Distortion-Free Aspect Ratio Canvas Drawing ── */
    function sizeCanvas() {
      dpr = window.devicePixelRatio || 1;
      var cssW = canvas.clientWidth || root.clientWidth;
      // 100% distortion-free equirectangular aspect ratio: 140 / 360 = 0.388888...
      var aspect = LAT_SPAN / LON_SPAN;
      var cssH = Math.round(cssW * aspect);

      canvas.style.height = cssH + 'px';
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      staticCanvas.width = canvas.width;
      staticCanvas.height = canvas.height;
      mapW = cssW;
      mapH = cssH;

      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticCtx = staticCanvas.getContext('2d');
      staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ── Single-Stroke Batched Coastline Rendering ── */
    function renderStatic() {
      if (!coastline || !staticCtx) return;
      var sctx = staticCtx, w = mapW, h = mapH;
      sctx.clearRect(0, 0, w, h);

      // Graticule Grid
      sctx.strokeStyle = 'rgba(200,145,58,.1)';
      sctx.lineWidth = 1;
      for (var gx = 0; gx < w; gx += 60) { sctx.beginPath(); sctx.moveTo(gx, 0); sctx.lineTo(gx, h); sctx.stroke(); }
      for (var gy = 0; gy < h; gy += 60) { sctx.beginPath(); sctx.moveTo(0, gy); sctx.lineTo(w, gy); sctx.stroke(); }

      // BATCHED SINGLE-STROKE COASTLINE: 100% continuous, crisp, no overlapping alpha joints
      sctx.strokeStyle = 'rgba(239,242,241,.85)';
      sctx.lineWidth = 1.2;
      sctx.lineJoin = 'round';
      sctx.lineCap = 'round';
      sctx.beginPath();
      coastline.polylines.forEach(function (line) {
        addGeoPolylinePath(sctx, line, w, h);
      });
      sctx.stroke();

      // Trade Routes (in Fleet Watch view)
      if (activeView === 'fleetwatch') {
        routes.forEach(function (rt) {
          var active = rt.id === selectedRouteId;
          sctx.setLineDash(active ? [] : [3, 4]);
          sctx.strokeStyle = active ? 'rgba(232,184,112,.95)' : 'rgba(232,184,112,.25)';
          sctx.lineWidth = active ? 2.4 : 1.2;
          strokeGeoPolyline(sctx, rt.waypoints, w, h);
          sctx.setLineDash([]);
        });
      }

      // Submarine Cables (in Cables view)
      if (activeView === 'cables') {
        cables.forEach(function (cb) {
          var active = cb.id === selectedCableId;
          sctx.strokeStyle = active ? '#00ffff' : 'rgba(0,229,255,.45)';
          sctx.lineWidth = active ? 2.8 : 1.4;
          strokeGeoPolyline(sctx, cb.waypoints, w, h);

          // Render landing station dots along cable
          if (cb.waypoints) {
            cb.waypoints.forEach(function (pt) {
              var p = project(pt[0], pt[1], w, h);
              sctx.beginPath();
              sctx.arc(p.x, p.y, active ? 3.8 : 2.2, 0, Math.PI * 2);
              sctx.fillStyle = active ? '#ffffff' : 'rgba(0,229,255,.9)';
              sctx.fill();
            });
          }
        });
      }
    }

    function draw() {
      if (!canvas || !coastline || !ctx) return;
      ctx.clearRect(0, 0, mapW, mapH);
      ctx.drawImage(staticCanvas, 0, 0, mapW, mapH);

      // Render live AIS ships only in Fleet Watch view
      if (activeView === 'fleetwatch') {
        Object.keys(shipsById).forEach(function (id) {
          var s = shipsById[id];
          var p = project(s.dispLon, s.dispLat, mapW, mapH);
          var alpha = s.fading ? Math.max(0, 1 - (performance.now() - s.lastSeen) / SHIP_FADE_MS) : 1;
          var r = s.isCargo ? 3.6 : 2.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = s.isCargo ? 'rgba(255,214,145,' + (0.95 * alpha) + ')' : 'rgba(232,184,112,' + (0.75 * alpha) + ')';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(232,184,112,' + ((s.isCargo ? 0.35 : 0.22) * alpha) + ')';
          ctx.stroke();
        });
      }
    }

    function resize() {
      sizeCanvas();
      renderStatic();
      draw();
    }

    function formatEta(eta) {
      if (!eta || !eta.month || !eta.day) return '';
      var pad = function (n) { return n == null ? '--' : String(n).padStart(2, '0'); };
      return pad(eta.month) + '/' + pad(eta.day) + ' ' + pad(eta.hour) + ':' + pad(eta.minute);
    }

    function findShipNear(px, py, w, h) {
      if (activeView !== 'fleetwatch') return null;
      var best = null, bestD2 = 144;
      Object.keys(shipsById).forEach(function (id) {
        var s = shipsById[id];
        var p = project(s.dispLon, s.dispLat, w, h);
        var d2 = (p.x - px) * (p.x - px) + (p.y - py) * (p.y - py);
        if (d2 < bestD2) { bestD2 = d2; best = s; }
      });
      return best;
    }

    /* ── HUD Hover Listener ── */
    if (canvas && hudEl && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      canvas.addEventListener('mousemove', function (e) {
        var rect = canvas.getBoundingClientRect();
        var px = e.clientX - rect.left, py = e.clientY - rect.top;
        var ship = findShipNear(px, py, rect.width, rect.height);
        if (ship) {
          var bits = [ship.name || 'Unnamed vessel', ship.isCargo ? 'Cargo' : 'Vessel'];
          if (ship.destination) bits.push('→ ' + ship.destination);
          var etaStr = formatEta(ship.eta);
          if (etaStr) bits.push('ETA ' + etaStr);
          hudEl.textContent = bits.join(' · ');
        } else {
          var coords = unproject(px, py, rect.width, rect.height);
          var latDir = coords.lat >= 0 ? 'N' : 'S', lonDir = coords.lon >= 0 ? 'E' : 'W';
          hudEl.textContent = Math.abs(coords.lat).toFixed(2) + '°' + latDir + ' · ' + Math.abs(coords.lon).toFixed(2) + '°' + lonDir;
        }
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
