'use strict';

const { ipcMain, shell, dialog, app, nativeTheme, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { getEngine, SEARCH_ENGINES } = require('../shared/search-engines');
const extensions = require('./extensions');

const HISTORY_LIMIT = 5000; // максимум уникальных адресов
const VISITS_PER_ENTRY = 200; // максимум отметок времени на один адрес

/**
 * Регистрирует все IPC-обработчики обмена между renderer и main.
 * @param {object} ctx
 */
function registerIpc(ctx) {
  const {
    appName,
    profiles,
    profile,
    settingsStore,
    bookmarksStore,
    historyStore,
    sessionStore,
    downloadManager,
    getBrowserSession,
    applySettings,
    getWindow,
    quitApp,
    createWindow,
    rebuildMenu,
  } = ctx;

  /** Количество открытых вкладок по id renderer-процесса (для подтверждения закрытия). */
  const tabCounts = new Map();
  ctx.tabCounts = tabCounts;

  // ── Настройки ──────────────────────────────────────────────────────────
  ipcMain.handle('settings:get-all', () => settingsStore.all());

  ipcMain.handle('settings:set', async (event, { key, value }) => {
    settingsStore.set(key, value);
    await applySettings();
    return settingsStore.all();
  });

  ipcMain.handle('settings:set-many', async (event, patch) => {
    settingsStore.merge(patch);
    await applySettings();
    return settingsStore.all();
  });

  ipcMain.handle('settings:reset', async () => {
    settingsStore.reset();
    await applySettings();
    return settingsStore.all();
  });

  ipcMain.handle('settings:open-user-data', () => shell.openPath(app.getPath('userData')));

  const isValidExtId = (id) => typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id);
  const getExtensionsDirSafe = () => {
    const base = extensions.getDir();
    // ensure base exists
    try { require('fs').mkdirSync(base, { recursive: true }); } catch {}
    return base;
  };
  const resolveExtPath = (id) => {
    if (!isValidExtId(id)) return null;
    const base = getExtensionsDirSafe();
    const p = require('path').resolve(base, id);
    if (!p.startsWith(require('path').resolve(base) + require('path').sep) && p !== require('path').resolve(base)) return null;
    return p;
  };

  // Расширения/плагины
  ipcMain.handle('extensions:list', () => extensions.list());
  ipcMain.handle('extensions:set-enabled', (event, payload) => {
    const id = payload && payload.id;
    const enabled = payload && payload.enabled;
    if (!isValidExtId(id)) return false;
    return extensions.setEnabled(id, enabled);
  });
  ipcMain.handle('extensions:remove', (event, id) => {
    if (!isValidExtId(id)) return false;
    return extensions.remove(id);
  });
  ipcMain.handle('extensions:open-dir', () => shell.openPath(getExtensionsDirSafe()));
  ipcMain.handle('extensions:get-scripts', (event, url) => {
    if (typeof url !== 'string') return [];
    // Простая проверка
    if (!/^https?:\/\//i.test(url)) return [];
    try { return extensions.getScriptsForUrl(url); } catch { return []; }
  });

  // Экспорт текущих настроек профиля в JSON-файл.
  ipcMain.handle('settings:export-file', async (event) => {
    const win = getWindow(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Экспорт настроек',
      defaultPath: path.join(app.getPath('downloads'), `mokomail-settings-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const payload = {
      app: appName || 'MokomailBrowser',
      kind: 'mokomail-settings',
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      settings: settingsStore.all(),
    };
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true, path: result.filePath };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // Импорт настроек из JSON: применяются только известные ключи.
  ipcMain.handle('settings:import-file', async (event) => {
    const win = getWindow(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Импорт настроек',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    try {
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const incoming = raw && typeof raw === 'object' && raw.settings && typeof raw.settings === 'object' ? raw.settings : raw;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return { ok: false, error: 'bad-format' };
      }
      const known = new Set(Object.keys(settingsStore.all()));
      const patch = {};
      let count = 0;
      for (const [key, value] of Object.entries(incoming)) {
        if (!known.has(key)) continue; // игнорируем неизвестные/опасные ключи
        patch[key] = value;
        count += 1;
      }
      if (!count) return { ok: false, error: 'empty' };
      settingsStore.merge(patch);
      await applySettings();
      return { ok: true, count, settings: settingsStore.all() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('app:get-info', () => ({
    name: appName || 'MokomailBrowser',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    profileDir: profile ? profiles.dataDir(profile.id) : '',
    profile: profile ? { id: profile.id, name: profile.name, color: profile.color } : null,
    downloads: app.getPath('downloads'),
    home: app.getPath('home'),
  }));

  ipcMain.handle('app:get-search-engines', () => SEARCH_ENGINES);

  // ── История (полностью в JSON) ─────────────────────────────────────────
  let historySaveTimer = null;
  const historyItems = () => {
    const items = historyStore.get('items', null);
    if (Array.isArray(items)) return items;
    // Первый запуск: создаём «живой» массив в хранилище без немедленной записи.
    const fresh = [];
    historyStore.all().items = fresh;
    return fresh;
  };
  const persistHistory = () => {
    historyStore.all().updatedAt = Date.now();
    historyStore.save();
  };
  const saveHistorySoon = () => {
    clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(persistHistory, 400);
  };
  // Не теряем несохранённые записи при выходе.
  const flushHistory = () => {
    if (historySaveTimer) {
      clearTimeout(historySaveTimer);
      historySaveTimer = null;
      persistHistory();
    }
  };
  require('electron').app.on('before-quit', flushHistory);

  // Глобальный дедуп на уровне main, чтобы защититься от частых вызовов
  let lastHistAddGlobal = { url: '', at: 0 };
  ipcMain.handle('history:add', (event, entry) => {
    if (!entry || !entry.url) return false;
    const now = Date.now();
    // Игнорируем повторы одного и того же URL за последние 5 секунд
    if (lastHistAddGlobal.url === entry.url && now - lastHistAddGlobal.at < 5000) {
      // Но всё же обновим заголовок/иконку, если пришли
      const itemsQuick = historyItems();
      const t2 = itemsQuick.find((item) => item.url === entry.url);
      if (t2) {
        if (entry.title) t2.title = entry.title;
        if (entry.favicon) t2.favicon = entry.favicon;
        saveHistorySoon();
      }
      return true;
    }
    const items = historyItems();
    const target = items.find((item) => item.url === entry.url);

    if (target) {
      target.lastVisitAt = now;
      target.visitCount = (Number(target.visitCount) || 1) + 1;
      if (entry.title) target.title = entry.title;
      if (entry.favicon) target.favicon = entry.favicon;
      if (Array.isArray(target.visits)) {
        target.visits.unshift(now);
        if (target.visits.length > VISITS_PER_ENTRY) target.visits.length = VISITS_PER_ENTRY;
      } else {
        target.visits = [now];
      }
      // Перемещаем в начало, не создаём дубликат
      const idx = items.indexOf(target);
      if (idx > 0) {
        items.splice(idx, 1);
        items.unshift(target);
      }
      saveHistorySoon();
      lastHistAddGlobal = { url: entry.url, at: now };
      return true;
    }

    lastHistAddGlobal = { url: entry.url, at: now };
    saveHistorySoon();
    return true;
  });

  ipcMain.handle('history:update', (event, { url, title, favicon }) => {
    const items = historyItems();
    const target = items.find((item) => item.url === url);
    if (target) {
      if (title) target.title = title;
      if (favicon) target.favicon = favicon;
      saveHistorySoon();
    }
    return true;
  });

  ipcMain.handle('history:list', (event, query = '', options = {}) => {
    const items = historyItems();
    const q = String(query || '').trim().toLowerCase();
    let result = items;
    if (q) {
      result = result.filter(
        (item) => item.url.toLowerCase().includes(q) || (item.title || '').toLowerCase().includes(q)
      );
    }
    const order = options && options.order === 'visits' ? 'visits' : 'recent';
    result = [...result].sort((a, b) =>
      order === 'visits'
        ? (b.visitCount || 0) - (a.visitCount || 0)
        : (b.lastVisitAt || b.visitedAt || 0) - (a.lastVisitAt || a.visitedAt || 0)
    );
    const limit = Number(options && options.limit) > 0 ? Number(options.limit) : 500;
    return result.slice(0, limit);
  });

  ipcMain.handle('history:top', (event, limit = 8) => {
    const items = historyItems();
    return [...items]
      .filter((item) => /^https?:/i.test(item.url))
      .sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0) || (b.lastVisitAt || 0) - (a.lastVisitAt || 0))
      .slice(0, Math.max(1, Number(limit) || 8));
  });

  ipcMain.handle('history:stats', () => {
    const items = historyItems();
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 86400000;
    let totalVisits = 0;
    let today = 0;
    let week = 0;
    for (const item of items) {
      const count = Number(item.visitCount) || 1;
      totalVisits += count;
      const last = Number(item.lastVisitAt || item.visitedAt) || 0;
      if (last >= dayStart) today += count;
      if (last >= weekStart) week += count;
    }
    return { addresses: items.length, totalVisits, today, week, updatedAt: historyStore.get('updatedAt', 0) };
  });

  ipcMain.handle('history:remove', (event, id) => {
    const items = historyItems().filter((item) => item.id !== id);
    historyStore.set('items', items);
    persistHistory();
    return true;
  });

  ipcMain.handle('history:remove-range', (event, { from, to } = {}) => {
    const start = Number(from) || 0;
    const end = Number(to) || Date.now();
    const items = historyItems().filter((item) => {
      const last = Number(item.lastVisitAt || item.visitedAt) || 0;
      return last < start || last > end;
    });
    historyStore.set('items', items);
    persistHistory();
    return items.length;
  });

  ipcMain.handle('history:clear', () => {
    historyStore.set('items', []);
    persistHistory();
    return true;
  });

  ipcMain.handle('history:export', async (event) => {
    const win = getWindow(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Экспорт истории',
      defaultPath: path.join(app.getPath('downloads'), `mokomail-history-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const payload = {
      app: appName || 'MokomailBrowser',
      profile: profile ? profile.id : 'default',
      exportedAt: new Date().toISOString(),
      items: historyItems(),
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: result.filePath, count: payload.items.length };
  });

  ipcMain.handle('history:import', async (event) => {
    const win = getWindow(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Импорт истории',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    try {
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const incoming = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      if (!Array.isArray(incoming)) return { ok: false, error: 'bad-format' };
      const items = historyItems();
      let added = 0;
      for (const entry of incoming) {
        if (!entry || typeof entry !== 'object') continue;
        const url = typeof entry.url === 'string' ? entry.url.trim() : '';
        if (!url) continue;
        if (!/^https?:\/\//i.test(url) && !url.startsWith('file:')) continue;
        const target = items.find((item) => item.url === url);
        const at = Number(entry.lastVisitAt || entry.visitedAt) > 0 ? Number(entry.lastVisitAt || entry.visitedAt) : Date.now();
        if (target) {
          target.visitCount = (Number(target.visitCount) || 1) + (Number(entry.visitCount) || 1);
          target.lastVisitAt = Math.max(Number(target.lastVisitAt) || 0, at);
          if (typeof entry.title === 'string' && entry.title.trim()) target.title = entry.title.trim();
          if (typeof entry.favicon === 'string') target.favicon = entry.favicon;
        } else {
          items.unshift({
            id: (typeof entry.id === 'string' && entry.id) || `h_${at}_${Math.random().toString(36).slice(2, 8)}`,
            url,
            title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : url,
            favicon: typeof entry.favicon === 'string' ? entry.favicon : '',
            firstVisitAt: Number(entry.firstVisitAt) > 0 ? Number(entry.firstVisitAt) : at,
            lastVisitAt: at,
            visitCount: Number(entry.visitCount) > 0 ? Number(entry.visitCount) : 1,
            visits: Array.isArray(entry.visits) ? entry.visits.filter((v) => typeof v === 'number').slice(0, VISITS_PER_ENTRY) : [at],
          });
          added += 1;
        }
      }
      if (items.length > HISTORY_LIMIT) items.length = HISTORY_LIMIT;
      historyStore.set('items', items);
      persistHistory();
      return { ok: true, added, total: items.length };
    } catch (error) {
      console.error('[history] Не удалось импортировать:', error);
      return { ok: false, error: String(error) };
    }
  });

  // ── Профили ────────────────────────────────────────────────────────────
  ipcMain.handle('profiles:list', () => ({ active: profiles.activeId, items: profiles.list() }));

  ipcMain.handle('profiles:create', (event, payload) => {
    const item = profiles.create(payload || {});
    if (rebuildMenu) rebuildMenu();
    return { item, active: profiles.activeId, items: profiles.list() };
  });

  ipcMain.handle('profiles:update', (event, { id, name, color }) => {
    profiles.update(id, { name, color });
    if (rebuildMenu) rebuildMenu();
    return { active: profiles.activeId, items: profiles.list() };
  });

  ipcMain.handle('profiles:delete', (event, id) => {
    const ok = profiles.remove(id);
    if (rebuildMenu) rebuildMenu();
    return { ok, active: profiles.activeId, items: profiles.list() };
  });

  ipcMain.handle('profiles:switch', (event, id) => {
    if (!profiles.setActive(id)) return false;
    relaunchWithProfile(id);
    return true;
  });

  // ── Закладки ───────────────────────────────────────────────────────────
  ipcMain.handle('bookmarks:list', () => bookmarksStore.get('items', []));

  ipcMain.handle('bookmarks:has', (event, url) =>
    bookmarksStore.get('items', []).some((item) => item.url === url)
  );

  ipcMain.handle('bookmarks:add', (event, bookmark) => {
    const items = bookmarksStore.get('items', []);
    if (items.some((item) => item.url === bookmark.url)) return items;
    items.push({
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: bookmark.title || bookmark.url,
      url: bookmark.url,
      favicon: bookmark.favicon || '',
      createdAt: Date.now(),
    });
    bookmarksStore.set('items', items);
    return items;
  });

  ipcMain.handle('bookmarks:remove', (event, id) => {
    const items = bookmarksStore.get('items', []).filter((item) => item.id !== id);
    bookmarksStore.set('items', items);
    return items;
  });

  ipcMain.handle('bookmarks:update', (event, { id, title, url }) => {
    const items = bookmarksStore.get('items', []);
    const target = items.find((item) => item.id === id);
    if (target) {
      if (typeof title === 'string' && title.trim()) target.title = title.trim();
      if (typeof url === 'string' && url.trim()) target.url = url.trim();
      bookmarksStore.set('items', items);
    }
    return items;
  });

  ipcMain.handle('bookmarks:export', async (event) => {
    const win = getWindow(event.sender);
    const items = bookmarksStore.get('items', []);
    const result = await dialog.showSaveDialog(win, {
      title: 'Экспорт закладок',
      defaultPath: path.join(app.getPath('downloads'), `mokomail-bookmarks-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    const payload = {
      app: appName || 'MokomailBrowser',
      profile: profile ? profile.id : 'default',
      exportedAt: new Date().toISOString(),
      items,
    };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: result.filePath, count: items.length };
  });

  ipcMain.handle('bookmarks:import', async (event) => {
    const win = getWindow(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Импорт закладок',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    try {
      const raw = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      const incoming = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : [];
      if (!Array.isArray(incoming)) return { ok: false, error: 'bad-format' };
      const items = bookmarksStore.get('items', []);
      let added = 0;
      for (const entry of incoming) {
        if (!entry || typeof entry !== 'object') continue;
        const url = typeof entry.url === 'string' ? entry.url.trim() : '';
        if (!url) continue;
        if (!/^https?:\/\//i.test(url) && !url.startsWith('file:')) continue;
        if (items.some((item) => item.url === url)) continue;
        items.push({
          id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : url,
          url,
          favicon: typeof entry.favicon === 'string' ? entry.favicon : '',
          createdAt: Number(entry.createdAt) > 0 ? Number(entry.createdAt) : Date.now(),
        });
        added += 1;
      }
      bookmarksStore.set('items', items);
      return { ok: true, added, total: items.length };
    } catch (error) {
      console.error('[bookmarks] Не удалось импортировать:', error);
      return { ok: false, error: String(error) };
    }
  });

  // ── Сессия: очистка данных, восстановление вкладок ─────────────────────
  ipcMain.handle('session:clear-data', async (event, options = {}) => {
    if (!options || typeof options !== 'object') return [];
    const ses = getBrowserSession();
    const done = [];
    try {
      if (options.cache) {
        await ses.clearCache();
        done.push('cache');
      }
      if (options.cookies) {
        await ses.clearStorageData({ storages: ['cookies'] });
        done.push('cookies');
      }
      if (options.storage) {
        await ses.clearStorageData({
          storages: ['localstorage', 'indexdb', 'websql', 'shadercache', 'serviceworkers', 'cachestorage', 'filesystem'],
        });
        done.push('storage');
      }
    } catch (e) {
      // continue
    }
    if (options.history) {
      try {
        // Если задан период (since) — удаляем только записи за этот промежуток.
        const since = Number(options.since) || 0;
        if (since > 0) {
          const kept = historyItems().filter((item) => (Number(item.lastVisitAt) || 0) < since);
          historyStore.set('items', kept);
        } else {
          historyStore.set('items', []);
        }
        persistHistory();
        done.push('history');
      } catch (e) {}
    }
    if (options.downloads) {
      try {
        // «Загрузки» — это только список файлов, а не данные сайтов
        if (downloadManager) downloadManager.clearFinished();
        done.push('downloads');
      } catch (e) {}
    }
    return done;
  });

  ipcMain.handle('session:get-restore-state', () => {
    const settings = settingsStore.all();
    // Восстановление возможно только если пользователь просил открывать
    // прошлую сессию и не отключал её запоминание.
    if (settings.startupBehavior !== 'restore') return null;
    if (settings.restoreLastSession === false) return null;
    return sessionStore.get('state', null);
  });

  ipcMain.handle('session:save-state', (event, state) => {
    // Число вкладок нужно для подтверждения закрытия окна — его сохраняем
    // всегда, а сам список вкладок только если запоминание включено.
    tabCounts.set(event.sender.id, Number(state?.tabCount) || 0);
    // Инкогнито не должно затирать сохранённую обычную сессию.
    if (state && state.incognito) return true;
    if (settingsStore.get('restoreLastSession', true) === false) return true;
    sessionStore.set('state', {
      tabs: Array.isArray(state?.tabs) ? state.tabs.slice(0, 100) : [],
      groups: Array.isArray(state?.groups) ? state.groups.slice(0, 50) : [],
      activeIndex: Number.isInteger(state?.activeIndex) ? state.activeIndex : 0,
      savedAt: Date.now(),
    });
    return true;
  });

  // ── Окно ───────────────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', (event) => {
    const win = getWindow(event.sender);
    if (win) win.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = getWindow(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle('window:close', (event) => {
    const win = getWindow(event.sender);
    if (win) win.close();
  });

  ipcMain.handle('window:is-maximized', (event) => {
    const win = getWindow(event.sender);
    return win ? win.isMaximized() : false;
  });

  // ── Загрузки ───────────────────────────────────────────────────────────
  ipcMain.handle('downloads:list', () => (downloadManager ? downloadManager.list() : []));
  ipcMain.handle('downloads:action', (event, payload) => {
    if (downloadManager) downloadManager.action(payload);
    return true;
  });
  ipcMain.handle('downloads:clear', () => {
    if (downloadManager) downloadManager.clearFinished();
    return true;
  });

  // ── Система ────────────────────────────────────────────────────────────
  ipcMain.handle('app:open-external', (event, url) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return true;
  });

  ipcMain.handle('app:show-item', (event, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle('app:open-path', (event, filePath) => shell.openPath(filePath));

  ipcMain.handle('app:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:quit', () => quitApp());

  ipcMain.handle('app:new-window', (event, options = {}) => {
    createWindow({ incognito: !!(options && options.incognito) });
    return true;
  });

  ipcMain.handle('app:show-save-dialog', (event, options = {}) =>
    dialog.showSaveDialog(getWindow(event.sender), options)
  );

  ipcMain.handle('app:show-open-dialog', (event, options = {}) =>
    dialog.showOpenDialog(getWindow(event.sender), options)
  );

  ipcMain.handle('app:show-message', (event, options = {}) =>
    dialog.showMessageBox(getWindow(event.sender), options)
  );

  // Сохранение снимка страницы (data URL → PNG-файл).
  ipcMain.handle('app:save-screenshot', async (event, { dataUrl, suggestedName } = {}) => {
    const win = getWindow(event.sender);
    const base64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
    if (!base64) return { ok: false };
    const safeName = String(suggestedName || '').replace(/[\\/:*?"<>|]+/g, '_') || `mokomail-${Date.now()}.png`;
    const result = await dialog.showSaveDialog(win, {
      title: 'Сохранить снимок страницы',
      defaultPath: path.join(app.getPath('downloads'), safeName),
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
      return { ok: true, path: result.filePath };
    } catch (error) {
      console.error('[screenshot] Не удалось сохранить снимок:', error);
      return { ok: false, error: String(error) };
    }
  });

  // Подсказки поиска
  ipcMain.handle('app:suggest', async (event, { engineId, query }) => {
    const text = String(query || '').trim();
    if (!text) return [];
    const engine = getEngine(engineId);
    if (!engine.suggest) return [];
    const url = engine.suggest.replace('%s', encodeURIComponent(text));
    try {
      const response = await net.fetch(url, {
        headers: { 'User-Agent': app.userAgentFallback, Accept: 'application/json, text/plain, */*' },
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return [];
      }
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1].slice(0, 8);
      }
      if (Array.isArray(data)) {
        return data
          .map((item) => (typeof item === 'string' ? item : item?.phrase))
          .filter((item) => typeof item === 'string')
          .slice(0, 8);
      }
      return [];
    } catch {
      return [];
    }
  });
}

/** Перезапускает приложение с выбранным профилем. */
function relaunchWithProfile(id) {
  const args = process.argv
    .slice(1)
    .filter((value) => !value.startsWith('--profile=') && !value.startsWith('--mokomail-'));
  args.push(`--profile=${id}`);
  app.relaunch({ args });
  app.exit(0);
}

module.exports = registerIpc;
