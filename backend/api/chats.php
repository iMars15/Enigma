<?php
/* ============================================
   Enigma — api/chats.php
   ============================================ */
require_once __DIR__ . '/../index.php';

$action = param('action', '');
$user   = require_auth();

match ($action) {
    'list'          => chats_list($user),
    'create_direct' => chats_create_direct($user),
    'create_group'  => chats_create_group($user),
    'delete'        => chats_delete($user),
    'leave'         => chats_leave($user),
    'add_member'    => chats_add_member($user),
    'members'       => chats_members($user),
    default         => fail('Unknown action'),
};

function chats_list(array $user): never
{
    $chats = Database::fetchAll(
        "SELECT c.id, c.id_type, c.is_group, c.name as group_name, c.create_date,
                cm.unread_count,
                -- Last message
                lm.id as last_msg_id, lm.content as last_message, lm.created_at as last_time,
                -- For direct chats: companion info
                other_u.id as companion_id,
                COALESCE(op.nickname, other_u.login) as companion_name,
                oa.url_image as companion_avatar,
                other_u.last_seen,
                (EXTRACT(EPOCH FROM NOW() - other_u.last_seen) < 120) as online
         FROM chats c
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
         -- Other member for direct chats
         LEFT JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != ? AND c.is_group = 0
         LEFT JOIN user other_u ON other_u.id = cm2.user_id
         LEFT JOIN profile op ON op.id_user = other_u.id
         LEFT JOIN avatar oa ON oa.id = op.id_avatar
         -- Last message
         LEFT JOIN messages lm ON lm.id = (
             SELECT MAX(id) FROM messages WHERE id_chats = c.id AND status != 'deleted'
         )
         ORDER BY COALESCE(lm.created_at, c.create_date) DESC",
        [$user['id'], $user['id']]
    );

    // Format output
    $result = array_map(function ($c) {
        return [
            'id'            => $c['id'],
            'is_group'      => (bool)$c['is_group'],
            'name'          => $c['is_group'] ? $c['group_name'] : ($c['companion_name'] ?? 'Неизвестный'),
            'avatar'        => $c['companion_avatar'] ?? null,
            'companion_id'  => $c['companion_id'],
            'last_message'  => $c['last_message'],
            'last_time'     => $c['last_time'],
            'unread'        => (int)($c['unread_count'] ?? 0),
            'online'        => (bool)($c['online'] ?? false),
        ];
    }, $chats);

    ok(['chats' => $result]);
}

function chats_create_direct(array $user): never
{
    $targetId = (int)(json_body()['user_id'] ?? 0);
    if (!$targetId || $targetId === $user['id']) fail('Invalid user_id');

    $target = Database::fetchOne('SELECT id FROM user WHERE id = ?', [$targetId]);
    if (!$target) fail('User not found', 404);

    // Check if direct chat already exists
    $existing = Database::fetchOne(
        "SELECT c.id FROM chats c
         JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
         JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
         WHERE c.is_group = 0 LIMIT 1",
        [$user['id'], $targetId]
    );

    if ($existing) {
        $chat = build_chat_response($existing['id'], $user['id']);
        ok(['chat' => $chat]);
    }

    Database::beginTransaction();
    try {
        $chatId = Database::insert('chats', [
            'id_type'     => 1,
            'is_group'    => 0,
            'create_date' => date('Y-m-d H:i:s'),
        ]);

        Database::insert('chat_members', ['chat_id' => $chatId, 'user_id' => $user['id'],  'unread_count' => 0]);
        Database::insert('chat_members', ['chat_id' => $chatId, 'user_id' => $targetId, 'unread_count' => 0]);

        Database::commit();

        $chat = build_chat_response($chatId, $user['id']);
        ok(['chat' => $chat], 201);
    } catch (Throwable $e) {
        Database::rollback();
        fail('Ошибка создания чата');
    }
}

