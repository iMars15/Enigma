<?php

require __DIR__ . '/_bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'me') {
    jsonResponse(['user' => currentUser()]);
}

if ($method === 'POST' && $action === 'logout') {
    session_destroy();
    jsonResponse(['ok' => true]);
}

if ($method !== 'POST') {
    jsonResponse(['error' => 'Метод не поддерживается.'], 405);
}

$data = readJson();
$username = strtolower(cleanString($data['username'] ?? '', 32));
$password = (string) ($data['password'] ?? '');

if (!preg_match('/^[a-z0-9_.-]{3,32}$/', $username)) {
    jsonResponse(['error' => 'Имя пользователя должно быть 3-32 символа: латинские буквы, цифры, точка, дефис или подчёркивание.'], 422);
}

if (strlen($password) < 6) {
    jsonResponse(['error' => 'Пароль должен быть не короче 6 символов.'], 422);
}

if ($action === 'register') {
    $displayName = cleanString($data['display_name'] ?? $username, 40);
    if ($displayName === '') {
        $displayName = $username;
    }

    try {
        $stmt = db()->prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)');
        $stmt->execute([$username, $displayName, password_hash($password, PASSWORD_DEFAULT)]);
        $_SESSION['user_id'] = (int) db()->lastInsertId();

        $guild = db()->query('SELECT id FROM guilds ORDER BY id LIMIT 1')->fetch();
        if ($guild) {
            $member = db()->prepare('INSERT OR IGNORE INTO guild_members (guild_id, user_id) VALUES (?, ?)');
            $member->execute([(int) $guild['id'], (int) $_SESSION['user_id']]);
        }

        jsonResponse(['user' => currentUser()], 201);
    } catch (PDOException $exception) {
        if ($exception->getCode() === '23000') {
            jsonResponse(['error' => 'Это имя пользователя уже занято.'], 409);
        }

        throw $exception;
    }
}

if ($action === 'login') {
    $stmt = db()->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        jsonResponse(['error' => 'Неверное имя пользователя или пароль.'], 401);
    }

    $_SESSION['user_id'] = (int) $user['id'];
    jsonResponse(['user' => currentUser()]);
}

jsonResponse(['error' => 'Неизвестное действие авторизации.'], 404);
