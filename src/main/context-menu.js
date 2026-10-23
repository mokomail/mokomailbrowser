'use strict';

const { Menu, clipboard } = require('electron');

/**
 * Контекстное меню для страниц (правый клик).
 * @param {Electron.WebContents} contents
 * @param {{ send: Function, getSettings: Function, getWindow: Function }} ctx
 */
function attachContextMenu(contents, ctx) {
  contents.on('context-menu', (event, params) => {
    const template = [];
    const addSeparator = () => {
      const last = template[template.length - 1];
      if (last && last.type !== 'separator') template.push({ type: 'separator' });
    };

    if (params.linkURL) {
      template.push({
        label: 'Открыть ссылку в новой вкладке',
        click: () => ctx.send('browser:context-action', { action: 'open-link', url: params.linkURL, background: false, source: contents.id }),
      });
      template.push({
        label: 'Открыть ссылку в фоновой вкладке',
        click: () => ctx.send('browser:context-action', { action: 'open-link', url: params.linkURL, background: true, source: contents.id }),
      });
      template.push({ label: 'Копировать адрес ссылки', click: () => clipboard.writeText(params.linkURL) });
      template.push({ label: 'Сохранить ссылку как…', click: () => contents.downloadURL(params.linkURL) });
      addSeparator();
    }

    if (params.mediaType === 'image' && params.srcURL) {
      template.push({
        label: 'Открыть изображение в новой вкладке',
        click: () => ctx.send('browser:context-action', { action: 'open-link', url: params.srcURL, background: true, source: contents.id }),
      });
      template.push({ label: 'Сохранить изображение как…', click: () => contents.downloadURL(params.srcURL) });
      template.push({ label: 'Копировать адрес изображения', click: () => clipboard.writeText(params.srcURL) });
      addSeparator();
    }

    if (params.isEditable) {
      template.push({ role: 'undo', label: 'Отменить' });
      template.push({ role: 'redo', label: 'Повторить' });
      addSeparator();
      template.push({ role: 'cut', label: 'Вырезать' });
      template.push({ role: 'copy', label: 'Копировать' });
      template.push({ role: 'paste', label: 'Вставить' });
      template.push({ role: 'selectAll', label: 'Выделить всё' });
    } else if (params.selectionText) {
      template.push({ role: 'copy', label: 'Копировать' });
      template.push({
        label: 'Найти в интернете',
        click: () => ctx.send('browser:context-action', { action: 'search', text: params.selectionText, source: contents.id }),
      });
    } else if (params.linkURL === '' && params.srcURL === '') {
      template.push({ label: 'Назад', enabled: contents.canGoBack(), click: () => contents.goBack() });
      template.push({ label: 'Вперёд', enabled: contents.canGoForward(), click: () => contents.goForward() });
      template.push({ label: 'Обновить', click: () => contents.reload() });
      addSeparator();
      if (contents.getURL()) {
        template.push({ label: 'Копировать адрес страницы', click: () => clipboard.writeText(contents.getURL()) });
        template.push({ label: 'Сохранить страницу как…', click: () => contents.downloadURL(contents.getURL()) });
      }
    }

    let settings = {};
    try {
      settings = ctx.getSettings() || {};
    } catch {
      settings = {};
    }

    if (settings.enableDevTools) {
      addSeparator();
      template.push({ label: 'Просмотреть код элемента', click: () => contents.inspectElement(params.x, params.y) });
    }

    if (!template.length) return;
    const window = typeof ctx.getWindow === 'function' ? ctx.getWindow() : undefined;
    Menu.buildFromTemplate(template).popup(window ? { window } : {});
  });
}

module.exports = { attachContextMenu };
