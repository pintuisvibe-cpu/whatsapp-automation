/* ==========================================================
   Sales Reply AI — Theme Engine  (light.js)
   ----------------------------------------------------------
   • Single small file, no dependency, no build step.
   • Stores choice in localStorage  ->  key "sra-theme"
   • FUTURE DEFAULT = light  (change DEFAULT_THEME to 'dark'
     to flip the default back without touching anything else)
   • Exposes window.SraTheme = { get, set, toggle, mount }
   • Emits  document -> 'sra:themechange'  { detail:{ theme } }
     so charts / third-party widgets can restyle themselves.
   ========================================================== */
(function (w, d) {
    'use strict';

    var STORAGE_KEY   = 'sra-theme';
    var DEFAULT_THEME = 'light';       // <— future default
    var VALID         = { light: 1, dark: 1 };

    /* ---------- read / write ---------- */
    function stored() {
        try {
            var v = w.localStorage.getItem(STORAGE_KEY);
            return VALID[v] ? v : null;
        } catch (e) { return null; }   // private mode / disabled storage
    }

    function persist(theme) {
        try { w.localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    }

    function current() {
        return d.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    /* ---------- apply ---------- */
    function apply(theme, animate) {
        theme = VALID[theme] ? theme : DEFAULT_THEME;
        var root = d.documentElement;

        if (animate && !w.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            root.classList.add('theme-anim');
            w.setTimeout(function () { root.classList.remove('theme-anim'); }, 380);
        }

        if (theme === 'light') root.setAttribute('data-theme', 'light');
        else root.removeAttribute('data-theme');

        // keep mobile browser UI chrome in sync
        var meta = d.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = d.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            d.head.appendChild(meta);
        }
        meta.setAttribute('content', theme === 'light' ? '#f5f7fb' : '#0a0a1a');

        syncSwitches(theme);

        try {
            d.dispatchEvent(new CustomEvent('sra:themechange', { detail: { theme: theme } }));
        } catch (e) {}

        return theme;
    }

    function set(theme, opts) {
        theme = apply(theme, !(opts && opts.silent));
        persist(theme);
        return theme;
    }

    function toggle() {
        return set(current() === 'light' ? 'dark' : 'light');
    }

    /* ---------- switch UI ---------- */
    var SWITCH_HTML =
        '<span class="ts-ico ts-sun" aria-hidden="true">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none">' +
            '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' +
            '<path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" ' +
            'stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' +
        '</span>' +
        '<span class="ts-ico ts-moon" aria-hidden="true">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none">' +
            '<path d="M20.5 14.6A8.6 8.6 0 019.4 3.5a8.7 8.7 0 100 17.1 8.7 8.7 0 0011.1-6z" ' +
            'fill="currentColor"/></svg>' +
        '</span>' +
        '<span class="ts-knob" aria-hidden="true"></span>';

    function syncSwitches(theme) {
        var list = d.querySelectorAll('.theme-switch');
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            el.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
            el.setAttribute('aria-label', theme === 'light'
                ? 'Switch to dark mode' : 'Switch to light mode');
            el.setAttribute('title', theme === 'light' ? 'Dark mode' : 'Light mode');
            var lbl = el.parentNode && el.parentNode.querySelector
                ? el.parentNode.querySelector('.ts-label') : null;
            if (lbl) lbl.textContent = theme === 'light' ? 'Light' : 'Dark';
        }
    }

    /* Turn any <button class="theme-switch"> (empty or not) into a live switch.
       Safe to call repeatedly — already-built switches are skipped. */
    function mount(scope) {
        var list = (scope || d).querySelectorAll('.theme-switch');
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.dataset.tsReady) continue;
            el.dataset.tsReady = '1';
            if (!el.querySelector('.ts-knob')) el.innerHTML = SWITCH_HTML;
            el.setAttribute('role', 'switch');
            if (el.tagName === 'BUTTON' && !el.getAttribute('type')) el.type = 'button';
            el.addEventListener('click', function (ev) { ev.preventDefault(); toggle(); });
        }
        syncSwitches(current());
    }

    /* ---------- boot ----------
       Runs immediately (script is in <head>) so there is NO white/dark
       flash before paint. localStorage wins; otherwise DEFAULT_THEME.   */
    apply(stored() || DEFAULT_THEME, false);

    if (d.readyState === 'loading') {
        d.addEventListener('DOMContentLoaded', function () { mount(); });
    } else {
        mount();
    }

    /* keep multiple open tabs in sync */
    w.addEventListener('storage', function (e) {
        if (e.key === STORAGE_KEY && VALID[e.newValue]) apply(e.newValue, true);
    });

    w.SraTheme = {
        get: current,
        set: set,
        toggle: toggle,
        mount: mount,
        DEFAULT: DEFAULT_THEME
    };
})(window, document);
