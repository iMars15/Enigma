<?php
/* ============================================
   Enigma — ws/server.php
   WebSocket server (Ratchet)
   Run: php backend/ws/server.php

   Install: composer require cboden/ratchet
   ============================================ */

require_once __DIR__ . '/../../vendor/autoload.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../index.php'; // jwt helpers

use Ratchet\Server\IoServer;
use Ratchet\Http\HttpServer;
use Ratchet\WebSocket\WsServer;
use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class EnigmaWS implements MessageComponentInterface
{
    /** @var array<int, ConnectionInterface>  conn_id → connection */
    private array $connections = [];

    /** @var array<int, int>  conn_id → user_id */
    private array $userIds = [];

    /** @var array<int, array<int>>  user_id → [conn_id, ...] */
    private array $userConns = [];

    /** @var array<int, array<int>>  user_id → [chat_id, ...] */
    private array $userChats = [];

    /* ── Lifecycle ──────────────────────────── */

    public function onOpen(ConnectionInterface $conn): void
    {
        // Authenticate via ?token= in URL
        $query = [];
        parse_str($conn->httpRequest->getUri()->getQuery(), $query);
        $token   = $query['token'] ?? '';
        $payload = jwt_decode($token);

        if (!$payload || empty($payload['user_id'])) {
            $conn->send(json_encode(['type' => 'error', 'data' => ['message' => 'Unauthorized']]));
            $conn->close();
            return;
        }

        $userId = (int)$payload['user_id'];
        $connId = spl_object_id($conn);

        $this->connections[$connId]   = $conn;
        $this->userIds[$connId]       = $userId;
        $this->userConns[$userId][]   = $connId;

        // Load user's chat IDs
        $rows = Database::fetchAll(
            'SELECT chat_id FROM chat_members WHERE user_id = ?',
            [$userId]
        );
        $this->userChats[$userId] = array_column($rows, 'chat_id');

        // Update online status
        Database::update('user', ['last_seen' => date('Y-m-d H:i:s')], 'id = ?', [$userId]);

        // Broadcast online status to chat members
        $this->broadcastToContactsOf($userId, 'online', [
            'user_id' => $userId,
            'online'  => true,
        ]);

        echo "[WS] User #{$userId} connected (conn #{$connId})\n";
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        $connId = spl_object_id($from);
        $userId = $this->userIds[$connId] ?? null;
        if (!$userId) return;

        $packet = json_decode($msg, true);
        if (!$packet || empty($packet['type'])) return;

        $type = $packet['type'];
        $data = $packet['data'] ?? [];

        switch ($type) {
            case 'typing':
                $this->handleTyping($userId, $data);
                break;
            case 'call_offer':
            case 'call_answer':
            case 'call_ice':
            case 'call_end':
                $this->handleCall($userId, $type, $data);
                break;
            case 'ping':
                $from->send(json_encode(['type' => 'pong']));
                // Update last_seen
                Database::update('user', ['last_seen' => date('Y-m-d H:i:s')], 'id = ?', [$userId]);
                break;
        }
    }

    public function onClose(ConnectionInterface $conn): void
    {
        $connId = spl_object_id($conn);
        $userId = $this->userIds[$connId] ?? null;

        unset($this->connections[$connId], $this->userIds[$connId]);

        if ($userId) {
            $this->userConns[$userId] = array_filter(
                $this->userConns[$userId] ?? [],
                fn($id) => $id !== $connId
            );

            // If no more connections → user offline
            if (empty($this->userConns[$userId])) {
                unset($this->userConns[$userId], $this->userChats[$userId]);
                Database::update('user', ['last_seen' => date('Y-m-d H:i:s')], 'id = ?', [$userId]);

                $this->broadcastToContactsOf($userId, 'online', [
                    'user_id' => $userId,
                    'online'  => false,
                ]);
            }
        }

        echo "[WS] Conn #{$connId} closed\n";
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        echo "[WS] Error: " . $e->getMessage() . "\n";
        $conn->close();
    }

    /* ── Handlers ───────────────────────────── */

    private function handleTyping(int $fromUserId, array $data): void
    {
        $chatId   = (int)($data['chat_id']  ?? 0);
        $isTyping = (bool)($data['is_typing'] ?? false);
        if (!$chatId) return;

        $this->broadcastToChat($chatId, 'typing', [
            'chat_id'   => $chatId,
            'user_id'   => $fromUserId,
            'is_typing' => $isTyping,
        ], exclude: $fromUserId);
    }

    private function handleCall(int $fromUserId, string $type, array $data): void
    {
        $chatId = (int)($data['chat_id'] ?? 0);
        if (!$chatId) return;

        // Add caller info for offer
        if ($type === 'call_offer') {
            $user = Database::fetchOne(
                "SELECT u.login, COALESCE(p.nickname, u.login) as nickname, a.url_image as avatar
                 FROM user u
                 LEFT JOIN profile p ON p.id_user = u.id
                 LEFT JOIN avatar a ON a.id = p.id_avatar
                 WHERE u.id = ?",
                [$fromUserId]
            );
            $data['caller_name']   = $user['nickname'] ?? 'Unknown';
            $data['caller_avatar'] = $user['avatar']   ?? null;
        }

        $this->broadcastToChat($chatId, $type, $data, exclude: $fromUserId);
    }

    /* ── Broadcast helpers ──────────────────── */

    /**
     * Broadcast to all members of a chat (excluding optionally one user)
     */
    public function broadcastToChat(int $chatId, string $type, array $data, int $exclude = 0): void
    {
        $members = Database::fetchAll(
            'SELECT user_id FROM chat_members WHERE chat_id = ?',
            [$chatId]
        );

        $packet = json_encode(['type' => $type, 'data' => $data]);

        foreach ($members as $member) {
            $uid = (int)$member['user_id'];
            if ($uid === $exclude) continue;
            $this->sendToUser($uid, $packet);
        }
    }

    /**
     * Broadcast to all contacts of a user
     */
    private function broadcastToContactsOf(int $userId, string $type, array $data): void
    {
        $contacts = Database::fetchAll(
            "SELECT DISTINCT cm.user_id
             FROM chat_members cm
             WHERE cm.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)
               AND cm.user_id != ?",
            [$userId, $userId]
        );

        $packet = json_encode(['type' => $type, 'data' => $data]);
        foreach ($contacts as $c) {
            $this->sendToUser((int)$c['user_id'], $packet);
        }
    }

    /**
     * Send a new chat message to all chat members (called externally by HTTP API via bridge)
     * For now messages are pushed by polling or by REST; in production
     * use a Redis pub/sub bridge or store msgs in DB and WS picks them up.
     */
    public function pushMessage(int $chatId, array $message): void
    {
        $this->broadcastToChat($chatId, 'message', [
            'chat_id' => $chatId,
            'message' => $message,
        ]);
    }

    private function sendToUser(int $userId, string $packet): void
    {
        foreach ($this->userConns[$userId] ?? [] as $connId) {
            $this->connections[$connId]?->send($packet);
        }
    }
}

/* ── Start server ──────────────────────────── */
$port = (int)($_ENV['WS_PORT'] ?? 8080);

echo "[WS] Enigma WebSocket server starting on port {$port}...\n";

$server = IoServer::factory(
    new HttpServer(new WsServer(new EnigmaWS())),
    $port
);

$server->run();
