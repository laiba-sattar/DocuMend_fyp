/**
 * UploadDocument — the import screen, reached from the dashboard's
 * "Upload / drop" quick action.
 *
 * Ported from a Replit prototype (wouter + Tailwind + shadcn) into this
 * project's stack. Three deliberate departures:
 *
 *   1. The prototype carried its own top bar, mobile nav, brand lockup and
 *      footer. All dropped for the shared workspace chrome, so this page
 *      cannot drift away from the rest of the app.
 *   2. Every class is prefixed `upload-`. The prototype used names like
 *      .page-heading, .sidebar, .notice and .primary-button, three of which
 *      already exist in other page stylesheets -- unprefixed they would have
 *      restyled Version history and the landing page.
 *   3. Its palette is re-pointed at the shared --dash-* tokens, so the page
 *      follows the workspace theme and flips to dark mode with the shell.
 *
 * Importing is real: src/editor/importers.js converts the file's text
 * (.docx, .txt, .md) on this device and it is saved as a new document
 * in IndexedDB. The original file's bytes are never stored or uploaded --
 * that is the privacy promise the dialog makes, so keep it that way.
 * The recent-imports list keeps metadata (name, type, size, date, document
 * id) in localStorage.
 */
import { useEffect, useRef, useState } from 'react';
import './upload-document.css';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  FolderOpen,
  Gauge,
  HardDrive,
  Info,
  LockKeyhole,
  Menu,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  MobileDrawer,
  MobileTopbar,
  Sidebar,
  WorkspaceHeader,
  WorkspaceModal,
} from '../components/WorkspaceChrome';
import { workspaceRoutes } from '../components/workspace-nav';
import { useTheme } from '../components/ThemeContext';
import { navigate } from '../router';
import { IMPORT_ACCEPT, IMPORT_EXTENSIONS, importFile } from '../editor/importers';
import { createDocument, getDocument, updateDocument } from '../storage/documents';

const RECENT_STORAGE_KEY = 'documend-recent-documents';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = IMPORT_EXTENSIONS;

/* ==========================================================================
   Helpers
   ========================================================================== */

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getType(name) {
  const extension = name.split('.').pop()?.toUpperCase();
  return extension === 'DOC' ? 'DOC' : extension || 'FILE';
}

