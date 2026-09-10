# ビルド済みフロントとAPIを同じポートで起動します。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$uploadDirectory = Join-Path $PSScriptRoot 'storage/tmp'
New-Item -ItemType Directory -Force -Path $uploadDirectory | Out-Null
php -d "upload_tmp_dir=$uploadDirectory" -d upload_max_filesize=100M -d post_max_size=110M -d max_file_uploads=20 -d display_errors=0 -d log_errors=1 -S 127.0.0.1:8000 php/router.php
