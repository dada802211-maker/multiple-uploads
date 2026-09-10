<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/archives.php';

try {
    $action = $_GET['action'] ?? 'session';
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET') {
        if ($method !== 'POST') fail('許可されていないメソッドです。', 405);
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('画面を再読み込みしてください。', 403);
    }
    $writes = ['register', 'login', 'logout', 'create', 'update', 'delete'];
    if (in_array($action, $writes, true) && $method !== 'POST') fail('POSTが必要です。', 405);
    if ($action === 'session') respond(['user' => user(), 'csrf' => $_SESSION['csrf']]);
    if ($action === 'register' || $action === 'login') {
        $data = input();
        $email = strtolower(field($data, 'email', 254));
        $password = $data['password'] ?? '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !is_string($password) || strlen($password) < 10 || strlen($password) > 72) fail('有効なメールアドレスと10〜72バイトのパスワードを入力してください。');
        if ($action === 'register') {
            $name = field($data, 'name', 60);
            $q = $db->prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)');
            try { $q->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]); }
            catch (PDOException $e) { if ($e->getCode() === '23000') fail('このメールアドレスは登録済みです。', 409); throw $e; }
            $id = (int)$db->lastInsertId();
        } else {
            $q = $db->prepare('SELECT * FROM users WHERE email = ?');
            $q->execute([$email]);
            $account = $q->fetch();
            if (!$account || !password_verify($password, $account['password'])) { usleep(300000); fail('メールアドレスまたはパスワードが違います。', 401); }
            $id = $account['id'];
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = $id;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['user' => user(), 'csrf' => $_SESSION['csrf'], 'message' => $action === 'register' ? 'ユーザー登録しました。' : 'ログインしました。']);
    }
    if ($action === 'logout') {
        $_SESSION = ['csrf' => bin2hex(random_bytes(32))];
        session_regenerate_id(true);
        respond(['message' => 'ログアウトしました。', 'csrf' => $_SESSION['csrf']]);
    }
    if ($action === 'list') {
        $items = $db->query('SELECT a.id,a.user_id,a.title,a.description,a.visibility,a.download_name,a.size,a.created_at,u.name AS user_name FROM archives a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC')->fetchAll();
        respond(['archives' => $items]);
    }
    if ($action === 'create') createArchive($db, requireUser());
    if (in_array($action, ['download', 'update', 'delete'], true)) {
        $q = $db->prepare('SELECT * FROM archives WHERE id = ?');
        $q->execute([(int)($_GET['id'] ?? 0)]);
        $item = $q->fetch();
        if (!$item) fail('対象のZIPが見つかりません。', 404);
        if ($action === 'download') {
            if ($item['visibility'] === 'members') requireUser();
            $path = STORAGE . '/archives/' . $item['stored_name'];
            if (!is_file($path)) fail('ファイルが見つかりません。', 404);
            session_write_close();
            header('Content-Type: application/zip');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: private, no-store');
            header('Content-Length: ' . filesize($path));
            header("Content-Disposition: attachment; filename=\"download.zip\"; filename*=UTF-8''" . rawurlencode($item['download_name']));
            readfile($path);
            exit;
        }
        if ((int)requireUser()['id'] !== (int)$item['user_id']) fail('登録したユーザーのみ操作できます。', 403);
        if ($action === 'update') {
            [$title, $description, $visibility, $name] = metadata(input());
            $q = $db->prepare('UPDATE archives SET title=?,description=?,visibility=?,download_name=? WHERE id=?');
            $q->execute([$title, $description, $visibility, $name, $item['id']]);
            respond(['message' => '登録情報を更新しました。']);
        }
        // ZIP本体は削除せず保管。ユーザーの「ZIP以外を削除」に対応します。
        $q = $db->prepare('DELETE FROM archives WHERE id=?');
        $q->execute([$item['id']]);
        respond(['message' => '登録情報を削除しました。ZIP本体は保管されています。']);
    }
    fail('APIが見つかりません。', 404);
} catch (Throwable $e) {
    error_log((string)$e);
    fail('サーバー処理に失敗しました。管理者にお問い合わせください。', 500);
}
