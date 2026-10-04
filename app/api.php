<?php
// JSON API used by the app. Every call needs a logged-in user.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function list_users(): array
{
    $rows = db()->query('SELECT * FROM gk_users ORDER BY created_at')->fetchAll();
    return array_map('public_user', $rows);
}

try {
    $me = current_user();
    if (!$me) out(['error' => 'login'], 401);
    $isAdmin = $me['role'] === 'admin';

    $a = $_GET['a'] ?? '';

    if ($a === 'all' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $res = array_fill_keys(COLS, []);
        foreach (db()->query('SELECT col, id, data FROM gk_entries') as $row) {
            if (!isset($res[$row['col']])) continue;
            $d = json_decode($row['data'], true);
            if (!is_array($d)) continue;
            $d['id'] = $row['id'];
            $res[$row['col']][] = $d;
        }
        $res['settings'] = json_decode(setting('app', '{}') ?? '{}', true) ?: new stdClass();
        $res['me'] = public_user($me);
        if ($isAdmin) $res['users'] = list_users();
        out($res);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'method'], 405);
    // Same-site check: the app always sends this header; other sites cannot.
    if (($_SERVER['HTTP_X_GRAPES'] ?? '') !== '1') out(['error' => 'forbidden'], 403);

    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > 50000) out(['error' => 'too_big'], 413);
    $in = json_decode($raw, true);
    if (!is_array($in)) out(['error' => 'bad_json'], 400);

    $col = (string)($in['col'] ?? '');
    $id = (string)($in['id'] ?? '');
    $validRef = in_array($col, COLS, true) && preg_match('/^[A-Za-z0-9-]{1,40}$/', $id);

    switch ($a) {
        case 'put':
            $data = $in['data'] ?? null;
            if (!$validRef || !is_array($data)) out(['error' => 'bad_request'], 400);
            $date = (string)($data['date'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) out(['error' => 'bad_date'], 400);
            unset($data['id']);
            $data['by'] = $me['name']; // who entered or last changed it
            db()->prepare('REPLACE INTO gk_entries (col, id, entry_date, data, updated_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$col, $id, $date, json_encode($data), time()]);
            out(['ok' => true, 'by' => $me['name']]);

        case 'del':
            if (!$validRef) out(['error' => 'bad_request'], 400);
            db()->prepare('DELETE FROM gk_entries WHERE col = ? AND id = ?')->execute([$col, $id]);
            out(['ok' => true]);

        case 'settings':
            $s = $in['settings'] ?? null;
            if (!is_array($s)) out(['error' => 'bad_request'], 400);
            $clean = [
                'vat' => !empty($s['vat']),
                'staff' => array_values(array_slice(array_map(fn($x) => mb_substr(trim((string)$x), 0, 60), (array)($s['staff'] ?? [])), 0, 100)),
                'float' => max(0, (int)($s['float'] ?? 0)),
            ];
            set_setting('app', json_encode($clean));
            out(['ok' => true]);

        case 'my_password':
            if (!password_verify((string)($in['current'] ?? ''), $me['pass_hash'])) out(['error' => 'wrong_current'], 400);
            $p = (string)($in['new'] ?? '');
            if (strlen($p) < 8) out(['error' => 'too_short'], 400);
            db()->prepare('UPDATE gk_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($p, PASSWORD_DEFAULT), $me['id']]);
            end_user_sessions($me['id'], true); // log out this person's other devices
            out(['ok' => true]);

        case 'user_add':
            if (!$isAdmin) out(['error' => 'admin_only'], 403);
            $username = clean_username((string)($in['username'] ?? ''));
            $name = trim((string)($in['name'] ?? ''));
            $p = (string)($in['password'] ?? '');
            if ($name === '') out(['error' => 'no_name'], 400);
            if (!valid_username($username)) out(['error' => 'bad_username'], 400);
            if (strlen($p) < 8) out(['error' => 'too_short'], 400);
            if (find_user_by_username($username)) out(['error' => 'username_taken'], 400);
            create_user($username, $name, (string)($in['role'] ?? 'user'), $p);
            out(['ok' => true, 'users' => list_users()]);

        case 'user_update':
            if (!$isAdmin) out(['error' => 'admin_only'], 403);
            $uid = (string)($in['userId'] ?? '');
            $st = db()->prepare('SELECT * FROM gk_users WHERE id = ?');
            $st->execute([$uid]);
            $u = $st->fetch();
            if (!$u) out(['error' => 'not_found'], 404);
            if (isset($in['password']) && $in['password'] !== '') {
                if (strlen((string)$in['password']) < 8) out(['error' => 'too_short'], 400);
                db()->prepare('UPDATE gk_users SET pass_hash = ? WHERE id = ?')->execute([password_hash((string)$in['password'], PASSWORD_DEFAULT), $uid]);
                end_user_sessions($uid, $uid === $me['id']);
            }
            if (isset($in['role'])) {
                $role = $in['role'] === 'admin' ? 'admin' : 'user';
                if ($role === 'user' && $u['role'] === 'admin') {
                    $admins = (int)db()->query("SELECT COUNT(*) FROM gk_users WHERE role = 'admin'")->fetchColumn();
                    if ($admins <= 1) out(['error' => 'last_admin'], 400);
                }
                db()->prepare('UPDATE gk_users SET role = ? WHERE id = ?')->execute([$role, $uid]);
            }
            out(['ok' => true, 'users' => list_users()]);

        case 'user_del':
            if (!$isAdmin) out(['error' => 'admin_only'], 403);
            $uid = (string)($in['userId'] ?? '');
            if ($uid === $me['id']) out(['error' => 'self'], 400);
            end_user_sessions($uid);
            db()->prepare('DELETE FROM gk_users WHERE id = ?')->execute([$uid]);
            out(['ok' => true, 'users' => list_users()]);
    }

    out(['error' => 'unknown'], 404);
} catch (Throwable $e) {
    error_log('Grapes Keeper: ' . $e->getMessage());
    out(['error' => 'server'], 500);
}
