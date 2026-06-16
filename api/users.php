<?php

require __DIR__ . '/_bootstrap.php';

$user = requireUser();

$stmt = db()->prepare(
    'SELECT id, username, display_name, avatar_url, accent_color
     FROM users
     WHERE id != ?
     ORDER BY display_name'
);
$stmt->execute([(int) $user['id']]);

jsonResponse(['users' => $stmt->fetchAll()]);
