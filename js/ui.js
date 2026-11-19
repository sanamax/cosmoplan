/* ============================================================
   ui.js — карточка свойств, дерево структуры, панель действий
   ============================================================ */
(function () {
  "use strict";

  var D = window.CosmoData;
  var S = window.Store;
  var R = window.CosmoReports;

  var els = {};
  var inited = false;
  var cardId = null;
  var suppress = false;
  var textureCache = {};
  var startTime = Date.now();

  /* ============================================================
     Утилиты
     ============================================================ */
  function $(id) { return document.getElementById(id); }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, kind) {
    var root = $("toasts");
    if (!root) return;
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .3s ease, transform .3s ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(-6px)";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 320);
    }, 2600);
  }

  function confirmAction(opts) {
    return new Promise(function (resolve) {
      var backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="conf-title">' +
          '<h3 id="conf-title">' + esc(opts.title || "Подтверждение") + "</h3>" +
          "<p>" + esc(opts.message || "") + "</p>" +
          '<div class="modal-actions">' +
            '<button type="button" class="btn ghost" data-act="no">' + esc(opts.cancel || "Отмена") + "</button>" +
            '<button type="button" class="btn ' + (opts.danger ? "danger" : "primary") + '" data-act="yes">' + esc(opts.confirm || "Подтвердить") + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(backdrop);
      function done(val) {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        document.removeEventListener("keydown", onKey);
        resolve(val);
      }
      function onKey(e) {
        if (e.key === "Escape") done(false);
        if (e.key === "Enter") done(true);
      }
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) return done(false);
        var act = e.target.closest("[data-act]");
        if (!act) return;
        done(act.getAttribute("data-act") === "yes");
      });
      document.addEventListener("keydown", onKey);
      setTimeout(function () {
        var btn = backdrop.querySelector('[data-act="yes"]');
        if (btn) btn.focus();
      }, 40);
    });
  }

  function downloadText(filename, content, mime) {
    var blob = new Blob(["\ufeff" + content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ============================================================
     Виды и верхняя панель
     ============================================================ */
  var VIEW_INDEX = { group: 0, goals: 1, projects: 2 };

  function viewForType(type) {
    if (type === "group" || type === "company") return "group";
    if (type === "goal") return "goals";
    return "projects";
  }

  function addTypeForView(view, selected) {
    if (view === "group") return "company";
    if (view === "goals") return "goal";
    return "project";
  }

  function addLabelForType(type) {
    if (!type) return "+";
    return "+ " + D.TYPES[type].label;
  }

  function switchView(view, focusId) {
    if (S.view() !== view) {
      window.CosmoScene.rememberCamera();
      S.setView(view);
    }
    var target = focusId || S.selectedId();
    if (target) {
      var obj = S.get(target);
      if (obj) {
        var needed = viewForType(obj.type);
        if (needed !== view) {
          window.CosmoScene.rememberCamera();
          S.setView(needed);
        }
        setTimeout(function () {
          if (!window.CosmoScene.focus(target)) {
            setTimeout(function () { window.CosmoScene.focus(target); }, 160);
          }
        }, 90);
      }
    }
    syncToolbar();
  }

  function syncTopbarHeight() {
    var bar = $("topbar");
    if (!bar) return;
    var h = bar.offsetHeight || 96;
    document.documentElement.style.setProperty("--topbar-h", (h + 24) + "px");
  }

  function syncToolbar() {
    syncTopbarHeight();
    var view = S.view();
    if (els.viewSlider) els.viewSlider.value = String(VIEW_INDEX[view]);
    ["group", "goals", "projects"].forEach(function (v) {
      var btn = $("view-btn-" + v);
      if (btn) btn.classList.toggle("active", v === view);
    });

    var selected = S.selectedId() ? S.get(S.selectedId()) : null;
    var addType = selected ? D.TYPES[selected.type].childType : addTypeForView(view, selected);
    if (els.btnAdd) {
      els.btnAdd.textContent = selected && addType
        ? addLabelForType(addType)
        : (view === "group" ? "+ Компания" : view === "goals" ? "+ Цель" : "+ Проект");
      els.btnAdd.disabled = !addType && !!selected;
      els.btnAdd.title = selected && !addType
        ? "У подзадачи нет дочерних объектов"
        : "Создать дочерний объект к выбранному (N)";
    }
    if (els.btnLink) {
      var canLink = view !== "projects";
      els.btnLink.classList.toggle("hidden", !canLink);
    }
    if (els.dockStats) {
      var st = S.stats();
      els.dockStats.textContent = "Объектов: " + st.total + " · средний прогресс " + st.avg + "% · в риске " + st.risk;
    }
    if (els.speedSlider && !suppress) els.speedSlider.value = String(S.speed());
    if (els.speedValue) els.speedValue.textContent = (S.speed() / 100).toFixed(1) + "×";
    if (els.btnPause) {
      els.btnPause.textContent = S.paused() ? "▶" : "❚❚";
      els.btnPause.title = S.paused() ? "Продолжить вращение (Space)" : "Пауза вращения (Space)";
      els.btnPause.classList.toggle("active", S.paused());
    }
  }

  function contextualAdd() {
    var selected = S.selectedId() ? S.get(S.selectedId()) : null;
    var type = selected ? D.TYPES[selected.type].childType : addTypeForView(S.view());
    if (!type) {
      toast("У подзадачи нет дочерних объектов", "err");
      return;
    }
    var created = null;
    if (selected) {
      created = S.addChild(selected.id, type);
      if (created) toast("Создан объект: " + created.name, "ok");
    } else {
      created = S.addTop(type);
      if (created) toast("Создан объект: " + created.name, "ok");
    }
    if (!created) {
      toast("Не удалось создать объект — проверьте иерархию", "err");
      return;
    }
    S.setSelection(created.id);
    openCard(created.id);
    setTimeout(function () {
      if (!window.CosmoScene.focus(created.id)) {
        setTimeout(function () { window.CosmoScene.focus(created.id); }, 180);
      }
    }, 80);
  }

  /* ============================================================
     Карточка
     ============================================================ */
  function buildTextureGrid() {
    var grid = $("card-texture");
    if (!grid || grid.childElementCount) return;
    D.TEXTURES.forEach(function (t) {
      var url = textureCache[t.id];
      if (!url) {
        url = window.CosmoScene.texturePreview ? window.CosmoScene.texturePreview(t.id, 96) : "";
        textureCache[t.id] = url;
      }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "texture-chip";
      btn.setAttribute("data-texture", t.id);
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.title = t.name + " — " + t.hint;
      btn.style.backgroundImage = url ? "url(" + url + ")" : "";
      btn.innerHTML = '<span class="tc-name">' + esc(t.name) + "</span>";
      btn.addEventListener("click", function () {
        if (!cardId) return;
        window.CosmoScene && applyPatch({ texture: t.id });
      });
      grid.appendChild(btn);
    });

    var presets = $("card-color-presets");
    if (presets && !presets.childElementCount) {
      D.COLORS.forEach(function (c) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "color-chip";
        chip.style.background = c;
        chip.style.color = c;
        chip.title = c;
        chip.setAttribute("data-color", c);
        chip.addEventListener("click", function () {
          if (!cardId) return;
          if (els.cardColor) els.cardColor.value = c;
          applyPatch({ color: c });
        });
        presets.appendChild(chip);
      });
    }
  }

  function fillSelects() {
    var kindSel = $("card-kind");
    if (kindSel && !kindSel.options.length) {
      D.KINDS.forEach(function (k) {
        var o = document.createElement("option");
        o.value = k.value;
        o.textContent = k.icon + "  " + k.value;
        kindSel.appendChild(o);
      });
    }
    var stSel = $("card-status");
    if (stSel && !stSel.options.length) {
      D.STATUSES.forEach(function (s) {
        var o = document.createElement("option");
        o.value = s.value;
        o.textContent = s.value;
        stSel.appendChild(o);
      });
    }
  }

  function applyPatch(patch, silentRebuild) {
    if (!cardId) return;
    var before = S.get(cardId);
    if (!before) return;
    S.update(cardId, patch);
    if (Object.prototype.hasOwnProperty.call(patch, "progress")) refreshCardProgress();
  }

  function openCard(id) {
    var obj = S.get(id);
    if (!obj) { closeCard(); return; }
    cardId = id;
    buildTextureGrid();
    fillSelects();
    if (els.cardPanel) els.cardPanel.classList.remove("hidden");
    if (window.CosmoScene) window.CosmoScene.setFreeze(true);
    renderCard();
  }

  function closeCard() {
    cardId = null;
    if (els.cardPanel) els.cardPanel.classList.add("hidden");
    if (window.CosmoScene) window.CosmoScene.setFreeze(false);
  }

  function renderCard() {
    var obj = S.get(cardId);
    if (!obj) { closeCard(); return; }
    var info = D.TYPES[obj.type];
    suppress = true;

    if (els.cardTypeBadge) els.cardTypeBadge.textContent = info.label;
    if (els.cardTitle) els.cardTitle.value = obj.name;
    if (els.cardKind) els.cardKind.value = obj.kind;
    if (els.cardStatus) els.cardStatus.value = obj.status;
    if (els.cardDescription) els.cardDescription.value = obj.description || "";
    if (els.cardDue) els.cardDue.value = obj.dueDate || "";
    if (els.cardColor) els.cardColor.value = obj.color;
    if (els.cardSize) els.cardSize.value = String(obj.size);
    if (els.cardSizeValue) els.cardSizeValue.textContent = Number(obj.size).toFixed(2);
    if (els.cardId) els.cardId.textContent = obj.id;

    /* родитель */
    var parent = obj.parentId ? S.get(obj.parentId) : null;
    if (els.cardParentDisplay) {
      els.cardParentDisplay.innerHTML = parent
        ? '<span class="pl-type">' + esc(D.TYPES[parent.type].label) + ":</span> " + esc(parent.name)
        : '<span class="pl-type">Корень иерархии</span> — нет родителя';
    }
    if (els.cardParentSelect) {
      var allowed = S.allowedParents(obj.id);
      var html = "";
      if (!allowed.length) {
        html = '<option value="">Нет доступных родителей</option>';
        els.cardParentSelect.disabled = true;
      } else {
        els.cardParentSelect.disabled = false;
        var byType = {};
        allowed.forEach(function (p) {
          byType[p.type] = byType[p.type] || [];
          byType[p.type].push(p);
        });
        D.TYPE_ORDER.forEach(function (t) {
          if (!byType[t]) return;
          html += '<optgroup label="' + esc(D.TYPES[t].label) + '">';
          byType[t].forEach(function (p) {
            var path = S.pathOf(p.id).slice(0, -1).map(function (x) { return x.name; }).join(" / ");
            var label = p.name + (path ? "  ·  " + path : "");
            html += '<option value="' + p.id + '"' + (obj.parentId === p.id ? " selected" : "") + ">" + esc(label) + "</option>";
          });
          html += "</optgroup>";
        });
      }
      els.cardParentSelect.innerHTML = html;
    }

    /* участники */
    setVal("card-resp-fio", obj.responsible.fio);
    setVal("card-resp-role", obj.responsible.role);
    setVal("card-resp-func", obj.responsible["function"]);
    setVal("card-exec-fio", obj.executor.fio);
    setVal("card-exec-role", obj.executor.role);
    setVal("card-exec-func", obj.executor["function"]);

    /* фактуры и цвет */
    var grid = $("card-texture");
    if (grid) {
      Array.prototype.forEach.call(grid.children, function (btn) {
        var on = btn.getAttribute("data-texture") === obj.texture;
        btn.classList.toggle("active", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    var presets = $("card-color-presets");
    if (presets) {
      Array.prototype.forEach.call(presets.children, function (chip) {
        chip.classList.toggle("active", (chip.getAttribute("data-color") || "").toLowerCase() === obj.color.toLowerCase());
      });
    }

    /* прогресс */
    renderProgress(obj);

    /* орбита */
    if (els.cardOrbit) {
      var parentEnt = obj.parentId ? S.get(obj.parentId) : null;
      var applicable = obj.type !== "group" && (S.view() !== "group" || obj.type === "company");
      els.cardOrbit.disabled = !applicable || (S.view() === "projects" && obj.type === "goal");
      var minOrbit = window.CosmoScene.orbitMin ? window.CosmoScene.orbitMin(obj.id) : null;
      var value = obj.orbitRadius > 0 ? obj.orbitRadius : (minOrbit || 0);
      els.cardOrbit.value = String(value);
      els.cardOrbit.min = "0";
      if (minOrbit != null) {
        els.cardOrbit.min = String(Math.round(minOrbit * 10) / 10);
      }
      els.cardOrbit.disabled = !applicable;
      if (els.cardOrbitValue) els.cardOrbitValue.textContent = obj.orbitRadius > 0 ? value.toFixed(1) : "авто";
      if (els.cardOrbitHint) {
        if (!applicable) {
          els.cardOrbitHint.textContent = obj.type === "group"
            ? "Группа компаний находится в центре — орбита не применяется."
            : "Для Солнца (Цели) орбита не применяется — оно в центре системы.";
        } else if (obj.orbitRadius > 0 && minOrbit != null && obj.orbitRadius < minOrbit) {
          els.cardOrbitHint.textContent = "Орбита поднята до минимально безопасной (" + minOrbit.toFixed(1) + "), чтобы объекты не пересекались.";
        } else {
          els.cardOrbitHint.textContent = "Минимальный безопасный диаметр: " + (minOrbit != null ? minOrbit.toFixed(1) : "рассчитывается") +
            ". Движок автоматически раздвигает орбиты и не даёт объектам слипаться.";
        }
      }
    }

    /* ссылки на автоматизацию */
    renderAutomation(obj);
    renderRelations(obj);

    /* действия */
    if (els.cardAddChild) {
      var childType = info.childType;
      if (childType) {
        els.cardAddChild.disabled = false;
        els.cardAddChild.textContent = addLabelForType(childType);
        els.cardAddChild.setAttribute("data-type", childType);
      } else {
        els.cardAddChild.disabled = true;
        els.cardAddChild.textContent = "Нет дочернего уровня";
        els.cardAddChild.removeAttribute("data-type");
      }
    }

    suppress = false;
  }

  function setVal(id, val) {
    var el = $(id);
    if (el) el.value = val || "";
  }

  function renderProgress(obj) {
    var pct = S.computeProgress(obj.id);
    var calculated = S.isCalculated(obj.id);
    var recurring = obj.progressMode === "recurring";
    var bar = els.cardProgressBar;
    if (bar) {
      bar.querySelector("i").style.width = pct + "%";
      bar.querySelector("i").style.background = "linear-gradient(90deg," +
        S.progressColor(pct, obj.status) + "," + S.progressColor(Math.min(100, pct + 22), obj.status) + ")";
    }
    if (els.cardProgressReadout) els.cardProgressReadout.textContent = Math.round(pct) + "%";

    var modeWrap = els.cardProgressMode;
    if (modeWrap) {
      Array.prototype.forEach.call(modeWrap.querySelectorAll(".seg-btn"), function (btn) {
        var on = btn.getAttribute("data-mode") === obj.progressMode;
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    var sliderWrap = els.cardProgressSliderWrap;
    var slider = els.cardProgressSlider;
    var sliderVal = els.cardProgressSliderValue;
    if (sliderWrap) {
      sliderWrap.classList.toggle("hidden", recurring || calculated);
    }
    if (slider) {
      slider.value = String(Math.round(recurring ? 0 : obj.progress));
      slider.disabled = calculated || recurring;
    }
    if (sliderVal) sliderVal.textContent = Math.round(recurring ? 0 : obj.progress) + "%";

    var hint = els.cardProgressHint;
    if (hint) {
      if (recurring) {
        hint.textContent = "Повторяющаяся задача: ползунок скрыт и объект исключён из средних значений прогресса родителей.";
      } else if (calculated) {
        var kids = S.childrenOf(obj.id).filter(function (c) {
          return D.TYPES[c.type].order === D.TYPES[obj.type].order + 1 && c.progressMode !== "recurring";
        });
        hint.textContent = "Рассчитывается автоматически как среднее прогресса дочерних объектов (" + kids.length + "). Ползунок заблокирован.";
      } else {
        hint.textContent = "Прогресс задаётся вручную: 0–100%.";
      }
    }
  }

  function refreshCardProgress() {
    var obj = S.get(cardId);
    if (!obj) return;
    suppress = true;
    renderProgress(obj);
    if (els.cardTitle && document.activeElement !== els.cardTitle) els.cardTitle.value = obj.name;
    suppress = false;
  }

  function renderAutomation(obj) {
    var wrap = els.cardAutomation;
    if (!wrap) return;
    if (!obj.automationLinks.length) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = "";
    obj.automationLinks.forEach(function (link, idx) {
      var row = document.createElement("div");
      row.className = "link-row";
      var a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.title || link.url;
      a.title = link.url;
      var del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.title = "Удалить ссылку";
      del.textContent = "✕";
      del.addEventListener("click", function () {
        var list = obj.automationLinks.filter(function (_, i) { return i !== idx; });
        S.update(obj.id, { automationLinks: list });
        renderAutomation(S.get(obj.id));
        toast("Ссылка удалена");
      });
      row.appendChild(a);
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function renderRelations(obj) {
    var wrap = els.cardRelations;
    var select = els.relTarget;
    var allowedLink = ["goal", "company"].indexOf(obj.type) >= 0;
    if (els.cardRelationsWrap) els.cardRelationsWrap.classList.toggle("hidden", !allowedLink);
    if (!wrap || !select) return;
    if (!allowedLink) return;

    wrap.innerHTML = "";
    (obj.links || []).forEach(function (link) {
      var target = S.get(link.id);
      if (!target) return;
      var row = document.createElement("div");
      row.className = "link-row";
      var label = document.createElement("span");
      label.textContent = target.name;
      label.title = S.pathLabel(target.id);
      var type = document.createElement("span");
      type.className = "lr-type";
      type.textContent = { out: "→", in: "←", both: "↔" }[link.flow || "out"];
      var del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.title = "Удалить связь";
      del.textContent = "✕";
      del.addEventListener("click", function () {
        S.removeLink(obj.id, target.id);
        renderRelations(S.get(obj.id));
        toast("Связь удалена");
      });
      row.appendChild(type);
      row.appendChild(label);
      row.appendChild(del);
      wrap.appendChild(row);
    });

    var candidates = S.all().filter(function (o) {
      return o.type === obj.type && o.id !== obj.id &&
        !(obj.links || []).some(function (l) { return l.id === o.id; });
    }).sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); });

    select.innerHTML = candidates.length
      ? candidates.map(function (c) {
          return '<option value="' + c.id + '">' + esc(c.name) + " · " + esc(D.TYPES[c.type].short) + "</option>";
        }).join("")
      : '<option value="">Нет доступных объектов</option>';
  }

  /* ---------- Привязка событий карточки ---------- */
  function bindCard() {
    var panel = $("card-panel");
    if (!panel) return;

    if (els.cardClose) els.cardClose.addEventListener("click", closeCard);

    if (els.cardTitle) {
      els.cardTitle.addEventListener("input", function () {
        if (!cardId) return;
        S.update(cardId, { name: els.cardTitle.value });
      });
      els.cardTitle.addEventListener("keydown", function (e) {
        if (e.key === "Enter") els.cardTitle.blur();
      });
      els.cardTitle.addEventListener("blur", function () {
        var obj = S.get(cardId);
        if (!obj) return;
        if (!els.cardTitle.value.trim()) els.cardTitle.value = obj.name;
      });
    }

    if (els.cardParentSelect) {
      els.cardParentSelect.addEventListener("change", function () {
        if (!cardId) return;
        var newParent = els.cardParentSelect.value;
        if (!newParent) return;
        if (S.setParent(cardId, newParent)) {
          toast("Родитель изменён", "ok");
          renderCard();
          setTimeout(function () { window.CosmoScene.focus(cardId); }, 90);
        } else {
          toast("Нельзя перенести объект в этого родителя", "err");
          renderCard();
        }
      });
    }

    if (els.cardKind) els.cardKind.addEventListener("change", function () { applyPatch({ kind: els.cardKind.value }); });
    if (els.cardStatus) els.cardStatus.addEventListener("change", function () { applyPatch({ status: els.cardStatus.value }); });
    if (els.cardDescription) els.cardDescription.addEventListener("input", function () { applyPatch({ description: els.cardDescription.value }); });
    if (els.cardDue) els.cardDue.addEventListener("change", function () { applyPatch({ dueDate: els.cardDue.value }); });

    ["card-resp-fio:responsible:fio", "card-resp-role:responsible:role", "card-resp-func:responsible:function",
     "card-exec-fio:executor:fio", "card-exec-role:executor:role", "card-exec-func:executor:function"
    ].forEach(function (binding) {
      var parts = binding.split(":");
      var el = $(parts[0]);
      if (!el) return;
      el.addEventListener("input", function () {
        if (!cardId || suppress) return;
        var obj = S.get(cardId);
        if (!obj) return;
        var person = obj[parts[1]];
        var patch = {};
        patch[parts[1]] = {
          fio: parts[2] === "fio" ? el.value : person.fio,
          role: parts[2] === "role" ? el.value : person.role,
          "function": parts[2] === "function" ? el.value : person["function"]
        };
        S.update(cardId, patch);
      });
    });

    if (els.cardColor) {
      els.cardColor.addEventListener("input", function () {
        applyPatch({ color: els.cardColor.value });
        var presets = $("card-color-presets");
        if (presets) {
          Array.prototype.forEach.call(presets.children, function (chip) {
            chip.classList.toggle("active", (chip.getAttribute("data-color") || "").toLowerCase() === els.cardColor.value.toLowerCase());
          });
        }
      });
    }

    if (els.cardSize) els.cardSize.addEventListener("input", function () {
      if (els.cardSizeValue) els.cardSizeValue.textContent = Number(els.cardSize.value).toFixed(2);
      applyPatch({ size: Number(els.cardSize.value) });
    });

    if (els.cardOrbit) {
      els.cardOrbit.addEventListener("input", function () {
        if (els.cardOrbitValue) els.cardOrbitValue.textContent = Number(els.cardOrbit.value).toFixed(1);
        applyPatch({ orbitRadius: Number(els.cardOrbit.value) });
      });
      els.cardOrbit.addEventListener("change", function () {
        var obj = S.get(cardId);
        if (!obj) return;
        var min = window.CosmoScene.orbitMin ? window.CosmoScene.orbitMin(obj.id) : null;
        if (min != null && Number(els.cardOrbit.value) < min) {
          toast("Орбита поднята до минимально безопасной, чтобы объекты не пересекались", "err");
        }
      });
    }

    if (els.cardProgressMode) {
      Array.prototype.forEach.call(els.cardProgressMode.querySelectorAll(".seg-btn"), function (btn) {
        btn.addEventListener("click", function () {
          if (!cardId) return;
          var mode = btn.getAttribute("data-mode");
          S.update(cardId, { progressMode: mode });
          renderProgress(S.get(cardId));
        });
      });
    }
    if (els.cardProgressSlider) {
      els.cardProgressSlider.addEventListener("input", function () {
        if (!cardId) return;
        S.update(cardId, { progress: Number(els.cardProgressSlider.value) });
        if (els.cardProgressSliderValue) els.cardProgressSliderValue.textContent = els.cardProgressSlider.value + "%";
        refreshCardProgress();
      });
    }

    if (els.cardAddChild) {
      els.cardAddChild.addEventListener("click", function () {
        if (!cardId) return;
        var type = els.cardAddChild.getAttribute("data-type");
        if (!type) return;
        var created = S.addChild(cardId, type);
        if (!created) return;
        toast("Создан объект: " + created.name, "ok");
        S.setSelection(created.id);
        openCard(created.id);
        setTimeout(function () {
          var view = viewForType(created.type);
          if (S.view() !== view) switchView(view, created.id);
          else window.CosmoScene.focus(created.id);
        }, 80);
      });
    }

    if (els.cardDelete) {
      els.cardDelete.addEventListener("click", function () {
        var obj = S.get(cardId);
        if (!obj) return;
        var kids = S.descendantIds(obj.id).length;
        confirmAction({
          title: "Удалить объект?",
          message: "«" + obj.name + "» (" + D.TYPES[obj.type].label + ") будет удалён" +
            (kids ? ", а также " + kids + " дочерних объектов (каскадно)." : ".") +
            " Действие нельзя отменить.",
          confirm: "Удалить",
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          var parentId = obj.parentId;
          S.remove(obj.id);
          closeCard();
          window.CosmoScene.clearFire();
          toast("Объект удалён", "ok");
          if (parentId) S.setSelection(parentId);
        });
      });
    }

    if (els.cardCopyId) {
      els.cardCopyId.addEventListener("click", function () {
        var id = els.cardId ? els.cardId.textContent : "";
        if (!id) return;
        copyText(id).then(function () {
          toast("ID скопирован: " + id, "ok");
        }).catch(function () {
          toast("Не удалось скопировать ID", "err");
        });
      });
    }

    /* автоматизация */
    if (els.linkAdd) {
      els.linkAdd.addEventListener("click", function () {
        var obj = S.get(cardId);
        if (!obj) return;
        var title = els.linkTitle ? els.linkTitle.value.trim() : "";
        var url = els.linkUrl ? els.linkUrl.value.trim() : "";
        if (!url) { toast("Укажите URL ссылки", "err"); return; }
        var normalized = /^https?:\/\//i.test(url) ? url : "https://" + url;
        var next = obj.automationLinks.concat([{ title: title || normalized, url: normalized }]);
        S.update(obj.id, { automationLinks: next });
        if (els.linkTitle) els.linkTitle.value = "";
        if (els.linkUrl) els.linkUrl.value = "";
        renderAutomation(S.get(obj.id));
        toast("Ссылка добавлена", "ok");
      });
      if (els.linkUrl) {
        els.linkUrl.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); els.linkAdd.click(); }
        });
      }
    }

    /* связи */
    if (els.relAdd) {
      els.relAdd.addEventListener("click", function () {
        var obj = S.get(cardId);
        if (!obj) return;
        var targetId = els.relTarget ? els.relTarget.value : "";
        if (!targetId) { toast("Нет доступных объектов для связи", "err"); return; }
        var flow = els.relFlow ? els.relFlow.value : "out";
        if (S.addLink(obj.id, targetId, flow)) {
          toast("Связь создана", "ok");
          renderRelations(S.get(obj.id));
        } else {
          toast("Не удалось создать связь", "err");
        }
      });
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("copy failed"));
      } catch (e) { reject(e); }
    });
  }

  /* ============================================================
     Дерево «Структура целей Компании»
     ============================================================ */
  function treeExpandedSet() {
    var set = {};
    S.expanded().forEach(function (id) { set[id] = true; });
    return set;
  }

  function renderTree() {
    if (!els.treeContainer) return;
    var selectedId = S.selectedId();
    var root = S.rootGroup();
    var titleEl = els.treeRootTitle;
    var selected = selectedId ? S.get(selectedId) : null;

    if (titleEl) {
      if (selected) {
        var company = null;
        var cur = selected;
        var guard = 0;
        while (cur && guard < 20) {
          if (cur.type === "company") { company = cur; break; }
          cur = cur.parentId ? S.get(cur.parentId) : null;
          guard++;
        }
        titleEl.textContent = company ? "Компания: " + company.name : (root ? root.name : "—");
      } else {
        titleEl.textContent = root ? root.name : "Группа компаний";
      }
    }

    if (!selectedId) {
      els.treeContainer.classList.add("hidden");
      if (els.treeHint) els.treeHint.classList.remove("hidden");
      return;
    }
    els.treeContainer.classList.remove("hidden");
    if (els.treeHint) els.treeHint.classList.add("hidden");

    var expanded = treeExpandedSet();
    var html = "";
    var roots = S.rootObjects();
    var allShown = roots.length ? roots : [];

    function rowHtml(obj, depth) {
      var kids = S.childrenOf(obj.id);
      var hasKids = kids.length > 0;
      var isOpen = !!expanded[obj.id];
      var pct = Math.round(S.computeProgress(obj.id));
      var color = S.progressColor(pct, obj.status);
      var info = D.TYPES[obj.type];
      return '<div class="tree-row' + (obj.id === selectedId ? " sel" : "") + '" data-id="' + obj.id + '" role="treeitem" tabindex="0" aria-expanded="' + (hasKids ? isOpen : "false") + '" style="padding-left:' + (depth * 12) + 'px">' +
        '<span class="tree-caret' + (hasKids ? " has-children" : "") + '" data-caret="' + obj.id + '">' + (hasKids ? (isOpen ? "▾" : "▸") : "") + "</span>" +
        '<span class="tree-icon" style="color:' + obj.color + '">' + info.icon + "</span>" +
        '<span class="tree-name">' + esc(obj.name) +
          (obj.progressMode === "recurring" ? '<span class="tree-sub">↻</span>' : "") +
        "</span>" +
        '<span class="tree-progress" title="Прогресс исполнения: ' + pct + '%">' +
          '<span class="tree-bar"><i style="width:' + pct + '%;background:' + color + '"></i></span>' +
          '<span class="tree-pct" style="color:' + color + '">' + pct + "%</span>" +
        "</span>" +
      "</div>";
    }

    function walk(obj, depth) {
      html += rowHtml(obj, depth);
      var kids = S.childrenOf(obj.id);
      if (!kids.length) return;
      if (expanded[obj.id]) {
        kids.sort(function (a, b) {
          return D.TYPES[a.type].order - D.TYPES[b.type].order || a.name.localeCompare(b.name, "ru");
        });
        kids.forEach(function (k) { walk(k, depth + 1); });
      }
    }

    /* показываем дерево только от корня выбранной компании (или всей группы) */
    var chain = S.pathOf(selectedId);
    var startNode = chain[0] || selected;
    walk(startNode, 0);

    /* если в цепочке есть уровни выше стартового — показываем пометку */
    els.treeContainer.innerHTML = html;

    var selRow = els.treeContainer.querySelector(".tree-row.sel");
    if (selRow) {
      var container = els.treeContainer;
      var top = selRow.offsetTop - container.offsetTop;
      if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - 40) {
        container.scrollTop = Math.max(0, top - container.clientHeight / 2);
      }
    }
  }

  function bindTree() {
    if (!els.treeContainer) return;
    els.treeContainer.addEventListener("click", function (e) {
      var caret = e.target.closest("[data-caret]");
      if (caret) {
        var cid = caret.getAttribute("data-caret");
        var kids = S.childrenOf(cid);
        if (!kids.length) return;
        e.stopPropagation();
        S.toggleTreeExpanded(cid);
        renderTree();
        return;
      }
      var row = e.target.closest(".tree-row");
      if (!row) return;
      var id = row.getAttribute("data-id");
      if (!id) return;
      S.setSelection(id);
      var view = viewForType(S.get(id).type);
      if (S.view() !== view) {
        window.CosmoScene.rememberCamera();
        S.setView(view);
      }
      S.expandTree(id);
      setTimeout(function () {
        window.CosmoScene.focus(id);
        openCard(id);
      }, 80);
    });
    els.treeContainer.addEventListener("keydown", function (e) {
      var row = e.target.closest(".tree-row");
      if (!row) return;
      var id = row.getAttribute("data-id");
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        S.setSelection(id);
        var view = viewForType(S.get(id).type);
        if (S.view() !== view) S.setView(view);
        setTimeout(function () { window.CosmoScene.focus(id); openCard(id); }, 80);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        S.expandTree(id);
        renderTree();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        var kids = S.childrenOf(id);
        if (kids.length && S.expanded().indexOf(id) >= 0) {
          S.toggleTreeExpanded(id);
          renderTree();
        }
      }
    });

    if (els.btnTreeCollapse) {
      els.btnTreeCollapse.addEventListener("click", function () {
        if (!els.treeContainer) return;
        els.treeContainer.classList.toggle("hidden");
        if (els.treeHint && els.treeContainer.classList.contains("hidden")) {
          els.treeHint.classList.add("hidden");
        } else if (els.treeHint && !S.selectedId()) {
          els.treeHint.classList.remove("hidden");
        }
      });
    }
  }

  /* ============================================================
     Верхняя панель
     ============================================================ */
  function bindToolbar() {
    if (els.viewSlider) {
      els.viewSlider.addEventListener("input", function () {
        var view = ["group", "goals", "projects"][Number(els.viewSlider.value)] || "group";
        window.CosmoScene.rememberCamera();
        S.setView(view);
        syncToolbar();
      });
      els.viewSlider.addEventListener("change", function () {
        var view = ["group", "goals", "projects"][Number(els.viewSlider.value)] || "group";
        S.setView(view);
        window.CosmoScene.centerAll();
      });
    }
    ["group", "goals", "projects"].forEach(function (v) {
      var btn = $("view-btn-" + v);
      if (!btn) return;
      btn.addEventListener("click", function () {
        window.CosmoScene.rememberCamera();
        S.setView(v);
        window.CosmoScene.centerAll();
        syncToolbar();
      });
    });

    if (els.btnCenter) {
      els.btnCenter.addEventListener("click", function () {
        window.CosmoScene.centerAll();
        toast("Камера центрирована на показанных объектах");
      });
    }

    if (els.btnAdd) els.btnAdd.addEventListener("click", contextualAdd);

    if (els.btnLink) {
      els.btnLink.addEventListener("click", function () {
        startLinkMode();
      });
    }

    if (els.btnPause) {
      els.btnPause.addEventListener("click", function () {
        S.setPaused(!S.paused());
        syncToolbar();
      });
    }
    if (els.speedSlider) {
      els.speedSlider.addEventListener("input", function () {
        S.setSpeed(Number(els.speedSlider.value));
        if (els.speedValue) els.speedValue.textContent = (S.speed() / 100).toFixed(1) + "×";
      });
    }

    /* отчёты */
    if (els.btnReports) {
      els.btnReports.addEventListener("click", function (e) {
        e.stopPropagation();
        var menu = els.reportsMenu;
        if (!menu) return;
        buildReportsMenu();
        var open = !menu.classList.contains("hidden");
        menu.classList.toggle("hidden", open);
        els.btnReports.setAttribute("aria-expanded", open ? "false" : "true");
      });
      document.addEventListener("click", function (e) {
        if (!els.reportsMenu || els.reportsMenu.classList.contains("hidden")) return;
        if (e.target.closest("#reports-menu") || e.target.closest("#btn-reports")) return;
        els.reportsMenu.classList.add("hidden");
        els.btnReports.setAttribute("aria-expanded", "false");
      });
    }

    /* экспорт/импорт/сброс */
    if (els.btnExportSQL) {
      els.btnExportSQL.addEventListener("click", function () {
        var sql = window.CosmoSQL.exportSQL(S.getState());
        downloadText("orbital-okr-" + stamp() + ".sql", sql, "application/sql;charset=utf-8");
        toast("SQL-дамп выгружен", "ok");
      });
    }
    if (els.btnExportJSON) {
      els.btnExportJSON.addEventListener("click", function () {
        downloadText("orbital-okr-" + stamp() + ".json", S.exportJSON(), "application/json;charset=utf-8");
        toast("JSON выгружен", "ok");
      });
    }
    if (els.btnImport) {
      els.btnImport.addEventListener("click", function () {
        if (els.importFile) els.importFile.click();
      });
    }
    if (els.importFile) {
      els.importFile.addEventListener("change", function () {
        var file = els.importFile.files && els.importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            S.importJSON(String(reader.result));
            closeCard();
            window.CosmoScene.clearFire();
            toast("Данные импортированы: " + Object.keys(S.getState().objects).length + " объектов", "ok");
            window.CosmoScene.centerAll();
          } catch (err) {
            toast("Импорт не удался: " + err.message, "err");
          }
          els.importFile.value = "";
        };
        reader.onerror = function () {
          toast("Не удалось прочитать файл", "err");
          els.importFile.value = "";
        };
        reader.readAsText(file, "utf-8");
      });
    }
    if (els.btnReset) {
      els.btnReset.addEventListener("click", function () {
        confirmAction({
          title: "Сбросить базу данных?",
          message: "Все изменения будут удалены и заменены демонстрационным набором данных. Рекомендуем сначала сделать экспорт JSON.",
          confirm: "Сбросить БД",
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          closeCard();
          window.CosmoScene.clearFire();
          S.reset();
          toast("База данных сброшена к демо-набору", "ok");
          window.CosmoScene.centerAll();
        });
      });
    }

    /* отчёт */
    var reportPrint = $("report-print");
    if (reportPrint) {
      reportPrint.addEventListener("click", function () {
        window.print();
      });
    }
    var reportClose = $("report-close");
    if (reportClose) reportClose.addEventListener("click", function () { window.CosmoReports.close(); });
    var reportDownload = $("report-download");
    if (reportDownload) reportDownload.addEventListener("click", function () { window.CosmoReports.downloadHTML(); });
    var reportOverlay = $("report-overlay");
    if (reportOverlay) {
      reportOverlay.addEventListener("click", function (e) {
        if (e.target === reportOverlay) window.CosmoReports.close();
      });
    }
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function buildReportsMenu() {
    var menu = els.reportsMenu;
    if (!menu) return;
    var list = R.list();
    menu.innerHTML = list.map(function (r) {
      return '<button type="button" role="menuitem" data-report="' + r.id + '">' + esc(r.title) +
        "<small>" + esc(r.description || "") + "</small></button>";
    }).join("");
    Array.prototype.forEach.call(menu.querySelectorAll("button[data-report]"), function (btn) {
      btn.addEventListener("click", function () {
        menu.classList.add("hidden");
        if (els.btnReports) els.btnReports.setAttribute("aria-expanded", "false");
        var report = R.get(btn.getAttribute("data-report"));
        if (report) report.run();
      });
    });
  }

  /* ---------- Режим «Связать» ---------- */
  var linkMode = { active: false, firstId: null };

  function startLinkMode() {
    if (linkMode.active) {
      cancelLinkState();
      toast("Режим «Связать» отменён");
      return;
    }
    var selected = S.selectedId() ? S.get(S.selectedId()) : null;
    if (!selected || ["goal", "company"].indexOf(selected.type) < 0) {
      toast("Сначала выберите Цель или Компанию, затем нажмите «Связать» и укажите вторую", "err");
      return;
    }
    linkMode.active = true;
    linkMode.firstId = selected.id;
    if (els.btnLink) els.btnLink.classList.add("active");
    toast("Выберите второй объект того же уровня объектом в космосе. Отмена — Esc или «Связать» ещё раз.", "ok");
  }

  function finishLinkMode(secondId) {
    if (!linkMode.active) return false;
    var first = S.get(linkMode.firstId);
    var second = S.get(secondId);
    if (!first || !second) return false;
    if (first.id === second.id) {
      toast("Нельзя связать объект с самим собой", "err");
      return true;
    }
    if (first.type !== second.type) {
      toast("Связывать можно только объекты одного уровня (" + D.TYPES[first.type].label + ")", "err");
      return true;
    }
    if (S.addLink(first.id, second.id, "both")) {
      toast("Связь создана: " + first.name + " ↔ " + second.name, "ok");
    } else {
      toast("Такая связь уже существует", "err");
    }
    linkMode.active = false;
    linkMode.firstId = null;
    if (els.btnLink) els.btnLink.classList.remove("active");
    return true;
  }

  window.CosmoUI = {
    toast: toast,
    confirm: confirmAction,
    openCard: openCard,
    closeCard: closeCard,
    syncToolbar: syncToolbar,
    renderTree: renderTree,
    viewForType: viewForType,
    switchView: switchView,
    contextualAdd: contextualAdd,
    handleLinkPick: finishLinkMode,
    cancelLinkMode: function () {
      if (!linkMode.active) return;
      linkMode.active = false;
      linkMode.firstId = null;
      if (els.btnLink) els.btnLink.classList.remove("active");
      toast("Режим «Связать» отменён");
    },
    linkModeActive: function () { return linkMode.active; },
    init: function () {
      if (inited) return;
      inited = true;
      els = {
        cardPanel: $("card-panel"),
        cardTypeBadge: $("card-type-badge"),
        cardTitle: $("card-title"),
        cardClose: $("card-close"),
        cardParentDisplay: $("card-parent-display"),
        cardParentSelect: $("card-parent-select"),
        cardKind: $("card-kind"),
        cardStatus: $("card-status"),
        cardDescription: $("card-description"),
        cardProgressReadout: $("card-progress-readout"),
        cardProgressBar: $("card-progress-bar"),
        cardProgressMode: $("card-progress-mode"),
        cardProgressSliderWrap: $("card-progress-slider-wrap"),
        cardProgressSlider: $("card-progress-slider"),
        cardProgressSliderValue: $("card-progress-slider-value"),
        cardProgressHint: $("card-progress-hint"),
        cardDue: $("card-due"),
        cardColor: $("card-color"),
        cardSize: $("card-size"),
        cardSizeValue: $("card-size-value"),
        cardOrbit: $("card-orbit"),
        cardOrbitValue: $("card-orbit-value"),
        cardOrbitHint: $("card-orbit-hint"),
        cardAutomation: $("card-automation"),
        cardRelations: $("card-relations"),
        cardRelationsWrap: $("card-relations-wrap"),
        cardAddChild: $("card-add-child"),
        cardDelete: $("card-delete"),
        cardCopyId: $("card-copy-id"),
        cardId: $("card-id"),
        linkTitle: $("link-title"),
        linkUrl: $("link-url"),
        linkAdd: $("link-add"),
        relTarget: $("rel-target"),
        relFlow: $("rel-flow"),
        relAdd: $("rel-add"),
        treeContainer: $("tree-container"),
        treeHint: $("tree-hint"),
        treeRootTitle: $("tree-root-title"),
        btnTreeCollapse: $("btn-tree-collapse"),
        viewSlider: $("view-slider"),
        btnAdd: $("btn-add"),
        btnLink: $("btn-link"),
        btnCenter: $("btn-center"),
        btnPause: $("btn-pause"),
        speedSlider: $("speed-slider"),
        speedValue: $("speed-value"),
        dockStats: $("dock-stats"),
        btnReports: $("btn-reports"),
        reportsMenu: $("reports-menu"),
        btnExportSQL: $("btn-export-sql"),
        btnExportJSON: $("btn-export-json"),
        btnImport: $("btn-import"),
        importFile: $("import-file"),
        btnReset: $("btn-reset")
      };

      buildTextureGrid();
      fillSelects();
      bindCard();
      bindTree();
      bindToolbar();

      /* при переходе на «Проекты» без выбора — показываем систему первой Цели */
      /* подписка на store */
      S.subscribe(function (ev) {
        if (ev.type === "change" || ev.type === "reset" || ev.type === "import") {
          syncToolbar();
          renderTree();
          if (cardId) {
            if (!S.get(cardId)) closeCard();
            else refreshCardProgress();
          }
        } else if (ev.type === "select") {
          renderTree();
          syncToolbar();
          if (ev.id) {
            if (cardId !== ev.id) openCard(ev.id);
            else refreshCardProgress();
          } else {
            closeCard();
          }
        } else if (ev.type === "reset" || ev.type === "import") {
          closeCard();
          cancelLinkState();
          syncToolbar();
          renderTree();
          checkEmpty();
        } else if (ev.type === "view") {
          syncToolbar();
          renderTree();
          if (cardId) renderCard();
        } else if (ev.type === "settings") {
          syncToolbar();
        } else if (ev.type === "tree") {
          renderTree();
        }
      });

      syncToolbar();
      renderTree();

      /* Esc закрывает карточку и отчёт */
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          var overlay = $("report-overlay");
          if (overlay && !overlay.classList.contains("hidden")) {
            window.CosmoReports.close();
            return;
          }
          if (cardId) { closeCard(); }
          else if (Date.now() - startTime < 250) { /* игнорируем Esc на старте */ }
        }
        if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
        if (e.key === " " || e.code === "Space") {
          e.preventDefault();
          S.setPaused(!S.paused());
          syncToolbar();
        } else if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") {
          contextualAdd();
        } else if (e.key === "h" || e.key === "H" || e.key === "р" || e.key === "Р") {
          window.CosmoScene.centerAll();
        } else if (e.key === "/" || e.key === ".") {
          e.preventDefault();
          var inp = $("search-input");
          if (inp) inp.focus();
        }
      });

      /* пустое состояние */
      checkEmpty();
      if (S.storageAvailable && !S.storageAvailable()) {
        setTimeout(function () {
          toast("Браузер не разрешает сохранение (localStorage). Запустите через python -m http.server, чтобы данные сохранялись.", "err");
        }, 1400);
      }
      syncTopbarHeight();
      if (window.ResizeObserver) {
        var bar = $("topbar");
        if (bar) new window.ResizeObserver(syncTopbarHeight).observe(bar);
      } else {
        window.addEventListener("resize", syncTopbarHeight);
      }
    },
    afterChange: checkEmpty,
    afterRebuild: function () {
      checkEmpty();
      syncToolbar();
    }
  };

  function cancelLinkState() {
    linkMode.active = false;
    linkMode.firstId = null;
    if (els.btnLink) els.btnLink.classList.remove("active");
  }

  function checkEmpty() {
    var empty = $("empty-state");
    var title = $("empty-title");
    var text = $("empty-text");
    if (!empty) return;
    var view = S.view();
    var ids = window.CosmoScene.visibleIds ? window.CosmoScene.visibleIds() : [];
    if (ids.length) {
      empty.classList.add("hidden");
      return;
    }
    empty.classList.remove("hidden");
    if (view === "group") {
      if (title) title.textContent = "Пока нет Компаний";
      if (text) text.textContent = "Нажмите «+ Компания» — появится первая вселенная вашей группы.";
    } else if (view === "goals") {
      if (title) title.textContent = "Пока нет Целей";
      if (text) text.textContent = "Нажмите «+ Цель», чтобы создать галактику цели.";
    } else {
      if (title) title.textContent = "Пока нет Проектов";
      if (text) text.textContent = "Выберите Цель и нажмите «+ Проект», чтобы построить солнечную систему.";
    }
  }

  window.CosmoUI.toast = toast;
})();
