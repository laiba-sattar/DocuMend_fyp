/**
 * FileDialog — the small dialogs behind the editor's File menu.
 *
 * One component, five kinds: rename, saveAs, move, version, details. It reuses
 * the workspace modal's classes so it looks like every other dialog in the app.
 * It only collects values; the editor decides what to do with them.
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DOCUMENT_TYPES } from '../storage/documents';
import { formatModified, pageLabel, pagesFor } from '../storage/format';
import { formatBytes } from '../storage/quota';
import { listVersions } from '../storage/versions';

const COPY = {
  rename: { title: 'Rename document', action: 'Save name' },
  saveAs: { title: 'Save as', action: 'Save a copy' },
  move: { title: 'Move to folder', action: 'Move' },
  version: { title: 'Save a version', action: 'Save version' },
  details: { title: 'Document details', action: '' },
};

function Details({ doc, folderName }) {
  const [versionCount, setVersionCount] = useState(null);

  useEffect(() => {
    let alive = true;
    listVersions(doc.id).then((list) => { if (alive) setVersionCount(list.length); });
    return () => { alive = false; };
  }, [doc.id]);

  const rows = [
    ['Name', doc.title],
    ['Type', doc.type ?? 'Other'],
    ['Format', doc.format ?? 'DOCX'],
    ['Folder', folderName],
    ['Words', String(doc.wordCount ?? 0)],
    ['Pages', pageLabel(pagesFor(doc.wordCount))],
    ['Size on this device', formatBytes((doc.content?.length ?? 0) * 2)],
    ['Created', new Date(doc.createdAt).toLocaleString()],
    ['Last edited', formatModified(doc.updatedAt)],
    ['Saved versions', versionCount === null ? '…' : String(versionCount)],
    ['Status', doc.status === 'done' ? 'Done' : 'Draft'],
  ];

  return (
    <dl className="editor-details">
      {rows.map(([label, value]) => (
        <div key={label} className="editor-details-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FileDialog({ kind, doc, folders, onClose, onSubmit }) {
  const known = folders.some((folder) => folder.id === doc.folderId);
  const [name, setName] = useState(kind === 'saveAs' ? `${doc.title} (copy)` : doc.title);
  const [type, setType] = useState(doc.type ?? 'Other');
  const [folderId, setFolderId] = useState(known ? doc.folderId : 'root');
  const [label, setLabel] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = COPY[kind];
  const needsName = kind === 'rename' || kind === 'saveAs';
  const canSubmit = !needsName || name.trim().length > 0;
  const folderName = folders.find((folder) => folder.id === doc.folderId)?.name ?? 'Root level';

  const submit = (event) => {
    event.preventDefault();
    if (canSubmit) onSubmit({ name: name.trim(), type, folderId, label: label.trim() });
  };

  return (
    <div
      className="dash-modal-backdrop"
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}
    >
      <div className="dash-modal" role="dialog" aria-modal="true" aria-labelledby="file-dialog-title">
        <div className="dash-modal-head">
          <div>
            <p className="dash-modal-kicker">File</p>
            <h2 id="file-dialog-title" className="dash-modal-title dash-serif">{copy.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="dash-modal-close" aria-label="Close dialog"><X size={17} /></button>
        </div>

        {kind === 'details' ? (
          <>
            <Details doc={doc} folderName={folderName} />
            <div className="dash-modal-actions">
              <button type="button" onClick={onClose} className="dash-btn-primary">Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            {needsName && (
              <>
                <label className="dash-modal-label" htmlFor="file-dialog-name">Document name</label>
                <input
                  id="file-dialog-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="dash-modal-input"
                />
              </>
            )}

            {kind === 'saveAs' && (
              <>
                <label className="dash-modal-label" htmlFor="file-dialog-type">Type</label>
                <select
                  id="file-dialog-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className="dash-modal-input"
                >
                  {DOCUMENT_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </>
            )}

            {(kind === 'saveAs' || kind === 'move') && (
              <>
                <label className="dash-modal-label" htmlFor="file-dialog-folder">Folder</label>
                <select
                  id="file-dialog-folder"
                  autoFocus={kind === 'move'}
                  value={folderId}
                  onChange={(event) => setFolderId(event.target.value)}
                  className="dash-modal-input"
                >
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
              </>
            )}

            {kind === 'version' && (
              <>
                <label className="dash-modal-label" htmlFor="file-dialog-label">Name for this version (optional)</label>
                <input
                  id="file-dialog-label"
                  autoFocus
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. Before supervisor review"
                  className="dash-modal-input"
                />
                <p className="dash-modal-text">Saved versions are kept until you delete them. They are never removed to make room for automatic ones.</p>
              </>
            )}

            <div className="dash-modal-actions">
              <button type="button" onClick={onClose} className="dash-btn-quiet">Cancel</button>
              <button type="submit" className="dash-btn-primary" disabled={!canSubmit}>{copy.action}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default FileDialog;
