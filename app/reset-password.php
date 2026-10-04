<?php
// Command-line only: reset someone's password, or create an admin if locked out.
//   docker exec -it grapes-keeper php /var/www/html/reset-password.php USERNAME NEWPASSWORD
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/lib.php';

[$self, $username, $password] = array_pad($argv, 3, '');
if ($username === '' || strlen($password) < 8) {
    fwrite(STDERR, "Usage: php reset-password.php USERNAME NEWPASSWORD (8+ characters)\n");
    exit(1);
}
$u = find_user_by_username($username);
if ($u) {
    db()->prepare('UPDATE gk_users SET pass_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    end_user_sessions($u['id']);
    db()->prepare('DELETE FROM gk_settings WHERE k LIKE ?')->execute(['fails:%']);
    echo "Password reset for {$u['username']}.\n";
} else {
    create_user($username, $username, 'admin', $password);
    echo "No user called '$username', so created them as an admin.\n";
}
