'use strict';

/** Управление вкладками, группами вкладок и встроенными страницами (webview). */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  // Глобальный дедуп истории, чтобы не дублировать при переключении вкладок/SPA-переходах
  let lastHistGlobal = { url: '', at: 0, tabId: '' };

  const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const GROUP_COLORS = ['#6c8cff', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

  const els = {};
  // Индикатор активной вкладки. Храним ссылку, чтобы он переживал перерисовку
  // полосы и мог плавно «переезжать» между вкладками.
  let indicatorEl = null;

  function bind() {
    els.tabs = document.getElementById('tabs');
    els.views = document.getElementById('views');
    els.content = document.getElementById('content');
  }

  const ui = () => BP.ui;

  let seq = 0;
  function newId() {
    seq += 1;
    return `tab_${seq}_${Date.now().toString(36)}`;
  }

  // ── Состояние вкладок ──────────────────────────────────────────────────
  const isActive = (tab) => tab && tab.id === state.activeTabId;
  const getActive = () => state.tabs.find((tab) => tab.id === state.activeTabId) || null;
  const findById = (id) => state.tabs.find((tab) => tab.id === id) || null;
  const layoutMode = () => 'horizontal';

  function findByWebContentsId(id) {
    return (
      state.tabs.find((tab) => {
        if (!tab.webview) return false;
        try {
          return tab.webview.getWebContentsId() === id;
        } catch {
          return false;
        }
      }) || null
    );
  }

  // ── Группы вкладок ─────────────────────────────────────────────────────
  const groupOf = (id) => (state.tabGroups || []).find((group) => group.id === id) || null;
  const tabsInGroup = (id) => state.tabs.filter((tab) => tab.groupId === id);
  const groupsEnabled = () => state.settings.tabGroupsEnabled !== false;

  function createGroup(name, color) {
    const groups = state.tabGroups || (state.tabGroups = []);
    const group = {
      id: `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: (name || '').trim() || `Группа ${groups.length + 1}`,
      color: color || GROUP_COLORS[groups.length % GROUP_COLORS.length],
      collapsed: false,
    };
    groups.push(group);
    return group;
  }

  function renameGroup(id, name, color) {
    const group = groupOf(id);
    if (!group) return;
    if (typeof name === 'string' && name.trim()) group.name = name.trim();
    if (typeof color === 'string' && color) group.color = color;
    renderStrip();
    saveStateSoon();
  }

  function assignToGroup(tabId, groupId) {
    const tab = findById(tabId);
    if (!tab) return;
    tab.groupId = groupId || null;
    renderStrip();
    saveStateSoon();
  }

  function toggleGroupCollapsed(id) {
    const group = groupOf(id);
    if (!group) return;
    group.collapsed = !group.collapsed;
    renderStrip();
    saveStateSoon();
  }

  function closeGroup(id) {
    tabsInGroup(id).forEach((tab) => {
      state.tabs = state.tabs.filter((item) => item.id !== tab.id);
      if (!tab.isNewTab && tab.url) {
        state.closedTabs.push({ url: tab.url, title: tab.title, groupId: tab.groupId || null, pinned: !!tab.pinned });
        if (state.closedTabs.length > 25) state.closedTabs.shift();
      }
      if (tab.viewEl) tab.viewEl.remove();
      if (tab.element) tab.element.remove();
    });
    state.tabGroups = (state.tabGroups || []).filter((group) => group.id !== id);
    if (!findById(state.activeTabId)) {
      const next = state.tabs[0];
      if (next) selectTab(next.id);
      else createTab({ activate: true });
      return;
    }
    renderStrip();
    saveStateSoon();
  }

  // ── Отрисовка полосы вкладок ───────────────────────────────────────────
  function updateTabElement(tab) {
    const el = tab.element;
    if (!el) return;
    el.classList.toggle('active', isActive(tab));
    el.classList.toggle('loading', !!tab.loading);
    el.classList.toggle('pinned', !!tab.pinned);

    const title = tab.title || util.prettyUrl(tab.url) || 'Новая вкладка';
    const titleEl = el.querySelector('.tab-title');
    titleEl.textContent = title;
    el.title = title;

    const group = tab.groupId ? groupOf(tab.groupId) : null;
    if (group && groupsEnabled()) {
      el.classList.add('grouped');
      el.style.setProperty('--group-color', group.color);
      el.title = `${title}\nГруппа: ${group.name}`;
    } else {
      el.classList.remove('grouped');
      el.style.removeProperty('--group-color');
    }

    const fav = el.querySelector('.tab-favicon');
    fav.innerHTML = '';
    if (tab.loading) {
      fav.append(util.el('span', { class: 'tab-spinner' }));
    } else if (state.settings.showFavicons !== false) {
      fav.append(util.faviconNode({ favicon: tab.favicon, url: tab.url, title: tab.title, size: 16 }));
    } else {
      fav.innerHTML = BP.icons.svg('globe', 15);
    }

    const mute = el.querySelector('.tab-mute');
    if (mute) {
      mute.classList.toggle('hidden', !tab.muted);
      mute.innerHTML = tab.muted ? BP.icons.svg('volume-off', 13) : '';
    }

    // Заголовок/фавикон могли изменить ширину вкладки — держим индикатор ровно.
    if (isActive(tab) && el.isConnected) positionIndicator();
  }

  function buildTabElement(tab) {
    const el = util.el('div', { class: 'tab', draggable: 'true', dataset: { tab: tab.id } }, [
      util.el('span', { class: 'tab-favicon' }),
      util.el('span', { class: 'tab-mute', title: 'Звук выключен' }),
      util.el('span', { class: 'tab-title' }),
      util.el('button', { class: 'tab-close', title: 'Закрыть вкладку', html: BP.icons.svg('close', 12) }),
    ]);
    // Новая вкладка «раскрывается» в полосе.
    if (tab.enter) el.classList.add('tab-enter');
    tab.element = el;
    updateTabElement(tab);
    return el;
  }

  function buildGroupHeader(group) {
    const count = tabsInGroup(group.id).length;
    const header = util.el('div', { class: 'tab-group', dataset: { group: group.id } });
    header.style.setProperty('--group-color', group.color);

    const toggle = util.el('button', {
      class: 'tab-group-toggle',
      title: group.collapsed ? 'Развернуть группу' : 'Свернуть группу',
      html: BP.icons.svg(group.collapsed ? 'right' : 'down', 12),
    });
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleGroupCollapsed(group.id);
    });

    header.append(
      toggle,
      util.el('span', { class: 'tab-group-name', text: group.name }),
      util.el('span', { class: 'tab-group-count', text: String(count) }),
      util.el('button', { class: 'tab-group-close', title: 'Закрыть группу', html: BP.icons.svg('close', 12), onclick: (event) => { event.stopPropagation(); closeGroup(group.id); } })
    );
    return header;
  }

  function renderStrip() {
    if (!els.tabs) return;
    // Всегда горизонтальный режим вкладок.
    util.$$('.tab, .tab-group', els.tabs).forEach((node) => node.remove());

    state.tabs.forEach((tab) => {
      els.tabs.append(buildTabElement(tab));
    });

    positionIndicator();
  }

  /** Лениво создаёт индикатор активной вкладки. */
  function ensureIndicator() {
    if (indicatorEl && indicatorEl.isConnected) return indicatorEl;
    indicatorEl = util.el('div', { class: 'tab-indicator' });
    return indicatorEl;
  }

  /** Ставит индикатор под активной вкладкой. */
  function positionIndicator() {
    if (!els.tabs) return;
    const indicator = ensureIndicator();
    // Всегда последним ребёнком, чтобы рисоваться поверх вкладок.
    els.tabs.append(indicator);

    const tab = getActive();
    const target = tab && tab.element && tab.element.isConnected ? tab.element : null;
    if (!target) {
      indicator.style.opacity = '0';
      return;
    }
    // Немного утапливаем полосу внутрь вкладки, чтобы она не выходила за
    // скруглённые верхние углы (как индикатор вкладки в Material 3).
    const inset = 8;
    indicator.style.width = `${Math.max(12, target.offsetWidth - inset * 2)}px`;
    indicator.style.transform = `translateX(${target.offsetLeft + inset}px)`;
    indicator.style.opacity = '1';
  }

  // ── Синхронизация с интерфейсом ────────────────────────────────────────
  function refreshChrome() {
    if (ui()) ui().refreshToolbar();
  }

  function syncActive() {
    const tab = getActive();
    if (!tab) return;
    const mode = tab.isNewTab ? 'newtab' : 'page';
    els.content.dataset.mode = mode;

    // Показываем ТОЛЬКО активную вкладку. Остальные прячем через visibility
    // (а не display), чтобы их webview не терял размеры и не «схлопывался».
    state.tabs.forEach((item) => {
      if (!item.viewEl) return;
      item.viewEl.classList.toggle('active', mode === 'page' && item.id === state.activeTabId);
    });

    if (ui()) {
      ui().syncOmnibox(tab);
      ui().updateSecurity(tab);
      ui().updateStar(tab);
      ui().showZoom(tab.zoom);
    }
    refreshChrome();
  }

  // ── Работа с webview ───────────────────────────────────────────────────
  function ensureWebview(tab, url) {
    if (tab.webview) return tab.webview;

    const viewEl = util.el('div', { class: 'view', dataset: { tab: tab.id } });
    const wv = document.createElement('webview');
    wv.setAttribute('partition', api.partition);
    wv.setAttribute('allowpopups', '');

    const prefs = [];
    if (state.settings.javascriptEnabled === false) prefs.push('javascript=no');
    if (state.settings.autoplayPolicy) prefs.push(`autoplayPolicy=${state.settings.autoplayPolicy}`);
    if (prefs.length) wv.setAttribute('webpreferences', prefs.join(', '));

    // Сначала подключаем webview к документу и только потом задаём `src`:
    // при обратном порядке первый переход иногда теряется (гонка при
    // инициализации встроенного представления Chromium).
    viewEl.append(wv);
    els.views.append(viewEl);

    tab.webview = wv;
    tab.viewEl = viewEl;
    tab.isNewTab = false;
    attachWebviewEvents(tab);

    if (url) wv.setAttribute('src', url);
    return wv;
  }

  function attachWebviewEvents(tab) {
    const wv = tab.webview;

    wv.addEventListener('did-start-loading', () => {
      tab.loading = true;
      updateTabElement(tab);
      if (isActive(tab)) refreshChrome();
    });

    wv.addEventListener('did-stop-loading', () => {
      tab.loading = false;
      updateTabElement(tab);
      if (isActive(tab)) refreshChrome();
    });

    wv.addEventListener('did-start-navigation', (event) => {
      if (!event.isMainFrame) return;
      tab.url = event.url;
      if (isActive(tab)) ui() && ui().syncOmnibox(tab);
    });

    wv.addEventListener('did-navigate', (event) => {
      tab.url = event.url;
      tab.isNewTab = false;
      onNavigated(tab);
    });

    wv.addEventListener('did-navigate-in-page', (event) => {
      if (!event.isMainFrame) return;
      // did-navigate-in-page часто срабатывает при SPA-переходах. Не добавляем
      // в основную историю здесь — оставляем это onNavigated и ограничим дубли.
      tab.url = event.url;
      onNavigated(tab);
    });

    wv.addEventListener('page-title-updated', (event) => {
      tab.title = event.title;
      updateTabElement(tab);
      if (!state.incognito) api.history.update({ url: tab.url, title: event.title });
      if (isActive(tab)) ui() && ui().syncOmnibox(tab);
    });

    wv.addEventListener('page-favicon-updated', (event) => {
      tab.favicon = (event.favicons && event.favicons[0]) || '';
      updateTabElement(tab);
      if (!state.incognito) api.history.update({ url: tab.url, favicon: tab.favicon });
    });

    wv.addEventListener('dom-ready', () => applyZoom(tab));

    wv.addEventListener('did-fail-load', (event) => {
      if (!event.isMainFrame) return;
      if (event.errorCode === -3) return; // ERR_ABORTED — обычное прерывание
      tab.error = event;
      showError(tab, event);
      tab.loading = false;
      updateTabElement(tab);
      if (isActive(tab)) refreshChrome();
    });

    wv.addEventListener('update-target-url', (event) => {
      if (ui()) ui().setStatus(event.url);
    });

    wv.addEventListener('found-in-page', (event) => {
      if (ui()) ui().onFoundInPage(event.result);
    });

    wv.addEventListener('render-process-gone', () => {
      tab.error = { errorCode: '', errorDescription: 'Страница неожиданно завершилась. Обновите вкладку.' };
      showError(tab, tab.error);
      if (isActive(tab)) refreshChrome();
    });
  }

  function onNavigated(tab) {
    tab.isNewTab = false;
    if (tab.viewEl) tab.viewEl.classList.remove('has-error');
    // В историю пишем только реально посещённые страницы (http/https/file),
    // а не служебные about:/data:/devtools:.
    const url = tab.url;
    const now = Date.now();
    if (!url) return;
    const lastUrl = tab._lastHistUrl;
    const lastAt = tab._lastHistAt || 0;
    // Не дублируем одну и ту же страницу подряд (переключения вкладок,
    // множественные события did-navigate-in-page, быстрые редиректы).
    const isDuplicateTab = lastUrl === url && now - lastAt < 5000;
    const isDuplicateGlobal = lastHistGlobal.url === url && now - lastHistGlobal.at < 5000;
    if (!state.incognito && /^(https?|file):/i.test(url) && !isDuplicateTab && !isDuplicateGlobal) {
      api.history.add({ url, title: tab.title, favicon: tab.favicon });
      tab._lastHistUrl = url;
      tab._lastHistAt = now;
      lastHistGlobal = { url, at: now, tabId: tab.id || '' };
    } else if (!state.incognito && /^(https?|file):/i.test(url)) {
      // Обновляем время для корректного трекинга даже если не добавляем
      tab._lastHistUrl = url;
      tab._lastHistAt = now;
      if (lastHistGlobal.url === url) {
        lastHistGlobal.at = now;
      }
    }
    // Точечно обновляем вкладку вместо полной перестройки полосы.
    updateTabElement(tab);
    if (isActive(tab)) {
      els.content.dataset.mode = 'page';
      syncActive();
    }
    saveStateSoon();
  }

  function showError(tab, error) {
    if (!tab.viewEl) return;
    tab.viewEl.classList.add('has-error');
    let page = tab.viewEl.querySelector('.error-page');
    if (!page) {
      page = util.el('div', { class: 'error-page' });
      tab.viewEl.append(page);
    }
    page.innerHTML = '';
    page.append(
      util.el('h2', { text: 'Не удалось открыть страницу' }),
      util.el('p', { text: (error && error.errorDescription) || 'Произошла неизвестная ошибка.' }),
      util.el('p', {
        class: 'error-code',
        text: `Код: ${(error && error.errorCode) || '—'}${error && error.validatedURL ? ` • ${error.validatedURL}` : tab.url ? ` • ${tab.url}` : ''}`,
      }),
      util.el('div', { class: 'btn-row' }, [
        util.el('button', { class: 'btn primary', text: 'Попробовать снова', onclick: () => tab.webview && tab.webview.reload() }),
      ])
    );
  }

  // ── Масштаб ────────────────────────────────────────────────────────────
  function applyZoom(tab) {
    if (!tab.webview) return;
    try {
      tab.webview.setZoomFactor(tab.zoom || 1);
    } catch {
      /* ignore */
    }
  }

  function stepZoom(tab, direction) {
    if (!tab) return;
    const current = tab.zoom || 1;
    let index = ZOOM_LEVELS.findIndex((level) => Math.abs(level - current) < 0.001);
    if (index < 0) index = ZOOM_LEVELS.indexOf(1);
    index = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + direction));
    tab.zoom = ZOOM_LEVELS[index];
    applyZoom(tab);
    if (isActive(tab)) ui() && ui().showZoom(tab.zoom);
  }

  function resetZoom(tab) {
    if (!tab) return;
    tab.zoom = 1;
    applyZoom(tab);
    if (isActive(tab)) ui() && ui().showZoom(tab.zoom);
  }

  // ── Создание / закрытие / выбор вкладок ────────────────────────────────
  function createTab(options = {}) {
    const tab = {
      id: newId(),
      url: '',
      title: 'Новая вкладка',
      favicon: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      zoom: Number(state.settings.defaultZoom) || 1,
      webview: null,
      viewEl: null,
      element: null,
      isNewTab: true,
      error: null,
      groupId: options.groupId || null,
      pinned: options.pinned === true,
      muted: false,
    };
    // Флаг для анимации появления новой вкладки в полосе (гасим чуть позже,
    // чтобы она успела проиграться и не повторялась при следующих перерисовках).
    tab.enter = true;
    window.setTimeout(() => {
      tab.enter = false;
    }, 420);
    if (options.pinned) {
      // Закреплённые вкладки держим в начале полосы.
      const boundary = state.tabs.filter((item) => item.pinned).length;
      state.tabs.splice(boundary, 0, tab);
    } else {
      state.tabs.push(tab);
    }

    const activate = options.activate !== false && options.background !== true;
    // Активную вкладку отмечаем заранее: представление создаётся уже видимым,
    // иначе Chromium может прервать первую навигацию webview (ERR_ABORTED).
    if (activate) state.activeTabId = tab.id;

    if (options.url) {
      navigateUrl(tab, options.url);
    } else {
      ensureNewTabElement(tab);
    }

    if (activate) {
      selectTab(tab.id);
    } else {
      renderStrip();
    }

    if (tab.isNewTab && isActive(tab)) els.content.dataset.mode = 'newtab';
    saveStateSoon();
    return tab;
  }

  function ensureNewTabElement(tab) {
    if (!tab.element) buildTabElement(tab);
    renderStrip();
  }

  function selectTab(id) {
    const tab = findById(id);
    if (!tab) return;
    state.activeTabId = id;
    renderStrip();
    syncActive();
    if (tab.webview) {
      try {
        tab.webview.focus();
      } catch {
        /* ignore */
      }
    }
    saveStateSoon();
  }

  function closeTab(id) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;

    const [tab] = state.tabs.splice(index, 1);
    if (!tab.isNewTab && tab.url) {
      state.closedTabs.push({ url: tab.url, title: tab.title, groupId: tab.groupId || null, pinned: !!tab.pinned });
      if (state.closedTabs.length > 25) state.closedTabs.shift();
    }

    if (tab.viewEl) tab.viewEl.remove();
    if (tab.element) tab.element.remove();

    // Пустая группа удаляется автоматически.
    if (tab.groupId && !tabsInGroup(tab.groupId).length) {
      state.tabGroups = (state.tabGroups || []).filter((group) => group.id !== tab.groupId);
    }

    if (state.activeTabId === id) {
      const next = state.tabs[index] || state.tabs[index - 1] || null;
      if (next) {
        selectTab(next.id);
      } else {
        createTab({ activate: true });
        return;
      }
    } else {
      renderStrip();
    }
    saveStateSoon();
  }

  function closeOthers(keepId) {
    closeMany(state.tabs.filter((tab) => tab.id !== keepId && !tab.pinned).map((tab) => tab.id));
  }

  function closeToRight(id) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    closeMany(state.tabs.slice(index + 1).filter((tab) => !tab.pinned).map((tab) => tab.id));
  }

  /**
   * Массовое закрытие вкладок одной перерисовкой (раньше closeOthers/
   * closeToRight вызывали closeTab в цикле — это давало O(N²) перестроек).
   */
  function closeMany(ids) {
    const toClose = new Set(ids);
    if (!toClose.size) return;

    const closed = [];
    for (let i = state.tabs.length - 1; i >= 0; i--) {
      if (toClose.has(state.tabs[i].id)) closed.push(state.tabs.splice(i, 1)[0]);
    }
    if (!closed.length) return;

    const activeClosed = toClose.has(state.activeTabId);
    closed.forEach((tab) => {
      if (!tab.isNewTab && tab.url) {
        state.closedTabs.push({ url: tab.url, title: tab.title, groupId: tab.groupId || null, pinned: !!tab.pinned });
        if (state.closedTabs.length > 25) state.closedTabs.shift();
      }
      if (tab.viewEl) tab.viewEl.remove();
      if (tab.element) tab.element.remove();
      if (tab.groupId && !tabsInGroup(tab.groupId).length) {
        state.tabGroups = (state.tabGroups || []).filter((group) => group.id !== tab.groupId);
      }
    });

    if (!state.tabs.length) {
      createTab({ activate: true });
      return;
    }
    if (activeClosed) {
      selectTab(state.tabs[state.tabs.length - 1].id);
    } else {
      renderStrip();
    }
    saveStateSoon();
  }

  /** Закрепить/открепить вкладку: закреплённые сжаты до иконки и не закрываются пачкой. */
  function togglePinned(id) {
    const tab = findById(id);
    if (!tab) return false;
    tab.pinned = !tab.pinned;
    sortPinnedFirst();
    renderStrip();
    saveStateSoon();
    return tab.pinned;
  }

  /** Выключить/включить звук вкладки. */
  function toggleMute(id) {
    const tab = findById(id);
    if (!tab || !tab.webview) return false;
    tab.muted = !tab.muted;
    try {
      tab.webview.setAudioMuted(tab.muted);
    } catch {
      /* ignore */
    }
    updateTabElement(tab);
    return tab.muted;
  }

  function reopenClosedTab() {
    const last = state.closedTabs.pop();
    if (!last) {
      BP.toast('Нет закрытых вкладок', '');
      return null;
    }
    const groupId = last.groupId && groupOf(last.groupId) ? last.groupId : null;
    return createTab({ url: last.url, activate: true, groupId, pinned: !!last.pinned });
  }

  function selectRelative(offset) {
    if (!state.tabs.length) return;
    let index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
    if (index < 0) index = 0;
    const next = (index + offset + state.tabs.length) % state.tabs.length;
    selectTab(state.tabs[next].id);
  }

  /** Закреплённые вкладки всегда стоят в начале полосы (как в Chromium). */
  function sortPinnedFirst() {
    const pinned = state.tabs.filter((tab) => tab.pinned);
    if (!pinned.length || pinned.length === state.tabs.length) return;
    const rest = state.tabs.filter((tab) => !tab.pinned);
    state.tabs = pinned.concat(rest);
  }

  function moveTab(id, targetIndex) {
    const from = state.tabs.findIndex((tab) => tab.id === id);
    if (from < 0) return;
    const [tab] = state.tabs.splice(from, 1);
    // Не позволяем перетаскивать обычную вкладку в зону закреплённых и наоборот.
    const boundary = state.tabs.filter((item) => item.pinned).length;
    let to = Math.min(state.tabs.length, Math.max(0, targetIndex));
    to = tab.pinned ? Math.min(to, boundary) : Math.max(to, boundary);
    state.tabs.splice(to, 0, tab);
    renderStrip();
    saveStateSoon();
  }

  // ── Навигация ──────────────────────────────────────────────────────────
  function navigateUrl(tab, url) {
    if (!tab || !url) return;
    tab.error = null;
    if (tab.viewEl) tab.viewEl.classList.remove('has-error');

    if (!tab.webview) {
      ensureWebview(tab, url);
    } else {
      try {
        tab.webview.loadURL(url);
      } catch {
        /* ignore */
      }
    }
    tab.url = url;
    tab.isNewTab = false;
    renderStrip();
    if (isActive(tab)) {
      els.content.dataset.mode = 'page';
      syncActive();
    }
    saveStateSoon();
  }

  function navigateActive(url, options = {}) {
    const tab = getActive();
    if (!tab) return;
    if (options.newTab) createTab({ url, background: options.background });
    else navigateUrl(tab, url);
  }

  function act(action) {
    const tab = getActive();
    if (!tab || !tab.webview) {
      if (action === 'home' || action === 'reload') return;
      return;
    }
    const wv = tab.webview;
    switch (action) {
      case 'back':
        if (wv.canGoBack()) wv.goBack();
        break;
      case 'forward':
        if (wv.canGoForward()) wv.goForward();
        break;
      case 'reload':
        wv.reload();
        break;
      case 'hard-reload':
        wv.reloadIgnoringCache();
        break;
      case 'stop':
        wv.stop();
        break;
      default:
        break;
    }
  }

  function openDevTools() {
    const tab = getActive();
    if (!tab) return;
    if (state.settings.enableDevTools === false) {
      BP.toast('Инструменты разработчика отключены в настройках');
      return;
    }
    if (tab.webview) {
      try {
        if (tab.webview.isDevToolsOpened()) tab.webview.closeDevTools();
        else tab.webview.openDevTools();
      } catch {
        /* ignore */
      }
    } else {
      const win = window;
      if (win.__openDevTools) win.__openDevTools();
    }
  }

  function goHome() {
    const tab = getActive();
    if (!tab) return;
    navigateUrl(tab, state.settings.homepage || 'https://duckduckgo.com/');
  }

  // ── Сохранение состояния сессии ────────────────────────────────────────
  function persistState() {
    const tabCount = state.tabs.length;
    if (state.incognito) {
      // В инкогнито список вкладок не сохраняем, но сообщаем их число —
      // это нужно для подтверждения закрытия окна с несколькими вкладками.
      api.session.saveState({ tabs: [], groups: [], activeIndex: 0, tabCount, incognito: true });
      return;
    }
    const tabs = state.tabs.map((tab) => ({
      url: tab.isNewTab ? '' : tab.url || '',
      groupId: tab.groupId || null,
      pinned: !!tab.pinned,
    }));
    const activeIndex = Math.max(0, state.tabs.findIndex((tab) => tab.id === state.activeTabId));
    api.session.saveState({ tabs, groups: state.tabGroups || [], activeIndex, tabCount });
  }

  const saveStateSoon = util.debounce(persistState, 500);

  // ── Перетаскивание вкладок ─────────────────────────────────────────────
  let dragId = null;

  function wireDragAndDrop() {
    els.tabs.addEventListener('click', (event) => {
      const closeBtn = event.target.closest('.tab-close');
      if (closeBtn) {
        event.stopPropagation();
        closeTab(closeBtn.closest('.tab').dataset.tab);
        return;
      }
      const tabEl = event.target.closest('.tab');
      if (tabEl) selectTab(tabEl.dataset.tab);
    });

    els.tabs.addEventListener('auxclick', (event) => {
      if (event.button !== 1) return;
      const tabEl = event.target.closest('.tab');
      if (tabEl) {
        event.preventDefault();
        closeTab(tabEl.dataset.tab);
      }
    });

    els.tabs.addEventListener('contextmenu', (event) => {
      const tabEl = event.target.closest('.tab');
      if (!tabEl) return;
      event.preventDefault();
      BP.panels.openTabMenu(tabEl.dataset.tab, event.clientX, event.clientY);
    });

    els.tabs.addEventListener('dragstart', (event) => {
      const tabEl = event.target.closest('.tab');
      if (!tabEl) return;
      dragId = tabEl.dataset.tab;
      tabEl.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      try {
        event.dataTransfer.setData('text/plain', dragId);
      } catch {
        /* ignore */
      }
    });

    els.tabs.addEventListener('dragend', () => {
      dragId = null;
      util.$$('.tab', els.tabs).forEach((node) => node.classList.remove('dragging', 'drop-left', 'drop-right', 'drop-before', 'drop-after'));
    });

    els.tabs.addEventListener('dragover', (event) => {
      if (!dragId) return;
      event.preventDefault();
      const over = event.target.closest('.tab');
      util.$$('.tab', els.tabs).forEach((node) => node.classList.remove('drop-left', 'drop-right', 'drop-before', 'drop-after'));
      if (!over || over.dataset.tab === dragId) return;
      const rect = over.getBoundingClientRect();
      over.classList.add(event.clientX > rect.left + rect.width / 2 ? 'drop-right' : 'drop-left');
    });

    els.tabs.addEventListener('drop', (event) => {
      if (!dragId) return;
      event.preventDefault();
      const over = event.target.closest('.tab');
      if (over && over.dataset.tab !== dragId) {
        const rect = over.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        const targetIndex = state.tabs.findIndex((tab) => tab.id === over.dataset.tab);
        const from = state.tabs.findIndex((tab) => tab.id === dragId);
        let to = after ? targetIndex + 1 : targetIndex;
        if (from < to) to -= 1;
        moveTab(dragId, to);
      }
      util.$$('.tab', els.tabs).forEach((node) => node.classList.remove('dragging', 'drop-left', 'drop-right', 'drop-before', 'drop-after'));
      dragId = null;
    });
  }

  function init() {
    bind();
    wireDragAndDrop();
    // При изменении размера окна пересчитываем позицию индикатора вкладки.
    window.addEventListener('resize', positionIndicator);
  }

  BP.tabs = {
    init,
    create: createTab,
    close: closeTab,
    closeOthers,
    closeToRight,
    select: selectTab,
    selectRelative,
    moveTab,
    navigateUrl,
    navigateActive,
    reopenClosed: reopenClosedTab,
    togglePinned,
    toggleMute,
    getActive,
    findById,
    findByWebContentsId,
    isActive,
    renderStrip,
    updateTabElement,
    refreshChrome,
    syncActive,
    act,
    goHome,
    openDevTools,
    stepZoom,
    resetZoom,
    layoutMode,
    // группы
    createGroup,
    renameGroup,
    assignToGroup,
    toggleGroupCollapsed,
    closeGroup,
    groupOf,
    tabsInGroup,
    groupsEnabled,
    GROUP_COLORS,
    saveState: saveStateSoon,
    saveStateNow: persistState,
  };
})();
