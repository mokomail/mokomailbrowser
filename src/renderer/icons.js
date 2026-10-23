'use strict';

/** Набор SVG-иконок (в стиле 24×24, толщина линии 1.8). */
(function () {
  window.BP = window.BP || {};

  // Сбор ошибок интерфейса — используется при самопроверке и в отладке.
  window.__bpErrors = window.__bpErrors || [];
  window.addEventListener('error', (event) => {
    window.__bpErrors.push(String((event && event.message) || event));
    console.error('[BP] Ошибка:', event && event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    window.__bpErrors.push(`promise: ${String(event && event.reason)}`);
    console.error('[BP] Необработанный отказ промиса:', event && event.reason);
  });

  const paths = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    forward: '<path d="M9 18l6-6-6-6"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
    stop: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    downloads: '<path d="M12 3v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 19.5h16"/>',
    history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    menu: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.2v2.2M12 18.6v2.2M4.8 12H7M17 12h2.2M6.9 6.9l1.6 1.6M15.5 15.5l1.6 1.6M17.1 6.9l-1.6 1.6M8.5 15.5l-1.6 1.6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    min: '<path d="M5 12h14"/>',
    max: '<rect x="5.5" y="5.5" width="13" height="13" rx="2"/>',
    restore: '<rect x="8.5" y="4.5" width="11" height="11" rx="2"/><path d="M15.5 18.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2h.5"/>',
    trash: '<path d="M4.5 7h15"/><path d="M9.5 7V5.2h5V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/>',
    external: '<path d="M14 4.5h5.5V10"/><path d="M19.2 4.8L11 13"/><path d="M18 14.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V7.5A1.5 1.5 0 0 1 6 6h3.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.3 2.3 14.7 0 17M12 3.5c-2.3 2.3-2.3 14.7 0 17"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
    warning: '<path d="M12 4.2l8.4 15.3H3.6z"/><path d="M12 10v4"/><circle cx="12" cy="16.8" r="0.8"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.4l2 2.4h7.6a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z"/>',
    bookmark: '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.7L6 20V5.5a1 1 0 0 1 1-1z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="8.2" r="0.9"/>',
    window: '<rect x="4.5" y="5.5" width="15" height="13" rx="2"/><path d="M4.5 9.5h15"/>',
    incognito: '<path d="M5 12h14"/><path d="M8 12l2-5h4l2 5"/><circle cx="8.5" cy="15.5" r="2.5"/><circle cx="15.5" cy="15.5" r="2.5"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/><path d="M11 8.5v5M8.5 11h5"/>',
    eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    down: '<path d="M6 9.5l6 6 6-6"/>',
    right: '<path d="M9.5 6l6 6-6 6"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 19.5a7.2 7.2 0 0 1 14.4 0"/>',
    edit: '<path d="M4.5 19.5h4l9.3-9.3a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4.5 15.5z"/>',
    layers: '<path d="M12 3.5l8.5 4.3L12 12 3.5 7.8z"/><path d="M4 12.2l8 4 8-4"/><path d="M4 16.4l8 4 8-4"/>',
    shield: '<path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 8.9-4.1-1.3-7-4.6-7-8.9V6.1z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 2-.9 2-2 0-.6-.2-1-.6-1.4-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5h1.6a4.4 4.4 0 0 0 4.4-4.5c0-3.6-3.7-6.6-8.5-6.6z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.6" r="1"/><circle cx="16" cy="10" r="1"/>',
    sparkle: '<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M9 20.5h6M12 16.5v4"/>',
    rocket: '<path d="M12 3.5c3.2 1.4 5 4.5 5 8.2 0 1.6-.4 3.1-1.1 4.4H8.1A9.6 9.6 0 0 1 7 11.7c0-3.7 1.8-6.8 5-8.2z"/><circle cx="12" cy="10" r="1.6"/><path d="M8.1 16.1L6 20l3-.8M15.9 16.1L18 20l-3-.8"/>',
    github: '<path d="M9.3 20.4v-2.9c-2.6.5-3.2-1.1-3.2-1.1-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.2-1-4.2-4.5 0-1 .3-1.8.9-2.4-.1-.2-.4-1.2.1-2.5 0 0 .8-.2 2.6 1a8.6 8.6 0 0 1 4.6 0c1.8-1.2 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.6.9 1.4.9 2.4 0 3.5-2.1 4.3-4.2 4.5.3.3.6.9.6 1.8v2.9"/>',
    tiktok: '<path d="M14 3.5v10.2a3.2 3.2 0 1 1-3.2-3.2"/><path d="M14 3.5c.4 2.6 2 4.2 4.6 4.4"/>',
    heart: '<path d="M12 20c-5-3.3-7.5-6-7.5-9.1A3.9 3.9 0 0 1 12 8.6a3.9 3.9 0 0 1 7.5 2.3C19.5 14 17 16.7 12 20z"/>',
    pin: '<path d="M9 3.5h6"/><path d="M10 3.5l-.8 6.2L6.6 12v1.5h10.8V12l-2.6-2.3-.8-6.2"/><path d="M12 13.5V20"/>',
    camera: '<rect x="3.5" y="7" width="17" height="12" rx="2.2"/><path d="M8.4 7l1.3-2.1h4.6L15.6 7"/><circle cx="12" cy="13" r="3.2"/>',
    command: '<path d="M8 8a3 3 0 1 0-3 3h3zM16 8a3 3 0 1 1 3 3h-3zM8 16a3 3 0 1 1-3-3h3zM16 16a3 3 0 1 0 3-3h-3z"/><rect x="8" y="8" width="8" height="8" rx="1.4"/>',
    'volume-on': '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M14.5 9a4 4 0 0 1 0 6"/><path d="M17 6.5a7.5 7.5 0 0 1 0 11"/>',
    'volume-off': '<path d="M4 9.5h3l4-3.5v12l-4-3.5H4z"/><path d="M16 9.5l4 5"/><path d="M20 9.5l-4 5"/>',
    keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.3"/><circle cx="6" cy="10" r="0.9"/><circle cx="9" cy="10" r="0.9"/><circle cx="12" cy="10" r="0.9"/><circle cx="15" cy="10" r="0.9"/><circle cx="18" cy="10" r="0.9"/><path d="M8 13.6h8"/>',
    broom: '<path d="M14.5 3.5l4 4-6.2 6.2-4-4z"/><path d="M8.3 9.7l-3.8 3.8 1.2 1.2 1.4-.5 1.4 1.4-.5 1.4 1.3 1.3 3.8-3.8z"/>',
  };

  function svg(name, size) {
    const body = paths[name];
    if (!body) return '';
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<svg viewBox="0 0 24 24"${s} aria-hidden="true">${body}</svg>`;
  }

  // Фирменный логотип браузера (растровый значок приложения).
  function logo(size = 40) {
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<img src="logo.png" alt=""${s} class="bp-logo" draggable="false" />`;
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-icon]').forEach((node) => {
      node.innerHTML = svg(node.getAttribute('data-icon'));
    });
  }

  BP.icons = { paths, svg, logo, apply };
})();
