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

// 既存データを保持して公開範囲の制約を更新します。
$db->beginTransaction();
try {
    $schema = $db->query("SELECT sql FROM sqlite_master WHERE name='archives'")->fetchColumn();
    if (!str_contains($schema, "'selected'")) {
        $db->exec("CREATE TABLE archives_new (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','members','selected')), stored_name TEXT NOT NULL UNIQUE, download_name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO archives_new SELECT * FROM archives;
        DROP TABLE archives;
        ALTER TABLE archives_new RENAME TO archives;");
    }
    $db->exec('CREATE TABLE IF NOT EXISTS archive_users (archive_id INTEGER NOT NULL REFERENCES archives(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY (archive_id,user_id))');
    $db->commit();
} catch (Throwable $e) { $db->rollBack(); throw $e; }

function selectedUsers(array $data, int $ownerId): array {
    global $db;
    if ($data['visibility'] !== 'selected') return [];
    $ids = $data['allowed_user_ids'] ?? [];
    if (!is_array($ids) || !$ids) fail('ダウンロードを許可するユーザーを1人以上選択してください。');
    $result = [];
    $q = $db->prepare('SELECT id FROM users WHERE id=?');
    foreach ($ids as $id) {
        if ((!is_int($id) && !is_string($id)) || !ctype_digit((string)$id) || (int)$id <= 0 || (int)$id === $ownerId) fail('選択したユーザーが不正です。');
        $q->execute([$id]);
        if (!$q->fetch()) fail('選択したユーザーが見つかりません。');
        $result[] = (int)$id;
    }
    return array_values(array_unique($result));
}
function saveSelectedUsers(PDO $db, int $archiveId, array $ids): void {
    $db->prepare('DELETE FROM archive_users WHERE archive_id=?')->execute([$archiveId]);
    $q = $db->prepare('INSERT INTO archive_users (archive_id,user_id) VALUES (?,?)');
    foreach ($ids as $id) $q->execute([$archiveId, $id]);
}
function canDownload(array $item, ?array $viewer): bool {
    global $db;
    if ($item['visibility'] === 'public') return true;
    if (!$viewer) return false;
    if ($item['visibility'] === 'members' || (int)$item['user_id'] === (int)$viewer['id']) return true;
    $q = $db->prepare('SELECT 1 FROM archive_users WHERE archive_id=? AND user_id=?');
    $q->execute([$item['id'], $viewer['id']]);
    return (bool)$q->fetchColumn();
}
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
    if (!in_array($visibility, ['public', 'members', 'selected'], true)) fail('公開範囲を確認してください。');
    $name = field($data, 'download_name', 150);
    if (preg_match('/[\x00-\x1f\x7f\/\\\\]/u', $name)) fail('ダウンロード名に制御文字やパスは使えません。');
    if (!str_ends_with(strtolower($name), '.zip')) $name .= '.zip';
    return [$title, $description, $visibility, $name];
}
