/*! Namlo widget 0.8.0
 * The Namlo feedback widget, added by the Namlo plugin for Araniko.
 * Lets people using this app report a bug, ask for a feature or share an idea,
 * and follow what happened to what they sent under "My requests".
 *
 * Talks to one place only: the Namlo API (https://namlo-api.subaz.workers.dev by default).
 * Sends: the type, the message, up to 3 screenshots if the person adds them (shrunk in the browser
 * first), an email if the person gives one (or the signed-in account's,
 * when they ask for updates), the page address and the browser name.
 * Keeps one random id in this browser's localStorage ("namlo:reporter") so a person
 * can see their own requests, their last "email me updates" choice ("namlo:updates"), and the
 * owner's button settings ("namlo:look:<site key>") so the button looks right before they load.
 * An unsent message is kept in sessionStorage ("namlo:draft") only while someone goes to log in.
 * No cookies, no tracking, no fonts or files from other sites.
 *
 * Setup: <script src="/namlo-widget.js" data-site-key="pk_..." defer></script>
 * Options (data- attributes on the script tag):
 *   data-site-key   required, the project's public Namlo key. Empty = the widget stays hidden.
 *   data-label      button text, default "Feedback"
 *   data-position   "bottom-right" (default) or "bottom-left"
 *   data-email      "optional" (default) or "off": offer email updates at all
 *   data-login-url  the app's log-in page; people who aren't signed in are offered it instead of an email box
 *   data-user-id, data-user-email, data-user-name   the signed-in person, for server-rendered pages
 *   data-button     "show" (default) or "hide" (use your own button: any element with data-namlo-open)
 *   data-style      "box" (default: the logo and the label) or "logo" (just the floating logo)
 *   data-radius     the button's corners: "square" (default), "soft" (8px), "round" (14px),
 *                   "pill" (fully round; a circle for the logo-only button), or a number of pixels
 *   data-theme      "auto" (default), "light" or "dark"
 *   data-api        API address, default https://namlo-api.subaz.workers.dev
 * The owner's settings in Araniko (synced through the Namlo API) win over these attributes.
 * From code: window.Namlo.open("bug" | "feature" | "idea"), window.Namlo.close(),
 *   window.Namlo.identify({ id, email, name }) after sign-in, window.Namlo.identify(null) after sign-out.
 *   window.Namlo.wall("Exporting needs the Pro plan") wherever the app stops someone (an upgrade,
 *   install or update prompt, a missing permission, a feature that isn't there yet).
 *   Or set window.NamloConfig = { user: { id, email, name } } before this script loads.
 */
