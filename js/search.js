/* ============================================================
   search.js — контекстный поиск по всем уровням иерархии
   ============================================================ */
(function () {
  "use strict";

  var D = window.CosmoData;
  var S = window.Store;

  var inputEl = null;
  var resultsEl = null;
  var metaEl = null;
  var clearBtn = null;
  var lastQuery = "";
  var inited = false;
  var lastResults = [];
  var fireId = null;
  var activeIndex = -1;

  function fieldParts(obj) {
    var parts = [
      obj.name,
      obj.description,
      obj.id,
      obj.status,
      obj.kind,
      D.TYPES[obj.type] ? D.TYPES[obj.type].label : "",
      obj.responsible.fio, obj.responsible.role, obj.responsible.function,
      obj.executor.fio, obj.executor.role, obj.executor.function,
      obj.dueDate
    ];
    (obj.automationLinks || []).forEach(function (l) {
      parts.push(l.title);
      parts.push(l.url);
    });
    return parts;
  }

  function scoreObject(obj, needle, tokens) {
    var name = S.normalizeText(obj.name);
    var hay = S.normalizeText(fieldParts(obj).join(" \u0001 "));
    var score = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (hay.indexOf(tokens[i]) < 0) return -1;
    }
    if (name === needle) score += 120;
    else if (name.indexOf(needle) === 0) score += 80;
    else if (name.indexOf(needle) > 0) score += 45;
    if (S.normalizeText(obj.id) === needle) score += 140;
    else if (S.normalizeText(obj.id).indexOf(needle) >= 0) score += 25;
    if (S.normalizeText(obj.responsible.fio).indexOf(needle) >= 0) score += 22;
    if (S.normalizeText(obj.executor.fio).indexOf(needle) >= 0) score += 18;
    if (S.normalizeText(obj.status) === needle) score += 30;
    score += (6 - D.TYPES[obj.type].order) * 2;
    return score;
  }

  function search(query) {
    var needle = S.normalizeText(query);
    if (!needle) return [];
    var tokens = needle.split(" ").filter(Boolean);
    var found = [];
    S.all().forEach(function (obj) {
      var score = scoreObject(obj, needle, tokens);
      if (score >= 0) found.push({ obj: obj, score: score });
    });
    found.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return D.TYPES[a.obj.type].order - D.TYPES[b.obj.type].order;
    });
    return found.slice(0, 60).map(function (f) { return f.obj; });
  }

  function highlight(text, query) {
    var needle = S.normalizeText(query);
    if (!needle) return escapeHtml(text);
    var src = String(text || "");
    var norm = S.normalizeText(src);
    var idx = norm.indexOf(needle.split(" ")[0] || needle);
    if (idx < 0) return escapeHtml(src);
    var offset = Math.max(0, Math.min(src.length, idx));
    var before = escapeHtml(src.slice(0, offset));
    var match = escapeHtml(src.slice(offset, offset + needle.split(" ")[0].length));
    var after = escapeHtml(src.slice(offset + needle.split(" ")[0].length));
    return before + "<b>" + match + "</b>" + after;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function pathText(obj) {
    var chain = S.pathOf(obj.id);
    return chain.slice(0, -1).map(function (o) { return o.name; }).join(" → ") || "Корень";
  }

  function render(query) {
    lastQuery = query;
    var needle = S.normalizeText(query);
    activeIndex = -1;
    if (!needle) {
      resultsEl.innerHTML = "";
      metaEl.textContent = "";
      lastResults = [];
      return;
    }
    lastResults = search(query);
    if (!lastResults.length) {
      resultsEl.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      metaEl.textContent = "Совпадений нет";
      return;
    }
    metaEl.textContent = "Найдено: " + lastResults.length +
      (lastResults.length >= 60 ? " (показаны первые 60)" : "");
    resultsEl.innerHTML = lastResults.map(function (obj, i) {
      var info = D.TYPES[obj.type];
      var pct = Math.round(S.computeProgress(obj.id));
      return '<button type="button" class="search-item" data-id="' + obj.id + '" data-idx="' + i + '" role="option" aria-selected="false">' +
        '<span class="si-icon" style="color:' + obj.color + '">' + info.icon + "</span>" +
        '<span style="min-width:0">' +
          '<span class="si-name">' + highlight(obj.name, query) + "</span>" +
          '<span class="si-path">' + escapeHtml(info.label) + " · " + escapeHtml(pathText(obj)) + "</span>" +
        "</span>" +
        '<span class="si-pct">' + pct + "%</span>" +
      "</button>";
    }).join("");
  }

  function select(id) {
    var obj = S.get(id);
    if (!obj) return;
    /* нужный вид */
    var view = obj.type === "group" || obj.type === "company" ? "group" : obj.type === "goal" ? "goals" : "projects";
    if (obj.type === "company") S.setSelection(id);
    if (S.view() !== view) {
      if (window.CosmoScene && window.CosmoScene.rememberCamera) window.CosmoScene.rememberCamera();
      S.setView(view);
      /* сцена пересоберётся по событию view; ждём кадр */
      setTimeout(function () {
        afterView(id);
      }, 80);
    } else {
      afterView(id);
    }
  }

  function afterView(id) {
    S.setSelection(id);
    fireId = id;
    var ok = window.CosmoScene.focus(id);
    if (!ok) setTimeout(function () { window.CosmoScene.focus(id); }, 120);
    window.CosmoScene.fire(id);
  }

  function onClick(e) {
    var btn = e.target.closest(".search-item");
    if (!btn) return;
    select(btn.getAttribute("data-id"));
  }

  function moveActive(delta) {
    var items = resultsEl.querySelectorAll(".search-item");
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    items.forEach(function (el, i) {
      el.classList.toggle("active", i === activeIndex);
      el.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    });
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function clear() {
    if (inputEl) inputEl.value = "";
    render("");
    fireId = null;
    window.CosmoScene.clearFire();
  }

  function fireTarget() {
    return fireId;
  }

  function init() {
    if (inited) return;
    inited = true;
    inputEl = document.getElementById("search-input");
    resultsEl = document.getElementById("search-results");
    metaEl = document.getElementById("search-meta");
    clearBtn = document.getElementById("search-clear");
    if (!inputEl || !resultsEl) return;

    inputEl.addEventListener("input", function () {
      render(inputEl.value);
      if (!inputEl.value.trim()) {
        fireId = null;
        window.CosmoScene.clearFire();
      }
    });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && lastResults[activeIndex]) select(lastResults[activeIndex].id);
        else if (lastResults.length) select(lastResults[0].id);
      } else if (e.key === "Escape") {
        if (inputEl.value) { clear(); }
        inputEl.blur();
      }
    });
    resultsEl.addEventListener("click", onClick);
    if (clearBtn) clearBtn.addEventListener("click", function () { clear(); inputEl.focus(); });

    S.subscribe(function (ev) {
      if (ev.type === "change" || ev.type === "reset" || ev.type === "import") {
        if (inputEl.value.trim()) render(inputEl.value);
      }
      if (ev.type === "select" && !ev.id) {
        /* выделение снято — огонь гаснет */
        fireId = null;
        window.CosmoScene.clearFire();
      }
      if (ev.type === "reset" || ev.type === "import") {
        if (inputEl) inputEl.value = "";
        render("");
      }
    });
  }

  window.CosmoSearch = {
    init: init,
    fireTarget: fireTarget,
    query: search,
    clear: clear,
    select: select
  };
})();