function chats_create_group(array $user): never
{
    $body      = json_body();
    $name      = trim($body['name'] ?? '');
    $memberIds = $body['member_ids'] ?? [];

    if (!$name) fail('Укажите название группы');
    if (!is_array($memberIds)) fail('member_ids must be array');

    $memberIds = array_unique(array_map('intval', $memberIds));
    $memberIds[] = $user['id']; // add creator

    Database::beginTransaction();
    try {
        $chatId = Database::insert('chats', [
            'id_type'     => 2,
            'is_group'    => 1,
            'name'        => $name,
            'create_date' => date('Y-m-d H:i:s'),
            'created_by'  => $user['id'],
        ]);

        foreach ($memberIds as $uid) {
            Database::insert('chat_members', [
                'chat_id'      => $chatId,
                'user_id'      => $uid,
                'role'         => ($uid === $user['id']) ? 'admin' : 'member',
                'unread_count' => 0,
            ]);
        }

        Database::commit();
        $chat = build_chat_response($chatId, $user['id']);
        ok(['chat' => $chat], 201);
    } catch (Throwable $e) {
        Database::rollback();
        fail('Ошибка создания группы');
    }
}

function chats_delete(array $user): never
{
    $chatId = (int)(json_body()['chat_id'] ?? 0);
    if (!$chatId) fail('chat_id required');

    $member = Database::fetchOne(
        'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$member || $member['role'] !== 'admin') fail('Only admin can delete', 403);

    Database::query('DELETE FROM chat_members WHERE chat_id = ?', [$chatId]);
    Database::query('DELETE FROM messages WHERE id_chats = ?', [$chatId]);
    Database::query('DELETE FROM chats WHERE id = ?', [$chatId]);
    ok(['message' => 'Chat deleted']);
}

function chats_leave(array $user): never
{
    $chatId = (int)(json_body()['chat_id'] ?? 0);
    if (!$chatId) fail('chat_id required');

    Database::query(
        'DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    ok(['message' => 'Left chat']);
}

function chats_add_member(array $user): never
{
    $body   = json_body();
    $chatId = (int)($body['chat_id'] ?? 0);
    $uid    = (int)($body['user_id'] ?? 0);
    if (!$chatId || !$uid) fail('chat_id and user_id required');

    $admin = Database::fetchOne(
        'SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$admin || $admin['role'] !== 'admin') fail('Only admin can add members', 403);

    $exists = Database::fetchOne(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $uid]
    );
    if ($exists) fail('User already in chat');

    Database::insert('chat_members', ['chat_id' => $chatId, 'user_id' => $uid, 'role' => 'member', 'unread_count' => 0]);
    ok(['message' => 'Member added']);
}

function chats_members(array $user): never
{
    $chatId = (int)param('chat_id');
    if (!$chatId) fail('chat_id required');

    $member = Database::fetchOne(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$member) fail('Access denied', 403);

    $members = Database::fetchAll(
        "SELECT u.id, u.login, COALESCE(p.nickname, u.login) as nickname,
                a.url_image as avatar, cm.role,
                (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 120) as online
         FROM chat_members cm
         JOIN user u ON u.id = cm.user_id
         LEFT JOIN profile p ON p.id_user = u.id
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE cm.chat_id = ?",
        [$chatId]
    );

    ok(['members' => $members, 'count' => count($members)]);
}

function build_chat_response(int $chatId, int $userId): array
{
    $c = Database::fetchOne(
        "SELECT c.*, cm2.user_id as comp_id,
                COALESCE(op.nickname, other_u.login) as comp_name,
                oa.url_image as comp_avatar
         FROM chats c
         LEFT JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != ?
         LEFT JOIN user other_u ON other_u.id = cm2.user_id
         LEFT JOIN profile op ON op.id_user = other_u.id
         LEFT JOIN avatar oa ON oa.id = op.id_avatar
         WHERE c.id = ?",
        [$userId, $chatId]
    );

    return [
        'id'           => $chatId,
        'is_group'     => (bool)$c['is_group'],
        'name'         => $c['is_group'] ? $c['name'] : ($c['comp_name'] ?? ''),
        'avatar'       => $c['comp_avatar'] ?? null,
        'companion_id' => $c['comp_id'] ?? null,
        'last_message' => null,
        'unread'       => 0,
        'online'       => false,
    ];
}
