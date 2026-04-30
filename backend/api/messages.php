<?php
/* ============================================
   Enigma — api/messages.php
   ============================================ */
require_once __DIR__ . '/../index.php';

$action = param('action', '');
$user   = require_auth();

match ($action) {
    'list'   => msg_list($user),
    'send'   => msg_send($user),
    'delete' => msg_delete($user),
    'edit'   => msg_edit($user),
    'read'   => msg_read($user),
    default  => fail('Unknown action'),
};

function msg_list(array $user): never
{
    $chatId = (int) param('chat_id');
    $before = param('before');
    $limit  = min((int)(param('limit', 40)), 100);
    if (!$chatId) fail('chat_id required');

    // Verify membership
    $member = Database::fetchOne(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$member) fail('Access denied', 403);

    $params = [$chatId];
    $sql    = 'SELECT m.*, tm.text as type_name,
                      med.file_url as media_url, med.file_size, med.id_file_type,
                      u.login as sender_login
               FROM messages m
               LEFT JOIN type_messages tm ON tm.id = m.id_type
               LEFT JOIN media med ON med.id_message = m.id
               LEFT JOIN user u ON u.id = m.id_sender
               WHERE m.id_chats = ?';

    if ($before) { $sql .= ' AND m.id < ?'; $params[] = (int)$before; }
    $sql .= ' ORDER BY m.id DESC LIMIT ?';
    $params[] = $limit;

    $rows = Database::fetchAll($sql, $params);
    $rows = array_reverse($rows); // chronological

    ok(['messages' => $rows]);
}

function msg_send(array $user): never
{
    $body    = json_body();
    $chatId  = (int)($body['chat_id'] ?? 0);
    $content = trim($body['content'] ?? '');
    $typeId  = (int)($body['type_id'] ?? 1);
    $replyTo = isset($body['reply_to']) ? (int)$body['reply_to'] : null;

    if (!$chatId) fail('chat_id required');

    $member = Database::fetchOne(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$member) fail('Access denied', 403);

    $msgId = Database::insert('messages', [
        'id_sender'  => $user['id'],
        'id_chats'   => $chatId,
        'id_type'    => $typeId,
        'content'    => $content,
        'reply_to'   => $replyTo,
        'status'     => 'sent',
        'created_at' => date('Y-m-d H:i:s'),
    ]);

    $message = Database::fetchOne(
        'SELECT m.*, u.login as sender_login,
                p.nickname as sender_nickname,
                pr.url_image as sender_avatar
         FROM messages m
         JOIN user u ON u.id = m.id_sender
         LEFT JOIN profile pf ON pf.id_user = m.id_sender
         LEFT JOIN avatar pr ON pr.id = pf.id_avatar
         WHERE m.id = ?',
        [$msgId]
    );

    ok(['message' => $message], 201);
}

function msg_delete(array $user): never
{
    $msgId = (int)(json_body()['message_id'] ?? 0);
    if (!$msgId) fail('message_id required');

    $msg = Database::fetchOne('SELECT * FROM messages WHERE id = ?', [$msgId]);
    if (!$msg) fail('Not found', 404);
    if ($msg['id_sender'] != $user['id']) fail('Forbidden', 403);

    Database::query('UPDATE messages SET status = ?, content = ? WHERE id = ?',
        ['deleted', '', $msgId]);
    ok(['message' => 'Deleted']);
}

function msg_edit(array $user): never
{
    $body    = json_body();
    $msgId   = (int)($body['message_id'] ?? 0);
    $content = trim($body['content'] ?? '');
    if (!$msgId || !$content) fail('message_id and content required');

    $msg = Database::fetchOne('SELECT * FROM messages WHERE id = ?', [$msgId]);
    if (!$msg) fail('Not found', 404);
    if ($msg['id_sender'] != $user['id']) fail('Forbidden', 403);

    Database::update('messages', ['content' => $content, 'edited' => 1, 'edited_at' => date('Y-m-d H:i:s')],
        'id = ?', [$msgId]);
    ok(['message' => 'Updated']);
}

function msg_read(array $user): never
{
    $body   = json_body();
    $chatId = (int)($body['chat_id'] ?? 0);
    $lastId = (int)($body['last_id'] ?? 0);
    if (!$chatId || !$lastId) fail('chat_id and last_id required');

    Database::query(
        'UPDATE messages SET status = ? WHERE id_chats = ? AND id <= ? AND id_sender != ? AND status != ?',
        ['read', $chatId, $lastId, $user['id'], 'read']
    );
    ok(['message' => 'Marked read']);
}
