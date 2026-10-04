<?php
// Shared setup: config, database connection, tables and login handling.
declare(strict_types=1);

if (!file_exists(__DIR__ . '/config.php')) {
    http_response_code(500);
    exit('Missing config.php. Copy config.sample.php to config.php and fill in the database details.');
}
$CONFIG = require __DIR__ . '/config.php';

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
    } else {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $CONFIG['db_host'], $CONFIG['db_name']);
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
    $pdo->exec('CREATE TABLE IF NOT EXISTS gk_tokens (
        token_hash CHAR(64) NOT NULL PRIMARY KEY,
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

function logged_in(): bool
{
    $t = $_COOKIE[COOKIE] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) return false;
    $st = db()->prepare('SELECT expires FROM gk_tokens WHERE token_hash = ?');
    $st->execute([hash('sha256', $t)]);
    $exp = $st->fetchColumn();
    return $exp !== false && (int)$exp > time();
}

function start_login(): void
{
    $days = 180; // stay logged in on this device for six months
    $t = bin2hex(random_bytes(32));
    db()->prepare('DELETE FROM gk_tokens WHERE expires < ?')->execute([time()]);
    db()->prepare('INSERT INTO gk_tokens (token_hash, expires) VALUES (?, ?)')
        ->execute([hash('sha256', $t), time() + $days * 86400]);
    setcookie(COOKIE, $t, [
        'expires' => time() + $days * 86400, 'path' => '/', 'secure' => is_https(),
        'httponly' => true, 'samesite' => 'Strict',
    ]);
}

function end_login(): void
{
    $t = $_COOKIE[COOKIE] ?? '';
    if ($t !== '') db()->prepare('DELETE FROM gk_tokens WHERE token_hash = ?')->execute([hash('sha256', $t)]);
    setcookie(COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Strict']);
}

function logo_file(): ?string
{
    foreach (['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp', 'logo.svg'] as $f) {
        if (file_exists(__DIR__ . '/' . $f)) return $f;
    }
    return null;
}

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
