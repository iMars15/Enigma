<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Метод не поддерживается.'], 405);
}

$data = readJson();
$displayName = cleanString($data['display_name'] ?? $user['display_name'], 40);
$statusText = cleanString($data['status_text'] ?? $user['status_text'], 80);
$avatarUrl = trim((string) ($data['avatar_url'] ?? $user['avatar_url']));
$accentColor = trim((string) ($data['accent_color'] ?? $user['accent_color']));

if ($displayName === '') {
    jsonResponse(['error' => 'Введите отображаемое имя.'], 422);
}

if ($avatarUrl !== '' && !filter_var($avatarUrl, FILTER_VALIDATE_URL)) {
    jsonResponse(['error' => 'Аватар должен быть корректным URL.'], 422);
}

if (!preg_match('/^#[0-9a-f]{6}$/i', $accentColor)) {
    jsonResponse(['error' => 'Цвет акцента должен быть HEX-цветом.'], 422);
}

$stmt = db()->prepare('UPDATE users SET display_name = ?, status_text = ?, avatar_url = ?, accent_color = ? WHERE id = ?');
$stmt->execute([$displayName, $statusText, $avatarUrl, $accentColor, (int) $user['id']]);

jsonResponse(['user' => currentUser()]);
