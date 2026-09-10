import { useState, type FormEvent } from 'react';
type Props = {
  busy: boolean;
  onSubmit: (mode: string, data: object) => Promise<void>;
  onClose: () => void;
};
export default function AuthForm({ busy, onSubmit, onClose }: Props) {
  const [mode, setMode] = useState('login');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(mode, Object.fromEntries(new FormData(event.currentTarget))); }
  return <div className="modal-backdrop">
    <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="close-button" aria-label="閉じる" onClick={onClose} disabled={busy}>×</button>
      <span className="eyebrow">WELCOME TO ZIPSHARE</span>
      <h2 id="auth-title">{mode === 'login' ? 'おかえりなさい' : 'アカウントを作成'}</h2>
      <p className="hint">資料をひとつに。共有をシンプルに。</p>
      <form key={mode} onSubmit={submit}>
        <fieldset disabled={busy}>
          {mode === 'register' && <label>表示名<input name="name" required maxLength={60} autoComplete="nickname" autoFocus />
          </label>}
          <label>メールアドレス<input name="email" type="email" required maxLength={254} autoComplete="email" autoFocus={mode === 'login'} />
          </label>
          <label>パスワード<input name="password" type="password" required minLength={10} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <small>10〜72バイト（日本語などは1文字あたり複数バイト）</small>
          </label>
          <button className="primary full-width">{busy ? '処理中…' : mode === 'login' ? 'ログイン' : 'ユーザー登録'}</button>
          <button type="button" className="text-button full-width" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'はじめての方はこちら → ユーザー登録' : 'アカウントをお持ちの方 → ログイン'}</button>
        </fieldset>
      </form>
    </section>
  </div>;
}
