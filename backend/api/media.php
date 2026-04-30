<?php
/* ============================================
   Enigma — api/media.php
   ============================================ */
require_once __DIR__ . '/../index.php';

$action = param('action', '');
$user   = require_auth();

match ($action) {
    'upload' => media_upload($user),
    'get'    => media_get($user),
    default  => fail('Unknown action'),
};

function media_upload(array $user): never
{
    if (empty($_FILES['file'])) fail('No file');

    $file   = $_FILES['file'];
    $chatId = (int)($_POST['chat_id'] ?? 0);
    if ($file['error'] !== UPLOAD_ERR_OK) fail('Upload error: ' . $file['error']);
    if ($file['size'] > MAX_FILE_SIZE) fail('Файл слишком большой (макс. 20MB)');

    $member = Database::fetchOne(
        'SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?',
        [$chatId, $user['id']]
    );
    if (!$member) fail('Access denied', 403);

    // Detect file type
    $mime    = mime_content_type($file['tmp_name']);
    $typeMap = [
        'image/jpeg' => 1, 'image/jpg' => 1, 'image/png' => 1, 'image/webp' => 1,
        'image/gif'  => 2,
        'video/mp4'  => 4, 'video/webm' => 4,
    ];
    $fileTypeId = $typeMap[$mime] ?? 5; // 5 = other/document

    $ext      = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $filename = 'media_' . $user['id'] . '_' . uniqid() . '.' . $ext;
    $dir      = UPLOAD_DIR . 'media/';
    if (!is_dir($dir)) mkdir($dir, 0755, true);

    if (!move_uploaded_file($file['tmp_name'], $dir . $filename)) fail('Ошибка сохранения');

    $url = UPLOAD_URL . 'media/' . $filename;

    $mediaId = Database::insert('media', [
        'id_message'   => 0, // updated after message created
        'file_url'     => $url,
        'id_file_type' => $fileTypeId,
        'file_size'    => $file['size'],
        'file_name'    => $file['name'],
        'created_at'   => date('Y-m-d H:i:s'),
    ]);

    ok([
        'media_id'  => $mediaId,
        'url'       => $url,
        'type_id'   => $fileTypeId,
        'file_name' => $file['name'],
        'file_size' => $file['size'],
    ], 201);
}

function media_get(array $user): never
{
    $msgId = (int)param('message_id');
    if (!$msgId) fail('message_id required');

    $media = Database::fetchOne(
        'SELECT * FROM media WHERE id_message = ?',
        [$msgId]
    );
    if (!$media) fail('Not found', 404);

    ok(['media' => $media]);
}