(function () {
  'use strict';
  if (window.Namlo && window.Namlo.__loaded) return;

  var script = document.currentScript || document.querySelector('script[data-site-key]');
  var cfg = {};
  function attr(name, fallback) {
    var v = script && script.getAttribute('data-' + name);
    return v === null || v === undefined || v === '' ? fallback : v;
  }
  var pre = window.NamloConfig || {};
  cfg.siteKey = String(pre.siteKey || attr('site-key', '')).trim();
  cfg.label = pre.label || attr('label', 'Feedback');
  cfg.position = (pre.position || attr('position', 'bottom-right')) === 'bottom-left' ? 'left' : 'right';
  cfg.email = (pre.email || attr('email', 'optional')) === 'off' ? false : true;
  cfg.button = (pre.button || attr('button', 'show')) !== 'hide';
  cfg.style = (pre.style || attr('style', 'box')) === 'logo' ? 'logo' : 'box';
  function radiusOf(r) {
    r = String(r).trim().toLowerCase();
    var named = { square: '0px', soft: '8px', round: '14px', rounded: '14px', pill: '999px', circle: '999px' };
    if (named[r]) return named[r];
    var n = parseFloat(r);
    return isFinite(n) && n >= 0 ? Math.min(n, 999) + 'px' : '0px';
  }
  cfg.radius = radiusOf(pre.radius !== undefined ? pre.radius : attr('radius', 'square'));
  cfg.theme = pre.theme || attr('theme', 'auto');
  cfg.loginUrl = pre.loginUrl || attr('login-url', '');
  function cleanUser(u) {
    if (!u || typeof u !== 'object') return null;
    var out = {
      id: u.id === undefined || u.id === null ? '' : String(u.id).slice(0, 200),
      email: typeof u.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email.trim()) ? u.email.trim().slice(0, 200) : '',
      name: typeof u.name === 'string' ? u.name.trim().slice(0, 80) : ''
    };
    return out.id || out.email ? out : null;
  }
  var user = cleanUser(pre.user || (attr('user-id', '') || attr('user-email', '') ? { id: attr('user-id', ''), email: attr('user-email', ''), name: attr('user-name', '') } : null));
  cfg.api = String(pre.api || attr('api', 'https://namlo-api.subaz.workers.dev')).replace(/\/+$/, '');
  // What the page's own attributes say; the owner's settings from Araniko (see applyLook) win over them.
  var base = { label: cfg.label, position: cfg.position, email: cfg.email, button: cfg.button, style: cfg.style, radius: cfg.radius, loginUrl: cfg.loginUrl };

  if (!/^pk_[a-f0-9]{8,}$/.test(cfg.siteKey)) {
    if (window.console) console.info('[Namlo] No site key yet, so the feedback button is hidden. Connect Namlo from its tab in Araniko.');
    window.Namlo = { __loaded: true, open: function () {}, close: function () {}, identify: function () {}, wall: function () {} };
    return;
  }

  var VERSION = '0.8.0';

  // ---------- the trail: what happened before someone sends feedback ----------
  // Kept in this browser tab only ("namlo:trail" in sessionStorage): the last 30 minutes, at most 60
  // events. Pages visited, errors, failed requests, walls the app reports with Namlo.wall(), and
  // repeated clicks. Never typed text, form values, request or response bodies, query strings or
  // tokens. It leaves the browser only with a feedback message (the person can untick it), and as
  // "walls" (errors, failed requests, blocks, repeated clicks) if the owner keeps that on.
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  var TRAIL_KEY = 'namlo:trail', TRAIL_MAX = 60, TRAIL_AGE = 30 * 60 * 1000;
  var trail = (function () {
    try { var t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'); return Array.isArray(t) ? t : []; } catch (e) { return []; }
  })();
  function scrub(text, max) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/\b(bearer|token|key|secret|password|pwd|auth)\b\s*[=:]?\s*[A-Za-z0-9._~+\/-]{8,}=*/gi, '$1 [hidden]')
      .replace(/\?[^\s)'"]*/g, '')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
      .replace(/\d{7,}/g, '[number]')
      .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, max || 300);
  }
  // A page or request address without its query string; the route too for apps that use #/ routes.
  function cleanUrl(u) {
    try {
      var x = new URL(String(u), location.href);
      var route = /^#!?\//.test(x.hash) ? x.hash.split('?')[0] : '';
      return scrub((x.origin === location.origin ? '' : x.origin) + x.pathname + route, 200);
    } catch (e) { return ''; }
  }
  function here() { return cleanUrl(location.href); }
  function saveTrail() { try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail)); } catch (e) { /* ignore */ } }
  function remember(ev) {
    if (!ev.m) return;
    ev.t = Date.now();
    var last = trail[trail.length - 1];
    if (last && last.k === ev.k && last.m === ev.m && last.u === ev.u && ev.t - last.t < 60000) { last.n = (last.n || 1) + 1; last.t = ev.t; }
    else trail.push(ev);
    var cut = ev.t - TRAIL_AGE;
    while (trail.length && (trail.length > TRAIL_MAX || trail[0].t < cut)) trail.shift();
    saveTrail();
    reportWall(ev);
  }
  function recentTrail() { var cut = Date.now() - TRAIL_AGE; return trail.filter(function (e) { return e.t >= cut; }); }
  function fromNamlo(u) { return String(u || '').indexOf(cfg.api) === 0; }

  // Errors in the page's code, and files that failed to load.
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName) {
      var src = el.src || el.href;
      if (src && !fromNamlo(src)) remember({ k: 'request', m: 'Could not load ' + el.tagName.toLowerCase() + ' ' + cleanUrl(src), u: here() });
      return;
    }
    if (/namlo-widget/.test(e.filename || '')) return;
    var stack = e.error && e.error.stack ? e.error.stack : (e.filename ? cleanUrl(e.filename) + ':' + e.lineno : '');
    remember({ k: 'error', m: scrub(e.message || 'Script error'), u: here(), d: scrub(stack, 1000) });
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    if (r && r.name === 'AbortError') return;
    remember({ k: 'error', m: scrub('Unhandled: ' + (r && r.message ? r.message : r)), u: here(), d: scrub(r && r.stack, 1000) });
  });
  // console.error, as the app logged it (kept in the trail only, not reported as a wall).
  if (window.console && console.error) {
    var nativeError = console.error;
    console.error = function () {
      try {
        var text = Array.prototype.map.call(arguments, function (a) {
          if (a && a.message) return a.message;
          if (a && typeof a === 'object') { try { return JSON.stringify(a).slice(0, 200); } catch (x) { return '[object]'; } }
          return String(a);
        }).join(' ');
        remember({ k: 'console', m: scrub(text), u: here() });
      } catch (x) { /* never break the app's own logging */ }
      return nativeError.apply(console, arguments);
    };
  }
  // Requests the app made that failed or came back with an error status. Only the method, the
  // address (no query) and the status are kept.
  function requestWall(method, url, status, why) {
    if (fromNamlo(url)) return;
    var m = String(method || 'GET').toUpperCase() + ' ' + cleanUrl(url) + (status ? ' answered ' + status : ' failed' + (why ? ' (' + scrub(why, 80) + ')' : ''));
    remember({ k: 'request', m: m, u: here(), s: status || undefined });
  }
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || 'GET';
      var p = nativeFetch(input, init);
      if (fromNamlo(url)) return p;
      return p.then(function (r) { if (r.status >= 400) requestWall(method, url, r.status); return r; },
        function (err) { if (!err || err.name !== 'AbortError') requestWall(method, url, 0, err && err.message); throw err; });
    };
  }
  if (window.XMLHttpRequest) {
    var xOpen = XMLHttpRequest.prototype.open, xSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) { this.__namlo = { m: method, u: url }; return xOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var x = this, info = x.__namlo;
      if (info && !fromNamlo(info.u)) {
        x.addEventListener('load', function () { if (x.status >= 400) requestWall(info.m, info.u, x.status); });
        x.addEventListener('error', function () { requestWall(info.m, info.u, 0, 'network error'); });
      }
      return xSend.apply(this, arguments);
    };
  }
  // Pages, including in-app navigation.
  var lastPage = '';
  function pageView() { var p = here(); if (p && p !== lastPage) { lastPage = p; remember({ k: 'page', m: p, u: p }); } }
  ['pushState', 'replaceState'].forEach(function (f) {
    var orig = history[f];
    if (orig) history[f] = function () { var r = orig.apply(this, arguments); setTimeout(pageView, 0); return r; };
  });
  window.addEventListener('popstate', pageView);
  window.addEventListener('hashchange', pageView);
  // Repeated clicks on the same spot: often something that looks clickable but does nothing.
  function describe(el) {
    if (!el || !el.tagName) return 'the page';
    var tag = el.tagName.toLowerCase();
    var name = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') ||
      (/^(input|textarea|select)$/.test(tag) ? el.getAttribute('name') || '' : (el.textContent || ''));
    name = scrub(name, 40);
    return name ? tag + ' "' + name + '"' : tag;
  }
  var clicks = [];
  document.addEventListener('click', function (e) {
    if (host && e.target === host) return;
    var now = Date.now();
    clicks = clicks.filter(function (c) { return now - c.t < 1200 && Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30; });
    clicks.push({ t: now, x: e.clientX, y: e.clientY });
    if (clicks.length === 4) remember({ k: 'rage', m: 'Clicked ' + describe(e.target) + ' again and again', u: here() });
  }, true);

  // ---------- walls, reported as they happen (when the owner keeps that on) ----------
  var wallsOn = null, wallQueue = [], wallTimer = null;
  var WALL_SENT_KEY = 'namlo:walls-sent';
  var wallSent = (function () { try { return JSON.parse(sessionStorage.getItem(WALL_SENT_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  function reportWall(ev) {
    if (ev.k === 'page' || ev.k === 'console' || wallsOn === false) return;
    var key = ev.k + '|' + ev.m;
    if (wallSent[key] && Date.now() - wallSent[key] < 10 * 60 * 1000) return;   // once per 10 minutes per tab
    wallSent[key] = Date.now();
    try { sessionStorage.setItem(WALL_SENT_KEY, JSON.stringify(wallSent)); } catch (e) { /* ignore */ }
    wallQueue.push({ k: ev.k, m: ev.m, u: ev.u, s: ev.s, d: ev.d });
    if (wallQueue.length > 30) wallQueue.shift();
    if (!wallTimer) wallTimer = setTimeout(flushWalls, 4000);
  }
  function flushWalls() {
    wallTimer = null;
    if (wallsOn === false) { wallQueue = []; return; }
    if (wallsOn !== true || !wallQueue.length || !nativeFetch) return;
    var batch = wallQueue.splice(0, 10);
    try {
      nativeFetch(cfg.api + '/v1/walls', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_key: cfg.siteKey, reporter_id: reporterId(), v: VERSION, walls: batch }) }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
    if (wallQueue.length) wallTimer = setTimeout(flushWalls, 4000);
  }
  window.addEventListener('pagehide', flushWalls);
  // The app's own walls: "you need the Pro plan", "install the desktop app to do this", and so on.
  function wall(message, opts) {
    remember({ k: 'wall', m: scrub(message), u: here(), d: opts && opts.detail ? scrub(opts.detail, 1000) : undefined });
  }
  pageView();
  var ICONS = /* Hugeicons, MIT licence */ {"BubbleChat":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M12 21.5C17.2467 21.5 21.5 17.2467 21.5 12C21.5 6.75329 17.2467 2.5 12 2.5C6.75329 2.5 2.5 6.75329 2.5 12C2.5 13.3377 2.66372 14.5604 3.1189 15.6954C3.81756 17.4374 3.68195 18.9241 2.5 20.5C3.86146 21.1644 5.86811 21.1419 7 20.0725C8.45323 20.9748 10.1636 21.5 12 21.5Z\" stroke=\"currentColor\" stroke-linecap=\"square\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.2 12.0002H12M7.69961 11.9999H7.49961M16.6996 11.9999H16.4996M12.4 12.0002C12.4 12.2212 12.2209 12.4002 12 12.4002C11.7791 12.4002 11.6 12.2212 11.6 12.0002C11.6 11.7793 11.7791 11.6002 12 11.6002C12.2209 11.6002 12.4 11.7793 12.4 12.0002ZM7.89961 11.9999C7.89961 12.2208 7.72052 12.3999 7.49961 12.3999C7.2787 12.3999 7.09961 12.2208 7.09961 11.9999C7.09961 11.7789 7.2787 11.5999 7.49961 11.5999C7.72052 11.5999 7.89961 11.7789 7.89961 11.9999ZM16.8996 11.9999C16.8996 12.2208 16.7205 12.3999 16.4996 12.3999C16.2787 12.3999 16.0996 12.2208 16.0996 11.9999C16.0996 11.7789 16.2787 11.5999 16.4996 11.5999C16.7205 11.5999 16.8996 11.7789 16.8996 11.9999Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","Bug01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M3.01309 4.99084C2.89323 6.05084 3.55249 8.42285 6.48923 8.42285\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M17.5951 8.38081C18.8357 8.57881 21.1132 7.49881 20.9957 5.00281\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M20.9928 20.9989C21.0528 19.9429 20.1777 17.5549 17.599 17.4229\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M6.45163 17.4708C5.65013 17.2308 3.01306 18.3348 3.01306 20.9988\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M9.3299 6.11884C9.35388 5.09884 9.84533 2.99884 12.0029 2.99884C13.9208 2.99884 14.5861 4.61884 14.676 6.11884M6.26131 9.41884C6.38118 8.63884 7.29216 6.81484 9.36586 6.63484C11.4635 6.55564 14.3403 6.58684 14.8797 6.67084C15.5869 6.73377 17.2951 7.43884 17.7506 9.41884C17.9124 10.4388 17.8285 11.8788 17.8524 12.7188C17.8165 13.5588 17.9207 15.2623 17.7565 16.1388C17.6367 17.0988 16.9894 18.4668 16.1024 19.3068C14.7838 20.7228 11.1639 22.2108 8.03534 19.4508C6.41713 17.8908 6.30925 16.3788 6.18939 15.7788C6.15725 15.4571 6.15875 13.8763 6.16541 12.3588C6.14144 11.046 6.17235 9.78063 6.26131 9.41884Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M3.01306 12.8988H5.9498\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M20.9929 12.8988L18.1161 12.8988\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M12.0033 16.4988L12.0033 20.2788\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/></svg>","Sparkles":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M15 2L15.5387 4.39157C15.9957 6.42015 17.5798 8.00431 19.6084 8.46127L22 9L19.6084 9.53873C17.5798 9.99569 15.9957 11.5798 15.5387 13.6084L15 16L14.4613 13.6084C14.0043 11.5798 12.4202 9.99569 10.3916 9.53873L8 9L10.3916 8.46127C12.4201 8.00431 14.0043 6.42015 14.4613 4.39158L15 2Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7 12L7.38481 13.7083C7.71121 15.1572 8.84275 16.2888 10.2917 16.6152L12 17L10.2917 17.3848C8.84275 17.7112 7.71121 18.8427 7.38481 20.2917L7 22L6.61519 20.2917C6.28879 18.8427 5.15725 17.7112 3.70827 17.3848L2 17L3.70827 16.6152C5.15725 16.2888 6.28879 15.1573 6.61519 13.7083L7 12Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","Idea01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M8 16.4998C6.7725 15.4011 6 13.7768 6 11.9998C6 8.68605 8.68629 5.99976 12 5.99976C15.3137 5.99976 18 8.68605 18 11.9998C18 13.7768 17.2275 15.4011 16 16.4998\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M12 11.9998V16.4998\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.5 18.9998H14.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M10.5 21.4998H13.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M3.5 11.9998H2.5M5.98438 5.97632L5.23438 5.23022M18.0195 5.97632L18.7695 5.23022M21.5 11.9998H20.5M12 2.49976V3.49976\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","Cancel01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M18.9991 19L5 5.00098\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19 5L5.00092 18.999\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","ArrowLeft01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","ArrowRight01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","CheckmarkCircle02":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M8 12.5L10.5 15L16 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>","ImageAdd01":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" width=\"1em\" height=\"1em\" fill=\"none\" aria-hidden=\"true\"><path d=\"M11.5085 2.9903C7.02567 2.9903 4.78428 2.9903 3.39164 4.38238C1.99902 5.77447 1.99902 8.015 1.99902 12.4961C1.99902 16.9771 1.99902 19.2176 3.39164 20.6098C4.78428 22.0018 7.02567 22.0018 11.5085 22.0018C15.9912 22.0018 18.2326 22.0018 19.6253 20.6098C21.0179 19.2176 21.0179 16.9771 21.0179 12.4961V11.9958\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M4.99902 20.9898C9.209 16.2385 13.9402 9.93727 20.999 14.6632\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M17.9958 1.99829V10.0064M22.0014 5.97728L13.9902 5.99217\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></svg>"};
  var MARK_PATH = 'M96.3 388.9C66.8 385.5 34.5 370.1 9.6 347.7L2.0 340.8L16.1 327.2C36.5 307.6 55.0 287.1 97.2 237.5C122.8 207.3 127.3 202.0 138.6 188.5C144.6 181.3 152.2 172.3 155.5 168.4C158.8 164.6 167.3 154.5 174.5 146.0C196.8 119.6 221.8 91.3 234.4 78.2C278.8 32.1 324.0 9.8 386.2 3.1C399.4 1.6 543.1 1.6 557.6 3.1C580.6 5.4 604.5 12.0 621.0 20.6C647.3 34.4 673.0 61.7 713.1 118.0C719.1 126.4 737.9 153.8 767.5 197.2C800.7 245.8 821.7 275.5 834.1 291.3C855.8 318.9 875.7 340.5 891.5 353.8C896.5 357.9 900.9 361.7 901.4 362.1C902.4 363.0 887.7 371.7 877.3 376.3C856.3 385.5 837.9 389.4 815.0 389.4C789.6 389.5 770.2 384.8 747.9 373.4C704.0 351.0 673.0 317.4 603.7 217.5C538.2 123.2 513.1 93.8 478.1 70.5L468.0 63.8L475.3 58.2C504.5 35.6 536.1 21.5 566.3 17.6C578.5 15.9 581.4 14.9 571.8 15.6C518.7 19.4 476.3 42.8 427.2 95.3C400.3 124.1 377.0 153.4 309.2 244.5C277.6 286.9 261.8 306.9 246.4 324.0C201.6 374.0 152.1 395.4 96.3 388.9Z';
  function mark(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 904 392" aria-hidden="true">' +
      '<defs><linearGradient id="namlo-g" x1="0" y1="1" x2="1" y2="0.6">' +
      '<stop offset="0" stop-color="#E0391A"/><stop offset=".45" stop-color="#FF6215"/><stop offset="1" stop-color="#FFF28E"/>' +
      '</linearGradient></defs><path fill="url(#namlo-g)" d="' + MARK_PATH + '"/></svg>';
  }

  var TYPES = [
    { id: 'bug', label: 'Bug', hint: 'Something is broken', icon: 'Bug01', placeholder: 'What happened? What did you expect to happen?' },
    { id: 'feature', label: 'Feature', hint: 'Something you need', icon: 'Sparkles', placeholder: 'What would you like to be able to do?' },
    { id: 'idea', label: 'Idea', hint: 'Anything else', icon: 'Idea01', placeholder: 'Tell us what you are thinking.' }
  ];
  var TRAIL_WORDS = { page: 'Page', error: 'Error', console: 'Logged', request: 'Request', wall: 'Blocked', rage: 'Clicks' };
  var STATUS = {
    'new': 'Received', planned: 'Planned', in_progress: 'Being worked on', shipped: 'Done', closed: 'Closed', wont_build: 'Won\'t be built'
  };

  // ---------- reporter id ----------
  var memoryId = null;
  function reporterId() {
    var id = null;
    try { id = localStorage.getItem('namlo:reporter'); } catch (e) { id = memoryId; }
    if (!id || !/^r_[a-f0-9]{32}$/.test(id)) {
      var b = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(b);
      id = 'r_' + Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      try { localStorage.setItem('namlo:reporter', id); } catch (e) { memoryId = id; }
    }
    return id;
  }

  // ---------- styles (the namlo.si look: near-black, square edges, white buttons, orange accent, mono labels) ----------
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.w{--bg:#08090B;--fg:#ffffff;--soft:rgba(255,255,255,.8);--muted:rgba(255,255,255,.45);--line:rgba(255,255,255,.1);--fill:rgba(255,255,255,.05);',
    '--btn:#ffffff;--btn-fg:#000000;--accent:#FF6215;--ok:#FFF28E;--err:#FF8A65;--hatch:rgba(255,255,255,.12);--glow:rgba(255,98,21,.22);',
    '--sans:"Inter Tight","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;--mono:"Fragment Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;',
    'position:fixed;z-index:2147483000;bottom:20px;color:var(--fg);font:14px/1.45 var(--sans);-webkit-font-smoothing:antialiased}',
    '.w.light{--bg:#ffffff;--fg:#08090B;--soft:rgba(8,9,11,.8);--muted:rgba(8,9,11,.5);--line:rgba(8,9,11,.12);--fill:rgba(8,9,11,.04);',
    '--btn:#08090B;--btn-fg:#ffffff;--accent:#E5530C;--ok:#1F7A45;--err:#C23B1A;--hatch:rgba(8,9,11,.1);--glow:rgba(255,98,21,.12)}',
    '.w.right{right:20px}.w.left{left:20px}',
    'button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}',
    'button:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    /* launcher */
    '.fab{display:flex;align-items:center;gap:10px;height:44px;padding:0 16px 0 14px;background:#08090B;color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.2);font-weight:500;letter-spacing:-.01em}',
    '.fab:hover{border-color:rgba(255,98,21,.6)}',
    '.fab{border-radius:var(--fab-radius,0)}',
    '.fab.logo{width:52px;height:52px;padding:0;justify-content:center}',
    '.fab.logo .mk{width:30px}',
    '.fab.logo .x{font-size:20px}',
    '.fab .mk{width:26px;height:auto;display:block}',
    '.fab .x{font-size:18px;display:inline-flex}',
    /* panel */
    '.panel{position:absolute;bottom:56px;width:380px;max-height:min(640px,calc(100vh - 100px));display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);box-shadow:0 24px 64px rgba(0,0,0,.45);overflow:hidden}',
    '.right .panel{right:0}.left .panel{left:0}.nobtn .panel{bottom:0}',
    '.logo-only .panel{bottom:64px}',
    '.glow{position:absolute;inset:0 0 auto 0;height:160px;pointer-events:none;background:radial-gradient(120% 100% at 50% 0%,var(--glow),transparent 70%)}',
    '.hatch{height:10px;border-bottom:1px solid var(--line);background:repeating-linear-gradient(45deg,var(--hatch) 0 1px,transparent 1px 9px)}',
    '.head{position:relative;display:flex;align-items:center;gap:10px;padding:14px 12px 12px 16px;border-bottom:1px solid var(--line)}',
    '.head .mk{width:30px;height:auto;display:block}',
    '.brand{flex:1;min-width:0}',
    '.brand b{display:block;font-size:16px;font-weight:500;letter-spacing:-.03em}',
    '.tag{font:11px/1.2 var(--mono);color:var(--muted);letter-spacing:.02em;text-transform:uppercase}',
    '.tag.gap{margin-bottom:8px}',
    '.tag i{display:inline-block;width:6px;height:6px;background:var(--accent);margin-right:6px;vertical-align:1px}',
    '.icon-btn{width:32px;height:32px;display:grid;place-items:center;color:var(--muted);font-size:18px}',
    '.icon-btn:hover{color:var(--fg);background:var(--fill)}',
    '.tabs{position:relative;display:flex;border-bottom:1px solid var(--line)}',
    '.tab{flex:1;height:40px;font:12px var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}',
    '.tab[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent)}',
    '.body{position:relative;padding:16px;overflow:auto}',
    /* form */
    '.types{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);margin-bottom:16px}',
    '.type{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px;text-align:left;background:var(--fill);border-right:1px solid var(--line);position:relative}',
    '.type:last-child{border-right:0}',
    '.type .ic{font-size:18px;display:inline-flex;color:var(--muted);margin-bottom:4px}',
    '.type span{font-weight:500;letter-spacing:-.01em}',
    '.type small{color:var(--muted);font-size:12px;line-height:1.3}',
    '.type[aria-checked=true]{background:transparent;box-shadow:inset 0 2px 0 var(--accent)}',
    '.type[aria-checked=true] .ic{color:var(--accent)}',
    'label{display:block;font:11px var(--mono);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 8px}',
    'textarea,input{width:100%;font:inherit;color:var(--fg);background:var(--fill);border:1px solid var(--line);border-radius:0;padding:10px 12px;outline:none}',
    'textarea::placeholder,input::placeholder{color:var(--muted)}',
    'textarea:focus,input:focus{border-color:var(--accent)}',
    'textarea{min-height:112px;resize:vertical}',
    '.field{margin-bottom:14px}',
    '.note.tight{margin-top:6px}',
    '.opt{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--line);background:var(--fill);cursor:pointer;text-transform:none;font:inherit;color:var(--fg);letter-spacing:0;margin:0}',
    '.opt input{position:absolute;opacity:0;width:1px;height:1px}',
    '.opt b{display:block;font-weight:500}',
    '.opt small{display:block;color:var(--muted);font-size:12px;margin-top:2px;word-break:break-all}',
    '.sw{flex:none;width:34px;height:20px;margin-top:1px;border:1px solid var(--line);background:var(--bg);position:relative}',
    '.sw:after{content:"";position:absolute;top:3px;left:3px;width:12px;height:12px;background:var(--muted);transition:transform .15s}',
    '.opt input:checked+.sw{background:var(--accent);border-color:var(--accent)}',
    '.opt input:checked+.sw:after{transform:translateX(14px);background:#fff}',
    '.opt input:focus-visible+.sw{outline:2px solid var(--accent);outline-offset:2px}',
    '.login{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);background:var(--fill);color:var(--soft)}',
    '.login-link{color:var(--fg);font-weight:500;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--accent)}',
    '.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    '.primary{width:100%;height:40px;background:var(--btn);color:var(--btn-fg);font-weight:500;display:flex;align-items:center;justify-content:space-between;padding:0 14px;letter-spacing:-.01em}',
    '.primary .ic{font-size:16px;display:inline-flex}',
    '.primary[disabled]{opacity:.35;cursor:default}',
    '.note{font-size:12px;color:var(--muted);margin-top:10px}',
    '.linkish{background:none;border:0;padding:0;margin-top:8px;color:var(--muted);font:inherit;font-size:12px;text-decoration:underline;cursor:pointer}',
    '.linkish:hover{color:var(--fg)}',
    '.trail{list-style:none;margin:8px 0 0;padding:8px 10px;border:1px solid var(--line);background:var(--fill);max-height:160px;overflow:auto;font-size:12px}',
    '.trail li{display:flex;gap:8px;padding:2px 0;color:var(--muted);word-break:break-word}',
    '.trail .tk{flex:none;width:58px;font-family:ui-monospace,Menlo,monospace;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding-top:2px}',
    '.err{color:var(--err);font-size:13px;margin-bottom:12px}',
    /* done */
    '.done{text-align:left;padding:8px 0 4px}',
    '.done .mk{width:64px;height:auto;display:block;margin-bottom:16px}',
    '.done h3{margin:0 0 6px;font-size:22px;font-weight:500;letter-spacing:-.03em}',
    '.done p{margin:0 0 18px;color:var(--soft)}',
    '.ghost{display:inline-flex;align-items:center;gap:10px;height:34px;padding:0 12px;background:var(--fill);border:1px solid var(--line)}',
    '.ghost .ic{font-size:16px;display:inline-flex}',
    /* my requests */
    '.list{display:flex;flex-direction:column;border:1px solid var(--line)}',
    '.item{padding:12px 14px;border-bottom:1px solid var(--line)}',
    '.item:last-child{border-bottom:0}',
    '.meta{display:flex;justify-content:space-between;gap:12px;font:11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.03em;color:var(--muted);margin-bottom:6px}',
    '.status{white-space:nowrap;color:var(--soft)}',
    '.status.in_progress,.status.planned{color:var(--accent)}',
    '.status.shipped{color:var(--ok)}',
    '.msg{white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.also{font-size:12px;color:var(--muted);margin-top:6px}',
    '.reply{margin-top:10px;padding:8px 10px;border-left:2px solid var(--accent);background:var(--fill);font-size:13px}',
    '.empty{color:var(--muted);text-align:center;padding:28px 8px}',
    '.file{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}',
    '.thumbs{display:flex;gap:8px}',
    '.add-tile{display:grid;place-items:center;border-style:dashed;color:var(--accent);font-size:22px}',
    '.add-tile:hover{border-color:var(--accent)}',
    '.add-tile[disabled]{opacity:.5;cursor:default}',
    '.thumb{position:relative;width:72px;height:72px;border:1px solid var(--line);background:var(--fill);overflow:hidden}',
    '.thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '.thumb-x{position:absolute;top:4px;right:4px;width:22px;height:22px;display:grid;place-items:center;background:rgba(8,9,11,.75);color:#fff;font-size:14px}',
    '.add-shot{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px dashed var(--line);background:var(--fill);color:var(--soft);text-align:left}',
    '.add-shot:hover{border-color:var(--accent);color:var(--fg)}',
    '.add-shot .ic{font-size:18px;color:var(--accent)}',
    '.add-shot small{margin-left:auto;color:var(--muted);font-size:12px}',
    '.add-shot[disabled]{opacity:.5;cursor:default}',
    '.panel.dragging{outline:2px dashed var(--accent);outline-offset:-6px}',
    /* footer */
    '.foot{position:relative;display:flex;align-items:center;gap:6px;padding:10px 16px;border-top:1px solid var(--line);font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}',
    '.foot .mk{width:14px;height:auto;display:block}',
    '@media (max-width:480px){.w{bottom:12px}.w.right{right:12px}.w.left{left:12px}.panel{position:fixed;left:8px!important;right:8px!important;bottom:66px;width:auto}.nobtn .panel{bottom:8px}}',
    '@media (prefers-reduced-motion:no-preference){.panel.enter{animation:namlo-in .18s ease-out}@keyframes namlo-in{from{opacity:0;transform:translateY(8px)}}}'
  ].join('');

  // ---------- helpers ----------
  function h(tag, props, kids) {
    var el = document.createElement(tag);
    if (props) for (var k in props) {
      if (k === 'text') el.textContent = props[k];
      else if (k === 'html') el.innerHTML = props[k]; // only used with our own SVGs
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), props[k]);
      else if (props[k] !== false && props[k] !== null && props[k] !== undefined) el.setAttribute(k, props[k] === true ? '' : props[k]);
    }
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function icon(name) { return h('span', { 'class': 'ic', html: ICONS[name] || '' }); }
  function markEl(cls) { var s = h('span', { html: mark(cls) }); return s.firstChild; }
  function ago(ts) {
    var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    var m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    var hr = Math.round(m / 60); if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(hr / 24); if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    return new Date(ts).toLocaleDateString();
  }
  function api(path, opts) {
    return (nativeFetch || fetch)(cfg.api + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Could not reach Namlo. Please try again.');
        return data;
      });
    });
  }

  // ---------- state & render ----------
  var host, root, wrap, lastFocus, justOpened = false;
  // Keeps an unsent message across the trip to the log-in page (this tab only).
  function keepDraft() {
    try { if (state.message.trim()) sessionStorage.setItem('namlo:draft', JSON.stringify({ type: state.type, message: state.message })); } catch (e) { /* ignore */ }
  }
  function takeDraft() {
    try {
      var d = JSON.parse(sessionStorage.getItem('namlo:draft') || 'null');
      sessionStorage.removeItem('namlo:draft');
      if (d && typeof d.message === 'string') { state.message = d.message.slice(0, 4000); if (d.type) state.type = d.type; return true; }
    } catch (e) { /* ignore */ }
    return false;
  }
  function lastUpdatesChoice() { try { return localStorage.getItem('namlo:updates') === 'yes'; } catch (e) { return false; } }
  function saveUpdatesChoice(on) { try { localStorage.setItem('namlo:updates', on ? 'yes' : 'no'); } catch (e) { /* ignore */ } }
  var state = { open: false, view: 'send', type: 'bug', message: '', email: '', notify: lastUpdatesChoice(), sending: false, error: '', items: null, loading: false, lastNumber: null, lastNotify: false,
    images: [], screenshots: null, imgBusy: false, dragging: false, withTrail: true, showTrail: false };
  var MAX_IMAGES = 3;

  function isDark() {
    if (cfg.theme === 'dark') return true;
    if (cfg.theme === 'light') return false;
    return !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---------- the owner's button settings, from Araniko through the Namlo API ----------
  function applyLook(look) {
    for (var k in base) cfg[k] = base[k];
    if (!look || typeof look !== 'object') return;
    if (typeof look.label === 'string' && look.label.trim()) cfg.label = look.label.trim().slice(0, 40);
    if (look.style === 'logo' || look.style === 'box') cfg.style = look.style;
    if (look.radius) cfg.radius = radiusOf(look.radius);
    if (look.position === 'bottom-left') { cfg.position = 'left'; cfg.button = true; }
    else if (look.position === 'bottom-right') { cfg.position = 'right'; cfg.button = true; }
    // Hidden only when the page has its own way to open Namlo; otherwise people would have none.
    else if (look.position === 'hidden') cfg.button = !document.querySelector('[data-namlo-open]');
    if (look.email === 'off') cfg.email = false; else if (look.email === 'optional') cfg.email = true;
    if (typeof look.login_url === 'string' && /^(\/(?!\/)|https:\/\/)/.test(look.login_url)) cfg.loginUrl = look.login_url;
  }
  var LOOK_KEY = 'namlo:look:' + cfg.siteKey;
  function cachedLook() { try { return JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch (e) { return null; } }
  function cacheLook(look) { try { localStorage.setItem(LOOK_KEY, JSON.stringify(look || null)); } catch (e) { /* ignore */ } }

  function mount() {
    host = h('div', { id: 'namlo-widget' });
    root = host.attachShadow({ mode: 'open' });
    root.appendChild(h('style', { text: CSS }));
    wrap = h('div', { 'class': 'w' });
    root.appendChild(wrap);
    applyLook(cachedLook());
    document.body.appendChild(host);
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', render);
    }
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-namlo-open]');
      if (t) { e.preventDefault(); open(t.getAttribute('data-namlo-open')); }
    });
    render();
    loadConfig();
    if (takeDraft()) open();
  }

  function render() {
    wrap.className = 'w ' + cfg.position + (cfg.button ? '' : ' nobtn') + (cfg.style === 'logo' ? ' logo-only' : '') + (isDark() ? '' : ' light');
    wrap.style.setProperty('--fab-radius', cfg.radius);
    wrap.innerHTML = '';
    if (state.open) wrap.appendChild(renderPanel());
    if (cfg.button) {
      var logoOnly = cfg.style === 'logo';
      var label = state.open ? 'Close' : cfg.label;
      wrap.appendChild(h('button', {
        'class': 'fab' + (logoOnly ? ' logo' : ''), type: 'button', 'aria-expanded': state.open ? 'true' : 'false', 'aria-haspopup': 'dialog',
        'aria-label': logoOnly ? label : null, title: logoOnly ? label : null,
        onclick: function () { state.open ? close() : open(); }
      }, [state.open ? h('span', { 'class': 'x', html: ICONS.Cancel01 }) : markEl('mk'), logoOnly ? null : h('span', { text: label })]));
    }
  }

  function renderPanel() {
    var head = h('div', { 'class': 'head' }, [
      markEl('mk'),
      h('div', { 'class': 'brand' }, [h('b', { text: 'Send feedback' }), h('div', { 'class': 'tag' }, [h('i'), 'Goes straight to the team'])]),
      h('button', { 'class': 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, [icon('Cancel01')])
    ]);
    var tabs = h('div', { 'class': 'tabs', role: 'tablist' }, [
      h('button', { 'class': 'tab', role: 'tab', type: 'button', 'aria-selected': state.view !== 'mine' ? 'true' : 'false', onclick: function () { go('send'); }, text: 'Send' }),
      h('button', { 'class': 'tab', role: 'tab', type: 'button', 'aria-selected': state.view === 'mine' ? 'true' : 'false', onclick: function () { go('mine'); }, text: 'My requests' })
    ]);
    var body = h('div', { 'class': 'body' }, [state.view === 'mine' ? renderMine() : state.view === 'done' ? renderDone() : renderForm()]);
    var foot = h('div', { 'class': 'foot' }, [markEl('mk'), 'Powered by Namlo']);
    return h('div', {
      'class': 'panel' + (justOpened ? ' enter' : '') + (state.dragging ? ' dragging' : ''), role: 'dialog', 'aria-label': 'Send feedback',
      onkeydown: function (e) { if (e.key === 'Escape') close(); },
      ondragover: function (e) { if (canAddImages() && hasFiles(e)) { e.preventDefault(); if (!state.dragging) { state.dragging = true; render(); } } },
      ondragleave: function (e) { if (state.dragging && !e.relatedTarget) { state.dragging = false; render(); } },
      ondrop: function (e) {
        if (!canAddImages() || !hasFiles(e)) return;
        e.preventDefault(); state.dragging = false;
        addImages(e.dataTransfer.files);
      }
    },
      [h('div', { 'class': 'glow' }), h('div', { 'class': 'hatch' }), head, tabs, body, foot]);
  }

  // ---------- screenshots ----------
  function canAddImages() { return state.screenshots === true && state.view === 'send' && !state.sending; }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }

  // Once per page load: the owner's button settings, whether screenshots work, and our version.
  function loadConfig() {
    if (state.screenshots !== null) return;
    state.screenshots = false;
    api('/v1/config?site_key=' + encodeURIComponent(cfg.siteKey) + '&v=' + VERSION)
      .then(function (d) {
        state.screenshots = !!d.screenshots;
        if (d.max_images) MAX_IMAGES = d.max_images;
        applyLook(d.appearance); cacheLook(d.appearance);
        wallsOn = d.walls !== false;
        if (wallsOn) flushWalls(); else wallQueue = [];
        render();
      })
      .catch(function () { state.screenshots = null; });
  }

  // Shrinks one picked, pasted or dropped image to at most 1600px on its longest side, as JPEG.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Only pictures can be added'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That picture couldn\u2019t be read')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That picture couldn\u2019t be read')); };
        img.onload = function () {
          var max = 1600, w = img.naturalWidth, hgt = img.naturalHeight;
          var scale = Math.min(1, max / Math.max(w, hgt));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(hgt * scale));
          var g = c.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL('image/jpeg', 0.85);
          if (url.length > 1900000) url = c.toDataURL('image/jpeg', 0.6);
          resolve(url);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function addImages(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type); });
    var room = MAX_IMAGES - state.images.length;
    if (!list.length) { state.error = 'Only pictures can be added'; render(); return; }
    if (room <= 0) { state.error = 'Up to ' + MAX_IMAGES + ' screenshots'; render(); return; }
    state.error = list.length > room ? 'Up to ' + MAX_IMAGES + ' screenshots, so only the first ' + room + ' were added' : '';
    state.imgBusy = true; render();
    Promise.all(list.slice(0, room).map(shrink)).then(function (urls) {
      urls.forEach(function (u) { state.images.push(u); });
    }, function (e) { state.error = e.message; }).then(function () { state.imgBusy = false; render(); });
  }

  function renderShots() {
    var input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/*', multiple: true, 'class': 'file', id: 'namlo-file', tabindex: '-1',
      onchange: function (e) { addImages(e.target.files); e.target.value = ''; } });
    var thumbs = state.images.map(function (url, i) {
      return h('div', { 'class': 'thumb' }, [
        h('img', { src: url, alt: 'Screenshot ' + (i + 1) }),
        h('button', { type: 'button', 'class': 'thumb-x', 'aria-label': 'Remove screenshot ' + (i + 1),
          onclick: function () { state.images.splice(i, 1); state.error = ''; render(); } }, [icon('Cancel01')])
      ]);
    });
    var full = state.images.length >= MAX_IMAGES;
    var pick = function () { input.click(); };
    if (thumbs.length) {
      // With screenshots added, the add button becomes one more small tile in the same row.
      if (!full) thumbs.push(h('button', { type: 'button', 'class': 'thumb add-tile', 'aria-label': 'Add another screenshot',
        title: 'Add another (' + (MAX_IMAGES - state.images.length) + ' more)', disabled: state.imgBusy || state.sending, onclick: pick }, [icon('ImageAdd01')]));
      return h('div', { 'class': 'field shots' }, [h('div', { 'class': 'thumbs' }, thumbs), input]);
    }
    return h('div', { 'class': 'field shots' }, [
      h('button', { type: 'button', 'class': 'add-shot', disabled: state.imgBusy || state.sending, onclick: pick }, [icon('ImageAdd01'),
        h('span', { text: state.imgBusy ? 'Adding\u2026' : 'Add a screenshot' }), h('small', { text: 'or paste or drop one' })]),
      input
    ]);
  }

  function renderForm() {
    var type = TYPES.filter(function (t) { return t.id === state.type; })[0];
    var form = h('form', { onsubmit: submit, novalidate: true });
    form.appendChild(h('div', { 'class': 'types', role: 'radiogroup', 'aria-label': 'What is this about?' }, TYPES.map(function (t) {
      return h('button', {
        'class': 'type', type: 'button', role: 'radio', 'aria-checked': t.id === state.type ? 'true' : 'false',
        onclick: function () { state.type = t.id; render(); focusMessage(); }
      }, [icon(t.icon), h('span', { text: t.label }), h('small', { text: t.hint })]);
    })));
    if (state.error) form.appendChild(h('div', { 'class': 'err', role: 'alert', text: state.error }));
    var ta = h('textarea', {
      id: 'namlo-message', placeholder: type.placeholder, maxlength: 4000, required: true,
      oninput: function (e) { state.message = e.target.value; sendBtn.disabled = state.sending || state.message.trim().length < 3; }
    });
    ta.value = state.message;
    ta.addEventListener('paste', function (e) {
      var files = e.clipboardData && e.clipboardData.files;
      if (canAddImages() && files && files.length) { e.preventDefault(); addImages(files); }
    });
    form.appendChild(h('div', { 'class': 'field' }, [h('label', { 'for': 'namlo-message', text: 'Your message' }), ta]));
    if (state.screenshots) form.appendChild(renderShots());
    if (cfg.email && user && user.email) {
      // Signed in: no email box, just their choice.
      var box = h('input', { type: 'checkbox', id: 'namlo-notify', onchange: function (e) { state.notify = e.target.checked; saveUpdatesChoice(state.notify); } });
      box.checked = state.notify;
      form.appendChild(h('div', { 'class': 'field' }, [
        h('label', { 'class': 'opt', 'for': 'namlo-notify' }, [box, h('span', { 'class': 'sw', 'aria-hidden': 'true' }),
          h('span', {}, [h('b', { text: 'Email me updates' }), h('small', { text: 'Sent to ' + user.email + ' when this changes' })])])
      ]));
    } else if (cfg.email && user) {
      // Signed in without an email the app shared: nothing to ask.
    } else if (cfg.email && cfg.loginUrl) {
      // Not signed in, and the app has a log-in page: offer that instead of an email box.
      form.appendChild(h('div', { 'class': 'field login' }, [
        h('span', { text: 'Want updates by email?' }),
        h('a', { href: cfg.loginUrl, 'class': 'login-link', text: 'Log in', onclick: keepDraft })
      ]));
    } else if (cfg.email) {
      var em = h('input', { id: 'namlo-email', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', maxlength: 200,
        oninput: function (e) { state.email = e.target.value; } });
      em.value = state.email;
      form.appendChild(h('div', { 'class': 'field' }, [h('label', { 'for': 'namlo-email', text: 'Email for updates (optional)' }), em,
        h('div', { 'class': 'note tight', text: 'We\u2019ll email you when this changes. Nothing else.' })]));
    }
    var recent = recentTrail();
    if (recent.length) {
      var tb = h('input', { type: 'checkbox', id: 'namlo-trail', onchange: function (e) { state.withTrail = e.target.checked; } });
      tb.checked = state.withTrail;
      var problems = recent.filter(function (e) { return e.k !== 'page'; }).length;
      form.appendChild(h('div', { 'class': 'field' }, [
        h('label', { 'class': 'opt', 'for': 'namlo-trail' }, [tb, h('span', { 'class': 'sw', 'aria-hidden': 'true' }),
          h('span', {}, [h('b', { text: 'Include what happened before' }),
            h('small', { text: recent.length + (recent.length === 1 ? ' step' : ' steps') + ' from the last 30 minutes' + (problems ? ', ' + problems + (problems === 1 ? ' problem' : ' problems') : '') + '. Never what you typed.' })])]),
        h('button', { 'class': 'linkish', type: 'button', 'aria-expanded': state.showTrail ? 'true' : 'false',
          onclick: function () { state.showTrail = !state.showTrail; render(); }, text: state.showTrail ? 'Hide what\u2019s included' : 'See what\u2019s included' }),
        state.showTrail ? h('ol', { 'class': 'trail' }, recent.slice(-20).map(function (e) {
          return h('li', {}, [h('span', { 'class': 'tk', text: TRAIL_WORDS[e.k] || e.k }), h('span', { text: e.m + (e.n > 1 ? ' (x' + e.n + ')' : '') })]);
        })) : null
      ]));
    }
    form.appendChild(h('div', { 'class': 'hp', 'aria-hidden': 'true' }, [h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' })]));
    var sendBtn = h('button', { 'class': 'primary', type: 'submit', disabled: state.sending || state.message.trim().length < 3 },
      [h('span', { text: state.sending ? 'Sending\u2026' : 'Send ' + type.label.toLowerCase() }), icon('ArrowRight01')]);
    form.appendChild(sendBtn);
    form.appendChild(h('div', { 'class': 'note', text: 'We include this page\'s address and your browser name to help us fix things.' }));
    return form;
  }

  function renderDone() {
    return h('div', { 'class': 'done', role: 'status' }, [
      markEl('mk'),
      h('div', { 'class': 'tag gap' }, [h('i'), (state.lastNumber ? '#' + state.lastNumber + ' ' : '') + 'Received']),
      h('h3', { text: 'Thanks, we got it.' }),
      h('p', { text: state.lastNotify ? 'We\u2019ll email you when it changes. You can also follow it under My requests.' : 'You can follow what happens to it under My requests.' }),
      h('button', { 'class': 'ghost', type: 'button', onclick: function () { go('mine'); } }, ['See my requests', icon('ArrowRight01')])
    ]);
  }

  function renderMine() {
    if (state.loading && !state.items) return h('div', { 'class': 'empty', text: 'Loading\u2026' });
    if (state.error) return h('div', { 'class': 'err', role: 'alert', text: state.error });
    if (!state.items || !state.items.length) return h('div', { 'class': 'empty', text: 'Nothing sent from this browser yet.' });
    return h('div', { 'class': 'list' }, state.items.map(function (it) {
      var t = TYPES.filter(function (x) { return x.id === it.type; })[0];
      return h('div', { 'class': 'item' }, [
        h('div', { 'class': 'meta' }, [
          h('span', { text: '#' + it.number + ' \u00b7 ' + (t ? t.label : it.type) + ' \u00b7 ' + ago(it.created_at) +
            (it.images ? ' \u00b7 ' + it.images + (it.images === 1 ? ' screenshot' : ' screenshots') : '') }),
          h('span', { 'class': 'status ' + it.status, text: STATUS[it.status] || it.status })
        ]),
        h('div', { 'class': 'msg', text: it.message }),
        it.merged ? h('div', { 'class': 'also', text: 'Others asked for this too.' }) : null,
        it.updates_by_email ? h('div', { 'class': 'also', text: 'You\u2019ll get an email when this changes.' }) : null,
        it.reply ? h('div', { 'class': 'reply', text: it.reply }) : null
      ]);
    }));
  }

  function focusMessage() {
    setTimeout(function () { var el = root.getElementById('namlo-message'); if (el) el.focus(); }, 0);
  }

  function go(view) {
    state.view = view; state.error = '';
    if (view === 'mine') loadMine();
    render();
    if (view === 'send') focusMessage();
  }

  function loadMine() {
    state.loading = true;
    api('/v1/feedback/mine?site_key=' + encodeURIComponent(cfg.siteKey) + '&reporter_id=' + encodeURIComponent(reporterId()) + '&v=' + VERSION)
      .then(function (d) { state.items = d.items || []; })
      .catch(function (e) { state.error = e.message; })
      .then(function () { state.loading = false; if (state.view === 'mine') render(); });
  }

  function submit(e) {
    e.preventDefault();
    if (state.sending || state.message.trim().length < 3) return;
    var hp = root.querySelector('input[name=website]');
    state.sending = true; state.error = ''; render();
    api('/v1/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_key: cfg.siteKey, type: state.type, message: state.message,
        email: user ? undefined : (cfg.email && !cfg.loginUrl && state.email ? state.email : undefined),
        user: user || undefined,
        notify: user ? (cfg.email && !!user.email && state.notify) : undefined,
        images: state.images.length ? state.images.map(function (u) { return { data: u.slice(u.indexOf(',') + 1) }; }) : undefined,
        page_url: location.href, user_agent: navigator.userAgent, reporter_id: reporterId(), website: hp ? hp.value : '',
        widget_version: VERSION,
        trail: state.withTrail ? recentTrail() : undefined
      })
    }).then(function (d) {
      state.message = ''; state.images = []; state.view = 'done'; state.items = null; state.lastNumber = d && d.number; state.lastNotify = !!(d && d.updates_by_email);
    }).catch(function (err) {
      state.error = err.message;
    }).then(function () { state.sending = false; render(); });
  }

  function open(type) {
    if (type && TYPES.some(function (t) { return t.id === type; })) { state.type = type; state.view = 'send'; }
    if (state.open) { render(); return; }
    lastFocus = document.activeElement;
    state.open = true;
    if (state.view === 'done') state.view = 'send';
    justOpened = true; render(); justOpened = false;
    loadConfig();
    if (state.view === 'mine') loadMine(); else focusMessage();
  }
  function close() {
    state.open = false; state.error = ''; render();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* ignore */ }
  }

  function identify(u) {
    user = cleanUser(u);
    if (wrap) render();
  }
  window.Namlo = { __loaded: true, open: open, close: close, identify: identify, wall: wall };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
