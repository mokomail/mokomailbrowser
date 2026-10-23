'use strict';

const { app, BrowserWindow, shell, nativeTheme, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const Store = require('./store');
const defaultSettings = require('./settings-defaults');
const {
  applySessionSettings,
  getBrowserSession,
  ensureSession,
  setPrimaryPartition,
  getPrimaryPartition,
} = require('./session-config');
const { Profiles } = require('./profiles');
const { attachContextMenu } = require('./context-menu');
const { createApplicationMenu } = require('./menu');
const DownloadManager = require('./downloads');
const registerIpc = require('./ipc');

// ── Имя бренда ───────────────────────────────────────────────────────────
const APP_NAME = 'MokomailBrowser';
app.setName(APP_NAME);
app.setAppUserModelId('com.mokomail.browser');

// ── Определение профиля из аргументов командной строки ──────────────────
function argValue(prefix) {
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const USER_DATA = app.getPath('userData');
const profiles = new Profiles(USER_DATA, argValue('--profile='));
const PROFILE = profiles.active();
const PROFILE_DIR = profiles.dataDir(PROFILE.id);

setPrimaryPartition(profiles.partition(PROFILE.id));

// ── Хранилища (в папке активного профиля) ────────────────────────────────
const settingsStore = new Store(path.join(PROFILE_DIR, 'settings.json'), defaultSettings);
const bookmarksStore = new Store(path.join(PROFILE_DIR, 'bookmarks.json'), { items: [] });
const historyStore = new Store(path.join(PROFILE_DIR, 'history.json'), { items: [], updatedAt: 0 });
const sessionStore = new Store(path.join(PROFILE_DIR, 'session.json'), { state: null });

// Аппаратное ускорение можно отключить только до события ready.
if (settingsStore.get('hardwareAcceleration') === false) {
  app.disableHardwareAcceleration();
}

const windows = new Set();
let downloadManager = null;
let quitting = false;
let incognitoSeq = 0;

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const PRELOAD = path.join(__dirname, '..', 'preload', 'preload.js');
const ICON = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');

/** Отправить сообщение во все окна. */
function broadcast(channel, payload) {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function getWindowFromSender(sender) {
  return BrowserWindow.fromWebContents(sender) || BrowserWindow.getFocusedWindow() || [...windows][0] || null;
}

function getFocusedWindow() {
  return BrowserWindow.getFocusedWindow() || [...windows][0] || null;
}

/** Отправить сообщение только в одно окно (избегаем дублей при нескольких окнах). */
function sendToWindow(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Окно, которому принадлежит представление (webview). */
function windowOfWebContents(contents) {
  const host = contents && contents.hostWebContents;
  return (host && BrowserWindow.fromWebContents(host)) || null;
}

// ── Создание окна ────────────────────────────────────────────────────────
function createWindow(options = {}) {
  const incognito = options.incognito === true;
  let partition = getPrimaryPartition();
  let title = APP_NAME;

  if (incognito) {
    incognitoSeq += 1;
    partition = `mokomail-incognito-${Date.now().toString(36)}-${incognitoSeq}`;
    // Подключаем раздел инкогнито к менеджеру загрузок, иначе загрузки в
    // приватном окне не отслеживались и не предлагали выбор папки.
    const incognitoSession = ensureSession(partition);
    if (ipcCtx.attachDownloads) ipcCtx.attachDownloads(incognitoSession);
    applySessionSettings(() => settingsStore.all()).catch(() => {});
    title = `${APP_NAME} — Инкогнито`;
  }

  // Подгоняем размер окна под экран: на маленьких мониторах не вылезаем
  // за рабочую область, а минимальные размеры позволяют ужать окно.
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = Math.max(420, Math.min(1280, workArea.width - 40));
  const winHeight = Math.max(380, Math.min(820, workArea.height - 40));

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 420,
    minHeight: 380,
    show: false,
    frame: false,
    backgroundColor: incognito ? '#1d1b2b' : '#1b1d23',
    title,
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: true,
      additionalArguments: [
        `--mokomail-partition=${partition}`,
        `--mokomail-profile=${PROFILE.id}`,
        incognito ? '--mokomail-incognito=1' : '--mokomail-incognito=0',
        `--mokomail-smoke=${process.argv.includes('--smoketest') ? '1' : '0'}`,
      ],
    },
  });

  windows.add(win);
  const wcId = win.webContents.id;
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => !win.isDestroyed() && win.webContents.send('window:state', { maximized: true }));
  win.on('unmaximize', () => !win.isDestroyed() && win.webContents.send('window:state', { maximized: false }));

  win.on('close', (event) => {
    try {
      const settings = settingsStore.all();
      const count = (ipcCtx.tabCounts && ipcCtx.tabCounts.get(wcId)) || 0;
      if (settings.confirmCloseWindow && settings.warnOnClosingMultipleTabs && count > 1) {
        const choice = dialog.showMessageBoxSync(win, {
          type: 'question',
          buttons: ['Закрыть все вкладки', 'Отмена'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
          title: 'Закрыть браузер?',
          message: `Открыто вкладок: ${count}`,
          detail: 'Вы действительно хотите закрыть окно и все вкладки?',
        });
        if (choice === 1) {
          event.preventDefault();
          return;
        }
      }
    } catch (e) {
      // не блокируем закрытие при ошибке
    }
    if (ipcCtx.tabCounts) ipcCtx.tabCounts.delete(wcId);
    windows.delete(win);
  });

  win.on('closed', () => {
    if (ipcCtx.tabCounts) ipcCtx.tabCounts.delete(wcId);
    windows.delete(win);
  });

  return win;
}

// ── Контекст для IPC ─────────────────────────────────────────────────────
const ipcCtx = {
  appName: APP_NAME,
  profiles,
  profile: PROFILE,
  settingsStore,
  bookmarksStore,
  historyStore,
  sessionStore,
  downloadManager: null,
  getBrowserSession,
  getWindow: getWindowFromSender,
  createWindow,
  quitApp: () => app.quit(),
  applySettings: async () => {
    nativeTheme.themeSource = settingsStore.get('theme', 'dark');
    await applySessionSettings(() => settingsStore.all());
    broadcast('settings:changed', settingsStore.all());
  },
};

/** Пересобирает строку меню (например, после изменения профилей). */
function buildMenu() {
  createApplicationMenu({
    appName: APP_NAME,
    // Команды меню должны попадать только в активное окно, иначе при двух
    // открытых окнах одно нажатие открывало бы вкладку в каждом.
    send: (channel, payload) => sendToWindow(getFocusedWindow(), channel, payload),
    createWindow,
    createIncognitoWindow: () => createWindow({ incognito: true }),
    quit: () => app.quit(),
    openUserData: () => shell.openPath(app.getPath('userData')),
    resetSettings: async () => {
      settingsStore.reset();
      nativeTheme.themeSource = settingsStore.get('theme', 'dark');
      await applySessionSettings(() => settingsStore.all());
      broadcast('settings:changed', settingsStore.all());
    },
    getWindow: getFocusedWindow,
    profiles,
    activeProfile: profiles.active(),
  });
}

ipcCtx.rebuildMenu = buildMenu;

// ── Готовность приложения ────────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureSession(getPrimaryPartition());
  nativeTheme.themeSource = settingsStore.get('theme', 'dark');
  await applySessionSettings(() => settingsStore.all());

  downloadManager = new DownloadManager({
    getSettings: () => settingsStore.all(),
    send: broadcast,
    getWindow: getFocusedWindow,
  });
  downloadManager.attach(getBrowserSession());
  ipcCtx.downloadManager = downloadManager;
  ipcCtx.attachDownloads = (ses) => downloadManager.attach(ses);

  registerIpc(ipcCtx);

  buildMenu();

  createWindow();

  if (process.argv.includes('--smoketest')) runSmokeTest();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('Ошибка запуска приложения:', error);
  app.exit(1);
});

