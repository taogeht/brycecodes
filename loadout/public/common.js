// Shared by index.html (Edward) and hq.html (parent): API client, Taipei
// date helpers, a tiny History router, and the inline stroke icon set.
// No emoji anywhere — icons are SVG only.
(function () {
  'use strict';
  const BASE = '/loadout';
  const API = '/api/loadout';
  const TZ = 'Asia/Taipei';

  // ── API ──────────────────────────────────────────────────────────────
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  // ── Dates (Taipei) ───────────────────────────────────────────────────
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function todayKey() { return keyFmt.format(new Date()); }
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const DAY_LONG = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function parts(key) { const [y, m, d] = key.split('-').map(Number); return { y, m, d }; }
  function weekday(key) { const p = parts(key); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; }
  function addDays(key, n) {
    const p = parts(key); const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }
  function mondayOf(key) { return addDays(key, -((DAYS.indexOf(weekday(key)) + 6) % 7)); }
  // "Fri 19 Sep"
  function fmtDate(key, { long = false } = {}) {
    const p = parts(key); const wd = weekday(key);
    return (long ? DAY_LONG[wd] : DAY_LABEL[wd]) + ' ' + p.d + ' ' + MONTHS[p.m - 1];
  }
  function relDay(key) {
    const t = todayKey();
    if (key === t) return 'Today';
    if (key === addDays(t, 1)) return 'Tomorrow';
    if (key === addDays(t, -1)) return 'Yesterday';
    return fmtDate(key);
  }
  // "15:41" from an ISO string with offset — show the wall-clock in the offset given.
  function fmtTime(iso) { return iso ? iso.slice(11, 16) : ''; }
  function isSchoolDay(key) { return !['sat', 'sun'].includes(weekday(key)); }
  function nextSchoolDay(key) { let k = addDays(key, 1); while (!isSchoolDay(k)) k = addDays(k, 1); return k; }

  // ── DOM ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function el(sel) { return document.querySelector(sel); }
  function on(root, event, selector, fn) {
    root.addEventListener(event, e => {
      const t = e.target.closest(selector);
      if (t && root.contains(t)) fn(e, t);
    });
  }

  // ── Router (History API, base /loadout) ──────────────────────────────
  function path() {
    let p = location.pathname;
    if (p.startsWith(BASE)) p = p.slice(BASE.length);
    return p.replace(/\/+$/, '') || '/';
  }
  function go(p, { replace = false } = {}) {
    const url = BASE + (p === '/' ? '/' : p);
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    window.dispatchEvent(new Event('routechange'));
  }
  function href(p) { return BASE + (p === '/' ? '/' : p); }
  function linkify(root) {
    on(root, 'click', 'a[data-link]', (e, a) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); go(a.getAttribute('href').slice(BASE.length) || '/');
    });
  }
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('routechange')));

  // ── Icons (24px viewBox, stroke, currentColor) ───────────────────────
  const ICONS = {
    bag: '<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 9-12h-6l1-6z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M9.8 10.2c0-1 1-1.7 2.2-1.7s2.2.6 2.2 1.5c0 2.3-4.4 1.2-4.4 3.5 0 .9 1 1.6 2.2 1.6s2.2-.7 2.2-1.6"/>',
    screen: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 20h8M12 17v3"/>',
    flame: '<path d="M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 12 16a4 4 0 0 1-4-4.5c0-1.5.5-2.5 1.2-3.3.3 1.3 1 2 1.8 2.3C11 8 11.5 5 12 3z"/><path d="M8 12.5A6 6 0 0 0 12 21a6 6 0 0 0 4-8.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9z"/>',
    vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="4"/><path d="M12 10v2l1.5 1.5"/>',
    log: '<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    print: '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.4l-5.6 2.9 1.1-6.2L3 9.7l6.2-.9L12 3z"/>',
    sword: '<path d="M14.5 4.5L20 10l-9 9-2-2 9-9-5.5-5.5"/><path d="M4 20l3-3M5 15l4 4"/>',
    eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
  };
  function icon(name, size = 20, cls = '') {
    return '<svg class="ic ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  window.L = { BASE, API, api, todayKey, weekday, addDays, mondayOf, fmtDate, relDay, fmtTime, isSchoolDay, nextSchoolDay,
    DAY_LABEL, DAY_LONG, esc, el, on, path, go, href, linkify, icon };
})();
