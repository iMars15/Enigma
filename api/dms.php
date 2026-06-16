<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();
$data = readJson();
$targetId = (int) ($data['user_id'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $targetId <= 0) {
    jsonResponse(['error' => 'Нужен корректный user_id.'], 422);
}

if ($targetId === (int) $user['id']) {
    jsonResponse(['error' => 'Нельзя создать чат с самим собой.'], 422);
}

$stmt = db()->prepare('SELECT id, username, display_name, avatar_url, accent_color FROM users WHERE id = ?');
$stmt->execute([$targetId]);
$target = $stmt->fetch();

if (!$target) {
    jsonResponse(['error' => 'Пользователь не найден.'], 404);
}

$existing = db()->prepare(
    'SELECT g.id
     FROM guilds g
     JOIN guild_members gm ON gm.guild_id = g.id
     WHERE g.id IN (
         SELECT guild_id FROM guild_members WHERE user_id = ?
     )
       AND g.id IN (
         SELECT guild_id FROM guild_members WHERE user_id = ?
     )
     GROUP BY g.id
     HAVING COUNT(*) = 2'
);
$existing->execute([(int) $user['id'], $targetId]);
$room = $existing->fetch();

if ($room) {
    $channelStmt = db()->prepare('SELECT id FROM channels WHERE guild_id = ? ORDER BY id LIMIT 1');
    $channelStmt->execute([(int) $room['id']]);
    $channel = $channelStmt->fetch();

    jsonResponse([
        'guild_id' => (int) $room['id'],
        'channel_id' => $channel ? (int) $channel['id'] : null
    ]);
}

$db = db();
$db->beginTransaction();

$name = sprintf('DM: %s / %s', $user['display_name'], $target['display_name']);
$iconText = strtoupper(mb_substr(preg_replace('/[^a-zа-яё]/iu', '', $target['display_name'] ?? $target['username']), 0, 1) ?: 'D');

$stmt = $db->prepare('INSERT INTO guilds (name, icon_text, owner_id) VALUES (?, ?, ?)');
$stmt->execute([$name, $iconText, (int) $user['id']]);
$guildId = (int) $db->lastInsertId();

$memberStmt = $db->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (?, ?, ?)');
$memberStmt->execute([$guildId, (int) $user['id'], 'owner']);
$memberStmt->execute([$guildId, $targetId, 'member']);

$channelStmt = $db->prepare('INSERT INTO channels (guild_id, name, type) VALUES (?, ?, ?)');
$channelStmt->execute([$guildId, 'общий', 'text']);
$channelId = (int) $db->lastInsertId();

db()->commit();

jsonResponse(['guild_id' => $guildId, 'channel_id' => $channelId], 201);