/**
 * Короткая самопроверка: запускает окно, ждёт загрузку интерфейса и выходит.
 * Полезно, чтобы убедиться, что приложение стартует без ошибок.
 */
function runSmokeTest() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('SMOKETEST_FAIL: окно не создано');
    app.exit(1);
    return;
  }
  const wc = win.webContents;
  let finished = false;
  const finish = (code, label) => {
    if (finished) return;
    finished = true;
    console.log(label);
    setTimeout(() => app.exit(code), 300);
  };

  wc.on('console-message', (...args) => {
    const payload = args.find((item) => item && typeof item === 'object' && 'message' in item);
    if (payload) {
      console.log(`[renderer:${payload.level}] ${payload.message}${payload.sourceId ? ` (${payload.sourceId}:${payload.lineNumber})` : ''}`);
    } else {
      console.log('[renderer]', args.slice(1).join(' '));
    }
  });

  wc.on('render-process-gone', (event, details) => {
    console.log('SMOKETEST_RENDER_GONE', JSON.stringify(details));
    finish(1, 'SMOKETEST_FAIL');
  });

  wc.on('did-fail-load', (event, code, description) => {
    console.log('SMOKETEST_DID_FAIL_LOAD', code, description);
  });

  wc.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const summary = await wc.executeJavaScript(
          `JSON.stringify({
             ready: !!(window.BP && BP.state && BP.state.ready),
             tabs: window.BP && BP.state ? BP.state.tabs.length : -1,
             activeMode: document.getElementById('content') ? document.getElementById('content').dataset.mode : null,
             settingsCount: window.BP && BP.state ? Object.keys(BP.state.settings || {}).length : -1,
             groups: window.BP && BP.state ? (BP.state.tabGroups || []).length : -1,
             profile: window.BP && BP.state && BP.state.info ? BP.state.info.profile : null,
             incognito: !!(window.BP && BP.state && BP.state.incognito),
             bookmarksBar: !!document.querySelector('#bookmarks-bar'),
             quickLinks: document.querySelectorAll('.quicklink').length,
             errors: window.__bpErrors || []
           })`
        );
        console.log('SMOKETEST_STATE', summary);

        const docsDir = path.join(__dirname, '..', '..', 'docs');
        // Скриншоты пишутся только в исходном дереве: в собранном приложении
        // папки `docs` рядом нет (файлы лежат внутри app.asar).
        const shoot = async (name) => {
          if (app.isPackaged || docsDir.includes('app.asar')) return `${name}:skip`;
          try {
            const image = await wc.capturePage();
            fs.mkdirSync(docsDir, { recursive: true });
            fs.writeFileSync(path.join(docsDir, name), image.toPNG());
            return name;
          } catch (error) {
            return `${name}:error:${error.message || error}`;
          }
        };

        const shots = [];
        shots.push(await shoot('preview-newtab.png'));
        await wc.executeJavaScript(`BP.panels.openSettings('appearance')`);
        await new Promise((resolve) => setTimeout(resolve, 700));
        shots.push(await shoot('preview-settings.png'));
        await wc.executeJavaScript(`BP.panels.closeTopModal(); BP.panels.openMainMenu(document.getElementById('btn-menu'));`);
        await new Promise((resolve) => setTimeout(resolve, 400));
        shots.push(await shoot('preview-menu.png'));
        await wc.executeJavaScript(`BP.panels.hideMenu()`);
        const webviewCheck = await wc.executeJavaScript(
          `(async () => {
             const tab = BP.tabs.create({ url: 'data:text/html,<title>SmokeTest</title><h1 style="font:600 44px sans-serif;padding:40px">ok</h1>' });
             const failures = [];
             if (tab.webview) tab.webview.addEventListener('did-fail-load', (event) => failures.push(event.errorCode + ':' + event.errorDescription));
             const t0 = performance.now();
             let firstCommitMs = null;
             // Ждём фактического начала загрузки: на медленных машинах первый
             // гостевой процесс Chromium может запускаться несколько секунд.
             for (let i = 0; i < 50; i += 1) {
               let u = '';
               try { u = tab.webview ? tab.webview.getURL() : ''; } catch { u = ''; }
               if (u) { firstCommitMs = Math.round(performance.now() - t0); break; }
               await new Promise((resolve) => setTimeout(resolve, 150));
             }
             await new Promise((resolve) => setTimeout(resolve, 400));
             const rect = tab.webview.getBoundingClientRect();
             const style = tab.viewEl ? getComputedStyle(tab.viewEl) : null;
             return JSON.stringify({
               url: tab.webview ? tab.webview.getURL() : null,
               firstCommitMs,
               failures,
               title: tab.title,
               mode: document.getElementById('content').dataset.mode,
               viewActive: tab.viewEl ? tab.viewEl.classList.contains('active') : null,
               visibility: style ? style.visibility : null,
               width: Math.round(rect.width),
               height: Math.round(rect.height)
             });
           })()`
        );
        console.log('SMOKETEST_WEBVIEW', webviewCheck);
        shots.push(await shoot('preview-page.png'));

        const netCheck = await wc.executeJavaScript(
          `(async () => {
             const failures = [];
             const tab = BP.tabs.create({ url: 'https://example.com/' });
             tab.webview.addEventListener('did-fail-load', (event) => failures.push(event.errorCode + ':' + event.errorDescription));
             const t0 = performance.now();
             let firstCommitMs = null;
             for (let i = 0; i < 80; i += 1) {
               let u = '';
               try { u = tab.webview.getURL(); } catch { u = ''; }
               if (u && u.indexOf('example.com') !== -1) { firstCommitMs = Math.round(performance.now() - t0); break; }
               await new Promise((resolve) => setTimeout(resolve, 150));
             }
             await new Promise((resolve) => setTimeout(resolve, 1500));
             let text = null;
             try { text = await tab.webview.executeJavaScript('document.body ? document.body.innerText.slice(0, 70) : null'); } catch (error) { text = 'exec-error: ' + String(error); }
             return JSON.stringify({ url: tab.webview.getURL(), title: tab.title, firstCommitMs, failures, text });
           })()`
        );
        console.log('SMOKETEST_NETWORK', netCheck);
        shots.push(await shoot('preview-site.png'));

        // ── Группы вкладок и панель плагинов ──────────────────────────────
        const layoutCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               const t1 = BP.tabs.create({ url: 'data:text/html,<title>Группа A</title><h1>A</h1>', activate: false, background: true });
               const t2 = BP.tabs.create({ url: 'data:text/html,<title>Группа B</title><h1>B</h1>', activate: false, background: true });
               const group = BP.tabs.createGroup('Рабочие');
               BP.tabs.assignToGroup(t1.id, group.id);
               BP.tabs.assignToGroup(t2.id, group.id);
               BP.tabs.renderStrip();
               out.groups = (BP.state.tabGroups || []).length;
               out.groupHeaders = document.querySelectorAll('.tab-group').length;
               out.groupedTabs = document.querySelectorAll('.tab.grouped').length;
               BP.tabs.toggleGroupCollapsed(group.id);
               out.tabsVisibleWhenCollapsed = document.querySelectorAll('#tabs .tab[data-tab="' + t1.id + '"]').length;
               BP.tabs.toggleGroupCollapsed(group.id);
               BP.panels.openExtensions();
               await new Promise((resolve) => setTimeout(resolve, 300));
               out.pluginsPanel = !!document.querySelector('.overlay .list');
               out.pluginsTitle = document.querySelector('.modal-head h2') ? document.querySelector('.modal-head h2').textContent : null;
               out.pluginsEmpty = !!document.querySelector('.list-empty');
               BP.panels.closeTopModal();
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_LAYOUT', layoutCheck);
        shots.push(await shoot('preview-groups.png'));

        // ── Первоначальная настройка (мастер первого запуска) ───────────────
        const onboardingCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               BP.onboarding.start();
               await new Promise((resolve) => setTimeout(resolve, 400));
               out.open = !!document.querySelector('.onboarding');
               out.steps = document.querySelectorAll('.onboarding-dot').length;
               out.title = document.querySelector('.onboarding-title') ? document.querySelector('.onboarding-title').textContent : null;
               out.swatches = document.querySelectorAll('.onboarding-swatch').length;
               const a = BP.material.scheme('#5b6bff').light.primary;
               const b = BP.material.scheme('#e0518a').light.primary;
               out.accentChanges = a !== b;
               out.material = { a, b };
               out.errors = window.__bpErrors || [];
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_ONBOARDING', onboardingCheck);
        shots.push(await shoot('preview-onboarding.png'));
        await wc.executeJavaScript(`BP.onboarding.close(); BP.theme.apply();`);

        // ── Material 3 и «О браузере» ───────────────────────────────────────
        const m3Check = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               const bodyStyle = getComputedStyle(document.body);
               out.theme = document.body.dataset.theme;
               out.primaryVar = bodyStyle.getPropertyValue('--md-primary').trim();
               out.surfaceVar = bodyStyle.getPropertyValue('--md-surface').trim();
               BP.panels.openAbout();
               await new Promise((resolve) => setTimeout(resolve, 250));
               const modal = document.querySelector('.modal');
               out.modalRadius = modal ? getComputedStyle(modal).borderRadius : null;
               out.brand = document.querySelector('.about-brand-title') ? document.querySelector('.about-brand-title').textContent : null;
               out.socials = document.querySelectorAll('.about-socials .social-btn').length;
               const sw = document.querySelector('.switch');
               out.switchWidth = sw ? getComputedStyle(sw).width : null;
               BP.panels.closeTopModal();
               out.errors = window.__bpErrors || [];
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_M3', m3Check);
        await wc.executeJavaScript(`BP.panels.openAbout();`);
        await new Promise((resolve) => setTimeout(resolve, 400));
        shots.push(await shoot('preview-about.png'));
        await wc.executeJavaScript(`BP.panels.closeTopModal();`);

        // ── Новые возможности: меню вкладки, профили, история ─────────────
        const featuresCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               BP.panels.openTabMenu(BP.state.tabs[0].id, 160, 160);
               out.tabMenuOpen = !document.getElementById('tab-menu').classList.contains('hidden');
               out.tabMenuItems = document.querySelectorAll('#tab-menu .menu-item').length;
               BP.panels.hideTabMenu();
               const profiles = await window.browserAPI.profiles.list();
               out.profiles = profiles.items.length;
               out.activeProfile = profiles.active;
               const stats = await window.browserAPI.history.stats();
               out.historyAddresses = stats ? stats.addresses : null;
               out.historyVisits = stats ? stats.totalVisits : null;
               BP.panels.openHistory();
               await new Promise((resolve) => setTimeout(resolve, 300));
               out.historyPanel = !!document.querySelector('.history-stats');
               out.historyDays = document.querySelectorAll('.list-day').length;
               BP.panels.closeTopModal();
               BP.panels.openProfileManager();
               await new Promise((resolve) => setTimeout(resolve, 300));
               out.profileRows = document.querySelectorAll('.profile-row').length;
             } catch (error) { out.error = String(error); }
             out.errors = window.__bpErrors || [];
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_FEATURES', featuresCheck);
        shots.push(await shoot('preview-profiles.png'));
        await wc.executeJavaScript(`BP.panels.closeTopModal();`);
        await new Promise((resolve) => setTimeout(resolve, 300));

        // ── Ночное обновление: поисковик→домашняя, палитра, закрепление, стартовая ──
        const upgradeCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               // Поисковая система тянет за собой домашнюю страницу.
               out.homeFromEngine = BP.engines.homepageFor('google', 'https://duckduckgo.com/', 'duckduckgo');
               out.homeKeepsCustom = BP.engines.homepageFor('google', 'https://example.org/', 'duckduckgo');
               out.engineHasHome = !!BP.engines.homeFor('yandex');

               // Часы со стартовой убраны, логотип — монограмма.
               out.clockGone = !document.getElementById('clock-time') && !document.querySelector('.newtab-clock');
               out.mark = !!document.querySelector('.newtab-mark');

               // Быстрые ссылки: OpenCode убран, Discord добавлен.
               const links = BP.state.settings.quickLinks || [];
               out.openCode = links.some((l) => /opencode/i.test((l.url || '') + (l.title || '')));
               out.discord = links.some((l) => /discord/i.test(l.url || ''));

               // Палитра команд.
               BP.palette.open();
               await new Promise((resolve) => setTimeout(resolve, 200));
               out.paletteItems = document.querySelectorAll('.palette-item').length;
               out.paletteOpen = BP.palette.isOpen();
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_UPGRADE', upgradeCheck);
        shots.push(await shoot('preview-palette.png'));
        await wc.executeJavaScript(`BP.palette.close();`);

        // Закрепление вкладки.
        const pinCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               const tab = BP.state.tabs[0];
               BP.tabs.select(tab.id);
               BP.tabs.togglePinned(tab.id);
               out.pinned = !!tab.pinned;
               out.pinnedInDom = document.querySelectorAll('#tabs .tab.pinned').length;
               out.ctxHasPin = (() => {
                 BP.panels.openTabMenu(tab.id, 160, 160);
                 const labels = [...document.querySelectorAll('#tab-menu .menu-item')].map((n) => n.textContent);
                 BP.panels.hideTabMenu();
                 return labels.some((t) => /крепить/i.test(t));
               })();
               // Индикатор активной вкладки должен совпадать с самой вкладкой.
               const ind = document.querySelector('#tabs .tab-indicator');
               const active = document.querySelector('#tabs .tab.active');
               out.indicatorPresent = !!ind;
               out.indicatorMatch = !!(ind && active
                 && ind.style.width === Math.max(12, active.offsetWidth - 16) + 'px'
                 && ind.style.transform === 'translateX(' + (active.offsetLeft + 8) + 'px)');
               BP.tabs.togglePinned(tab.id);
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_PIN', pinCheck);

        // Выключение звука вкладки.
        const muteCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               const tab = BP.state.tabs.find((t) => t.webview && !t.isNewTab) || BP.state.tabs[0];
               BP.tabs.select(tab.id);
               out.muted = BP.tabs.toggleMute(tab.id);
               out.muteInDom = document.querySelectorAll('#tabs .tab-mute:not(.hidden)').length > 0;
               out.audioMuted = tab.webview ? tab.webview.isAudioMuted() : null;
               BP.tabs.toggleMute(tab.id);
               out.unmuted = !tab.muted;
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_MUTE', muteCheck);

        // Новые инструменты: список вкладок, шпаргалка, очистка данных, фирменный логотип.
        const toolsCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               BP.panels.openTabSwitcher();
               await new Promise((resolve) => setTimeout(resolve, 220));
               out.switcherItems = document.querySelectorAll('.modal .switcher-item').length;
               out.switcherHasClosedList = !!document.querySelector('.modal .menu-header');
               BP.panels.closeTopModal();

               BP.panels.openShortcuts();
               await new Promise((resolve) => setTimeout(resolve, 200));
               out.shortcutKeys = document.querySelectorAll('.modal .shortcut-grid .kbd').length;
               BP.panels.closeTopModal();

               BP.panels.openClearData();
               await new Promise((resolve) => setTimeout(resolve, 200));
               out.clearOptions = document.querySelectorAll('.modal .clear-option').length;
               BP.panels.closeTopModal();

               out.logoOnNewTab = !!document.querySelector('#newtab .newtab-mark svg');
               BP.panels.openAbout();
               await new Promise((resolve) => setTimeout(resolve, 200));
               out.logoInAbout = !!document.querySelector('.about-logo svg');
               BP.panels.closeTopModal();

               out.exportApi = typeof window.browserAPI.settings.exportFile === 'function';
               out.importApi = typeof window.browserAPI.settings.importFile === 'function';
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_TOOLS', toolsCheck);

        // Раздельные разделы настроек: «Поисковая система» и «О браузере».
        const settingsCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               BP.panels.openSettings('searchEngine');
               await new Promise((resolve) => setTimeout(resolve, 250));
               out.navButtons = [...document.querySelectorAll('.settings-nav button')].map((b) => b.textContent);
               const sel = document.querySelector('.settings-content select[data-setting], .settings-content .setting select');
               out.engineSelect = !!document.querySelector('.settings-content select');
               out.syncToggle = !!document.querySelector('.settings-content [data-setting="homepage"]');
               BP.panels.closeTopModal();
               BP.panels.openSettings('about');
               await new Promise((resolve) => setTimeout(resolve, 250));
               out.aboutInSettings = !!document.querySelector('.settings-content .about');
               out.saveScreenshot = typeof window.browserAPI.app.saveScreenshot === 'function';
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_SETTINGS2', settingsCheck);
        shots.push(await shoot('preview-settings-about.png'));
        await wc.executeJavaScript(`BP.panels.closeTopModal();`);
        await new Promise((resolve) => setTimeout(resolve, 200));

        // ── Маленькое окно: меню «три точки» прокручивается и не вылезает за экран ──
        const big = win.getSize();
        win.setSize(440, 420);
        await new Promise((resolve) => setTimeout(resolve, 450));
        const adaptCheck = await wc.executeJavaScript(
          `(async () => {
             const out = {};
             try {
               BP.panels.openMainMenu(document.getElementById('btn-menu'));
               await new Promise((resolve) => setTimeout(resolve, 200));
               const popup = document.getElementById('menu-popup');
               const rect = popup.getBoundingClientRect();
               const style = getComputedStyle(popup);
               out.overflowY = style.overflowY;
               out.maxHeight = style.maxHeight;
               out.fitsVertical = rect.bottom <= window.innerHeight + 1;
               out.fitsHorizontal = rect.right <= window.innerWidth + 1;
               out.scrollable = popup.scrollHeight > popup.clientHeight;
               out.innerHeight = window.innerHeight;
               BP.panels.hideMenu();
               // Настройки в узком окне: разделы уехали наверх (колонка).
               BP.panels.openSettings();
               await new Promise((resolve) => setTimeout(resolve, 250));
               const nav = document.querySelector('.settings-nav');
               out.settingsNavDisplay = nav ? getComputedStyle(nav.parentElement).flexDirection : null;
               out.navScrollable = nav ? (nav.scrollWidth >= nav.clientWidth) : null;
               BP.panels.closeTopModal();
             } catch (error) { out.error = String(error); }
             return JSON.stringify(out);
           })()`
        );
        console.log('SMOKETEST_ADAPT', adaptCheck);
        shots.push(await shoot('preview-small-window.png'));
        win.setSize(big[0], big[1]);
        await new Promise((resolve) => setTimeout(resolve, 400));

        console.log('SMOKETEST_SHOTS', shots.join(', '));
      } catch (error) {
        console.log('SMOKETEST_STATE_ERROR', String(error));
      }
      finish(0, 'SMOKETEST_OK');
    }, 3000);
  });

  setTimeout(() => finish(0, 'SMOKETEST_TIMEOUT_OK'), 90000);
}

