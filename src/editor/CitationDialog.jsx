/**
 * CitationDialog — the dialog behind the References tab's "Insert citation"
 * and "Manage sources" buttons.
 *
 * "Insert citation" opens on a standard-picker: APA, MLA or IEEE, each card
 * showing its own boilerplate (what one entry and one in-text citation look
 * like) so the choice is made with the shape of the result in view, not from
 * memory. Picking one — the document's current style is pre-marked, so
 * confirming it is also just a click — moves on to inserting or adding a
 * source; "Change standard" comes back here at any point.
 *
 * It reuses the workspace modal's classes, like FileDialog. It only collects
 * values and hands back one action; the editor decides how to apply it to the
 * document (see citations.js and Editor.jsx's handleCitationAction).
 */
import { useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { listNameFor, STYLE_OPTIONS } from './citations';

const EMPTY_SOURCE = {
  surname: '', given: '', surname2: '', given2: '',
  year: '', title: '', venue: '', volume: '', issue: '', pages: '', url: '',
};

function StandardPicker({ current, onPick }) {
  return (
    <div className="editor-citation-standards">
      {STYLE_OPTIONS.map((option) => (
        <button
          type="button"
          key={option.style}
          className={`editor-citation-standard-card ${current === option.style ? 'is-current' : ''}`}
          onClick={() => onPick(option.style)}
        >
          <span className="editor-citation-standard-head">
            <span className="editor-citation-standard-name">{option.style}</span>
            {current === option.style && <span className="editor-citation-standard-badge">Current</span>}
          </span>
          <span className="editor-citation-standard-blurb">{option.blurb}</span>
          <code className="editor-citation-standard-example">{option.entryExample}</code>
          <code className="editor-citation-standard-example">In-text: {option.inTextExample}</code>
        </button>
      ))}
    </div>
  );
}

function SourceForm({ source, onChange, submitLabel, onSubmit, onCancel, cancelLabel = 'Cancel', showPage, page, onPageChange }) {
  const set = (field) => (event) => onChange({ ...source, [field]: event.target.value });
  const canSubmit = source.surname.trim() && source.given.trim() && source.year.trim() && source.title.trim() && source.venue.trim();
  const [showSecond, setShowSecond] = useState(Boolean(source.surname2));

  return (
    <div className="editor-citation-form">
      <div className="editor-citation-form-row">
        <div>
          <label className="dash-modal-label" htmlFor="cite-surname">Surname*</label>
          <input id="cite-surname" className="dash-modal-input" value={source.surname} onChange={set('surname')} placeholder="Smith" />
        </div>
        <div>
          <label className="dash-modal-label" htmlFor="cite-given">Given name*</label>
          <input id="cite-given" className="dash-modal-input" value={source.given} onChange={set('given')} placeholder="John" />
        </div>
        <div>
          <label className="dash-modal-label" htmlFor="cite-year">Year*</label>
          <input id="cite-year" className="dash-modal-input" value={source.year} onChange={set('year')} placeholder="2020" inputMode="numeric" />
        </div>
      </div>

      {showSecond ? (
        <div className="editor-citation-form-row">
          <div>
            <label className="dash-modal-label" htmlFor="cite-surname2">Second author's surname</label>
            <input id="cite-surname2" className="dash-modal-input" value={source.surname2} onChange={set('surname2')} placeholder="Jones" />
          </div>
          <div>
            <label className="dash-modal-label" htmlFor="cite-given2">Second author's given name</label>
            <input id="cite-given2" className="dash-modal-input" value={source.given2} onChange={set('given2')} placeholder="Kim" />
          </div>
          <button type="button" className="dash-btn-quiet editor-citation-remove-author" onClick={() => { onChange({ ...source, surname2: '', given2: '' }); setShowSecond(false); }}>Remove</button>
        </div>
      ) : (
        <button type="button" className="dash-btn-quiet editor-citation-add-author" onClick={() => setShowSecond(true)}>+ Add a second author</button>
      )}

      <label className="dash-modal-label" htmlFor="cite-title">Title*</label>
      <input id="cite-title" className="dash-modal-input" value={source.title} onChange={set('title')} placeholder="A study of things" />

      <label className="dash-modal-label" htmlFor="cite-venue">Journal or publisher*</label>
      <input id="cite-venue" className="dash-modal-input" value={source.venue} onChange={set('venue')} placeholder="Journal of Stuff" />

      <div className="editor-citation-form-row">
        <div>
          <label className="dash-modal-label" htmlFor="cite-volume">Volume</label>
          <input id="cite-volume" className="dash-modal-input" value={source.volume} onChange={set('volume')} placeholder="3" />
        </div>
        <div>
          <label className="dash-modal-label" htmlFor="cite-issue">Issue</label>
          <input id="cite-issue" className="dash-modal-input" value={source.issue} onChange={set('issue')} placeholder="2" />
        </div>
        <div>
          <label className="dash-modal-label" htmlFor="cite-pages">Pages</label>
          <input id="cite-pages" className="dash-modal-input" value={source.pages} onChange={set('pages')} placeholder="10-20" />
        </div>
      </div>

      <label className="dash-modal-label" htmlFor="cite-url">Link or DOI (if it has no volume and pages)</label>
      <input id="cite-url" className="dash-modal-input" value={source.url} onChange={set('url')} placeholder="https://…" />

      {showPage && (
        <>
          <label className="dash-modal-label" htmlFor="cite-add-page">Page for this citation (optional)</label>
          <input id="cite-add-page" className="dash-modal-input" value={page} onChange={(event) => onPageChange(event.target.value)} placeholder="12" />
        </>
      )}

      <div className="dash-modal-actions">
        <button type="button" onClick={onCancel} className="dash-btn-quiet">{cancelLabel}</button>
        <button type="button" onClick={onSubmit} className="dash-btn-primary" disabled={!canSubmit}>{submitLabel}</button>
      </div>
    </div>
  );
}

function EntryRow({ entry, showPage, onInsert, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [page, setPage] = useState('');

  if (editing) {
    return (
      <div className="editor-citation-entry is-editing">
        <textarea className="dash-modal-input editor-citation-edit-text" value={text} onChange={(event) => setText(event.target.value)} rows={3} />
        <div className="editor-citation-entry-actions">
          <button type="button" className="dash-btn-quiet" onClick={() => { setEditing(false); setText(entry.text); }}>Cancel</button>
          <button type="button" className="dash-btn-primary" onClick={() => { onEdit(text.trim()); setEditing(false); }} disabled={!text.trim()}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-citation-entry">
      <p className="editor-citation-entry-text">{entry.text}</p>
      <div className="editor-citation-entry-actions">
        {showPage && (
          <input
            className="dash-modal-input editor-citation-page-input"
            value={page}
            onChange={(event) => setPage(event.target.value)}
            placeholder="Page"
            aria-label={`Page number for ${entry.surname || 'this source'}`}
          />
        )}
        <button type="button" className="dash-btn-primary" onClick={() => onInsert(page.trim())}>Insert</button>
        <button type="button" className="dash-btn-icon" onClick={() => setEditing(true)} aria-label="Edit this source"><Pencil size={14} /></button>
        <button type="button" className="dash-btn-icon is-danger" onClick={onDelete} aria-label="Remove this source"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function CitationDialog({ mode, style, region, onClose, onAction }) {
  // "Insert citation" always starts by asking which standard to use — the
  // document's current one (if any) is pre-marked, so keeping it is one
  // click too. "Manage sources" is about the entries already there, so it
  // skips straight to them.
  const [step, setStep] = useState(mode === 'insert' ? 'standard' : 'content');
  const [pickedStyle, setPickedStyle] = useState(style || '');
  // "Insert citation" is here to write a citation, so the fields for one (title,
  // page, and the rest) are on screen from the start, alongside anything already
  // in the list — not hidden behind a second click. "Manage sources" is about
  // what is already there, so its form stays out of the way until asked for.
  const [adding, setAdding] = useState(mode === 'insert' || !region || region.entries.length === 0);
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [addPage, setAddPage] = useState('');

  const title = mode === 'manage' ? 'Manage sources' : 'Insert citation';
  const showPage = pickedStyle === 'MLA';
  const listName = listNameFor(pickedStyle || 'APA');
  const boilerplate = STYLE_OPTIONS.find((option) => option.style === pickedStyle);

  // Every action carries the style the dialog is using, so the editor can
  // both format with it and, when it differs, save it as the document's own.
  const act = (action) => onAction({ ...action, style: pickedStyle });

  return (
    <div className="dash-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="dash-modal editor-citation-dialog" role="dialog" aria-modal="true" aria-labelledby="citation-dialog-title">
        <div className="dash-modal-head">
          <div>
            <p className="dash-modal-kicker">References</p>
            <h2 id="citation-dialog-title" className="dash-modal-title dash-serif">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="dash-modal-close" aria-label="Close dialog"><X size={17} /></button>
        </div>

        {step === 'standard' ? (
          <>
            <p className="dash-modal-text">Which citation standard is this document using? Pick one to see how it should look.</p>
            <StandardPicker current={pickedStyle} onPick={(chosen) => { setPickedStyle(chosen); setStep('content'); }} />
          </>
        ) : (
          <>
            {mode === 'insert' && boilerplate && (
              <div className="editor-citation-boilerplate">
                <div className="editor-citation-boilerplate-head">
                  <span>{pickedStyle} boilerplate</span>
                  <button type="button" className="dash-btn-quiet" onClick={() => setStep('standard')}>Change standard</button>
                </div>
                <code className="editor-citation-boilerplate-line">{boilerplate.entryExample}</code>
                <code className="editor-citation-boilerplate-line">In-text: {boilerplate.inTextExample}</code>
              </div>
            )}

            <p className="dash-modal-text">
              {pickedStyle
                ? `Formatted for ${pickedStyle}. Reference entries are added under a "${listName}" heading.`
                : 'No citation style chosen for this document — using a general (Author, Year) format. Choose APA, MLA or IEEE in the review panel for detailed checking.'}
            </p>

            {region && region.entries.length > 0 && (
              <div className="editor-citation-list">
                {region.entries.map((entry) => (
                  <EntryRow
                    key={entry.from}
                    entry={entry}
                    showPage={showPage}
                    onInsert={(page) => act({ type: 'insertExisting', entry, page })}
                    onEdit={(text) => act({ type: 'editEntry', entry, text })}
                    onDelete={() => { if (window.confirm('Remove this source from the reference list?')) act({ type: 'deleteEntry', entry }); }}
                  />
                ))}
              </div>
            )}

            {!region && (
              <p className="dash-modal-text editor-citation-empty-note">
                {`No reference list yet — adding a source below will start one, headed "${listName}".`}
              </p>
            )}

            {adding ? (
              <>
                {mode === 'insert' && region && region.entries.length > 0 && (
                  <p className="editor-citation-form-label">Or add a new source:</p>
                )}
                <SourceForm
                  source={source}
                  onChange={setSource}
                  submitLabel="Add source and insert citation"
                  cancelLabel={mode === 'insert' ? 'Clear' : 'Cancel'}
                  onCancel={mode === 'insert' ? () => setSource(EMPTY_SOURCE) : () => setAdding(false)}
                  onSubmit={() => act({ type: 'addNew', source, page: addPage.trim() })}
                  showPage={showPage}
                  page={addPage}
                  onPageChange={setAddPage}
                />
              </>
            ) : (
              <button type="button" className="dash-btn-quiet editor-citation-add-source" onClick={() => setAdding(true)}>+ Add a new source</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default CitationDialog;
