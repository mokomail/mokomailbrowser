'use strict';

const { app, Menu, dialog, shell } = require('electron');

/**
 * Приложение-меню (верхняя панель / Alt).
 * Все действия отправляются в renderer как команды `menu:action`.
 */
function createApplicationMenu(ctx) {
  const send = (action, extra = {}) => () => ctx.send('menu:action', { action, ...extra });
  const manage = (item) => item;

  const profileItems = (ctx.profiles ? ctx.profiles.list() : []).map((profile) => ({
    label: profile.name,
    type: 'radio',
    checked: ctx.activeProfile ? profile.id === ctx.activeProfile.id : false,
    click: () => ctx.send('menu:action', { action: 'switch-profile', profileId: profile.id }),
  }));

  const template = [
    {
      label: 'Файл',
      submenu: [
        { label: 'Новая вкладка', accelerator: 'CmdOrCtrl+T', click: send('new-tab') },
        { label: 'Новое окно', accelerator: 'CmdOrCtrl+N', click: () => ctx.createWindow() },
        { label: 'Новое окно в режиме инкогнито', accelerator: 'CmdOrCtrl+Shift+N', click: () => ctx.createIncognitoWindow() },
        { type: 'separator' },
        { label: 'Закрыть вкладку', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
        { label: 'Восстановить закрытую вкладку', accelerator: 'CmdOrCtrl+Shift+T', click: send('reopen-tab') },
        { type: 'separator' },
        { label: 'Сохранить страницу как…', accelerator: 'CmdOrCtrl+S', click: send('save-page') },
        { label: 'Печать…', accelerator: 'CmdOrCtrl+P', click: send('print') },
        { type: 'separator' },
        { label: 'Выход', accelerator: 'Alt+F4', click: () => ctx.quit() },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Повторить', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Вырезать', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Копировать', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Вставить', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Выделить всё', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        { label: 'Найти на странице…', accelerator: 'CmdOrCtrl+F', click: send('find') },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Обновить', accelerator: 'F5', click: send('reload') },
        { label: 'Обновить без кэша', accelerator: 'CmdOrCtrl+Shift+R', click: send('hard-reload') },
        { label: 'Остановить загрузку', click: send('stop') },
        { type: 'separator' },
        { label: 'Свернуть/развернуть группы', click: send('toggle-tab-groups') },
        { type: 'separator' },
        { label: 'Увеличить масштаб', accelerator: 'CmdOrCtrl+Plus', click: send('zoom-in') },
        { label: 'Уменьшить масштаб', accelerator: 'CmdOrCtrl+-', click: send('zoom-out') },
        { label: 'Обычный масштаб', accelerator: 'CmdOrCtrl+0', click: send('zoom-reset') },
        { type: 'separator' },
        { label: 'Панель закладок', accelerator: 'CmdOrCtrl+Shift+B', click: send('toggle-bookmarks-bar') },
        { label: 'Полноэкранный режим', accelerator: 'F11', click: (item, win) => win && win.setFullScreen(!win.isFullScreen()) },
        { type: 'separator' },
        { label: 'Инструменты разработчика', accelerator: 'CmdOrCtrl+Shift+I', click: send('devtools') },
      ],
    },
    {
      label: 'Навигация',
      submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: send('back') },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: send('forward') },
        { label: 'Домой', accelerator: 'Alt+Home', click: send('home') },
        { type: 'separator' },
        { label: 'Адресная строка', accelerator: 'CmdOrCtrl+L', click: send('focus-address') },
        { label: 'История', accelerator: 'CmdOrCtrl+H', click: send('open-history') },
        { label: 'Загрузки', accelerator: 'CmdOrCtrl+J', click: send('open-downloads') },
      ],
    },
    {
      label: 'Вкладки',
      submenu: [
        { label: 'Закрепить/открепить вкладку', click: send('toggle-pin-tab') },
        { label: 'Дублировать вкладку', click: send('duplicate-tab') },
        { label: 'Выключить/включить звук вкладки', accelerator: 'CmdOrCtrl+M', click: send('toggle-mute-tab') },
        { type: 'separator' },
        { label: 'Закрыть другие вкладки', click: send('close-other-tabs') },
        { label: 'Закрыть вкладки справа', click: send('close-right-tabs') },
        { type: 'separator' },
        { label: 'Список вкладок…', accelerator: 'CmdOrCtrl+Shift+A', click: send('tab-switcher') },
      ],
    },
    {
      label: 'Закладки',
      submenu: [
        { label: 'Добавить в закладки', accelerator: 'CmdOrCtrl+D', click: send('toggle-bookmark') },
        { label: 'Все закладки', accelerator: 'CmdOrCtrl+Shift+O', click: send('open-bookmarks') },
      ],
    },
    {
      label: 'Профили',
      submenu: [
        ...profileItems,
        { type: 'separator' },
        { label: 'Создать профиль…', click: send('create-profile') },
        { label: 'Управление профилями…', click: send('open-profiles') },
      ],
    },
    {
      label: 'Инструменты',
      submenu: [
        { label: 'Палитра команд…', accelerator: 'CmdOrCtrl+Shift+P', click: send('command-palette') },
        { label: 'Снимок страницы…', accelerator: 'CmdOrCtrl+Shift+S', click: send('screenshot') },
        { label: 'Список вкладок…', click: send('tab-switcher') },
        { label: 'Горячие клавиши…', accelerator: 'F1', click: send('shortcuts') },
        { label: 'Очистить данные…', accelerator: 'CmdOrCtrl+Shift+Delete', click: send('clear-data') },
        { type: 'separator' },
        { label: 'Настройки', accelerator: 'CmdOrCtrl+,', click: send('open-settings') },
        { label: 'Первоначальная настройка…', click: send('repeat-onboarding') },
        { type: 'separator' },
        { label: 'Открыть папку с данными', click: () => ctx.openUserData() },
        { label: 'Сбросить настройки', click: () => ctx.resetSettings() },
      ],
    },
    {
      label: 'Справка',
      submenu: [
        { label: 'О MokomailBrowser', click: send('open-about') },
        { type: 'separator' },
        { label: 'TikTok — @mokomail', click: () => shell.openExternal('https://www.tiktok.com/@mokomail') },
        { label: 'GitHub — mokomail', click: () => shell.openExternal('https://github.com/mokomail') },
        { type: 'separator' },
        {
          label: 'Системная информация…',
          click: () => {
            dialog.showMessageBox(ctx.getWindow(), {
              type: 'info',
              title: 'О браузере',
              message: ctx.appName || 'MokomailBrowser',
              detail:
                `MokomailTeam\n` +
                `Версия: ${app.getVersion()}${ctx.appChannel ? ' ' + ctx.appChannel : ''}\n` +
                `Electron: ${process.versions.electron}\n` +
                `Chromium: ${process.versions.chrome}\n` +
                `Node.js: ${process.versions.node}`,
              buttons: ['Хорошо'],
            });
          },
        },
      ],
    },
  ].map(manage);

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { createApplicationMenu };

