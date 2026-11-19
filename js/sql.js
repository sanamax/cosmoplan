/* ============================================================
   sql.js — экспорт всей модели в SQL (CREATE TABLE + INSERT)
   ============================================================ */
(function () {
  "use strict";

  function q(str) {
    if (str === null || str === undefined) return "NULL";
    return "'" + String(str).replace(/'/g, "''") + "'";
  }

  function n(v) {
    var num = Number(v);
    return isFinite(num) ? String(num) : "0";
  }

  function dt(value) {
    if (!value) return "NULL";
    var s = String(value);
    /* ISO-строка преобразуется в формат, понятный большинству СУБД */
    s = s.replace("T", " ").replace("Z", "").slice(0, 19);
    return q(s);
  }

  function exportSQL(data) {
    var objects = data.objects || {};
    var sequence = data.sequence || {};
    var ids = Object.keys(objects);
    var lines = [];

    lines.push("-- Orbital OKR — SQL-дамп данных");
    lines.push("-- Сформирован: " + new Date().toISOString());
    lines.push("-- Объектов: " + ids.length + " (Группа компаний → Компании → Цели → Проекты → Задачи → Подзадачи)");
    lines.push("-- Поддерживается SQLite / PostgreSQL (для PostgreSQL замените TEXT на TEXT без изменений).");
    lines.push("");
    lines.push("BEGIN;");
    lines.push("");

    /* ---------- DDL ---------- */
    lines.push("DROP TABLE IF EXISTS object_automation_links;");
    lines.push("DROP TABLE IF EXISTS object_links;");
    lines.push("DROP TABLE IF EXISTS object_people;");
    lines.push("DROP TABLE IF EXISTS objects;");
    lines.push("DROP TABLE IF EXISTS object_sequence;");
    lines.push("");

    lines.push("CREATE TABLE objects (");
    lines.push("  id                TEXT PRIMARY KEY,");
    lines.push("  type              TEXT NOT NULL CHECK (type IN ('group','company','goal','project','task','subtask')),");
    lines.push("  parent_id         TEXT REFERENCES objects(id) ON DELETE CASCADE,");
    lines.push("  name              TEXT NOT NULL,");
    lines.push("  description       TEXT,");
    lines.push("  status            TEXT NOT NULL CHECK (status IN ('новая','в работе','выполнено','риск','на паузе')),");
    lines.push("  progress_mode     TEXT NOT NULL CHECK (progress_mode IN ('manual','recurring')),");
    lines.push("  progress          REAL NOT NULL DEFAULT 0,");
    lines.push("  kind              TEXT NOT NULL,");
    lines.push("  color             TEXT NOT NULL,");
    lines.push("  texture           TEXT NOT NULL,");
    lines.push("  size              REAL NOT NULL DEFAULT 1,");
    lines.push("  orbit_radius      REAL NOT NULL DEFAULT 0,");
    lines.push("  due_date          TEXT,");
    lines.push("  created_at        TEXT NOT NULL,");
    lines.push("  updated_at        TEXT NOT NULL");
    lines.push(");");
    lines.push("");

    lines.push("CREATE TABLE object_people (");
    lines.push("  id          INTEGER PRIMARY KEY,");
    lines.push("  object_id   TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,");
    lines.push("  person_role TEXT NOT NULL CHECK (person_role IN ('responsible','executor')),");
    lines.push("  fio         TEXT NOT NULL,");
    lines.push("  role        TEXT,");
    lines.push("  function    TEXT");
    lines.push(");");
    lines.push("");

    lines.push("CREATE TABLE object_links (");
    lines.push("  id      INTEGER PRIMARY KEY,");
    lines.push("  from_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,");
    lines.push("  to_id   TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,");
    lines.push("  flow    TEXT NOT NULL CHECK (flow IN ('in','out','both')),");
    lines.push("  UNIQUE (from_id, to_id)");
    lines.push(");");
    lines.push("");

    lines.push("CREATE TABLE object_automation_links (");
    lines.push("  id        INTEGER PRIMARY KEY,");
    lines.push("  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,");
    lines.push("  title     TEXT NOT NULL,");
    lines.push("  url       TEXT NOT NULL");
    lines.push(");");
    lines.push("");

    lines.push("CREATE TABLE object_sequence (");
    lines.push("  type       TEXT PRIMARY KEY,");
    lines.push("  last_value INTEGER NOT NULL");
    lines.push(");");
    lines.push("");

    lines.push("CREATE INDEX idx_objects_parent ON objects(parent_id);");
    lines.push("CREATE INDEX idx_objects_type ON objects(type);");
    lines.push("CREATE INDEX idx_people_fio ON object_people(fio);");
    lines.push("");

    /* ---------- Объекты ---------- */
    if (ids.length) {
      lines.push("INSERT INTO objects (id, type, parent_id, name, description, status, progress_mode, progress, kind, color, texture, size, orbit_radius, due_date, created_at, updated_at) VALUES");
      var objRows = ids.map(function (id) {
        var o = objects[id];
        return "  (" + [
          q(o.id), q(o.type), o.parentId ? q(o.parentId) : "NULL", q(o.name),
          q(o.description || ""), q(o.status), q(o.progressMode), n(o.progress),
          q(o.kind), q(o.color), q(o.texture), n(o.size), n(o.orbitRadius),
          o.dueDate ? q(o.dueDate) : "NULL", dt(o.createdAt), dt(o.updatedAt)
        ].join(", ") + ")";
      });
      lines.push(objRows.join(",\n") + ";");
      lines.push("");
    }

    /* ---------- Ответственные и исполнители ---------- */
    var peopleRows = [];
    var personId = 0;
    ids.forEach(function (id) {
      var o = objects[id];
      ["responsible", "executor"].forEach(function (roleKind) {
        var p = o[roleKind];
        if (!p) return;
        if (!p.fio && !p.role && !p.function) return;
        personId++;
        peopleRows.push("  (" + [personId, q(o.id), q(roleKind), q(p.fio || ""), q(p.role || ""), q(p.function || "")].join(", ") + ")");
      });
    });
    if (peopleRows.length) {
      lines.push("INSERT INTO object_people (id, object_id, person_role, fio, role, function) VALUES");
      lines.push(peopleRows.join(",\n") + ";");
      lines.push("");
    }

    /* ---------- Связи ---------- */
    var linkRows = [];
    var linkId = 0;
    var seen = {};
    ids.forEach(function (id) {
      var o = objects[id];
      (o.links || []).forEach(function (l) {
        if (!objects[l.id]) return;
        var key = [id, l.id].sort().join("|");
        if (seen[key]) return;
        seen[key] = true;
        linkId++;
        linkRows.push("  (" + [linkId, q(id), q(l.id), q(l.flow || "out")].join(", ") + ")");
      });
    });
    if (linkRows.length) {
      lines.push("INSERT INTO object_links (id, from_id, to_id, flow) VALUES");
      lines.push(linkRows.join(",\n") + ";");
      lines.push("");
    }

    /* ---------- Гиперссылки на автоматизацию ---------- */
    var autoRows = [];
    var autoId = 0;
    ids.forEach(function (id) {
      (objects[id].automationLinks || []).forEach(function (l) {
        autoId++;
        autoRows.push("  (" + [autoId, q(id), q(l.title || "Ссылка"), q(l.url || "")].join(", ") + ")");
      });
    });
    if (autoRows.length) {
      lines.push("INSERT INTO object_automation_links (id, object_id, title, url) VALUES");
      lines.push(autoRows.join(",\n") + ";");
      lines.push("");
    }

    /* ---------- Счётчики ID ---------- */
    var seqRows = Object.keys(sequence).map(function (t) {
      return "  (" + q(t) + ", " + n(sequence[t]) + ")";
    });
    if (seqRows.length) {
      lines.push("INSERT INTO object_sequence (type, last_value) VALUES");
      lines.push(seqRows.join(",\n") + ";");
      lines.push("");
    }

    lines.push("COMMIT;");
    lines.push("");
    lines.push("-- Прогресс рассчитывается по цепочке Подзадача → Задача → Проект → Цель → Компания → Группа компаний.");
    lines.push("-- Повторяющиеся объекты (progress_mode = 'recurring') исключаются из усреднения.");
    lines.push("-- Пример запроса по обязанностям сотрудника:");
    lines.push("--   SELECT p.fio, p.person_role, o.type, o.name, o.status, o.due_date");
    lines.push("--   FROM object_people p JOIN objects o ON o.id = p.object_id");
    lines.push("--   WHERE lower(replace(p.fio,'ё','е')) LIKE '%соколов%';");

    return lines.join("\n");
  }

  window.CosmoSQL = { exportSQL: exportSQL };
})();
