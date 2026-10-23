# 📦 Как выложить MokomailBrowser на GitHub

Пошаговая инструкция: от установки Git до первого релиза с готовым `.exe`.
Всё бесплатно. Займёт примерно 10–15 минут.

Организация (или аккаунт) на GitHub: **[github.com/mokomail](https://github.com/mokomail)**.

---

## 0. Что вообще происходит

- **Git** — программа на вашем компьютере, которая следит за изменениями файлов.
- **GitHub** — сайт, где хранится копия вашего проекта (репозиторий) в интернете.
- **Репозиторий** (`repo`) — «папка проекта» на GitHub.
- **Коммит** — сохранённый снимок изменений с подписью.
- **Push** — отправка коммитов на GitHub.

Мы сделаем так: создадим репозиторий у себя, загрузим туда исходники и (по желанию)
приложим готовый установщик в раздел **Releases**.

---

## 1. Установите Git

1. Откройте <https://git-scm.com/download/win> — скачивание начнётся сразу.
2. Запустите установщик. Можно везде жать **Next** (настройки по умолчанию хорошие).
   - Обязательно оставьте включённым **Git Credential Manager** — он входит в состав
     Git for Windows и позволит входить на GitHub без ручного ввода токенов.
3. Проверьте установку: откройте **PowerShell** и выполните:

   ```powershell
   git --version
   ```

   Должно появиться что-то вроде `git version 2.5x.x.windows.1`.

---

## 2. Представьтесь Git (один раз)

Укажите имя и почту — они попадут в историю коммитов.

```powershell
git config --global user.name "MokomailTeam"
git config --global user.email "you@example.com"
```

> Лучше указать почту, привязанную к аккаунту GitHub, — тогда коммиты будут
> отображаться в вашем профиле.

---

## 3. Создайте репозиторий на GitHub

1. Войдите на GitHub под аккаунтом **mokomail**.
2. Нажмите **+** в правом верхнем углу → **New repository**.
3. Заполните:
   - **Repository name:** `mokomail-browser`
   - **Description:** `Быстрый браузер на Chromium с Material 3 — от MokomailTeam`
   - **Public** (публичный) или **Private** — на ваш вкус.
   - **НЕ** ставьте галочки *Add a README*, *.gitignore*, *license* — файлы у нас уже есть.
4. Нажмите **Create repository**.

GitHub покажет пустой репозиторий и подсказки. Ссылка будет вида:

```
https://github.com/mokomail/mokomail-browser.git
```

---

## 4. Загрузите проект (первый push)

Откройте **PowerShell** и перейдите в папку проекта (подставьте свой путь):

```powershell
cd "C:\Users\Марк\Documents\Проект по умолчанию\test"
```

Выполните по очереди:

```powershell
git init
git add .
git commit -m "Первый коммит: MokomailBrowser"
git branch -M main
git remote add origin https://github.com/mokomail/mokomail-browser.git
git push -u origin main
```

Что делает каждая команда:

| Команда | Что делает |
|---|---|
| `git init` | создаёт репозиторий в текущей папке (появится скрытая папка `.git`) |
| `git add .` | добавляет все файлы к следующему коммиту (кроме перечисленных в `.gitignore`) |
| `git commit -m "…"` | сохраняет снимок изменений |
| `git branch -M main` | переименовывает ветку в `main` |
| `git remote add origin …` | привязывает локальную папку к репозиторию на GitHub |
| `git push -u origin main` | отправляет файлы на GitHub |

> Файлы `node_modules/` и `dist/` **не загрузятся** — они перечислены в `.gitignore`.
> Это правильно: репозиторий должен содержать исходники, а не гигабайты зависимостей
> и бинарников.

### Вход в GitHub

При первом `push` Git Credential Manager откроет окно браузера — войдите в аккаунт
**mokomail** и разрешите доступ. После этого вход больше спрашиваться не будет.

<details>
<summary>Если браузер не открылся — вход по токену (PAT)</summary>

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
   → **Fine-grained tokens** → **Generate new token**.
2. Дайте имя, срок действия, и в разделе **Repository access** выберите нужный
   репозиторий, а в **Permissions → Repository permissions** включите **Contents: Read and write**.
3. Сгенерируйте токен и скопируйте его (он показывается один раз).
4. При `git push` в качестве пароля вставьте этот токен.

</details>

<details>
<summary>Продвинуто: вход по SSH-ключу</summary>

```powershell
ssh-keygen -t ed25519 -C "you@example.com"
# Enter, Enter, Enter — ключ создан

# Покажите публичный ключ и скопируйте его:
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Добавьте ключ на GitHub: **Settings → SSH and GPG keys → New SSH key** → вставьте текст.
Затем поменяйте адрес репозитория:

```powershell
git remote set-url origin git@github.com:mokomail/mokomail-browser.git
git push -u origin main
```

</details>

---

## 5. Обновления в будущем

После каждого изменения файлов:

```powershell
git add .
git commit -m "Что изменилось"
git push
```

Проверить состояние и историю:

```powershell
git status        # что изменено
git log --oneline # список коммитов
```

---

## 6. Выпуск релиза с установщиком (.exe)

Бинарники не хранят в истории репозитория — для них есть **Releases**.

1. Соберите приложение:

   ```powershell
   npm install
   npm run dist
   ```

   В папке `dist/` появятся:
   - `MokomailBrowser-1.0.0-setup.exe`
   - `MokomailBrowser-1.0.0-portable.exe`

2. Создайте тег и отправьте его на GitHub:

   ```powershell
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. На GitHub откройте репозиторий → вкладка **Releases** → **Draft a new release**:
   - **Choose a tag:** `v1.0.0`
   - **Release title:** `MokomailBrowser 1.0.0`
   - Опишите, что нового.
   - В **Attach binaries** перетащите `.exe` из `dist/`.
   - Нажмите **Publish release**.

Теперь у вас есть публичная страница загрузки, а исходники остаются лёгкими.

---

## 7. Частые проблемы

| Проблема | Решение |
|---|---|
| `git: команда не найдена` | Git не установлен или PowerShell надо перезапустить после установки |
| `remote origin already exists` | `git remote set-url origin https://github.com/mokomail/mokomail-browser.git` |
| `Updates were rejected … non-fast-forward` | сначала `git pull --rebase origin main`, потом `git push` |
| `Authentication failed` | неверный пароль/токен. Обновите сохранённые данные: **Панель управления → Диспетчер учётных данных → Windows Credentials → удалить `git:https://github.com`**, затем снова `git push` |
| Случайно попал `node_modules` | добавьте в `.gitignore`, затем `git rm -r --cached node_modules` и коммит |
| Хочется без командной строки | Установите **GitHub Desktop** (<https://desktop.github.com>) — то же самое мышкой |

---

## Шпаргалка команд

```powershell
git init                                  # создать репозиторий
git add .                                 # добавить изменения
git commit -m "сообщение"                 # сохранить снимок
git push                                  # отправить на GitHub
git pull --rebase                         # подтянуть изменения с GitHub
git status                                # что изменилось
git log --oneline                         # история коммитов
git remote -v                             # куда привязан проект
git tag v1.0.0 && git push origin v1.0.0  # создать релизный тег
```

Готово! Проект на GitHub, установщик в Releases, а ссылки на проект —
в TikTok **@mokomail** и в самом браузере (**Меню → О браузере**). 🎉
