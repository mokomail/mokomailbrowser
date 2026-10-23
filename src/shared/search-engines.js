'use strict';

/**
 * Список поисковых систем, доступных в браузере.
 * Используется и в main-процессе (подсказки поиска), и в интерфейсе.
 * В `url` и `suggest` символ %s заменяется на запрос.
 * `home` — адрес домашней страницы: используется, чтобы синхронно менять
 * домашнюю страницу при выборе поисковой системы.
 */
const SEARCH_ENGINES = [
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q=%s',
    suggest: 'https://duckduckgo.com/ac/?q=%s&type=list',
    suggestIsJson: true,
    home: 'https://duckduckgo.com/',
  },
  {
    id: 'google',
    name: 'Google',
    url: 'https://www.google.com/search?q=%s',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
    suggestIsJson: true,
    home: 'https://www.google.com/',
  },
  {
    id: 'yandex',
    name: 'Яндекс',
    url: 'https://yandex.ru/search/?text=%s',
    suggest: 'https://suggest.yandex.ru/suggest-ff.cgi?part=%s',
    suggestIsJson: false,
    home: 'https://yandex.ru/',
  },
  {
    id: 'bing',
    name: 'Bing',
    url: 'https://www.bing.com/search?q=%s',
    suggest: 'https://api.bing.com/osjson.aspx?query=%s',
    suggestIsJson: true,
    home: 'https://www.bing.com/',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    url: 'https://search.brave.com/search?q=%s',
    suggest: 'https://search.brave.com/api/suggest?q=%s',
    suggestIsJson: true,
    home: 'https://search.brave.com/',
  },
  {
    id: 'ecosia',
    name: 'Ecosia',
    url: 'https://www.ecosia.org/search?q=%s',
    suggest: '',
    suggestIsJson: false,
    home: 'https://www.ecosia.org/',
  },
  {
    id: 'startpage',
    name: 'Startpage',
    url: 'https://www.startpage.com/sp/search?query=%s',
    suggest: '',
    suggestIsJson: false,
    home: 'https://www.startpage.com/',
  },
  {
    id: 'custom',
    name: 'Своя поисковая система',
    url: '',
    suggest: '',
    suggestIsJson: false,
    home: '',
  },
];

function getEngine(id) {
  return SEARCH_ENGINES.find((engine) => engine.id === id) || SEARCH_ENGINES[0];
}

module.exports = { SEARCH_ENGINES, getEngine };
