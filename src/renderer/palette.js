'use strict';

/**
 * Палитра команд (Ctrl+Shift+P).
 *
 * Быстрый доступ ко всему: действиям браузера, открытым вкладкам, истории,
 * закладкам и быстрым ссылкам. Работает как омнибокс для интерфейса: вводите
 * запрос — палитра показывает подходящие команды и страницы.
 */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  let overlay = null;
  let input = null;
  let listEl = null;
  let items = [];
  let active = 0;
  let runToken = 0;

  /** Статические команды браузера. */
  function commandItems() {
    const actions = [
      { icon: 'plus', title: 'Новая вкладка', run: () => BP.tabs.create({ activate: true }) },
      { icon: 'incognito', title: 'Новое окно инкогнито', run: () => api.app.newWindow({ incognito: true }) },
      { icon: 'window', title: 'Новое окно', run: () => api.app.newWindow() },
      { icon: 'reload', title: 'Восстановить закрытую вкладку', run: () => BP.tabs.reopenClosed() },
      { icon: 'history', title: 'История посещений', run: () => BP.panels.openHistory() },
      { icon: 'bookmark', title: 'Все закладки', run: () => BP.panels.openBookmarks() },
      { icon: 'downloads', title: 'Загрузки', run: () => BP.panels.openDownloads() },
      { icon: 'settings', title: 'Настройки', run: () => BP.panels.openSettings() },
      { icon: 'user', title: 'Профили', run: () => BP.panels.openProfileManager() },
      { icon: 'extension', title: 'Плагины', run: () => BP.panels.openExtensions && BP.panels.openExtensions() },
      { icon: 'star', title: 'Добавить страницу в закладки', run: () => BP.ui.toggleBookmark() },
      { icon: 'search', title: 'Найти на странице', run: () => BP.ui.openFind() },
      { icon: 'camera', title: 'Снимок страницы', run: () => BP.panels.captureScreenshot() },
      { icon: 'layers', title: 'Список открытых вкладок', run: () => BP.panels.openTabSwitcher() },
      { icon: 'keyboard', title: 'Горячие клавиши', run: () => BP.panels.openShortcuts() },
      { icon: 'broom', title: 'Очистить данные браузера', run: () => BP.panels.openClearData() },
      { icon: 'zoom', title: 'Обычный масштаб', run: () => BP.tabs.resetZoom(BP.tabs.getActive()) },
      { icon: 'sparkle', title: 'Повторить начальную настройку', run: () => BP.onboarding && BP.onboarding.start() },
      { icon: 'info', title: 'О браузере', run: () => BP.panels.openAbout() },
      { icon: 'close', title: 'Закрыть вкладку', run: () => BP.tabs.close(state.activeTabId) },
    ];
    return actions.map((action) => ({ ...action, group: 'Действия' }));
  }

  function tabItems() {
    return state.tabs.map((tab) => ({
      icon: 'window',
      title: tab.title || util.prettyUrl(tab.url) || 'Новая вкладка',
      subtitle: tab.isNewTab ? 'Новая вкладка' : util.prettyUrl(tab.url),
      group: 'Вкладки',
      run: () => BP.tabs.select(tab.id),
    }));
  }

  function quickLinkItems() {
    const links = Array.isArray(state.settings.quickLinks) ? state.settings.quickLinks : [];
    return links.map((link) => ({
      icon: 'globe',
      title: link.title || util.hostOf(link.url),
      subtitle: link.url,
      group: 'Быстрые ссылки',
      run: () => BP.tabs.navigateUrl(BP.tabs.getActive(), link.url),
    }));
  }

  async function dynamicItems(query) {
    const out = [];
    try {
      const [bookmarks, history] = await Promise.all([
        api.bookmarks.list(),
        api.history.list(query, { order: 'visits', limit: 8 }),
      ]);
      const lower = query.trim().toLowerCase();
      const matched = lower
        ? bookmarks.filter((b) => (b.title || '').toLowerCase().includes(lower) || b.url.toLowerCase().includes(lower))
        : bookmarks;
      matched.slice(0, 8).forEach((b) => out.push({
        icon: 'bookmark',
        title: b.title || util.prettyUrl(b.url),
        subtitle: b.url,
        group: 'Закладки',
        run: () => BP.tabs.navigateUrl(BP.tabs.getActive(), b.url),
      }));
      history.forEach((h) => out.push({
        icon: 'history',
        title: h.title || util.prettyUrl(h.url),
        subtitle: h.url,
        group: 'История',
        run: () => BP.tabs.navigateUrl(BP.tabs.getActive(), h.url),
      }));
    } catch {
      /* история/закладки недоступны — не мешаем палитре */
    }
    return out;
  }

  function match(query, item) {
    if (!query) return true;
    const haystack = `${item.title} ${item.subtitle || ''}`.toLowerCase();
    return haystack.includes(query);
  }

  async function render() {
    const token = ++runToken;
    const query = input.value.trim().toLowerCase();
    const local = [...tabItems(), ...commandItems(), ...quickLinkItems()].filter((item) => match(query, item));

    listEl.innerHTML = '';

    const paint = (all) => {
      if (token !== runToken) return;
      items = all.slice(0, 40);
      active = 0;
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.append(util.el('div', { class: 'palette-empty', text: 'Ничего не найдено' }));
        return;
      }
      let lastGroup = '';
      items.forEach((item, index) => {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          listEl.append(util.el('div', { class: 'palette-group', text: item.group }));
        }
        const row = util.el('button', {
          class: `palette-item${index === active ? ' active' : ''}`,
          dataset: { index: String(index) },
        }, [
          util.el('span', { class: 'palette-icon', html: BP.icons.svg(item.icon, 18) }),
          util.el('span', { class: 'palette-main' }, [
            util.el('span', { class: 'palette-title', text: item.title }),
            item.subtitle ? util.el('span', { class: 'palette-sub', text: item.subtitle }) : null,
          ]),
        ]);
        row.addEventListener('mousemove', () => setActive(index));
        row.addEventListener('click', () => run(items[index]));
        listEl.append(row);
      });
    };

    paint(local);
    const dynamic = (await dynamicItems(query)).filter((item) => match(query, item));
    if (dynamic.length) paint([...local, ...dynamic]);
  }

  function setActive(index) {
    if (index === active) return;
    active = index;
    util.$$('.palette-item', listEl).forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.index) === active);
    });
  }

  function scrollActiveIntoView() {
    const row = listEl.querySelector(`.palette-item[data-index="${active}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  function move(delta) {
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    util.$$('.palette-item', listEl).forEach((row) => {
      row.classList.toggle('active', Number(row.dataset.index) === active);
    });
    scrollActiveIntoView();
  }

  function run(item) {
    if (!item || typeof item.run !== 'function') return;
    close();
    // Даём палитре закрыться, затем выполняем — иначе возможны гонки с фокусом.
    setTimeout(() => {
      try {
        item.run();
      } catch (error) {
        console.error('[palette] Ошибка команды:', error);
      }
    }, 0);
  }

  function build() {
    overlay = util.el('div', { class: 'palette-overlay' });
    const box = util.el('div', { class: 'palette' });
    input = util.el('input', { class: 'palette-input', type: 'text', placeholder: 'Введите команду или адрес…', spellcheck: 'false', autocomplete: 'off' });
    listEl = util.el('div', { class: 'palette-list' });

    const icon = util.el('span', { class: 'palette-search-icon', html: BP.icons.svg('search', 18) });
    const bar = util.el('div', { class: 'palette-bar' }, [icon, input]);
    box.append(bar, listEl);
    overlay.append(box);

    input.addEventListener('input', () => render());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') { event.preventDefault(); run(items[active]); }
      else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
  }

  function open() {
    if (overlay) {
      input.focus();
      input.select();
      return;
    }
    build();
    const root = document.getElementById('palette-root') || document.body;
    root.append(overlay);
    input.value = '';
    render();
    setTimeout(() => input.focus(), 20);
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
  }

  const isOpen = () => !!overlay;

  BP.palette = { open, close, isOpen };
})();
