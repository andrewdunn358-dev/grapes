<?php
// Entry point: first-time admin setup, login and logout, then the app.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

$action = $_POST['action'] ?? ($_GET['action'] ?? '');
$msg = '';

if ($action === 'logout') {
    end_login();
    header('Location: ./');
    exit;
}

// First run: create the first (admin) account.
if (user_count() === 0) {
    $vals = ['name' => '', 'username' => ''];
    if ($action === 'setup' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $vals['name'] = trim((string)($_POST['name'] ?? ''));
        $vals['username'] = clean_username((string)($_POST['username'] ?? ''));
        $p1 = (string)($_POST['p1'] ?? '');
        if ($vals['name'] === '') $msg = 'Enter your name.';
        elseif (!valid_username($vals['username'])) $msg = 'Usernames use letters, numbers, dots or dashes, no spaces.';
        elseif (strlen($p1) < 8) $msg = 'Use at least 8 characters for the password.';
        elseif ($p1 !== ($_POST['p2'] ?? '')) $msg = "The two passwords don't match.";
        else {
            $id = create_user($vals['username'], $vals['name'], 'admin', $p1);
            start_login($id);
            header('Location: ./');
            exit;
        }
    }
    page_login('setup', $msg, $vals);
}

// Login.
if (!current_user()) {
    $vals = ['username' => ''];
    if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $vals['username'] = clean_username((string)($_POST['username'] ?? ''));
        $key = 'fails:' . substr(hash('sha256', $vals['username']), 0, 32);
        [$fails, $lockUntil] = array_map('intval', explode(':', setting($key, '0:0') . ':0'));
        $u = find_user_by_username($vals['username']);
        if ($lockUntil > time()) {
            $msg = 'Too many wrong tries. Wait ' . ceil(($lockUntil - time()) / 60) . ' minutes and try again.';
        } elseif ($u && password_verify((string)($_POST['p1'] ?? ''), $u['pass_hash'])) {
            set_setting($key, '0:0');
            start_login($u['id']);
            header('Location: ./');
            exit;
        } else {
            $fails++;
            set_setting($key, $fails >= 5 ? '0:' . (time() + 600) : $fails . ':0');
            sleep(1);
            $msg = "That username or password isn't right.";
        }
    }
    page_login('login', $msg, $vals);
}

$logo = logo_file();
$v = (string)max(filemtime(__DIR__ . '/app.js'), filemtime(__DIR__ . '/app.css'));
?><!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Grapes Keeper</title>
<?php head_common($logo); ?>
<link rel="stylesheet" href="app.css?v=<?= h($v) ?>">
</head>
<body>
<?php
$app = file_get_contents(__DIR__ . '/app.html');
if ($logo) {
    $app = preg_replace('#<span class="logo" id="logo" aria-hidden="true">.*?</span>#s',
        '<span class="logo" id="logo"><img src="' . h($logo) . '" alt="The Grapes"></span>', $app, 1);
}
echo $app;
?>
<script src="app.js?v=<?= h($v) ?>"></script>
</body>
</html>
<?php
exit;

function head_common(?string $logo): void
{ ?>
<meta name="theme-color" content="#411111">
<link rel="manifest" href="manifest.php">
<?php if ($logo): ?><link rel="icon" href="<?= h($logo) ?>"><link rel="apple-touch-icon" href="<?= h($logo) ?>"><?php else: ?><link rel="icon" href="icon.svg"><?php endif; ?>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Grapes Keeper">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Atkinson+Hyperlegible:wght@400;700&display=swap">
<?php }

function page_login(string $mode, string $msg, array $vals): void
{
    $logo = logo_file();
    $setup = $mode === 'setup';
    ?><!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>The Grapes Keeper</title>
<?php head_common($logo); ?>
<link rel="stylesheet" href="app.css">
</head>
<body>
<div class="wrap" style="max-width:440px;padding-block:10vh 40px">
  <form class="card" method="post" action="./">
    <div class="brand">
      <span class="logo"><img src="<?= h($logo ?: 'icon.svg') ?>" alt="The Grapes"></span>
      <h1><small>The Grapes · Bedlington</small>The Grapes Keeper</h1>
    </div>
    <h2><?= $setup ? 'Create the admin account' : 'Log in' ?></h2>
    <?php if ($setup): ?><p class="muted">This is the first account. It can add other people, such as Diane, from the Setup tab.</p><?php endif; ?>
    <?php if ($msg): ?><div class="check bad"><?= h($msg) ?></div><?php endif; ?>
    <input type="hidden" name="action" value="<?= $setup ? 'setup' : 'login' ?>">
    <?php if ($setup): ?>
    <label class="f">Your name<input type="text" name="name" id="name" required value="<?= h($vals['name'] ?? '') ?>" autocomplete="name"></label>
    <?php endif; ?>
    <label class="f">Username<input type="text" name="username" id="username" required value="<?= h($vals['username'] ?? '') ?>" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" <?= $setup ? '' : 'autofocus' ?>></label>
    <label class="f">Password<input type="password" name="p1" id="p1" required autocomplete="<?= $setup ? 'new-password' : 'current-password' ?>"></label>
    <?php if ($setup): ?>
    <label class="f">Same password again<input type="password" name="p2" id="p2" required autocomplete="new-password"></label>
    <?php endif; ?>
    <div class="actions"><button class="btn primary" type="submit"><?= $setup ? 'Create account' : 'Log in' ?></button></div>
  </form>
</div>
</body>
</html><?php
    exit;
}
