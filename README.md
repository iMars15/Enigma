# Enigma

Enigma — open-source прототип мессенджера в стиле Discord с PHP-бэкендом, Node.js WebSocket-сервером, SQLite-хранилищем и фронтендом на чистых HTML/CSS/JavaScript. В проекте уже есть серверы, каналы, живой обмен сообщениями, настройка профиля и сигналинг для WebRTC-звонков.
[Enigma!!](enigma-messenger.ru)

## Стек

- Фронтенд: чистые HTML, CSS, JavaScript
- API-бэкенд: PHP 8+
- Realtime: Node.js WebSocket-сервер
- База данных: SQLite по умолчанию
- Звонки: браузерный WebRTC, сигналинг через WebSocket-сервер

SQLite выбран для локальной разработки, потому что не требует отдельной установки и настройки сервера БД. Для продакшена или облачного хостинга лучше использовать PostgreSQL. Простые облачные варианты: Supabase Postgres, Neon, Railway Postgres или Render PostgreSQL. В этом стартере оставлен SQLite, чтобы проект запускался сразу на одной машине.

## Быстрый старт

1. Установить Node-зависимости:

   ```bash
   npm install
   ```

2. Запустить PHP API и статический сервер:

   ```bash
   npm run php
   ```

3. В другом терминале запустить WebSocket-сервер:

   ```bash
   npm run ws
   ```

4. Открыть в браузере:

   ```text
   http://localhost:8080
   ```

Порты по умолчанию:

- PHP-приложение: `http://localhost:8080`
- WebSocket-сервер: `ws://localhost:3001`

База данных создаётся автоматически в `database/enigma.sqlite`.

Демо-аккаунт:

```text
demo / enigma123
```

## Запуск на другом ПК для теста

1. Скопируйте репозиторий на другой компьютер:

   ```bash
   git clone <URL-репозитория> enigma
   cd enigma
   ```

2. Установите зависимости:

   ```bash
   npm install
   ```

3. Скопируйте пример `.env.example` в `.env` и при необходимости отредактируйте:

   ```bash
   cp .env.example .env
   ```

   На Windows:

   ```powershell
   copy .env.example .env
   ```

4. Если планируете запускать только локально, оставьте `DB_CONNECTION=sqlite`.

5. Запустите PHP-сервер в одном терминале из корня проекта:

   ```bash
   npm run php
   ```

   Если вы используете Windows, убедитесь, что команда выполняется в папке `C:\Users\iMars\Desktop\Enigma`.

6. Запустите WebSocket-сервер во втором терминале:

   ```bash
   npm run ws
   ```

7. Откройте браузер на `http://localhost:8080`.

8. Чтобы проверить работу API напрямую, откройте в браузере:

   ```text
   http://localhost:8080/api/auth.php?action=me
   ```

   Если вместо JSON приходит HTML, значит PHP-сервер не использует `router.php`.

> Если на другом ПК уже есть PostgreSQL и вы хотите тестировать облачную БД, установите `DB_CONNECTION=pgsql` в `.env` и задайте параметры подключения.
## Заметки

WebRTC в продакшене требует HTTPS для доступа к камере и микрофону. На `localhost` современные браузеры разрешают работу через HTTP.

Это MVP-основа. Перед публичным деплоем стоит добавить более строгую валидацию, rate limit, CSRF-защиту, HTTPS, TURN-серверы для WebRTC и миграции PostgreSQL.
