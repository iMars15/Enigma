<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Метод не поддерживается.'], 405);
}

$data = readJson();
$guildId = (int) ($data['guild_id'] ?? 0);
$name = strtolower(cleanString($data['name'] ?? '', 32));
$name = preg_replace('/[^a-z0-9а-яё_-]+/iu', '-', $name) ?? '';
$name = trim($name, '-_');

if ($guildId <= 0 || $name === '') {
    jsonResponse(['error' => 'Нужны сервер и название канала.'], 422);
}

ensureGuildMembership($guildId, (int) $user['id']);

$stmt = db()->prepare('INSERT INTO channels (guild_id, name, type) VALUES (?, ?, ?)');
$stmt->execute([$guildId, $name, 'text']);

jsonResponse(['ok' => true, 'channel_id' => (int) db()->lastInsertId()], 201);
