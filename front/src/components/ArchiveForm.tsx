import { useEffect, useState, type FormEvent } from 'react';
import type { Archive, Metadata, User } from '../types/archive';
import { api } from '../api/client';
type Props = {
  item: Archive | null;
  busy: boolean;
  onSave: (data: FormData | Metadata) => Promise<void>;
  onCancel: () => void;
  notify: (message: string, error?: boolean) => void;
};
export default function ArchiveForm({ item, busy, onSave, onCancel, notify }: Props) {
  const [mode, setMode] = useState('files');
  const [files, setFiles] = useState<File[]>([]);
  const [visibility, setVisibility] = useState(item?.visibility || 'public');
  const [selected, setSelected] = useState<number[]>(item?.allowed_user_ids || []);
  const [users, setUsers] = useState<Pick<User, 'id' | 'name'>[]>([]);
  const [usersState, setUsersState] = useState('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api('users').then(result => { if (active) { setUsers(result.users); setUsersState('ready'); } })
      .catch(() => { if (active) setUsersState('error'); });
    return () => { active = false; };
  }, [retry]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ids = visibility === 'selected' ? selected : [];
    if (visibility === 'selected' && (usersState !== 'ready' || !ids.length)) {
      notify('ダウンロードを許可するユーザーを1人以上選択してください。', true);
      return;
    }
    ids.forEach(id => data.append('allowed_user_ids[]', String(id)));
    if (!item) {
      if (!files.length || files.length > 20 || files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
        notify('1〜20個、合計100MB以内のファイルを選択してください。', true);
        return;
      }
      data.delete('files');
      files.forEach(file => data.append('files[]', file));
      data.set('mode', mode);
      await onSave(data);
    }
    else {
      await onSave({ title: String(data.get('title')), description: String(data.get('description')), download_name: String(data.get('download_name')), visibility, allowed_user_ids: ids });
    }
  }
  return <form onSubmit={submit} className="editor">
    <div className="section-heading">
      <div>
        <span className="eyebrow">{item ? 'EDIT ARCHIVE' : 'NEW ARCHIVE'}</span>
        <h2>{item ? '登録情報を編集' : 'ファイルをまとめて共有'}</h2>
      </div>
      <button type="button" className="text-button" onClick={onCancel} disabled={busy}>閉じる ×</button>
    </div>
    <fieldset disabled={busy}>
      {!item && <>
        <div className="segmented">
          <button type="button" className={mode === 'files' ? 'selected' : ''} onClick={() => { setMode('files'); setFiles([]); }}>複数ファイルをZIPにする</button>
          <button type="button" className={mode === 'zip' ? 'selected' : ''} onClick={() => { setMode('zip'); setFiles([]); }}>ZIPをアップロード</button>
        </div>
        <label className="dropzone">
          <span className="upload-symbol">↑</span>
          <strong>{mode === 'zip' ? 'ZIPファイルを選択' : 'ファイルを選択'}</strong>
          <span>合計100MBまで · 最大20ファイル</span>
          <input key={mode} type="file" name="files" required multiple={mode === 'files'} accept={mode === 'zip' ? '.zip' : undefined} onChange={e => setFiles(Array.from(e.target.files || []))} />
        </label>
        {files.length > 0 && <p className="file-summary">{files.length}個選択：{files.map(f => f.name).join('、')}</p>}</>}
      {item && <p className="hint">ZIP本体と登録ユーザーは変更できません。</p>}
      <label>タイトル<input name="title" required maxLength={120} defaultValue={item?.title} placeholder="例：プロジェクト資料一式" />
      </label>
      <label>説明<textarea name="description" maxLength={5000} rows={3} defaultValue={item?.description} placeholder="ファイルの内容や使い方を記載してください" />
      </label>
      <div className="form-grid">
        <label>ダウンロード時のファイル名<input name="download_name" required maxLength={150} defaultValue={item?.download_name} placeholder="project-files.zip" />
          <small>.zip は自動で補完されます</small>
        </label>
        <label>ダウンロードできる人<select name="visibility" value={visibility} onChange={e => setVisibility(e.target.value as Archive['visibility'])}>
          <option value="public">誰でもダウンロード可能</option>
          <option value="members">登録ユーザーのみ</option>
          <option value="selected">選択したユーザーのみ</option>
        </select>
        </label>
      </div>
      {visibility === 'selected' && <fieldset className="user-permissions">
        <legend>ダウンロードを許可するユーザー</legend>
        <p className="hint">複数人を選択できます。登録者本人もダウンロードできます。</p>
        {usersState === 'loading' ? <p role="status">ユーザーを読み込んでいます…</p> : usersState === 'error' ? <p role="alert">ユーザーを読み込めませんでした。<button type="button" className="secondary" onClick={() => { setUsersState('loading'); setRetry(value => value + 1); }}>再試行</button></p> : users.length === 0 ? <p>選択できる他のユーザーがいません。</p> : <div className="user-options">{users.map(account => <label key={account.id} className="user-option">
          <input type="checkbox" checked={selected.includes(account.id)} onChange={e => setSelected(old => e.target.checked ? [...old, account.id] : old.filter(id => id !== account.id))} />
          <span>{account.name} <small>ユーザーID: {account.id}</small></span>
        </label>)}</div>}
      </fieldset>}
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>キャンセル</button>
        <button className="primary" disabled={visibility === 'selected' && (usersState !== 'ready' || !selected.length)}>{busy ? '処理中…' : item ? '変更を保存' : 'ZIPを登録する'}</button>
      </div>
    </fieldset>
  </form>;
}
