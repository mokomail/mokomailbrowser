'use strict';

const fs = require('fs');
const path = require('path');
const Store = require('./store');

/** Палитра цветов для профилей. */
const COLORS = ['#6c8cff', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

/** Идентификатор профиля по умолчанию. */
const DEFAULT_ID = 'default';

/**
 * Профили браузера.
 *
 * Реестр профилей хранится в `userData/profiles.json`, а данные каждого профиля
 * (настройки, история, закладки, сессия) — в отдельной папке
 * `userData/profiles/<id>/`. У каждого профиля свой раздел браузера, поэтому
 * cookie и входы на сайтах тоже раздельные.
 */
class Profiles {
  constructor(userDataDir, requestedId) {
    this.userDataDir = userDataDir;
    this.registry = new Store(path.join(userDataDir, 'profiles.json'), {
      active: DEFAULT_ID,
      items: [{ id: DEFAULT_ID, name: 'Основной', color: COLORS[0], createdAt: Date.now() }],
    });
    this._ensureDefault();
    this.activeId = requestedId && this.exists(requestedId) ? requestedId : this._validId(this.registry.get('active'));
  }

  _ensureDefault() {
    const items = this._items();
    if (!items.some((item) => item.id === DEFAULT_ID)) {
      items.unshift({ id: DEFAULT_ID, name: 'Основной', color: COLORS[0], createdAt: Date.now() });
      this.registry.set('items', items);
    }
  }

  _items() {
    const items = this.registry.get('items', []);
    return Array.isArray(items) ? items : [];
  }

  _validId(id) {
    return this.exists(id) ? id : DEFAULT_ID;
  }

  exists(id) {
    return this._items().some((item) => item.id === id);
  }

  list() {
    return this._items().map((item) => ({ ...item }));
  }

  get(id) {
    return this._items().find((item) => item.id === id) || null;
  }

  active() {
    return this.get(this.activeId) || this.get(DEFAULT_ID);
  }

  /** Папка с данными профиля. */
  dataDir(id) {
    const dir = path.join(this.userDataDir, 'profiles', id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Раздел браузера для профиля (cookie, хранилище). */
  partition(id) {
    return `persist:mokomail-${id}`;
  }

  setActive(id) {
    if (!this.exists(id)) return false;
    this.activeId = id;
    this.registry.set('active', id);
    return true;
  }

  create({ name, color } = {}) {
    const items = this._items();
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const item = {
      id,
      name: (name || '').trim() || `Профиль ${items.length + 1}`,
      color: color || COLORS[items.length % COLORS.length],
      createdAt: Date.now(),
    };
    items.push(item);
    this.registry.set('items', items);
    this.dataDir(id);
    return item;
  }

  update(id, patch = {}) {
    const items = this._items();
    const item = items.find((entry) => entry.id === id);
    if (!item) return null;
    if (typeof patch.name === 'string' && patch.name.trim()) item.name = patch.name.trim();
    if (typeof patch.color === 'string' && patch.color) item.color = patch.color;
    this.registry.set('items', items);
    return item;
  }

  remove(id) {
    if (id === DEFAULT_ID) return false;
    const items = this._items();
    const index = items.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    items.splice(index, 1);
    this.registry.set('items', items);

    // Удаляем папку с данными профиля.
    try {
      fs.rmSync(path.join(this.userDataDir, 'profiles', id), { recursive: true, force: true });
    } catch (error) {
      console.error('[profiles] Не удалось удалить данные профиля:', error);
    }

    if (this.activeId === id) this.setActive(DEFAULT_ID);
    return true;
  }
}

module.exports = { Profiles, COLORS, DEFAULT_ID };
