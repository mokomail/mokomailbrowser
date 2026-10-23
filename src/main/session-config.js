'use strict';

const { session, app } = require('electron');

/**
 * Управление сессиями (разделами) браузера.
 *
 * Каждая сессия соответствует своему разделу (`partition`):
 *  • основной профиль — постоянный раздел `persist:mokomail-<профиль>`;
 *  • режим инкогнито — раздел без префикса `persist:` (данные только в памяти).
 *
 * Ко всем разделам применяются одни и те же настройки: User-Agent, прокси,
 * блокировка изображений и заголовки «Do Not Track».
 */

const DEFAULT_PARTITION = 'persist:mokomail';
let primaryPartition = DEFAULT_PARTITION;

let defaultUserAgent = null;
let settingsRef = () => ({});

const managed = new Set(); // разделы, к которым применяются настройки
const handled = new Set(); // разделы, где уже установлены обработчики webRequest

function getDefaultUserAgent() {
  if (defaultUserAgent == null) defaultUserAgent = app.userAgentFallback;
  return defaultUserAgent;
}

function setPrimaryPartition(partition) {
  primaryPartition = partition || DEFAULT_PARTITION;
  return primaryPartition;
}

function getPrimaryPartition() {
  return primaryPartition;
}

function getSessionForPartition(partition) {
  return session.fromPartition(partition);
}

function getBrowserSession() {
  return session.fromPartition(primaryPartition);
}

function installHandlers(ses) {
  if (handled.has(ses)) return;
  handled.add(ses);

  // Блокировка изображений (по желанию пользователя).
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const settings = settingsRef();
    if (settings.blockImages && details.resourceType === 'image') {
      return callback({ cancel: true });
    }
    return callback({});
  });

  // Заголовки Do Not Track.
  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const settings = settingsRef();
    if (settings.doNotTrack) {
      details.requestHeaders.DNT = '1';
      details.requestHeaders['Sec-GPC'] = '1';
    }
    return callback({ requestHeaders: details.requestHeaders });
  });
}

/**
 * Регистрирует раздел и применяет к нему текущие настройки.
 * @param {string} partition
 * @returns {Electron.Session}
 */
function ensureSession(partition) {
  const ses = session.fromPartition(partition);
  installHandlers(ses);
  managed.add(ses);
  return ses;
}

function buildProxy(settings) {
  if (settings.proxyMode === 'direct') return { mode: 'direct' };
  if (settings.proxyMode === 'manual') {
    return {
      mode: 'fixed_servers',
      proxyRules: settings.proxyRules || '',
      proxyBypassRules: settings.proxyBypass || '',
    };
  }
  return { mode: 'system' };
}

/**
 * Применяет настройки ко всем зарегистрированным разделам.
 * @param {() => object} getSettings функция, возвращающая актуальные настройки
 */
async function applySessionSettings(getSettings) {
  settingsRef = typeof getSettings === 'function' ? getSettings : () => getSettings || {};
  const settings = settingsRef();

  const customUa = (settings.customUserAgent || '').trim();
  app.userAgentFallback = customUa || getDefaultUserAgent();
  const userAgent = app.userAgentFallback;

  const proxy = buildProxy(settings);
  for (const ses of managed) {
    // Применяем User-Agent к разделу, чтобы настройка действовала без
    // перезапуска (затрагивает новые запросы открытых вкладок).
    try {
      await ses.setUserAgent(userAgent);
    } catch (error) {
      console.error('[session] Не удалось применить User-Agent:', error);
    }
    try {
      await ses.setProxy(proxy);
    } catch (error) {
      console.error('[session] Не удалось применить прокси:', error);
    }
  }
}

module.exports = {
  DEFAULT_PARTITION,
  setPrimaryPartition,
  getPrimaryPartition,
  getSessionForPartition,
  ensureSession,
  getBrowserSession,
  applySessionSettings,
};
