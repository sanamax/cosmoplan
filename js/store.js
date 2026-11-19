/* ============================================================
   store.js — единый источник правды: данные, прогресс, события
   ============================================================ */
(function () {
  "use strict";

  var D = window.CosmoData;
  var STORAGE_KEY = "orbital-okr:data";
  var SCHEMA_VERSION = D.SCHEMA_VERSION;

  var listeners = [];
  var state = null;
  var progressCache = null;

  /* ---------- Утилиты ---------- */
  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeText(str) {
    return String(str == null ? "" : str)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pad(n) { return ("000000" + n).slice(-6); }

  var PREFIX = { group: "GRP", company: "CMP", goal: "GOAL", project: "PRJ", task: "TSK", subtask: "SUB" };

  function emptyPerson() {
    return { fio: "", role: "", function: "" };
  }

  function personMatcher(a, b) {
    if (!a || !b) return false;
    return a.fio === b.fio && a.role === b.role;
  }

  /* ---------- Схема и миграция ---------- */
  function normalizeObject(raw, type, idx) {
    var t = D.TYPES[type] ? type : "task";
    var info = D.TYPES[t];
    var o = raw || {};
    var resp = o.responsible || {};
    var exec = o.executor || {};
    return {
      id: typeof o.id === "string" && o.id ? o.id : PREFIX[t] + "-" + pad(idx || 1),
      type: t,
      parentId: typeof o.parentId === "string" ? o.parentId : (o.parentId === null ? null : null),
      name: typeof o.name === "string" && o.name.trim() ? o.name : info.label,
      description: typeof o.description === "string" ? o.description : "",
      status: D.STATUSES.some(function (s) { return s.value === o.status; }) ? o.status : "новая",
      progressMode: o.progressMode === "recurring" ? "recurring" : "manual",
      progress: clampNumber(o.progress, 0, 100, 0),
      kind: D.KINDS.some(function (k) { return k.value === o.kind; }) ? o.kind : "задача",
      color: /^#[0-9a-fA-F]{6}$/.test(o.color || "") ? o.color : info.defaultColor,
      texture: D.TEXTURE_IDS.indexOf(o.texture) >= 0 ? o.texture : "earth",
      size: clampNumber(o.size, 0.05, 30, info.defaultSize),
      orbitRadius: clampNumber(o.orbitRadius, 0, 400, 0),
      responsible: {
        fio: typeof resp.fio === "string" ? resp.fio : "",
        role: typeof resp.role === "string" ? resp.role : "",
        function: typeof resp.function === "string" ? resp.function : ""
      },
      executor: {
        fio: typeof exec.fio === "string" ? exec.fio : "",
        role: typeof exec.role === "string" ? exec.role : "",
        function: typeof exec.function === "string" ? exec.function : ""
      },
      dueDate: typeof o.dueDate === "string" ? o.dueDate : "",
      automationLinks: Array.isArray(o.automationLinks)
        ? o.automationLinks.map(function (l) {
            return { title: String((l && l.title) || "Ссылка"), url: String((l && l.url) || "") };
          }).filter(function (l) { return l.url; })
        : [],
      links: Array.isArray(o.links)
        ? o.links.map(function (l) {
            if (typeof l === "string") return { id: l, flow: "out" };
            return { id: String((l && l.id) || ""), flow: normFlow(l && l.flow) };
          }).filter(function (l) { return l.id; })
        : [],
      createdAt: o.createdAt || nowIso(),
      updatedAt: o.updatedAt || nowIso()
    };
  }

  function normFlow(f) {
    return f === "in" || f === "both" ? f : "out";
  }

  function clampNumber(v, min, max, dflt) {
    var n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.min(max, Math.max(min, n));
  }

  function migrate(raw) {
    if (!raw || typeof raw !== "object") return null;
    var version = Number(raw.version) || 0;
    var objectsRaw = raw.objects;
    if (!objectsRaw) return null;

    /* v1 → v2: плоский массив объектов */
    var list = Array.isArray(objectsRaw) ? objectsRaw : Object.keys(objectsRaw).map(function (k) { return objectsRaw[k]; });
    var objects = {};
    var counters = { group: 0, company: 0, goal: 0, project: 0, task: 0, subtask: 0 };

    list.forEach(function (o) {
      if (!o || !D.TYPES[o.type]) return;
      counters[o.type] += 1;
      var norm = normalizeObject(o, o.type, counters[o.type]);
      objects[norm.id] = norm;
    });

    /* v2 → v3: гарантируем корректные parentId и уникальность */
    var byType = {};
    Object.keys(objects).forEach(function (id) {
      var o = objects[id];
      (byType[o.type] = byType[o.type] || []).push(o);
    });
    Object.keys(objects).forEach(function (id) {
      var o = objects[id];
      if (o.type === "group") { o.parentId = null; return; }
      var parent = o.parentId ? objects[o.parentId] : null;
      if (!parent || D.TYPES[parent.type].childType !== o.type) o.parentId = null;
    });

    /* Сироты без родителя (кроме группы) прикрепляем к первому подходящему родителю */
    var group = byType.group && byType.group[0];
    Object.keys(objects).forEach(function (id) {
      var o = objects[id];
      if (o.type === "group" || o.parentId) return;
      var wanted = null;
      var types = D.TYPE_ORDER;
      for (var i = types.indexOf(o.type) - 1; i >= 0; i--) {
        var cands = byType[types[i]];
        if (cands && cands.length) { wanted = cands[0]; break; }
      }
      o.parentId = wanted ? wanted.id : (o.type === "company" && group ? group.id : null);
    });

    /* убираем связи с несуществующими объектами */
    Object.keys(objects).forEach(function (id) {
      var o = objects[id];
      o.links = o.links.filter(function (l) { return objects[l.id] && l.id !== id; });
    });

    var sequence = {};
    D.TYPE_ORDER.forEach(function (t) {
      sequence[t] = Math.max(counters[t], Number((raw.sequence || {})[t]) || 0);
    });

    var ui = raw.ui || {};
    var view = raw.view === "goals" || raw.view === "projects" ? raw.view : "group";
    var selectedId = ui.selectedId && objects[ui.selectedId] ? ui.selectedId : null;
    var treeExpanded = Array.isArray(ui.treeExpanded)
      ? ui.treeExpanded.filter(function (x) { return !!objects[x]; })
      : [];

    return {
      version: SCHEMA_VERSION,
      objects: objects,
      view: view,
      ui: {
        selectedId: selectedId,
        speed: clampNumber(ui.speed, 0, 200, 100),
        paused: !!ui.paused,
        treeExpanded: treeExpanded
      },
      camera: raw.camera && isFinite(raw.camera.x) ? {
        x: Number(raw.camera.x), y: Number(raw.camera.y), z: Number(raw.camera.z),
        tx: Number(raw.camera.tx) || 0, ty: Number(raw.camera.ty) || 0, tz: Number(raw.camera.tz) || 0
      } : null,
      sequence: sequence,
      migratedFrom: version
    };
  }

  /* ---------- Сохранение / загрузка ---------- */
  var saveTimer = null;

  var storageOk = true;

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
      return true;
    } catch (e) {
      console.warn("Не удалось сохранить данные в localStorage:", e);
      storageOk = false;
      return false;
    }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveNow();
    }, 220);
  }

  function load() {
    var raw = null;
    try {
      var str = localStorage.getItem(STORAGE_KEY);
      if (str) raw = JSON.parse(str);
    } catch (e) {
      console.warn("Данные в localStorage повреждены, загружаем демо-набор:", e);
      raw = null;
    }
    var migrated = raw ? migrate(raw) : null;
    if (migrated) {
      state = migrated;
      if (migrated.migratedFrom !== SCHEMA_VERSION) saveNow();
    } else {
      state = migrate(D.buildDemo());
      saveNow();
    }
    progressCache = null;
  }

  /* ---------- События ---------- */
  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (f) { return f !== fn; });
    };
  }

  function emit(event) {
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](event || { type: "change" });
      } catch (e) {
        console.error("Ошибка обработчика store:", e);
      }
    }
  }

  function markChanged(id, extra) {
    progressCache = null;
    var obj = id ? state.objects[id] : null;
    if (obj) obj.updatedAt = nowIso();
    scheduleSave();
    var ev = { type: "change", id: id || null };
    if (extra) Object.keys(extra).forEach(function (k) { ev[k] = extra[k]; });
    emit(ev);
  }

  /* ---------- Доступ ---------- */
  function get(id) {
    return id ? state.objects[id] || null : null;
  }

  function all() {
    return Object.keys(state.objects).map(function (id) { return state.objects[id]; });
  }

  function childrenOf(id) {
    var res = [];
    Object.keys(state.objects).forEach(function (k) {
      if (state.objects[k].parentId === id) res.push(state.objects[k]);
    });
    return res;
  }

  function rootGroup() {
    var groups = all().filter(function (o) { return o.type === "group"; });
    return groups[0] || null;
  }

  function rootObjects() {
    return all().filter(function (o) { return !o.parentId; });
  }

  function siblingsOf(id) {
    var o = get(id);
    if (!o) return [];
    return childrenOf(o.parentId);
  }

  function descendantIds(id) {
    var out = [];
    (function walk(pid) {
      childrenOf(pid).forEach(function (c) {
        out.push(c.id);
        walk(c.id);
      });
    })(id);
    return out;
  }

  function pathOf(id) {
    var chain = [];
    var cur = get(id);
    var guard = 0;
    while (cur && guard < 32) {
      chain.unshift(cur);
      cur = cur.parentId ? get(cur.parentId) : null;
      guard++;
    }
    return chain;
  }

  function pathLabel(id) {
    return pathOf(id).map(function (o) { return o.name; }).join(" → ");
  }

  /* ---------- Прогресс ---------- */
  function participating(id) {
    var o = get(id);
    if (!o) return false;
    return o.progressMode !== "recurring";
  }

  function computeProgress(id) {
    if (progressCache && typeof progressCache[id] === "number") return progressCache[id];
    if (!progressCache) progressCache = {};
    var o = get(id);
    if (!o) return 0;
    var info = D.TYPES[o.type];
    var value;
    var kids = childrenOf(id).filter(function (c) { return D.TYPES[c.type].order === info.order + 1; });
    var active = kids.filter(function (c) { return c.progressMode !== "recurring"; });
    if (active.length) {
      var sum = 0;
      active.forEach(function (c) { sum += computeProgress(c.id); });
      value = sum / active.length;
    } else {
      value = o.progress;
    }
    value = Math.max(0, Math.min(100, Math.round(value * 10) / 10));
    progressCache[id] = value;
    return value;
  }

  function isCalculated(id) {
    var o = get(id);
    if (!o) return false;
    var info = D.TYPES[o.type];
    var kids = childrenOf(id).filter(function (c) { return D.TYPES[c.type].order === info.order + 1 && c.progressMode !== "recurring"; });
    return kids.length > 0;
  }

  function progressColor(pct, status) {
    if (status === "риск") return "#ff6b6b";
    if (status === "на паузе") return "#fbbf24";
    if (pct >= 100) return "#4ade80";
    if (pct >= 60) return "#63e6a4";
    if (pct >= 30) return "#48e0ff";
    return "#7c8cff";
  }

  function stats() {
    var objs = all();
    var counts = { group: 0, company: 0, goal: 0, project: 0, task: 0, subtask: 0 };
    var risk = 0, overdue = 0, done = 0, totalPct = 0, counted = 0;
    var now = new Date();
    var todayStr = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
    objs.forEach(function (o) {
      counts[o.type]++;
      if (o.status === "риск") risk++;
      if (o.status === "выполнено") done++;
      if (o.dueDate) {
        if (o.dueDate < todayStr && o.status !== "выполнено") overdue++;
      }
      if (o.progressMode !== "recurring") {
        totalPct += computeProgress(o.id);
        counted++;
      }
    });
    return {
      counts: counts,
      risk: risk,
      overdue: overdue,
      done: done,
      avg: counted ? Math.round(totalPct / counted) : 0,
      total: objs.length
    };
  }

  /* ---------- Создание ---------- */
  function nextId(type) {
    state.sequence[type] = (state.sequence[type] || 0) + 1;
    return PREFIX[type] + "-" + pad(state.sequence[type]);
  }

  function defaultOrbit(type, parent) {
    if (!parent) return 0;
    var siblings = childrenOf(parent.id);
    var base = D.TYPES[parent.type].key === "goal" ? 6.2 : D.TYPES[parent.type].key === "project" ? 1.9 : 2.2;
    return Math.round((base + siblings.length * (base * 0.55)) * 10) / 10;
  }

  function makeObject(type, parentId, opts) {
    opts = opts || {};
    var info = D.TYPES[type];
    var parent = parentId ? get(parentId) : null;
    var siblings = parent ? childrenOf(parent.id) : rootObjects();
    var n = siblings.length + 1;
    var palette = D.COLORS;
    var obj = {
      id: nextId(type),
      type: type,
      parentId: parentId || null,
      name: opts.name || (info.label + " " + n),
      description: opts.description || "",
      status: opts.status || "новая",
      progressMode: "manual",
      progress: typeof opts.progress === "number" ? opts.progress : 0,
      kind: type === "task" ? "задача" : type === "subtask" ? "подзадача" : type === "project" ? "автоматизировано" : "связан",
      color: opts.color || palette[(n - 1) % palette.length],
      texture: opts.texture || D.TEXTURE_IDS[(siblings.length + D.TYPE_ORDER.indexOf(type) * 3) % 16],
      size: typeof opts.size === "number" ? opts.size : info.defaultSize,
      orbitRadius: defaultOrbit(type, parent),
      responsible: { fio: "", role: "", function: "" },
      executor: { fio: "", role: "", function: "" },
      dueDate: opts.dueDate || "",
      automationLinks: [],
      links: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    if (parent) {
      /* наследуем участников от родителя для удобства заполнения */
      obj.responsible = { fio: parent.responsible.fio, role: parent.responsible.role, function: "" };
      obj.executor = { fio: parent.executor.fio, role: parent.executor.role, function: "" };
    }
    return obj;
  }

  function addChild(parentId, type) {
    var parent = get(parentId);
    if (!parent) return null;
    var expected = D.TYPES[parent.type].childType;
    if (!expected) return null;
    if (type && type !== expected) return null;
    var obj = makeObject(expected, parent.id);
    state.objects[obj.id] = obj;
    if (state.ui.treeExpanded.indexOf(parent.id) < 0) state.ui.treeExpanded.push(parent.id);
    markChanged(obj.id, { created: obj.id });
    return obj;
  }

  function addTop(type) {
    var obj;
    if (type === "company") {
      var group = rootGroup();
      if (!group) {
        obj = makeObject("group", null, { name: "Новая группа компаний" });
        state.objects[obj.id] = obj;
        markChanged(obj.id, { created: obj.id });
        return obj;
      }
      return addChild(group.id, "company");
    }
    if (type === "group") {
      if (rootGroup()) return null;
      obj = makeObject("group", null, { name: "Новая группа компаний" });
      state.objects[obj.id] = obj;
      markChanged(obj.id, { created: obj.id });
      return obj;
    }
    if (type === "goal") {
      var comp = state.ui.selectedId ? get(state.ui.selectedId) : null;
      while (comp && comp.type !== "company") comp = comp.parentId ? get(comp.parentId) : null;
      if (!comp) {
        var companies = all().filter(function (o) { return o.type === "company"; });
        comp = companies[0] || null;
      }
      if (!comp) {
        var g = rootGroup();
        if (g) comp = addChild(g.id, "company");
      }
      return comp ? addChild(comp.id, "goal") : null;
    }
    if (type === "project") {
      var goal = state.ui.selectedId ? get(state.ui.selectedId) : null;
      while (goal && goal.type !== "goal") goal = goal.parentId ? get(goal.parentId) : null;
      if (!goal) {
        var goals = all().filter(function (o) { return o.type === "goal"; });
        goal = goals[0] || null;
      }
      return goal ? addChild(goal.id, "project") : null;
    }
    if (type === "task") {
      var proj = state.ui.selectedId ? get(state.ui.selectedId) : null;
      while (proj && proj.type !== "project") proj = proj.parentId ? get(proj.parentId) : null;
      if (!proj) {
        var projects = all().filter(function (o) { return o.type === "project"; });
        proj = projects[0] || null;
      }
      return proj ? addChild(proj.id, "task") : null;
    }
    if (type === "subtask") {
      var tsk = state.ui.selectedId ? get(state.ui.selectedId) : null;
      while (tsk && tsk.type !== "task") tsk = tsk.parentId ? get(tsk.parentId) : null;
      if (!tsk) {
        var tasks = all().filter(function (o) { return o.type === "task"; });
        tsk = tasks[0] || null;
      }
      return tsk ? addChild(tsk.id, "subtask") : null;
    }
    return null;
  }

  /* ---------- Изменение ---------- */
  var EDITABLE = ["name", "description", "status", "progressMode", "progress", "kind", "color",
    "texture", "size", "orbitRadius", "dueDate", "responsible", "executor", "automationLinks", "links"];

  function update(id, patch) {
    var o = get(id);
    if (!o) return null;
    var changed = false;
    var fields = [];
    Object.keys(patch).forEach(function (key) {
      if (EDITABLE.indexOf(key) < 0) return;
      var v = patch[key];
      if (key === "name") {
        var nm = String(v || "").trim();
        if (!nm || nm === o.name) return;
        o.name = nm.slice(0, 140);
        changed = true; fields.push(key);
      } else if (key === "description" || key === "dueDate") {
        var s = String(v == null ? "" : v);
        if (o[key] !== s) { o[key] = s; changed = true; fields.push(key); }
      } else if (key === "status") {
        if (D.STATUSES.some(function (s) { return s.value === v; }) && o.status !== v) { o.status = v; changed = true; fields.push(key); }
      } else if (key === "kind") {
        if (D.KINDS.some(function (k) { return k.value === v; }) && o.kind !== v) { o.kind = v; changed = true; fields.push(key); }
      } else if (key === "progressMode") {
        var mode = v === "recurring" ? "recurring" : "manual";
        if (o.progressMode !== mode) { o.progressMode = mode; changed = true; fields.push(key); }
      } else if (key === "progress") {
        var p = clampNumber(v, 0, 100, o.progress);
        if (o.progress !== p) { o.progress = p; changed = true; fields.push(key); }
      } else if (key === "color") {
        if (/^#[0-9a-fA-F]{6}$/.test(v || "") && o.color !== v) { o.color = v; changed = true; fields.push(key); }
      } else if (key === "texture") {
        if (D.TEXTURE_IDS.indexOf(v) >= 0 && o.texture !== v) { o.texture = v; changed = true; fields.push(key); }
      } else if (key === "size") {
        var sz = clampNumber(v, 0.05, 30, o.size);
        if (o.size !== sz) { o.size = sz; changed = true; fields.push(key); }
      } else if (key === "orbitRadius") {
        var orb = clampNumber(v, 0, 400, o.orbitRadius);
        if (o.orbitRadius !== orb) { o.orbitRadius = orb; changed = true; fields.push(key); }
      } else if (key === "responsible" || key === "executor") {
        var cur = o[key];
        var nv = {
          fio: typeof v.fio === "string" ? v.fio : cur.fio,
          role: typeof v.role === "string" ? v.role : cur.role,
          function: typeof v["function"] === "string" ? v["function"] : cur["function"]
        };
        if (cur.fio !== nv.fio || cur.role !== nv.role || cur["function"] !== nv["function"]) {
          o[key] = nv; changed = true; fields.push(key);
        }
      } else if (key === "automationLinks") {
        if (Array.isArray(v)) { o.automationLinks = v; changed = true; fields.push(key); }
      } else if (key === "links") {
        if (Array.isArray(v)) { o.links = v; changed = true; fields.push(key); }
      }
    });
    if (changed) markChanged(id, { fields: fields });
    return o;
  }

  function rename(id, name) {
    return update(id, { name: name });
  }

  function allowedParents(id) {
    var o = get(id);
    if (!o) return [];
    if (o.type === "group") return [];
    var banned = descendantIds(id);
    return all().filter(function (c) {
      if (c.id === id) return false;
      if (banned.indexOf(c.id) >= 0) return false;
      return D.TYPES[c.type].childType === o.type;
    }).sort(function (a, b) {
      var pa = pathOf(a.id), pb = pathOf(b.id);
      return pa.length - pb.length || a.name.localeCompare(b.name, "ru");
    });
  }

  function setParent(id, parentId) {
    var o = get(id);
    if (!o) return false;
    var allowed = allowedParents(id).some(function (p) { return p.id === parentId; });
    if (!allowed) return false;
    if (o.parentId === parentId) return true;
    if (o.type === "group") return false;
    o.parentId = parentId;
    markChanged(id, { moved: id });
    return true;
  }

  function remove(id) {
    var o = get(id);
    if (!o) return false;
    var ids = [id].concat(descendantIds(id));
    ids.forEach(function (rid) {
      delete state.objects[rid];
      state.ui.treeExpanded = state.ui.treeExpanded.filter(function (x) { return x !== rid; });
      Object.keys(state.objects).forEach(function (oid) {
        var other = state.objects[oid];
        other.links = other.links.filter(function (l) { return l.id !== rid; });
      });
    });
    if (state.ui.selectedId && ids.indexOf(state.ui.selectedId) >= 0) state.ui.selectedId = null;
    if (o.parentId) {
      /* возвращаем состояния родителю */
      var parent = get(o.parentId);
      if (parent) parent.updatedAt = nowIso();
    }
    markChanged(o.parentId, { removed: ids });
    return true;
  }

  /* ---------- Связи между целями/компаниями ---------- */
  function addLink(aId, bId, flow) {
    var a = get(aId), b = get(bId);
    if (!a || !b || aId === bId) return false;
    if (a.type !== b.type) return false;
    if (["goal", "company"].indexOf(a.type) < 0) return false;
    if (a.links.some(function (l) { return l.id === bId; })) return false;
    var f = normFlow(flow);
    var reverse = { out: "in", in: "out", both: "both" }[f];
    a.links.push({ id: bId, flow: f });
    if (!b.links.some(function (l) { return l.id === aId; })) {
      b.links.push({ id: aId, flow: reverse });
    }
    markChanged(aId, { linkAdded: aId });
    return true;
  }

  function removeLink(aId, bId) {
    var a = get(aId), b = get(bId);
    if (!a) return false;
    a.links = a.links.filter(function (l) { return l.id !== bId; });
    if (b) b.links = b.links.filter(function (l) { return l.id !== aId; });
    markChanged(aId, { linkRemoved: aId });
    return true;
  }

  /* ---------- Вид, выбор, настройки ---------- */
  function setView(view) {
    var v = view === "goals" || view === "projects" ? view : "group";
    if (state.view === v) return;
    state.view = v;
    scheduleSave();
    emit({ type: "view", view: v });
  }

  function setSelection(id) {
    var next = id && get(id) ? id : null;
    if (state.ui.selectedId === next) return;
    state.ui.selectedId = next;
    if (next) {
      var chain = pathOf(next);
      chain.forEach(function (o) {
        if (state.ui.treeExpanded.indexOf(o.id) < 0) state.ui.treeExpanded.push(o.id);
      });
    }
    scheduleSave();
    emit({ type: "select", id: next });
  }

  function setSpeed(v) {
    state.ui.speed = clampNumber(v, 0, 200, 100);
    scheduleSave();
    emit({ type: "settings" });
  }

  function setPaused(p) {
    state.ui.paused = !!p;
    scheduleSave();
    emit({ type: "settings" });
  }

  function setCamera(cam) {
    if (!cam) return;
    state.camera = {
      x: cam.x, y: cam.y, z: cam.z,
      tx: cam.tx || 0, ty: cam.ty || 0, tz: cam.tz || 0
    };
    scheduleSave();
  }

  function toggleTreeExpanded(id) {
    var i = state.ui.treeExpanded.indexOf(id);
    if (i >= 0) state.ui.treeExpanded.splice(i, 1);
    else state.ui.treeExpanded.push(id);
    scheduleSave();
    emit({ type: "tree" });
  }

  function expandTree(id) {
    if (state.ui.treeExpanded.indexOf(id) < 0) {
      state.ui.treeExpanded.push(id);
      scheduleSave();
    }
  }

  function setTreeExpanded(ids) {
    state.ui.treeExpanded = (ids || []).filter(function (id) { return !!get(id); });
    scheduleSave();
    emit({ type: "tree" });
  }

  /* ---------- Экспорт / импорт / сброс ---------- */
  function exportJSON() {
    return JSON.stringify({
      version: SCHEMA_VERSION,
      exportedAt: nowIso(),
      objects: state.objects,
      view: state.view,
      ui: state.ui,
      sequence: state.sequence
    }, null, 2);
  }

  function importJSON(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("Файл не является корректным JSON");
    }
    var migrated = migrate(parsed);
    if (!migrated) throw new Error("В файле нет данных Orbital OKR (ожидается поле objects)");
    if (!Object.keys(migrated.objects).length) throw new Error("В файле нет ни одного объекта");
    state = migrated;
    progressCache = null;
    saveNow();
    emit({ type: "import" });
    return true;
  }

  function reset() {
    state = migrate(D.buildDemo());
    progressCache = null;
    saveNow();
    emit({ type: "reset" });
    return true;
  }

  /* ---------- Сотрудники (для отчётов и автодополнения) ---------- */
  function employees() {
    var map = {};
    all().forEach(function (o) {
      ["responsible", "executor"].forEach(function (role) {
        var p = o[role];
        if (!p || !p.fio || !p.fio.trim()) return;
        var key = normalizeText(p.fio);
        if (!map[key]) {
          map[key] = { fio: p.fio.trim(), roles: {}, count: 0, functions: [] };
        }
        map[key].roles[p.role || "—"] = true;
        map[key].count++;
        if (p["function"] && map[key].functions.indexOf(p["function"]) < 0) {
          map[key].functions.push(p["function"]);
        }
      });
    });
    return Object.keys(map).map(function (k) {
      var e = map[k];
      return {
        fio: e.fio,
        roles: Object.keys(e.roles),
        count: e.count,
        functions: e.functions
      };
    }).sort(function (a, b) { return a.fio.localeCompare(b.fio, "ru"); });
  }

  function findEmployee(fio) {
    var needle = normalizeText(fio);
    if (!needle) return null;
    var list = employees();
    for (var i = 0; i < list.length; i++) {
      if (normalizeText(list[i].fio) === needle) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      if (normalizeText(list[j].fio).indexOf(needle) === 0) return list[j];
    }
    for (var k = 0; k < list.length; k++) {
      if (normalizeText(list[k].fio).indexOf(needle) >= 0) return list[k];
    }
    return null;
  }

  /* ---------- Инициализация ---------- */
  load();

  window.Store = {
    subscribe: subscribe,
    get: get,
    all: all,
    rootGroup: rootGroup,
    rootObjects: rootObjects,
    childrenOf: childrenOf,
    siblingsOf: siblingsOf,
    descendantIds: descendantIds,
    pathOf: pathOf,
    pathLabel: pathLabel,
    computeProgress: computeProgress,
    isCalculated: isCalculated,
    progressColor: progressColor,
    stats: stats,
    addChild: addChild,
    addTop: addTop,
    update: update,
    rename: rename,
    allowedParents: allowedParents,
    setParent: setParent,
    remove: remove,
    addLink: addLink,
    removeLink: removeLink,
    setView: setView,
    setSelection: setSelection,
    setSpeed: setSpeed,
    setPaused: setPaused,
    setCamera: setCamera,
    toggleTreeExpanded: toggleTreeExpanded,
    expandTree: expandTree,
    setTreeExpanded: setTreeExpanded,
    exportJSON: exportJSON,
    importJSON: importJSON,
    reset: reset,
    saveNow: saveNow,
    storageAvailable: function () { return storageOk; },
    employees: employees,
    findEmployee: findEmployee,
    normalizeText: normalizeText,
    personMatcher: personMatcher,
    emptyPerson: emptyPerson,
    getState: function () {
      return {
        view: state.view,
        ui: state.ui,
        camera: state.camera,
        objects: state.objects,
        sequence: state.sequence
      };
    },
    view: function () { return state.view; },
    selectedId: function () { return state.ui.selectedId; },
    speed: function () { return state.ui.speed; },
    paused: function () { return state.ui.paused; },
    expanded: function () { return state.ui.treeExpanded.slice(); }
  };
})();
