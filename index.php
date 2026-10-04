<?php
// Entry point: first-time password setup, login, logout, password change, then the app.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

$hash = setting('password_hash');
$action = $_POST['action'] ?? ($_GET['action'] ?? '');
$msg = '';

if ($action === 'logout') {
    end_login();
    header('Location: ./');
    exit;
}

// First run: choose a password.
if ($hash === null) {
    if ($action === 'setup' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $p1 = (string)($_POST['p1'] ?? '');
        $p2 = (string)($_POST['p2'] ?? '');
        if (strlen($p1) < 8) $msg = 'Use at least 8 characters.';
        elseif ($p1 !== $p2) $msg = "The two passwords don't match.";
        else {
            set_setting('password_hash', password_hash($p1, PASSWORD_DEFAULT));
            start_login();
            header('Location: ./');
            exit;
        }
    }
    page_login('Choose a password', 'This is the password for The Grapes Keeper. You\'ll only need it once on each phone or computer.', 'setup', $msg);
}

// Login.
if (!logged_in()) {
    if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $fails = (int)setting('fails', '0');
        $lockUntil = (int)setting('lock_until', '0');
        if ($lockUntil > time()) {
            $msg = 'Too many wrong tries. Wait ' . ceil(($lockUntil - time()) / 60) . ' minutes and try again.';
        } elseif (password_verify((string)($_POST['p1'] ?? ''), $hash)) {
            set_setting('fails', '0');
            start_login();
            header('Location: ./');
            exit;
        } else {
            $fails++;
            set_setting('fails', (string)$fails);
            if ($fails >= 5) { set_setting('lock_until', (string)(time() + 600)); set_setting('fails', '0'); }
            sleep(1);
            $msg = 'That password isn\'t right.';
        }
    }
    page_login('Log in', '', 'login', $msg);
}

// Change password (from the Setup tab).
if ($action === 'changepw' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $ok = password_verify((string)($_POST['cur'] ?? ''), $hash);
    $p1 = (string)($_POST['p1'] ?? '');
    if (!$ok) $msg = 'The current password isn\'t right.';
    elseif (strlen($p1) < 8) $msg = 'The new password needs at least 8 characters.';
    elseif ($p1 !== ($_POST['p2'] ?? '')) $msg = "The two new passwords don't match.";
    else {
        set_setting('password_hash', password_hash($p1, PASSWORD_DEFAULT));
        db()->exec('DELETE FROM gk_tokens'); // log out every other device
        start_login();
        $msg = 'Password changed. Other phones and computers will need the new one.';
    }
}

$logo = logo_file();
$v = (string)filemtime(__DIR__ . '/app.js');
?><!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Grapes Keeper</title>
<meta name="theme-color" content="#5d2a63">
<link rel="manifest" href="manifest.php">
<?php if ($logo): ?><link rel="icon" href="<?= h($logo) ?>"><link rel="apple-touch-icon" href="<?= h($logo) ?>"><?php else: ?><link rel="icon" href="icon.svg"><?php endif; ?>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Grapes Keeper">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="app.css?v=<?= h($v) ?>">
</head>
<body>
<?php
$app = file_get_contents(__DIR__ . '/app.html');
if ($logo) {
    $app = preg_replace('#<span class="logo" id="logo" aria-hidden="true">.*?</span>#s',
        '<span class="logo" id="logo"><img src="' . h($logo) . '" alt="The Grapes"></span>', $app, 1);
}
$app = str_replace('<!--PW_MSG-->', $msg ? '<div class="banner info">' . h($msg) . '</div>' : '', $app);
echo $app;
?>
<script src="app.js?v=<?= h($v) ?>"></script>
<?php if ($msg && $action === 'changepw'): ?><script>document.querySelector('[data-tab="setup"]').click()</script><?php endif; ?>
</body>
</html>
<?php
exit;

function page_login(string $title, string $intro, string $action, string $msg): void
{
    $logo = logo_file();
    ?><!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Grapes Keeper</title>
<meta name="theme-color" content="#5d2a63">
<link rel="manifest" href="manifest.php">
<?php if ($logo): ?><link rel="icon" href="<?= h($logo) ?>"><link rel="apple-touch-icon" href="<?= h($logo) ?>"><?php else: ?><link rel="icon" href="icon.svg"><?php endif; ?>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<link rel="stylesheet" href="app.css">
</head>
<body>
<div class="wrap" style="max-width:420px;padding-block:12vh 40px">
  <form class="card" method="post" action="./">
    <div class="brand">
      <span class="logo"><?php if ($logo): ?><img src="<?= h($logo) ?>" alt="The Grapes"><?php else: ?><img src="icon.svg" alt=""><?php endif; ?></span>
      <h1><small>The Grapes · Bedlington</small>The Grapes Keeper</h1>
    </div>
    <h2><?= h($title) ?></h2>
    <?php if ($intro): ?><p class="muted"><?= h($intro) ?></p><?php endif; ?>
    <?php if ($msg): ?><div class="check bad"><?= h($msg) ?></div><?php endif; ?>
    <input type="hidden" name="action" value="<?= h($action) ?>">
    <label class="f">Password<input type="password" name="p1" id="p1" required autocomplete="<?= $action === 'setup' ? 'new-password' : 'current-password' ?>" autofocus style="width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:1.05rem;min-height:46px"></label>
    <?php if ($action === 'setup'): ?>
    <label class="f">Same password again<input type="password" name="p2" id="p2" required autocomplete="new-password" style="width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);font-size:1.05rem;min-height:46px"></label>
    <?php endif; ?>
    <div class="actions"><button class="btn primary" type="submit"><?= $action === 'setup' ? 'Save password' : 'Log in' ?></button></div>
  </form>
</div>
</body>
</html><?php
    exit;
}