function formatRelativeTime(timestamp) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `Edited ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Edited yesterday' : `Edited ${days} days ago`;
}

function readRecentDocuments() {
  try {
    const saved = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.type === 'string' &&
        typeof item.size === 'number' &&
        typeof item.importedAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeRecentDocuments(documents) {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(documents));
  } catch {
    // Private browsing fallback
  }
}

/* ==========================================================================
   Pieces
   ========================================================================== */

function FileGlyph({ type, color }) {
  return (
    <span
      className="upload-file-glyph"
      style={{ color, borderColor: `${color}66`, backgroundColor: `${color}13` }}
      aria-hidden="true"
    >
      <FileText size={19} strokeWidth={1.6} />
    </span>
  );
}

/* ==========================================================================
   Page
   ========================================================================== */

export default function UploadDocument() {
  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // Shared workspace chrome state
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [chromeModal, setChromeModal] = useState(null);

  // Import state
  const inputRef = useRef(null);
  const processTimer = useRef(null);
  const importToken = useRef(0); // bumps on cancel, so a late-finishing import is ignored
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [analysisMode, setAnalysisMode] = useState('auto');
  const [guideOpen, setGuideOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState('info');
  const [recentDocuments, setRecentDocuments] = useState(readRecentDocuments);
  const [importedDocId, setImportedDocId] = useState(null);

  useEffect(() => {
    if (!dialog) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDialog(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  useEffect(() => {
    return () => {
      if (processTimer.current) clearInterval(processTimer.current);
    };
  }, []);

  const showNotice = (message, kind = 'info') => {
    setNotice(message);
    setNoticeKind(kind);
  };

  const selectNav = (label) => {
    const route = workspaceRoutes[label];
    if (route) {
      navigate(route);
      return;
    }
    if (label === 'Dashboard') return navigate('/dashboard');
    if (label === 'Editor') return navigate('/editor');
    if (label === 'Subscription' || label === 'Pricing') return navigate('/pricing');
    if (label === 'Version history') return navigate('/version');
    if (label === 'Features') return navigate('/features');
    if (label === 'Settings') return navigate('/settings');
    if (label === 'Help and Guide') return navigate('/help');
    if (label === 'Storage') return navigate('/storage');
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    showNotice(`${label} view selected`);
    setMobileSidebar(false);
  };

  const acceptFile = (candidate) => {
    if (!candidate) return;
    if (!ACCEPTED_EXTENSIONS.test(candidate.name)) {
      showNotice('That file type is not supported. Choose a DOCX, TXT or MD file (save a PDF, .doc or .rtf as .docx first).', 'error');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      showNotice('That file is over the 20 MB limit. Choose a smaller document.', 'error');
      return;
    }
    if (processTimer.current) clearInterval(processTimer.current);
    setFile(candidate);
    setStage('idle');
    setProgress(0);
    setNotice('');
  };

  const handleBrowse = (event) => {
    acceptFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  const handleDropZoneKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const removeFile = () => {
    setFile(null);
    setStage('idle');
    setProgress(0);
    setNotice('');
  };

  // Reads the file on this device and saves its text as a new document.
  const beginImport = async () => {
    if (!file || stage === 'processing') return;
    const token = ++importToken.current;
    setStage('processing');
    setProgress(15);
    setNotice('');
    try {
      const imported = await importFile(file); // reading + converting
      if (token !== importToken.current) return;
      setProgress(70);
      const doc = await createDocument({ title: imported.title, source: 'imported' });
      await updateDocument(doc.id, { content: imported.html, wordCount: imported.wordCount, format: imported.format });
      setImportedDocId(doc.id);
      const entry = {
        id: `${Date.now()}-${file.name}`,
        docId: doc.id,
        name: file.name,
        type: getType(file.name),
        size: file.size,
        importedAt: Date.now(),
      };
      setRecentDocuments((current) => {
        const next = [entry, ...current.filter((item) => item.name !== entry.name)].slice(0, 6);
        writeRecentDocuments(next);
        return next;
      });
      setProgress(100);
      setStage('success');
      showNotice(
        `Imported ${imported.wordCount.toLocaleString()} words. The original file was not changed.`,
        'success',
      );
    } catch (error) {
      if (token !== importToken.current) return;
      setStage('idle');
      setProgress(0);
      showNotice(error.message || 'That file could not be imported.', 'error');
    }
  };

  const resetScreen = () => {
    if (processTimer.current) clearInterval(processTimer.current);
    importToken.current += 1;
    setImportedDocId(null);
    setFile(null);
    setStage('idle');
    setProgress(0);
    setNotice('');
  };

  const cancelImport = () => {
    resetScreen();
    showNotice('Import cancelled. Your local library is unchanged.');
  };

  const chooseRecent = async (entry) => {
    const doc = entry.docId ? await getDocument(entry.docId) : null;
    if (doc) {
      navigate(`/editor?doc=${doc.id}`);
      return;
    }
    setFile(null);
    setStage('idle');
    showNotice(`${entry.name} is no longer in your library. Import the file again to open it.`);
  };

  const removeRecent = (id, name) => {
    setRecentDocuments((current) => {
      const next = current.filter((document) => document.id !== id);
      writeRecentDocuments(next);
      return next;
    });
    showNotice(`${name} was removed from your local recent list.`, 'success');
  };

  const openGuide = () => {
    setGuideOpen(true);
    setDialog(null);
  };

  const isReady = Boolean(file) && stage !== 'processing';
  const dropZoneClass = [
    'upload-drop-zone',
    dragging ? 'is-dragging' : '',
    file && stage !== 'processing' ? 'has-file' : '',
    stage === 'processing' ? 'is-processing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`dash-shell ${darkMode ? 'dash-dark' : ''}`}>
      <MobileTopbar
        onMenu={() => setMobileSidebar(true)}
        onThemeToggle={toggleDarkMode}
        darkMode={darkMode}
      />

      <Sidebar
        activeNav={activeNav}
        onNavigate={selectNav}
        privacyMode={privacyMode}
        onPrivacyToggle={() => setPrivacyMode((current) => !current)}
        darkMode={darkMode}
        onThemeToggle={toggleDarkMode}
        onLogout={() => setChromeModal('logout')}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
      />

      <MobileDrawer
        open={mobileSidebar}
        onClose={() => setMobileSidebar(false)}
        activeNav={activeNav}
        onNavigate={selectNav}
        onPrivacyToggle={() => setPrivacyMode((current) => !current)}
        onLogout={() => setChromeModal('logout')}
      />

      <main className={`dash-main ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <WorkspaceHeader
          search={workspaceSearch}
          onSearchChange={setWorkspaceSearch}
          onAnnounce={showNotice}
        />

        <div className="upload-page">
          <div className="upload-grid">
            <section className="upload-main">
              <div className="upload-heading">
                <div className="upload-heading-left">
                  <button
                    type="button"
                    className="upload-back"
                    aria-label="Back to dashboard"
                    onClick={() => navigate('/dashboard')}
                  >
                    <ArrowLeft size={19} strokeWidth={1.7} />
                  </button>
                  <div>
                    <div className="upload-eyebrow">
                      <span>Workspace</span>
                      <ChevronRight size={11} />
                      <strong>Import</strong>
                    </div>
                    <h1 className="upload-title">Open a document</h1>
                  </div>
                </div>
                <button type="button" className="upload-guide-btn" onClick={openGuide}>
                  <CircleHelp size={14} /> <span>How importing works</span>
                </button>
              </div>

              {guideOpen && (
                <div className="upload-inline-guide" role="status">
                  <Info size={15} />
                  <p>
                    <strong>A quiet handoff.</strong> Choose a file and DocuMend prepares a
                    working copy in your browser. Your original stays where it is, and nothing
                    leaves this device.
                  </p>
                  <button
                    type="button"
                    className="upload-dialog-close"
                    aria-label="Close import guide"
                    onClick={() => setGuideOpen(false)}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              <div className="upload-panel">
                <div className="upload-panel-head">
                  <div>
                    <h2 className="upload-panel-title">Bring your draft into the studio</h2>
                    <p className="upload-panel-sub">
                      Your document is prepared on this device, ready for a closer read.
                    </p>
                  </div>
                  <span className="upload-local-pill">
                    <LockKeyhole size={12} /> local-first
                  </span>
                </div>

                {stage === 'success' ? (
                  <div className="upload-success">
                    <span className="upload-success-icon" aria-hidden="true">
                      <Check size={25} strokeWidth={1.5} />
                    </span>
                    <p className="upload-success-kicker">ready in your workspace</p>
                    <h2 className="upload-success-title">
                      {file?.name || 'Your document'} is ready to read.
                    </h2>
                    <p className="upload-success-copy">
                      A local working copy is open. Nothing was uploaded, and your original file
                      is unchanged.
                    </p>
                    <div className="upload-success-actions">
                      <button
                        type="button"
                        className="upload-primary"
                        onClick={() => navigate(importedDocId ? `/editor?doc=${importedDocId}` : '/editor')}
                      >
                        Open in editor <ArrowRight size={14} />
                      </button>
                      <button type="button" className="upload-secondary" onClick={resetScreen}>
                        <RotateCcw size={13} /> Import another
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={dropZoneClass}
                      role="button"
                      tabIndex={0}
                      aria-label="Drop a document here or press Enter to browse"
                      onClick={() => inputRef.current?.click()}
                      onKeyDown={handleDropZoneKeyDown}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={handleDrop}
                    >
                      <input
                        ref={inputRef}
                        className="dash-sr"
                        type="file"
                        accept={IMPORT_ACCEPT}
                        aria-label="Choose a document file"
                        onChange={handleBrowse}
                      />

                      {stage === 'processing' ? (
                        <>
                          <span className="upload-drop-icon" aria-hidden="true">
                            <Gauge size={25} strokeWidth={1.5} />
                          </span>
                          <p className="upload-drop-title">Reading locally…</p>
                          <p className="upload-drop-desc">Preparing a private working copy</p>
                          <div
                            className="upload-progress-track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                            aria-label="Import progress"
                          >
                            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
                          </div>
                        </>
                      ) : file ? (
                        <>
                          <span className="upload-drop-icon" aria-hidden="true">
                            <FileText size={25} strokeWidth={1.5} />
                          </span>
                          <p className="upload-drop-title" title={file.name}>{file.name}</p>
                          <p className="upload-drop-desc">
                            {getType(file.name)} <span aria-hidden="true">/</span>{' '}
                            {formatBytes(file.size)} <span aria-hidden="true">/</span> ready to import
                          </p>
                          <button
                            type="button"
                            className="upload-remove"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeFile();
                            }}
                          >
                            <X size={13} /> Remove file
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="upload-drop-icon" aria-hidden="true">
                            <UploadCloud size={26} strokeWidth={1.4} />
                          </span>
                          <p className="upload-drop-title">
                            {dragging ? 'Release to place your draft' : 'Drop your file here'}
                          </p>
                          <p className="upload-drop-desc">
                            or <strong>browse from this device</strong>
                          </p>
                          <div className="upload-format-list" aria-label="Accepted file types">
                            {['DOCX', 'TXT', 'MD'].map((format) => (
                              <span className="upload-format-chip" key={format}>{format}</span>
                            ))}
                          </div>
                          {/* PDF import was removed on purpose: a PDF stores
                              characters and positions, not paragraphs and
                              headings, so its structure could only ever be
                              guessed — and this editor is built on structure. */}
                          <p className="upload-format-note">
                            Have a PDF? Open it in Word and save it as .docx first — that
                            keeps the real headings, which is what DocuMend checks.
                          </p>
                        </>
                      )}
                    </div>

                    <div className="upload-callout">
                      <ShieldCheck size={16} strokeWidth={1.6} />
                      <span>
                        <strong>Private by default.</strong> Files are processed entirely on this
                        device — never sent to a server.
                      </span>
                    </div>

                    <div className="upload-analysis">
                      <div className="upload-analysis-head">
                        <span>After import</span>
                        <span>Choose how to begin</span>
                      </div>
                      <div className="upload-analysis-options" role="radiogroup" aria-label="Analysis mode">
                        <label className={`upload-option ${analysisMode === 'auto' ? 'is-selected' : ''}`}>
                          <input
                            type="radio"
                            name="analysis-mode"
                            value="auto"
                            checked={analysisMode === 'auto'}
                            onChange={() => setAnalysisMode('auto')}
                          />
                          <span className="upload-radio-dot" aria-hidden="true" />
                          <Sparkles size={13} /> Auto-detect all issues
                        </label>
                        <label className={`upload-option ${analysisMode === 'manual' ? 'is-selected' : ''}`}>
                          <input
                            type="radio"
                            name="analysis-mode"
                            value="manual"
                            checked={analysisMode === 'manual'}
                            onChange={() => setAnalysisMode('manual')}
                          />
                          <span className="upload-radio-dot" aria-hidden="true" />
                          <Menu size={13} /> Manual selection
                        </label>
                      </div>
                    </div>

                    <div className="upload-panel-foot">
                      <button type="button" className="upload-cancel" onClick={cancelImport}>
                        Cancel
                      </button>
                      <div className="upload-foot-actions">
                        <span className="upload-no-cloud">
                          <HardDrive size={13} /> No cloud copy
                        </span>
                        <button
                          type="button"
                          className="upload-primary"
                          disabled={!isReady}
                          onClick={beginImport}
                        >
                          {stage === 'processing' ? (
                            'Preparing…'
                          ) : (
                            <>
                              <UploadCloud size={14} /> Import document
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {notice && (
                <div className="upload-notice" data-kind={noticeKind} role="status">
                  <Info size={14} />
                  <span>{notice}</span>
                </div>
              )}

              <div className="upload-privacy-line">
                <LockKeyhole size={14} />
                <span>Your files remain on this device.</span>
                <span className="upload-dot" aria-hidden="true" />
                <button type="button" className="upload-text-link" onClick={() => setDialog('privacy')}>
                  Read the privacy promise
                </button>
              </div>
            </section>

            <aside className="upload-side">
              <div className="upload-recent-head">
                <div>
                  <p>Your library</p>
                  <h2 className="upload-library-title">Recent documents</h2>
                </div>
                <button
                  type="button"
                  className="upload-icon-btn"
                  aria-label="Open documents"
                  onClick={() => navigate('/documents')}
                >
                  <FolderOpen size={16} />
                </button>
              </div>

              {recentDocuments.length ? (
                <div className="upload-recent-list">
                  {recentDocuments.map((document) => (
                    <div className="upload-recent-item" key={document.id}>
                      <button
                        type="button"
                        className="upload-recent-btn"
                        onClick={() => chooseRecent(document)}
                      >
                        <FileGlyph
                          type={document.type}
                          color={document.type === 'TXT' ? '#719783' : '#c88753'}
                        />
                        <span className="upload-recent-copy">
                          <span className="upload-recent-name">{document.name}</span>
                          <span className="upload-recent-meta">
                            {document.type}
                            <span className="upload-separator" aria-hidden="true">/</span>
                            {formatRelativeTime(document.importedAt)}
                          </span>
                        </span>
                        <ChevronRight className="upload-recent-chevron" size={14} />
                      </button>
                      <button
                        type="button"
                        className="upload-recent-remove"
                        aria-label={`Remove ${document.name} from recent documents`}
                        onClick={() => removeRecent(document.id, document.name)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="upload-recent-empty">
                  Imported document names and details will appear here. Only metadata is stored
                  locally; file bytes are never persisted.
                </div>
              )}

              <button
                type="button"
                className="upload-view-all"
                onClick={() => navigate('/documents')}
              >
                View all documents <ArrowRight size={13} />
              </button>

              <div className="upload-note-wrap">
                <div className="upload-note-label">
                  <BookOpen size={15} /> <span>A note from the studio</span>
                </div>
                <p className="upload-note">
                  “The best place for a first draft is somewhere it can be honest.”
                </p>
                <p className="upload-note-by">— DocuMend, quietly local since 2024</p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {dialog && (
        <div
          className="upload-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <section
            className="upload-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
          >
            <div className="upload-dialog-head">
              <div>
                <p className="upload-dialog-kicker">
                  {dialog === 'privacy' ? 'Local by design' : 'A quiet handoff'}
                </p>
                <h2 className="upload-dialog-title" id="upload-dialog-title">
                  {dialog === 'privacy' ? 'The privacy promise' : 'How importing works'}
                </h2>
              </div>
              <button
                type="button"
                className="upload-dialog-close"
                aria-label="Close dialog"
                onClick={() => setDialog(null)}
              >
                <X size={18} />
              </button>
            </div>

            {dialog === 'privacy' ? (
              <>
                <p className="upload-dialog-copy">
                  DocuMend is a local-first editor entry point. Your document is read by this
                  browser and is never uploaded to a DocuMend server.
                </p>
                <ul className="upload-dialog-list">
                  <li><ShieldCheck size={16} /> Original files remain in their existing folder.</li>
                  <li><HardDrive size={16} /> Recent entries store names, sizes, and dates only.</li>
                  <li><LockKeyhole size={16} /> Refreshing the page does not preserve file bytes.</li>
                </ul>
              </>
            ) : (
              <>
                <p className="upload-dialog-copy">
                  Choose one document from your device or drop it into the import area. DocuMend
                  checks the format, prepares a working copy locally, and leaves the original
                  untouched.
                </p>
                <ul className="upload-dialog-list">
                  <li><Check size={16} /> DOCX, TXT and MD files up to 20 MB.</li>
                  <li><Check size={16} /> Import progress is simulated locally for this prototype.</li>
                  <li><Check size={16} /> Recent documents are metadata reminders, not saved files.</li>
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      <WorkspaceModal
        mode={chromeModal}
        initialValue=""
        onClose={() => setChromeModal(null)}
        onSubmit={() => setChromeModal(null)}
        onLogout={() => {
          setChromeModal(null);
          navigate('/login');
        }}
      />
    </div>
  );
}
