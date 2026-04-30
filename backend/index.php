<?php
/* ============================================
   Enigma — backend/index.php
   API entry point, CORS, JWT middleware
   ============================================ */

require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/Database.php';

/* ── CORS ─────────────────────────────────── */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
if (in_array($origin, ALLOWED_ORIGINS)) {
    header("Access-Control-Allow-Origin: {$origin}");
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/* ── JWT ──────────────────────────────────── */
function jwt_encode(array $payload): string
{
    $header  = base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $payload['exp'] = $payload['exp'] ?? time() + JWT_EXPIRE;
    $payload['iat'] = time();
    $body    = base64url_encode(json_encode($payload));
    $sig     = base64url_encode(hash_hmac('sha256', "{$header}.{$body}", JWT_SECRET, true));
    return "{$header}.{$body}.{$sig}";
}

function jwt_decode(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    [$header, $body, $sig] = $parts;
    $expected = base64url_encode(hash_hmac('sha256', "{$header}.{$body}", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;

    $payload = json_decode(base64url_decode($body), true);
    if (!$payload || (isset($payload['exp']) && $payload['exp'] < time())) return null;

    return $payload;
}

function base64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string
{
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

/* ── Auth middleware ──────────────────────── */
function get_current_user(): ?array
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $auth    = $headers['Authorization'] ?? '';
    }

    if (!str_starts_with($auth, 'Bearer ')) return null;

    $token   = substr($auth, 7);
    $payload = jwt_decode($token);
    if (!$payload || empty($payload['user_id'])) return null;

    return Database::fetchOne(
        'SELECT id, login, email_user, nickname, status, password_hash FROM user WHERE id = ?',
        [$payload['user_id']]
    );
}

function require_auth(): array
{
    $user = get_current_user();
    if (!$user) {
        http_response_code(401);
        die(json_encode(['error' => true, 'message' => 'Unauthorized']));
    }
    return $user;
}

/* ── Request helpers ──────────────────────── */
function json_body(): array
{
    static $body = null;
    if ($body === null) {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true) ?? [];
    }
    return $body;
}

function ok(array $data = [], int $code = 200): never
{
    http_response_code($code);
    echo json_encode(['error' => false, ...$data]);
    exit;
}

function fail(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['error' => true, 'message' => $message]);
    exit;
}

function param(string $key, mixed $default = null): mixed
{
    return $_GET[$key] ?? json_body()[$key] ?? $default;
}

/* ── Router ───────────────────────────────── */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/backend/api/?#', '', $path);
$path = preg_replace('#\?.*$#', '', $path);
$path = trim($path, '/');

// Map path to file
$allowed = ['auth', 'profile', 'contacts', 'chats', 'messages', 'media'];
$file    = strtok($path, '.php') ?: 'auth';

if (!in_array($file, $allowed)) {
    fail('Not found', 404);
}

$target = __DIR__ . "/api/{$file}.php";
if (!file_exists($target)) {
    fail('Endpoint not found', 404);
}

require $target;
