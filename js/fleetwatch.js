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
 *  - assets/data/maritime-news.json — live maritime news RSS feed
 */
(function () {
  var CHOKEPOINTS_URL = 'assets/data/chokepoints.json';
  var COASTLINE_URL = 'assets/data/coastline.json';
  var ROUTES_URL = 'assets/data/routes.json';
  var PORTS_URL = 'assets/data/ports.json';
  var CABLES_URL = 'assets/data/cables.json';
  var FLEET_URL = 'assets/data/fleet-live.json';
  var NEWS_URL = 'assets/data/maritime-news.json';
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

  var zoomScale = 1.0;
  var panX = 0;
  var panY = 0;

  function project(lon, lat, w, h) {
    var basePctX = (lon - MAP_BOUNDS.lonMin) / LON_SPAN;
    var basePctY = (MAP_BOUNDS.latMax - lat) / LAT_SPAN;

    var cx = w / 2;
    var cy = h / 2;

    var px = (basePctX * w - cx) * zoomScale + cx + panX;
    var py = (basePctY * h - cy) * zoomScale + cy + panY;

    return { x: px, y: py };
  }

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
    var liveNote = document.getElementById('fw-live-note');
    var hud = document.getElementById('fw-hud');
    var nodesLayer = document.getElementById('fw-nodes');
    var routesContainer = document.getElementById('fw-routes');
    var portBoatsContainer = document.getElementById('fw-port-boats');
    var fullscreenBtn = document.getElementById('fw-fullscreen-btn');
    var newsToggleBtn = document.getElementById('fw-news-toggle');
    var sideNewsList = document.getElementById('fw-side-news-list');

    if (!canvas) return;

    var chokepoints = [];
    var routes = [];
    var ports = [];
    var cables = [];
    var coastline = null;
    var ships = [];
    var shipMap = {};
    var activeId = null;
    var activeRouteId = null;
    var activePortId = null;
    var activeCableId = null;
    var activeView = 'fleetwatch'; // 'fleetwatch' | 'ports' | 'cables'
    var tierFilter = 'major'; // 'major' | 'all'
    var isLiveFeedAvailable = true;

    // Pan & Zoom Drag state
    var isDragging = false;
    var startX = 0, startY = 0;
    var initialPanX = 0, initialPanY = 0;

    // Fullscreen API toggle
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', function () {
        if (!document.fullscreenElement) {
          if (root.requestFullscreen) root.requestFullscreen();
          else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
      });
    }

    // Side News toggle
    if (newsToggleBtn) {
      newsToggleBtn.addEventListener('click', function () {
        root.classList.toggle('news-open');
      });
    }

    // Load News for Side Ticker
    fetchJSON(NEWS_URL).then(function (newsData) {
      if (sideNewsList && newsData.items && newsData.items.length) {
        sideNewsList.innerHTML = newsData.items.map(function (it) {
          return '<li><a href="' + it.link + '" target="_blank" rel="noopener">' +
            '<strong>[' + it.source + ']</strong> ' + it.title + '</a></li>';
        }).join('');
      }
    }).catch(function () {});

    // Interactive Drag Pan Listeners
    canvas.addEventListener('mousedown', function (e) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialPanX = panX;
      initialPanY = panY;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      panX = initialPanX + dx;
      panY = initialPanY + dy;
      render();
      updateNodePositions();
    });

    window.addEventListener('mouseup', function () {
      if (isDragging) {
        isDragging = false;
        canvas.style.cursor = 'grab';
      }
    });

    // Touch Drag Pan Listeners
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        initialPanX = panX;
        initialPanY = panY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (isDragging && e.touches.length === 1) {
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        panX = initialPanX + dx;
        panY = initialPanY + dy;
        render();
        updateNodePositions();
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function () {
      isDragging = false;
    });

    // Mouse Wheel Zoom
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var zoomFactor = e.deltaY < 0 ? 1.15 : 0.88;
      var newScale = Math.min(Math.max(zoomScale * zoomFactor, 0.8), 4.0);
      if (newScale !== zoomScale) {
        zoomScale = newScale;
        render();
        updateNodePositions();
      }
    }, { passive: false });

    function renderCanvasSize() {
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.clientWidth || root.clientWidth || 960;
      var h = Math.round(w * (140 / 360));
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      return { w: w, h: h, dpr: dpr };
    }

    function render() {
      var s = renderCanvasSize();
      var w = s.w, h = s.h, dpr = s.dpr;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      var bgGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h));
      bgGrad.addColorStop(0, '#061224');
      bgGrad.addColorStop(1, '#02060d');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Coastline Batching
      if (coastline && coastline.features) {
        ctx.beginPath();
        coastline.features.forEach(function (feat) {
          if (feat.geometry) {
            if (feat.geometry.type === 'LineString') {
              addGeoPolylinePath(ctx, feat.geometry.coordinates, w, h);
            } else if (feat.geometry.type === 'MultiLineString') {
              feat.geometry.coordinates.forEach(function (line) {
                addGeoPolylinePath(ctx, line, w, h);
              });
            }
          }
        });
        ctx.strokeStyle = 'rgba(232,184,112,.38)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // Render Trade Routes (Fleet Watch View)
      if (activeView === 'fleetwatch') {
        routes.forEach(function (rt) {
          var isAct = rt.id === activeRouteId;
          ctx.beginPath();
          addGeoPolylinePath(ctx, rt.waypoints, w, h);
          ctx.strokeStyle = isAct ? '#00e5ff' : (rt.color || 'rgba(0,229,255,.4)');
          ctx.lineWidth = isAct ? 2.5 : 1.2;
          if (rt.dashed && !isAct) ctx.setLineDash([4, 4]);
          else ctx.setLineDash([]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      }

      // Render Submarine Cables (Cables View)
      if (activeView === 'cables') {
        cables.forEach(function (cab) {
          var isAct = cab.id === activeCableId;
          ctx.beginPath();
          addGeoPolylinePath(ctx, cab.waypoints, w, h);
          ctx.strokeStyle = isAct ? '#00e5ff' : 'rgba(0,229,255,.55)';
          ctx.lineWidth = isAct ? 3.0 : 1.5;
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = isAct ? 12 : 4;
          ctx.stroke();
          ctx.shadowBlur = 0;
        });
      }

      // Render Ships
      if (activeView === 'fleetwatch') {
        var now = Date.now();
        ships.forEach(function (shp) {
          var pt = project(shp.lon, shp.lat, w, h);
          var age = now - (shp.lastSeen * 1000);
          var alpha = age > STALE_AFTER_MS ? 0.35 : 0.85;

          ctx.fillStyle = 'rgba(0,229,255,' + alpha + ')';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    function updateNodePositions() {
      var s = renderCanvasSize();
      var w = s.w, h = s.h;

      nodesLayer.querySelectorAll('.fw-node').forEach(function (btn) {
        var lon = parseFloat(btn.dataset.lon);
        var lat = parseFloat(btn.dataset.lat);
        var pt = project(lon, lat, w, h);
        btn.style.left = pt.x + 'px';
        btn.style.top = pt.y + 'px';
      });

      nodesLayer.querySelectorAll('.fw-port-node').forEach(function (btn) {
        var lon = parseFloat(btn.dataset.lon);
        var lat = parseFloat(btn.dataset.lat);
        var pt = project(lon, lat, w, h);
        btn.style.left = pt.x + 'px';
        btn.style.top = pt.y + 'px';
      });
    }

    function updateActiveViewUI() {
      if (portBoatsContainer) portBoatsContainer.style.display = activeView === 'ports' ? 'flex' : 'none';
      if (routesContainer) routesContainer.style.display = activeView === 'fleetwatch' ? 'flex' : 'none';

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
        buildPortBoats();
        showDetailPlaceholder('Select a container port on the map to view annual TEU throughput and trade roles.');
      } else if (activeView === 'cables') {
        if (statLbl1) statLbl1.textContent = 'Critical Fiber Cables';
        if (statLbl2) statLbl2.textContent = 'Total Capacity';
        if (vesselCountEl) vesselCountEl.textContent = String(cables.length || 13);
        if (busiestEl) busiestEl.textContent = '~1.8 Pbps';
        nodesLayer.innerHTML = '';
        buildCableChips();
        showDetailPlaceholder('Select a submarine cable to highlight its ocean route, bandwidth, and landing points.');
      }
      render();
    }

    function showDetailPlaceholder(msg) {
      if (detailPanel) {
        detailPanel.innerHTML = '<p class="fw-detail-empty">' + msg + '</p>';
      }
    }

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
        btn.className = 'fw-node' + (secondary ? ' fw-node--secondary' : '') + (cp.id === activeId ? ' active' : '');
        btn.dataset.lon = cp.coordinates.lon;
        btn.dataset.lat = cp.coordinates.lat;
        btn.innerHTML = '<span class="fw-node-dot' + (secondary ? ' fw-node-dot--secondary' : '') + '"></span>' +
          '<span class="fw-node-label">' + cp.name + '</span>';

        btn.addEventListener('click', function () {
          selectChokepoint(cp.id);
        });
        nodesLayer.appendChild(btn);
      });
      updateNodePositions();
    }

    function buildPortNodeButtons() {
      if (!nodesLayer) return;
      nodesLayer.innerHTML = '';

      ports.forEach(function (prt, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fw-port-node' + (prt.id === activePortId ? ' active' : '');
        btn.dataset.lon = prt.coordinates.lon;
        btn.dataset.lat = prt.coordinates.lat;
        btn.innerHTML = '<span class="fw-port-dot">' + (idx + 1) + '</span>' +
          '<span class="fw-port-label">' + prt.name + ' (' + prt.teuMillion + 'M)</span>';

        btn.addEventListener('click', function () {
          selectPort(prt.id);
        });
        nodesLayer.appendChild(btn);
      });
      updateNodePositions();
    }

    function buildPortBoats() {
      if (!portBoatsContainer) return;
      portBoatsContainer.innerHTML = ports.map(function (prt, idx) {
        var isAct = prt.id === activePortId;
        var delay = (idx % 5) * 0.25;
        return '<button type="button" class="fw-boat-btn' + (isAct ? ' active' : '') + '" style="animation-delay:' + delay + 's" data-port-id="' + prt.id + '">' +
          '<svg class="fw-boat-svg" viewBox="0 0 32 28"><path d="M4 18 L28 18 L24 24 L8 24 Z M16 4 L16 18 M16 6 L24 12 L16 12 Z"/></svg>' +
          '<span class="fw-boat-name">' + prt.name + '</span>' +
          '<span class="fw-boat-teu">' + prt.teuMillion + 'M TEU</span>' +
          '</button>';
      }).join('');

      portBoatsContainer.querySelectorAll('.fw-boat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectPort(btn.dataset.portId);
        });
      });
    }

    function buildRouteChips() {
      if (!routesContainer) return;
      routesContainer.innerHTML = routes.map(function (rt) {
        var isAct = rt.id === activeRouteId;
        return '<button type="button" class="fw-route-chip' + (isAct ? ' active' : '') + '" data-route-id="' + rt.id + '">' +
          rt.name + '</button>';
      }).join('');

      routesContainer.querySelectorAll('.fw-route-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectRoute(btn.dataset.routeId);
        });
      });
    }

    function buildCableChips() {
      if (!routesContainer) return;
      routesContainer.innerHTML = cables.map(function (cab) {
        var isAct = cab.id === activeCableId;
        return '<button type="button" class="fw-route-chip' + (isAct ? ' active' : '') + '" data-cable-id="' + cab.id + '">' +
          cab.name + ' (' + cab.capacityTbps + ' Tbps)</button>';
      }).join('');

      routesContainer.querySelectorAll('.fw-route-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectCable(btn.dataset.cableId);
        });
      });
    }

    function selectChokepoint(id) {
      activeId = id;
      activeRouteId = null;
      var cp = chokepoints.find(function (c) { return c.id === id; });
      if (!cp) return;

      zoomScale = 2.0;
      var s = renderCanvasSize();
      var basePt = project(cp.coordinates.lon, cp.coordinates.lat, s.w, s.h);
      panX = s.w / 2 - basePt.x;
      panY = s.h / 2 - basePt.y;

      if (detailPanel) {
        detailPanel.innerHTML = '<span class="fw-detail-tag">Chokepoint Profile · ' + (cp.tier === 'major' ? 'Major' : 'Secondary') + '</span>' +
          '<h4>' + cp.name + '</h4>' +
          '<p>' + cp.description + '</p>' +
          '<div style="font-size:.82rem;color:rgba(239,242,241,.85)">' +
          '<strong>Key Volume:</strong> ' + cp.volumeNote + '<br>' +
          '<strong>Strategic Risk:</strong> ' + cp.strategicRisk +
          '</div>';
      }
      render();
      buildNodeButtons();
    }

    function selectPort(id) {
      activePortId = id;
      var prt = ports.find(function (p) { return p.id === id; });
      if (!prt) return;

      zoomScale = 2.4;
      var s = renderCanvasSize();
      var basePt = project(prt.coordinates.lon, prt.coordinates.lat, s.w, s.h);
      panX = s.w / 2 - basePt.x;
      panY = s.h / 2 - basePt.y;

      if (detailPanel) {
        detailPanel.innerHTML = '<span class="fw-detail-tag">World Container Port · Rank #' + prt.rank + '</span>' +
          '<h4>' + prt.name + ' (' + prt.country + ')</h4>' +
          '<p>' + prt.description + '</p>' +
          '<div style="font-size:.82rem;color:rgba(239,242,241,.85)">' +
          '<strong>Annual Throughput:</strong> ' + prt.teuMillion + ' Million TEU<br>' +
          '<strong>Primary Trade Role:</strong> ' + prt.tradeRole +
          '</div>';
      }
      render();
      buildPortNodeButtons();
      buildPortBoats();
    }

    function selectRoute(id) {
      activeRouteId = id;
      activeId = null;
      var rt = routes.find(function (r) { return r.id === id; });
      if (!rt) return;

      if (detailPanel) {
        detailPanel.innerHTML = '<span class="fw-detail-tag">Major Global Trade Route</span>' +
          '<h4>' + rt.name + '</h4>' +
          '<p>' + rt.description + '</p>';
      }
      render();
      buildRouteChips();
    }

    function selectCable(id) {
      activeCableId = id;
      var cab = cables.find(function (c) { return c.id === id; });
      if (!cab) return;

      if (detailPanel) {
        detailPanel.innerHTML = '<span class="fw-detail-tag">Critical Submarine Telecom Cable</span>' +
          '<h4>' + cab.name + ' (' + cab.capacityTbps + ' Tbps)</h4>' +
          '<p>' + cab.description + '</p>' +
          '<div style="font-size:.82rem;color:rgba(239,242,241,.85)">' +
          '<strong>System Length:</strong> ' + cab.lengthKm.toLocaleString() + ' km<br>' +
          '<strong>Landing Stations:</strong> ' + cab.landingPoints.join(', ') +
          '</div>';
      }
      render();
      buildCableChips();
    }

    // Load All Datasets
    Promise.all([
      fetchJSON(CHOKEPOINTS_URL),
      fetchJSON(COASTLINE_URL),
      fetchJSON(ROUTES_URL),
      fetchJSON(PORTS_URL),
      fetchJSON(CABLES_URL)
    ]).then(function (results) {
      chokepoints = results[0].chokepoints || [];
      coastline = results[1];
      routes = results[2].routes || [];
      ports = results[3].ports || [];
      cables = results[4].cables || [];

      // View Tab Switcher Listeners
      var tabs = document.querySelectorAll('#fw-view-tabs .fw-tab');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          activeView = tab.dataset.view;
          updateActiveViewUI();
        });
      });

      // Filter Toggle Listeners
      var filterBtns = document.querySelectorAll('#fw-filter-toggle .fw-filter-btn');
      filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          filterBtns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          tierFilter = btn.dataset.filter;
          if (activeView === 'fleetwatch') buildNodeButtons();
        });
      });

      updateActiveViewUI();
      window.addEventListener('resize', function () {
        render();
        updateNodePositions();
      });
    }).catch(function (err) {
      console.warn('[fleetwatch] initialization error:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
