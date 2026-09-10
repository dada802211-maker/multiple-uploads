"""実際のPHPサーバーと一時DBで認証・ZIP・権限を検証。Python標準ライブラリのみ。"""
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import http.cookiejar
import zipfile
from contextlib import closing

ROOT = Path(__file__).resolve().parents[1]


class Client:
    def __init__(self, base, endpoint='/api'):
        self.base = base
        self.endpoint = endpoint
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ''

    def request(self, action, data=None, expected=200, content_type='application/json', csrf=True):
        headers = {}
        if data is not None:
            headers['Content-Type'] = content_type
            if csrf:
                headers['X-CSRF-Token'] = self.csrf
            if not isinstance(data, bytes):
                data = json.dumps(data).encode()
        request = urllib.request.Request(self.base + self.endpoint + '?action=' + action, data=data, headers=headers)
        try:
            response = self.http.open(request)
        except urllib.error.HTTPError as error:
            response = error
        body = response.read()
        assert response.status == expected, (action, response.status, body)
        if 'application/json' in response.headers.get('Content-Type', ''):
            try:
                body = json.loads(body)
            except ValueError:
                raise AssertionError(body)
            self.csrf = body.get('csrf', self.csrf)
        return body, response.headers

    def upload(self, fields, files, expected=201):
        boundary = 'ZIPSHARE_TEST_BOUNDARY'
        parts = []
        for key, value in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        for name, body in files:
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + body + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode())
        return self.request('create', b''.join(parts), expected, f'multipart/form-data; boundary={boundary}')


def main():
    with tempfile.TemporaryDirectory(prefix='zipshare-test-') as directory:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        environment = dict(os.environ, APP_STORAGE=directory)
        with open(Path(directory) / 'server.log', 'w') as log:
            server = subprocess.Popen(['php', '-d', f'upload_tmp_dir={directory}', '-d', 'upload_max_filesize=100M', '-d', 'post_max_size=110M', '-S', f'127.0.0.1:{port}', 'php/router.php'], cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                owner, other, guest = [Client(base) for _ in range(3)]
                for _ in range(50):
                    try:
                        owner.request('session')
                        break
                    except urllib.error.URLError:
                        time.sleep(.1)
                other.request('session'); guest.request('session')
                account = {'name': '登録者', 'email': 'owner@example.test', 'password': 'strong-password-123'}
                owner.request('register', account, expected=403, csrf=False)
                owner.request('register', account)
                slash_client = Client(base, '/api/')
                slash_client.request('session')
                slash_client.request('login', account)
                slash_client.request('login', expected=405)
                other.request('register', dict(account, name='別ユーザー', email='other@example.test'))
                guest.request('register', account, expected=409)
                metadata = {'title': '資料', 'description': '説明文', 'visibility': 'members', 'download_name': '日本語資料.zip'}
                owner.upload(dict(metadata, mode='files'), [('same.txt', b'first'), ('same.txt', b'second')])
                items, _ = owner.request('list')
                item = items['archives'][0]
                archive_id = item['id']
                assert 'stored_name' not in item
                guest.request(f'download&id={archive_id}', expected=401)
                body, headers = other.request(f'download&id={archive_id}')
                assert "filename*=UTF-8''" in headers['Content-Disposition']
                with zipfile.ZipFile(io.BytesIO(body)) as archive:
                    assert len(archive.namelist()) == 2
                    assert {archive.read(name) for name in archive.namelist()} == {b'first', b'second'}
                other.request(f'update&id={archive_id}', metadata, expected=403)
                other.request(f'delete&id={archive_id}', {}, expected=403)
                owner.request(f'update&id={archive_id}', dict(metadata, download_name='../bad.zip'), expected=400)
                owner.request(f'update&id={archive_id}', dict(metadata, title='変更済み', visibility='public', download_name='公開'))
                public_body, _ = guest.request(f'download&id={archive_id}')
                assert public_body == body
                owner.upload(dict(metadata, mode='zip'), [('valid.zip', body)])
                owner.upload(dict(metadata, mode='zip'), [('fake.zip', b'not-a-zip')], expected=400)
                guest.upload(dict(metadata, mode='files'), [('file.txt', b'test')], expected=401)
                with closing(sqlite3.connect(Path(directory) / 'app.sqlite')) as db:
                    rows = db.execute('SELECT stored_name,download_name FROM archives').fetchall()
                    assert all(len(row[0]) == 52 and row[0].endswith('.zip') for row in rows)
                    stored_path = Path(directory) / 'archives' / rows[0][0]
                    assert rows[0][1] == '公開.zip'
                    assert db.execute('SELECT password FROM users LIMIT 1').fetchone()[0] != account['password']
                owner.request(f'delete&id={archive_id}', {})
                owner.request(f'download&id={archive_id}', expected=404)
                assert stored_path.is_file(), 'ZIP本体は削除後も保持される'
                owner.request('logout', {})
                owner.request('login', dict(account, password='wrong-password'), expected=401)
                owner.request('login', account)
                for path in ['/storage/app.sqlite', '/php/bootstrap.php', '/.git/config', '/tests/smoke.py']:
                    try:
                        urllib.request.urlopen(base + path)
                        raise AssertionError('内部ファイルが公開されている: ' + path)
                    except urllib.error.HTTPError as error:
                        assert error.code == 404
                print('PASS: registration, login/logout, CSRF, ZIP creation/upload, duplicate filenames, download names, permissions, metadata update/delete, ZIP retention, private paths')
            finally:
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()
