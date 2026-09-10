<?php
// PHP開発サーバー用。公開するのはビルド済みフロントとAPIだけです。
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/api') { require __DIR__ . '/index.php'; return; }
$root = realpath(__DIR__ . '/../front/dist');
$file = $root ? realpath($root . $path) : false;
if ($file && str_starts_with($file, $root . DIRECTORY_SEPARATOR) && is_file($file)) {
    $types = ['js'=>'text/javascript', 'css'=>'text/css', 'svg'=>'image/svg+xml', 'png'=>'image/png', 'ico'=>'image/x-icon'];
    header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    readfile($file); return;
}
if ($path === '/' && $root) { header('Content-Type: text/html; charset=utf-8'); readfile($root . '/index.html'); return; }
http_response_code(404);
echo 'Not found';
