'use strict';

/** Модальные панели: настройки, история, закладки, загрузки, меню, диалоги. */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  const modalStack = [];
  let downloadsPanelOpen = false;
  let historyPanelOpen = false;
  let currentSettingsSection = 'general';

  // ── Базовое модальное окно ─────────────────────────────────────────────
  function openModal({ title, size = '', icon = '', render }) {
    const root = document.getElementById('modal-root');
    const overlay = util.el('div', { class: 'overlay' });
    const modal = util.el('div', { class: `modal ${size}` });

    const head = util.el('div', { class: 'modal-head' });
    if (icon) head.append(util.el('span', { class: 'menu-icon', html: BP.icons.svg(icon, 20) }));
    head.append(util.el('h2', { text: title }));
    const closeBtn = util.el('button', { class: 'modal-close', html: BP.icons.svg('close', 16), title: 'Закрыть (Esc)' });
    head.append(closeBtn);

    const body = util.el('div', { class: 'modal-body' });
    modal.append(head, body);
    overlay.append(modal);
    root.append(overlay);

    const controller = {
      overlay,
      modal,
      body,
      // Вызывается при закрытии любым способом (Esc, клик по фону, кнопка).
      // Нужен, чтобы вызывающий код всегда завершал свой Promise.
      onClose: null,
      close() {
        const index = modalStack.indexOf(controller);
        if (index >= 0) modalStack.splice(index, 1);
        overlay.remove();
        const fn = controller.onClose;
        controller.onClose = null;
        if (typeof fn === 'function') fn();
      },
    };

    closeBtn.addEventListener('click', () => controller.close());
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) controller.close();
    });

    modalStack.push(controller);
    if (typeof render === 'function') render(body, controller);
    return controller;
  }

  function closeTopModal() {
    const top = modalStack[modalStack.length - 1];
    if (top) {
      top.close();
      return true;
    }
    return false;
  }

  // ── Диалог с полями ввода ──────────────────────────────────────────────
  function prompt({ title, message, fields = [], submitLabel = 'Сохранить', onSubmit }) {
    return new Promise((resolve) => {
      let controller = null;
      controller = openModal({
        title,
        size: 'small',
        render(body) {
          const form = util.el('form', { style: 'padding:22px;display:flex;flex-direction:column;gap:14px;width:100%' });
          if (message) form.append(util.el('p', { style: 'margin:0;color:var(--text-dim)', text: message }));

          const inputs = {};
          fields.forEach((field) => {
            const input = util.el('input', {
              class: 'field',
              type: 'text',
              value: field.value || '',
              placeholder: field.placeholder || '',
              autocomplete: 'off',
            });
            inputs[field.name] = input;
            form.append(
              util.el('label', { style: 'display:flex;flex-direction:column;gap:6px' }, [
                util.el('span', { style: 'font-size:.88em;color:var(--text-dim)', text: field.label }),
                input,
              ])
            );
          });

          const actions = util.el('div', { class: 'btn-row', style: 'justify-content:flex-end;margin-top:4px' }, [
            util.el('button', { class: 'btn', type: 'button', text: 'Отмена' }),
            util.el('button', { class: 'btn primary', type: 'submit', text: submitLabel }),
          ]);
          actions.firstChild.addEventListener('click', () => {
            resolve(null);
            controller.close();
          });
          form.append(actions);

          form.addEventListener('submit', (event) => {
            event.preventDefault();
            const values = {};
            Object.entries(inputs).forEach(([name, input]) => {
              values[name] = input.value.trim();
            });
            resolve(values);
            controller.close();
          });

          body.append(form);
          setTimeout(() => fields.length && inputs[fields[0].name].focus(), 30);
        },
      });
      controller.onClose = () => resolve(null);
    });
  }

  function confirmDialog({ title, message, detail = '', confirmLabel = 'Подтвердить', danger = false }) {
    return new Promise((resolve) => {
      let controller = null;
      controller = openModal({
        title,
        size: 'small',
        render(body) {
          const wrap = util.el('div', { style: 'padding:22px;width:100%' }, [
            util.el('p', { style: 'margin:0 0 6px', text: message }),
            detail ? util.el('p', { style: 'margin:0;color:var(--text-dim);font-size:.9em', text: detail }) : null,
            util.el('div', { class: 'btn-row', style: 'justify-content:flex-end' }, [
              util.el('button', { class: 'btn', text: 'Отмена', onclick: () => { resolve(false); controller.close(); } }),
              util.el('button', {
                class: `btn ${danger ? 'danger' : 'primary'}`,
                text: confirmLabel,
                onclick: () => { resolve(true); controller.close(); },
              }),
            ]),
          ]);
          body.append(wrap);
        },
      });
      controller.onClose = () => resolve(false);
    });
  }

  // ── Схема настроек ─────────────────────────────────────────────────────
  function engineOptions() {
    return api.searchEngines.map((engine) => ({ value: engine.id, label: engine.name }));
  }

  function sections() {
    return [
      {
        id: 'general',
        title: 'Общие',
        description: 'Поведение при запуске и закрытии браузера.',
        items: [
          {
            type: 'select',
            key: 'startupBehavior',
            label: 'При запуске открывать',
            options: [
              { value: 'newtab', label: 'Страницу новой вкладки' },
              { value: 'homepage', label: 'Домашнюю страницу' },
              { value: 'restore', label: 'Вкладки прошлой сессии' },
            ],
          },
          { type: 'toggle', key: 'confirmCloseWindow', label: 'Спрашивать перед закрытием окна', hint: 'Показывать подтверждение при закрытии окна с несколькими вкладками.' },
          {
            type: 'button',
            label: 'Первоначальная настройка',
            hint: 'Снова открыть мастер первого запуска: имя профиля, поиск, оформление.',
            buttonLabel: 'Запустить',
            action: () => { BP.panels.closeTopModal(); BP.onboarding && BP.onboarding.start(); },
          },
        ],
      },
      {
        id: 'searchEngine',
        title: 'Поисковая система',
        description: 'Чем искать в интернете и какая страница открывается вместо этого.',
        items: [
          { type: 'select', key: 'searchEngine', label: 'Поисковая система', options: engineOptions(), hint: 'Сервис, который открывается, когда в адресной строке введён запрос, а не адрес.' },
          { type: 'text', key: 'customSearchUrl', label: 'Своя поисковая система', hint: 'Используется, если выбрана «Своя поисковая система». Вставьте %s вместо запроса.', placeholder: 'https://example.com/search?q=%s' },
          { type: 'text', key: 'homepage', label: 'Домашняя страница', hint: 'Адрес, который открывается кнопкой «Домой». Меняется вместе с поисковой системой.', placeholder: 'https://duckduckgo.com/' },
          { type: 'toggle', key: 'searchEngineHomepageSync', label: 'Менять домашнюю страницу вместе с поисковиком', hint: 'Если вы не задавали домашнюю страницу вручную, она будет следовать за выбранной поисковой системой.' },
          { type: 'toggle', key: 'searchSuggestions', label: 'Показывать подсказки поиска', hint: 'Запрашивать подсказки у поисковой системы при вводе.' },
          { type: 'toggle', key: 'openSearchInNewTab', label: 'Открывать поиск в новой вкладке', hint: 'Если в адресной строке введён запрос (не адрес), открывать результат в новой вкладке.' },
        ],
      },
      {
        id: 'appearance',
        title: 'Внешний вид',
        description: 'Тема, цвета и плотность интерфейса.',
        items: [
          {
            type: 'select',
            key: 'theme',
            label: 'Тема',
            options: [
              { value: 'system', label: 'Как в системе' },
              { value: 'light', label: 'Светлая' },
              { value: 'dark', label: 'Тёмная' },
            ],
          },
          { type: 'color', key: 'accentColor', label: 'Акцентный цвет', hint: 'Используется для активных элементов и подсветки.' },
          {
            type: 'select',
            key: 'uiDensity',
            label: 'Плотность интерфейса',
            options: [
              { value: 'comfortable', label: 'Комфортная' },
              { value: 'compact', label: 'Компактная' },
            ],
          },
          { type: 'range', key: 'baseFontSize', label: 'Размер шрифта интерфейса', min: 12, max: 20, step: 1, format: (value) => `${value} px` },
          { type: 'range', key: 'cornerRadius', label: 'Скругление углов', min: 0, max: 22, step: 1, format: (value) => `${value} px` },
          { type: 'toggle', key: 'animations', label: 'Плавные переходы', hint: 'Анимации появления окон и элементов.' },
          { type: 'toggle', key: 'showFavicons', label: 'Показывать значки сайтов', hint: 'Иконки сайтов на вкладках.' },
          { type: 'toggle', key: 'showBookmarksBar', label: 'Показывать панель закладок' },
          { type: 'toggle', key: 'showTopSites', label: 'Показывать «Часто посещаемые»', hint: 'На новой вкладке выводить самые посещаемые сайты из истории.' },
        ],
      },
      {
        id: 'tabs',
        title: 'Вкладки',
        description: 'Поведение вкладок и группы.',
        items: [
          { type: 'toggle', key: 'tabGroupsEnabled', label: 'Группы вкладок', hint: 'Правый клик по вкладке — создание и настройка групп.' },
          { type: 'toggle', key: 'openNewTabsInBackground', label: 'Открывать новые вкладки в фоне', hint: 'Ссылки, открытые в новой вкладке, не будут переключать фокус.' },
          { type: 'toggle', key: 'warnOnClosingMultipleTabs', label: 'Предупреждать при закрытии нескольких вкладок' },
          { type: 'toggle', key: 'restoreLastSession', label: 'Помнить вкладки между запусками', hint: 'Сохранять список открытых вкладок, чтобы восстановить их через «Вкладки прошлой сессии».' },
          { type: 'button', label: 'Восстановить закрытую вкладку', hint: 'Открыть последнюю закрытую вкладку.', buttonLabel: 'Восстановить', action: () => BP.tabs.reopenClosed() },
        ],
      },
      {
        id: 'privacy',
        title: 'Приватность',
        description: 'Всплывающие окна, отслеживание и очистка данных.',
        items: [
          { type: 'toggle', key: 'blockPopups', label: 'Блокировать всплывающие окна', hint: 'Всплывающие окна будут открываться как вкладки вместо отдельных окон.' },
          { type: 'toggle', key: 'doNotTrack', label: 'Отправлять «Do Not Track»', hint: 'Передавать сайтам заголовки DNT и Sec-GPC.' },
          { type: 'toggle', key: 'clearOnExit', label: 'Очищать данные при выходе' },
          {
            type: 'checkboxes',
            key: 'clearOnExitData',
            label: 'Что очищать при выходе',
            options: [
              { value: 'cache', label: 'Кэш' },
              { value: 'cookies', label: 'Cookie и данные сайтов' },
              { value: 'storage', label: 'Локальное хранилище' },
              { value: 'history', label: 'Историю посещений' },
            ],
          },
        ],
      },
      {
        id: 'content',
        title: 'Содержимое сайтов',
        description: 'Отображение и поведение веб-страниц.',
        items: [
          { type: 'toggle', key: 'javascriptEnabled', label: 'Разрешить JavaScript', hint: 'Изменение применяется к новым загрузкам страницы (обновите вкладку).' },
          { type: 'toggle', key: 'blockImages', label: 'Блокировать изображения', hint: 'Экономит трафик: изображения не загружаются.' },
          {
            type: 'select',
            key: 'autoplayPolicy',
            label: 'Автовоспроизведение медиа',
            options: [
              { value: 'no-user-gesture-required', label: 'Разрешить всегда' },
              { value: 'user-gesture-required', label: 'Только после действия пользователя' },
              { value: 'document-user-activation-required', label: 'Как в браузере по умолчанию' },
            ],
          },
          {
            type: 'select',
            key: 'defaultZoom',
            label: 'Масштаб страниц по умолчанию',
            options: [
              { value: 0.5, label: '50 %' },
              { value: 0.67, label: '67 %' },
              { value: 0.8, label: '80 %' },
              { value: 0.9, label: '90 %' },
              { value: 1, label: '100 %' },
              { value: 1.1, label: '110 %' },
              { value: 1.25, label: '125 %' },
              { value: 1.5, label: '150 %' },
              { value: 2, label: '200 %' },
            ],
          },
        ],
      },
      {
        id: 'downloads',
        title: 'Загрузки',
        description: 'Куда и как сохранять файлы.',
        items: [
          { type: 'path', key: 'downloadPath', label: 'Папка загрузок', hint: 'По умолчанию — системная папка «Загрузки».', placeholder: 'Папка по умолчанию' },
          { type: 'toggle', key: 'askWhereToSave', label: 'Спрашивать, куда сохранять файл' },
          { type: 'toggle', key: 'openDownloadsPanel', label: 'Показывать панель при начале загрузки' },
        ],
      },
      {
        id: 'network',
        title: 'Сеть',
        description: 'Прокси и подмена данных о браузере.',
        items: [
          {
            type: 'select',
            key: 'proxyMode',
            label: 'Прокси',
            options: [
              { value: 'system', label: 'Системные настройки' },
              { value: 'direct', label: 'Без прокси' },
              { value: 'manual', label: 'Настроить вручную' },
            ],
          },
          { type: 'text', key: 'proxyRules', label: 'Правила прокси', hint: 'Например: http=127.0.0.1:8888;https=127.0.0.1:8888', placeholder: 'http=host:port;https=host:port' },
          { type: 'text', key: 'proxyBypass', label: 'Исключения прокси', hint: 'Адреса через точку с запятой: localhost;127.0.0.1;*.local', placeholder: 'localhost;127.0.0.1' },
          { type: 'text', key: 'customUserAgent', label: 'Свой User-Agent', hint: 'Пусто — использовать стандартный.', placeholder: 'Стандартный' },
        ],
      },
      {
        id: 'advanced',
        title: 'Дополнительно',
        description: 'Производительность, профили и данные браузера.',
        items: [
          { type: 'toggle', key: 'hardwareAcceleration', label: 'Аппаратное ускорение', hint: 'Требуется перезапуск браузера.' },
          { type: 'button', label: 'Перезапустить браузер', hint: 'Нужно после смены аппаратного ускорения.', buttonLabel: 'Перезапустить', action: () => api.app.restart() },
          { type: 'toggle', key: 'enableDevTools', label: 'Инструменты разработчика', hint: 'Разрешить открытие DevTools (Ctrl+Shift+I).' },
          { type: 'divider', label: 'Профили' },
          { type: 'button', label: 'Управление профилями', hint: 'Отдельные настройки, история, закладки и входы на сайтах для каждого профиля.', buttonLabel: 'Открыть', action: () => openProfileManager() },
          { type: 'button', label: 'Создать профиль', hint: 'Новый профиль получит собственный набор данных.', buttonLabel: 'Создать', action: () => createProfileFlow() },
          { type: 'divider', label: 'Данные браузера' },
          { type: 'button', label: 'Очистить данные…', hint: 'Выбрать категории (история, cookie, кэш) и период очистки.', buttonLabel: 'Открыть', action: () => openClearData() },
          { type: 'button', label: 'Открыть папку с данными', hint: 'Настройки, история, закладки — файлы JSON.', buttonLabel: 'Открыть', action: () => api.settings.openUserData() },
          { type: 'button', label: 'Очистить кэш', hint: 'Удалить временные файлы сайтов.', buttonLabel: 'Очистить', action: clearCache },
          {
            type: 'button',
            label: 'Экспорт настроек',
            hint: 'Сохранить текущие настройки профиля в JSON-файл.',
            buttonLabel: 'Экспорт',
            action: async () => {
              const result = await api.settings.exportFile();
              if (result && result.ok) BP.toast('Настройки экспортированы', 'ok');
            },
          },
          {
            type: 'button',
            label: 'Импорт настроек',
            hint: 'Загрузить настройки из JSON-файла. Применяются только известные параметры.',
            buttonLabel: 'Импорт',
            action: async () => {
              const result = await api.settings.importFile();
              if (!result || !result.ok) {
                if (result && result.error) BP.toast('Не удалось импортировать настройки');
                return;
              }
              BP.toast(`Импортировано параметров: ${result.count}`, 'ok');
              afterSettingChange(null);
              closeTopModal();
              openSettings(currentSettingsSection);
            },
          },
          {
            type: 'button',
            label: 'Удалить историю посещений',
            hint: 'История будет удалена безвозвратно.',
            buttonLabel: 'Удалить',
            danger: true,
            action: async () => {
              const ok = await confirmDialog({ title: 'Очистить историю?', message: 'Вся история посещений будет удалена.', confirmLabel: 'Удалить', danger: true });
              if (!ok) return;
              await api.history.clear();
              BP.toast('История очищена', 'ok');
              if (historyPanelOpen) openHistory();
            },
          },
          { type: 'button', label: 'Сбросить все настройки', hint: 'Вернуть значения по умолчанию.', buttonLabel: 'Сбросить', danger: true, action: resetSettings },
        ],
      },
      {
        id: 'about',
        title: 'О браузере',
        description: 'Версия, используемые технологии и наши соцсети.',
        items: [{ type: 'about' }],
      },
    ];
  }

  async function clearCache() {
    await api.session.clearData({ cache: true });
    BP.toast('Кэш очищен', 'ok');
  }

  /** Снимок видимой области активной страницы → диалог сохранения PNG. */
  async function captureScreenshot() {
    const tab = BP.tabs.getActive();
    if (!tab || !tab.webview) {
      BP.toast('Нет активной страницы для снимка');
      return;
    }
    try {
      const image = await tab.webview.capturePage();
      const dataUrl = image.toDataURL();
      const safeTitle = String(tab.title || util.hostOf(tab.url) || 'page')
        .replace(/[^\wа-яёА-ЯЁ\-. ]+/g, '_')
        .trim()
        .slice(0, 60) || 'page';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const result = await api.app.saveScreenshot(dataUrl, `${safeTitle}-${stamp}.png`);
      if (result && result.ok) {
        BP.toast('Снимок сохранён', 'ok');
        api.app.showItemInFolder(result.path);
      }
    } catch (error) {
      console.error('[screenshot] Не удалось сделать снимок:', error);
      BP.toast('Не удалось сделать снимок');
    }
  }

  async function resetSettings() {
    const ok = await confirmDialog({ title: 'Сбросить настройки?', message: 'Все настройки вернутся к значениям по умолчанию.', confirmLabel: 'Сбросить', danger: true });
    if (!ok) return;
    await BP.settings.reset();
    afterSettingChange(null);
    // Закрываем окно настроек и открываем заново, иначе они накладывались бы
    // друг на друга (в стеке оставалась бы старая копия).
    closeTopModal();
    openSettings(currentSettingsSection);
    BP.toast('Настройки сброшены', 'ok');
  }

  // ── Отрисовка элементов настройки ──────────────────────────────────────
  function createToggle(item) {
    const value = state.settings[item.key] !== false;
    const control = util.el('button', { class: `switch${value ? ' on' : ''}`, type: 'button', role: 'switch' });
    control.addEventListener('click', async () => {
      const next = !control.classList.contains('on');
      control.classList.toggle('on', next);
      await BP.settings.set(item.key, next);
      afterSettingChange(item.key);
    });
    return control;
  }

  function createSelect(item) {
    const select = util.el('select', { class: 'field' });
    item.options.forEach((option) => {
      select.append(util.el('option', { value: option.value, text: option.label }));
    });
    select.value = String(state.settings[item.key]);
    select.addEventListener('change', async () => {
      let value = select.value;
      if (item.options.length && typeof item.options[0].value === 'number') value = Number(value);
      const previous = state.settings[item.key];
      await BP.settings.set(item.key, value);
      if (item.key === 'searchEngine') await syncHomepageWithEngine(previous, value);
      afterSettingChange(item.key);
    });
    return select;
  }

  /**
   * Синхронизация домашней страницы с выбранной поисковой системой.
   * Домашняя страница подменяется только если пользователь её не задавал
   * вручную (пустая, совпадает с прежним поисковиком или с известным адресом).
   */
  async function syncHomepageWithEngine(prevEngineId, nextEngineId) {
    if (state.settings.searchEngineHomepageSync === false) return;
    if (!BP.engines) return;
    const target = BP.engines.homepageFor(nextEngineId, state.settings.homepage, prevEngineId);
    if (target && target !== state.settings.homepage) {
      await BP.settings.set('homepage', target);
      const input = document.querySelector('[data-setting="homepage"]');
      if (input) input.value = target;
    }
  }

  function createText(item) {
    const input = util.el('input', { class: 'field grow', type: 'text', value: state.settings[item.key] || '', placeholder: item.placeholder || '', spellcheck: 'false', dataset: { setting: item.key } });
    const save = util.debounce(async () => {
      await BP.settings.set(item.key, input.value.trim());
      afterSettingChange(item.key);
    }, 500);
    input.addEventListener('input', save);
    input.addEventListener('blur', () => save());
    return input;
  }

  function createPath(item) {
    const wrap = util.el('div', { style: 'display:flex;gap:8px;flex:1 1 auto;min-width:0' });
    const input = util.el('input', { class: 'field grow', type: 'text', value: state.settings[item.key] || '', placeholder: item.placeholder || '' });
    const browse = util.el('button', { class: 'btn small', type: 'button', text: 'Выбрать…' });
    const save = util.debounce(async () => {
      await BP.settings.set(item.key, input.value.trim());
      afterSettingChange(item.key);
    }, 400);
    input.addEventListener('input', save);
    browse.addEventListener('click', async () => {
      const result = await api.app.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Выберите папку для загрузок' });
      if (result && !result.canceled && result.filePaths[0]) {
        input.value = result.filePaths[0];
        await BP.settings.set(item.key, input.value);
        BP.toast('Папка загрузок обновлена', 'ok');
      }
    });
    wrap.append(input, browse);
    return wrap;
  }

  function createRange(item) {
    const wrap = util.el('div', { style: 'display:flex;align-items:center;gap:10px' });
    const value = Number(state.settings[item.key]) || item.min;
    const output = util.el('output', { style: 'min-width:56px;text-align:right;color:var(--text-dim);font-size:.88em', text: item.format ? item.format(value) : String(value) });
    const input = util.el('input', { class: 'field', type: 'range', min: item.min, max: item.max, step: item.step || 1, value });
    input.addEventListener('input', () => {
      output.textContent = item.format ? item.format(input.value) : input.value;
      // Живой предпросмотр: меняем только локальное состояние и CSS-переменные.
      // Запись на диск и перерисовка интерфейса — один раз по окончании перетаскивания.
      state.settings[item.key] = Number(input.value);
      BP.theme.apply();
    });
    input.addEventListener('change', () => {
      BP.settings.set(item.key, Number(input.value)).then(() => afterSettingChange(item.key));
    });
    wrap.append(input, output);
    return wrap;
  }

  function createColor(item) {
    const input = util.el('input', { class: 'field', type: 'color', value: state.settings[item.key] || '#6c8cff' });
    input.addEventListener('input', () => {
      state.settings[item.key] = input.value;
      BP.theme.apply();
    });
    input.addEventListener('change', () => {
      BP.settings.set(item.key, input.value).then(() => afterSettingChange(item.key));
    });
    return input;
  }

  function createCheckboxes(item) {
    const current = new Set(Array.isArray(state.settings[item.key]) ? state.settings[item.key] : []);
    const wrap = util.el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    item.options.forEach((option) => {
      const on = current.has(option.value);
      const control = util.el('button', { class: `switch${on ? ' on' : ''}`, type: 'button', style: 'width:38px;height:22px' });
      control.addEventListener('click', async () => {
        const active = !control.classList.contains('on');
        control.classList.toggle('on', active);
        if (active) current.add(option.value);
        else current.delete(option.value);
        await BP.settings.set(item.key, [...current]);
      });
      wrap.append(
        util.el('div', { style: 'display:flex;align-items:center;gap:10px;justify-content:space-between;min-width:210px' }, [
          util.el('span', { text: option.label }),
          control,
        ])
      );
    });
    return wrap;
  }

  function createButton(item) {
    const button = util.el('button', { class: `btn small ${item.danger ? 'danger' : ''}`, type: 'button', text: item.buttonLabel || 'Выполнить' });
    button.addEventListener('click', () => item.action && item.action());
    return button;
  }

  function createAbout() {
    const info = state.info || {};
    const wrap = util.el('div', { class: 'about' });

    wrap.append(
      util.el('div', { class: 'about-brand' }, [
        util.el('div', { class: 'about-logo', html: BP.icons.logo(44) }),
        util.el('div', {}, [
          util.el('div', { class: 'about-brand-title', text: info.name || 'MokomailBrowser' }),
          util.el('div', { class: 'about-brand-sub', text: `Версия ${info.version || '—'}${info.channel ? ' ' + info.channel : ''} • команда MokomailTeam` }),
        ]),
      ])
    );

    const grid = util.el('dl', { class: 'about-grid' });
    const rows = [
      ['Профиль', info.profile ? info.profile.name : '—'],
      ['Electron', info.electron || '—'],
      ['Chromium', info.chrome || '—'],
      ['Node.js', info.node || '—'],
      ['Платформа', `${info.platform || ''} ${info.arch || ''}`.trim() || '—'],
      ['Данные', info.profileDir || info.userData || '—'],
    ];
    rows.forEach(([key, value]) => {
      grid.append(util.el('dt', { text: key }), util.el('dd', { text: value }));
    });
    wrap.append(grid);

    wrap.append(
      util.el('div', { class: 'about-socials' }, [
        util.el('button', { class: 'social-btn', type: 'button', onclick: () => api.app.openExternal('https://www.tiktok.com/@mokomail') }, [
          util.el('span', { html: BP.icons.svg('tiktok', 18) }),
          util.el('span', { text: 'TikTok @mokomail' }),
        ]),
        util.el('button', { class: 'social-btn', type: 'button', onclick: () => api.app.openExternal('https://github.com/mokomail') }, [
          util.el('span', { html: BP.icons.svg('github', 18) }),
          util.el('span', { text: 'GitHub mokomail' }),
        ]),
      ])
    );

    wrap.append(
      util.el('div', { class: 'about-foot', text: 'MokomailBrowser — быстрый браузер на Chromium. Сделано командой MokomailTeam с любовью к порядку в интернете.' })
    );

    return wrap;
  }

  function renderSetting(item) {
    if (item.type === 'divider') {
      return util.el('div', { style: 'margin-top:20px;padding-top:6px' }, [
        util.el('div', { style: 'font-weight:600;color:var(--text-dim);font-size:.86em;letter-spacing:.03em;text-transform:uppercase', text: item.label }),
      ]);
    }
    if (item.type === 'about') {
      return createAbout();
    }

    const row = util.el('div', { class: 'setting' });
    const info = util.el('div', { class: 'setting-info' }, [
      util.el('span', { class: 'setting-label', text: item.label }),
      item.hint ? util.el('span', { class: 'setting-hint', text: item.hint }) : null,
    ]);
    row.append(info);

    let control = null;
    switch (item.type) {
      case 'toggle':
        control = createToggle(item);
        break;
      case 'select':
        control = createSelect(item);
        break;
      case 'text':
        control = createText(item);
        break;
      case 'path':
        control = createPath(item);
        break;
      case 'range':
        control = createRange(item);
        break;
      case 'color':
        control = createColor(item);
        break;
      case 'checkboxes':
        control = createCheckboxes(item);
        break;
      case 'button':
        control = createButton(item);
        break;
      default:
        control = null;
    }
    if (control) {
      const holder = util.el('div', {
        class: `setting-control${['text', 'path'].includes(item.type) ? ' wide' : ''}`,
        style: item.type === 'checkboxes' ? 'flex:0 0 auto' : '',
      });
      holder.append(control);
      row.append(holder);
    }
    return row;
  }

  function afterSettingChange(key) {
    BP.theme.apply();
    if (!key || key === 'showBookmarksBar' || key === 'accentColor' || key === 'theme') {
      BP.ui.renderBookmarksBar();
    }
    if (!key || key === 'showFavicons' || key === 'showBookmarksBar' || key === 'tabGroupsEnabled') {
      BP.tabs.renderStrip();
    }
    if (!key || key === 'showTopSites') {
      BP.ui.renderTopSites();
    }
  }

  // ── Панель настроек ────────────────────────────────────────────────────
  function openSettings(sectionId) {
    const list = sections();
    currentSettingsSection = sectionId && list.some((section) => section.id === sectionId) ? sectionId : currentSettingsSection;

    let activeNav = null;
    const content = util.el('div', { class: 'settings-content' });
    const nav = util.el('div', { class: 'settings-nav' });

    function showSection(id) {
      const section = list.find((entry) => entry.id === id) || list[0];
      currentSettingsSection = section.id;
      util.$$('button', nav).forEach((button) => button.classList.toggle('active', button.dataset.section === section.id));
      content.innerHTML = '';
      const wrap = util.el('div', { class: 'settings-section' }, [
        util.el('h3', { text: section.title }),
        util.el('p', { text: section.description }),
      ]);
      section.items.forEach((item) => wrap.append(renderSetting(item)));
      content.append(wrap);
      content.scrollTop = 0;
    }

    list.forEach((section) => {
      const button = util.el('button', { text: section.title, dataset: { section: section.id } });
      button.addEventListener('click', () => showSection(section.id));
      nav.append(button);
    });

    const layout = util.el('div', { class: 'settings-layout' }, [nav, content]);
    openModal({
      title: 'Настройки',
      icon: 'settings',
      render(body) {
        body.append(layout);
      },
    });
    showSection(currentSettingsSection);
  }

  // ── История ────────────────────────────────────────────────────────────
  async function openHistory() {
    historyPanelOpen = true;
    let panelController = null;
    const list = util.el('div', { class: 'list' });
    const search = util.el('input', { class: 'field', type: 'text', placeholder: 'Поиск по истории', spellcheck: 'false' });
    const statsBar = util.el('div', { class: 'history-stats' });
    const orderSelect = util.el('select', { class: 'field' });
    orderSelect.append(
      util.el('option', { value: 'recent', text: 'Сначала новые' }),
      util.el('option', { value: 'visits', text: 'Часто посещаемые' })
    );

    async function renderStats() {
      const stats = await api.history.stats();
      statsBar.innerHTML = '';
      statsBar.append(
        util.el('span', { class: 'history-stat', html: `<b>${stats.addresses}</b> адресов` }),
        util.el('span', { class: 'history-stat', html: `<b>${stats.totalVisits}</b> посещений` }),
        util.el('span', { class: 'history-stat', html: `сегодня: <b>${stats.today}</b>` }),
        util.el('span', { class: 'history-stat', html: `за неделю: <b>${stats.week}</b>` })
      );
    }

    const render = async (query) => {
      const data = await api.history.list(query, { order: orderSelect.value, limit: 1000 });
      list.innerHTML = '';
      if (!data.length) {
        list.append(util.el('div', { class: 'list-empty', text: query ? 'Ничего не найдено' : 'История пуста' }));
        return;
      }
      let lastDay = '';
      const grouped = orderSelect.value === 'recent' && !query;
      data.forEach((item) => {
        const stamp = item.lastVisitAt || item.visitedAt;
        if (grouped) {
          const day = new Date(stamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
          if (day !== lastDay) {
            lastDay = day;
            list.append(util.el('div', { class: 'list-day', text: day }));
          }
        }
        const visits = Number(item.visitCount) || 1;
        const row = util.el('div', { class: 'list-item' }, [
          util.el('span', { class: 'list-icon' }, [util.faviconNode({ favicon: item.favicon, url: item.url, title: item.title, size: 16 })]),
          util.el('div', { class: 'list-main' }, [
            util.el('div', { class: 'list-title', text: item.title || item.url }),
            util.el('div', { class: 'list-sub', text: `${util.prettyUrl(item.url)} • ${util.formatDate(stamp)}${visits > 1 ? ` • посещений: ${visits}` : ''}` }),
          ]),
          util.el('div', { class: 'list-actions' }, [
            util.el('button', {
              class: 'icon-action',
              title: 'Открыть в новой вкладке',
              html: BP.icons.svg('external', 16),
              onclick: () => BP.tabs.create({ url: item.url, background: true }),
            }),
            util.el('button', {
              class: 'icon-action',
              title: 'Удалить из истории',
              html: BP.icons.svg('trash', 16),
              onclick: async () => {
                await api.history.remove(item.id);
                await Promise.all([render(search.value), renderStats()]);
              },
            }),
          ]),
        ]);
        row.addEventListener('click', (event) => {
          if (event.target.closest('.icon-action')) return;
          BP.tabs.navigateUrl(BP.tabs.getActive(), item.url);
          if (panelController) panelController.close();
        });
        list.append(row);
      });
    };

    search.addEventListener('input', util.debounce(() => render(search.value), 160));
    orderSelect.addEventListener('change', () => render(search.value));

    const exportButton = util.el('button', { class: 'btn small', text: 'Экспорт' });
    exportButton.addEventListener('click', async () => {
      const result = await api.history.exportFile();
      if (result && result.ok) BP.toast(`Экспортировано записей: ${result.count}`, 'ok');
    });

    const importButton = util.el('button', { class: 'btn small', text: 'Импорт' });
    importButton.addEventListener('click', async () => {
      const result = await api.history.importFile();
      if (result && result.ok) {
        BP.toast(`Импортировано: ${result.added}, всего: ${result.total}`, 'ok');
        await Promise.all([render(search.value), renderStats()]);
      } else if (result && result.error) {
        BP.toast('Не удалось импортировать файл');
      }
    });

    const clearButton = util.el('button', { class: 'btn small danger', text: 'Очистить историю' });
    clearButton.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Очистить историю?', message: 'Вся история посещений будет удалена безвозвратно.', confirmLabel: 'Удалить', danger: true });
      if (!ok) return;
      await api.history.clear();
      await Promise.all([render(''), renderStats()]);
      BP.toast('История очищена', 'ok');
    });

    openModal({
      title: 'История посещений',
      icon: 'history',
      render(body, controller) {
        const wrap = util.el('div', { class: 'history-wrap' }, [
          statsBar,
          util.el('div', { class: 'list-toolbar' }, [search, orderSelect, exportButton, importButton, clearButton]),
          list,
        ]);
        body.append(wrap);
        panelController = controller;
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          historyPanelOpen = false;
          originalClose();
        };
      },
    });

    await renderStats();
    render('');
  }

  // ── Закладки ───────────────────────────────────────────────────────────
  async function openBookmarks() {
    const list = util.el('div', { class: 'list' });
    const search = util.el('input', { class: 'field', type: 'text', placeholder: 'Поиск по закладкам', spellcheck: 'false' });

    const render = async (query = '') => {
      const data = await api.bookmarks.list();
      const lower = query.trim().toLowerCase();
      const filtered = lower
        ? data.filter((item) => (item.title || '').toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
        : data;
      list.innerHTML = '';
      if (!filtered.length) {
        list.append(util.el('div', { class: 'list-empty', text: data.length ? 'Ничего не найдено' : 'Закладок пока нет' }));
        return;
      }
      filtered.forEach((item) => {
        const row = util.el('div', { class: 'list-item' }, [
          util.el('span', { class: 'list-icon' }, [util.faviconNode({ favicon: item.favicon, url: item.url, title: item.title, size: 16 })]),
          util.el('div', { class: 'list-main' }, [
            util.el('div', { class: 'list-title', text: item.title || item.url }),
            util.el('div', { class: 'list-sub', text: util.prettyUrl(item.url) }),
          ]),
          util.el('div', { class: 'list-actions' }, [
            util.el('button', { class: 'icon-action', title: 'Открыть в новой вкладке', html: BP.icons.svg('external', 16), onclick: () => BP.tabs.create({ url: item.url, background: true }) }),
            util.el('button', {
              class: 'icon-action',
              title: 'Изменить',
              html: BP.icons.svg('settings', 16),
              onclick: async () => {
                const values = await prompt({
                  title: 'Изменить закладку',
                  fields: [
                    { name: 'title', label: 'Название', value: item.title },
                    { name: 'url', label: 'Адрес', value: item.url },
                  ],
                });
                if (!values) return;
                await api.bookmarks.update({ id: item.id, title: values.title, url: values.url });
                render(search.value);
                BP.ui.renderBookmarksBar();
              },
            }),
            util.el('button', {
              class: 'icon-action',
              title: 'Удалить',
              html: BP.icons.svg('trash', 16),
              onclick: async () => {
                await api.bookmarks.remove(item.id);
                render(search.value);
                BP.ui.renderBookmarksBar();
                BP.ui.updateStar();
              },
            }),
          ]),
        ]);
        row.addEventListener('click', (event) => {
          if (event.target.closest('.icon-action')) return;
          BP.tabs.navigateUrl(BP.tabs.getActive(), item.url);
        });
        list.append(row);
      });
    };

    search.addEventListener('input', util.debounce(() => render(search.value), 160));

    const addButton = util.el('button', { class: 'btn small primary', text: 'Добавить текущую страницу' });
    addButton.addEventListener('click', () => {
      const tab = BP.tabs.getActive();
      if (!tab || tab.isNewTab || !tab.url) {
        BP.toast('Откройте страницу, чтобы добавить её в закладки');
        return;
      }
      api.bookmarks.add({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon }).then(() => {
        BP.toast('Добавлено в закладки', 'ok');
        render(search.value);
        BP.ui.renderBookmarksBar();
        BP.ui.updateStar();
      });
    });

    const exportButton = util.el('button', { class: 'btn small', text: 'Экспорт' });
    exportButton.addEventListener('click', async () => {
      const result = await api.bookmarks.exportFile();
      if (result && result.ok) BP.toast(`Экспортировано закладок: ${result.count}`, 'ok');
    });

    const importButton = util.el('button', { class: 'btn small', text: 'Импорт' });
    importButton.addEventListener('click', async () => {
      const result = await api.bookmarks.importFile();
      if (result && result.ok) {
        BP.toast(`Импортировано: ${result.added}, всего: ${result.total}`, 'ok');
        render(search.value);
        BP.ui.renderBookmarksBar();
      } else if (result && result.error) {
        BP.toast('Не удалось импортировать файл');
      }
    });

    openModal({
      title: 'Закладки',
      icon: 'bookmark',
      render(body) {
        body.append(
          util.el('div', { style: 'display:flex;flex-direction:column;width:100%;min-height:0' }, [
            util.el('div', { class: 'list-toolbar' }, [search, exportButton, importButton, addButton]),
            list,
          ])
        );
      },
    });

    render('');
  }

  // ── Загрузки ───────────────────────────────────────────────────────────
  function downloadStatus(record) {
    if (record.state === 'progressing') {
      const percent = record.totalBytes ? Math.round((record.receivedBytes / record.totalBytes) * 100) : 0;
      return `${util.formatBytes(record.receivedBytes)}${record.totalBytes ? ` из ${util.formatBytes(record.totalBytes)}` : ''}${record.paused ? ' • пауза' : ` • ${percent}%`}`;
    }
    if (record.state === 'completed') return `${util.formatBytes(record.receivedBytes)} • завершено`;
    if (record.state === 'cancelled') return 'отменено';
    return 'прервано';
  }

  function renderDownloads(listEl, records) {
    listEl.innerHTML = '';
    if (!records.length) {
      listEl.append(util.el('div', { class: 'list-empty', text: 'Загрузок пока нет' }));
      return;
    }
    records.forEach((record) => {
      const actions = util.el('div', { class: 'list-actions' });
      if (record.state === 'progressing') {
        actions.append(
          util.el('button', {
            class: 'icon-action',
            title: record.paused ? 'Продолжить' : 'Пауза',
            html: BP.icons.svg(record.paused ? 'reload' : 'min', 16),
            onclick: () => api.downloads.action({ id: record.id, action: 'pause' }),
          }),
          util.el('button', { class: 'icon-action', title: 'Отменить', html: BP.icons.svg('close', 16), onclick: () => api.downloads.action({ id: record.id, action: 'cancel' }) })
        );
      } else if (record.state === 'completed') {
        actions.append(
          util.el('button', { class: 'icon-action', title: 'Открыть файл', html: BP.icons.svg('external', 16), onclick: () => api.downloads.action({ id: record.id, action: 'open' }) }),
          util.el('button', { class: 'icon-action', title: 'Показать в папке', html: BP.icons.svg('folder', 16), onclick: () => api.downloads.action({ id: record.id, action: 'show' }) })
        );
      }
      actions.append(util.el('button', { class: 'icon-action', title: 'Убрать из списка', html: BP.icons.svg('trash', 16), onclick: () => api.downloads.action({ id: record.id, action: 'remove' }) }));

      const main = util.el('div', { class: 'list-main' }, [
        util.el('div', { class: 'list-title', text: record.filename }),
        util.el('div', { class: 'list-sub', text: downloadStatus(record) }),
      ]);
      if (record.state === 'progressing') {
        const percent = record.totalBytes ? Math.round((record.receivedBytes / record.totalBytes) * 100) : 0;
        main.append(util.el('div', { class: 'progress' }, [util.el('span', { style: `width:${percent}%` })]));
      }

      const badge =
        record.state === 'completed'
          ? util.el('span', { class: 'badge ok', text: 'готово' })
          : record.state === 'progressing'
          ? util.el('span', { class: 'badge', text: 'загрузка' })
          : util.el('span', { class: 'badge err', text: record.state === 'cancelled' ? 'отменено' : 'ошибка' });

      listEl.append(
        util.el('div', { class: 'list-item' }, [badge, main, actions])
      );
    });
  }

  async function openDownloads() {
    // Не открываем вторую копию панели: новые загрузки могут дёргать её
    // повторно, пока окно «Загрузки» уже открыто.
    if (downloadsPanelOpen) return;
    downloadsPanelOpen = true;
    const list = util.el('div', { class: 'list' });
    const records = await api.downloads.list();
    renderDownloads(list, records);

    const clearButton = util.el('button', { class: 'btn small', text: 'Очистить завершённые' });
    clearButton.addEventListener('click', async () => {
      await api.downloads.clear();
      const updated = await api.downloads.list();
      renderDownloads(list, updated);
    });

    openModal({
      title: 'Загрузки',
      icon: 'downloads',
      render(body, controller) {
        body.append(
          util.el('div', { style: 'display:flex;flex-direction:column;width:100%;min-height:0' }, [
            util.el('div', { class: 'list-toolbar' }, [
              util.el('div', { style: 'flex:1 1 auto;color:var(--text-dim)', text: `${records.length} элемент(ов)` }),
              clearButton,
            ]),
            list,
          ])
        );
        controller.overlay.dataset.panel = 'downloads';
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          downloadsPanelOpen = false;
          originalClose();
        };
      },
    });
  }

  function updateDownloadsPanel(records) {
    state.downloads = records;
    if (!downloadsPanelOpen) return;
    const overlay = document.querySelector('.overlay[data-panel="downloads"]');
    if (!overlay) return;
    const list = overlay.querySelector('.list');
    if (list) renderDownloads(list, records);
  }

  // ── Плагины и расширения ───────────────────────────────────────────────
  async function openExtensions() {
    let listEl;
    const render = async () => {
      if (!listEl) return;
      listEl.innerHTML = '';
      let exts = [];
      try {
        if (api.extensions && api.extensions.list) exts = await api.extensions.list();
      } catch (error) {
        console.error('[extensions] Не удалось получить список:', error);
      }
      if (!exts.length) {
        listEl.append(util.el('div', { class: 'list-empty', text: 'Нет установленных плагинов' }));
        return;
      }
      for (const ext of exts) {
        const enabled = ext.enabled !== false;
        const row = util.el('div', { class: 'list-item' }, [
          util.el('span', { class: 'list-icon', html: BP.icons.svg('extension', 18) }),
          util.el('div', { class: 'list-main' }, [
            util.el('div', { class: 'list-title', text: ext.name || ext.id }),
            util.el('div', { class: 'list-sub', text: [ext.version, ext.description].filter(Boolean).join(' • ') || ext.id }),
          ]),
          util.el('div', { class: 'list-actions' }, [
            util.el('button', { class: `switch${enabled ? ' on' : ''}`, type: 'button', role: 'switch', title: enabled ? 'Отключить' : 'Включить' }),
            util.el('button', {
              class: 'icon-action',
              title: 'Удалить',
              html: BP.icons.svg('trash', 16),
              onclick: async (event) => {
                event.stopPropagation();
                const ok = await confirmDialog({ title: 'Удалить плагин?', message: `Удалить плагин «${ext.name || ext.id}»?`, confirmLabel: 'Удалить', danger: true });
                if (!ok) return;
                if (api.extensions && api.extensions.remove) await api.extensions.remove(ext.id);
                render();
                BP.toast('Плагин удалён', 'ok');
              },
            }),
          ]),
        ]);
        const toggle = row.querySelector('.switch');
        if (toggle) {
          toggle.addEventListener('click', async (event) => {
            event.stopPropagation();
            const next = !toggle.classList.contains('on');
            if (api.extensions && api.extensions.setEnabled) {
              await api.extensions.setEnabled(ext.id, next);
            }
            toggle.classList.toggle('on', next);
          });
        }
        listEl.append(row);
      }
    };

    const openDirButton = util.el('button', { class: 'btn small', text: 'Открыть папку плагинов' });
    openDirButton.addEventListener('click', async () => {
      if (api.extensions && api.extensions.openDir) await api.extensions.openDir();
    });

    openModal({
      title: 'Плагины',
      icon: 'extension',
      render(body) {
        body.append(
          util.el('div', { style: 'display:flex;flex-direction:column;width:100%;min-height:0' }, [
            util.el('div', { class: 'list-toolbar' }, [util.el('div', { style: 'flex:1 1 auto;color:var(--text-dim)', text: 'Управление установленными плагинами' }), openDirButton]),
            (listEl = util.el('div', { class: 'list' })),
          ])
        );
        render();
      },
    });
  }

  // ── Сведения о сайте ───────────────────────────────────────────────────
  function openSiteInfo(tab) {
    if (!tab || tab.isNewTab || !tab.url) return;
    const url = tab.url;
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    const https = /^https:/i.test(url);
    const grid = util.el('dl', { class: 'about-grid' });
    const rows = [
      ['Адрес', url],
      ['Протокол', parsed ? parsed.protocol.replace(':', '') : '—'],
      ['Соединение', https ? '🔒 Защищённое (HTTPS)' : '⚠️ Незащищённое'],
      ['Хост', parsed ? parsed.host : '—'],
      ['Масштаб', `${Math.round((tab.zoom || 1) * 100)} %`],
    ];
    rows.forEach(([key, value]) => grid.append(util.el('dt', { text: key }), util.el('dd', { text: value })));

    openModal({
      title: 'Сведения о странице',
      size: 'small',
      icon: 'info',
      render(body) {
        body.append(
          util.el('div', { style: 'width:100%' }, [
            grid,
            util.el('div', { class: 'btn-row', style: 'padding:0 22px 20px' }, [
              util.el('button', { class: 'btn small', text: 'Копировать адрес', onclick: () => { navigator.clipboard.writeText(url); BP.toast('Адрес скопирован', 'ok'); } }),
              util.el('button', { class: 'btn small', text: 'Открыть в системном браузере', onclick: () => api.app.openExternal(url) }),
            ]),
          ])
        );
      },
    });
  }

  // ── Быстрые ссылки ─────────────────────────────────────────────────────
  async function promptQuickLink() {
    const values = await prompt({
      title: 'Добавить быструю ссылку',
      fields: [
        { name: 'title', label: 'Название', placeholder: 'Например: Новости' },
        { name: 'url', label: 'Адрес', placeholder: 'https://example.com' },
      ],
      submitLabel: 'Добавить',
    });
    if (!values || !values.url) return;
    const url = util.normalizeUrl(values.url);
    const links = Array.isArray(state.settings.quickLinks) ? [...state.settings.quickLinks] : [];
    links.push({ title: values.title || util.hostOf(url), url });
    await BP.settings.set('quickLinks', links);
    BP.ui.renderQuickLinks();
    BP.toast('Ссылка добавлена', 'ok');
  }

  // ── Контекстное меню вкладки (в т.ч. группы) ───────────────────────────
  function hideTabMenu() {
    document.getElementById('tab-menu').classList.add('hidden');
  }

  function openTabMenu(tabId, x, y) {
    const tab = BP.tabs.findById(tabId);
    if (!tab) return;
    const popup = document.getElementById('tab-menu');
    popup.innerHTML = '';

    const addItem = (label, action, options = {}) => {
      const { icon = '', disabled = false } = options;
      const node = util.el('button', { class: `menu-item${disabled ? ' disabled' : ''}` }, [
        util.el('span', { class: 'menu-icon', html: icon ? BP.icons.svg(icon, 17) : '' }),
        util.el('span', { text: label }),
      ]);
      if (!disabled && typeof action === 'function') {
        node.addEventListener('click', () => {
          hideTabMenu();
          action();
        });
      }
      popup.append(node);
    };
    const addSep = () => popup.append(util.el('div', { class: 'menu-sep' }));
    const addHeader = (label) => popup.append(util.el('div', { class: 'menu-header', text: label }));

    const groups = state.tabGroups || [];
    const current = tab.groupId ? BP.tabs.groupOf(tab.groupId) : null;

    addItem('Новая вкладка', () => BP.tabs.create({ activate: true }), { icon: 'plus' });
    addItem('Перезагрузить', () => {
      BP.tabs.select(tabId);
      BP.tabs.act('reload');
    }, { icon: 'reload' });
    addItem('Дублировать вкладку', () => BP.tabs.create({ url: tab.isNewTab ? undefined : tab.url }), { icon: 'window' });
    addItem(tab.pinned ? 'Открепить вкладку' : 'Закрепить вкладку', () => BP.tabs.togglePinned(tabId), { icon: 'pin' });
    if (!tab.isNewTab) addItem(tab.muted ? 'Включить звук' : 'Выключить звук', () => BP.tabs.toggleMute(tabId), { icon: tab.muted ? 'volume-on' : 'volume-off' });
    addSep();

    if (BP.tabs.groupsEnabled()) {
      if (!current) {
        addItem('Новая группа…', async () => {
          const values = await prompt({
            title: 'Новая группа вкладок',
            fields: [{ name: 'name', label: 'Название группы', placeholder: 'Например: Работа' }],
            submitLabel: 'Создать',
          });
          if (!values) return;
          const group = BP.tabs.createGroup(values.name || undefined);
          BP.tabs.assignToGroup(tabId, group.id);
        }, { icon: 'layers' });

        if (groups.length) {
          addHeader('Добавить в группу');
          groups.forEach((group) => addItem(group.name, () => BP.tabs.assignToGroup(tabId, group.id), { icon: 'layers' }));
        }
      } else {
        addHeader(`Группа: ${current.name}`);
        addItem(current.collapsed ? 'Развернуть группу' : 'Свернуть группу', () => BP.tabs.toggleGroupCollapsed(current.id), { icon: current.collapsed ? 'down' : 'right' });
        addItem('Переименовать группу…', async () => {
          const values = await prompt({
            title: 'Группа вкладок',
            fields: [{ name: 'name', label: 'Название', value: current.name }],
          });
          if (!values) return;
          BP.tabs.renameGroup(current.id, values.name);
        }, { icon: 'edit' });
        addItem('Убрать из группы', () => BP.tabs.assignToGroup(tabId, null), { icon: 'close' });
        addItem('Закрыть группу', () => BP.tabs.closeGroup(current.id), { icon: 'trash' });

        const others = groups.filter((group) => group.id !== current.id);
        if (others.length) {
          addHeader('Переместить в группу');
          others.forEach((group) => addItem(group.name, () => BP.tabs.assignToGroup(tabId, group.id), { icon: 'layers' }));
        }
      }
      addSep();
    }

    addItem('Закрыть вкладку', () => BP.tabs.close(tabId), { icon: 'close' });
    addItem('Закрыть другие вкладки', () => BP.tabs.closeOthers(tabId));
    addItem('Закрыть вкладки справа', () => BP.tabs.closeToRight(tabId));

    popup.classList.remove('hidden');
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    popup.style.left = `${Math.max(8, Math.min(x, Math.max(8, window.innerWidth - width - 8)))}px`;
    popup.style.top = `${Math.max(8, Math.min(y, Math.max(8, window.innerHeight - height - 8)))}px`;
  }

  // ── Профили ────────────────────────────────────────────────────────────
  async function switchToProfile(id) {
    if (state.profile && id === state.profile.id) {
      BP.toast('Этот профиль уже открыт');
      return;
    }
    const ok = await confirmDialog({
      title: 'Сменить профиль?',
      message: 'Браузер перезапустится с выбранным профилем.',
      detail: 'У каждого профиля свои настройки, история, закладки и входы на сайтах.',
      confirmLabel: 'Перезапустить',
    });
    if (!ok) return;
    await api.profiles.switch(id);
  }

  async function openProfileMenu(anchor) {
    const popup = document.getElementById('menu-popup');
    popup.innerHTML = '';

    const addItem = (label, action, options = {}) => {
      const { icon = '', active = false } = options;
      const node = util.el('button', { class: 'menu-item' }, [
        util.el('span', { class: 'menu-icon', html: icon ? BP.icons.svg(icon, 18) : '' }),
        util.el('span', { text: label }),
        active ? util.el('span', { class: 'menu-accel', text: '●' }) : null,
      ]);
      if (typeof action === 'function') {
        node.addEventListener('click', () => {
          hideMenu();
          action();
        });
      }
      popup.append(node);
    };

    popup.append(util.el('div', { class: 'menu-header', text: 'Профили' }));

    let data = { items: [], active: null };
    try {
      data = await api.profiles.list();
    } catch {
      /* ignore */
    }
    data.items.forEach((profile) => {
      addItem(profile.name, () => switchToProfile(profile.id), {
        icon: 'user',
        active: state.profile ? profile.id === state.profile.id : false,
      });
    });

    popup.append(util.el('div', { class: 'menu-sep' }));
    addItem('Создать профиль…', () => createProfileFlow(), { icon: 'plus' });
    addItem('Управление профилями…', () => openProfileManager(), { icon: 'edit' });

    popup.classList.remove('hidden');
    const rect = anchor ? anchor.getBoundingClientRect() : { right: window.innerWidth - 12, bottom: 60 };
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    popup.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8))}px`;
  }

  async function openProfileManager() {
    const list = util.el('div', { class: 'profile-list' });

    const render = async () => {
      const data = await api.profiles.list();
      list.innerHTML = '';
      if (!data.items.length) {
        list.append(util.el('div', { class: 'list-empty', text: 'Профилей пока нет' }));
        return;
      }
      data.items.forEach((profile) => {
        const active = profile.id === data.active;
        const actions = util.el('div', { class: 'list-actions' });
        if (active) {
          actions.append(util.el('span', { class: 'badge ok', text: 'активен' }));
        } else {
          actions.append(util.el('button', { class: 'btn small primary', text: 'Открыть', onclick: () => switchToProfile(profile.id) }));
        }
        actions.append(
          util.el('button', {
            class: 'icon-action',
            title: 'Переименовать',
            html: BP.icons.svg('edit', 16),
            onclick: async () => {
              const values = await prompt({ title: 'Изменить профиль', fields: [{ name: 'name', label: 'Название', value: profile.name }] });
              if (!values) return;
              await api.profiles.update({ id: profile.id, name: values.name, color: profile.color });
              render();
            },
          })
        );
        // Активный профиль удалять нельзя: приложение продолжает работать
        // с ним, а его папка была бы стёрта. Сначала нужно переключиться.
        if (profile.id !== 'default' && !active) {
          actions.append(
            util.el('button', {
              class: 'icon-action',
              title: 'Удалить',
              html: BP.icons.svg('trash', 16),
              onclick: async () => {
                const ok = await confirmDialog({
                  title: 'Удалить профиль?',
                  message: `Профиль «${profile.name}» и все его данные будут удалены безвозвратно.`,
                  confirmLabel: 'Удалить',
                  danger: true,
                });
                if (!ok) return;
                await api.profiles.remove(profile.id);
                render();
              },
            })
          );
        }

        list.append(
          util.el('div', { class: `profile-row${active ? ' active' : ''}` }, [
            util.el('span', { class: 'profile-initial big', style: `background:${profile.color}`, text: util.initialOf(profile.name) }),
            util.el('div', { class: 'list-main' }, [
              util.el('div', { class: 'list-title', text: profile.name }),
              util.el('div', { class: 'list-sub', text: active ? 'Текущий профиль' : 'Нажмите «Открыть», чтобы переключиться' }),
            ]),
            actions,
          ])
        );
      });
    };

    const createButton = util.el('button', { class: 'btn small primary', text: 'Создать профиль', onclick: () => createProfileFlow() });

    openModal({
      title: 'Профили',
      icon: 'user',
      render(body) {
        body.append(
          util.el('div', { class: 'profile-wrap' }, [
            util.el('p', { class: 'panel-note', text: 'У каждого профиля отдельные настройки, история, закладки, cookie и входы на сайтах. Переключение перезапускает браузер.' }),
            list,
            util.el('div', { class: 'list-toolbar' }, [createButton]),
          ])
        );
      },
    });

    await render();
  }

  async function createProfileFlow() {
    const values = await prompt({
      title: 'Новый профиль',
      message: 'Профиль получит отдельные настройки, историю, закладки и входы на сайтах.',
      fields: [{ name: 'name', label: 'Название профиля', placeholder: 'Например: Работа' }],
      submitLabel: 'Создать',
    });
    if (!values) return;
    const result = await api.profiles.create({ name: values.name });
    BP.toast(`Профиль «${result.item.name}» создан`, 'ok');

    const ok = await confirmDialog({
      title: 'Открыть новый профиль?',
      message: 'Браузер перезапустится с новым профилем.',
      confirmLabel: 'Открыть',
    });
    if (ok) await api.profiles.switch(result.item.id);
  }

  // ── Список вкладок и недавно закрытые (Ctrl+Shift+A) ───────────────────
  function openTabSwitcher() {
    const list = util.el('div', { class: 'list' });
    const search = util.el('input', { class: 'field', type: 'text', placeholder: 'Поиск по открытым вкладкам', spellcheck: 'false' });

    const render = (query = '') => {
      const lower = query.trim().toLowerCase();
      list.innerHTML = '';
      const tabs = state.tabs || [];
      const filtered = tabs.filter((tab) => {
        if (!lower) return true;
        return `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(lower);
      });

      if (!filtered.length) {
        list.append(util.el('div', { class: 'list-empty', text: tabs.length ? 'Ничего не найдено' : 'Нет открытых вкладок' }));
      } else {
        list.append(util.el('div', { class: 'menu-header', text: `Открытые вкладки • ${tabs.length}` }));
        filtered.forEach((tab) => {
          const active = tab.id === state.activeTabId;
          const row = util.el('div', { class: `list-item switcher-item${active ? ' current' : ''}` }, [
            util.el('span', { class: 'list-icon' }, [util.faviconNode({ favicon: tab.favicon, url: tab.url, title: tab.title, size: 16 })]),
            util.el('div', { class: 'list-main' }, [
              util.el('div', { class: 'list-title', text: `${tab.pinned ? '📌 ' : ''}${tab.title || util.prettyUrl(tab.url) || 'Новая вкладка'}` }),
              util.el('div', { class: 'list-sub', text: tab.isNewTab ? 'Новая вкладка' : util.prettyUrl(tab.url) }),
            ]),
            util.el('div', { class: 'list-actions' }, [
              active ? util.el('span', { class: 'badge ok', text: 'текущая' }) : null,
              util.el('button', {
                class: 'icon-action',
                title: 'Закрыть вкладку',
                html: BP.icons.svg('close', 16),
                onclick: (event) => {
                  event.stopPropagation();
                  BP.tabs.close(tab.id);
                  render(search.value);
                },
              }),
            ]),
          ]);
          row.addEventListener('click', () => {
            closeTopModal();
            BP.tabs.select(tab.id);
          });
          list.append(row);
        });
      }

      const closed = (state.closedTabs || []).slice().reverse();
      if (closed.length && !lower) {
        list.append(util.el('div', { class: 'menu-header', text: 'Недавно закрытые' }));
        closed.slice(0, 12).forEach((item) => {
          const row = util.el('div', { class: 'list-item' }, [
            util.el('span', { class: 'list-icon' }, [util.faviconNode({ favicon: item.favicon, url: item.url, title: item.title, size: 16 })]),
            util.el('div', { class: 'list-main' }, [
              util.el('div', { class: 'list-title', text: item.title || util.prettyUrl(item.url) }),
              util.el('div', { class: 'list-sub', text: util.prettyUrl(item.url) }),
            ]),
          ]);
          row.addEventListener('click', () => {
            closeTopModal();
            BP.tabs.create({ url: item.url, pinned: !!item.pinned, activate: true });
          });
          list.append(row);
        });
      }
    };

    search.addEventListener('input', () => render(search.value));

    openModal({
      title: 'Вкладки',
      icon: 'layers',
      render(body) {
        body.append(
          util.el('div', { style: 'display:flex;flex-direction:column;width:100%;min-height:0' }, [
            util.el('div', { class: 'list-toolbar' }, [search]),
            list,
          ])
        );
        render('');
        setTimeout(() => search.focus(), 30);
      },
    });
  }

  // ── Шпаргалка по горячим клавишам (F1) ─────────────────────────────────
  const SHORTCUTS = [
    ['Ctrl+T', 'Новая вкладка'],
    ['Ctrl+N', 'Новое окно'],
    ['Ctrl+Shift+N', 'Окно в режиме инкогнито'],
    ['Ctrl+W', 'Закрыть вкладку'],
    ['Ctrl+Shift+T', 'Восстановить закрытую вкладку'],
    ['Ctrl+Tab', 'Следующая вкладка'],
    ['Ctrl+Shift+Tab', 'Предыдущая вкладка'],
    ['Ctrl+1…9', 'Перейти к вкладке по номеру'],
    ['Ctrl+Shift+A', 'Список открытых вкладок'],
    ['Ctrl+Shift+P', 'Палитра команд'],
    ['Ctrl+L / Alt+D', 'Перейти в адресную строку'],
    ['Ctrl+D', 'Добавить страницу в закладки'],
    ['Ctrl+Shift+O', 'Все закладки'],
    ['Ctrl+H', 'История'],
    ['Ctrl+J', 'Загрузки'],
    ['Ctrl+F', 'Найти на странице'],
    ['Ctrl+Shift+S', 'Снимок страницы'],
    ['Ctrl+M', 'Выключить звук вкладки'],
    ['Ctrl+Plus / Ctrl+Minus', 'Масштаб страницы'],
    ['Ctrl+0', 'Обычный масштаб'],
    ['F5 / Ctrl+R', 'Обновить страницу'],
    ['Ctrl+Shift+R', 'Обновить без кэша'],
    ['Alt+Left / Alt+Right', 'Назад / Вперёд'],
    ['Alt+Home', 'Домашняя страница'],
    ['F11', 'Полноэкранный режим'],
    ['Ctrl+Shift+I', 'Инструменты разработчика'],
    ['Ctrl+,', 'Настройки'],
    ['Ctrl+Shift+Delete', 'Очистить данные'],
    ['F1', 'Эта шпаргалка'],
  ];

  function openShortcuts() {
    const grid = util.el('dl', { class: 'about-grid shortcut-grid' });
    SHORTCUTS.forEach(([keys, label]) => {
      grid.append(util.el('dt', {}, [util.el('kbd', { class: 'kbd', text: keys })]), util.el('dd', { text: label }));
    });
    openModal({
      title: 'Горячие клавиши',
      icon: 'keyboard',
      render(body) {
        body.append(util.el('div', { style: 'width:100%' }, [grid]));
      },
    });
  }

  // ── Очистка данных с выбором типов и периода (Ctrl+Shift+Delete) ───────
  function openClearData() {
    const choices = [
      { value: 'history', label: 'История посещений', checked: true },
      { value: 'cookies', label: 'Cookie и вход на сайтах', checked: true },
      { value: 'cache', label: 'Кэш файлов', checked: true },
      { value: 'storage', label: 'Локальное хранилище сайтов', checked: false },
      { value: 'downloads', label: 'Список загрузок', checked: false },
    ];
    const checks = new Map();
    const optionsBox = util.el('div', { class: 'clear-options' });
    choices.forEach((choice) => {
      const input = util.el('input', { type: 'checkbox' });
      input.checked = choice.checked;
      checks.set(choice.value, input);
      optionsBox.append(util.el('label', { class: 'clear-option' }, [input, util.el('span', { text: choice.label })]));
    });

    const period = util.el('select', { class: 'field' });
    [
      { value: '3600000', label: 'За последний час' },
      { value: '86400000', label: 'За последние 24 часа' },
      { value: '604800000', label: 'За последнюю неделю' },
      { value: '2592000000', label: 'За последние 4 недели' },
      { value: '0', label: 'За всё время' },
    ].forEach((opt) => period.append(util.el('option', { value: opt.value, text: opt.label })));
    period.value = '86400000';

    openModal({
      title: 'Очистить данные',
      icon: 'broom',
      render(body) {
        const runButton = util.el('button', { class: 'btn primary', text: 'Очистить данные' });
        runButton.addEventListener('click', async () => {
          const options = {};
          for (const [key, input] of checks) if (input.checked) options[key] = true;
          if (!Object.keys(options).length) {
            BP.toast('Выберите, что очистить');
            return;
          }
          const offset = Number(period.value) || 0;
          if (offset > 0) options.since = Date.now() - offset;
          runButton.disabled = true;
          try {
            const done = await api.session.clearData(options);
            const labels = { history: 'история', cookies: 'cookie', cache: 'кэш', storage: 'хранилище', downloads: 'загрузки' };
            const text = (Array.isArray(done) ? done : []).map((key) => labels[key] || key).join(', ');
            BP.toast(text ? `Очищено: ${text}` : 'Нечего очищать', 'ok');
            closeTopModal();
            if (historyPanelOpen) openHistory();
          } finally {
            runButton.disabled = false;
          }
        });

        body.append(
          util.el('div', { style: 'width:100%;display:flex;flex-direction:column;gap:14px' }, [
            util.el('div', { class: 'setting-hint', text: 'Период применяется к истории посещений. Cookie, кэш и хранилище очищаются целиком.' }),
            optionsBox,
            util.el('div', { class: 'setting' }, [
              util.el('div', { class: 'setting-info' }, [util.el('span', { class: 'setting-label', text: 'За какой период' })]),
              util.el('div', { class: 'setting-control' }, [period]),
            ]),
            util.el('div', { class: 'btn-row', style: 'justify-content:flex-end' }, [runButton]),
          ])
        );
      },
    });
  }

  // ── Главное меню (⋮) ───────────────────────────────────────────────────
  function openMainMenu(anchor) {
    const popup = document.getElementById('menu-popup');
    popup.innerHTML = '';

    const entries = [
      { icon: 'plus', label: 'Новая вкладка', accel: 'Ctrl+T', action: () => BP.tabs.create({ activate: true }) },
      { icon: 'window', label: 'Новое окно', accel: 'Ctrl+N', action: () => api.app.newWindow() },
      { icon: 'incognito', label: 'Новое окно инкогнито', accel: 'Ctrl+Shift+N', action: () => api.app.newWindow({ incognito: true }) },
      { icon: 'reload', label: 'Восстановить закрытую вкладку', accel: 'Ctrl+Shift+T', action: () => BP.tabs.reopenClosed() },
      { icon: 'command', label: 'Палитра команд', accel: 'Ctrl+Shift+P', action: () => BP.palette && BP.palette.open() },
      { icon: 'layers', label: 'Список вкладок', accel: 'Ctrl+Shift+A', action: () => openTabSwitcher() },
      { icon: 'camera', label: 'Снимок страницы', accel: 'Ctrl+Shift+S', action: () => captureScreenshot() },
      { icon: 'keyboard', label: 'Горячие клавиши', accel: 'F1', action: () => openShortcuts() },
      { sep: true },
      { icon: 'history', label: 'История', accel: 'Ctrl+H', action: () => openHistory() },
      { icon: 'bookmark', label: 'Закладки', accel: 'Ctrl+Shift+O', action: () => openBookmarks() },
      { icon: 'downloads', label: 'Загрузки', accel: 'Ctrl+J', action: () => openDownloads() },
      { sep: true },
      { icon: 'user', label: 'Профили', action: () => openProfileMenu(document.getElementById('btn-profile')) },
      { sep: true },
      { icon: 'star', label: 'Добавить в закладки', accel: 'Ctrl+D', action: () => BP.ui.toggleBookmark() },
      { icon: 'search', label: 'Найти на странице', accel: 'Ctrl+F', action: () => BP.ui.openFind() },
      { icon: 'zoom', label: 'Обычный масштаб', accel: 'Ctrl+0', action: () => BP.tabs.resetZoom(BP.tabs.getActive()) },
      { sep: true },
      { icon: 'extension', label: 'Плагины', action: () => openExtensions() },
      { icon: 'settings', label: 'Настройки', accel: 'Ctrl+,', action: () => openSettings() },
      { icon: 'broom', label: 'Очистить данные…', accel: 'Ctrl+Shift+Del', action: () => openClearData() },
      { icon: 'sparkle', label: 'Повторить начальную настройку', action: () => BP.onboarding && BP.onboarding.start() },
      { icon: 'info', label: 'О браузере', action: () => openAbout() },
      { icon: 'tiktok', label: 'TikTok — @mokomail', action: () => api.app.openExternal('https://www.tiktok.com/@mokomail') },
      { icon: 'github', label: 'GitHub — mokomail', action: () => api.app.openExternal('https://github.com/mokomail') },
    ];

    entries.forEach((entry) => {
      if (entry.sep) {
        popup.append(util.el('div', { class: 'menu-sep' }));
        return;
      }
      const node = util.el('button', { class: 'menu-item' }, [
        util.el('span', { class: 'menu-icon', html: BP.icons.svg(entry.icon, 18) }),
        util.el('span', { text: entry.label }),
        entry.accel ? util.el('span', { class: 'menu-accel', text: entry.accel }) : null,
      ]);
      node.addEventListener('click', () => {
        hideMenu();
        entry.action();
      });
      popup.append(node);
    });

    const rect = anchor.getBoundingClientRect();
    popup.classList.remove('hidden');
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    popup.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8))}px`;
  }

  function hideMenu() {
    document.getElementById('menu-popup').classList.add('hidden');
  }

  function openAbout() {
    openModal({
      title: 'О браузере',
      size: 'small',
      icon: 'info',
      render(body) {
        body.append(util.el('div', { style: 'width:100%' }, [createAbout()]));
      },
    });
  }

  let globalsBound = false;
  function init() {
    if (globalsBound) return;
    globalsBound = true;
    document.addEventListener('mousedown', (event) => {
      const popup = document.getElementById('menu-popup');
      if (!popup.classList.contains('hidden')) {
        if (!event.target.closest('#menu-popup') && !event.target.closest('#btn-menu') && !event.target.closest('#btn-profile')) hideMenu();
      }
      const tabMenu = document.getElementById('tab-menu');
      if (!tabMenu.classList.contains('hidden') && !event.target.closest('#tab-menu') && !event.target.closest('.tab')) {
        hideTabMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!document.getElementById('menu-popup').classList.contains('hidden')) {
        hideMenu();
        return;
      }
      if (!document.getElementById('tab-menu').classList.contains('hidden')) {
        hideTabMenu();
        return;
      }
      closeTopModal();
    });
  }

  BP.panels = {
    init,
    openSettings,
    openExtensions,
    openHistory,
    openBookmarks,
    openDownloads,
    updateDownloadsPanel,
    openSiteInfo,
    openAbout,
    openMainMenu,
    openTabMenu,
    openProfileMenu,
    openProfileManager,
    createProfileFlow,
    switchToProfile,
    openTabSwitcher,
    openShortcuts,
    openClearData,
    captureScreenshot,
    hideMenu,
    hideTabMenu,
    prompt,
    promptQuickLink,
    confirmDialog,
    closeTopModal,
  };
})();
