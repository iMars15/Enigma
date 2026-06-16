<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->prepare(
        'SELECT g.id, g.name, g.icon_text, g.owner_id, g.created_at
         FROM guilds g
         JOIN guild_members gm ON gm.guild_id = g.id
         WHERE gm.user_id = ?
         ORDER BY g.id'
    );
    $stmt->execute([(int) $user['id']]);
    $guilds = $stmt->fetchAll();

    foreach ($guilds as &$guild) {
        $channels = $pdo->prepare('SELECT id, guild_id, name, type FROM channels WHERE guild_id = ? ORDER BY id');
        $channels->execute([(int) $guild['id']]);
        $guild['channels'] = $channels->fetchAll();
    }

    jsonResponse(['guilds' => $guilds]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = readJson();
    $name = cleanString($data['name'] ?? '', 48);

    if ($name === '') {
        jsonResponse(['error' => 'Введите название сервера.'], 422);
    }

    $iconText = strtoupper(safeSubstring(preg_replace('/[^a-zа-я0-9]/iu', '', $name) ?: 'E', 0, 1));

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('INSERT INTO guilds (name, icon_text, owner_id) VALUES (?, ?, ?)');
    $stmt->execute([$name, $iconText, (int) $user['id']]);
    $guildId = (int) $pdo->lastInsertId();

    $pdo->prepare('INSERT INTO guild_members (guild_id, user_id, role) VALUES (?, ?, ?)')->execute([$guildId, (int) $user['id'], 'owner']);
    $channelStmt = $pdo->prepare('INSERT INTO channels (guild_id, name, type) VALUES (?, ?, ?)');
    foreach (['общий', 'идеи', 'звонки'] as $channelName) {
        $channelStmt->execute([$guildId, $channelName, 'text']);
    }
    $pdo->commit();

    jsonResponse(['ok' => true, 'guild_id' => $guildId], 201);
}

jsonResponse(['error' => 'Метод не поддерживается.'], 405);
