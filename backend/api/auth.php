<?php
/* ============================================
   Enigma — api/auth.php
   Register, Login, Logout, Recovery, Me
   ============================================ */

require_once __DIR__ . '/../index.php';

$action = param('action', '');

match ($action) {
    'register'       => action_register(),
    'login'          => action_login(),
    'logout'         => action_logout(),
    'me'             => action_me(),
    'recover'        => action_recover(),
    'reset_password' => action_reset_password(),
    'change_password'=> action_change_password(),
    'delete_account' => action_delete_account(),
    default          => fail('Unknown action'),
};

/* ─────────────────────────────────────── */
function action_register(): never
{
    $body     = json_body();
    $login    = trim($body['login']    ?? '');
    $email    = trim($body['email']    ?? '');
    $password = $body['password']      ?? '';
    $nickname = trim($body['nickname'] ?? $login);

    if (!$login || !$email || !$password) fail('Заполните все поля');
    if (strlen($login) < 3)  fail('Логин минимум 3 символа');
    if (strlen($password) < 6) fail('Пароль минимум 6 символов');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Неверный формат email');
    if (!preg_match('/^[a-z0-9_\.]+$/i', $login)) fail('Логин содержит недопустимые символы');

    // Check duplicates
    if (Database::fetchOne('SELECT id FROM user WHERE login = ?', [$login])) {
        fail('Логин уже занят');
    }
    if (Database::fetchOne('SELECT id FROM user WHERE email = ?', [$email])) {
        fail('Email уже используется');
    }

    Database::beginTransaction();
    try {
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $userId = Database::insert('user', [
            'login'         => $login,
            'email'         => $email,
            'password_hash' => $hash,
            'status'        => 'Привет, я использую Enigma!',
            'created_at'    => date('Y-m-d H:i:s'),
        ]);

        // Create profile
        Database::insert('profile', [
            'id_user'    => $userId,
            'email_user' => $email,
            'nickname'   => $nickname,
        ]);

        Database::commit();

        ok(['message' => 'Аккаунт создан', 'user_id' => $userId], 201);
    } catch (Throwable $e) {
        Database::rollback();
        if (DEBUG) fail($e->getMessage());
        fail('Ошибка регистрации');
    }
}

/* ─────────────────────────────────────── */
function action_login(): never
{
    $body     = json_body();
    $login    = trim($body['login']    ?? '');
    $password = $body['password']      ?? '';

    if (!$login || !$password) fail('Введите логин и пароль');

    // Find by login or email
    $user = Database::fetchOne(
        'SELECT * FROM user WHERE login = ? OR email = ? LIMIT 1',
        [$login, $login]
    );

    if (!$user || !password_verify($password, $user['password_hash'])) {
        fail('Неверный логин или пароль', 401);
    }

    // Update last seen
    Database::update('user', ['last_seen' => date('Y-m-d H:i:s')], 'id = ?', [$user['id']]);

    $token = jwt_encode(['user_id' => $user['id'], 'login' => $user['login']]);

    $profile = Database::fetchOne(
        'SELECT p.*, a.url_image as avatar_url FROM profile p
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE p.id_user = ?',
        [$user['id']]
    );

    ok([
        'token' => $token,
        'user'  => [
            'id'       => $user['id'],
            'login'    => $user['login'],
            'email'    => $user['email'],
            'nickname' => $profile['nickname'] ?? $user['login'],
            'avatar'   => $profile['avatar_url'] ?? null,
            'status'   => $user['status'] ?? '',
        ],
    ]);
}

/* ─────────────────────────────────────── */
function action_logout(): never
{
    // Stateless JWT — client drops the token
    // Optionally: store invalidated tokens in a blacklist table
    ok(['message' => 'Logged out']);
}

/* ─────────────────────────────────────── */
function action_me(): never
{
    $user = require_auth();

    $profile = Database::fetchOne(
        'SELECT p.*, a.url_image as avatar_url FROM profile p
         LEFT JOIN avatar a ON a.id = p.id_avatar
         WHERE p.id_user = ?',
        [$user['id']]
    );

    ok([
        'user' => [
            'id'         => $user['id'],
            'login'      => $user['login'],
            'email'      => $user['email_user'] ?? $user['email'],
            'nickname'   => $profile['nickname'] ?? $user['login'],
            'avatar'     => $profile['avatar_url'] ?? null,
            'status'     => $user['status'] ?? '',
            'email_user' => $profile['email_user'] ?? '',
        ],
    ]);
}

/* ─────────────────────────────────────── */
function action_recover(): never
{
    $email = trim(json_body()['email'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Неверный email');

    $user = Database::fetchOne('SELECT id FROM user WHERE email = ?', [$email]);

    // Always respond OK (don't expose whether email exists)
    if ($user) {
        $token   = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 3600);

        // PostgreSQL upsert
        Database::query(
            'INSERT INTO password_reset (user_id, token, expires_at)
             VALUES (?, ?, ?)
             ON CONFLICT (user_id) DO UPDATE
             SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at',
            [$user['id'], $token, $expires]
        );

        // TODO: Send email with reset link
        // mail($email, 'Сброс пароля Enigma', APP_URL . '/reset?token=' . $token);
        // For dev: log the token
        if (DEBUG) error_log("Password reset token for {$email}: {$token}");
    }

    ok(['message' => 'Если email существует, письмо отправлено']);
}

/* ─────────────────────────────────────── */
function action_reset_password(): never
{
    $body    = json_body();
    $token   = trim($body['token']        ?? '');
    $newPass = $body['new_password']      ?? '';

    if (!$token || strlen($newPass) < 6) fail('Неверный запрос');

    $reset = Database::fetchOne(
        'SELECT * FROM password_reset WHERE token = ? AND expires_at > NOW()',
        [$token]
    );
    if (!$reset) fail('Ссылка недействительна или истекла', 400);

    $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    Database::update('user', ['password_hash' => $hash], 'id = ?', [$reset['user_id']]);
    Database::query('DELETE FROM password_reset WHERE token = ?', [$token]);

    ok(['message' => 'Пароль изменён']);
}

/* ─────────────────────────────────────── */
function action_change_password(): never
{
    $user    = require_auth();
    $body    = json_body();
    $oldPass = $body['old_password'] ?? '';
    $newPass = $body['new_password'] ?? '';

    if (!$oldPass || strlen($newPass) < 6) fail('Заполните все поля');

    $row = Database::fetchOne('SELECT password_hash FROM user WHERE id = ?', [$user['id']]);
    if (!password_verify($oldPass, $row['password_hash'])) {
        fail('Неверный текущий пароль', 403);
    }

    $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    Database::update('user', ['password_hash' => $hash], 'id = ?', [$user['id']]);

    ok(['message' => 'Пароль изменён']);
}

/* ─────────────────────────────────────── */
function action_delete_account(): never
{
    $user = require_auth();

    Database::beginTransaction();
    try {
        // Cascade delete handled by FK or manual:
        Database::query('DELETE FROM contacts WHERE id_user = ?', [$user['id']]);
        Database::query('DELETE FROM profile WHERE id_user = ?', [$user['id']]);
        Database::query('DELETE FROM user WHERE id = ?', [$user['id']]);
        Database::commit();
        ok(['message' => 'Аккаунт удалён']);
    } catch (Throwable $e) {
        Database::rollback();
        fail('Ошибка удаления');
    }
}
