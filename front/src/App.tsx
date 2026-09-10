import { useCallback, useEffect, useState } from 'react';
import { api, download } from './api/client';
import type { Archive, Metadata, User } from './types/archive';
import ArchiveForm from './components/ArchiveForm';
import AuthForm from './components/AuthForm';
import './App.css';
type Toast = {
  id: number;
  message: string;
  error: boolean;
};
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState(false);
  const [editor, setEditor] = useState<Archive | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Archive | null>(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts(old => [...old, { id, message, error }]);
    setTimeout(() => setToasts(old => old.filter(t => t.id !== id)), 6000);
  }, []);
  async function refresh() { setItems((await api('list')).archives); }
  const initialize = useCallback(async () => {
    try {
      const session = await api('session');
      setUser(session.user);
      setItems((await api('list')).archives);
    }
    catch (e) {
      setLoadError(true);
      notify(e instanceof Error ? e.message : '読み込みに失敗しました。', true);
    }
    finally {
      setLoading(false);
    }
  }, [notify]);
  // 初期データの非同期取得後にのみstateを更新します。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void initialize(); }, [initialize]);
  // 操作結果をトーストに集約し、処理中の二重送信を防ぎます。
  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    }
    catch (e) {
      notify(e instanceof Error ? e.message : '通信に失敗しました。', true);
    }
    finally {
      setBusy(false);
    }
  }
  async function save(data: FormData | Metadata) {
    await run(async () => { const result = await api(editor === 'new' ? 'create' : 'update', data, editor && editor !== 'new' ? editor.id : undefined); notify(result.message); setEditor(null); await refresh(); });
  }
  const visible = items.filter(item => (filter !== 'mine' || item.user_id === user?.id) && (filter !== 'public' || item.visibility === 'public') && `${item.title} ${item.description} ${item.user_name}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <header>
      <a className="brand" href="/" aria-label="ZIPSHARE ホーム">
        <span className="brand-icon">Z</span>zipshare<span className="brand-dot">.</span>
      </a>
      <div className="account">{user ? <>
        <span>{user.name} さん</span>
        <button className="secondary" disabled={busy} onClick={() => void run(async () => { const result = await api('logout', {}); setUser(null); setEditor(null); setFilter('all'); notify(result.message); })}>ログアウト</button>
      </> : <button className="secondary" disabled={loading || loadError} onClick={() => setAuth(true)}>ログイン / ユーザー登録</button>}</div>
    </header>
    <main>
      <section className="hero">
        <div>
          <span className="eyebrow">YOUR FILES, TOGETHER.</span>
          <h1>まとめて届ける。<br />
            <span>かんたんに共有する。</span>
          </h1>
          <p>複数のファイルを、ひとつのZIPに。<br />必要な人に、必要な資料を届けましょう。</p>
          <button className="primary" disabled={busy || loading || loadError} onClick={() => user ? setEditor('new') : setAuth(true)}>＋ ファイルを登録</button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="paper paper-back">DOC <span>——<br />——</span>
          </div>
          <div className="paper paper-front">IMG <span>◇</span>
          </div>
          <div className="zip-art">
            <span>ZIP</span>
            <div className="zipper">▦<br />▦<br />▦</div>
          </div>
          <span className="art-caption">ALL IN ONE PLACE</span>
        </div>
      </section>
      <div className="stats">
        <span>
          <strong>{items.length}</strong> アーカイブ</span>
        <span>
          <strong>{items.filter(i => i.visibility === 'public').length}</strong> 一般公開</span>
        <span className="stats-note">ファイルの共有を、もっとシンプルに。</span>
      </div>
      {editor && <ArchiveForm key={editor === 'new' ? 'new' : editor.id} item={editor === 'new' ? null : editor} busy={busy} onSave={save} notify={notify} onCancel={() => {
        if (!busy)
          setEditor(null);
      }} />}
      <section className="library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LIBRARY</span>
            <h2>共有アーカイブ <span className="count">{visible.length}</span>
            </h2>
          </div>
          <label className="search">
            <span className="sr-only">アーカイブを検索</span>
            <input type="search" placeholder="タイトル・説明・登録者を検索" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="tabs">{[['all', 'すべて'], ['public', '一般公開'], ...(user ? [['mine', '自分の登録']] : [])].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {loading ? <div className="empty" role="status">アーカイブを読み込んでいます…</div> : loadError ? <div className="empty">
          <h3>読み込みに失敗しました</h3>
          <button className="secondary" onClick={() => { setLoading(true); setLoadError(false); void initialize(); }}>再試行</button>
        </div> : visible.length === 0 ? <div className="empty">
          <span className="empty-icon">▤</span>
          <h3>{query || filter !== 'all' ? '該当するアーカイブがありません' : '最初のファイルを共有しましょう'}</h3>
          <p>複数のファイル、または作成済みのZIPを登録できます。</p>
        </div> : <div className="archive-grid">{visible.map(item => <article className="archive-card" key={item.id}>
          <div className="card-top">
            <span className="file-icon">ZIP</span>
            <span className={`badge ${item.visibility}`}>{item.visibility === 'public' ? '一般公開' : '登録ユーザー限定'}</span>
          </div>
          <h3>{item.title}</h3>
          <p className="description">{item.description || '説明はありません。'}</p>
          <p className="filename" title={item.download_name}>{item.download_name}</p>
          <div className="meta">
            <span>{item.user_name}</span>
            <span>{new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('ja-JP')} · {(item.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
          <button className="download-button" disabled={busy} onClick={() => {
            if (item.visibility === 'members' && !user) {
              notify('ダウンロードにはログインが必要です。');
              setAuth(true);
              return;
            } void run(async () => { await download(item.id, item.download_name); notify('ZIPをブラウザーに渡しました。保存状況をご確認ください。'); });
          }}>{item.visibility === 'members' && !user ? 'ログインしてダウンロード' : '↓ ZIPをダウンロード'}</button>{user?.id === item.user_id && <div className="owner-actions">
            <button disabled={busy} onClick={() => setEditor(item)}>編集</button>
            <button className="danger" disabled={busy} onClick={() => setDeleting(item)}>登録情報を削除</button>
          </div>}</article>)}</div>}
      </section>
      <footer>
        <span className="brand">zipshare.</span>
        <span>ひとつにまとめて、つながる。</span>
      </footer>
    </main>
    {auth && <AuthForm busy={busy} onClose={() => setAuth(false)} onSubmit={(mode, data) => run(async () => { const result = await api(mode, data); setUser(result.user); setAuth(false); notify(result.message); })} />}
    {deleting && <div className="modal-backdrop">
      <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title">登録情報を削除しますか？</h2>
        <p>「{deleting.title}」は一覧から消え、ダウンロードできなくなります。ZIP本体はサーバーに保管されます。</p>
        <div className="form-actions">
          <button className="secondary" disabled={busy} onClick={() => setDeleting(null)}>キャンセル</button>
          <button className="primary danger-bg" disabled={busy} onClick={() => void run(async () => { const result = await api('delete', {}, deleting.id); setDeleting(null); setEditor(null); notify(result.message); await refresh(); })}>削除する</button>
        </div>
      </section>
    </div>}
    <div className="toasts" aria-live="polite" aria-atomic="false">{toasts.map(toast => <div className={`toast ${toast.error ? 'toast-error' : ''}`} key={toast.id}>
      <span>{toast.error ? '!' : '✓'}</span>{toast.message}<button aria-label="通知を閉じる" onClick={() => setToasts(old => old.filter(t => t.id !== toast.id))}>×</button>
    </div>)}</div>
  </>;
}