// ── Всплывающие окна, контекстные меню для вкладок ───────────────────────
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() !== 'webview') return;

  // Окно-владелец представления: все реакции интерфейса (открытие ссылок,
  // контекстные действия) должны попадать только в него.
  const ownerWindow = () => windowOfWebContents(contents) || getFocusedWindow();

  attachContextMenu(contents, {
    send: (channel, payload) => sendToWindow(ownerWindow(), channel, payload),
    getSettings: () => settingsStore.all(),
    getWindow: ownerWindow,
  });

  // Горячие клавиши, которые не заданы в меню приложения:
  // работают, даже когда фокус находится внутри веб-страницы.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const withCtrl = input.control || input.meta;
    if (!withCtrl) return;

    if (input.key === 'Tab') {
      event.preventDefault();
      sendToWindow(ownerWindow(), 'menu:action', { action: input.shift ? 'prev-tab' : 'next-tab' });
      return;
    }
    if (/^[1-9]$/.test(input.key)) {
      event.preventDefault();
      sendToWindow(ownerWindow(), 'menu:action', { action: `tab-${input.key}` });
    }
  });

  contents.setWindowOpenHandler((details) => {
    const settings = settingsStore.all();

    if (!settings.blockPopups) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 780,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }

    sendToWindow(ownerWindow(), 'browser:open-url', {
      url: details.url,
      background: details.disposition === 'background-tab',
      source: contents.id,
    });
    return { action: 'deny' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  const settings = settingsStore.all();
  if (!settings.clearOnExit || quitting) return;

  runClearOnExit(event, settings);
});

async function runClearOnExit(event, settings) {
  quitting = true;
  event.preventDefault();
  try {
    const ses = getBrowserSession();
    const opts = Array.isArray(settings.clearOnExitData) ? settings.clearOnExitData : [];
    if (opts.includes('cache')) await ses.clearCache();
    const storages = [];
    if (opts.includes('cookies')) storages.push('cookies');
    if (opts.includes('storage')) {
      storages.push('localstorage', 'indexdb', 'websql', 'shadercache', 'serviceworkers', 'cachestorage', 'filesystem');
    }
    if (storages.length) await ses.clearStorageData({ storages });
    if (opts.includes('history')) historyStore.set('items', []);
  } catch (error) {
    console.error('[quit] Не удалось очистить данные:', error);
  }
  app.quit();
}
