'use strict';

/** Ядро интерфейса: утилиты, состояние, тема, уведомления. */
(function () {
  window.BP = window.BP || {};

  const api = window.browserAPI;

  // ── Состояние ──────────────────────────────────────────────────────────
  const state = {
    settings: {},
    tabs: [],
    tabGroups: [],
    activeTabId: null,
    closedTabs: [],
    downloads: [],
    info: {},
    incognito: false,
    profile: null,
    tabSeq: 0,
    ready: false,
  };

  // ── Утилиты ────────────────────────────────────────────────────────────
  const util = {
    el(tag, attrs = {}, children = []) {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      }
      for (const child of [].concat(children)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
      return node;
    },

    $: (selector, root = document) => root.querySelector(selector),
    $$: (selector, root = document) => [...root.querySelectorAll(selector)],

    debounce(fn, wait = 200) {
      let timer = null;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
      };
    },

    escapeHtml(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return `${value} Б`;
      const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
      let size = value / 1024;
      let index = 0;
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
      }
      return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
    },

    timeAgo(timestamp) {
      const diff = Date.now() - Number(timestamp || 0);
      const minute = 60000;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return 'только что';
      if (diff < hour) return `${Math.floor(diff / minute)} мин назад`;
      if (diff < day) return `${Math.floor(diff / hour)} ч назад`;
      if (diff < 7 * day) return `${Math.floor(diff / day)} дн назад`;
      return new Date(Number(timestamp)).toLocaleDateString('ru-RU');
    },

    formatDate(timestamp) {
      const date = new Date(Number(timestamp) || Date.now());
      return date.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    },

    hostOf(url) {
      try {
        return new URL(url).host;
      } catch {
        return '';
      }
    },

    prettyUrl(url) {
      if (!url) return '';
      return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    },

    isUrlLike(text) {
      const value = String(text || '').trim();
      if (!value || /\s/.test(value)) return false;
      if (/^(https?|file|view-source|chrome|about|data|mailto|ftp):/i.test(value)) return true;
      const host = value.split(/[/?#]/)[0];
      if (/^localhost(:\d+)?$/i.test(host)) return true;
      if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host)) return true;
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:\d+)?$/i.test(host);
    },

    normalizeUrl(text) {
      const value = String(text || '').trim();
      if (/^(https?|file|view-source|chrome|about|data|mailto|ftp):/i.test(value)) return value;
      if (/^localhost(:\d+)?([/?#]|$)/i.test(value) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(value)) {
        return `http://${value}`;
      }
      return `https://${value}`;
    },

    toNavigationUrl(text) {
      const value = String(text || '').trim();
      if (!value) return '';
      if (util.isUrlLike(value)) return util.normalizeUrl(value);
      return api.buildSearchUrl(state.settings.searchEngine, value, state.settings.customSearchUrl);
    },

    colorFor(text) {
      let hash = 0;
      const value = String(text || '?');
      for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 360;
      return `hsl(${hash} 62% 50%)`;
    },

    initialOf(text) {
      const value = String(text || '?').replace(/^www\./i, '').trim();
      const match = value.match(/[a-zа-я0-9]/i);
      return (match ? match[0] : '?').toUpperCase();
    },

    /** Безопасный favicon: либо картинка со страницы, либо буквенный аватар. */
    faviconNode({ favicon, title, url, size = 16 }) {
      if (favicon && /^(https?:|data:)/i.test(favicon)) {
        return util.el('img', { src: favicon, width: size, height: size, alt: '' });
      }
      if (url && /^https?:/i.test(url)) {
        return util.el('span', {
          class: 'avatar-letter',
          style: `width:${size}px;height:${size}px;background:${util.colorFor(util.hostOf(url) || url)};font-size:${Math.round(size * 0.6)}px`,
          text: util.initialOf(util.hostOf(url) || title || url),
        });
      }
      return util.el('span', { html: BP.icons.svg('globe', size) });
    },

    /** Иконка сайта по URL (сервис favicon'ов) — используется на стартовой. */
    faviconFor(url) {
      const host = util.hostOf(url);
      return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : '';
    },

    /**
     * Круглый аватар ссылки: сначала явная иконка (`icon`), затем favicon сайта,
     * и только если картинка не загрузилась — буква. Подходит для быстрых
     * ссылок и плиток «часто посещаемые».
     */
    siteAvatar({ title, url, icon, size = 40 } = {}) {
      const host = util.hostOf(url);
      const fallback = util.initialOf(title || host || url);
      const wrap = util.el('span', {
        class: 'quicklink-avatar',
        style: `background:${util.colorFor(url)}`,
      });
      const src = icon || util.faviconFor(url);
      if (src) {
        const img = util.el('img', { src, alt: '', width: size, height: size, loading: 'lazy', referrerpolicy: 'no-referrer' });
        img.addEventListener('error', () => {
          img.remove();
          if (!wrap.textContent) wrap.textContent = fallback;
        });
        wrap.append(img);
      } else {
        wrap.textContent = fallback;
      }
      return wrap;
    },
  };

  // ── Поисковые системы ──────────────────────────────────────────────────
  const engines = Array.isArray(api.searchEngines) ? api.searchEngines : [];
  const enginesApi = {
    list: engines,
    byId(id) {
      return engines.find((engine) => engine.id === id) || null;
    },
    /** Домашняя страница поисковой системы (или '' для «своей»). */
    homeFor(id) {
      const engine = enginesApi.byId(id);
      return (engine && engine.home) || '';
    },
    /** Является ли адрес домашней страницей одной из поисковых систем. */
    isKnownHome(url) {
      const value = String(url || '').trim();
      return !!value && engines.some((engine) => engine.home && engine.home === value);
    },
    /**
     * Какой адрес домашней страницы выставить при смене поисковика.
     * Меняем только если текущая домашняя страница пустая, совпадает с
     * предыдущим поисковиком или с домашней страницей любой из систем —
     * чтобы не затирать адрес, заданный пользователем вручную.
     */
    homepageFor(engineId, currentHomepage, prevEngineId) {
      const nextHome = enginesApi.homeFor(engineId);
      if (!nextHome) return null;
      const current = String(currentHomepage || '').trim();
      const prevHome = enginesApi.homeFor(prevEngineId);
      if (!current || current === prevHome || enginesApi.isKnownHome(current)) return nextHome;
      return null;
    },
  };

  // ── Тема и внешний вид ─────────────────────────────────────────────────
  const theme = {
    apply() {
      const settings = state.settings;
      let mode = settings.theme;
      if (mode === 'system') {
        mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      const body = document.body;
      body.dataset.theme = mode;
      body.dataset.density = settings.uiDensity || 'comfortable';
      body.dataset.animations = settings.animations === false ? 'off' : 'on';
      body.dataset.incognito = state.incognito ? 'on' : 'off';

      const root = document.documentElement;
      root.style.setProperty('--ui-font', `${settings.baseFontSize || 14}px`);
      const radius = Number(settings.cornerRadius) || 12;
      root.style.setProperty('--radius', `${radius}px`);
      root.style.setProperty('--radius-sm', `${Math.max(4, Math.round(radius * 0.68))}px`);

      // Цветовые роли Material 3 строятся из опорного цвета (seed).
      if (BP.material) BP.material.apply(mode, settings.accentColor || '#6c8cff');
    },
  };

  // ── Уведомления ────────────────────────────────────────────────────────
  function toast(message, type = '') {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const node = util.el('div', { class: `toast ${type}`, text: message });
    root.append(node);
    setTimeout(() => {
      node.style.transition = 'opacity .25s, transform .25s';
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      setTimeout(() => node.remove(), 260);
    }, 2600);
  }

  // ── Настройки ──────────────────────────────────────────────────────────
  const settings = {
    async load() {
      state.settings = await api.settings.getAll();
      theme.apply();
      return state.settings;
    },

    async set(key, value) {
      state.settings[key] = value;
      theme.apply();
      const updated = await api.settings.set(key, value);
      if (updated) state.settings = { ...state.settings, ...updated };
      return state.settings;
    },

    async setMany(patch) {
      Object.assign(state.settings, patch);
      theme.apply();
      const updated = await api.settings.setMany(patch);
      if (updated) state.settings = { ...state.settings, ...updated };
      return state.settings;
    },

    async reset() {
      state.settings = await api.settings.reset();
      theme.apply();
      return state.settings;
    },
  };

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings.theme === 'system') theme.apply();
  });

  BP.util = util;
  BP.state = state;
  BP.theme = theme;
  BP.toast = toast;
  BP.settings = settings;
  BP.engines = enginesApi;
})();
