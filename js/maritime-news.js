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

  function init() {
    var list = document.getElementById('news-list');
    if (!list) return; // not on this page

    fetch(NEWS_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.items || !data.items.length) throw new Error('no items');
        list.innerHTML = data.items.map(function (it) {
          var dateStr = formatDate(it.publishedAt);
          return '<li class="news-item"><a href="' + it.link + '" target="_blank" rel="noopener">' +
            '<span class="news-source">' + escapeHtml(it.source) + '</span>' +
            '<span class="news-title">' + escapeHtml(it.title) + '</span>' +
            (dateStr ? '<span class="news-date">' + dateStr + '</span>' : '') +
            '</a></li>';
        }).join('');
      })
      .catch(function () {
        list.innerHTML = '<li class="news-item-empty">Latest headlines temporarily unavailable.</li>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
