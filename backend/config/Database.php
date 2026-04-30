<?php
/* ============================================
   Enigma — Database.php
   PDO Singleton — PostgreSQL
   ============================================ */

require_once __DIR__ . '/config.php';

class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance === null) {
            // PostgreSQL DSN
            $dsn = sprintf(
                'pgsql:host=%s;port=%s;dbname=%s',
                DB_HOST, DB_PORT, DB_NAME
            );

            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];

            try {
                self::$instance = new PDO($dsn, DB_USER, DB_PASS, $options);
                // UTF-8 for PostgreSQL
                self::$instance->exec("SET client_encoding = 'UTF8'");
            } catch (PDOException $e) {
                http_response_code(503);
                die(json_encode(['error' => true, 'message' => 'Database connection failed']));
            }
        }

        return self::$instance;
    }

    /* ── Query helpers ──────────────────────── */

    public static function query(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function fetchOne(string $sql, array $params = []): ?array
    {
        $row = self::query($sql, $params)->fetch();
        return $row ?: null;
    }

    public static function fetchAll(string $sql, array $params = []): array
    {
        return self::query($sql, $params)->fetchAll();
    }

    // PostgreSQL: RETURNING id instead of lastInsertId()
    public static function insert(string $table, array $data): int
    {
        $cols   = implode(', ', array_keys($data));
        $places = implode(', ', array_fill(0, count($data), '?'));
        $stmt   = self::query(
            "INSERT INTO \"{$table}\" ({$cols}) VALUES ({$places}) RETURNING id",
            array_values($data)
        );
        $row = $stmt->fetch();
        return (int)($row['id'] ?? 0);
    }

    public static function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $set  = implode(', ', array_map(fn($k) => "\"{$k}\" = ?", array_keys($data)));
        $stmt = self::query(
            "UPDATE \"{$table}\" SET {$set} WHERE {$where}",
            [...array_values($data), ...$whereParams]
        );
        return $stmt->rowCount();
    }

    public static function beginTransaction(): void { self::get()->beginTransaction(); }
    public static function commit(): void           { self::get()->commit(); }
    public static function rollback(): void         { self::get()->rollBack(); }
}
