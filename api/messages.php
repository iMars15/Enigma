<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();
$channelId = (int) ($_GET['channel_id'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] !== 'GET' || $channelId <= 0) {
    jsonResponse(['error' => 'Нужен корректный channel_id.'], 422);
}

$channel = db()->prepare('SELECT guild_id FROM channels WHERE id = ?');
$channel->execute([$channelId]);
$channelRow = $channel->fetch();

if (!$channelRow) {
    jsonResponse(['error' => 'Канал не найден.'], 404);
}

ensureGuildMembership((int) $channelRow['guild_id'], (int) $user['id']);

$stmt = db()->prepare(
    'SELECT m.id, m.channel_id, m.content, m.created_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url, u.accent_color
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.channel_id = ?
     ORDER BY m.id DESC
     LIMIT 80'
);
$stmt->execute([$channelId]);
$messages = array_reverse($stmt->fetchAll());

jsonResponse(['messages' => $messages]);
