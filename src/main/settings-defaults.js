'use strict';

/**
 * Значения по умолчанию для всех настроек браузера.
 * Здесь описаны только РЕАЛЬНО работающие настройки — ничего «для вида».
 */
module.exports = {
  // ── Общие ────────────────────────────────────────────────────────────────
  startupBehavior: 'newtab', // newtab | homepage | restore
  confirmCloseWindow: true,
  onboardingDone: false,

  // ── Поисковая система и домашняя страница ────────────────────────────────
  homepage: 'https://duckduckgo.com/',
  searchEngine: 'duckduckgo',
  customSearchUrl: 'https://duckduckgo.com/?q=%s',
  searchSuggestions: true,
  openSearchInNewTab: false,
  searchEngineHomepageSync: true,

  // ── Внешний вид ──────────────────────────────────────────────────────────
  theme: 'dark', // system | light | dark
  accentColor: '#6c8cff',
  uiDensity: 'comfortable', // compact | comfortable
  baseFontSize: 14,
  cornerRadius: 12,
  animations: true,
  showBookmarksBar: true,
  showFavicons: true,
  showTopSites: true,

  // ── Вкладки ──────────────────────────────────────────────────────────────
  openNewTabsInBackground: false,
  warnOnClosingMultipleTabs: true,
  restoreLastSession: true,
  tabGroupsEnabled: true,

  // ── Приватность ──────────────────────────────────────────────────────────
  blockPopups: true,
  doNotTrack: true,
  clearOnExit: false,
  clearOnExitData: ['cache'],

  // ── Контент ──────────────────────────────────────────────────────────────
  javascriptEnabled: true,
  blockImages: false,
  autoplayPolicy: 'document-user-activation-required',
  defaultZoom: 1,

  // ── Загрузки ─────────────────────────────────────────────────────────────
  askWhereToSave: false,
  downloadPath: '',
  openDownloadsPanel: true,

  // ── Сеть ─────────────────────────────────────────────────────────────────
  proxyMode: 'system', // system | direct | manual
  proxyRules: '',
  proxyBypass: '',
  customUserAgent: '',

  // ── Дополнительно ────────────────────────────────────────────────────────
  hardwareAcceleration: true,
  enableDevTools: true,

  // ── Быстрые ссылки на стартовой странице ─────────────────────────────────
  quickLinks: [
    { title: 'YouTube', url: 'https://www.youtube.com/', icon: 'https://icons.duckduckgo.com/ip3/youtube.com.ico' },
    { title: 'Википедия', url: 'https://ru.wikipedia.org/', icon: 'https://icons.duckduckgo.com/ip3/ru.wikipedia.org.ico' },
    { title: 'GitHub', url: 'https://github.com/', icon: 'https://icons.duckduckgo.com/ip3/github.com.ico' },
    { title: 'Discord', url: 'https://discord.com/', icon: 'https://icons.duckduckgo.com/ip3/discord.com.ico' },
  ],
};
