'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { SEARCH_ENGINES, getEngine } = require('../shared/search-engines');

/** Каналы, которые renderer имеет право слушать (защита от лишнего доступа). */
const ALLOWED_INBOUND = [
  'menu:action',
  'browser:open-url',
  'browser:context-action',
  'settings:changed',
  'downloads:update',
  'window:state',
];

function subscribe(channel, callback) {
  if (!ALLOWED_INBOUND.includes(channel)) {
    throw new Error(`Канал "${channel}" недоступен для подписки`);
  }
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// ── Параметры окна, переданные главным процессом ─────────────────────────
function argValue(prefix) {
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const PARTITION = argValue('--mokomail-partition=') || 'persist:mokomail';
const PROFILE_ID = argValue('--mokomail-profile=') || 'default';
const INCOGNITO = argValue('--mokomail-incognito=') === '1';
const SMOKE = argValue('--mokomail-smoke=') === '1';

contextBridge.exposeInMainWorld('browserAPI', {
  platform: process.platform,
  partition: PARTITION,
  profileId: PROFILE_ID,
  incognito: INCOGNITO,
  smoke: SMOKE,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  searchEngines: SEARCH_ENGINES,
  buildSearchUrl(engineId, query, customUrl) {
    const engine = getEngine(engineId);
    let template = engine.url;
    if (engine.id === 'custom') template = customUrl || engine.url;
    if (!template) return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    return template.replace('%s', encodeURIComponent(query));
  },

  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    setMany: (patch) => ipcRenderer.invoke('settings:set-many', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    openUserData: () => ipcRenderer.invoke('settings:open-user-data'),
    exportFile: () => ipcRenderer.invoke('settings:export-file'),
    importFile: () => ipcRenderer.invoke('settings:import-file'),
  },

  history: {
    add: (entry) => ipcRenderer.invoke('history:add', entry),
    update: (entry) => ipcRenderer.invoke('history:update', entry),
    list: (query, options) => ipcRenderer.invoke('history:list', query, options),
    top: (limit) => ipcRenderer.invoke('history:top', limit),
    stats: () => ipcRenderer.invoke('history:stats'),
    remove: (id) => ipcRenderer.invoke('history:remove', id),
    removeRange: (range) => ipcRenderer.invoke('history:remove-range', range),
    clear: () => ipcRenderer.invoke('history:clear'),
    exportFile: () => ipcRenderer.invoke('history:export'),
    importFile: () => ipcRenderer.invoke('history:import'),
  },

  bookmarks: {
    list: () => ipcRenderer.invoke('bookmarks:list'),
    has: (url) => ipcRenderer.invoke('bookmarks:has', url),
    add: (bookmark) => ipcRenderer.invoke('bookmarks:add', bookmark),
    remove: (id) => ipcRenderer.invoke('bookmarks:remove', id),
    update: (bookmark) => ipcRenderer.invoke('bookmarks:update', bookmark),
    exportFile: () => ipcRenderer.invoke('bookmarks:export'),
    importFile: () => ipcRenderer.invoke('bookmarks:import'),
  },

  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (payload) => ipcRenderer.invoke('profiles:create', payload),
    update: (payload) => ipcRenderer.invoke('profiles:update', payload),
    remove: (id) => ipcRenderer.invoke('profiles:delete', id),
    switch: (id) => ipcRenderer.invoke('profiles:switch', id),
  },

  session: {
    clearData: (options) => ipcRenderer.invoke('session:clear-data', options),
    getRestoreState: () => ipcRenderer.invoke('session:get-restore-state'),
    saveState: (state) => ipcRenderer.invoke('session:save-state', state),
  },

  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    action: (payload) => ipcRenderer.invoke('downloads:action', payload),
    clear: () => ipcRenderer.invoke('downloads:clear'),
  },

  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    setEnabled: (id, enabled) => ipcRenderer.invoke('extensions:set-enabled', { id, enabled }),
    remove: (id) => ipcRenderer.invoke('extensions:remove', id),
    openDir: () => ipcRenderer.invoke('extensions:open-dir'),
    getScripts: (url) => ipcRenderer.invoke('extensions:get-scripts', url),
  },

  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    getSearchEngines: () => ipcRenderer.invoke('app:get-search-engines'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    openPath: (filePath) => ipcRenderer.invoke('app:open-path', filePath),
    showItemInFolder: (filePath) => ipcRenderer.invoke('app:show-item', filePath),
    restart: () => ipcRenderer.invoke('app:restart'),
    quit: () => ipcRenderer.invoke('app:quit'),
    newWindow: (options) => ipcRenderer.invoke('app:new-window', options || {}),
    showSaveDialog: (options) => ipcRenderer.invoke('app:show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('app:show-open-dialog', options),
    showMessage: (options) => ipcRenderer.invoke('app:show-message', options),
    saveScreenshot: (dataUrl, suggestedName) => ipcRenderer.invoke('app:save-screenshot', { dataUrl, suggestedName }),
    suggest: (engineId, query) => ipcRenderer.invoke('app:suggest', { engineId, query }),
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },

  on: subscribe,
});
