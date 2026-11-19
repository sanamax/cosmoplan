/* ============================================================
   reports.js — реестр отчётов, отчёт «Обязанности сотрудника»
   ============================================================ */
(function () {
  "use strict";

  var D = window.CosmoData;
  var S = window.Store;

  var registry = [];

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    var parts = iso.split("-");
    return parts[2] + "." + parts[1] + "." + parts[0];
  }

  function todayLabel() {
    return new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function statusPill(status) {
    var color = D.statusColor(status);
    var bg = {
      "новая": "#eef1f8", "в работе": "#e3f6ff", "выполнено": "#e6f9ee",
      "риск": "#ffeaea", "на паузе": "#fff6e0"
    }[status] || "#eef1f8";
    return '<span class="status-pill" style="color:' + color + ';background:' + bg + '">' + esc(status) + "</span>";
  }

  function localToday() {
    var t = new Date();
    return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  }

  function isOverdue(o) {
    if (!o.dueDate || o.status === "выполнено") return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.dueDate)) return false;
    return o.dueDate < localToday();
  }

  /* ---------- Построение пути с отступами ---------- */
  function renderPath(id) {
    var chain = S.pathOf(id);
    var html = '<div class="rp-path">';
    chain.forEach(function (o, i) {
      if (i > 0) html += '<span class="rp-arrow">→</span> ';
      var info = D.TYPES[o.type];
      html += '<span class="rp-lv" style="margin-left:' + (i * 3) + 'mm;display:inline-block">' +
        '<span style="color:#8794bd;font-size:7.5pt;text-transform:uppercase;letter-spacing:.4px">' + esc(info.label) + "</span> " +
        "<b>" + esc(o.name) + "</b></span>";
      if (i < chain.length - 1) html += "<br>";
    });
    html += "</div>";
    return html;
  }

  function buildItem(o, groupRole, functionText) {
    var pct = S.computeProgress(o.id);
    var color = S.progressColor(pct, o.status);
    var info = D.TYPES[o.type];
    var overdue = isOverdue(o);
    return '' +
      '<div class="rp-item">' +
        '<div class="rp-item-head">' +
          '<div class="rp-item-title">' + esc(o.name) + "</div>" +
          '<div><span class="rp-type">' + esc(info.label) + "</span> " +
          ' <span class="rp-pct">' + Math.round(pct) + "%</span></div>" +
        "</div>" +
        renderPath(o.id) +
        '<div class="rp-row">' +
          "<span><b>Функция:</b> " + esc(functionText || "не указана") + "</span>" +
          "<span><b>Статус:</b> " + statusPill(o.status) + "</span>" +
          "<span><b>Срок:</b> " + (overdue ? '<span style="color:#c0392b">' + fmtDate(o.dueDate) + " (просрочен)</span>" : fmtDate(o.dueDate)) + "</span>" +
          (o.progressMode === "recurring" ? "<span><b>Повторяющаяся задача</b> (не входит в усреднение)</span>" : "") +
          '<span style="margin-left:auto"><b>Достигнуто:</b> ' + Math.round(pct) + " %</span>" +
        "</div>" +
        '<div class="rp-bar"><i style="width:' + pct + "%;background:" + color + '"></i></div>' +
      "</div>";
  }

  /* ---------- Отчёт «Обязанности сотрудника» ---------- */
  function employeeReport(fio) {
    var needle = S.normalizeText(fio);
    var objects = S.all();
    var groups = { responsible: { label: "Ответственный", items: [] }, executor: { label: "Исполнитель", items: [] } };

    objects.forEach(function (o) {
      ["responsible", "executor"].forEach(function (roleKey) {
        var p = o[roleKey];
        if (!p || !p.fio) return;
        if (S.normalizeText(p.fio) !== needle) return;
        groups[roleKey].items.push({ obj: o, fn: p.function, role: p.role });
      });
    });

    function sortItems(a, b) {
      var oa = D.TYPES[a.obj.type].order, ob = D.TYPES[b.obj.type].order;
      if (oa !== ob) return oa - ob;
      var pa = S.pathOf(a.obj.id).map(function (x) { return x.name; }).join(" / ");
      var pb = S.pathOf(b.obj.id).map(function (x) { return x.name; }).join(" / ");
      return pa.localeCompare(pb, "ru");
    }
    groups.responsible.items.sort(sortItems);
    groups.executor.items.sort(sortItems);

    var allItems = groups.responsible.items.concat(groups.executor.items);
    var uniqueIds = {};
    allItems.forEach(function (it) { uniqueIds[it.obj.id] = it; });
    var uniqueList = Object.keys(uniqueIds).map(function (k) { return uniqueIds[k]; });

    var sum = 0, riskCount = 0, overdueCount = 0;
    uniqueList.forEach(function (it) {
      sum += S.computeProgress(it.obj.id);
      if (it.obj.status === "риск") riskCount++;
      if (isOverdue(it.obj)) overdueCount++;
    });
    var avg = uniqueList.length ? Math.round(sum / uniqueList.length) : 0;

    var roles = {};
    allItems.forEach(function (it) { if (it.role) roles[it.role] = true; });
    var roleList = Object.keys(roles).join(", ") || "—";
    var functions = [];
    allItems.forEach(function (it) {
      if (it.fn && functions.indexOf(it.fn) < 0) functions.push(it.fn);
    });

    var body = "";
    if (!allItems.length) {
      body = '<div class="rp-empty">По сотруднику «' + esc(fio) + "» не найдено объектов с обязанностями. " +
        "Проверьте написание ФИО в карточках объектов.</div>";
    } else {
      ["responsible", "executor"].forEach(function (key) {
        var g = groups[key];
        body += '<h2 class="rp-section">' + esc(g.label) +
          '<span class="rp-count">' + g.items.length + " " + plural(g.items.length, "объект", "объекта", "объектов") + "</span></h2>";
        if (!g.items.length) {
          body += '<div class="rp-empty">Нет объектов, где сотрудник выступает в этой роли.</div>';
        } else {
          g.items.forEach(function (it) { body += buildItem(it.obj, key, it.fn); });
        }
      });
    }

    var legend = "".concat(
      '<div class="rp-legend">',
      '<span><i style="background:#4ade80"></i>выполнено</span>',
      '<span><i style="background:#42d6ff"></i>в работе</span>',
      '<span><i style="background:#8b97bd"></i>новая</span>',
      '<span><i style="background:#ff6b6b"></i>риск</span>',
      '<span><i style="background:#fbbf24"></i>на паузе</span>',
      "</div>"
    );

    var html = "".concat(
      '<div class="rp-brand">',
      '<div><div class="rp-brandmark">Orbital OKR</div><h1>Обязанности сотрудника</h1></div>',
      '<div class="rp-date">Дата формирования<br><b>' + esc(todayLabel()) + "</b></div>",
      "</div>",
      '<p class="rp-sub">Сводный отчёт по объектам системы целей, где сотрудник указан ответственным или исполнителем.</p>',
      '<div class="rp-employee">',
      '<div class="rp-fio">' + esc(fio) + "</div>",
      '<div class="rp-meta">Роли: ' + esc(roleList) + " · Уникальных объектов: " + uniqueList.length + "</div>",
      '<div class="rp-meta">Функции: ' + esc(functions.join("; ") || "не указаны") + "</div>",
      "</div>",
      '<div class="rp-summary">',
      '<div class="rp-stat"><b>' + uniqueList.length + "</b><span>объектов</span></div>",
      '<div class="rp-stat"><b>' + avg + "%</b><span>средний прогресс</span></div>",
      '<div class="rp-stat"><b>' + riskCount + "</b><span>в риске</span></div>",
      '<div class="rp-stat"><b>' + overdueCount + "</b><span>в просрочке</span></div>",
      "</div>",
      legend,
      body,
      '<div class="rp-foot"><span>Orbital OKR · отчёт «Обязанности сотрудника»</span><span>' + esc(todayLabel()) + "</span></div>"
    );

    return {
      title: "Обязанности сотрудника — " + fio,
      html: html,
      empty: !allItems.length
    };
  }

  function plural(n, one, few, many) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  /* ---------- Регистрация отчётов ---------- */
  function register(def) {
    registry.push(def);
    return def;
  }

  function list() { return registry.slice(); }

  function get(id) {
    for (var i = 0; i < registry.length; i++) if (registry[i].id === id) return registry[i];
    return null;
  }

  register({
    id: "employee-duties",
    title: "Обязанности сотрудника",
    description: "PDF/печать: объекты, роли, иерархия и достигнутый процент",
    run: function () { openEmployeeModal(); }
  });

  /* ---------- Модальное окно выбора ФИО ---------- */
  var activeModal = null;

  function closeModal() {
    if (activeModal && activeModal.parentNode) activeModal.parentNode.removeChild(activeModal);
    activeModal = null;
  }

  function openEmployeeModal() {
    closeModal();
    var employees = S.employees();
    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = '' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="emp-modal-title">' +
        '<h3 id="emp-modal-title">Обязанности сотрудника</h3>' +
        "<p>Укажите ФИО сотрудника — отчёт сформируется по всем объектам, где он ответственный или исполнитель.</p>" +
        '<div class="modal-field">' +
          '<label for="emp-fio" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.75px;color:#9aa5cc;font-weight:700;display:block;margin-bottom:5px">ФИО сотрудника</label>' +
          '<input id="emp-fio" type="text" placeholder="Начните вводить ФИО…" autocomplete="off" aria-autocomplete="list" aria-controls="emp-suggestions">' +
          '<div id="emp-suggestions" class="autocomplete hidden" role="listbox"></div>' +
          '<div id="emp-error" class="modal-error"></div>' +
        "</div>" +
        '<div class="modal-actions">' +
          '<button type="button" class="btn ghost" data-act="cancel">Отмена</button>' +
          '<button type="button" class="btn primary" data-act="run">Сформировать отчёт</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(backdrop);
    activeModal = backdrop;

    var input = backdrop.querySelector("#emp-fio");
    var sug = backdrop.querySelector("#emp-suggestions");
    var err = backdrop.querySelector("#emp-error");
    var activeIndex = -1;
    var filtered = [];

    function renderSuggestions() {
      var needle = S.normalizeText(input.value);
      filtered = employees.filter(function (e) {
        return !needle || S.normalizeText(e.fio).indexOf(needle) >= 0;
      }).slice(0, 8);
      if (!filtered.length) {
        sug.classList.add("hidden");
        sug.innerHTML = "";
        activeIndex = -1;
        return;
      }
      sug.innerHTML = filtered.map(function (e, i) {
        return '<button type="button" data-idx="' + i + '" role="option" class="' + (i === activeIndex ? "active" : "") + '">' +
          esc(e.fio) + '<span style="display:block;font-size:10.5px;color:#8b96ba">' + esc(e.roles.join(", ")) + " · объектов: " + e.count + "</span></button>";
      }).join("");
      sug.classList.remove("hidden");
    }

    function pick(fio) {
      input.value = fio;
      sug.classList.add("hidden");
      err.textContent = "";
    }

    function run() {
      var fio = input.value.trim();
      if (!fio) {
        err.textContent = "Введите ФИО сотрудника.";
        input.focus();
        return;
      }
      var found = S.findEmployee(fio);
      if (!found) {
        err.textContent = "Сотрудник «" + fio + "» не найден. Проверьте ФИО или выберите из подсказок.";
        return;
      }
      var report = employeeReport(found.fio);
      closeModal();
      window.CosmoReports.show(report);
    }

    input.addEventListener("input", function () { activeIndex = -1; renderSuggestions(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && filtered.length) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % filtered.length;
        renderSuggestions();
      } else if (e.key === "ArrowUp" && filtered.length) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        renderSuggestions();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && filtered[activeIndex]) pick(filtered[activeIndex].fio);
        if (!sug.classList.contains("hidden") && activeIndex >= 0) { run(); }
        else run();
      } else if (e.key === "Escape") {
        closeModal();
      }
    });
    sug.addEventListener("mousedown", function (e) {
      var btn = e.target.closest("button[data-idx]");
      if (!btn) return;
      e.preventDefault();
      pick(filtered[Number(btn.getAttribute("data-idx"))].fio);
    });
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeModal();
      var act = e.target.closest("[data-act]");
      if (!act) return;
      if (act.getAttribute("data-act") === "cancel") closeModal();
      if (act.getAttribute("data-act") === "run") run();
    });
    renderSuggestions();
    setTimeout(function () { input.focus(); }, 40);
  }

  /* ---------- Показ предпросмотра и печать ---------- */
  var overlay = null;

  function show(report) {
    overlay = document.getElementById("report-overlay");
    var page = document.getElementById("report-page");
    if (!overlay || !page) return;
    page.innerHTML = report.html;
    overlay.classList.remove("hidden");
    var scroll = document.getElementById("report-scroll");
    if (scroll) scroll.scrollTop = 0;
    page.setAttribute("data-title", report.title || "Отчёт Orbital OKR");
    var btn = document.getElementById("report-print");
    if (btn) {
      if (report.empty) {
        btn.disabled = true;
        btn.textContent = "Нет данных для печати";
      } else {
        btn.disabled = false;
        btn.textContent = "🖨 Сохранить в PDF / Печать";
      }
    }
  }

  function close() {
    if (!overlay) overlay = document.getElementById("report-overlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function printableHTML() {
    var page = document.getElementById("report-page");
    if (!page) return "";
    return "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"UTF-8\">" +
      "<title>" + esc(page.getAttribute("data-title") || "Отчёт Orbital OKR") + "</title>" +
      "<style>" + REPORT_STYLES + "</style></head><body>" +
      '<div class="report-page">' + page.innerHTML + "</div></body></html>";
  }

  function downloadHTML() {
    var content = printableHTML();
    if (!content) return;
    var blob = new Blob(["\ufeff" + content], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var page = document.getElementById("report-page");
    a.download = sanitizeFilename((page && page.getAttribute("data-title")) || "orbital-okr-report") + ".html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function sanitizeFilename(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 90);
  }

  /* Минимальный набор стилей для скачанного HTML (автономный файл) */
  var REPORT_STYLES = [
    "html,body{margin:0;padding:0;background:#fff;color:#16203a;font-family:'PT Sans','Segoe UI',Arial,sans-serif;}",
    "@page{size:A4 portrait;margin:12mm;}",
    ".report-page{width:210mm;min-height:297mm;box-sizing:border-box;padding:14mm;font-size:10.5pt;line-height:1.45;margin:0 auto;}",
    ".report-page h1{font-size:21pt;margin:0 0 2mm;color:#101b3c;}",
    ".rp-brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2a3a72;padding-bottom:4mm;margin-bottom:6mm;}",
    ".rp-brandmark{font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:#5b6da8;font-weight:700;}",
    ".rp-date{font-size:9pt;color:#5b6da8;text-align:right;}",
    ".rp-sub{font-size:11pt;color:#44507a;margin:0 0 6mm;}",
    ".rp-employee{background:#f2f5ff;border-left:3px solid #5563d6;padding:4mm 5mm;border-radius:2mm;margin-bottom:6mm;}",
    ".rp-fio{font-size:15pt;font-weight:700;color:#101b3c;}",
    ".rp-meta{font-size:9pt;color:#55608a;margin-top:1mm;}",
    ".rp-summary{display:flex;gap:3mm;margin:0 0 7mm;}",
    ".rp-stat{flex:1;border:1px solid #d8e0f5;border-radius:2mm;padding:3mm;text-align:center;}",
    ".rp-stat b{display:block;font-size:16pt;color:#1f2c5c;}",
    ".rp-stat span{font-size:8pt;color:#5b6689;text-transform:uppercase;letter-spacing:.4px;}",
    "h2.rp-section{font-size:12.5pt;margin:7mm 0 3mm;padding-bottom:1.5mm;border-bottom:1px solid #c9d4ee;color:#1a2550;display:flex;justify-content:space-between;}",
    "h2.rp-section .rp-count{font-size:9pt;color:#6b76a0;font-weight:400;}",
    ".rp-item{border:1px solid #e1e8f7;border-radius:2mm;padding:3mm 4mm;margin-bottom:2.5mm;page-break-inside:avoid;}",
    ".rp-item-head{display:flex;justify-content:space-between;gap:3mm;align-items:baseline;}",
    ".rp-item-title{font-size:10.5pt;font-weight:700;}",
    ".rp-type{font-size:7.5pt;text-transform:uppercase;letter-spacing:.6px;color:#5563d6;background:#eef1ff;padding:.6mm 2mm;border-radius:1mm;font-weight:700;}",
    ".rp-path{font-size:8.5pt;color:#6b76a0;margin:1.5mm 0;}",
    ".rp-path .rp-arrow{color:#a9b4d4;margin:0 1mm;}",
    ".rp-row{display:flex;gap:4mm;font-size:9pt;color:#44507a;flex-wrap:wrap;}",
    ".rp-row b{color:#1f2c5c;font-weight:600;}",
    ".rp-bar{height:2.2mm;background:#e8edf9;border-radius:2mm;overflow:hidden;margin-top:2mm;}",
    ".rp-bar i{display:block;height:100%;border-radius:2mm;}",
    ".rp-pct{font-variant-numeric:tabular-nums;font-weight:700;color:#1f2c5c;}",
    ".status-pill{display:inline-block;padding:.4mm 2mm;border-radius:1mm;font-size:8pt;font-weight:700;}",
    ".rp-empty{font-size:10pt;color:#6b76a0;padding:6mm;text-align:center;border:1px dashed #c9d4ee;border-radius:2mm;}",
    ".rp-foot{margin-top:8mm;padding-top:3mm;border-top:1px solid #d8e0f5;font-size:8pt;color:#7b86ab;display:flex;justify-content:space-between;}",
    ".rp-legend{display:flex;gap:4mm;flex-wrap:wrap;font-size:8pt;color:#5b6689;margin-bottom:4mm;}",
    ".rp-legend i{display:inline-block;width:3mm;height:3mm;border-radius:50%;margin-right:1mm;vertical-align:middle;}"
  ].join("\n");

  window.CosmoReports = {
    register: register,
    list: list,
    get: get,
    employeeReport: employeeReport,
    show: show,
    close: close,
    downloadHTML: downloadHTML,
    openEmployeeModal: openEmployeeModal
  };
})();
