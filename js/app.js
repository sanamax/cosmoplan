/* ============================================================
   app.js — точка входа: связывает сцену, карточку, дерево, поиск
   ============================================================ */
(function () {
  "use strict";

  var S = window.Store;
  var UI = window.CosmoUI;
  var Scene = window.CosmoScene;
  var Search = window.CosmoSearch;

  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    var bootEl = document.getElementById("boot");

    if (typeof THREE === "undefined") {
      showFatal("Не удалось загрузить библиотеку Three.js из папки libs/.");
      return;
    }
    if (!S || !UI || !Scene || !Search) {
      showFatal("Не удалось загрузить модули приложения.");
      return;
    }

    try {
      Scene.init();
    } catch (err) {
      console.error(err);
      showFatal("Не удалось инициализировать 3D-сцену. Проверьте поддержку WebGL в браузере.");
      return;
    }

    UI.init();
    Search.init();

    /* связь сцены и store */
    S.subscribe(function (ev) {
      if (ev.type === "change") {
        var fields = ev.fields || [];
        if (ev.removed || ev.created || ev.moved || ev.linkAdded || ev.linkRemoved) {
          Scene.scheduleRebuild();
          UI.afterRebuild();
        } else if (fields.some(isVisualField)) {
          Scene.scheduleRebuild();
          UI.afterRebuild();
        } else if (fields.indexOf("progress") >= 0 || fields.indexOf("progressMode") >= 0 ||
                   fields.indexOf("status") >= 0) {
          Scene.refreshProgress();
        }
        Scene.selectRing(S.selectedId());
      } else if (ev.type === "select") {
        Scene.selectRing(ev.id);
        if (ev.id) UI.openCard(ev.id);
        else UI.closeCard();
      } else if (ev.type === "reset" || ev.type === "import") {
        Scene.rebuild();
        Scene.centerAll();
        UI.afterChange();
      } else if (ev.type === "view") {
        Scene.rebuild();
        UI.afterChange();
      }
    });

    /* режим «Связать»: клик по второму объекту */
    window.__cosmoPickCancelHook = function () {
      UI.cancelLinkMode();
    };
    window.__cosmoPickHook = function (id) {
      if (!UI.linkModeActive()) return false;
      return UI.handleLinkPick(id);
    };

    /* первичная центровка после построения сцены */
    setTimeout(function () {
      Scene.centerAll();
      UI.afterChange();
    }, 260);

    /* пустая сцена при отсутствии объектов */
    var state = S.getState();
    if (!Object.keys(state.objects).length) {
      console.warn("Нет данных — используйте «Сбросить БД».");
    }

    if (bootEl) {
      setTimeout(function () {
        bootEl.classList.add("done");
        setTimeout(function () {
          bootEl.classList.add("hidden");
        }, 600);
      }, 420);
    }

    /* сохраняем камеру перед закрытием */
    window.addEventListener("beforeunload", function () {
      try { S.saveNow(); } catch (e) { /* игнорируем */ }
    });

    /* пересобираем сцену при возврате на вкладку — контекст WebGL мог быть потерян */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) Scene.scheduleRebuild();
    });

    console.log("%cOrbital OKR", "color:#8b9cff;font-weight:700", "готово · объектов:", Object.keys(S.getState().objects).length);
  }

  function isVisualField(field) {
    return ["color", "texture", "size", "orbitRadius"].indexOf(field) >= 0;
  }

  function showFatal(message) {
    var bootEl = document.getElementById("boot");
    if (bootEl) {
      bootEl.innerHTML = '<div class="boot-inner"><div class="boot-title">Orbital OKR</div>' +
        '<div class="boot-sub" style="max-width:420px;line-height:1.6;margin-top:12px;color:#ffb4b4">' +
        message.replace(/</g, "&lt;") + "</div></div>";
    }
    console.error(message);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
