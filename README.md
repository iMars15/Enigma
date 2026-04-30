# Enigma 💬

> Real-time мессенджер с WebRTC звонками, WebSocket чатами и кастомизацией профиля.

## Стек

| Слой        | Технология                          |
|-------------|-------------------------------------|
| Frontend    | HTML5, CSS3, JavaScript (Vanilla)   |
| Backend     | PHP 8.1+, PDO (MySQL)               |
| Real-time   | WebSocket (Ratchet)                 |
| Звонки      | WebRTC (RTCPeerConnection)          |
| БД          | PostgreSQL 14+                      |
| Аутентификация | JWT (HS256)                     |

## Структура

```
enigma/
├── backend/
│   ├── api/          # REST endpoints (PHP)
│   ├── ws/           # WebSocket сервер (Ratchet)
│   ├── config/       # Database.php, config.php
│   └── uploads/      # Аватары и медиафайлы
├── frontend/
│   ├── pages/        # HTML страницы
│   ├── css/          # Стили
│   └── js/           # JavaScript модули
├── db/               # SQL схема и миграции
└── docs/             # Документация
```

## Быстрый старт

### 1. Клонирование

```bash
git clone https://github.com/iMars15/enigma.git
cd enigma
```

### 2. Зависимости PHP

```bash
composer install
```

### 3. База данных

```bash
psql -U postgres -c "CREATE DATABASE enigma ENCODING 'UTF8';"
psql -U postgres -d enigma -f db/schema.sql
psql -U postgres -d enigma -f db/seed.sql  
```

### 4. Конфигурация

```bash
cp .env.example .env
```

### 5. Запуск

**Веб-сервер (разработка):**
```bash
php -S localhost:80 -t .
```

**WebSocket сервер (в отдельном терминале):**
```bash
php backend/ws/server.php
```

Открой `http://localhost/frontend/pages/index.html`


## Возможности

- ✅ Регистрация / Вход / Восстановление пароля (JWT)
- ✅ Real-time чаты через WebSocket
- ✅ Аудио и видеозвонки (WebRTC peer-to-peer)
- ✅ Демонстрация экрана
- ✅ Отправка файлов и изображений (до 20MB)
- ✅ Статусы прочтения (галочки)
- ✅ Индикатор набора текста
- ✅ Статусы онлайн/офлайн
- ✅ Групповые чаты
- ✅ Кастомизация профиля (аватар, ник, статус)
- ✅ Выбор акцентного цвета темы
- ✅ Настройки приватности

