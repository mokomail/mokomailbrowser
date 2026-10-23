'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Крошечное JSON-хранилище без внешних зависимостей.
 * Устойчиво к повреждённым файлам: при ошибке возвращает значения по умолчанию.
 */
class Store {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.defaults = JSON.parse(JSON.stringify(defaults));
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...this.defaults, ...parsed };
      }
    } catch {
      /* файла нет или он повреждён — используем значения по умолчанию */
    }
    return JSON.parse(JSON.stringify(this.defaults));
  }

  all() {
    return this.data;
  }

  get(key, fallback) {
    if (key === undefined) return this.data;
    const value = this.data[key];
    return value === undefined ? fallback : value;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  merge(patch) {
    Object.assign(this.data, patch || {});
    this.save();
    return this.data;
  }

  reset() {
    this.data = JSON.parse(JSON.stringify(this.defaults));
    this.save();
    return this.data;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[store] Не удалось сохранить файл:', this.filePath, error);
    }
  }
}

module.exports = Store;
