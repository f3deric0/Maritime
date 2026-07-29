/**
 * maritime-news.js
 * Fetches assets/data/maritime-news.json once (regenerated on the VPS
 * every ~20-30 min by scripts/fetch-maritime-news.py via cron — see
 * deploy.md) and renders it as a simple headline list on insights.html.
 * Headlines/links only, real maritime trade-press RSS feeds, attributed
 * and linked back to the source — no full-article reproduction.
 */
(function () {
  var NEWS_URL = 'assets/data/maritime-news.json';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(ts) {
    if (!ts) return '';
    try {
      return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  var BOAT_SVG = '<svg class="news-boat-svg" viewBox="0 0 36 32" aria-hidden="true">' +
    '<path d="M4 20 L32 20 L27 27 L9 27 Z" />' +
    '<line x1="18" y1="4" x2="18" y2="20" />' +
    '<path d="M18 5 L28 13 L18 13 Z" /></svg>';

  function renderFeatured(el, items) {
    if (!el) return;
    el.innerHTML = items.map(function (it, idx) {
      var dateStr = formatDate(it.publishedAt);
      return '<a class="news-boat-card" style="animation-delay:' + (idx * 0.5).toFixed(2) + 's" ' +
        'href="' + it.link + '" target="_blank" rel="noopener">' +
        BOAT_SVG +
        '<span class="news-boat-source">' + escapeHtml(it.source) + '</span>' +
        '<span class="news-boat-title">' + escapeHtml(it.title) + '</span>' +
        (dateStr ? '<span class="news-boat-date">' + dateStr + '</span>' : '') +
        '</a>';
    }).join('');
  }

  function init() {
    var list = document.getElementById('news-list');
    var featured = document.getElementById('news-featured');
    if (!list) return; // not on this page

    fetch(NEWS_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.items || !data.items.length) throw new Error('no items');
        // Top 3 headlines get the "front row" boat-card treatment; the
        // rest render as the plain list below, as before.
        renderFeatured(featured, data.items.slice(0, 3));
        var rest = data.items.slice(3);
        list.innerHTML = rest.map(function (it) {
          var dateStr = formatDate(it.publishedAt);
          return '<li class="news-item"><a href="' + it.link + '" target="_blank" rel="noopener">' +
            '<span class="news-source">' + escapeHtml(it.source) + '</span>' +
            '<span class="news-title">' + escapeHtml(it.title) + '</span>' +
            (dateStr ? '<span class="news-date">' + dateStr + '</span>' : '') +
            '</a></li>';
        }).join('');
      })
      .catch(function () {
        if (featured) featured.innerHTML = '';
        list.innerHTML = '<li class="news-item-empty">Latest headlines temporarily unavailable.</li>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
