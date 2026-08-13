/* Reader preferences.
   Five settings, all of them typography. Colour is deliberately not adjustable
   beyond the theme, because then no combination a reader can reach is able to
   produce a contrast failure.
   Stored in this browser, under one versioned key, and sent nowhere. */
/* The back link. If you arrived from the graph, history takes you back to it
   with its lens and its layout intact, which no href can do. If you arrived any
   other way, the href is already correct and this does nothing. */
(function () {
  "use strict";
  var back = document.querySelector("a[data-back]");
  if (!back) return;
  back.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var ref = document.referrer;
    if (!ref) return;
    try {
      var u = new URL(ref);
      if (u.origin !== location.origin) return;
      var here = new URL(back.href);
      // Only when the previous page really is the target of this link.
      if (u.pathname !== here.pathname) return;
      e.preventDefault();
      history.back();
    } catch (err) { /* leave the href to do its job */ }
  });
})();

(function () {
  "use strict";
  var KEY = "elena.prefs.v1";
  var root = document.documentElement;
  var form = document.getElementById("prefs");
  if (!form) return;

  var DEFAULTS = { theme: "system", scale: "1", leading: "1.65", measure: "68ch", face: "hyper" };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }

  function apply(p) {
    if (p.theme === "system") { delete root.dataset.theme; }
    else { root.dataset.theme = p.theme; }
    if (p.face === "hyper") { delete root.dataset.face; }
    else { root.dataset.face = p.face; }
    root.style.setProperty("--font-scale", p.scale);
    root.style.setProperty("--leading", p.leading);
    root.style.setProperty("--measure", p.measure);
  }

  var prefs = load();
  apply(prefs);

  // Reflect the stored state into the controls, so what is shown is what is set.
  Object.keys(DEFAULTS).forEach(function (name) {
    var el = form.querySelector('input[name="' + name + '"][value="' + prefs[name] + '"]');
    if (el) el.checked = true;
  });

  form.addEventListener("change", function (e) {
    var t = e.target;
    if (!t || t.type !== "radio" || !(t.name in DEFAULTS)) return;
    prefs[t.name] = t.value;
    apply(prefs);
    save(prefs);
  });

  var reset = document.getElementById("prefs-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      prefs = Object.assign({}, DEFAULTS);
      apply(prefs);
      save(prefs);
      Object.keys(DEFAULTS).forEach(function (name) {
        var el = form.querySelector('input[name="' + name + '"][value="' + DEFAULTS[name] + '"]');
        if (el) el.checked = true;
      });
    });
  }

  // Escape closes the panel and returns focus to its own summary, so a keyboard
  // user is never left somewhere they cannot see.
  form.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && form.open) {
      form.open = false;
      var s = form.querySelector("summary");
      if (s) s.focus();
    }
  });
  document.addEventListener("click", function (e) {
    if (form.open && !form.contains(e.target)) form.open = false;
  });
})();
