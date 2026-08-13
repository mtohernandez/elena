/* The graph. This is the site.
   ---------------------------------------------------------------------------
   Not a diagram on a page: the front page is this, full bleed, and the links
   floating over it are lenses onto it rather than places to go. Choosing one
   re-lays the map. Clicking a node flies to it and opens what it stands for.

   SVG rather than canvas, because a canvas cannot hold a link, a name or a
   focus ring, and this drawing is made entirely of links.

   Physics is d3-force. Four files load before this one, in order: quadtree,
   dispatch, timer, force. The force bundle does not inline them; its browser
   branch reads them off the shared global, so leaving one out produces a page
   that loads cleanly and then draws nothing.

   Everything here is an enhancement. The same nodes and edges are already in a
   real table inside the list panel, built from the same data, and that table is
   what makes the content reachable with no JavaScript at all. */
(function () {
  "use strict";
  var svg = document.getElementById("graph");
  var dataEl = document.getElementById("graphdata");
  if (!svg || !dataEl) return;
  if (typeof d3 === "undefined" || !d3.forceSimulation || !d3.quadtree || !d3.timer) return;

  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!data.nodes || !data.nodes.length) return;

  var NS = "http://www.w3.org/2000/svg";
  var root = document.documentElement.dataset.root || "./";
  var status = document.getElementById("graph-status");
  var pauseBtn = document.getElementById("gpause");
  var filterBox = document.getElementById("gfilter");
  var hint = document.getElementById("stage-hint");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var nodes = data.nodes.map(function (n) { return Object.assign({}, n); });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  var links = data.links
    .filter(function (l) { return byId[l.source] && byId[l.target]; })
    .map(function (l) { return { source: l.source, target: l.target, kind: l.kind }; });

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  var defs = el("defs", {}, svg);
  [["arrow", "line"], ["arrow-ref", "accent"]].forEach(function (a) {
    var m = el("marker", {
      id: a[0], viewBox: "0 0 10 10", refX: "20", refY: "5",
      markerWidth: "5", markerHeight: "5", orient: "auto-start-reverse"
    }, defs);
    // class, not a fill attribute: a CSS custom property is not valid in a
    // presentation attribute and would silently render black.
    el("path", { d: "M0,0 L10,5 L0,10 z", class: "mk mk-" + a[1] }, m);
  });

  // A node is a link, and dragging a link is a browser gesture: Chrome starts a
  // native link drag, outlines the source in blue, and swallows the pointer.
  // That gesture is meaningless here and its highlight is not ours to style, so
  // it is refused outright. Clicking, middle-clicking and the context menu all
  // still behave like the links they are.
  svg.addEventListener("dragstart", function (e) { e.preventDefault(); });

  var viewport = el("g", { class: "viewport" }, svg);
  var gLinks = el("g", { "stroke-linecap": "round" }, viewport);
  var gNodes = el("g", {}, viewport);

  var linkEls = links.map(function (l) {
    return el("line", {
      class: "link link-" + l.kind,
      "marker-end": l.kind === "refutes" ? "url(#arrow-ref)"
        : (l.kind === "builds_on" ? "url(#arrow)" : null)
    }, gLinks);
  });

  function radius(n) {
    return n.kind === "article" ? Math.min(11 + n.degree * 1.8, 24) : 9;
  }
  function short(s, n) { n = n || 26; return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function describe(n) {
    var kind = n.kind === "article" ? "Article" : "Source";
    var deg = n.degree === 1 ? "1 connection" : n.degree + " connections";
    return kind + ": " + n.label + (n.when ? ". " + n.when : "") +
      (n.kind === "article" ? ". Status " + n.status : "") + ". " + deg + ".";
  }

  var nodeEls = nodes.map(function (n, i) {
    var a = el("a", {
      class: "node node-" + n.kind + (n.status === "refuted" ? " node-refuted" : ""),
      tabindex: i === 0 ? "0" : "-1",
      draggable: "false",
      "aria-label": describe(n)
    }, gNodes);
    a.setAttribute("href", root + n.url);
    // A 28px invisible target under a mark that may be much smaller. 2.5.8
    // asks for 24 and a small dot on a big canvas is hard to hit.
    el("circle", { class: "hit", r: 15 }, a);
    el("circle", { class: "focusring", r: radius(n) + 7 }, a);
    if (n.kind === "article") {
      el("circle", { class: "node-shape", r: radius(n) }, a);
    } else {
      el("rect", { class: "node-shape", x: -8, y: -8, width: 16, height: 16, transform: "rotate(45)" }, a);
    }
    var t = el("text", { class: "node-label", "text-anchor": "middle", y: -(radius(n) + 10) }, a);
    t.textContent = short(n.label, n.kind === "article" ? 30 : 22);
    return a;
  });

  function neighboursOf(id) {
    var out = [];
    links.forEach(function (l) {
      var s = l.source.id || l.source, t = l.target.id || l.target;
      if (s === id) out.push(t); else if (t === id) out.push(s);
    });
    return out;
  }

  // ---------------------------------------------------------------- layout

  var sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(function (d) { return d.id; })
      .distance(function (l) { return l.kind === "cites" ? 110 : 155; }).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-620).distanceMax(1100))
    .force("collide", d3.forceCollide().radius(function (d) { return radius(d) + 26; }))
    .force("x", d3.forceX(0).strength(0.035))
    .force("y", d3.forceY(0).strength(0.035))
    .alphaMin(0.02)
    .on("tick", draw);

  function draw() {
    linkEls.forEach(function (e, i) {
      var l = links[i];
      e.setAttribute("x1", l.source.x); e.setAttribute("y1", l.source.y);
      e.setAttribute("x2", l.target.x); e.setAttribute("y2", l.target.y);
    });
    nodeEls.forEach(function (e, i) {
      e.setAttribute("transform", "translate(" + nodes[i].x.toFixed(1) + "," + nodes[i].y.toFixed(1) + ")");
    });
  }

  /// Frames whatever the layout turned out to be. Without this a two-node graph
  /// is two specks in the middle of a large empty box, and a large one runs off
  /// the edges.
  var view = { x: -500, y: -380, w: 1000, h: 760 };
  function fit(animate) {
    var vis = nodes.filter(function (n, i) { return !nodeEls[i].classList.contains("hidden"); });
    if (!vis.length) vis = nodes;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    vis.forEach(function (n) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    // The floor matters more than the ceiling. With two nodes the extent is
    // tiny, and fitting it exactly would zoom until the 12px labels rendered
    // at nearly thirty. Keeping a wide minimum holds the drawing at roughly
    // one to one until there is enough on it to need more.
    var pad = 170;
    var w = Math.max(maxX - minX + pad * 2, 1180);
    var h = Math.max(maxY - minY + pad * 2, 820);
    var box = svg.getBoundingClientRect();
    var ar = (box.width || 1000) / (box.height || 760);
    if (w / h < ar) w = h * ar; else h = w / ar;
    var target = { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w: w, h: h };
    if (animate && !reduced) tweenView(target, 520); else setView(target);
  }
  function setView(v) {
    view = v;
    svg.setAttribute("viewBox", v.x.toFixed(1) + " " + v.y.toFixed(1) + " " + v.w.toFixed(1) + " " + v.h.toFixed(1));
  }
  function tweenView(to, ms, done) {
    var from = { x: view.x, y: view.y, w: view.w, h: view.h };
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // ease in out
      setView({
        x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e
      });
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    })(t0);
  }

  if (reduced) {
    sim.stop();
    for (var i = 0; i < 320; i++) sim.tick();
    draw(); fit(false);
    if (pauseBtn) { pauseBtn.hidden = true; }
  } else {
    // 2.2.2: nothing moves past five seconds. An alpha floor and a hard stop,
    // because a dragged node can keep re-heating the first one on its own.
    setTimeout(function () { sim.stop(); setPaused(true); fit(true); }, 4600);
    sim.on("end", function () { fit(true); setPaused(true); });
  }

  var paused = false;
  function setPaused(p) {
    paused = p;
    if (!pauseBtn) return;
    pauseBtn.setAttribute("aria-pressed", String(p));
    pauseBtn.textContent = p ? "Resume motion" : "Pause motion";
  }
  if (pauseBtn && !reduced) {
    pauseBtn.addEventListener("click", function () {
      if (paused) { sim.alpha(0.45).restart(); setPaused(false); }
      else { sim.stop(); setPaused(true); }
    });
  }

  // ----------------------------------------------------------------- lenses

  var LENSES = ["all", "writing", "sources", "topics", "sessions"];
  var lens = "all", pick = null;
  var chipRows = {
    topics: document.getElementById("chips-topics"),
    sessions: document.getElementById("chips-sessions")
  };

  function visible(n) {
    if (lens === "writing") return n.kind === "article";
    if (lens === "sources") {
      return n.kind === "source" || neighboursOf(n.id).some(function (id) { return byId[id].kind === "source"; });
    }
    if (lens === "topics" && pick) {
      if (n.kind === "article") return (n.topics || []).indexOf(pick) >= 0;
      return neighboursOf(n.id).some(function (id) {
        var o = byId[id];
        return o.kind === "article" && (o.topics || []).indexOf(pick) >= 0;
      });
    }
    if (lens === "sessions" && pick) {
      if (n.kind === "article") return n.session === pick || n.when.indexOf(pick) === 0;
      return neighboursOf(n.id).some(function (id) { return byId[id].session === pick; });
    }
    return true;
  }

  function applyLens(animate) {
    var shown = {};
    nodes.forEach(function (n, i) {
      var v = visible(n);
      if (v) shown[n.id] = true;
      nodeEls[i].classList.toggle("hidden", !v);
    });
    linkEls.forEach(function (e, i) {
      var l = links[i], s = l.source.id || l.source, t = l.target.id || l.target;
      e.classList.toggle("hidden", !(shown[s] && shown[t]));
    });
    // Only the visible nodes take part, so the layout actually reorganises
    // rather than leaving holes where the hidden ones used to be.
    sim.force("charge").strength(function (d) { return shown[d.id] ? -620 : 0; });
    if (!reduced) { sim.alpha(0.55).restart(); setPaused(false); }
    else { for (var k = 0; k < 160; k++) sim.tick(); draw(); }
    setTimeout(function () { fit(animate); }, reduced ? 0 : 900);

    document.querySelectorAll(".lens").forEach(function (a) {
      a.setAttribute("aria-current", a.dataset.lens === lens ? "true" : "false");
    });
    Object.keys(chipRows).forEach(function (k) {
      if (chipRows[k]) chipRows[k].hidden = lens !== k;
    });
    if (status) {
      var n = Object.keys(shown).length;
      status.textContent = "Showing " + n + (n === 1 ? " node" : " nodes") +
        (pick ? " for " + pick : "") + ".";
    }
  }

  function setLens(next, chosen, push) {
    lens = LENSES.indexOf(next) >= 0 ? next : "all";
    pick = chosen || null;
    if (!pick && (lens === "topics" || lens === "sessions")) {
      var row = chipRows[lens];
      var first = row && row.querySelector(".chip");
      if (first) pick = first.dataset.topic || first.dataset.session;
    }
    Object.keys(chipRows).forEach(function (k) {
      if (!chipRows[k]) return;
      chipRows[k].querySelectorAll(".chip").forEach(function (b) {
        var v = b.dataset.topic || b.dataset.session;
        b.setAttribute("aria-pressed", String(k === lens && v === pick));
      });
    });
    if (push) {
      var h = "#" + lens + (pick ? "/" + pick : "");
      if (location.hash !== h) history.replaceState(null, "", h);
    }
    applyLens(true);
  }

  document.querySelectorAll(".lens").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      setLens(a.dataset.lens, null, true);
    });
  });
  Object.keys(chipRows).forEach(function (k) {
    if (!chipRows[k]) return;
    chipRows[k].addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      setLens(k, b.dataset.topic || b.dataset.session, true);
    });
  });

  function fromHash() {
    var h = (location.hash || "").replace(/^#/, "").split("/");
    setLens(h[0] || "all", h[1] ? decodeURIComponent(h[1]) : null, false);
  }
  window.addEventListener("hashchange", fromHash);

  // ------------------------------------------------------------ navigation

  // Clicking a node flies to it and then opens it. The flight is what makes
  // the map feel like a place rather than a picture, and it is skipped whole
  // when the reader has asked for less motion.
  var flying = false;
  gNodes.addEventListener("click", function (e) {
    var a = e.target.closest("a.node");
    if (!a) return;
    if (moved) { e.preventDefault(); moved = false; return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var i = nodeEls.indexOf(a);
    if (i < 0) return;
    e.preventDefault();
    var href = a.getAttribute("href");
    if (reduced) { location.href = href; return; }
    if (flying) return;
    flying = true;
    sim.stop();
    var n = nodes[i];
    svg.classList.add("flying");
    a.classList.add("chosen");
    tweenView({ x: n.x - 210, y: n.y - 160, w: 420, h: 320 }, 460, function () {
      location.href = href;
    });
  });

  // ------------------------------------------------------------------ drag

  var dragging = null, moved = false, downAt = null;
  var DRAG_SLOP = 5; // CSS px of travel before a press becomes a drag
  svg.addEventListener("pointerdown", function (e) {
    var a = e.target.closest("a.node");
    if (!a) return;
    var i = nodeEls.indexOf(a);
    if (i < 0) return;
    dragging = nodes[i];
    moved = false;
    downAt = { x: e.clientX, y: e.clientY };
    if (a.setPointerCapture) a.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    if (!moved && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < DRAG_SLOP) return;
    moved = true;
    e.preventDefault();
    var p = toLocal(e);
    dragging.fx = p.x; dragging.fy = p.y;
    if (reduced) { sim.tick(); draw(); }
    else { sim.alpha(Math.max(sim.alpha(), 0.3)).restart(); setPaused(false); }
    if (hint) hint.classList.add("gone");
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
    svg.addEventListener(ev, function () {
      if (!dragging) return;
      dragging.fx = null; dragging.fy = null;
      dragging = null;
      downAt = null;
    });
  });

  function toLocal(e) {
    var r = svg.getBoundingClientRect();
    return {
      x: view.x + ((e.clientX - r.left) / r.width) * view.w,
      y: view.y + ((e.clientY - r.top) / r.height) * view.h
    };
  }

  // ------------------------------------------------ focus and the keyboard

  var current = 0, step = 0;
  function focusNode(i, announce) {
    if (i < 0 || i >= nodeEls.length) return;
    nodeEls[current].setAttribute("tabindex", "-1");
    current = i;
    var a = nodeEls[current];
    a.setAttribute("tabindex", "0");
    a.focus({ preventScroll: true });
    highlight(nodes[current].id);
    if (announce && status) {
      var nb = neighboursOf(nodes[current].id).map(function (id) { return byId[id].label; });
      status.textContent = describe(nodes[current]) +
        (nb.length ? " Connected to: " + nb.slice(0, 6).join(", ") + "." : " No connections yet.");
    }
  }

  function highlight(id) {
    if (id === null) {
      nodeEls.forEach(function (e) { e.classList.remove("dim"); });
      linkEls.forEach(function (e) { e.classList.remove("dim"); });
      return;
    }
    var keep = {}; keep[id] = true;
    neighboursOf(id).forEach(function (n) { keep[n] = true; });
    nodeEls.forEach(function (e, i) { e.classList.toggle("dim", !keep[nodes[i].id]); });
    linkEls.forEach(function (e, i) {
      var l = links[i], s = l.source.id || l.source, t = l.target.id || l.target;
      e.classList.toggle("dim", !(s === id || t === id));
    });
  }

  // Chrome paints its own focus ring on a focused SVG anchor and honours no
  // outline rule about it: the computed outline-style reads "none" while the
  // ring is on screen. Since it cannot be styled away, the focus itself is
  // declined when it came from a pointer. A press should not leave an artefact
  // behind, and :focus-visible already says a mouse deserves no indicator.
  // Keyboard focus is untouched and still gets the drawn ring.
  var fromPointer = false;
  svg.addEventListener("pointerdown", function () { fromPointer = true; }, true);
  window.addEventListener("keydown", function () { fromPointer = false; }, true);

  gNodes.addEventListener("focusin", function (e) {
    var a = e.target.closest("a.node");
    if (!a) return;
    if (fromPointer) { a.blur(); return; }
    var i = nodeEls.indexOf(a);
    if (i >= 0 && i !== current) focusNode(i, true);
  });
  // Listen on the canvas, not on the nodes. A pointerover on a node tells you
  // what was entered; only a pointerover on everything tells you what was left,
  // which is why hovering used to stick after the cursor moved away.
  svg.addEventListener("pointerover", function (e) {
    if (dragging || document.activeElement === svg) return;
    var a = e.target.closest("a.node");
    if (a) highlight(nodes[nodeEls.indexOf(a)].id);
    else if (!gNodes.contains(document.activeElement)) highlight(null);
  });
  svg.addEventListener("pointerleave", function () {
    if (!dragging && !gNodes.contains(document.activeElement)) highlight(null);
  });

  svg.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "Escape") { highlight(null); svg.focus(); return; }
    if (k === " " && pauseBtn && !reduced) { e.preventDefault(); pauseBtn.click(); return; }
    if (k === "Home") { e.preventDefault(); focusNode(0, true); return; }
    if (k === "End") { e.preventDefault(); focusNode(nodeEls.length - 1, true); return; }
    if (k === "n" || k === "p") {
      e.preventDefault();
      var nb = neighboursOf(nodes[current].id);
      if (!nb.length) { if (status) status.textContent = "No connections yet."; return; }
      step += k === "n" ? 1 : -1;
      focusNode(nodes.indexOf(byId[nb[((step % nb.length) + nb.length) % nb.length]]), true);
      return;
    }
    var dirs = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (!dirs[k]) return;
    e.preventDefault();
    var d = dirs[k], from = nodes[current], best = -1, bestD = Infinity;
    nodes.forEach(function (n, i) {
      if (i === current || nodeEls[i].classList.contains("hidden")) return;
      var dx = n.x - from.x, dy = n.y - from.y, dist = Math.hypot(dx, dy);
      if (!dist || (dx * d[0] + dy * d[1]) / dist < 0.7071) return;
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best >= 0) focusNode(best, true);
  });

  // ----------------------------------------------------------------- filter

  if (filterBox) {
    filterBox.addEventListener("input", function () {
      var q = filterBox.value.trim().toLowerCase();
      if (!q) { highlight(null); return; }
      var hit = {};
      nodes.forEach(function (n) {
        var hay = (n.label + " " + n.status + " " + n.sub + " " + (n.topics || []).join(" ")).toLowerCase();
        if (hay.indexOf(q) >= 0) hit[n.id] = true;
      });
      nodeEls.forEach(function (e, i) { e.classList.toggle("dim", !hit[nodes[i].id]); });
      linkEls.forEach(function (e, i) {
        var l = links[i], s = l.source.id || l.source, t = l.target.id || l.target;
        e.classList.toggle("dim", !(hit[s] && hit[t]));
      });
      if (status) {
        var n = Object.keys(hit).length;
        status.textContent = n + (n === 1 ? " node matches" : " nodes match");
      }
    });
  }

  window.addEventListener("resize", function () { fit(false); });
  draw();
  fromHash();
  fit(false);
})();
