<?php
/* ============================================
   Enigma — api/profile.php
   ============================================ */
require_once __DIR__ . '/../index.php';

$action = param('action', '');
$user   = require_auth();

match ($action) {
    'get'           => profile_get($user),
    'update'        => profile_update($user),
    'upload_avatar' => profile_upload_avatar($user),
    'set_status'    => profile_set_status($user),
    default         => fail('Unknown action'),
};

function profile_get(array $user): never
{
    $targetId = (int)(param('user_id') ?? $user['id']);

    $profile = Database::fetchOne(
        "SELECT p.*, a.url_image as avatar_url,
                u.login, u.status, u.last_seen,
                (EXTRACT(EPOCH FROM NOW() - u.last_seen) < 120) as online
         FROM profile p
         JOIN user u ON u.id = p.id_user
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE p.id_user = ?",
        [$targetId]
    );

    if (!$profile) fail('Profile not found', 404);
    ok(['profile' => $profile]);
}

function profile_update(array $user): never
{
    $body     = json_body();
    $nickname = trim($body['nickname'] ?? '');
    $status   = trim($body['status']   ?? '');

    $updates = [];
    if ($nickname !== '') $updates['nickname'] = substr($nickname, 0, 32);

    if (!empty($updates)) {
        Database::update('profile', $updates, 'id_user = ?', [$user['id']]);
    }
    if ($status !== '') {
        Database::update('user', ['status' => substr($status, 0, 60)], 'id = ?', [$user['id']]);
    }

    // Privacy settings
    foreach (['show_online', 'read_receipts', 'typing_status'] as $field) {
        if (isset($body[$field])) {
            Database::update('profile', [$field => (int)(bool)$body[$field]], 'id_user = ?', [$user['id']]);
        }
    }

    ok(['message' => 'Профиль обновлён']);
}

function profile_upload_avatar(array $user): never
{
    if (empty($_FILES['avatar'])) fail('No file uploaded');

    $file = $_FILES['avatar'];
    if ($file['error'] !== UPLOAD_ERR_OK) fail('Upload error');
    if ($file['size'] > 5 * 1024 * 1024) fail('Файл слишком большой (макс. 5MB)');

    $allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    $mime    = mime_content_type($file['tmp_name']);
    if (!in_array($mime, $allowed)) fail('Недопустимый тип файла');

    $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = 'av_' . $user['id'] . '_' . time() . '.' . strtolower($ext);
    $dir      = UPLOAD_DIR . 'avatars/';

    if (!is_dir($dir)) mkdir($dir, 0755, true);
    if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) fail('Ошибка сохранения файла');

    $url = UPLOAD_URL . 'avatars/' . $filename;

    // Save or update avatar record
    $existing = Database::fetchOne(
        'SELECT id FROM avatar WHERE id = (SELECT id_avatar FROM profile WHERE id_user = ?)',
        [$user['id']]
    );

    if ($existing) {
        Database::update('avatar', ['url_image' => $url], 'id = ?', [$existing['id']]);
        $avatarId = $existing['id'];
    } else {
        $avatarId = Database::insert('avatar', ['url_image' => $url]);
        Database::update('profile', ['id_avatar' => $avatarId], 'id_user = ?', [$user['id']]);
    }

    ok(['url' => $url, 'avatar_id' => $avatarId]);
}

function profile_set_status(array $user): never
{
    $status = trim(json_body()['status'] ?? '');
    Database::update('user', ['status' => substr($status, 0, 60)], 'id = ?', [$user['id']]);
    ok(['message' => 'Status updated']);
}
