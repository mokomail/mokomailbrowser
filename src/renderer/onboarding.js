'use strict';

/**
 * Первоначальная настройка (мастер первого запуска).
 *
 * Показывается при первом старте в новом профиле: имя профиля, поисковая
 * система, оформление и базовые настройки приватности. Выполнено в стиле
 * Material 3 — с живым предпросмотром темы и опорного цвета.
 */
(function () {
  window.BP = window.BP || {};

  const { util, state } = BP;
  const api = window.browserAPI;

  /** Палитра опорных цветов Material 3. */
  const ACCENTS = [
    '#5b6bff', '#4f6df5', '#7c4dff', '#b45cf0', '#e0518a',
    '#ef5350', '#ff8f3f', '#2bb673', '#00a5a5', '#3d7eff',
  ];

  /** Короткие подписи к поисковым системам. */
  const ENGINE_NOTES = {
    duckduckgo: 'Приватность по умолчанию',
    google: 'Самая популярная',
    yandex: 'Удобно для русскоязычных',
    bing: 'Поиск от Microsoft',
    brave: 'Независимый индекс',
    ecosia: 'Часть прибыли — на деревья',
    startpage: 'Анонимный Google',
    custom: 'Свой адрес поиска',
  };

  let overlay = null;
  let resolveRun = null;
  let stepIndex = 0;

  const draft = () => ({
    profileName: (state.profile && state.profile.name) || 'Основной',
    profileColor: (state.profile && state.profile.color) || ACCENTS[0],
    searchEngine: state.settings.searchEngine || 'duckduckgo',
    customSearchUrl: state.settings.customSearchUrl || 'https://duckduckgo.com/?q=%s',
    homepage: state.settings.homepage || '',
    theme: state.settings.theme || 'dark',
    accentColor: state.settings.accentColor || '#5b6bff',
    blockPopups: state.settings.blockPopups !== false,
    doNotTrack: state.settings.doNotTrack !== false,
    showTopSites: state.settings.showTopSites !== false,
    restoreLastSession: state.settings.restoreLastSession !== false,
  });

  let model = draft();

  const isOpen = () => !!overlay;
  const resolvedMode = (mode) => (mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode);

  /** Живой предпросмотр темы. */
  function preview() {
    const mode = resolvedMode(model.theme);
    document.body.dataset.theme = mode;
    if (BP.material) BP.material.apply(mode, model.accentColor);
  }

  function switchEl(on, onChange) {
    const node = util.el('button', { class: `switch${on ? ' on' : ''}`, type: 'button' });
    node.addEventListener('click', () => {
      const next = !node.classList.contains('on');
      node.classList.toggle('on', next);
      onChange(next);
    });
    return node;
  }

  function toggleRow(title, subtitle, initial, onChange) {
    return util.el('div', { class: 'onboarding-toggle' }, [
      util.el('div', { class: 'onboarding-toggle-text' }, [
        util.el('b', { text: title }),
        subtitle ? util.el('small', { text: subtitle }) : null,
      ]),
      switchEl(initial, onChange),
    ]);
  }

  // ── Шаги ───────────────────────────────────────────────────────────────
  const steps = [
    // 1. Приветствие + имя профиля
    {
      icon: 'rocket',
      title: 'Добро пожаловать в MokomailBrowser',
      text: 'Быстрый браузер на Chromium от команды MokomailTeam. Давайте настроим его под вас — это займёт меньше минуты.',
      render(body) {
        const input = util.el('input', { class: 'field', type: 'text', value: model.profileName, placeholder: 'Например: Личный' });
        input.addEventListener('input', () => { model.profileName = input.value; });

        const swatches = util.el('div', { class: 'onboarding-swatches' });
        ACCENTS.forEach((color) => {
          const swatch = util.el('button', {
            class: `onboarding-swatch${color === model.profileColor ? ' selected' : ''}`,
            type: 'button',
            title: color,
            style: `background:${color}`,
          });
          swatch.addEventListener('click', () => {
            model.profileColor = color;
            util.$$('.onboarding-swatch', swatches).forEach((n) => n.classList.remove('selected'));
            swatch.classList.add('selected');
          });
          swatches.append(swatch);
        });

        body.append(
          util.el('div', { class: 'onboarding-field' }, [
            util.el('span', { text: 'Имя профиля' }),
            input,
          ]),
          util.el('div', { class: 'onboarding-field' }, [
            util.el('span', { text: 'Цвет профиля' }),
            swatches,
          ])
        );
        setTimeout(() => input.focus(), 60);
      },
    },

    // 2. Поисковая система
    {
      icon: 'search',
      title: 'Чем искать в интернете',
      text: 'Этот сервис будет открываться, когда вы вводите в адресную строку запрос, а не адрес.',
      render(body) {
        const engines = api.searchEngines || [];
        const grid = util.el('div', { class: 'onboarding-grid' });
        let customField = null;

        engines.forEach((engine) => {
          const option = util.el('button', {
            class: `onboarding-option${engine.id === model.searchEngine ? ' selected' : ''}`,
            type: 'button',
          }, [
            util.el('span', { class: 'onboarding-option-icon', text: (engine.name[0] || '?').toUpperCase() }),
            util.el('span', {}, [
              util.el('div', { class: 'onboarding-option-name', text: engine.name }),
              util.el('div', { class: 'onboarding-option-sub', text: ENGINE_NOTES[engine.id] || 'Поисковая система' }),
            ]),
          ]);
          option.addEventListener('click', () => {
            const prevEngine = model.searchEngine;
            model.searchEngine = engine.id;
            if (BP.engines && typeof BP.engines.homepageFor === 'function') {
              const target = BP.engines.homepageFor(engine.id, model.homepage, prevEngine);
              if (target) model.homepage = target;
            }
            util.$$('.onboarding-option', grid).forEach((n) => n.classList.remove('selected'));
            option.classList.add('selected');
            if (customField) customField.classList.toggle('hidden', engine.id !== 'custom');
          });
          grid.append(option);
        });

        const custom = util.el('input', { class: 'field', type: 'text', value: model.customSearchUrl, placeholder: 'https://example.com/search?q=%s' });
        custom.addEventListener('input', () => { model.customSearchUrl = custom.value; });
        customField = util.el('div', { class: `onboarding-field${model.searchEngine === 'custom' ? '' : ' hidden'}` }, [
          util.el('span', { text: 'Адрес поиска (вставьте %s вместо запроса)' }),
          custom,
        ]);

        body.append(grid, customField);
      },
    },

    // 3. Оформление
    {
      icon: 'palette',
      title: 'Как должно выглядеть',
      text: 'Выберите тему и акцентный цвет. Цветовая схема построена по правилам Material 3 и меняется на лету.',
      render(body) {
        const themes = [
          { id: 'system', name: 'Как в системе', icon: 'monitor' },
          { id: 'light', name: 'Светлая', icon: 'sun' },
          { id: 'dark', name: 'Тёмная', icon: 'moon' },
        ];
        const grid = util.el('div', { class: 'onboarding-grid' });
        themes.forEach((theme) => {
          const option = util.el('button', {
            class: `onboarding-option${theme.id === model.theme ? ' selected' : ''}`,
            type: 'button',
          }, [
            util.el('span', { class: 'onboarding-option-icon', html: BP.icons.svg(theme.icon, 20) }),
            util.el('span', { class: 'onboarding-option-name', text: theme.name }),
          ]);
          option.addEventListener('click', () => {
            model.theme = theme.id;
            util.$$('.onboarding-option', grid).forEach((n) => n.classList.remove('selected'));
            option.classList.add('selected');
            preview();
          });
          grid.append(option);
        });

        const swatches = util.el('div', { class: 'onboarding-swatches' });
        ACCENTS.forEach((color) => {
          const swatch = util.el('button', {
            class: `onboarding-swatch${color === model.accentColor ? ' selected' : ''}`,
            type: 'button',
            title: color,
            style: `background:${color}`,
          });
          swatch.addEventListener('click', () => {
            model.accentColor = color;
            util.$$('.onboarding-swatch', swatches).forEach((n) => n.classList.remove('selected'));
            swatch.classList.add('selected');
            preview();
          });
          swatches.append(swatch);
        });

        body.append(
          util.el('div', { class: 'onboarding-field' }, [util.el('span', { text: 'Тема оформления' }), grid]),
          util.el('div', { class: 'onboarding-field' }, [util.el('span', { text: 'Акцентный цвет' }), swatches])
        );
      },
    },

    // 4. Приватность и данные
    {
      icon: 'shield',
      title: 'Приватность и данные',
      text: 'Пара полезных настроек по умолчанию. Всё это можно изменить позже в разделе «Настройки».',
      render(body) {
        body.append(
          toggleRow('Блокировать всплывающие окна', 'Навязчивые pop-up не будут мешать', model.blockPopups, (v) => { model.blockPopups = v; }),
          toggleRow('Не отслеживать (Do Not Track)', 'Сообщать сайтам о нежелании слежки', model.doNotTrack, (v) => { model.doNotTrack = v; }),
          toggleRow('Показывать «Часто посещаемые»', 'Плитки из истории на новой вкладке', model.showTopSites, (v) => { model.showTopSites = v; }),
          toggleRow('Восстанавливать вкладки', 'Открывать вкладки прошлой сессии', model.restoreLastSession, (v) => { model.restoreLastSession = v; })
        );
      },
    },

    // 5. Готово
    {
      icon: 'check',
      title: 'Всё готово!',
      text: 'MokomailBrowser настроен. Приятного использования — и заглядывайте в наши соцсети.',
      render(body) {
        const engine = (api.searchEngines || []).find((e) => e.id === model.searchEngine);
        const rows = [
          ['Профиль', model.profileName],
          ['Поиск', engine ? engine.name : model.searchEngine],
          ['Тема', model.theme === 'system' ? 'Как в системе' : model.theme === 'light' ? 'Светлая' : 'Тёмная'],
          ['Акцент', model.accentColor],
        ];
        const summary = util.el('div', { class: 'onboarding-summary' });
        rows.forEach(([key, value]) => {
          summary.append(util.el('div', { class: 'onboarding-summary-row' }, [
            util.el('span', { text: key }),
            util.el('b', { text: value }),
          ]));
        });

        const socials = util.el('div', { class: 'about-socials', style: 'padding:0' }, [
          util.el('button', { class: 'social-btn', type: 'button', onclick: () => api.app.openExternal('https://www.tiktok.com/@mokomail') }, [
            util.el('span', { html: BP.icons.svg('tiktok', 18) }),
            util.el('span', { text: 'TikTok @mokomail' }),
          ]),
          util.el('button', { class: 'social-btn', type: 'button', onclick: () => api.app.openExternal('https://github.com/mokomail') }, [
            util.el('span', { html: BP.icons.svg('github', 18) }),
            util.el('span', { text: 'GitHub mokomail' }),
          ]),
        ]);

        body.append(summary, socials);
      },
    },
  ];

  // ── Отрисовка каркаса ──────────────────────────────────────────────────
  function build() {
    overlay = util.el('div', { class: 'onboarding' });
    const card = util.el('div', { class: 'onboarding-card' });

    const bar = util.el('div', { class: 'onboarding-progress' }, [util.el('span', {})]);
    const body = util.el('div', { class: 'onboarding-body' });
    const foot = util.el('div', { class: 'onboarding-foot' });

    const dots = util.el('div', { class: 'onboarding-dots' });
    steps.forEach(() => dots.append(util.el('span', { class: 'onboarding-dot' })));

    const skip = util.el('button', { class: 'btn small', type: 'button', text: 'Пропустить' });
    const back = util.el('button', { class: 'btn', type: 'button', text: 'Назад' });
    const next = util.el('button', { class: 'btn primary', type: 'button', text: 'Далее' });

    skip.addEventListener('click', () => finish(true));
    back.addEventListener('click', () => { if (stepIndex > 0) { stepIndex -= 1; render(); } });
    next.addEventListener('click', () => {
      if (stepIndex >= steps.length - 1) { finish(false); return; }
      stepIndex += 1;
      render();
    });

    foot.append(dots, skip, back, next);
    card.append(bar, body, foot);
    overlay.append(card);
    document.body.append(overlay);

    overlay._body = body;
    overlay._bar = bar.firstChild;
    overlay._dots = dots;
    overlay._back = back;
    overlay._next = next;
  }

  function render() {
    const step = steps[stepIndex];
    const body = overlay._body;
    body.innerHTML = '';
    body.scrollTop = 0;

    const wrap = util.el('div', { class: 'onboarding-step' }, [
      util.el('div', { class: 'onboarding-icon', html: BP.icons.svg(step.icon, 30) }),
      util.el('h1', { class: 'onboarding-title', text: step.title }),
      util.el('p', { class: 'onboarding-text', text: step.text }),
    ]);
    step.render(wrap);
    body.append(wrap);

    overlay._bar.style.width = `${((stepIndex + 1) / steps.length) * 100}%`;
    util.$$('.onboarding-dot', overlay._dots).forEach((dot, index) => dot.classList.toggle('active', index === stepIndex));
    overlay._back.classList.toggle('hidden', stepIndex === 0);
    overlay._next.textContent = stepIndex === steps.length - 1 ? 'Начать работу' : 'Далее';
  }

  // ── Завершение ─────────────────────────────────────────────────────────
  async function finish(skipped) {
    try {
      const current = state.profile || {};
      const desiredName = (model.profileName || '').trim();
      const nameChanged = !!desiredName && desiredName !== current.name;
      const colorChanged = !!model.profileColor && model.profileColor !== current.color;

      if (!skipped && current.id && (nameChanged || colorChanged)) {
        const result = await api.profiles.update({
          id: current.id,
          name: desiredName || current.name,
          color: model.profileColor || current.color,
        });
        const item = result && Array.isArray(result.items)
          ? result.items.find((entry) => entry.id === current.id)
          : null;
        if (item) {
          state.profile = { ...current, ...item };
          if (state.info) state.info.profile = state.profile;
          BP.ui.updateProfileButton(state.profile);
        }
      }

      await BP.settings.setMany({
        searchEngine: model.searchEngine,
        customSearchUrl: model.customSearchUrl,
        homepage: model.homepage || state.settings.homepage,
        theme: model.theme,
        accentColor: model.accentColor,
        blockPopups: model.blockPopups,
        doNotTrack: model.doNotTrack,
        showTopSites: model.showTopSites,
        restoreLastSession: model.restoreLastSession,
        onboardingDone: true,
      });

      BP.ui.renderTopSites();
      BP.ui.renderBookmarksBar();
      BP.tabs.renderStrip();
      BP.tabs.syncActive();
      BP.theme.apply();
      BP.toast('Настройка завершена', 'ok');
    } catch (error) {
      console.error('Ошибка первоначальной настройки:', error);
    } finally {
      close();
    }
  }

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    // Всегда завершаем ожидание start(), даже если окно закрыли не через «Готово».
    if (resolveRun) {
      const done = resolveRun;
      resolveRun = null;
      done();
    }
  }

  /** Запускает мастер. */
  function start() {
    if (isOpen()) return Promise.resolve();
    model = draft();
    stepIndex = 0;
    preview();
    build();
    render();
    return new Promise((resolve) => { resolveRun = resolve; });
  }

  BP.onboarding = { start, close, isOpen };
})();
