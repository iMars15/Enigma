<?php
/* ============================================
   Enigma — api/contacts.php
   ============================================ */
require_once __DIR__ . '/../index.php';

$action = param('action', '');
$user   = require_auth();

match ($action) {
    'list'   => contacts_list($user),
    'search' => contacts_search($user),
    'add'    => contacts_add($user),
    'remove' => contacts_remove($user),
    'block'  => contacts_block($user),
    default  => fail('Unknown action'),
};

function contacts_list(array $user): never
{
    $contacts = Database::fetchAll(
        "SELECT u.id, u.login, COALESCE(p.nickname, u.login) as nickname,
                a.url_image as avatar, c.status,
                (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 120) as online
         FROM contacts c
         JOIN user u ON u.id = c.id_user
         LEFT JOIN profile p ON p.id_user = u.id
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE c.id_user_owner = ? AND c.status = 'active'
         ORDER BY COALESCE(p.nickname, u.login) ASC",
        [$user['id']]
    );

    ok(['contacts' => $contacts]);
}

function contacts_search(array $user): never
{
    $q = trim(param('q', ''));
    if (strlen($q) < 2) fail('Query too short');

    $like = '%' . $q . '%';
    $users = Database::fetchAll(
        "SELECT u.id, u.login, COALESCE(p.nickname, u.login) as nickname,
                a.url_image as avatar,
                (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 120) as online
         FROM user u
         LEFT JOIN profile p ON p.id_user = u.id
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE u.id != ?
           AND (u.login LIKE ? OR p.nickname LIKE ? OR u.email LIKE ?)
         LIMIT 20",
        [$user['id'], $like, $like, $like]
    );

    ok(['users' => $users]);
}

function contacts_add(array $user): never
{
    $targetId = (int)(json_body()['user_id'] ?? 0);
    if (!$targetId || $targetId === $user['id']) fail('Invalid user_id');

    $target = Database::fetchOne('SELECT id FROM user WHERE id = ?', [$targetId]);
    if (!$target) fail('User not found', 404);

    $exists = Database::fetchOne(
        'SELECT id FROM contacts WHERE id_user_owner = ? AND id_user = ?',
        [$user['id'], $targetId]
    );
    if ($exists) fail('Already in contacts');

    Database::insert('contacts', [
        'id_user_owner' => $user['id'],
        'id_user'       => $targetId,
        'status'        => 'active',
    ]);

    ok(['message' => 'Contact added']);
}

function contacts_remove(array $user): never
{
    $targetId = (int)(json_body()['user_id'] ?? 0);
    Database::query(
        'DELETE FROM contacts WHERE id_user_owner = ? AND id_user = ?',
        [$user['id'], $targetId]
    );
    ok(['message' => 'Contact removed']);
}

function contacts_block(array $user): never
{
    $targetId = (int)(json_body()['user_id'] ?? 0);
    Database::update(
        'contacts',
        ['status' => 'blocked'],
        'id_user_owner = ? AND id_user = ?',
        [$user['id'], $targetId]
    );
    ok(['message' => 'User blocked']);
}
