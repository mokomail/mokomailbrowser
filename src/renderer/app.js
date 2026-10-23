'use strict';

/** Точка входа интерфейса: запуск, горячие клавиши, обмен с main-процессом. */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  // ── Действия (в том числе из меню приложения) ──────────────────────────
  const actions = {
    'new-tab': () => BP.tabs.create({ activate: true }),
    'new-window': () => api.app.newWindow(),
    'new-incognito-window': () => api.app.newWindow({ incognito: true }),
    'close-tab': () => {
      if (state.tabs.length <= 1) api.window.close();
      else BP.tabs.close(state.activeTabId);
    },
    'reopen-tab': () => BP.tabs.reopenClosed(),
    'next-tab': () => BP.tabs.selectRelative(1),
    'prev-tab': () => BP.tabs.selectRelative(-1),
    'save-page': () => savePage(),
    print: () => printPage(),
    find: () => BP.ui.openFind(),
    reload: () => BP.tabs.act('reload'),
    'hard-reload': () => BP.tabs.act('hard-reload'),
    stop: () => BP.tabs.act('stop'),
    'zoom-in': () => BP.tabs.stepZoom(BP.tabs.getActive(), 1),
    'zoom-out': () => BP.tabs.stepZoom(BP.tabs.getActive(), -1),
    'zoom-reset': () => BP.tabs.resetZoom(BP.tabs.getActive()),
    'toggle-bookmarks-bar': () => toggleBookmarksBar(),
    'toggle-tab-groups': () => toggleTabGroups(),
    devtools: () => BP.tabs.openDevTools(),
    back: () => BP.tabs.act('back'),
    forward: () => BP.tabs.act('forward'),
    home: () => BP.tabs.goHome(),
    'focus-address': () => BP.ui.focusOmnibox(),
    'open-history': () => BP.panels.openHistory(),
    'open-downloads': () => BP.panels.openDownloads(),
    'toggle-bookmark': () => BP.ui.toggleBookmark(),
    'open-bookmarks': () => BP.panels.openBookmarks(),
    'open-settings': () => BP.panels.openSettings(),
    'open-extensions': () => BP.panels.openExtensions && BP.panels.openExtensions(),
    'open-about': () => BP.panels.openAbout(),
    'command-palette': () => BP.palette && BP.palette.open(),
    screenshot: () => BP.panels.captureScreenshot(),
    'toggle-pin-tab': () => BP.tabs.togglePinned(state.activeTabId),
    'duplicate-tab': () => {
      const tab = BP.tabs.getActive();
      if (tab) BP.tabs.create({ url: tab.isNewTab ? undefined : tab.url, activate: true });
    },
    'toggle-mute-tab': () => BP.tabs.toggleMute(state.activeTabId),
    'close-other-tabs': () => BP.tabs.closeOthers(state.activeTabId),
    'close-right-tabs': () => BP.tabs.closeToRight(state.activeTabId),
    'repeat-onboarding': () => BP.onboarding && BP.onboarding.start(),
    'open-profiles': () => BP.panels.openProfileManager(),
    'create-profile': () => BP.panels.createProfileFlow(),
    'tab-switcher': () => BP.panels.openTabSwitcher(),
    shortcuts: () => BP.panels.openShortcuts(),
    'clear-data': () => BP.panels.openClearData(),
    'switch-profile': (payload) => switchProfile(payload && payload.profileId),
  };

  function runAction(payload) {
    if (!payload) return;
    const action = typeof payload === 'string' ? payload : payload.action;
    if (!action) return;
    if (action.startsWith('tab-')) {
      const index = Number(action.slice(4));
      const tab = index === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[index - 1];
      if (tab) BP.tabs.select(tab.id);
      return;
    }
    const handler = actions[action];
    if (handler) handler(payload);
  }

  function savePage() {
    const tab = BP.tabs.getActive();
    if (!tab || !tab.webview) {
      BP.toast('Страница ещё не загружена');
      return;
    }
    try {
      tab.webview.downloadURL(tab.url);
      BP.toast('Сохранение страницы начато', 'ok');
    } catch {
      BP.toast('Не удалось сохранить страницу');
    }
  }

  function printPage() {
    const tab = BP.tabs.getActive();
    if (!tab || !tab.webview) return;
    try {
      tab.webview.print();
    } catch {
      /* ignore */
    }
  }

  async function toggleBookmarksBar() {
    const next = state.settings.showBookmarksBar === false;
    await BP.settings.set('showBookmarksBar', next);
    BP.ui.renderBookmarksBar();
  }

  function toggleTabGroups() {
    const groups = state.tabGroups || [];
    if (!groups.length) return;
    const anyExpanded = groups.some((group) => !group.collapsed);
    groups.forEach((group) => {
      group.collapsed = anyExpanded;
    });
    BP.tabs.renderStrip();
  }

  async function switchProfile(profileId) {
    if (!profileId) return;
    if (state.profile && profileId === state.profile.id) {
      BP.toast('Этот профиль уже открыт');
      return;
    }
    const ok = await BP.panels.confirmDialog({
      title: 'Сменить профиль?',
      message: 'Браузер перезапустится с выбранным профилем.',
      detail: 'У каждого профиля свои настройки, история, закладки и входы на сайтах.',
      confirmLabel: 'Перезапустить',
    });
    if (!ok) return;
    await api.profiles.switch(profileId);
  }

  // ── Кнопки окна ────────────────────────────────────────────────────────
  function wireWindowControls() {
    // Горизонтальные
    const wmin = document.getElementById('win-min');
    const wmax = document.getElementById('win-max');
    const wclose = document.getElementById('win-close');
    if (wmin) wmin.addEventListener('click', () => api.window.minimize());
    if (wmax) wmax.addEventListener('click', () => api.window.maximize());
    if (wclose) wclose.addEventListener('click', () => api.window.close());

    // двойной клик по свободной части полосы вкладок разворачивает окно
    document.getElementById('tabstrip').addEventListener('dblclick', (event) => {
      if (event.target.closest('.tab') || event.target.closest('.wbtn') || event.target.closest('.tab-new')) return;
      api.window.maximize();
    });

    api.window.isMaximized().then((maximized) => setMaxIcon(maximized));
  }

  function setMaxIcon(maximized) {
    const buttons = [document.getElementById('win-max')];
    buttons.forEach((button) => {
      if (!button) return;
      button.dataset.icon = maximized ? 'restore' : 'max';
      button.title = maximized ? 'Восстановить' : 'Развернуть';
      button.innerHTML = BP.icons.svg(button.dataset.icon, 15);
    });
  }

  // ── Горячие клавиши, не занятые меню приложения ────────────────────────
  function wireShortcuts() {
    document.addEventListener('keydown', (event) => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;

      if (event.key === 'Tab') {
        event.preventDefault();
        BP.tabs.selectRelative(event.shiftKey ? -1 : 1);
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key);
        const tab = index === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[index - 1];
        if (tab) {
          event.preventDefault();
          BP.tabs.select(tab.id);
        }
      }
    });
  }

  // ── Обмен с main-процессом ─────────────────────────────────────────────
  let lastDownloadCount = 0;

  function wireIpc() {
    api.on('menu:action', (payload) => runAction(payload));

    // Сохраняем сессию в момент закрытия окна, не дожидаясь debounce.
    window.addEventListener('beforeunload', () => {
      if (BP.tabs && BP.tabs.saveStateNow) BP.tabs.saveStateNow();
    });

    api.on('window:state', (payload) => setMaxIcon(!!(payload && payload.maximized)));

    api.on('browser:open-url', (payload) => {
      if (!payload || !payload.url) return;
      const background = !!payload.background || state.settings.openNewTabsInBackground === true;
      BP.tabs.create({ url: payload.url, background });
    });

    api.on('browser:context-action', (payload) => {
      if (!payload) return;
      if (payload.action === 'open-link' && payload.url) {
        BP.tabs.create({ url: payload.url, background: !!payload.background });
      } else if (payload.action === 'search' && payload.text) {
        const url = util.toNavigationUrl(payload.text);
        BP.tabs.create({ url, background: true });
      }
    });

    api.on('settings:changed', (settings) => {
      if (!settings) return;
      state.settings = settings;
      BP.theme.apply();
      BP.ui.renderBookmarksBar();
      BP.ui.renderQuickLinks();
      BP.ui.renderTopSites();
      BP.tabs.renderStrip();
      BP.tabs.syncActive();
    });

    api.on('downloads:update', (list) => {
      const records = Array.isArray(list) ? list : [];
      BP.panels.updateDownloadsPanel(records);
      if (records.length > lastDownloadCount) {
        const newest = records[0];
        BP.toast(`Загрузка: ${newest ? newest.filename : 'файл'}`, 'ok');
        if (state.settings.openDownloadsPanel) BP.panels.openDownloads();
      }
      lastDownloadCount = records.length;
    });
  }

  // ── Стартовые вкладки ──────────────────────────────────────────────────
  async function openStartupTabs() {
    const behavior = state.settings.startupBehavior;

    if (behavior === 'restore' && !state.incognito) {
      const saved = await api.session.getRestoreState();
      if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
        state.tabGroups = Array.isArray(saved.groups) ? saved.groups.map((group) => ({ ...group })) : [];
        saved.tabs.forEach((entry) => {
          const url = typeof entry === 'string' ? entry : (entry && entry.url) || '';
          const rawGroup = typeof entry === 'object' && entry ? entry.groupId : null;
          const groupId = rawGroup && BP.tabs.groupOf(rawGroup) ? rawGroup : null;
          const pinned = typeof entry === 'object' && entry ? !!entry.pinned : false;
          BP.tabs.create({ url: url || undefined, activate: false, background: true, groupId, pinned });
        });
        const index = Math.min(Number(saved.activeIndex) || 0, state.tabs.length - 1);
        if (state.tabs[index]) BP.tabs.select(state.tabs[index].id);
        return;
      }
    }

    if (behavior === 'homepage' && state.settings.homepage && !state.incognito) {
      BP.tabs.create({ url: state.settings.homepage });
      return;
    }

    BP.tabs.create({ activate: true });
  }

  // ── Запуск ─────────────────────────────────────────────────────────────
  async function bootstrap() {
    state.incognito = api.incognito === true;
    state.settings = await api.settings.getAll();
    state.info = await api.app.getInfo();
    state.profile = state.info.profile;
    BP.theme.apply();

    BP.icons.apply();
    BP.tabs.init();
    BP.ui.init();
    BP.panels.init();
    wireWindowControls();
    wireShortcuts();
    wireIpc();
    // На всякий случай применим настройки сайдбара после инициализации
    if (BP.ui && BP.ui.applySidebarSettings) BP.ui.applySidebarSettings();

    BP.ui.updateProfileButton();
    await BP.ui.renderBookmarksBar();
    await BP.ui.renderQuickLinks();
    await BP.ui.renderTopSites();

    // Первоначальная настройка при первом запуске (не в инкогнито и не в самопроверке).
    if (!state.incognito && !api.smoke && !state.settings.onboardingDone && BP.onboarding) {
      await BP.onboarding.start();
    }

    await openStartupTabs();

    state.ready = true;
    BP.tabs.refreshChrome();
    BP.tabs.syncActive();
    BP.ui.focusOmnibox();

    api.downloads.list().then((records) => {
      lastDownloadCount = Array.isArray(records) ? records.length : 0;
    });
  }

  // Публичные действия для вызова из других модулей (например, меню ⋮).
  BP.app = {
    toggleTabGroups,
    switchProfile,
    savePage,
    printPage,
  };

  window.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch((error) => {
      console.error('Ошибка запуска интерфейса:', error);
      BP.toast('Ошибка запуска интерфейса', 'error');
    });
  });
})();
