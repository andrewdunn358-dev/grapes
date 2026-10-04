<?php
// JSON API used by the app. Every call needs a valid login cookie.
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

try {
    if (!logged_in()) out(['error' => 'login'], 401);

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

    if ($a === 'put') {
        $data = $in['data'] ?? null;
        if (!$validRef || !is_array($data)) out(['error' => 'bad_request'], 400);
        $date = (string)($data['date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) out(['error' => 'bad_date'], 400);
        unset($data['id']);
        db()->prepare('REPLACE INTO gk_entries (col, id, entry_date, data, updated_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$col, $id, $date, json_encode($data), time()]);
        out(['ok' => true]);
    }

    if ($a === 'del') {
        if (!$validRef) out(['error' => 'bad_request'], 400);
        db()->prepare('DELETE FROM gk_entries WHERE col = ? AND id = ?')->execute([$col, $id]);
        out(['ok' => true]);
    }

    if ($a === 'settings') {
        $s = $in['settings'] ?? null;
        if (!is_array($s)) out(['error' => 'bad_request'], 400);
        $clean = [
            'vat' => !empty($s['vat']),
            'staff' => array_values(array_slice(array_map(fn($x) => mb_substr(trim((string)$x), 0, 60), (array)($s['staff'] ?? [])), 0, 100)),
            'float' => max(0, (int)($s['float'] ?? 0)),
        ];
        set_setting('app', json_encode($clean));
        out(['ok' => true]);
    }

    out(['error' => 'unknown'], 404);
} catch (Throwable $e) {
    error_log('Grapes Keeper: ' . $e->getMessage());
    out(['error' => 'server'], 500);
}
