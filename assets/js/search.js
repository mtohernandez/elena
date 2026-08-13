/* Search.
   The index is inlined into this page, so there is no fetch, no CORS problem,
   and the page works from a file:// path. The whole matcher is a prefix scan:
   at this corpus size that is instant, and a library would cost more to carry
   than it could possibly save.

   The full archive is already on this page below the form. Search is an
   enhancement over it, which is why the form starts hidden and is only revealed
   once this script has run. */
(function () {
  "use strict";
  var data;
  try {
    data = JSON.parse(document.getElementById("searchdata").textContent);
  } catch (e) {
    return; // no index, so leave the archive as it is
  }
  var form = document.getElementById("searchform");
  var input = document.getElementById("q");
  var list = document.getElementById("results");
  var note = document.getElementById("searchcount");
  var root = document.documentElement.dataset.root || "./";
  if (!form || !input || !list) return;
  form.hidden = false;
  form.addEventListener("submit", function (e) { e.preventDefault(); });

  function norm(s) {
    return s
      .toLowerCase()
      .normalize ? s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : s.toLowerCase();
  }
  function terms(q) {
    return norm(q).split(/[^a-z0-9]+/).filter(function (t) { return t.length > 0; });
  }

  function score(rec, ts) {
    var t = norm(rec.t), k = rec.k;
    var total = 0;
    for (var i = 0; i < ts.length; i++) {
      var term = ts[i];
      var inTitle = t.indexOf(term) >= 0;
      // The blob is space separated and sorted, so a word-boundary prefix test
      // is a plain substring search for " term".
      var inBody = k.indexOf(term) === 0 || k.indexOf(" " + term) >= 0;
      if (!inTitle && !inBody) return 0;
      total += inTitle ? 8 : 1;
    }
    return total;
  }

  var selected = -1;
  function render(rows) {
    list.innerHTML = "";
    selected = -1;
    rows.forEach(function (r, i) {
      var li = document.createElement("li");
      li.id = "r" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      var a = document.createElement("a");
      a.href = root + r.u;
      a.textContent = r.t;
      var span = document.createElement("span");
      span.className = "rtype";
      span.textContent = r.y === "source" ? "source" : r.d;
      a.appendChild(span);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function select(i) {
    var items = list.children;
    if (!items.length) return;
    if (selected >= 0 && items[selected]) items[selected].setAttribute("aria-selected", "false");
    selected = Math.max(0, Math.min(i, items.length - 1));
    items[selected].setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", items[selected].id);
    items[selected].scrollIntoView({ block: "nearest" });
  }

  function run() {
    var q = input.value.trim();
    if (!q) {
      list.innerHTML = "";
      note.textContent = "";
      input.removeAttribute("aria-activedescendant");
      return;
    }
    var ts = terms(q);
    var rows = data
      .map(function (r) { return { r: r, s: score(r, ts) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || (b.r.d < a.r.d ? -1 : 1); })
      .slice(0, 20)
      .map(function (x) { return x.r; });
    render(rows);
    note.textContent = rows.length + (rows.length === 1 ? " result" : " results");
  }

  input.addEventListener("input", run);
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); select(selected + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); select(selected - 1); }
    else if (e.key === "Enter" && selected >= 0) {
      e.preventDefault();
      var a = list.children[selected].querySelector("a");
      if (a) a.click();
    } else if (e.key === "Escape") {
      input.value = "";
      run();
    }
  });
})();
