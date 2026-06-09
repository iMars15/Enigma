<?php

declare(strict_types=1);

function env(string $key, mixed $default = null): mixed
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    $envPath = dirname(__DIR__) . '/../.env';
    if (!file_exists($envPath)) {
        return $default;
    }

    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) {
            continue;
        }

        [$name, $val] = array_map('trim', explode('=', $line, 2) + [1 => '']);
        if ($name === $key) {
            return $val;
        }
    }

    return $default;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $connection = strtolower((string) env('DB_CONNECTION', 'sqlite'));
    $usePg = $connection === 'pgsql';

    if ($usePg) {
        $dsn = sprintf(
            'pgsql:host=%s;port=%s;dbname=%s',
            env('DB_HOST', '127.0.0.1'),
            env('DB_PORT', '5432'),
            env('DB_NAME', 'enigma')
        );

        $pdo = new PDO(
            $dsn,
            env('DB_USER', 'enigma'),
            env('DB_PASSWORD', 'enigma_pass'),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );

        $schemaPath = dirname(__DIR__) . '/database/postgres_schema.sql';
        if (file_exists($schemaPath)) {
            $schema = file_get_contents($schemaPath);
            if ($schema !== false) {
                $pdo->exec($schema);
            }
        }
    } else {
        $databaseDir = dirname(__DIR__) . '/database';
        $databasePath = $databaseDir . '/enigma.sqlite';

        if (!is_dir($databaseDir)) {
            mkdir($databaseDir, 0775, true);
        }

        $pdo = new PDO('sqlite:' . $databasePath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');

        $schema = file_get_contents($databaseDir . '/schema.sql');
        if ($schema !== false) {
            $pdo->exec($schema);
        }
    }

    seedDemoWorkspace($pdo);

    return $pdo;
}

function seedDemoWorkspace(PDO $pdo): void
{
    $count = (int) $pdo->query('SELECT COUNT(*) FROM guilds')->fetchColumn();
    if ($count > 0) {
        return;
    }

    $pdo->beginTransaction();

    $hash = password_hash('enigma123', PASSWORD_DEFAULT);
    $insertUserSql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
        ? 'INSERT OR IGNORE INTO users (username, display_name, password_hash, status_text) VALUES (?, ?, ?, ?)'
        : 'INSERT INTO users (username, display_name, password_hash, status_text) VALUES (?, ?, ?, ?) ON CONFLICT (username) DO NOTHING';

    $stmt = $pdo->prepare($insertUserSql);
    $stmt->execute(['demo', 'Демо Шифр', $hash, 'На связи в зелёном канале']);

    $ownerId = (int) $pdo->lastInsertId();
    if ($ownerId === 0) {
        $ownerId = (int) $pdo->query("SELECT id FROM users WHERE username = 'demo'")->fetchColumn();
    }

    $pdo->prepare('INSERT INTO guilds (name, icon_text, owner_id) VALUES (?, ?, ?)')->execute(['Штаб Enigma', 'E', $ownerId]);
    $guildId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (?, ?, ?)')->execute([$guildId, $ownerId, 'owner']);

    $channelStmt = $pdo->prepare('INSERT INTO channels (guild_id, name, type) VALUES (?, ?, ?)');
    foreach (['общий', 'разработка', 'звонки'] as $channelName) {
        $channelStmt->execute([$guildId, $channelName, 'text']);
    }

    $generalId = (int) $pdo->query("SELECT id FROM channels WHERE guild_id = {$guildId} AND name = 'общий'")->fetchColumn();
    $messageStmt = $pdo->prepare('INSERT INTO messages (channel_id, user_id, content) VALUES (?, ?, ?)');
    $messageStmt->execute([$generalId, $ownerId, 'Добро пожаловать в Enigma. Создайте аккаунт, настройте профиль и запустите звонок в верхней панели.']);

    $pdo->commit();
}
