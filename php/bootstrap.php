<?php
declare(strict_types=1);

// 公開ディレクトリの外にDBとZIPを置き、必ずAPI経由で配信します。
define('STORAGE', getenv('APP_STORAGE') ?: dirname(__DIR__) . '/storage');
if (!is_dir(STORAGE . '/archives')) mkdir(STORAGE . '/archives', 0700, true);
if (!is_dir(STORAGE . '/sessions')) mkdir(STORAGE . '/sessions', 0700, true);
session_save_path(STORAGE . '/sessions');
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'path' => '/']);
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
$db = new PDO('sqlite:' . STORAGE . '/app.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
$db->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS archives (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ("public", "members")), stored_name TEXT NOT NULL UNIQUE, download_name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');

function respond(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}
function fail(string $message, int $status = 400): never { respond(['message' => $message], $status); }
function user(): ?array {
    global $db;
    $q = $db->prepare('SELECT id, name, email FROM users WHERE id = ?');
    $q->execute([$_SESSION['user_id'] ?? 0]);
    return $q->fetch() ?: null;
}
function requireUser(): array { return user() ?? fail('ログインしてください。', 401); }
function input(): array {
    $value = json_decode(file_get_contents('php://input'), true);
    if (!is_array($value)) fail('入力形式が正しくありません。');
    return $value;
}
function field(array $data, string $key, int $max, bool $required = true): string {
    if (isset($data[$key]) && !is_string($data[$key])) fail('入力形式が正しくありません。');
    $value = trim($data[$key] ?? '');
    if (($required && $value === '') || mb_strlen($value) > $max) fail($key . ' の入力内容を確認してください。');
    return $value;
}
function metadata(array $data): array {
    $title = field($data, 'title', 120);
    $description = field($data, 'description', 5000, false);
    $visibility = field($data, 'visibility', 10);
    if (!in_array($visibility, ['public', 'members'], true)) fail('公開範囲を確認してください。');
    $name = field($data, 'download_name', 150);
    if (preg_match('/[\x00-\x1f\x7f\/\\\\]/u', $name)) fail('ダウンロード名に制御文字やパスは使えません。');
    if (!str_ends_with(strtolower($name), '.zip')) $name .= '.zip';
    return [$title, $description, $visibility, $name];
}
