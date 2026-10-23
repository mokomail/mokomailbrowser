'use strict';

/** Панель инструментов, адресная строка, подсказки, поиск на странице, закладки. */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  const el = {};
  let zoomTimer = null;
  let suggestToken = 0;
  let suggestItems = [];
  let suggestIndex = -1;

  function cache() {
    el.omnibox = document.getElementById('omnibox');
    el.wrap = document.getElementById('omnibox-wrap');
    el.suggestions = document.getElementById('suggestions');
    el.security = document.getElementById('security');
    el.zoomChip = document.getElementById('zoom-chip');
    el.star = document.getElementById('bookmark-star');
    el.back = document.getElementById('nav-back');
    el.forward = document.getElementById('nav-forward');
    el.reload = document.getElementById('nav-reload');
    el.home = document.getElementById('nav-home');
    el.status = document.getElementById('status');
    el.bookmarksBar = document.getElementById('bookmarks-bar');
    el.findbar = document.getElementById('findbar');
    el.findInput = document.getElementById('find-input');
    el.findCount = document.getElementById('find-count');
    el.profileBtn = document.getElementById('btn-profile');
    el.topsites = document.getElementById('topsites');
    el.topsitesSection = document.getElementById('topsites-section');
    el.incognitoNotice = document.getElementById('incognito-notice');
    el.incognitoBadge = document.getElementById('incognito-badge');
    el.hControls = document.getElementById('h-controls');
  }

  // ── Верхняя панель ─────────────────────────────────────────────────────
  function refreshToolbar() {
    const tab = BP.tabs.getActive();
    const wv = tab && tab.webview;
    let canBack = false;
    let canForward = false;
    if (wv) {
      try {
        canBack = wv.canGoBack();
        canForward = wv.canGoForward();
      } catch {
        /* ignore */
      }
    }
    el.back.disabled = !canBack;
    el.forward.disabled = !canForward;

    if (tab && tab.loading) {
      el.reload.dataset.icon = 'stop';
      el.reload.title = 'Остановить (Esc)';
      el.reload.classList.add('spinning');
    } else {
      el.reload.dataset.icon = 'reload';
      el.reload.title = 'Обновить (F5)';
      el.reload.classList.remove('spinning');
    }
    el.reload.innerHTML = BP.icons.svg(el.reload.dataset.icon, 19);
  }

  function wireToolbar() {
    el.back.addEventListener('click', () => BP.tabs.act('back'));
    el.forward.addEventListener('click', () => BP.tabs.act('forward'));
    el.reload.addEventListener('click', () => BP.tabs.act(BP.tabs.getActive()?.loading ? 'stop' : 'reload'));
    el.home.addEventListener('click', () => BP.tabs.goHome());
    el.star.addEventListener('click', () => toggleBookmark());

    document.getElementById('new-tab').addEventListener('click', () => BP.tabs.create({ activate: true }));
    document.getElementById('btn-downloads').addEventListener('click', () => BP.panels.openDownloads());
    document.getElementById('btn-history').addEventListener('click', () => BP.panels.openHistory());
    document.getElementById('btn-menu').addEventListener('click', (event) => BP.panels.openMainMenu(event.currentTarget));
    el.profileBtn.addEventListener('click', (event) => BP.panels.openProfileMenu(event.currentTarget));

    el.security.addEventListener('click', () => {
      const tab = BP.tabs.getActive();
      if (!tab || tab.isNewTab) return;
      BP.panels.openSiteInfo(tab);
    });
  }

  // ── Индикатор безопасности ─────────────────────────────────────────────
  function updateSecurity(tab) {
    if (!tab || tab.isNewTab || !tab.url) {
      el.security.dataset.icon = 'globe';
      el.security.classList.remove('secure', 'insecure');
      el.security.title = 'Информация о странице';
      el.security.innerHTML = BP.icons.svg('globe', 16);
      return;
    }
    const https = /^https:/i.test(tab.url);
    const internal = /^(file|about|chrome|view-source|data):/i.test(tab.url);
    el.security.classList.toggle('secure', https);
    el.security.classList.toggle('insecure', !https && !internal);
    if (https) {
      el.security.dataset.icon = 'lock';
      el.security.title = 'Соединение защищено (HTTPS)';
      el.security.innerHTML = BP.icons.svg('lock', 16);
    } else if (internal) {
      el.security.dataset.icon = 'globe';
      el.security.title = 'Внутренняя страница';
      el.security.innerHTML = BP.icons.svg('globe', 16);
    } else {
      el.security.dataset.icon = 'warning';
      el.security.title = 'Незащищённое соединение (HTTP)';
      el.security.innerHTML = BP.icons.svg('warning', 16);
    }
  }

  // ── Масштаб ────────────────────────────────────────────────────────────
  function showZoom(zoom) {
    if (!el.zoomChip) return;
    const value = Math.round((Number(zoom) || 1) * 100);
    if (value === 100) {
      el.zoomChip.classList.add('hidden');
      return;
    }
    el.zoomChip.textContent = `${value}%`;
    el.zoomChip.classList.remove('hidden');
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => el.zoomChip.classList.add('hidden'), 1600);
  }

  // ── Строка состояния ───────────────────────────────────────────────────
  function setStatus(text) {
    if (!text) {
      el.status.classList.add('hidden');
      return;
    }
    el.status.textContent = text;
    el.status.classList.remove('hidden');
  }

  // ── Закладки ───────────────────────────────────────────────────────────
  async function toggleBookmark() {
    const tab = BP.tabs.getActive();
    if (!tab || tab.isNewTab || !tab.url) {
      BP.toast('Нечего добавлять в закладки');
      return;
    }
    const exists = await api.bookmarks.has(tab.url);
    if (exists) {
      const items = await api.bookmarks.list();
      const found = items.find((item) => item.url === tab.url);
      if (found) await api.bookmarks.remove(found.id);
      BP.toast('Удалено из закладок');
    } else {
      await api.bookmarks.add({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon });
      BP.toast('Добавлено в закладки', 'ok');
    }
    updateStar(tab);
    renderBookmarksBar();
  }

  async function updateStar(tab) {
    const active = tab || BP.tabs.getActive();
    const usable = active && !active.isNewTab && active.url;
    el.star.disabled = !usable;
    if (!usable) {
      el.star.classList.remove('active');
      return;
    }
    const exists = await api.bookmarks.has(active.url);
    el.star.classList.toggle('active', exists);
    el.star.title = exists ? 'Убрать из закладок (Ctrl+D)' : 'Добавить в закладки (Ctrl+D)';
  }

  async function renderBookmarksBar() {
    const bar = el.bookmarksBar;
    if (!bar) return;
    if (state.settings.showBookmarksBar === false) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    const items = await api.bookmarks.list();
    bar.innerHTML = '';
    for (const item of items) {
      const node = util.el('button', { class: 'bm-item', title: `${item.title}\n${item.url}` }, [
        util.faviconNode({ favicon: item.favicon, url: item.url, title: item.title, size: 15 }),
        util.el('span', { text: item.title || item.url }),
      ]);
      node.addEventListener('click', () => {
        const tab = BP.tabs.getActive();
        BP.tabs.navigateUrl(tab, item.url);
      });
      node.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
          event.preventDefault();
          BP.tabs.create({ url: item.url, background: true });
        }
      });
      bar.append(node);
    }
  }

  // ── Адресная строка ────────────────────────────────────────────────────
  function syncOmnibox(tab) {
    const active = tab || BP.tabs.getActive();
    if (document.activeElement === el.omnibox) return;
    el.omnibox.value = active && !active.isNewTab && active.url ? util.prettyUrl(active.url) : '';
  }

  function fullUrlOfActive() {
    const tab = BP.tabs.getActive();
    return tab && !tab.isNewTab && tab.url ? tab.url : '';
  }

  function navigateFromOmnibox(value, options = {}) {
    const text = String(value || '').trim();
    if (!text) return;
    const url = util.toNavigationUrl(text);
    const isSearch = !util.isUrlLike(text);
    const forceNewTab = options.newTab || (isSearch && state.settings.openSearchInNewTab === true);
    if (forceNewTab) BP.tabs.create({ url, background: options.background });
    else BP.tabs.navigateUrl(BP.tabs.getActive(), url);
    hideSuggestions();
    el.omnibox.blur();
  }

  // ── Подсказки ──────────────────────────────────────────────────────────
  function hideSuggestions() {
    suggestItems = [];
    suggestIndex = -1;
    el.suggestions.classList.add('hidden');
    el.suggestions.innerHTML = '';
  }

  function renderSuggestions(items) {
    suggestItems = items;
    suggestIndex = items.length ? 0 : -1;
    el.suggestions.innerHTML = '';
    if (!items.length) {
      hideSuggestions();
      return;
    }
    items.forEach((item, index) => {
      const iconNode = util.el('span', { class: 'suggestion-icon' });
      if (item.kind === 'search') iconNode.innerHTML = BP.icons.svg('search', 17);
      else if (item.kind === 'history') iconNode.innerHTML = BP.icons.svg('history', 17);
      else if (item.kind === 'bookmark') iconNode.innerHTML = BP.icons.svg('bookmark', 17);
      else iconNode.innerHTML = BP.icons.svg('globe', 17);

      const node = util.el('div', { class: `suggestion${index === 0 ? ' selected' : ''}`, dataset: { index } }, [
        iconNode,
        util.el('div', { class: 'suggestion-body' }, [
          util.el('div', { class: 'suggestion-title', text: item.title }),
          item.sub ? util.el('div', { class: 'suggestion-sub', text: item.sub }) : null,
        ]),
        item.right ? util.el('span', { class: 'suggestion-kind', text: item.right }) : null,
      ]);
      node.addEventListener('mousedown', (event) => {
        event.preventDefault();
        acceptSuggestion(index);
      });
      el.suggestions.append(node);
    });
    el.suggestions.classList.remove('hidden');
  }

  function highlightSuggestion() {
    util.$$('.suggestion', el.suggestions).forEach((node, index) => {
      node.classList.toggle('selected', index === suggestIndex);
      if (index === suggestIndex) node.scrollIntoView({ block: 'nearest' });
    });
  }

  function moveSuggestion(delta) {
    if (!suggestItems.length) return;
    suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
    highlightSuggestion();
  }

  function acceptSuggestion(index) {
    const item = suggestItems[index];
    if (!item) return;
    if (item.kind === 'search') {
      navigateFromOmnibox(item.query);
    } else {
      navigateFromOmnibox(item.url);
    }
  }

  async function buildSuggestions(query) {
    const token = ++suggestToken;
    const text = String(query || '').trim();
    const results = [];

    if (!text) {
      const history = await api.history.list('');
      history.slice(0, 5).forEach((item) => {
        results.push({ kind: 'history', title: item.title || item.url, sub: util.prettyUrl(item.url), url: item.url, favicon: item.favicon, right: 'история' });
      });
      if (token !== suggestToken) return;
      renderSuggestions(results);
      return;
    }

    if (util.isUrlLike(text)) {
      results.push({ kind: 'url', title: text, sub: 'Перейти на сайт', url: util.normalizeUrl(text), right: 'перейти' });
    }

    results.push({
      kind: 'search',
      title: text,
      sub: `Поиск в ${engineName()}`,
      query: text,
      right: 'поиск',
    });

    const [history, bookmarks] = await Promise.all([api.history.list(text), api.bookmarks.list()]);
    if (token !== suggestToken) return;

    const lower = text.toLowerCase();
    bookmarks
      .filter((item) => (item.title || '').toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
      .slice(0, 3)
      .forEach((item) => {
        results.push({ kind: 'bookmark', title: item.title || item.url, sub: util.prettyUrl(item.url), url: item.url, favicon: item.favicon, right: 'закладка' });
      });

    history.slice(0, 5).forEach((item) => {
      if (results.some((entry) => entry.url === item.url)) return;
      results.push({ kind: 'history', title: item.title || item.url, sub: util.prettyUrl(item.url), url: item.url, favicon: item.favicon, right: 'история' });
    });

    renderSuggestions(results);

    if (state.settings.searchSuggestions !== false) {
      const engine = state.settings.searchEngine;
      const live = await api.app.suggest(engine, text);
      if (token !== suggestToken) return;
      if (live && live.length) {
        const extras = live
          .filter((phrase) => !results.some((entry) => entry.kind === 'search' && entry.title === phrase))
          .slice(0, 5)
          .map((phrase) => ({ kind: 'search', title: phrase, sub: `Поиск в ${engineName()}`, query: phrase, right: 'поиск' }));
        renderSuggestions([...results.slice(0, 3), ...extras, ...results.slice(3)]);
      }
    }
  }

  function engineName() {
    const engine = api.searchEngines.find((item) => item.id === state.settings.searchEngine);
    return engine ? engine.name : 'Интернете';
  }

  const suggestDebounced = util.debounce((value) => buildSuggestions(value), 160);

  function wireOmnibox() {
    el.omnibox.addEventListener('focus', () => {
      el.omnibox.value = fullUrlOfActive();
      el.omnibox.select();
      buildSuggestions(el.omnibox.value);
    });

    el.omnibox.addEventListener('input', () => {
      suggestDebounced(el.omnibox.value);
    });

    el.omnibox.addEventListener('blur', () => {
      setTimeout(() => {
        hideSuggestions();
        syncOmnibox();
      }, 120);
    });

    el.omnibox.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (el.suggestions.classList.contains('hidden')) buildSuggestions(el.omnibox.value);
        else moveSuggestion(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSuggestion(-1);
        return;
      }
      if (event.key === 'Escape') {
        hideSuggestions();
        el.omnibox.value = fullUrlOfActive();
        el.omnibox.blur();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const alt = event.altKey;
        if (suggestIndex >= 0 && suggestItems[suggestIndex]) {
          const item = suggestItems[suggestIndex];
          if (item.kind === 'search') navigateFromOmnibox(item.query, { newTab: alt });
          else navigateFromOmnibox(item.url, { newTab: alt });
        } else {
          navigateFromOmnibox(el.omnibox.value, { newTab: alt });
        }
      }
    });
  }

  function focusOmnibox() {
    el.omnibox.focus();
    el.omnibox.select();
  }

  // ── Поиск на странице ──────────────────────────────────────────────────
  function openFind() {
    el.findbar.classList.remove('hidden');
    el.findInput.focus();
    el.findInput.select();
  }

  function closeFind() {
    const tab = BP.tabs.getActive();
    el.findbar.classList.add('hidden');
    el.findInput.value = '';
    el.findCount.textContent = '0/0';
    if (tab && tab.webview) {
      try {
        tab.webview.stopFindInPage('clearSelection');
      } catch {
        /* ignore */
      }
    }
  }

  function runFind(forward, findNext) {
    const tab = BP.tabs.getActive();
    const text = el.findInput.value;
    if (!tab || !tab.webview || !text) return;
    try {
      tab.webview.findInPage(text, { forward, findNext });
    } catch {
      /* ignore */
    }
  }

  function onFoundInPage(result) {
    if (!result) return;
    el.findCount.textContent = `${result.activeMatchOrdinal || 0}/${result.matches || 0}`;
  }

  function wireFind() {
    el.findInput.addEventListener('input', util.debounce(() => runFind(true, false), 120));
    el.findInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runFind(!event.shiftKey, true);
      } else if (event.key === 'Escape') {
        closeFind();
      }
    });
    document.getElementById('find-next').addEventListener('click', () => runFind(true, true));
    document.getElementById('find-prev').addEventListener('click', () => runFind(false, true));
    document.getElementById('find-close').addEventListener('click', closeFind);
  }

  // ── Новая вкладка: поиск, быстрые ссылки ───────────────────────────────
  async function renderQuickLinks() {
    const container = document.getElementById('quicklinks');
    if (!container) return;
    container.innerHTML = '';
    const links = Array.isArray(state.settings.quickLinks) ? state.settings.quickLinks : [];
    links.forEach((link, index) => {
      const avatar = util.siteAvatar({ title: link.title, url: link.url, icon: link.icon });

      const node = util.el('button', { class: 'quicklink', title: link.url }, [
        avatar,
        util.el('span', { class: 'quicklink-title', text: link.title || util.hostOf(link.url) }),
        util.el('span', { class: 'quicklink-remove', html: BP.icons.svg('close', 12), title: 'Удалить' }),
      ]);
      // Ступенчатое появление карточек (см. --i в styles.css).
      node.style.setProperty('--i', String(index));

      node.addEventListener('click', (event) => {
        if (event.target.closest('.quicklink-remove')) {
          event.stopPropagation();
          const next = links.filter((item, i) => i !== index);
          BP.settings.set('quickLinks', next).then(renderQuickLinks);
          return;
        }
        BP.tabs.navigateUrl(BP.tabs.getActive(), link.url);
      });

      container.append(node);
    });
  }

  function wireNewTab() {
    const form = document.getElementById('newtab-search');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = document.getElementById('newtab-input');
      if (!input.value.trim()) return;
      BP.tabs.navigateUrl(BP.tabs.getActive(), util.toNavigationUrl(input.value));
      input.value = '';
    });

    document.getElementById('quicklink-add').addEventListener('click', () => {
      BP.panels.promptQuickLink();
    });

    const dropOverlay = document.getElementById('drop-overlay');
    document.addEventListener('dragover', (event) => {
      const types = event.dataTransfer ? [...event.dataTransfer.types] : [];
      if (!types.includes('Files') && !types.includes('text/uri-list')) return;
      event.preventDefault();
      dropOverlay.classList.remove('hidden');
    });
    document.addEventListener('dragleave', (event) => {
      if (event.relatedTarget === null) dropOverlay.classList.add('hidden');
    });
    document.addEventListener('drop', (event) => {
      const types = event.dataTransfer ? [...event.dataTransfer.types] : [];
      if (!types.includes('Files') && !types.includes('text/uri-list')) return;
      event.preventDefault();
      dropOverlay.classList.add('hidden');

      const uri = (event.dataTransfer.getData('text/uri-list') || '').trim().split('\n')[0];
      if (uri && /^https?:\/\//i.test(uri)) {
        BP.tabs.create({ url: uri });
        return;
      }
      if (event.dataTransfer.files && event.dataTransfer.files.length) {
        BP.toast('Перетаскивание файлов пока не поддерживается');
      }
    });
  }

  // ── Часто посещаемые (из истории) ──────────────────────────────────────
  async function renderTopSites() {
    const container = el.topsites;
    if (!container) return;
    if (state.settings.showTopSites === false) {
      if (el.topsitesSection) el.topsitesSection.classList.add('hidden');
      return;
    }
    let items = [];
    try {
      items = await api.history.top(8);
    } catch {
      items = [];
    }
    if (!items.length) {
      if (el.topsitesSection) el.topsitesSection.classList.add('hidden');
      return;
    }
    if (el.topsitesSection) el.topsitesSection.classList.remove('hidden');
    container.innerHTML = '';
    items.forEach((item, index) => {
      const avatar = util.siteAvatar({ title: item.title, url: item.url, icon: item.favicon });
      const node = util.el('button', { class: 'quicklink', title: `${item.title || item.url}\n${item.url}\nПосещений: ${item.visitCount || 1}` }, [
        avatar,
        util.el('span', { class: 'quicklink-title', text: item.title || util.hostOf(item.url) }),
      ]);
      node.style.setProperty('--i', String(index));
      node.addEventListener('click', () => BP.tabs.navigateUrl(BP.tabs.getActive(), item.url));
      node.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
          event.preventDefault();
          BP.tabs.create({ url: item.url, background: true });
        }
      });
      container.append(node);
    });
  }

  // ── Профиль ────────────────────────────────────────────────────────────
  function updateProfileButton(profile) {
    const current = profile || state.profile;
    if (!el.profileBtn) return;
    if (!current) return;
    el.profileBtn.innerHTML = `<span class="profile-initial" style="background:${current.color || 'var(--accent)'}">${util.initialOf(current.name)}</span>`;
    el.profileBtn.title = `Профиль: ${current.name}`;
  }

  function applyIncognitoUi() {
    if (el.incognitoNotice) el.incognitoNotice.classList.toggle('hidden', !state.incognito);
    if (el.incognitoBadge) el.incognitoBadge.classList.toggle('hidden', !state.incognito);
  }

  function init() {
    cache();
    wireToolbar();
    wireOmnibox();
    wireFind();
    wireNewTab();
    applyIncognitoUi();
  }

  BP.ui = {
    init,
    refreshToolbar,
    syncOmnibox,
    updateSecurity,
    updateStar,
    renderBookmarksBar,
    showZoom,
    setStatus,
    focusOmnibox,
    openFind,
    closeFind,
    onFoundInPage,
    renderQuickLinks,
    renderTopSites,
    updateProfileButton,
    applyIncognitoUi,
    hideSuggestions,
    toggleBookmark,
  };
})();
