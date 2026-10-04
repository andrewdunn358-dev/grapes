<?php
// Shared setup: config, database connection, tables and login handling.
declare(strict_types=1);

// Settings come from config.php (shared hosting) or environment variables (Docker).
if (file_exists(__DIR__ . '/config.php')) {
    $CONFIG = require __DIR__ . '/config.php';
} elseif (getenv('GK_DB_DRIVER') !== false || getenv('GK_SQLITE_PATH') !== false) {
    $CONFIG = [
        'driver'      => getenv('GK_DB_DRIVER') ?: 'sqlite',
        'sqlite_path' => getenv('GK_SQLITE_PATH') ?: '/data/grapes-keeper.sqlite',
        'db_host'     => getenv('GK_DB_HOST') ?: 'localhost',
        'db_port'     => getenv('GK_DB_PORT') ?: '3306',
        'db_name'     => getenv('GK_DB_NAME') ?: '',
        'db_user'     => getenv('GK_DB_USER') ?: '',
        'db_pass'     => getenv('GK_DB_PASS') ?: '',
    ];
} else {
    http_response_code(500);
    exit('Missing config.php. Copy config.sample.php to config.php and fill in the database details.');
}

const COOKIE = 'gk_auth';
const COLS = ['takings', 'expenses', 'wages', 'banking'];

function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    if ($pdo) return $pdo;
    $opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
    if (($CONFIG['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $CONFIG['sqlite_path'], null, null, $opts);
        $pdo->exec('PRAGMA journal_mode = WAL');   // phone and computer can save at the same time
        $pdo->exec('PRAGMA busy_timeout = 5000');
    } else {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $CONFIG['db_host'], $CONFIG['db_port'] ?? '3306', $CONFIG['db_name']);
        $pdo = new PDO($dsn, $CONFIG['db_user'], $CONFIG['db_pass'], $opts);
    }
    // Tables are created automatically on first run (no SQL import needed).
    $pdo->exec('CREATE TABLE IF NOT EXISTS gk_entries (
        col VARCHAR(20) NOT NULL,
        id VARCHAR(40) NOT NULL,
        entry_date VARCHAR(10) NOT NULL,
        data TEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (col, id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS gk_settings (
        k VARCHAR(40) NOT NULL PRIMARY KEY,
        v TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS gk_users (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        username VARCHAR(40) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        role VARCHAR(10) NOT NULL,
        pass_hash VARCHAR(255) NOT NULL,
        created_at BIGINT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS gk_sessions (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
        user_id VARCHAR(40) NOT NULL,
        expires BIGINT NOT NULL)');
    return $pdo;
}

function setting(string $k, ?string $default = null): ?string
{
    $st = db()->prepare('SELECT v FROM gk_settings WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}

function set_setting(string $k, string $v): void
{
    db()->prepare('REPLACE INTO gk_settings (k, v) VALUES (?, ?)')->execute([$k, $v]);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

/* ---------- users ---------- */
function user_count(): int
{
    return (int)db()->query('SELECT COUNT(*) FROM gk_users')->fetchColumn();
}

function find_user_by_username(string $u): ?array
{
    $st = db()->prepare('SELECT * FROM gk_users WHERE username = ?');
    $st->execute([strtolower(trim($u))]);
    $r = $st->fetch();
    return $r ?: null;
}

function clean_username(string $u): string
{
    return strtolower(trim($u));
}

function valid_username(string $u): bool
{
    return (bool)preg_match('/^[a-z0-9._-]{2,40}$/', $u);
}

function create_user(string $username, string $name, string $role, string $password): string
{
    $id = bin2hex(random_bytes(8));
    db()->prepare('INSERT INTO gk_users (id, username, name, role, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$id, clean_username($username), mb_substr(trim($name), 0, 80), $role === 'admin' ? 'admin' : 'user',
            password_hash($password, PASSWORD_DEFAULT), time()]);
    return $id;
}

function public_user(array $u): array
{
    return ['id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role']];
}

/* ---------- sessions (stay logged in on a device) ---------- */
function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $cached = null;
    $t = $_COOKIE[COOKIE] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) return null;
    $st = db()->prepare('SELECT u.* FROM gk_sessions s JOIN gk_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires > ?');
    $st->execute([hash('sha256', $t), time()]);
    $u = $st->fetch();
    $cached = $u ?: null;
    return $cached;
}

function start_login(string $userId): void
{
    $days = 180; // stay logged in on this device for six months
    $t = bin2hex(random_bytes(32));
    db()->prepare('DELETE FROM gk_sessions WHERE expires < ?')->execute([time()]);
    db()->prepare('INSERT INTO gk_sessions (token_hash, user_id, expires) VALUES (?, ?, ?)')
        ->execute([hash('sha256', $t), $userId, time() + $days * 86400]);
    setcookie(COOKIE, $t, [
        'expires' => time() + $days * 86400, 'path' => '/', 'secure' => is_https(),
        'httponly' => true, 'samesite' => 'Strict',
    ]);
}

function end_login(): void
{
    $t = $_COOKIE[COOKIE] ?? '';
    if ($t !== '') db()->prepare('DELETE FROM gk_sessions WHERE token_hash = ?')->execute([hash('sha256', $t)]);
    setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}

function end_user_sessions(string $userId, bool $keepCurrent = false): void
{
    if ($keepCurrent && ($t = $_COOKIE[COOKIE] ?? '') !== '') {
        db()->prepare('DELETE FROM gk_sessions WHERE user_id = ? AND token_hash <> ?')->execute([$userId, hash('sha256', $t)]);
    } else {
        db()->prepare('DELETE FROM gk_sessions WHERE user_id = ?')->execute([$userId]);
    }
}

function logo_file(): ?string
{
    foreach (['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg'] as $f) {
        if (file_exists(__DIR__ . '/' . $f)) return $f;
    }
    return null;
}

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
