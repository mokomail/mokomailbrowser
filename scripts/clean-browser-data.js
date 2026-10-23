'use strict';

/**
 * Очистка данных браузера перед сборкой.
 *
 * Делает сборку «как после установки» — при первом запуске показывается
 * первоначальная настройка, нет истории и посещённых сайтов. Из каждой папки
 * профиля удаляются:
 *
 *   • history.json  — история посещений (из неё же строятся «часто посещаемые»);
 *   • session.json  — последние открытые вкладки (восстановление сессии);
 *   • settings.json — настройки профиля (включая флаг `onboardingDone`), поэтому
 *                     следующая сборка стартует с мастером первого запуска и
 *                     значениями по умолчанию.
 *
 * Закладки, реестр профилей (profiles.json), cookie и кэш НЕ трогаются.
 * Значения по умолчанию уже содержат актуальные быстрые ссылки (Discord и
 * иконки сайтов, без OpenCode), поэтому отдельная правка settings.json не нужна.
 *
 * Запускается автоматически перед `npm run dist` (скрипт `predist`), а также
 * вручную: `npm run clean:data`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Папка данных приложения по умолчанию. */
function defaultUserData() {
  if (process.env.MOKOMAIL_USER_DATA) return process.env.MOKOMAIL_USER_DATA;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'MokomailBrowser');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'MokomailBrowser');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'MokomailBrowser');
}

/** Файлы с данными, которые нужно стереть. */
const DATA_FILES = ['history.json', 'session.json', 'settings.json'];

function removeDataFiles(dir) {
  let removed = 0;
  for (const name of DATA_FILES) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      removed += 1;
      console.log(`  − ${path.relative(userData, target)}`);
    }
  }
  return removed;
}

const userData = defaultUserData();

if (!fs.existsSync(userData)) {
  console.log(`[clean:data] Папка данных ещё не создана: ${userData}`);
  process.exit(0);
}

console.log(`[clean:data] Очистка данных браузера в ${userData}`);

let removedFiles = 0;

// Корневые файлы (старый формат, до появления профилей).
removedFiles += removeDataFiles(userData);

// Данные каждого профиля.
const profilesDir = path.join(userData, 'profiles');
let profileDirs = [];
if (fs.existsSync(profilesDir)) {
  profileDirs = fs.readdirSync(profilesDir).filter((name) => {
    try {
      return fs.statSync(path.join(profilesDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

for (const id of profileDirs) {
  console.log(`  профиль «${id}»:`);
  removedFiles += removeDataFiles(path.join(profilesDir, id));
}

console.log(`[clean:data] Удалено файлов: ${removedFiles}. Следующая сборка стартует с первоначальной настройкой.`);
