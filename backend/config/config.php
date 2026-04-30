<?php
/* ============================================
   Enigma — config.php
   Application configuration (PostgreSQL)
   ============================================ */

$envFile = __DIR__ . '/../../.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        if (!str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        $_ENV[trim($key)] = trim($val);
        putenv(trim($key) . '=' . trim($val));
    }
}

// PostgreSQL defaults
define('DB_HOST',    $_ENV['DB_HOST']    ?? 'localhost');
define('DB_PORT',    $_ENV['DB_PORT']    ?? '5432');       // PG default
define('DB_NAME',    $_ENV['DB_NAME']    ?? 'enigma');
define('DB_USER',    $_ENV['DB_USER']    ?? 'postgres');   // PG default user
define('DB_PASS',    $_ENV['DB_PASS']    ?? '');

define('JWT_SECRET', $_ENV['JWT_SECRET'] ?? 'CHANGE_THIS_SECRET_IN_PRODUCTION');
define('JWT_EXPIRE', (int)($_ENV['JWT_EXPIRE'] ?? 86400 * 30));

define('UPLOAD_DIR', __DIR__ . '/../../backend/uploads/');
define('UPLOAD_URL', '/backend/uploads/');
define('MAX_FILE_SIZE', 20 * 1024 * 1024);

define('APP_URL',    $_ENV['APP_URL']    ?? 'http://localhost');
define('APP_ENV',    $_ENV['APP_ENV']    ?? 'development');
define('DEBUG',      APP_ENV === 'development');

define('ALLOWED_ORIGINS', [
    'http://localhost',
    'http://localhost:8080',
    'http://127.0.0.1',
    $_ENV['APP_URL'] ?? '',
]);
