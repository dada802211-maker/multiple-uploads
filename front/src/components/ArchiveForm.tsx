import { useState, type FormEvent } from 'react';
import type { Archive, Metadata } from '../types/archive';
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
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
      await onSave(Object.fromEntries(data) as Metadata);
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
        <label>ダウンロードできる人<select name="visibility" defaultValue={item?.visibility || 'public'}>
          <option value="public">誰でもダウンロード可能</option>
          <option value="members">登録ユーザーのみ</option>
        </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>キャンセル</button>
        <button className="primary">{busy ? '処理中…' : item ? '変更を保存' : 'ZIPを登録する'}</button>
      </div>
    </fieldset>
  </form>;
}
