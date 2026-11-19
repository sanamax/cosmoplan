/* ============================================================
   scene.js — 3D-сцена: текстуры, орбиты, виды, метки, кольца
   ============================================================ */
(function () {
  "use strict";

  var D = window.CosmoData;
  var S = window.Store;

  /* Базовая угловая скорость: один оборот ближней орбиты ≈ 7 минут */
  var BASE_OMEGA = (Math.PI * 2) / 420;
  var TAU = Math.PI * 2;

  /* Визуальные множители радиуса по типу объекта */
  var RADIUS_SCALE = { group: 0.55, company: 1.5, goal: 1.55, project: 1.0, task: 0.9, subtask: 0.85 };

  var canvas = null;
  var labelLayer = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var controls = null;
  var raycaster = null;
  var pointer = new THREE.Vector2();
  var clock = null;

  var contents = null;          /* корневая группа сцены (пересоздаётся) */
  var entities = {};            /* id → entity */
  var pickables = [];
  var pivots = [];              /* { obj, pivot, phase } */
  var disposables = [];         /* геометрии/материалы/текстуры сцены */
  var linkVisuals = [];
  var labelEls = [];

  var ringLayer = null;
  var selectionRing = null;
  var fire = null;
  var fireTargetId = null;

  var simTime = 0;      /* время эффектов: всегда идёт */
  var orbitTime = 0;    /* время орбит: замирает при открытой карточке */
  var frozen = false;
  var initialized = false;
  var tween = null;
  var currentView = "group";
  var visibleIds = [];
  var pointerDownAt = null;
  var pointerDownPos = { x: 0, y: 0 };
  var lastCameraSave = 0;
  var needsRebuild = false;

  var texCache = {};
  var orbitMins = {};
  var glowCache = {};
  var ringGeoCache = {};

  /* ============================================================
     Процедурные текстуры
     ============================================================ */
  function mkCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = w || 512;
    c.height = h || 256;
    return c;
  }

  function rnd(seed) {
    var s = seed || 1;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function hsl(h, s, l, a) {
    return "hsla(" + h + "," + s + "%," + l + "%," + (a == null ? 1 : a) + ")";
  }

  function fillNoise(ctx, w, h, baseHue, sat, light, r) {
    ctx.fillStyle = hsl(baseHue, sat, light);
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      var x = r() * w, y = r() * h, rad = 1 + r() * 26;
      var l = light + (r() - 0.5) * 16;
      ctx.fillStyle = hsl(baseHue + (r() - 0.5) * 16, sat, Math.max(6, Math.min(92, l)), 0.10 + r() * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  }

  function bands(ctx, w, h, hue, sat, light, count, wobble, r) {
    var step = h / count;
    for (var i = 0; i < count; i++) {
      var y = i * step;
      var l = light + Math.sin(i * 1.7) * 9 + (r() - 0.5) * 7;
      ctx.fillStyle = hsl(hue + Math.sin(i * 0.9) * 12, sat, Math.max(8, Math.min(92, l)), 0.85);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (var x = 0; x <= w; x += 8) {
        var yy = y + Math.sin(x / w * TAU * 3 + i) * wobble + Math.sin(x / w * TAU * 7 + i * 2) * wobble * 0.4;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w, y + step + 2);
      ctx.lineTo(0, y + step + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function craters(ctx, w, h, count, r, minR, maxR) {
    for (var i = 0; i < count; i++) {
      var x = r() * w, y = r() * h, rad = minR + r() * (maxR - minR);
      var g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
      g.addColorStop(0, "rgba(0,0,0,0.34)");
      g.addColorStop(0.65, "rgba(0,0,0,0.16)");
      g.addColorStop(0.86, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, TAU);
      ctx.fill();
    }
  }

  function blobs(ctx, w, h, count, hue, sat, light, alpha, r) {
    for (var i = 0; i < count; i++) {
      var x = r() * w, y = h * 0.15 + r() * h * 0.7;
      var rad = 10 + r() * 42;
      ctx.fillStyle = hsl(hue + (r() - 0.5) * 22, sat, light + (r() - 0.5) * 14, alpha);
      ctx.beginPath();
      for (var a = 0; a <= TAU + 0.1; a += 0.28) {
        var rr = rad * (0.6 + r() * 0.6);
        var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
        if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  var TEXTURE_PAINTERS = {
    earth: function (ctx, w, h, r) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1a4b8f"); g.addColorStop(0.5, "#1e6bb0"); g.addColorStop(1, "#123b73");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.9;
      blobs(ctx, w, h, 26, 105, 42, 34, 0.9, r);
      blobs(ctx, w, h, 12, 70, 30, 48, 0.55, r);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(0, 0, w, h * 0.06);
      ctx.fillRect(0, h * 0.94, w, h * 0.06);
      for (var i = 0; i < 30; i++) {
        ctx.fillStyle = "rgba(255,255,255," + (0.06 + r() * 0.12) + ")";
        ctx.beginPath();
        ctx.ellipse(r() * w, h * 0.15 + r() * h * 0.7, 12 + r() * 40, 5 + r() * 9, r() * 0.6, 0, TAU);
        ctx.fill();
      }
    },
    mars: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 18, 52, 42, r);
      blobs(ctx, w, h, 22, 16, 46, 32, 0.5, r);
      craters(ctx, w, h, 40, r, 3, 16);
      ctx.fillStyle = "rgba(255,245,240,0.75)";
      ctx.fillRect(0, 0, w, h * 0.05);
      ctx.fillRect(0, h * 0.95, w, h * 0.05);
    },
    jupiter: function (ctx, w, h, r) {
      bands(ctx, w, h, 28, 46, 60, 22, 4, r);
      ctx.globalAlpha = 0.35;
      blobs(ctx, w, h, 14, 30, 40, 68, 0.6, r);
      ctx.globalAlpha = 1;
      var g = ctx.createRadialGradient(w * 0.7, h * 0.62, 2, w * 0.7, h * 0.62, 26);
      g.addColorStop(0, "rgba(200,90,60,0.95)");
      g.addColorStop(1, "rgba(200,90,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(w * 0.7, h * 0.62, 26, 13, 0, 0, TAU); ctx.fill();
    },
    saturn: function (ctx, w, h, r) {
      bands(ctx, w, h, 42, 34, 70, 18, 3, r);
      ctx.fillStyle = "rgba(255,248,225,0.18)";
      ctx.fillRect(0, 0, w, h);
    },
    venus: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 43, 45, 68, r);
      ctx.globalAlpha = 0.5;
      bands(ctx, w, h, 44, 38, 72, 10, 9, r);
      ctx.globalAlpha = 1;
    },
    mercury: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 30, 6, 46, r);
      craters(ctx, w, h, 90, r, 3, 20);
    },
    moon: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 210, 5, 52, r);
      ctx.fillStyle = "rgba(30,32,44,0.42)";
      for (var i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.ellipse(r() * w, h * 0.2 + r() * h * 0.6, 20 + r() * 46, 12 + r() * 26, r(), 0, TAU);
        ctx.fill();
      }
      craters(ctx, w, h, 60, r, 4, 22);
    },
    neptune: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 225, 62, 34, r);
      ctx.globalAlpha = 0.45;
      bands(ctx, w, h, 228, 55, 38, 9, 5, r);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(12,20,66,0.55)";
      ctx.beginPath(); ctx.ellipse(w * 0.35, h * 0.6, 38, 16, 0, 0, TAU); ctx.fill();
    },
    uranus: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 186, 40, 64, r);
      ctx.globalAlpha = 0.28;
      bands(ctx, w, h, 188, 34, 68, 8, 3, r);
      ctx.globalAlpha = 1;
    },
    lava: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 12, 24, 13, r);
      ctx.lineCap = "round";
      for (var i = 0; i < 46; i++) {
        var x = r() * w, y = r() * h;
        ctx.strokeStyle = "hsla(" + (12 + r() * 36) + ",100%," + (52 + r() * 22) + "%,0.9)";
        ctx.lineWidth = 0.8 + r() * 2.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (var k = 0; k < 7; k++) {
          x += (r() - 0.5) * 42; y += (r() - 0.5) * 22;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.32;
      blobs(ctx, w, h, 22, 20, 96, 46, 0.7, r);
      ctx.globalAlpha = 1;
    },
    ice: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 195, 32, 76, r);
      for (var i = 0; i < 60; i++) {
        ctx.strokeStyle = "rgba(120,190,255," + (0.2 + r() * 0.4) + ")";
        ctx.lineWidth = 0.6 + r() * 1.6;
        ctx.beginPath();
        var x = r() * w, y = r() * h;
        ctx.moveTo(x, y);
        for (var k = 0; k < 4; k++) { x += (r() - 0.4) * 50; y += (r() - 0.5) * 26; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    },
    gas: function (ctx, w, h, r) {
      bands(ctx, w, h, 268, 28, 62, 16, 6, r);
      ctx.globalAlpha = 0.4;
      blobs(ctx, w, h, 18, 300, 30, 66, 0.6, r);
      ctx.globalAlpha = 1;
    },
    desert: function (ctx, w, h, r) {
      fillNoise(ctx, w, h, 36, 48, 62, r);
      ctx.lineWidth = 2;
      for (var i = 0; i < 60; i++) {
        ctx.strokeStyle = "hsla(" + (30 + r() * 14) + "," + (40 + r() * 20) + "%," + (46 + r() * 26) + "%,0.5)";
        ctx.beginPath();
        var y = r() * h;
        ctx.moveTo(0, y);
        for (var x = 0; x <= w; x += 10) ctx.lineTo(x, y + Math.sin(x / 34 + i) * 6);
        ctx.stroke();
      }
    },
    ocean: function (ctx, w, h, r) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0b3f78"); g.addColorStop(0.5, "#125ea8"); g.addColorStop(1, "#0a2f5e");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 90; i++) {
        ctx.strokeStyle = "rgba(150,220,255," + (0.06 + r() * 0.16) + ")";
        ctx.lineWidth = 1 + r() * 3;
        ctx.beginPath();
        var y = r() * h;
        ctx.moveTo(0, y);
        for (var x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x / 40 + i) * 4);
        ctx.stroke();
      }
      blobs(ctx, w, h, 8, 120, 45, 40, 0.35, r);
      ctx.fillStyle = "rgba(240,250,255,0.75)";
      ctx.fillRect(0, 0, w, h * 0.04);
      ctx.fillRect(0, h * 0.96, w, h * 0.04);
    },
    crystal: function (ctx, w, h, r) {
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#5b3f8f"); g.addColorStop(0.5, "#8f6fd6"); g.addColorStop(1, "#3f2a6b");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 70; i++) {
        var x = r() * w, y = r() * h, s = 12 + r() * 44;
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s * 0.8, y);
        ctx.lineTo(x, y + s * 0.7);
        ctx.lineTo(x - s * 0.7, y);
        ctx.closePath();
        ctx.fillStyle = "hsla(" + (255 + r() * 40) + "," + (50 + r() * 30) + "%," + (60 + r() * 26) + "%," + (0.16 + r() * 0.3) + ")";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    },
    tech: function (ctx, w, h, r) {
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0a1226"); g.addColorStop(1, "#050a18");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(72,224,255,0.32)";
      ctx.lineWidth = 1;
      for (var i = 0; i < 26; i++) {
        ctx.beginPath();
        var y = (i / 26) * h;
        ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (var j = 0; j < 40; j++) {
        var x = (j / 40) * w;
        ctx.globalAlpha = 0.1 + r() * 0.2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (var k = 0; k < 90; k++) {
        var px = Math.round(r() * 64) / 64 * w, py = Math.round(r() * 32) / 32 * h;
        ctx.fillStyle = "rgba(120,240,255," + (0.4 + r() * 0.6) + ")";
        ctx.fillRect(px, py, 2 + r() * 5, 2 + r() * 5);
      }
      ctx.strokeStyle = "rgba(140,120,255,0.55)";
      ctx.lineWidth = 2;
      for (var m = 0; m < 14; m++) {
        ctx.beginPath();
        var sx = r() * w, sy = r() * h;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (r() - 0.5) * 90, sy);
        ctx.lineTo(sx + (r() - 0.5) * 90, sy + (r() - 0.5) * 60);
        ctx.stroke();
      }
    }
  };

  function getSurfaceTexture(id) {
    if (texCache[id]) return texCache[id];
    var w = 512, h = 256;
    var c = mkCanvas(w, h);
    var ctx = c.getContext("2d");
    var painter = TEXTURE_PAINTERS[id] || TEXTURE_PAINTERS.earth;
    var seedMap = { earth: 7, mars: 13, jupiter: 21, saturn: 29, venus: 37, mercury: 41, moon: 43, neptune: 47, uranus: 53, lava: 59, ice: 61, desert: 67, ocean: 71, crystal: 73, tech: 79, gas: 83 };
    painter(ctx, w, h, rnd(seedMap[id] || 11));
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    texCache[id] = tex;
    return tex;
  }

  function getGlowTexture() {
    if (glowCache.glow) return glowCache.glow;
    var size = 256;
    var c = mkCanvas(size, size);
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.16, "rgba(255,246,222,0.86)");
    g.addColorStop(0.36, "rgba(255,206,120,0.42)");
    g.addColorStop(0.66, "rgba(255,150,60,0.12)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    glowCache.glow = tex;
    return tex;
  }

  function getStarTexture() {
    if (glowCache.star) return glowCache.star;
    var size = 64;
    var c = mkCanvas(size, size);
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(200,225,255,0.7)");
    g.addColorStop(1, "rgba(140,180,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    glowCache.star = tex;
    return tex;
  }

  function getParticleTexture() {
    if (glowCache.particle) return glowCache.particle;
    var size = 32;
    var c = mkCanvas(size, size);
    var ctx = c.getContext("2d");
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,235,190,0.85)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    glowCache.particle = tex;
    return tex;
  }

  function getNebulaTexture(hue) {
    var key = "neb" + hue;
    if (glowCache[key]) return glowCache[key];
    var size = 512;
    var c = mkCanvas(size, size);
    var ctx = c.getContext("2d");
    var r = rnd(hue * 7 + 3);
    for (var i = 0; i < 26; i++) {
      var x = size * (0.2 + r() * 0.6), y = size * (0.2 + r() * 0.6), rad = size * (0.1 + r() * 0.26);
      var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, "hsla(" + (hue + (r() - 0.5) * 50) + ",80%," + (52 + r() * 16) + "%," + (0.10 + r() * 0.14) + ")");
      g.addColorStop(1, "hsla(" + hue + ",80%,40%,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    glowCache[key] = tex;
    return tex;
  }

  function getRingTexture() {
    if (glowCache.ring) return glowCache.ring;
    var w = 256, h = 16;
    var c = mkCanvas(w, h);
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    for (var x = 0; x < w; x++) {
      var t = x / w;
      var a = (0.12 + Math.abs(Math.sin(t * 26)) * 0.34) * (1 - Math.abs(t - 0.5) * 0.8);
      if (t > 0.42 && t < 0.5) a *= 0.25;
      ctx.fillStyle = "rgba(255,238,206," + Math.max(0, Math.min(0.85, a)) + ")";
      ctx.fillRect(x, 0, 1, h);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    glowCache.ring = tex;
    return tex;
  }

  /* ============================================================
     Служебные функции сцены
     ============================================================ */
  function track(obj) {
    if (obj) disposables.push(obj);
    return obj;
  }

  function disposeAll() {
    disposables.forEach(function (d) {
      if (d && typeof d.dispose === "function") {
        try { d.dispose(); } catch (e) { /* пропускаем */ }
      }
    });
    disposables = [];
  }

  function colorOf(obj) {
    return new THREE.Color(obj.color || "#7c8cff");
  }

  function tintColor(obj) {
    var c = colorOf(obj);
    var white = new THREE.Color(0xffffff);
    return white.lerp(c, 0.62);
  }

  function visualRadius(obj) {
    return Math.max(0.12, obj.size * (RADIUS_SCALE[obj.type] || 1));
  }

  function isCompany(type) { return type === "company"; }
  function isGoal(type) { return type === "goal"; }

  /* ---------- Слои ---------- */
  function clearContents() {
    /* удаляем DOM-метки */
    labelEls.forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    labelEls = [];
    if (labelLayer) labelLayer.innerHTML = "";

    if (contents) {
      scene.remove(contents);
      contents.traverse(function (o) {
        if (o.isCSS2DObject && o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element);
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) {
            if (m.map && m.map.__keep !== true && m.map !== getGlowTexture() && m.map !== getStarTexture() &&
                m.map !== getParticleTexture() && m.map !== getRingTexture()) {
              /* текстуры фактур кэшированы — не удаляем */
            }
            if (m.dispose) m.dispose();
          });
        }
      });
      contents = null;
    }
    entities = {};
    ringLayer = null;
    pickables = [];
    pivots = [];
    linkVisuals = [];
    selectionRing = null;
    fire = null;
    disposeAll();
    visibleIds = [];
  }

  function makeStarField() {
    var count = 2600;
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var r = rnd(97);
    for (var i = 0; i < count; i++) {
      var radius = 300 + r() * 520;
      var theta = r() * TAU;
      var phi = Math.acos(2 * r() - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi) * 0.8;
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      var t = r();
      col[i * 3] = 0.72 + t * 0.28;
      col[i * 3 + 1] = 0.78 + t * 0.22;
      col[i * 3 + 2] = 0.9 + t * 0.1;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: 2.4,
      map: getStarTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false
    });
    track(mat);
    track(geo);
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  function makeNebulae() {
    var group = new THREE.Group();
    var defs = [
      { hue: 265, pos: [-260, 120, -420], scale: 720 },
      { hue: 205, pos: [380, -90, -300], scale: 620 },
      { hue: 320, pos: [90, 220, -520], scale: 520 }
    ];
    defs.forEach(function (d) {
      var tex = getNebulaTexture(d.hue);
      var mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending, color: 0xffffff
      });
      track(mat);
      var sp = new THREE.Sprite(mat);
      sp.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sp.scale.set(d.scale, d.scale * 0.7, 1);
      group.add(sp);
    });
    return group;
  }

  /* ---------- Меши объектов ---------- */
  function makeGlowSprite(color, scale, opacity) {
    var mat = new THREE.SpriteMaterial({
      map: getGlowTexture(), color: color, transparent: true,
      opacity: opacity == null ? 0.85 : opacity, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    track(mat);
    var sp = new THREE.Sprite(mat);
    sp.scale.set(scale, scale, 1);
    return sp;
  }

  function makePlanetMesh(obj) {
    var radius = visualRadius(obj);
    var geo = track(new THREE.SphereGeometry(radius, 34, 24));
    var tex = getSurfaceTexture(obj.texture);
    var mat = track(new THREE.MeshStandardMaterial({
      map: tex,
      color: tintColor(obj),
      roughness: 0.92,
      metalness: 0.06,
      emissive: colorOf(obj).clone().multiplyScalar(obj.type === "subtask" ? 0.28 : 0.14),
      emissiveMap: tex
    }));
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData.objectId = obj.id;
    pickables.push(mesh);

    var group = new THREE.Group();
    group.add(mesh);

    /* атмосферное свечение */
    var halo = makeGlowSprite("#ffffff", radius * 3.2, 0.16);
    halo.material.color = colorOf(obj).clone().lerp(new THREE.Color(0xffffff), 0.4);
    group.add(halo);

    if (obj.texture === "saturn") {
      var ringGeo = track(new THREE.RingGeometry(radius * 1.45, radius * 2.35, 64));
      var ringMat = track(new THREE.MeshBasicMaterial({
        map: getRingTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false, color: colorOf(obj).clone().lerp(new THREE.Color(0xffffff), 0.7)
      }));
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2.35;
      ring.userData.saturnRing = true;
      group.add(ring);
      group.userData.saturnRing = ring;
    }

    return group;
  }

  function makeGoalSun(obj) {
    var radius = visualRadius(obj);
    var group = new THREE.Group();
    var geo = track(new THREE.SphereGeometry(radius, 40, 28));
    var tex = getSurfaceTexture(obj.texture === "moon" || obj.texture === "mercury" ? obj.texture : "venus");
    var baseColor = colorOf(obj);
    var mat = track(new THREE.MeshBasicMaterial({
      map: tex, color: baseColor.clone().lerp(new THREE.Color(0xffffff), 0.55)
    }));
    var core = new THREE.Mesh(geo, mat);
    core.userData.objectId = obj.id;
    pickables.push(core);
    group.add(core);

    /* корона: несколько пульсирующих спрайтов */
    var corona1 = makeGlowSprite(baseColor, radius * 3.6, 0.9);
    corona1.userData.corona = 1;
    group.add(corona1);
    var corona2 = makeGlowSprite(new THREE.Color(0xffffff).lerp(baseColor, 0.35), radius * 1.95, 0.72);
    corona2.userData.corona = 2;
    group.add(corona2);

    /* протуберанцы — кольца аддитивно */
    var ringGeo = track(new THREE.RingGeometry(radius * 1.16, radius * 1.34, 96));
    var ringMat = track(new THREE.MeshBasicMaterial({
      color: baseColor, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.userData.spin = 0.16;
    group.add(ring);

    var ring2 = ring.clone();
    ring2.geometry = track(new THREE.RingGeometry(radius * 1.4, radius * 1.5, 96));
    ring2.material = ringMat.clone();
    track(ring2.material);
    ring2.rotation.set(Math.PI / 3, 0.6, 0);
    ring2.userData.spin = -0.22;
    group.add(ring2);

    group.userData.coronas = [corona1, corona2];
    return group;
  }

  function makeGalaxy(obj, asGoal) {
    var radius = visualRadius(obj);
    var color = colorOf(obj);
    var group = new THREE.Group();
    var coreSize = radius * (asGoal ? 0.42 : 0.5);
    var pointCount = asGoal ? 2400 : 3200;
    var geo = track(new THREE.BufferGeometry());
    var positions = new Float32Array(pointCount * 3);
    var colors = new Float32Array(pointCount * 3);
    var r = rnd(obj.id.split("").reduce(function (a, c) { return a + c.charCodeAt(0); }, 7));
    var arms = asGoal ? 2 : 3;
    for (var i = 0; i < pointCount; i++) {
      var t = Math.pow(r(), 0.62);
      var arm = Math.floor(r() * arms);
      var angle = arm * (TAU / arms) + t * (asGoal ? 3.4 : 4.6) + (r() - 0.5) * 0.5;
      var dist = t * radius * 0.94;
      var spread = (0.09 + t * 0.24) * radius * (0.3 + r() * 0.7);
      positions[i * 3] = Math.cos(angle) * dist + (r() - 0.5) * spread;
      positions[i * 3 + 1] = (r() - 0.5) * spread * 0.32;
      positions[i * 3 + 2] = Math.sin(angle) * dist + (r() - 0.5) * spread;
      var c = color.clone().lerp(new THREE.Color(0xffffff), 0.15 + r() * 0.55);
      if (r() > 0.86) c.lerp(new THREE.Color(0x9fd0ff), 0.6);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    var mat = track(new THREE.PointsMaterial({
      size: radius * (asGoal ? 0.05 : 0.045),
      map: getParticleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    }));
    var points = new THREE.Points(geo, mat);
    group.add(points);
    group.userData.spinPoints = points;

    /* ядро */
    var coreGeo = track(new THREE.SphereGeometry(coreSize, 20, 14));
    var coreMat = track(new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.45) }));
    var core = new THREE.Mesh(coreGeo, coreMat);
    core.userData.objectId = obj.id;
    pickables.push(core);
    group.add(core);

    var halo = makeGlowSprite(color, coreSize * 3.6, 0.5);
    group.add(halo);
    var halo2 = makeGlowSprite(new THREE.Color(0xffffff).lerp(color, 0.4), coreSize * 1.9, 0.45);
    group.add(halo2);

    /* невидимая сфера для кликов по всей галактике */
    var pickGeo = track(new THREE.SphereGeometry(radius * 0.86, 12, 8));
    var pickMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    var pickMesh = new THREE.Mesh(pickGeo, pickMat);
    pickMesh.userData.objectId = obj.id;
    pickMesh.userData.pickPriority = 2;
    pickables.push(pickMesh);
    group.add(pickMesh);

    return group;
  }

  /* ---------- Связи и энергия ---------- */
  function makeLinkGeometry(start, end) {
    var mid = start.clone().add(end).multiplyScalar(0.5);
    var dist = start.distanceTo(end);
    var perp = end.clone().sub(start).normalize().cross(new THREE.Vector3(0, 1, 0));
    if (perp.lengthSq() < 0.001) perp.set(1, 0, 0);
    mid.add(perp.multiplyScalar(dist * 0.10));
    var curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    var tubular = Math.max(26, Math.min(96, Math.round(curve.getLength() * 1.6)));
    var geo = new THREE.TubeGeometry(curve, tubular, Math.max(0.035, Math.min(1.6, dist * 0.0045)), 8, false);
    return { curve: curve, geo: geo, dist: dist };
  }

  function createLinkVisual(cfg) {
    var geomInfo = makeLinkGeometry(cfg.start, cfg.end);
    var uniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(cfg.colorA) },
      uColorB: { value: new THREE.Color(cfg.colorB) },
      uDir: { value: cfg.flow === "both" ? 1 : (cfg.flow === "in" ? -1 : 1) },
      uSpeed: { value: 0.85 + Math.random() * 0.3 },
      uBidirectional: { value: cfg.flow === "both" ? 1 : 0 }
    };
    var mat = track(new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: [
        "varying vec2 vUv;",
        "void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
      ].join("\n"),
      fragmentShader: [
        "uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB;",
        "uniform float uDir; uniform float uSpeed; uniform float uBidirectional;",
        "varying vec2 vUv;",
        "float pulseAt(float x){",
        "  float flow = fract(x);",
        "  return smoothstep(0.0, 0.42, flow) * smoothstep(1.0, 0.58, flow);",
        "}",
        "void main(){",
        "  float p1 = pulseAt(vUv.x * 3.0 * uDir - uTime * uSpeed);",
        "  float p2 = uBidirectional > 0.5 ? pulseAt(-vUv.x * 3.0 - uTime * uSpeed) : 0.0;",
        "  float pulse = max(p1, p2);",
        "  vec3 col = mix(uColorA, uColorB, vUv.x);",
        "  float edge = 0.65 + 0.35 * sin(vUv.y * 3.14159);",
        "  float a = (0.10 + pulse * 0.95) * edge;",
        "  gl_FragColor = vec4(col * (0.55 + pulse * 1.7), a);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));

    var tube = new THREE.Mesh(geomInfo.geo, mat);
    tube.frustumCulled = false;

    var pCount = Math.max(3, Math.min(18, Math.round(geomInfo.dist / 3)));
    var pGeo = track(new THREE.BufferGeometry());
    var pPos = new Float32Array(pCount * 3);
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    var pMat = track(new THREE.PointsMaterial({
      size: Math.max(0.18, geomInfo.dist * 0.024),
      map: getParticleTexture(),
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(cfg.colorB).lerp(new THREE.Color(0xffffff), 0.4)
    }));
    var particles = new THREE.Points(pGeo, pMat);
    particles.frustumCulled = false;

    var group = new THREE.Group();
    group.add(tube);
    group.add(particles);
    contents.add(group);

    var lv = {
      group: group,
      tube: tube,
      uniforms: uniforms,
      particles: particles,
      positions: pPos,
      count: pCount,
      offsets: [],
      dir: cfg.flow === "in" ? -1 : 1,
      flow: cfg.flow,
      dynamic: !!cfg.dynamic,
      aId: cfg.aId || null,
      bId: cfg.bId || null,
      aPos: cfg.start.clone(),
      bPos: cfg.end.clone(),
      curve: geomInfo.curve,
      frame: 0
    };
    for (var i = 0; i < pCount; i++) lv.offsets.push(i / pCount + Math.random() * 0.04);
    linkVisuals.push(lv);
    return lv;
  }

  function flowBetween(a, b) {
    var rec = (a.links || []).filter(function (l) { return l.id === b.id; })[0];
    if (rec) return rec.flow || "out";
    var rev = (b.links || []).filter(function (l) { return l.id === a.id; })[0];
    if (rev) return { out: "in", in: "out", both: "both" }[rev.flow || "out"];
    return "out";
  }

  function refreshDynamicLinks() {
    linkVisuals.forEach(function (lv) {
      if (!lv.dynamic) return;
      var ea = entities[lv.aId], eb = entities[lv.bId];
      if (!ea || !eb) { lv.group.visible = false; return; }
      lv.group.visible = true;
      lv.frame++;
      if (lv.frame % 4 !== 1) return;
      var start = new THREE.Vector3(), end = new THREE.Vector3();
      ea.group.getWorldPosition(start);
      eb.group.getWorldPosition(end);
      var info = makeLinkGeometry(start, end);
      lv.tube.geometry.dispose();
      lv.tube.geometry = info.geo;
      lv.curve = info.curve;
    });
  }

  /* ============================================================
     Компоновка орбит
     ============================================================ */
  function childrenOfType(parentId, type) {
    return S.childrenOf(parentId).filter(function (c) { return c.type === type; });
  }

  function layoutSiblings(parentObj, kids, parentRadius, opts) {
    opts = opts || {};
    var baseFactor = opts.baseFactor != null ? opts.baseFactor : 1.22;
    var gapFactor = opts.gapFactor != null ? opts.gapFactor : 0.6;
    var stepFactor = opts.stepFactor != null ? opts.stepFactor : 2.55;
    var minBase = opts.minBase || 0;
    var minStep = opts.minStep || 0;
    if (!kids.length) return [];

    var enriched = kids.map(function (c) {
      return { obj: c, radius: Math.max(0.06, visualRadius(c)), manual: c.orbitRadius > 0 ? c.orbitRadius : 0 };
    });
    var maxR = enriched.reduce(function (m, e) { return Math.max(m, e.radius); }, 0);
    var gap = maxR * gapFactor;

    enriched.sort(function (a, b) {
      var ra = a.manual || 1e9, rb = b.manual || 1e9;
      if (ra !== rb) return ra - rb;
      return kids.indexOf(a.obj) - kids.indexOf(b.obj);
    });

    var base = Math.max(parentRadius + maxR * baseFactor, minBase);
    var step = Math.max(maxR * stepFactor, (maxR * 2 + gap) * 0.92, minStep);
    var prev = null;
    var out = [];
    enriched.forEach(function (e, i) {
      var auto = base + i * step;
      var minAllowed = base;
      if (prev) minAllowed = prev.effective + prev.radius + e.radius + gap;
      var effective = e.manual ? Math.max(e.manual, minAllowed) : Math.max(auto, minAllowed);
      out.push({
        obj: e.obj,
        radius: effective,
        min: i === 0 ? base : minAllowed,
        auto: auto,
        radiusObj: e.radius,
        manual: e.manual
      });
      prev = { effective: effective, radius: e.radius };
    });
    return out;
  }

  /* ============================================================
     Построение сцены по видам
     ============================================================ */
  function registerEntity(obj, group, radius) {
    var el = document.createElement("div");
    el.className = "obj-label";
    el.innerHTML = '<span class="lbl-name"></span><span class="lbl-pct"></span>';
    labelLayer.appendChild(el);
    labelEls.push(el);

    var entity = {
      obj: obj,
      group: group,
      radius: radius,
      labelEl: el,
      labelName: el.querySelector(".lbl-name"),
      labelPct: el.querySelector(".lbl-pct"),
      anchor: new THREE.Vector3(),
      pivot: null,
      phase: 0
    };
    entities[obj.id] = entity;
    visibleIds.push(obj.id);
    updateLabel(entity, obj);
    return entity;
  }

  function updateLabel(entity, obj, force) {
    var pct = Math.round(S.computeProgress(obj.id));
    var key = obj.name + "|" + pct + "|" + obj.progressMode;
    if (!force && entity._labelKey === key) return;
    entity._labelKey = key;
    entity.labelName.textContent = obj.name;
    entity.labelPct.textContent = obj.progressMode === "recurring" ? "↻" : pct + "%";
  }

  function attachOrbit(parentEntity, obj, orbitRadius, phase, index) {
    var pivot = new THREE.Group();
    pivot.position.set(0, 0, 0);
    var holder = new THREE.Group();
    holder.position.set(orbitRadius, 0, 0);
    pivot.add(holder);
    pivot.rotation.y = phase;
    /* лёгкий наклон орбит: система выглядит объёмной, а не плоской */
    pivot.rotation.z = (index != null ? (index % 2 === 0 ? 1 : -1) : 1) * (0.035 + (index || 0) * 0.018);
    parentEntity.group.add(pivot);
    pivots.push({ obj: obj, pivot: pivot, phase: phase, tiltZ: pivot.rotation.z });
    return holder;
  }

  function buildGroupView() {
    var groups = S.all().filter(function (o) { return o.type === "group"; });
    var companies = S.all().filter(function (o) { return o.type === "company"; });

    if (!companies.length) {
      if (groups.length) {
        var g0 = groups[0];
        var gRadius = visualRadius(g0);
        var gGroup = makeGalaxy(g0, false);
        gGroup.position.set(0, 0, 0);
        contents.add(gGroup);
        registerEntity(g0, gGroup, gRadius);
      }
      return;
    }

    var groupObj = groups[0] || null;
    var centerRadius = groupObj ? visualRadius(groupObj) : 4;

    if (groupObj) {
      var centerGroup = makeGalaxy(groupObj, false);
      centerGroup.position.set(0, 0, 0);
      contents.add(centerGroup);
      var centerEntity = registerEntity(groupObj, centerGroup, centerRadius);
      centerEntity.isCenter = true;
    }

    var layout = layoutSiblings(groupObj || { id: null }, companies, centerRadius, {
      minBase: 24, minStep: 26, gapFactor: 0.9
    });

    layout.forEach(function (entry, i) {
      var company = entry.obj;
      var phase = (i / Math.max(1, layout.length)) * TAU + 0.4;
      var parentEntity = groupObj ? entities[groupObj.id] : { group: contents };
      var holder = attachOrbit(parentEntity, company, entry.radius, phase, i);
      var galaxy = makeGalaxy(company, false);
      holder.add(galaxy);
      var ent = registerEntity(company, galaxy, entry.radiusObj);
      ent.pivot = { holder: holder, orbitRadius: entry.radius };
      orbitMins[company.id] = entry.min;
    });

    /* энергетические связи между компаниями */
    var companyById = {};
    companies.forEach(function (c) { companyById[c.id] = c; });
    companies.forEach(function (c) {
      (c.links || []).forEach(function (l) {
        var other = companyById[l.id];
        if (!other) return;
        if (c.id > l.id) return; /* одна линия на пару */
        if (!entities[c.id] || !entities[other.id]) return;
        createLinkVisual({
          aId: c.id, bId: other.id,
          start: new THREE.Vector3(), end: new THREE.Vector3(),
          colorA: c.color, colorB: other.color,
          flow: flowBetween(c, other), dynamic: true
        });
      });
    });
  }

  function goalPositions(goals) {
    var positions = {};
    var n = goals.length;
    if (n === 1) {
      positions[goals[0].id] = new THREE.Vector3(0, 0, 0);
      return positions;
    }
    var maxR = goals.reduce(function (m, g) { return Math.max(m, visualRadius(g)); }, 1);
    var spread = Math.max(maxR * 3.4, maxR * 2.6 * Math.sqrt(n) + 4);
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n;
      var y = 1 - 2 * t;
      var radius = Math.sqrt(Math.max(0, 1 - y * y));
      var theta = i * 2.399963 * 2;
      positions[goals[i].id] = new THREE.Vector3(
        Math.cos(theta) * radius * spread,
        y * spread * 0.42,
        Math.sin(theta) * radius * spread
      );
    }
    return positions;
  }

  function buildGoalsView() {
    var selected = S.selectedId() ? S.get(S.selectedId()) : null;
    var companyChain = null;
    var cur = selected;
    var guard = 0;
    while (cur && guard < 20) {
      if (cur.type === "company") { companyChain = cur; break; }
      cur = cur.parentId ? S.get(cur.parentId) : null;
      guard++;
    }

    var allGoals = S.all().filter(function (o) { return o.type === "goal"; });
    var goals = companyChain ? allGoals.filter(function (g) { return g.parentId === companyChain.id; }) : allGoals;
    if (!goals.length) goals = allGoals;
    if (!goals.length) return;

    var positions = goalPositions(goals);

    goals.forEach(function (g) {
      var galaxy = makeGalaxy(g, true);
      galaxy.position.copy(positions[g.id]);
      contents.add(galaxy);
      var ent = registerEntity(g, galaxy, visualRadius(g));
      ent.worldBase = positions[g.id].clone();
    });

    /* связи между целями с потоком энергии */
    var shown = {};
    goals.forEach(function (g) { shown[g.id] = true; });
    goals.forEach(function (g) {
      (g.links || []).forEach(function (l) {
        if (!shown[l.id]) return;
        if (g.id > l.id) return;
        var target = S.get(l.id);
        if (!entities[g.id] || !entities[l.id] || !target) return;
        createLinkVisual({
          aId: g.id, bId: l.id,
          start: positions[g.id], end: positions[l.id],
          colorA: g.color, colorB: target.color,
          flow: flowBetween(g, target), dynamic: false
        });
      });
    });

  }

  function buildProjectsView() {
    var selected = S.selectedId() ? S.get(S.selectedId()) : null;
    var goalObj = null;
    var cur = selected;
    var guard = 0;
    while (cur && guard < 20) {
      if (cur.type === "goal") { goalObj = cur; break; }
      cur = cur.parentId ? S.get(cur.parentId) : null;
      guard++;
    }
    if (!goalObj) {
      var company = null;
      cur = selected;
      guard = 0;
      while (cur && guard < 20) {
        if (cur.type === "company") { company = cur; break; }
        cur = cur.parentId ? S.get(cur.parentId) : null;
        guard++;
      }
      var pool = S.all().filter(function (o) { return o.type === "goal"; });
      if (company) {
        var mine = pool.filter(function (g) { return g.parentId === company.id; });
        if (mine.length) pool = mine;
      }
      goalObj = pool[0] || null;
    }
    if (!goalObj) return;

    var goalRadius = visualRadius(goalObj);
    var sun = makeGoalSun(goalObj);
    contents.add(sun);
    var sunEntity = registerEntity(goalObj, sun, goalRadius);
    sunEntity.isCenter = true;
    sunEntity.sunGroup = sun;

    var projects = childrenOfType(goalObj.id, "project");
    var maxTaskExtent = 0;
    projects.forEach(function (p) {
      var tasks = childrenOfType(p.id, "task");
      if (!tasks.length) return;
      var taskLayout = layoutSiblings(p, tasks, visualRadius(p), { minBase: 2.3, minStep: 1.9 });
      var lastT = taskLayout[taskLayout.length - 1];
      var ext = lastT.radius + lastT.radiusObj;
      tasks.forEach(function (t) {
        var maxTaskR = 0;
        var subs = childrenOfType(t.id, "subtask");
        if (subs.length) {
          var subL = layoutSiblings(t, subs, visualRadius(t), { minBase: 1.3, minStep: 0.95 });
          maxTaskR = subL[subL.length - 1].radius + subL[subL.length - 1].radiusObj;
        }
        ext = Math.max(ext, lastT.radius + maxTaskR + visualRadius(t));
      });
      maxTaskExtent = Math.max(maxTaskExtent, ext);
    });

    var projectStepOverride = maxTaskExtent > 0 ? Math.max(13.5, 2 * maxTaskExtent * 0.92) : 0;
    var projectLayout = layoutSiblings(goalObj, projects, goalRadius, { minBase: 12, minStep: 13.5 });

    if (projectStepOverride > 0) {
      /* пересчитываем с учётом размера спутниковых систем, чтобы системы не пересекались */
      projectLayout = [];
      var prevEff = null;
      projects.forEach(function (p, i) {
        var r = visualRadius(p);
        var auto = Math.max(12, goalRadius + 2.4 + r) + i * projectStepOverride;
        var minAllowed = Math.max(12, goalRadius + 2.4 + r);
        if (prevEff != null) minAllowed = prevEff + projectStepOverride;
        var effective = p.orbitRadius > 0 ? Math.max(p.orbitRadius, minAllowed) : Math.max(auto, minAllowed);
        projectLayout.push({
          obj: p, radius: effective, min: minAllowed, auto: auto,
          radiusObj: r, manual: p.orbitRadius > 0 ? p.orbitRadius : 0
        });
        prevEff = effective;
      });
    }

    projectLayout.forEach(function (entry, i) {
      var project = entry.obj;
      var phase = (i / Math.max(1, projectLayout.length)) * TAU + 0.9;
      var holder = attachOrbit(sunEntity, project, entry.radius, phase, i);
      var planet = makePlanetMesh(project);
      holder.add(planet);
      var pEnt = registerEntity(project, planet, entry.radiusObj);
      pEnt.pivot = { holder: holder, orbitRadius: entry.radius };
      pEnt.spinMesh = planet;
      orbitMins[project.id] = entry.min;

      var tasks = childrenOfType(project.id, "task");
      var taskLayout = layoutSiblings(project, tasks, entry.radiusObj, { minBase: 2.3, minStep: 1.9 });
      taskLayout.forEach(function (tEntry, ti) {
        var task = tEntry.obj;
        var tPhase = (ti / Math.max(1, taskLayout.length)) * TAU + 0.5 + i;
        var tHolder = attachOrbit(pEnt, task, tEntry.radius, tPhase, ti);
        var taskGroup = makePlanetMesh(task);
        tHolder.add(taskGroup);
        var tEnt = registerEntity(task, taskGroup, tEntry.radiusObj);
        tEnt.pivot = { holder: tHolder, orbitRadius: tEntry.radius };
        tEnt.spinMesh = taskGroup;
        orbitMins[task.id] = tEntry.min;

        var subs = childrenOfType(task.id, "subtask");
        var subLayout = layoutSiblings(task, subs, tEntry.radiusObj, { minBase: 1.3, minStep: 0.95 });
        subLayout.forEach(function (sEntry, si) {
          var sub = sEntry.obj;
          var sPhase = (si / Math.max(1, subLayout.length)) * TAU + 0.3 + ti;
          var sHolder = attachOrbit(tEnt, sub, sEntry.radius, sPhase, si);
          var subGroup = makePlanetMesh(sub);
          sHolder.add(subGroup);
          var sEnt = registerEntity(sub, subGroup, sEntry.radiusObj);
          sEnt.pivot = { holder: sHolder, orbitRadius: sEntry.radius };
          sEnt.spinMesh = subGroup;
          orbitMins[sub.id] = sEntry.min;
        });
      });
    });
  }


  /* ---------- Кольцевой индикатор прогресса вокруг объекта ---------- */
  function ringRadiusFor(ent) {
    var k = ent.isCenter ? 1.28 : 1.22;
    return Math.max(0.12, ent.radius * k);
  }

  function buildProgressRing(ent) {
    var pct = S.computeProgress(ent.obj.id);
    var recurring = ent.obj.progressMode === "recurring";
    var inner = ringRadiusFor(ent);
    var outer = inner + Math.max(0.03, ent.radius * 0.14);

    var group = new THREE.Group();
    var baseGeo = track(new THREE.RingGeometry(inner, outer, 64));
    var baseMat = track(new THREE.MeshBasicMaterial({
      color: 0x0a1024, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
    }));
    var base = new THREE.Mesh(baseGeo, baseMat);
    group.add(base);

    var color = S.progressColor(pct, ent.obj.status);
    var endAngle = -Math.PI / 2 + (Math.PI * 2) * (pct / 100);
    var arcGeo = track(new THREE.RingGeometry(inner, outer, 64, 1, -Math.PI / 2, Math.max(0.0001, endAngle + Math.PI / 2)));
    var arcMat = track(new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.95,
      side: THREE.DoubleSide, depthWrite: false
    }));
    var arc = new THREE.Mesh(arcGeo, arcMat);
    group.add(arc);

    /* гало прогресса */
    var haloMat = track(new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    var haloGeo = track(new THREE.RingGeometry(inner, outer + ent.radius * 0.12, 64));
    var halo = new THREE.Mesh(haloGeo, haloMat);
    group.add(halo);

    if (recurring) {
      group.visible = false; /* у повторяющихся задач ползунок и дуга не показываются */
    }

    group.userData.isProgressRing = true;
    group.userData.pct = pct;
    group.userData.key = pct + "|" + ent.obj.status + "|" + ent.obj.progressMode;
    /* кольцо живёт на корневом слое и всегда развёрнуто к камере */
    var worldPos = new THREE.Vector3();
    ent.group.getWorldPosition(worldPos);
    group.position.copy(worldPos);
    if (!ringLayer) ringLayer = new THREE.Group();
    if (!ringLayer.parent && contents) contents.add(ringLayer);
    ringLayer.add(group);
    ent.progressRing = group;
    return group;
  }

  function refreshProgressRings() {
    Object.keys(entities).forEach(function (id) {
      var ent = entities[id];
      if (!ent || !ent.progressRing) return;
      var pct = S.computeProgress(id);
      var key = pct + "|" + ent.obj.status + "|" + ent.obj.progressMode;
      if (ent.progressRing.userData.key === key) return;
      var parent = ent.progressRing.parent;
      if (parent) parent.remove(ent.progressRing);
      ent.progressRing.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      ent.progressRing = null;
      buildProgressRing(ent);
    });
  }

  /* ============================================================
     Выделение, огненное кольцо
     ============================================================ */
  function disposeRing() {
    if (!selectionRing) return;
    if (selectionRing.parent) selectionRing.parent.remove(selectionRing);
    selectionRing.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    selectionRing = null;
  }

  function buildSelectionRing(id) {
    disposeRing();
    var ent = entities[id];
    if (!ent) return;
    var color = colorOf(ent.obj);
    var baseRadius = ent.radius * (ent.isCenter ? 1.55 : 1.46);
    var ringGeo = new THREE.RingGeometry(baseRadius * 0.88, baseRadius, 96);
    var ringMat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    var ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.15;

    var ring2Geo = new THREE.RingGeometry(baseRadius * 1.12, baseRadius * 1.17, 96);
    var ring2Mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff).lerp(color, 0.5), transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 2.15;

    var group = new THREE.Group();
    group.add(ring);
    group.add(ring2);
    /* кольцо не должно перекрывать метку — оно в 3D, метка отдельно */
    group.userData.baseScale = 1;
    ent.group.add(group);
    selectionRing = group;
    selectionRing.userData.owner = id;
  }

  function makeFireRing(ent) {
    var radius = Math.max(0.28, ent.radius * 1.6);
    var count = Math.max(70, Math.min(520, Math.round(radius * 62)));
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    var seeds = new Float32Array(count * 3);
    var r = rnd(31);
    for (var i = 0; i < count; i++) {
      var a = r() * TAU;
      var rad = radius * (0.92 + r() * 0.42);
      var y = (r() - 0.5) * radius * 0.55;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * rad;
      seeds[i * 3] = a;
      seeds[i * 3 + 1] = 0.4 + r() * 0.9;
      seeds[i * 3 + 2] = r();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: Math.max(24, radius * 55) },
        uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) }
      },
      vertexShader: [
        "attribute vec3 aSeed;",
        "uniform float uTime; uniform float uSize; uniform float uPixelRatio;",
        "varying float vHeat;",
        "void main(){",
        "  vec3 p = position;",
        "  float t = uTime * aSeed.y;",
        "  float angle = aSeed.x + t * 0.8;",
        "  float rad = length(p.xz);",
        "  p.x = cos(angle) * rad;",
        "  p.z = sin(angle) * rad;",
        "  p.y += sin(t * 3.0 + aSeed.z * 6.28) * 0.12 * (rad * 0.5);",
        "  vHeat = 0.5 + 0.5 * sin(t * 4.0 + aSeed.z * 6.28);",
        "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  gl_PointSize = clamp(uSize * (0.6 + vHeat * 0.7) * uPixelRatio / max(1.0, -mv.z), 1.5, 26.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "varying float vHeat;",
        "void main(){",
        "  vec2 uv = gl_PointCoord - vec2(0.5);",
        "  float d = length(uv);",
        "  if (d > 0.5) discard;",
        "  float a = smoothstep(0.5, 0.0, d);",
        "  vec3 hot = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.95, 0.55), vHeat);",
        "  gl_FragColor = vec4(hot, a * (0.55 + 0.45 * vHeat));",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  function applyFire(id) {
    fireTargetId = id;
    if (fire && fire.parent) fire.parent.remove(fire);
    if (fire) {
      fire.geometry.dispose();
      fire.material.dispose();
      fire = null;
    }
    if (!id) return;
    var ent = entities[id];
    if (!ent) return;
    fire = makeFireRing(ent);
    ent.group.add(fire);
  }

  /* ============================================================
     Camera
     ============================================================ */
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function animateCamera(position, target, duration) {
    tween = {
      start: performance.now(),
      duration: duration || 760,
      fromPos: camera.position.clone(),
      toPos: position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone()
    };
  }

  function visibleBounds() {
    var box = new THREE.Box3();
    var any = false;
    visibleIds.forEach(function (id) {
      var ent = entities[id];
      if (!ent) return;
      var p = new THREE.Vector3();
      ent.group.getWorldPosition(p);
      var r = ent.radius;
      box.expandByPoint(new THREE.Vector3(p.x - r, p.y - r, p.z - r));
      box.expandByPoint(new THREE.Vector3(p.x + r, p.y + r, p.z + r));
      any = true;
    });
    if (!any) return null;
    var sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return sphere;
  }

  function centerOnAll(duration) {
    var sphere = visibleBounds();
    if (!sphere) return;
    var fov = (camera.fov * Math.PI) / 180;
    var dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (dir.lengthSq() < 0.0001) dir.set(0.32, 0.46, 1);
    dir.normalize();
    var fit = sphere.radius / Math.tan(fov / 2) * 1.1;
    var dist = Math.max(2.4, Math.min(1400, fit));
    var pos = sphere.center.clone().add(dir.multiplyScalar(dist));
    controls.maxDistance = Math.max(120, dist * 9);
    controls.minDistance = Math.max(0.6, sphere.radius * 0.06);
    animateCamera(pos, sphere.center.clone(), duration || 780);
  }

  function focusEntity(id, duration) {
    var ent = entities[id];
    if (!ent) return false;
    var p = new THREE.Vector3();
    ent.group.getWorldPosition(p);
    var dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (dir.lengthSq() < 0.0001) dir.set(0.4, 0.3, 1);
    dir.normalize();
    var dist = Math.max(2.0, ent.radius * 4.6);
    var pos = p.clone().add(dir.multiplyScalar(dist));
    controls.minDistance = Math.max(0.2, ent.radius * 0.8);
    controls.maxDistance = Math.max(60, dist * 14);
    animateCamera(pos, p, duration || 720);
    return true;
  }

  /* ============================================================
     Метки
     ============================================================ */
  function projectToScreen(v3, rect) {
    var v = v3.clone();
    v.project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
      z: v.z
    };
  }

  function updateLabels() {
    var selectedId = S.selectedId();
    var rect = canvas.getBoundingClientRect();
    var entries = [];
    Object.keys(entities).forEach(function (id) {
      var ent = entities[id];
      if (!ent) return;
      updateLabel(ent, ent.obj);
      var p = new THREE.Vector3();
      ent.group.getWorldPosition(p);
      var world = p.clone();
      world.y += ent.radius * 1.18;
      var dirToCam = camera.position.clone().sub(p).normalize();
      var projected = projectToScreen(world, rect);
      var dist = camera.position.distanceTo(p);
      var screenRadius = ent.radius / Math.max(0.001, dist) * (rect.height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      entries.push({
        ent: ent, id: id, x: projected.x, y: projected.y, z: projected.z,
        dist: dist, screenRadius: screenRadius,
        priority: (id === selectedId ? 1000 : 0) + ent.radius * 30 + (6 - D.TYPES[ent.obj.type].order) * 40
      });
    });

    entries.sort(function (a, b) { return b.priority - a.priority; });
    var shown = 0;
    var maxLabels = window.innerHeight < 720 ? 26 : 46;
    var used = [];
    entries.forEach(function (e) {
      var el = e.ent.labelEl;
      var visible = e.z < 1 && e.x > -160 && e.x < rect.width + 160 && e.y > -60 && e.y < rect.height + 60;
      var tooSmall = e.screenRadius < 2.2 && e.id !== selectedId;
      var crowded = false;
      if (visible && !tooSmall && shown >= maxLabels) crowded = true;
      if (visible && !tooSmall && !crowded) {
        for (var i = 0; i < used.length; i++) {
          if (Math.abs(used[i].x - e.x) < 54 && Math.abs(used[i].y - e.y) < 18) { crowded = true; break; }
        }
      }
      var show = visible && !tooSmall && !crowded;
      if (show) {
        shown++;
        used.push(e);
        el.classList.remove("hidden");
        el.style.transform = "translate(-50%,-50%) translate(" + e.x.toFixed(1) + "px," + e.y.toFixed(1) + "px)";
        el.style.opacity = Math.max(0.35, Math.min(1, 1.25 - e.dist / 220)).toFixed(2);
        el.classList.toggle("sel", e.id === selectedId);
        el.classList.toggle("dim", e.id !== selectedId && e.screenRadius < 8);
      } else {
        el.classList.add("hidden");
      }
    });
  }

  /* ============================================================
     Анимационный цикл
     ============================================================ */
  function updateLinks(t) {
    linkVisuals.forEach(function (lv) {
      if (!lv.curve || !lv.group.visible) return;
      lv.uniforms.uTime.value = t;
      var arr = lv.positions;
      var len = lv.curve.getLength ? lv.curve.getLength() : 1;
      for (var i = 0; i < lv.count; i++) {
        var u = ((t * 0.05 * lv.dir + lv.offsets[i]) % 1 + 1) % 1;
        if (lv.dir === -1) u = 1 - u;
        var p = lv.curve.getPointAt(Math.max(0, Math.min(1, u)));
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      var geo = lv.particles.geometry;
      if (geo && geo.attributes.position) geo.attributes.position.needsUpdate = true;
    });
  }

  function tick() {
    if (!initialized) return;
    var dt = Math.min(0.1, clock.getDelta());
    var speed = S.paused() ? 0 : S.speed() / 100;
    simTime += dt * speed;
    if (!frozen) orbitTime += dt * speed;

    var t = simTime;
    var ot = orbitTime;

    /* орбиты: одинаковая угловая скорость на каждом уровне */
    pivots.forEach(function (p) {
      p.pivot.rotation.y = p.phase + ot * BASE_OMEGA;
      p.pivot.rotation.z = p.tiltZ;
    });

    /* вращение самих объектов */
    Object.keys(entities).forEach(function (id) {
      var ent = entities[id];
      if (!ent) return;
      if (ent.spinMesh) {
        var m = ent.spinMesh.children[0];
        if (m) m.rotation.y = ot * 0.32 + ent.radius * 3;
      }
      if (ent.group.userData.spinPoints) {
        ent.group.userData.spinPoints.rotation.y = ot * 0.055;
        ent.group.userData.spinPoints.rotation.x = Math.sin(ot * 0.02) * 0.05;
      }
      if (ent.sunGroup) {
        var coronas = ent.sunGroup.userData.coronas || [];
        var pulse = 1 + Math.sin(t * 1.3) * 0.045;
        coronas.forEach(function (c, i) {
          var baseScale = ent.radius * (i === 0 ? 3.6 : 1.95);
          c.scale.set(baseScale * pulse * (1 + i * 0.02), baseScale * pulse, 1);
        });
        ent.sunGroup.children.forEach(function (ch) {
          if (ch.userData && ch.userData.spin) ch.rotation.z = ot * ch.userData.spin;
        });
      }
      if (ent.group.userData.saturnRing) {
        ent.group.userData.saturnRing.rotation.z = t * 0.12;
      }
    });

    /* пульсация кольца выделения */
    if (selectionRing) {
      var k = 1 + Math.sin(t * 2.6) * 0.1;
      selectionRing.children.forEach(function (r) {
        r.scale.setScalar(k);
      });
      selectionRing.rotation.y = t * 0.25;
      selectionRing.userData.pulse = k;
    }
    if (fire) {
      fire.material.uniforms.uTime.value = t;
      fire.rotation.y = -t * 0.35;
    }

    refreshDynamicLinks();
    updateLinks(t);

    /* tween камеры */
    if (tween) {
      var now = performance.now();
      var k2 = Math.min(1, (now - tween.start) / tween.duration);
      var e = easeOutCubic(k2);
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
      if (k2 >= 1) tween = null;
    } else {
      controls.update();
    }

    /* кольца прогресса всегда развёрнуты к камере и следуют за объектом */
    Object.keys(entities).forEach(function (id) {
      var ent = entities[id];
      if (!ent || !ent.progressRing) return;
      ent.group.getWorldPosition(ent.progressRing.position);
      ent.progressRing.quaternion.copy(camera.quaternion);
    });

    updateLabels();
    renderer.render(scene, camera);

    if (needsRebuild) {
      needsRebuild = false;
      rebuildInternal();
    }
    requestAnimationFrame(tick);
  }

  /* ============================================================
     Пересборка
     ============================================================ */
  var viewCameras = {};

  function rememberCameraForView() {
    if (!camera || !controls) return;
    viewCameras[currentView] = {
      x: camera.position.x, y: camera.position.y, z: camera.position.z,
      tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
    };
  }

  function rebuildInternal() {
    try {
      buildSceneInternal();
    } catch (err) {
      console.error("Ошибка построения сцены:", err);
    }
  }

  function buildSceneInternal() {
    var view = S.view();
    var viewChanged = view !== currentView;
    currentView = view;
    clearContents();
    orbitMins = {};
    contents = new THREE.Group();
    contents.name = "content-root";
    scene.add(contents);
    contents.add(makeStarField());
    contents.add(makeNebulae());

    if (view === "group") buildGroupView();
    else if (view === "goals") buildGoalsView();
    else buildProjectsView();

    Object.keys(entities).forEach(function (id) {
      var ent = entities[id];
      if (!ent || !ent.progressRing) return;
      if (view === "group" && ent.obj.type !== "company" && ent.obj.type !== "group") ent.progressRing.visible = false;
      if (view === "goals" && ent.obj.type !== "goal") ent.progressRing.visible = false;
    });

    /* кольцевые индикаторы прогресса */
    Object.keys(entities).forEach(function (id) { buildProgressRing(entities[id]); });

    /* огненное кольцо поиска сохраняется при любых пересборках */
    if (window.CosmoSearch && typeof window.CosmoSearch.fireTarget === "function") {
      var fireId = window.CosmoSearch.fireTarget();
      if (fireId && entities[fireId]) fireTargetId = fireId;
    }

    /* восстановление выбранного кольца и огня */
    var sel = S.selectedId();
    if (sel && entities[sel]) buildSelectionRing(sel);
    else disposeRing();
    if (fireTargetId) {
      if (entities[fireTargetId]) applyFire(fireTargetId);
      else { fireTargetId = null; fire = null; }
    }

    if (viewChanged) {
      var saved = viewCameras[view];
      if (saved) {
        animateCamera(new THREE.Vector3(saved.x, saved.y, saved.z), new THREE.Vector3(saved.tx, saved.ty, saved.tz), 620);
      } else {
        centerOnAll(780);
      }
    }
  }

  function scheduleRebuild() {
    needsRebuild = true;
  }

  function rebuild() {
    rebuildInternal();
  }

  /* ============================================================
     Взаимодействие
     ============================================================ */
  function onPointerDown(e) {
    pointerDownAt = performance.now();
    pointerDownPos = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    if (!pointerDownAt) return;
    var moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    var elapsed = performance.now() - pointerDownAt;
    pointerDownAt = null;
    if (moved > 6 || elapsed > 600) return;
    if (e.button !== 0) return;
    pickAt(e.clientX, e.clientY);
  }

  function pickAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    var hitId = hits.length ? hits[0].object.userData.objectId : null;
    if (window.__cosmoPickHook && hitId) {
      if (window.__cosmoPickHook(hitId)) return;
    }
    if (hitId) {
      S.setSelection(hitId);
      return;
    }
    if (window.__cosmoPickCancelHook) window.__cosmoPickCancelHook();
    S.setSelection(null);
  }

  function onDoubleClick(e) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickables, false);
    if (hits.length && hits[0].object.userData.objectId) {
      var id = hits[0].object.userData.objectId;
      S.setSelection(id);
      focusEntity(id);
    }
  }

  function onResize() {
    if (!renderer || !camera) return;
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  }

  /* ============================================================
     Инициализация
     ============================================================ */
  function init() {
    if (initialized) return;
    canvas = document.getElementById("scene-canvas");
    labelLayer = document.getElementById("labels-layer");
    if (!canvas || !labelLayer) {
      console.error("Не найдены элементы сцены (#scene-canvas / #labels-layer)");
      return;
    }

    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    scene = new THREE.Scene();
    scene.fog = null;

    camera = new THREE.PerspectiveCamera(48, (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight), 0.1, 4000);
    camera.position.set(12, 22, 42);

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.62;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.7;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 1200;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.target.set(0, 0, 0);

    /* свет */
    var ambient = new THREE.AmbientLight(0x8899ff, 0.55);
    scene.add(ambient);
    var sunLight = new THREE.PointLight(0xffe6b0, 1.35, 0, 0);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);
    var fillLight = new THREE.DirectionalLight(0x9fbcff, 0.75);
    fillLight.position.set(-1, 0.8, 1);
    scene.add(fillLight);
    var backLight = new THREE.PointLight(0x7c8cff, 0.7, 0, 0);
    backLight.position.set(30, 22, -30);
    scene.add(backLight);

    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();
    initialized = true;

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("resize", onResize);
    /* восстановление после потери WebGL-контекста */
    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      console.warn("WebGL-контекст потерян — сцена будет восстановлена.");
    }, false);
    canvas.addEventListener("webglcontextrestored", function () {
      needsRebuild = true;
    }, false);

    controls.addEventListener("end", function () {
      var now = performance.now();
      if (now - lastCameraSave < 700) return;
      lastCameraSave = now;
      S.setCamera({
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
        tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
      });
    });

    rebuildInternal();

    var cam = S.getState().camera;
    if (cam && isFinite(cam.x)) {
      camera.position.set(cam.x, cam.y, cam.z);
      controls.target.set(cam.tx || 0, cam.ty || 0, cam.tz || 0);
      controls.update();
    } else {
      centerOnAll(1);
    }

    onResize();
    requestAnimationFrame(tick);
  }

  window.CosmoScene = {
    init: init,
    rebuild: rebuild,
    scheduleRebuild: scheduleRebuild,
    centerAll: function () { centerOnAll(820); },
    focus: function (id, instant) { return focusEntity(id, instant ? 1 : 720); },
    setFreeze: function (v) { frozen = !!v; },
    isFrozen: function () { return frozen; },
    fire: function (id) { applyFire(id || null); },
    clearFire: function () { applyFire(null); },
    hasEntity: function (id) { return !!entities[id]; },
    entityRoot: function (id) { return entities[id] ? entities[id].group : null; },
    worldPos: function (id) {
      var ent = entities[id];
      if (!ent) return null;
      var p = new THREE.Vector3();
      ent.group.getWorldPosition(p);
      return p;
    },
    visibleIds: function () { return visibleIds.slice(); },
    inspect: function () {
      var ents = Object.keys(entities).map(function (id) {
        var e = entities[id];
        var p = new THREE.Vector3();
        e.group.getWorldPosition(p);
        return { id: id, name: e.obj.name, type: e.obj.type, radius: e.radius, x: p.x, y: p.y, z: p.z };
      });
      return {
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        tween: tween ? { x: tween.toPos.x, y: tween.toPos.y, z: tween.toPos.z, tx: tween.toTarget.x, ty: tween.toTarget.y, tz: tween.toTarget.z } : null,
        entities: ents
      };
    },
    rememberCamera: rememberCameraForView,
    refreshProgress: function () { refreshProgressRings(); },
    selectRing: function (id) {
      if (selectionRing && selectionRing.userData.owner === id) return;
      if (id && entities[id]) buildSelectionRing(id);
      else disposeRing();
    },
    view: function () { return currentView; },
    texturePreview: function (id, size) {
      var px = size || 96;
      var w = 128, h = 64;
      var c = mkCanvas(w, h);
      var ctx = c.getContext("2d");
      var painter = TEXTURE_PAINTERS[id] || TEXTURE_PAINTERS.earth;
      painter(ctx, w, h, rnd(23));
      var out = mkCanvas(px, px);
      var octx = out.getContext("2d");
      octx.drawImage(c, 0, 0, w, h, 0, 0, px, px);
      var shade = octx.createRadialGradient(px * 0.35, px * 0.3, px * 0.05, px * 0.5, px * 0.5, px * 0.72);
      shade.addColorStop(0, "rgba(255,255,255,0.18)");
      shade.addColorStop(0.55, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.55)");
      octx.fillStyle = shade;
      octx.beginPath();
      octx.arc(px / 2, px / 2, px / 2, 0, TAU);
      octx.fill();
      octx.globalCompositeOperation = "destination-in";
      octx.beginPath();
      octx.arc(px / 2, px / 2, px / 2, 0, TAU);
      octx.fill();
      return out.toDataURL("image/png");
    },
    orbitMin: function (id) {
      return typeof orbitMins[id] === "number" ? orbitMins[id] : null;
    },
    orbitBounds: function (id) {
      var o = S.get(id);
      if (!o) return null;
      var parentEnt = o.parentId ? entities[o.parentId] : null;
      if (!parentEnt) return null;
      return { min: 0, max: 400, radius: visualRadius(o) };
    }
  };
})();
