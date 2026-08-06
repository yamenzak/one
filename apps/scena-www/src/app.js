/* Scena marketing — progressive enhancement. The page is fully readable without
   JS; this adds the theme toggle, language menu, the in-frame product demo
   (tab switch + live board + clocks), and scroll reveals. */
(function () {
  "use strict";
  var root = document.documentElement;

  /* theme toggle (initial theme is set by an inline head script to avoid FOUC) */
  var tt = document.getElementById("theme-toggle");
  if (tt)
    tt.addEventListener("click", function () {
      var cur = root.getAttribute("data-theme");
      var isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      var next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("scena-theme", next); } catch (e) {}
    });

  /* language menu */
  var lb = document.getElementById("lang-btn");
  var lm = document.getElementById("lang-menu");
  if (lb && lm) {
    lb.addEventListener("click", function (e) {
      e.stopPropagation();
      lm.classList.toggle("open");
    });
    document.addEventListener("click", function () { lm.classList.remove("open"); });
  }

  /* in-frame tab switching */
  var tabs = document.querySelectorAll(".atab");
  var views = document.querySelectorAll(".view");
  var crumb = document.getElementById("crumb");
  function go(v) {
    tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.view === v); });
    views.forEach(function (s) { s.classList.toggle("show", s.dataset.v === v); });
    var t = document.querySelector('.atab[data-view="' + v + '"]');
    if (crumb && t) crumb.textContent = t.textContent;
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { go(t.dataset.view); }); });
  document.querySelectorAll("[data-goto]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.querySelectorAll(".side-item").forEach(function (s) { s.classList.remove("active"); });
      el.classList.add("active");
      go(el.dataset.goto);
    });
  });

  /* Auto-playing product tour: cycle the frame's tabs until the visitor takes
     over — only while the frame is on screen, and never under reduced-motion. */
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (tabs.length && !reduce) {
    var tour = ["devices", "channel", "board"], ti = 0, playing = true, onScreen = false;
    document.querySelectorAll(".atab,[data-goto],#bd-next,#bd-recall,#to-board").forEach(function (el) {
      el.addEventListener("click", function () { playing = false; });
    });
    var frame = document.getElementById("product");
    if (frame && "IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; }, { threshold: 0.35 }).observe(frame);
    } else { onScreen = true; }
    setInterval(function () {
      if (!playing || !onScreen || document.hidden) return;
      ti = (ti + 1) % tour.length;
      go(tour[ti]);
    }, 4200);
  }

  /* live board — press "Call next" to advance the queue */
  var num = 42, desk = 3, recent = [[41, 2], [40, 1], [39, 3]];
  var bdNo = document.getElementById("bd-no"), bdCt = document.getElementById("bd-ct"),
      ctrlNo = document.getElementById("ctrl-no"), bdRecent = document.getElementById("bd-recent"),
      counterLabel = (bdCt && bdCt.dataset.label) || "COUNTER";
  function renderRecent() {
    if (!bdRecent) return;
    bdRecent.innerHTML = recent.slice(0, 3).map(function (r) {
      return '<div class="rr"><span>A-' + r[0] + "</span><span>" + r[1] + "</span></div>";
    }).join("");
  }
  function bump() { if (bdNo) { bdNo.classList.remove("bump"); void bdNo.offsetWidth; bdNo.classList.add("bump"); } }
  var next = document.getElementById("bd-next");
  if (next)
    next.addEventListener("click", function () {
      recent.unshift([num, desk]); num++; desk = (desk % 3) + 1;
      var t = "A-" + num;
      if (bdNo) bdNo.textContent = t;
      if (bdCt) bdCt.textContent = counterLabel + " " + desk;
      if (ctrlNo) ctrlNo.textContent = t;
      bump(); renderRecent();
    });
  var recall = document.getElementById("bd-recall");
  if (recall) recall.addEventListener("click", bump);

  /* live clocks + countdown */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tick() {
    var d = new Date(), t = pad(d.getHours()) + ":" + pad(d.getMinutes());
    var ec = document.getElementById("ed-clock"); if (ec) ec.textContent = t;
    var wc = document.getElementById("w-clock"); if (wc) wc.textContent = t;
    var cd = document.getElementById("w-cd");
    if (cd) {
      var s = 2 * 3600 + 14 * 60 + 58 - (d.getSeconds() % 3600);
      cd.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor((s % 3600) / 60)) + ":" + pad(s % 60);
    }
  }
  tick(); setInterval(tick, 1000);

  /* editor promo cycling — headlines come from data-promos (JSON, localized) */
  var h = document.getElementById("ed-promo"), sub = document.getElementById("ed-promo-sub");
  var promos = [];
  try { promos = JSON.parse((h && h.dataset.promos) || "[]"); } catch (e) {}
  if (h && promos.length) {
    var pi = 0;
    setInterval(function () {
      pi = (pi + 1) % promos.length;
      h.style.opacity = 0;
      setTimeout(function () {
        h.textContent = promos[pi][0];
        if (sub) sub.textContent = promos[pi][1];
        h.style.transition = "opacity .3s"; h.style.opacity = 1;
      }, 180);
    }, 2600);
  }
  var pos = document.getElementById("tl-pos");
  if (pos) { var t0 = 0; setInterval(function () { t0 = (t0 + 1) % 24; pos.textContent = "00:" + pad(t0); }, 375); }

  /* "try the live board" deep link */
  var toBoard = document.getElementById("to-board");
  if (toBoard)
    toBoard.addEventListener("click", function (e) {
      e.preventDefault();
      go("board");
      var p = document.getElementById("product");
      if (p) p.scrollIntoView({ behavior: "smooth" });
    });

  /* scroll reveal */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }
})();
