/* Travel journal – shared logic for index.html and trip.html. No build step needed. */
(function () {
  "use strict";
  var TRIPS = (window.TRIPS || []).slice();

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function parseDate(s) {
    if (!s) return null;
    var p = String(s).split("-").map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  var monthFmt = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });
  function dateRange(t) {
    var a = parseDate(t.start), b = parseDate(t.end);
    if (!a) return "";
    if (!b || (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())) return monthFmt.format(a);
    return monthFmt.format(a) + " – " + monthFmt.format(b);
  }
  function photoUrl(t, file) { return "trips/" + encodeURIComponent(t.id) + "/photos/" + encodeURIComponent(file); }
  function thumbUrl(t, file) { return "trips/" + encodeURIComponent(t.id) + "/thumbs/" + encodeURIComponent(file); }
  function coverFile(t) { return t.cover || (t.photos && t.photos[0] && t.photos[0].file) || ""; }
  function tripUrl(t) { return "trip.html?t=" + encodeURIComponent(t.id); }

  function pinIcon() {
    return L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [22, 15], iconAnchor: [11, 8], popupAnchor: [0, -8] });
  }
  function baseMap(el, opts) {
    var map = L.map(el, Object.assign({ scrollWheelZoom: false, worldCopyJump: true }, opts || {}));
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    return map;
  }

  // newest first; undated trips at the end
  TRIPS.sort(function (a, b) {
    var da = parseDate(a.start), db = parseDate(b.start);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });

  // ---------- home page ----------
  function home() {
    var count = document.getElementById("count");
    count.textContent = TRIPS.length === 1 ? "טיול אחד" : TRIPS.length + " טיולים";

    var map = baseMap("world-map", { minZoom: 2 });
    var markers = [];
    TRIPS.forEach(function (t) {
      if (typeof t.lat !== "number" || typeof t.lng !== "number") return;
      var cf = coverFile(t);
      var html = (cf ? '<img class="popup-img" src="' + thumbUrl(t, cf) + '" alt="">' : "") +
        '<a href="' + tripUrl(t) + '">' + esc(t.title) + "</a>" +
        (dateRange(t) ? "<br>" + esc(dateRange(t)) : "");
      var m = L.marker([t.lat, t.lng], { icon: pinIcon(), title: t.title }).bindPopup(html);
      m._region = t.region;
      markers.push(m);
    });

    function fit(list) {
      if (!list.length) { map.setView([31.5, 35], 3); return; }
      if (list.length === 1) { map.setView(list[0].getLatLng(), 5); return; }
      map.fitBounds(L.featureGroup(list).getBounds().pad(0.25), { maxZoom: 7 });
    }
    function render(filter) {
      var shown = [];
      markers.forEach(function (m) {
        var on = filter === "all" || m._region === filter;
        if (on) { m.addTo(map); shown.push(m); } else { map.removeLayer(m); }
      });
      fit(shown);
      renderList(filter);
    }
    document.querySelectorAll(".filters button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".filters button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        render(b.dataset.f);
      });
    });
    render("all");
  }

  function renderList(filter) {
    var main = document.getElementById("list");
    var list = TRIPS.filter(function (t) { return filter === "all" || t.region === filter; });
    if (!list.length) {
      main.innerHTML = '<p class="empty-note">אין עדיין טיולים בקטגוריה הזו. מוסיפים טיול בקובץ data/trips.js.</p>';
      return;
    }
    var html = "", lastYear = null;
    list.forEach(function (t) {
      var d = parseDate(t.start);
      var y = d ? String(d.getFullYear()) : "ללא תאריך";
      if (y !== lastYear) {
        if (lastYear !== null) html += "</ul>";
        html += '<h2 class="year">' + y + '</h2><ul class="trip-list">';
        lastYear = y;
      }
      var cf = coverFile(t);
      var img = cf
        ? '<img class="thumb" src="' + thumbUrl(t, cf) + '" alt="" loading="lazy">'
        : '<div class="thumb empty"><span class="blaze" aria-hidden="true"></span></div>';
      var meta = [t.where, dateRange(t)].filter(Boolean).map(esc).join(", ");
      html += '<li><a class="trip-row" href="' + tripUrl(t) + '">' + img +
        "<div><h3>" + esc(t.title) + '</h3><div class="trip-meta">' + meta + "</div>" +
        (t.summary ? "<p>" + esc(t.summary) + "</p>" : "") + "</div></a></li>";
    });
    html += "</ul>";
    main.innerHTML = html;
  }

  // ---------- trip page ----------
  function trip() {
    var id = new URLSearchParams(location.search).get("t");
    var t = TRIPS.filter(function (x) { return x.id === id; })[0];
    var root = document.getElementById("trip");
    if (!t) {
      root.innerHTML = '<div class="trip-head"><h1>הטיול לא נמצא</h1><p>ייתכן שהקישור שגוי. <a href="./">חזרה לכל הטיולים</a></p></div>';
      return;
    }
    document.title = t.title + " | הטיולים שלי";
    var photos = t.photos || [], videos = t.videos || [], links = t.links || [];
    var cf = coverFile(t);
    var meta = [t.where, dateRange(t)].filter(Boolean).map(esc).join(", ");

    var h = '<div class="trip-head"><a class="back" href="./">‹ כל הטיולים</a>' +
      "<h1>" + esc(t.title) + "</h1>" +
      (meta ? '<div class="trip-meta">' + meta + "</div>" : "") + "</div>" +
      '<main class="trip-body">';
    if (cf) h += '<img class="cover" src="' + photoUrl(t, cf) + '" alt="' + esc(t.title) + '">';
    if (t.story && t.story.length) {
      h += '<div class="story">' + t.story.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>";
    } else if (t.summary) {
      h += '<div class="story"><p>' + esc(t.summary) + "</p></div>";
    }
    if (typeof t.lat === "number") h += '<h2 class="section"><span class="blaze" aria-hidden="true"></span>המסלול</h2><div id="trip-map"></div>';
    if (photos.length) {
      h += '<h2 class="section"><span class="blaze" aria-hidden="true"></span>תמונות (' + photos.length + ')</h2><div class="gallery">' +
        photos.map(function (p, i) {
          return '<button type="button" data-i="' + i + '" aria-label="הגדלת תמונה ' + (i + 1) + '"><img src="' + thumbUrl(t, p.file) +
            '" alt="' + esc(p.caption || "") + '" loading="lazy"></button>';
        }).join("") + "</div>";
    }
    if (videos.length) {
      h += '<h2 class="section"><span class="blaze" aria-hidden="true"></span>סרטונים</h2><div class="videos">' +
        videos.map(function (v) {
          return '<div class="video"><figure><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.youtube) +
            '" title="' + esc(v.title || "סרטון") + '" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>' +
            (v.title ? "<figcaption>" + esc(v.title) + "</figcaption>" : "") + "</figure></div>";
        }).join("") + "</div>";
    }
    if (links.length) {
      h += '<h2 class="section"><span class="blaze" aria-hidden="true"></span>קישורים</h2><ul class="links">' +
        links.map(function (l) { return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a></li>"; }).join("") + "</ul>";
    }
    h += "</main>";
    root.innerHTML = h;

    if (typeof t.lat === "number") {
      var map = baseMap("trip-map");
      if (t.route && t.route.length > 1) {
        var line = L.polyline(t.route, { color: "#E2702A", weight: 4 }).addTo(map);
        L.marker(t.route[0], { icon: pinIcon(), title: "התחלה" }).addTo(map);
        map.fitBounds(line.getBounds().pad(0.15));
      } else {
        L.marker([t.lat, t.lng], { icon: pinIcon() }).addTo(map);
        map.setView([t.lat, t.lng], 7);
      }
    }
    if (photos.length) lightbox(t, photos);
  }

  // ---------- lightbox ----------
  function lightbox(t, photos) {
    var lb = document.getElementById("lb"), img = lb.querySelector("img"), cap = lb.querySelector(".cap");
    var i = 0, lastFocus = null;
    function show(n) {
      i = (n + photos.length) % photos.length;
      img.src = photoUrl(t, photos[i].file);
      img.alt = photos[i].caption || "";
      cap.textContent = (photos[i].caption ? photos[i].caption + "  " : "") + "(" + (i + 1) + "/" + photos.length + ")";
    }
    function open(n) { lastFocus = document.activeElement; show(n); lb.classList.add("open"); lb.querySelector(".close").focus(); }
    function close() { lb.classList.remove("open"); img.removeAttribute("src"); if (lastFocus) lastFocus.focus(); }
    document.querySelectorAll(".gallery button").forEach(function (b) {
      b.addEventListener("click", function () { open(Number(b.dataset.i)); });
    });
    lb.querySelector(".close").addEventListener("click", close);
    lb.querySelector(".prev").addEventListener("click", function () { show(i - 1); });
    lb.querySelector(".next").addEventListener("click", function () { show(i + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(i + 1);   // RTL: left = next
      if (e.key === "ArrowRight") show(i - 1);
    });
    var x0 = null;
    lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) show(dx < 0 ? i + 1 : i - 1);
      x0 = null;
    });
  }

  window.Travels = { home: home, trip: trip };
})();
