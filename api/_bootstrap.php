<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

session_start();

header('Content-Type: application/json; charset=utf-8');

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function readJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        jsonResponse(['error' => 'Некорректное тело JSON.'], 400);
    }

    return $data;
}

function currentUser(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $stmt = db()->prepare('SELECT id, username, display_name, avatar_url, status_text, accent_color, created_at FROM users WHERE id = ?');
    $stmt->execute([(int) $_SESSION['user_id']]);
    $user = $stmt->fetch();

    return $user ?: null;
}

function requireUser(): array
{
    $user = currentUser();
    if ($user === null) {
        jsonResponse(['error' => 'Нужно войти в аккаунт.'], 401);
    }

    return $user;
}

function cleanString(mixed $value, int $maxLength): string
{
    $string = trim((string) $value);
    $string = preg_replace('/\s+/', ' ', $string) ?? '';

    return safeSubstring($string, 0, $maxLength);
}

function safeSubstring(string $value, int $start, int $length): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($value, $start, $length);
    }

    return substr($value, $start, $length);
}

function ensureGuildMembership(int $guildId, int $userId): void
{
    $stmt = db()->prepare('SELECT 1 FROM guild_members WHERE guild_id = ? AND user_id = ?');
    $stmt->execute([$guildId, $userId]);

    if (!$stmt->fetchColumn()) {
        jsonResponse(['error' => 'Вы не состоите на этом сервере.'], 403);
    }
}
