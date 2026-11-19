/* ============================================================
   data.js — схема, справочники и демонстрационный набор данных
   ============================================================ */
(function () {
  "use strict";

  var SCHEMA_VERSION = 3;

  /* ---------- Типы объектов иерархии ---------- */
  var TYPES = {
    group: {
      key: "group", label: "Группа компаний", short: "Группа", addLabel: "+ Компания",
      icon: "✦", childType: "company", order: 0, defaultSize: 7, defaultColor: "#b78cff"
    },
    company: {
      key: "company", label: "Компания", short: "Компания", addLabel: "+ Цель",
      icon: "🌌", childType: "goal", order: 1, defaultSize: 4.6, defaultColor: "#63a8ff"
    },
    goal: {
      key: "goal", label: "Цель", short: "Цель", addLabel: "+ Проект",
      icon: "☀", childType: "project", order: 2, defaultSize: 2.6, defaultColor: "#ffb347"
    },
    project: {
      key: "project", label: "Проект", short: "Проект", addLabel: "+ Задача",
      icon: "🪐", childType: "task", order: 3, defaultSize: 1.05, defaultColor: "#5ec8ff"
    },
    task: {
      key: "task", label: "Задача", short: "Задача", addLabel: "+ Подзадача",
      icon: "◗", childType: "subtask", order: 4, defaultSize: 0.55, defaultColor: "#8ce8b0"
    },
    subtask: {
      key: "subtask", label: "Подзадача", short: "Подзадача", addLabel: "",
      icon: "◦", childType: null, order: 5, defaultSize: 0.3, defaultColor: "#b0b8d8"
    }
  };

  var TYPE_ORDER = ["group", "company", "goal", "project", "task", "subtask"];

  /* ---------- Тип свойства (kind) ---------- */
  var KINDS = [
    { value: "задача", icon: "◗" },
    { value: "подзадача", icon: "◦" },
    { value: "делегировано", icon: "⇢" },
    { value: "автоматизировано", icon: "⚙" },
    { value: "связан", icon: "⇄" },
    { value: "проблема", icon: "⚠" },
    { value: "отчёт", icon: "▤" }
  ];

  /* ---------- Статусы ---------- */
  var STATUSES = [
    { value: "новая", color: "#8b97bd" },
    { value: "в работе", color: "#42d6ff" },
    { value: "выполнено", color: "#4ade80" },
    { value: "риск", color: "#ff6b6b" },
    { value: "на паузе", color: "#fbbf24" }
  ];

  function statusColor(status) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i].value === status) return STATUSES[i].color;
    }
    return STATUSES[0].color;
  }

  /* ---------- 16 фактур ---------- */
  var TEXTURES = [
    { id: "earth", name: "Земля", hint: "океаны и континенты" },
    { id: "mars", name: "Марс", hint: "рыжие пустыни" },
    { id: "jupiter", name: "Юпитер", hint: "полосы" },
    { id: "saturn", name: "Сатурн", hint: "кольцо" },
    { id: "venus", name: "Венера", hint: "облака" },
    { id: "mercury", name: "Меркурий", hint: "кратеры" },
    { id: "moon", name: "Луна", hint: "реголит" },
    { id: "neptune", name: "Нептун", hint: "глубокий синий" },
    { id: "uranus", name: "Уран", hint: "бирюзовый" },
    { id: "lava", name: "Лавовая", hint: "трещины магмы" },
    { id: "ice", name: "Ледяная", hint: "ледниковый панцирь" },
    { id: "gas", name: "Газовый гигант", hint: "вихри" },
    { id: "desert", name: "Пустынная", hint: "дюны" },
    { id: "ocean", name: "Океаническая", hint: "вода" },
    { id: "crystal", name: "Кристаллическая", hint: "грани" },
    { id: "tech", name: "Техно", hint: "сай-фай" }
  ];

  var TEXTURE_IDS = TEXTURES.map(function (t) { return t.id; });

  /* ---------- Палитра для пресетов цвета ---------- */
  var COLORS = [
    "#7c8cff", "#48e0ff", "#4ade80", "#ff5c8a",
    "#ffb347", "#b06bff", "#42d6ff", "#ff6b6b",
    "#fbbf24", "#a3e635", "#f472b6", "#94a3b8"
  ];

  /* ---------- Справочник сотрудников для демо ---------- */
  var PEOPLE = {
    sokolov: { fio: "Соколов Артём Викторович", role: "Генеральный директор" },
    kuznetsova: { fio: "Кузнецова Мария Ильинична", role: "Операционный директор" },
    lebedev: { fio: "Лебедев Дмитрий Олегович", role: "Технический директор" },
    morozova: { fio: "Морозова Елена Андреевна", role: "Директор по продукту" },
    novikov: { fio: "Новиков Игорь Петрович", role: "Финансовый директор" },
    volkova: { fio: "Волкова Анна Сергеевна", role: "Руководитель направления данных" },
    grigoriev: { fio: "Григорьев Павел Михайлович", role: "Лидер продукта" },
    smirnova: { fio: "Смирнова Ольга Дмитриевна", role: "Директор по маркетингу" },
    fedorov: { fio: "Фёдоров Никита Алексеевич", role: "Ведущий инженер" },
    kovalev: { fio: "Ковалёв Роман Игоревич", role: "Директор по продажам" },
    orlov: { fio: "Орлов Максим Юрьевич", role: "Архитектор решений" },
    zaytseva: { fio: "Зайцева Полина Романовна", role: "Аналитик данных" },
    tikhonov: { fio: "Тихонов Сергей Вадимович", role: "Руководитель поддержки" },
    belova: { fio: "Белова Ирина Николаевна", role: "HR-партнёр" },
    ershov: { fio: "Ершов Виктор Львович", role: "Руководитель логистики" },
    romanova: { fio: "Романова Дарья Кирилловна", role: "Продуктовый дизайнер" }
  };

  function person(key, func) {
    var p = PEOPLE[key] || PEOPLE.sokolov;
    return { fio: p.fio, role: p.role, function: func };
  }

  /* ============================================================
     Демонстрационный набор
     ============================================================ */
  function buildDemo() {
    var seq = { group: 0, company: 0, goal: 0, project: 0, task: 0, subtask: 0 };
    var PREFIX = { group: "GRP", company: "CMP", goal: "GOAL", project: "PRJ", task: "TSK", subtask: "SUB" };
    var objects = {};
    var now = "2026-11-19T09:00:00.000Z";

    function pad(n) { return ("000000" + n).slice(-6); }

    function make(type, parentId, name, opts) {
      opts = opts || {};
      seq[type] += 1;
      var id = PREFIX[type] + "-" + pad(seq[type]);
      var info = TYPES[type];
      var obj = {
        id: id,
        type: type,
        parentId: parentId || null,
        name: name,
        description: opts.description || "",
        status: opts.status || "новая",
        progressMode: opts.progressMode || "manual",
        progress: typeof opts.progress === "number" ? opts.progress : 0,
        kind: opts.kind || (type === "task" ? "задача" : type === "subtask" ? "подзадача" : type === "project" ? "автоматизировано" : "связан"),
        color: opts.color || info.defaultColor,
        texture: opts.texture || "earth",
        size: typeof opts.size === "number" ? opts.size : info.defaultSize,
        orbitRadius: typeof opts.orbitRadius === "number" ? opts.orbitRadius : 0,
        responsible: opts.responsible || person("sokolov", "Отвечает за результат верхнего уровня"),
        executor: opts.executor || person("kuznetsova", "Ведёт операционную реализацию"),
        dueDate: opts.dueDate || "",
        automationLinks: opts.automationLinks || [],
        links: opts.links || [],
        createdAt: now,
        updatedAt: now
      };
      objects[id] = obj;
      return obj;
    }

    /* --- Группа компаний --- */
    var group = make("group", null, "Галактика Холдинг", {
      status: "в работе",
      kind: "связан",
      color: "#b78cff",
      size: 8,
      description: "Группа компаний «Галактика Холдинг» объединяет цифровое направление и продуктовый ритейл. Цель группы — устойчивый кратный рост выручки при прозрачном управлении исполнением.",
      responsible: person("sokolov", "Утверждает стратегию группы и распределяет капитал"),
      executor: person("kuznetsova", "Координирует исполнение целей компаний"),
      automationLinks: [{ title: "Дашборд группы", url: "https://example.com/dashboards/holding" }]
    });

    /* --- Компании --- */
    var nw = make("company", group.id, "Northwind Digital", {
      status: "в работе",
      kind: "связан",
      color: "#5b9cf8",
      size: 4.8,
      texture: "ocean",
      description: "Цифровая компания: облачная аналитика, AI-сервисы и платформенные решения для корпоративного рынка.",
      responsible: person("lebedev", "Отвечает за технологическое лидерство и выручку компании"),
      executor: person("grigoriev", "Ведёт портфель продуктов и релизный план"),
      automationLinks: [
        { title: "BI-дашборд компании", url: "https://example.com/dashboards/northwind" },
        { title: "Jira-проект", url: "https://example.com/jira/northwind" }
      ]
    });

    var vr = make("company", group.id, "Вектор Ритейл", {
      status: "риск",
      kind: "проблема",
      color: "#ff8a5b",
      size: 4.4,
      texture: "mars",
      description: "Розничная сеть и онлайн-магазин: 240 точек, собственная логистика, программа лояльности.",
      responsible: person("novikov", "Отвечает за экономику сети и маржинальность"),
      executor: person("ershov", "Обеспечивает операционную логистику и поставки"),
      automationLinks: [{ title: "Отчёт по сети", url: "https://example.com/reports/retail-network" }]
    });

    group.links = [
      { id: nw.id, flow: "both" },
      { id: vr.id, flow: "out" }
    ];

    /* --- Цели --- */
    var g1 = make("goal", nw.id, "Выйти в лидеры облачной аналитики", {
      status: "в работе",
      kind: "связан",
      color: "#ffb347",
      size: 2.9,
      description: "Занять не менее 12% рынка облачной аналитики в сегменте mid-market: продукт, партнёрская сеть и отраслевые кейсы.",
      responsible: person("morozova", "Отвечает за продуктовое лидерство и долю рынка"),
      executor: person("volkova", "Ведёт аналитическое направление и метрики"),
      dueDate: "2027-06-30",
      automationLinks: [{ title: "Метрики доли рынка", url: "https://example.com/metrics/market-share" }]
    });

    var g2 = make("goal", nw.id, "Удвоить выручку от AI-сервисов", {
      status: "риск",
      kind: "проблема",
      color: "#ff6b9d",
      size: 2.5,
      texture: "jupiter",
      description: "Довести выручку от AI-направления до 1,8 млрд ₽ за счёт тиражирования моделей на существующую базу клиентов.",
      responsible: person("lebedev", "Отвечает за выручку AI-направления"),
      executor: person("fedorov", "Строит и выводит в прод модели"),
      dueDate: "2027-03-31",
      automationLinks: [{ title: "Воронка AI-продаж", url: "https://example.com/crm/ai-pipeline" }]
    });

    var g3 = make("goal", vr.id, "Сократить издержки сети на 15%", {
      status: "в работе",
      kind: "автоматизировано",
      color: "#ff8a5b",
      size: 2.7,
      texture: "desert",
      description: "Оптимизировать закупки, логистику и энергопотребление точек, чтобы вернуть маржинальность сети к целевой.",
      responsible: person("novikov", "Отвечает за экономику и издержки сети"),
      executor: person("ershov", "Внедряет логистические и закупочные изменения"),
      dueDate: "2027-01-31",
      automationLinks: [{ title: "P&L сети", url: "https://example.com/finance/pnl" }]
    });

    var g4 = make("goal", vr.id, "Запустить программу лояльности нового поколения", {
      status: "новая",
      kind: "задача",
      color: "#4ade80",
      size: 2.4,
      texture: "venus",
      description: "Единая программа лояльности онлайн и офлайн с персонализированными предложениями и оплатой бонусами.",
      responsible: person("smirnova", "Отвечает за программу и удержание клиентов"),
      executor: person("romanova", "Проектирует клиентские сценарии"),
      dueDate: "2027-09-30"
    });

    /* --- Проекты --- */
    var projects = [];

    function proj(goal, name, o) {
      var p = make("project", goal.id, name, o);
      projects.push(p);
      return p;
    }

    var p1 = proj(g1, "Платформа аналитики 6.0", {
      status: "в работе", kind: "автоматизировано", color: "#5ec8ff", size: 1.15, texture: "earth",
      description: "Новая версия платформы: конструктор отчётов, прогнозные модели, маркетплейс коннекторов.",
      responsible: person("morozova", "Отвечает за продуктовый результат релиза"),
      executor: person("fedorov", "Технический лид релиза"),
      dueDate: "2027-04-30",
      automationLinks: [{ title: "Roadmap", url: "https://example.com/roadmap/platform-6" }]
    });

    var p2 = proj(g1, "Партнёрская сеть интеграторов", {
      status: "в работе", kind: "делегировано", color: "#6ee7b7", size: 1.0, texture: "saturn",
      description: "Подписать 40 партнёров-интеграторов и обеспечить 30% выручки через партнёрский канал.",
      responsible: person("kovalev", "Отвечает за партнёрскую выручку"),
      executor: person("zaytseva", "Готовит аналитику по партнёрам"),
      dueDate: "2027-05-31"
    });

    var p3 = proj(g1, "Отраслевые кейсы и референсы", {
      status: "новая", kind: "отчёт", color: "#fbbf24", size: 0.95, texture: "gas",
      description: "Опубликовать 12 отраслевых кейсов с измеримым эффектом для клиентов.",
      responsible: person("smirnova", "Отвечает за контент и узнаваемость"),
      executor: person("romanova", "Оформляет кейсы и презентации"),
      dueDate: "2027-02-28"
    });

    var p4 = proj(g1, "Сертификация и безопасность", {
      status: "на паузе", kind: "задача", color: "#c084fc", size: 0.9, texture: "crystal",
      description: "Пройти ISO 27001 и подготовить платформу к требованиям крупных корпоративных клиентов.",
      responsible: person("lebedev", "Отвечает за комплаенс платформы"),
      executor: person("orlov", "Ведёт техническую подготовку к аудиту"),
      dueDate: "2027-08-31"
    });

    var p5 = proj(g2, "Тиражирование ML-моделей", {
      status: "риск", kind: "проблема", color: "#ff8fa3", size: 1.2, texture: "lava",
      description: "Перевести 8 пилотных моделей в промышленную эксплуатацию с SLA 99,9%.",
      responsible: person("fedorov", "Отвечает за промышленные модели"),
      executor: person("orlov", "Проектирует архитектуру сервинга"),
      dueDate: "2027-02-15",
      automationLinks: [{ title: "ML-мониторинг", url: "https://example.com/ml/monitoring" }]
    });

    var p6 = proj(g2, "AI-ассистент для клиентской поддержки", {
      status: "в работе", kind: "автоматизировано", color: "#48e0ff", size: 1.0, texture: "tech",
      description: "Снизить время ответа поддержки на 40% за счёт ассистента на базе LLM.",
      responsible: person("tikhonov", "Отвечает за метрики поддержки"),
      executor: person("zaytseva", "Готовит данные и качество ответов"),
      dueDate: "2027-03-10"
    });

    var p7 = proj(g2, "Пакетирование AI-сервисов", {
      status: "в работе", kind: "задача", color: "#a3e635", size: 0.95, texture: "neptune",
      description: "Собрать тарифные пакеты с AI-функциями и вывести их в продажу.",
      responsible: person("grigoriev", "Отвечает за упаковку и цены"),
      executor: person("kovalev", "Выводит пакеты в канал продаж"),
      dueDate: "2026-12-20"
    });

    var p8 = proj(g3, "Оптимизация логистики", {
      status: "в работе", kind: "автоматизировано", color: "#ffb066", size: 1.1, texture: "mars",
      description: "Сократить пробег и время доставки за счёт пересборки маршрутов и складов.",
      responsible: person("ershov", "Отвечает за логистические издержки"),
      executor: person("tikhonov", "Контролирует операционные показатели"),
      dueDate: "2026-12-31",
      automationLinks: [{ title: "Логистический дашборд", url: "https://example.com/logistics/dashboard" }]
    });

    var p9 = proj(g3, "Закупки и контрактация", {
      status: "риск", kind: "проблема", color: "#ff6b6b", size: 1.0, texture: "mercury",
      description: "Перезаключить контракты с топ-30 поставщиками на более выгодных условиях.",
      responsible: person("novikov", "Отвечает за закупочную экономику"),
      executor: person("ershov", "Ведёт переговоры с поставщиками"),
      dueDate: "2026-12-10"
    });

    var p10 = proj(g3, "Энергоэффективность точек", {
      status: "на паузе", kind: "задача", color: "#fcd34d", size: 0.95, texture: "ice",
      description: "Снизить энергопотребление 240 точек на 12% через модернизацию оборудования.",
      responsible: person("ershov", "Отвечает за энергозатраты сети"),
      executor: person("orlov", "Оценивает технические решения"),
      dueDate: "2027-04-15"
    });

    var p11 = proj(g4, "Единый профиль клиента", {
      status: "новая", kind: "задача", color: "#4ade80", size: 1.05, texture: "earth",
      description: "Собрать данные онлайн и офлайн в единый профиль с согласиями по 152-ФЗ.",
      responsible: person("volkova", "Отвечает за качество данных клиента"),
      executor: person("zaytseva", "Строит модель профиля"),
      dueDate: "2027-05-20"
    });

    var p12 = proj(g4, "Кэшбэк и бонусная витрина", {
      status: "в работе", kind: "автоматизировано", color: "#7ce0c0", size: 0.9, texture: "ocean",
      description: "Запустить витрину бонусов и оплату бонусами на кассе и в приложении.",
      responsible: person("smirnova", "Отвечает за вовлечение в программу"),
      executor: person("romanova", "Проектирует витрину и оплату"),
      dueDate: "2027-02-28"
    });

    var p13 = proj(g4, "Персонализация предложений", {
      status: "в работе", kind: "связан", color: "#b06bff", size: 0.9, texture: "uranus",
      description: "Персональные купоны и рекомендации на основе истории покупок.",
      responsible: person("grigoriev", "Отвечает за персонализацию"),
      executor: person("fedorov", "Выводит рекомендательные модели"),
      dueDate: "2027-06-15"
    });

    /* --- Задачи и подзадачи --- */
    function task(project, name, o, subs) {
      var t = make("task", project.id, name, o);
      if (subs && subs.length) {
        subs.forEach(function (s, i) {
          make("subtask", t.id, s.name, {
            status: s.status || "в работе",
            progress: typeof s.progress === "number" ? s.progress : 0,
            kind: "подзадача",
            color: s.color || "#9fb0d8",
            size: 0.28,
            description: s.description || "",
            responsible: s.responsible || t.responsible,
            executor: s.executor || t.executor,
            dueDate: s.dueDate || t.dueDate,
            progressMode: "manual",
            texture: TEXTURE_IDS[(i + 3) % 16]
          });
        });
      }
      return t;
    }

    task(p1, "Конструктор отчётов с drag&drop", {
      status: "в работе", kind: "задача", color: "#5ec8ff",
      responsible: person("morozova", "Формулирует требования к конструктору"),
      executor: person("fedorov", "Разрабатывает конструктор"),
      dueDate: "2026-12-19"
    }, [
      { name: "Каркас сетки и панель виджетов", status: "выполнено", progress: 100 },
      { name: "Библиотека 12 виджетов", status: "в работе", progress: 65 },
      { name: "Сохранение шаблонов отчётов", status: "в работе", progress: 30 }
    ]);

    task(p1, "Прогнозные модели спроса", {
      status: "риск", kind: "проблема", color: "#ff8fa3",
      responsible: person("volkova", "Отвечает за качество прогноза"),
      executor: person("zaytseva", "Обучает модели прогноза"),
      dueDate: "2027-01-30"
    }, [
      { name: "Сбор исторических данных", status: "выполнено", progress: 100 },
      { name: "Базовый прогноз (MAPE < 18%)", status: "в работе", progress: 45 },
      { name: "Валидация на пилотах", status: "на паузе", progress: 10 }
    ]);

    task(p1, "Маркетплейс коннекторов", {
      status: "новая", kind: "делегировано", color: "#c084fc",
      responsible: person("orlov", "Отвечает за архитектуру коннекторов"),
      executor: person("fedorov", "Реализует 1С-коннектор"),
      dueDate: "2027-03-15"
    }, [
      { name: "Спецификация API коннекторов", status: "в работе", progress: 55 },
      { name: "Коннектор 1С и Postgres", status: "новая", progress: 0 }
    ]);

    task(p1, "Обновление интерфейса дашбордов", {
      status: "выполнено", kind: "задача", color: "#6ee7b7",
      responsible: person("romanova", "Отвечает за UX обновления"),
      executor: person("romanova", "Готовит макеты и дизайн-систему"),
      dueDate: "2026-11-10"
    }, [
      { name: "Ресёрч 12 клиентов", status: "выполнено", progress: 100 },
      { name: "Дизайн-система v2", status: "выполнено", progress: 100 }
    ]);

    task(p2, "Подписание 40 партнёров", {
      status: "в работе", kind: "задача", color: "#6ee7b7",
      responsible: person("kovalev", "Отвечает за партнёрский канал"),
      executor: person("zaytseva", "Готовит коммерческие материалы"),
      dueDate: "2027-05-31"
    }, [
      { name: "Партнёрская программа и условия", status: "выполнено", progress: 100 },
      { name: "Подписано 18 из 40 партнёров", status: "в работе", progress: 45 },
      { name: "Обучение партнёров", status: "новая", progress: 0 }
    ]);

    task(p2, "Партнёрский портал", {
      status: "в работе", kind: "автоматизировано", color: "#48e0ff",
      responsible: person("fedorov", "Отвечает за партнёрский портал"),
      executor: person("orlov", "Разрабатывает интеграции портала"),
      dueDate: "2027-03-31"
    }, [
      { name: "Личный кабинет партнёра", status: "в работе", progress: 40 },
      { name: "Регистрация сделок", status: "новая", progress: 0 }
    ]);

    task(p3, "12 отраслевых кейсов", {
      status: "в работе", kind: "отчёт", color: "#fbbf24",
      responsible: person("smirnova", "Отвечает за публикации"),
      executor: person("romanova", "Верстает и оформляет кейсы"),
      dueDate: "2027-02-28"
    }, [
      { name: "Кейсы: ритейл и логистика", status: "выполнено", progress: 100 },
      { name: "Кейсы: финансы", status: "в работе", progress: 35 },
      { name: "Кейсы: производство", status: "новая", progress: 0 }
    ]);

    task(p3, "Вебинарная серия с клиентами", {
      status: "новая", kind: "задача", color: "#b06bff",
      responsible: person("smirnova", "Отвечает за мероприятия"),
      executor: person("kovalev", "Привлекает клиентов-спикеров"),
      dueDate: "2027-04-20"
    });

    task(p4, "Аудит по ISO 27001", {
      status: "на паузе", kind: "проблема", color: "#c084fc",
      responsible: person("lebedev", "Отвечает за сертификацию"),
      executor: person("orlov", "Готовит документы и процессы"),
      dueDate: "2027-08-31"
    }, [
      { name: "Оценка разрыва (gap analysis)", status: "выполнено", progress: 100 },
      { name: "Политики информационной безопасности", status: "на паузе", progress: 20 }
    ]);

    task(p4, "Пентест платформы", {
      status: "новая", kind: "делегировано", color: "#ff6b6b",
      responsible: person("orlov", "Отвечает за устранение уязвимостей"),
      executor: person("fedorov", "Исправляет найденные дефекты"),
      dueDate: "2027-07-15"
    }, [
      { name: "Скоуп и правила пентеста", status: "новая", progress: 0 },
      { name: "Устранение критичных находок", status: "новая", progress: 0 }
    ]);

    task(p5, "Промышленный сервинг моделей", {
      status: "риск", kind: "проблема", color: "#ff8fa3",
      responsible: person("fedorov", "Отвечает за SLA моделей"),
      executor: person("orlov", "Строит сервинг-платформу"),
      dueDate: "2027-02-15"
    }, [
      { name: "Автомасштабирование инференса", status: "в работе", progress: 60 },
      { name: "Мониторинг дрейфа моделей", status: "риск", progress: 25 },
      { name: "Нагрузочное тестирование", status: "новая", progress: 0 }
    ]);

    task(p5, "Миграция 8 пилотных моделей", {
      status: "в работе", kind: "задача", color: "#fbbf24",
      responsible: person("volkova", "Отвечает за миграцию"),
      executor: person("zaytseva", "Переносит пайплайны"),
      dueDate: "2027-01-20"
    }, [
      { name: "Мигрировано 5 из 8 моделей", status: "в работе", progress: 62 },
      { name: "Регрессионные тесты", status: "в работе", progress: 20 }
    ]);

    task(p6, "Ассистент первой линии", {
      status: "в работе", kind: "автоматизировано", color: "#48e0ff",
      responsible: person("tikhonov", "Отвечает за поддержку"),
      executor: person("fedorov", "Настраивает LLM-пайплайн"),
      dueDate: "2027-01-31"
    }, [
      { name: "База знаний и разметка", status: "в работе", progress: 70 },
      { name: "A/B-тест на 10% обращений", status: "новая", progress: 0 }
    ]);

    task(p6, "Контроль качества ответов", {
      status: "в работе", kind: "отчёт", color: "#6ee7b7",
      responsible: person("tikhonov", "Отвечает за качество"),
      executor: person("zaytseva", "Считает метрики качества"),
      dueDate: "2027-02-20"
    }, [
      { name: "Метрика точности > 85%", status: "в работе", progress: 50 }
    ]);

    task(p6, "Интеграция с телефонией", {
      status: "на паузе", kind: "задача", color: "#a3e635",
      responsible: person("orlov", "Отвечает за интеграцию"),
      executor: person("tikhonov", "Согласует процессы поддержки"),
      dueDate: "2027-04-10"
    });

    task(p7, "Тарифные планы с AI", {
      status: "в работе", kind: "задача", color: "#a3e635",
      responsible: person("grigoriev", "Отвечает за упаковку"),
      executor: person("kovalev", "Согласует условия с продажами"),
      dueDate: "2026-12-20"
    }, [
      { name: "Анализ конкурентных тарифов", status: "выполнено", progress: 100 },
      { name: "Финмодель пакетов", status: "в работе", progress: 40 }
    ]);

    task(p7, "Запуск акции «AI за неделю»", {
      status: "новая", kind: "задача", color: "#fbbf24",
      responsible: person("smirnova", "Отвечает за промо"),
      executor: person("romanova", "Готовит лендинг"),
      dueDate: "2027-01-15"
    });

    task(p8, "Пересборка маршрутов доставки", {
      status: "в работе", kind: "автоматизировано", color: "#ffb066",
      responsible: person("ershov", "Отвечает за маршрутизацию"),
      executor: person("tikhonov", "Контролирует внедрение"),
      dueDate: "2026-12-25"
    }, [
      { name: "Аудит текущих маршрутов", status: "выполнено", progress: 100 },
      { name: "Оптимизатор маршрутов", status: "в работе", progress: 55 },
      { name: "Пилот на 40 точках", status: "в работе", progress: 30 }
    ]);

    task(p8, "Консолидация складов", {
      status: "риск", kind: "проблема", color: "#ff8fa3",
      responsible: person("ershov", "Отвечает за складскую сеть"),
      executor: person("novikov", "Считает эффект на издержки"),
      dueDate: "2026-12-31"
    }, [
      { name: "Оценка 3 сценариев", status: "в работе", progress: 45 },
      { name: "Переезд склада «Юг»", status: "риск", progress: 15 }
    ]);

    task(p9, "Реестр топ-30 поставщиков", {
      status: "выполнено", kind: "отчёт", color: "#ff6b6b",
      responsible: person("novikov", "Отвечает за закупки"),
      executor: person("ershov", "Собирает данные по поставщикам"),
      dueDate: "2026-10-30"
    });

    task(p9, "Перезаключение контрактов", {
      status: "риск", kind: "проблема", color: "#ffb066",
      responsible: person("ershov", "Отвечает за контрактацию"),
      executor: person("novikov", "Утверждает условия"),
      dueDate: "2026-12-10"
    }, [
      { name: "Переговоры с 12 поставщиками", status: "в работе", progress: 50 },
      { name: "Юридическая проверка", status: "риск", progress: 20 },
      { name: "Подписание допсоглашений", status: "новая", progress: 0 }
    ]);

    task(p9, "Автоматизация закупочных заявок", {
      status: "на паузе", kind: "автоматизировано", color: "#48e0ff",
      responsible: person("orlov", "Отвечает за автоматизацию"),
      executor: person("ershov", "Описывает процессы закупок"),
      dueDate: "2027-03-20"
    });

    task(p10, "Аудит энергопотребления", {
      status: "в работе", kind: "отчёт", color: "#fcd34d",
      responsible: person("ershov", "Отвечает за энергоаудит"),
      executor: person("orlov", "Собирает данные по точкам"),
      dueDate: "2027-02-15"
    }, [
      { name: "Данные по 240 точкам", status: "в работе", progress: 65 },
      { name: "Тепловая карта потерь", status: "новая", progress: 0 }
    ]);

    task(p10, "Пилот модернизации 10 точек", {
      status: "новая", kind: "задача", color: "#a3e635",
      responsible: person("ershov", "Отвечает за пилот"),
      executor: person("orlov", "Ставит оборудование"),
      dueDate: "2027-04-15"
    });

    task(p11, "Модель единого профиля", {
      status: "в работе", kind: "задача", color: "#4ade80",
      responsible: person("volkova", "Отвечает за модель данных"),
      executor: person("zaytseva", "Проектирует схему профиля"),
      dueDate: "2027-03-31"
    }, [
      { name: "Схема и справочники", status: "в работе", progress: 45 },
      { name: "Дедупликация клиентов", status: "новая", progress: 0 }
    ]);

    task(p11, "Согласия и 152-ФЗ", {
      status: "новая", kind: "проблема", color: "#ff6b6b",
      responsible: person("belova", "Отвечает за комплаенс"),
      executor: person("orlov", "Реализует хранение согласий"),
      dueDate: "2027-04-30"
    });

    task(p12, "Витрина бонусов", {
      status: "в работе", kind: "задача", color: "#7ce0c0",
      responsible: person("romanova", "Отвечает за витрину"),
      executor: person("romanova", "Проектирует и собирает витрину"),
      dueDate: "2027-01-31"
    }, [
      { name: "Каталог из 400 товаров", status: "в работе", progress: 70 },
      { name: "Оплата бонусами на кассе", status: "в работе", progress: 35 },
      { name: "Оплата бонусами в приложении", status: "новая", progress: 0 }
    ]);

    task(p12, "Запуск кэшбэка по картам", {
      status: "выполнено", kind: "автоматизировано", color: "#4ade80",
      responsible: person("novikov", "Отвечает за экономику кэшбэка"),
      executor: person("ershov", "Внедряет начисление"),
      dueDate: "2026-11-01"
    });

    task(p13, "Рекомендации на истории покупок", {
      status: "в работе", kind: "связан", color: "#b06bff",
      responsible: person("grigoriev", "Отвечает за персонализацию"),
      executor: person("fedorov", "Обучает рекомендательные модели"),
      dueDate: "2027-05-31"
    }, [
      { name: "Данные и фичи покупок", status: "выполнено", progress: 100 },
      { name: "Модель коллаборативной фильтрации", status: "в работе", progress: 55 },
      { name: "Пилот в приложении", status: "новая", progress: 0 }
    ]);

    task(p13, "Персональные купоны", {
      status: "новая", kind: "задача", color: "#fbbf24",
      responsible: person("smirnova", "Отвечает за промо-механику"),
      executor: person("zaytseva", "Сегментирует клиентов"),
      dueDate: "2027-06-15"
    });

    task(p13, "Повторяющийся отчёт по акциям", {
      status: "в работе", kind: "отчёт", color: "#48e0ff",
      progressMode: "recurring",
      responsible: person("smirnova", "Формирует отчёт"),
      executor: person("zaytseva", "Собирает данные"),
      dueDate: "2027-01-10"
    });

    /* --- Связи между целями (поток энергии) --- */
    g1.links = [{ id: g2.id, flow: "out" }, { id: g4.id, flow: "in" }];
    g2.links = [{ id: g1.id, flow: "in" }, { id: g3.id, flow: "both" }];
    g3.links = [{ id: g2.id, flow: "both" }];
    g4.links = [{ id: g1.id, flow: "out" }];

    return {
      version: SCHEMA_VERSION,
      objects: objects,
      view: "group",
      ui: {
        selectedId: null,
        speed: 100,
        paused: false,
        treeExpanded: [group.id, nw.id, vr.id]
      },
      camera: null,
      sequence: seq
    };
  }

  window.CosmoData = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    TYPES: TYPES,
    TYPE_ORDER: TYPE_ORDER,
    KINDS: KINDS,
    STATUSES: STATUSES,
    statusColor: statusColor,
    TEXTURES: TEXTURES,
    TEXTURE_IDS: TEXTURE_IDS,
    COLORS: COLORS,
    PEOPLE: PEOPLE,
    buildDemo: buildDemo
  };
})();
