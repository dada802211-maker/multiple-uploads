# zipshare

複数のファイルをZIPにまとめて共有するアプリです。フロントは `front/` のReact・TypeScript、バックエンドは `php/` のPHP・SQLiteです。

## 機能と仕様

- ユーザー登録、ログイン、ログアウト。パスワードはハッシュ化して保存。
- 複数ファイル（最大20個・合計100MiB）をZIP化、または既存ZIPを1個選択して登録。
- ZIPは48桁の暗号学的乱数＋`.zip` で保存。ダウンロード名はSQLiteに別途保存。
- タイトル、説明、登録ユーザー、ダウンロード名、公開範囲、容量、登録日時を記録。
- 公開範囲は「誰でも」と「登録ユーザーのみ」。後者は**ログイン済みの全ユーザー**が対象です。
- タイトル・説明・登録者は未ログインでも一覧に表示されます。制限対象はZIPのダウンロードです。
- 投稿者のみタイトル・説明・ダウンロード名・公開範囲を編集可能。登録ユーザーはログイン情報から自動設定し、変更不可。
- **ZIP本体の変更・削除は不可**。「登録情報を削除」はDBの投稿行だけを削除し、ZIP本体は残します。削除後は一覧・ダウンロードAPIからアクセスできません。画面からの復元機能はありません。
- 同じ名前の個別ファイルはZIP内で `2_名前` のように連番を付け、上書きを防ぎます。
- 登録・認証・編集・削除・ダウンロード・通信エラーをトースト表示。保存完了自体はブラウザーのダウンロード一覧で確認できます。
- タイトル・説明・登録者の検索、一般公開／自分の投稿の絞り込み、スマートフォン対応。

## 必要環境

- PHP 8.2以上、拡張 `pdo_sqlite`、`zip`、`mbstring`。
- Node.js 22.12以上（フロントビルド用）、npm。
- PHP実行ユーザーが `storage/` に読み書きできること。DB・セッション・ZIPは初回アクセス時に自動作成されます。

## ローカル起動（Windows / Laragon）

プロジェクトのルートで実行します。

```powershell
cd front
npm ci
npm run build
cd ..
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

[http://127.0.0.1:8011](http://127.0.0.1:8011) を開きます。停止は `Ctrl+C`。初期ユーザーはありません。画面右上から登録してください。

`start.ps1` はPHPの一時アップロード先、ファイル上限100M、POST上限110M、最大20ファイルを設定します。PHPがPATHにない場合は、Laragonのターミナルから実行するかPHPへのPATHを設定してください。

フロント開発時は次のコマンドだけでPHPとViteを同時に起動します。`start.ps1` を別途実行する必要はありません。すでに8011番ポートでPHPを起動している場合は、先にそのターミナルで停止してください。

```powershell
cd front
npm run dev
```

表示されたViteのURLを開きます。`/api` は `127.0.0.1:8011` にプロキシします。ZIP保存先はこのプロジェクトの `storage/archives/` に固定し、アップロード上限は `start.ps1` と同じです。`Ctrl+C` で両方停止します。PHPの起動に失敗した場合はViteも起動しません。`npm run preview` 単体ではAPIを利用できません。

Linux/macOSではアップロード一時ディレクトリを用意し、同等の設定で起動できます。

```sh
mkdir -p storage/tmp
php -d upload_tmp_dir="$PWD/storage/tmp" -d upload_max_filesize=100M -d post_max_size=110M -d max_file_uploads=20 -d display_errors=0 -S 127.0.0.1:8011 php/router.php
```

## Apache / LaragonのVirtualHost

`front` をビルド後、DocumentRootを**プロジェクト内の `public` フォルダ**に指定します。`mod_rewrite` と `.htaccess` を有効にしてください。

```apache
<VirtualHost *:80>
    ServerName zipshare.test
    DocumentRoot "C:/laragon/www/multiple-uploads/public"
    <Directory "C:/laragon/www/multiple-uploads/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

hostsファイルで `zipshare.test` を `127.0.0.1` に割り当ててApacheを再起動します。サイトはドメインのルートに配置する想定です。サブディレクトリ配置には対応していません。

Apache用の `php.ini` に以下を設定し、書き込み可能なアップロード一時フォルダを指定してください。

```ini
upload_max_filesize = 100M
post_max_size = 110M
max_file_uploads = 20
display_errors = Off
log_errors = On
```

`storage/`、`.git/`、ソースを直接公開しない構成です。PHP内蔵サーバーのルーターもAPIとビルド済みフロントだけを配信します。ZIPを展開・実行する処理はありません。変更APIはCSRFトークンを検証し、所有者とダウンロード権限をサーバー側で判定します。

外部公開時はHTTPSを設定してください。メール確認、パスワード再発行、ウイルススキャン、アカウント単位の容量制限・ログイン回数制限は未実装です。登録情報を削除してもZIPは残るため、保管容量の管理が必要です。

## ファイル構成

```text
front/src/
  App.tsx                   一覧・検索・状態管理・トースト
  App.css / index.css       レイアウトと共通スタイル
  api/client.ts             認証付きAPI通信・ダウンロード
  components/AuthForm.tsx   ログイン・ユーザー登録画面
  components/ArchiveForm.tsx ZIP登録・情報編集フォーム
  types/archive.ts          ユーザーとアーカイブの型
php/
  bootstrap.php             セッション・SQLite初期化・入力検証
  index.php                 認証・一覧・編集・削除・配信API
  archives.php              ファイル検証・ZIP生成・保存
  router.php                公開パスの制限とフロント配信
public/                     ApacheのDocumentRoot
storage/                    DB・ZIP・セッション（Git対象外）
tests/smoke.py               一時DBを使うHTTP結合テスト
start.ps1                   Windows用開発サーバー起動
```

`APP_STORAGE` 環境変数で保存先を変更できます。ただし、Windows用 `start.ps1` は別プロジェクトとの混同を防ぐため、このプロジェクトの `storage/` に固定します。バックアップはサービスを停止し、SQLiteと `archives/` をセットでコピーしてください。

## API

入口は `/api?action=処理名` です。変更操作はPOSTで、`session` から取得した値を `X-CSRF-Token` ヘッダーに付けます。

| action           | メソッド | 内容                                                                                                             |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| session          | GET      | 現在のユーザー・CSRFトークン                                                                                     |
| register / login | POST     | JSONで認証。登録はname・email・password                                                                          |
| logout           | POST     | ログアウト                                                                                                       |
| list             | GET      | ZIP登録情報の一覧                                                                                                |
| create           | POST     | multipart/form-data。files[]、mode（files/zip）、title、description、download_name、visibility（public/members） |
| update&id=ID     | POST     | JSONでtitle・description・download_name・visibilityを更新                                                        |
| delete&id=ID     | POST     | 投稿者のみ登録情報を削除。ZIPは保持                                                                              |
| download&id=ID   | GET      | 権限を検証してZIP配信                                                                                            |

## 検証

```powershell
cd front
npm run build
npm run lint
cd ..
python tests/smoke.py
Get-ChildItem php/*.php | ForEach-Object { php -l $_.FullName }
```

結合テストはPython 3の標準ライブラリを使用し、一時ディレクトリと空きポートでPHPを起動します。既存のユーザー・ZIP・DBは変更しません。認証、CSRF、ZIP生成／アップロード、同名ファイル、日本語ダウンロード名、公開範囲、所有者制限、編集、登録情報削除後のZIP保持、非公開パスを検証します。
