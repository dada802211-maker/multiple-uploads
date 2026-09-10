<?php
// ZIPは展開せずに保存。個別ファイルの場合はサーバーでZIPを作成します。
function createArchive(PDO $db, array $owner): never {
    [$title, $description, $visibility, $downloadName] = metadata($_POST);
    $files = $_FILES['files'] ?? null;
    if (!$files || !is_array($files['name']) || count($files['name']) < 1 || count($files['name']) > 20) fail('1〜20個のファイルを選択してください。');
    $mode = $_POST['mode'] ?? '';
    if (!in_array($mode, ['files', 'zip'], true)) fail('アップロード形式が不正です。');
    $total = 0;
    foreach ($files['name'] as $i => $name) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK || !is_uploaded_file($files['tmp_name'][$i])) fail('アップロードに失敗しました。容量制限を確認してください。');
        $total += filesize($files['tmp_name'][$i]);
    }
    if ($total > 100 * 1024 * 1024) fail('合計100MB以内で選択してください。');
    $stored = bin2hex(random_bytes(24)) . '.zip';
    $path = STORAGE . '/archives/' . $stored;
    try {
        if ($mode === 'zip') {
            if (count($files['name']) !== 1 || strtolower(pathinfo($files['name'][0], PATHINFO_EXTENSION)) !== 'zip') fail('ZIPファイルを1個選択してください。');
            $zip = new ZipArchive();
            if ($zip->open($files['tmp_name'][0], ZipArchive::CHECKCONS) !== true) fail('有効なZIPファイルではありません。');
            $zip->close();
            if (!move_uploaded_file($files['tmp_name'][0], $path)) throw new RuntimeException('保存失敗');
        } else {
            $zip = new ZipArchive();
            if ($zip->open($path, ZipArchive::CREATE | ZipArchive::EXCL) !== true) throw new RuntimeException('ZIP作成失敗');
            $used = [];
            foreach ($files['name'] as $i => $name) {
                $name = basename(str_replace('\\', '/', $name));
                $name = preg_replace('/[\x00-\x1f\x7f]/', '_', $name);
                if ($name === '' || $name === '.' || $name === '..') $name = 'file';
                $entry = $name;
                $n = 2;
                while (isset($used[strtolower($entry)])) $entry = ($n++) . '_' . $name;
                $used[strtolower($entry)] = true;
                if (!$zip->addFile($files['tmp_name'][$i], $entry)) throw new RuntimeException('ZIP追加失敗');
            }
            if (!$zip->close()) throw new RuntimeException('ZIP保存失敗');
        }
        $q = $db->prepare('INSERT INTO archives (user_id,title,description,visibility,download_name,stored_name,size) VALUES (?,?,?,?,?,?,?)');
        $q->execute([$owner['id'], $title, $description, $visibility, $downloadName, $stored, filesize($path)]);
    } catch (Throwable $e) {
        if (is_file($path)) unlink($path);
        throw $e;
    }
    respond(['message' => 'ZIPを登録しました。'], 201);
}
