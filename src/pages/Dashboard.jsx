/**
 * Dashboard — the signed-in workspace home, served at the `/dashboard` route.
 *
 * Integrated with the shared ThemeContext and direct quick-action navigations.
 */
import { useEffect, useMemo, useState } from 'react';
import './dashboard.css';
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Cloud,
  CloudOff,
  FileText,
  FolderPlus,
  Lightbulb,
  ListFilter,
  LockKeyhole,
  UnlockKeyhole,
  Pencil,
  Plus,
  Upload,
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
import { useAuth } from '../components/AuthContext';
import { navigate } from '../router';
import { usePreference } from '../settings/preferences';
import { useLiveQuery } from 'dexie-react-hooks';
import { createDocument, listDocuments, updateDocument } from '../storage/documents';
import { pendingCount } from '../sync/metadata';
import { formatModified, pageLabel, pagesFor } from '../storage/format';
import { importFile } from '../editor/importers';
import { formatBytes, formatPercent, getStorageReport } from '../storage/quota';

/* ==========================================================================
   Content data
   ========================================================================== */

/**
 * Which of the three columns a document belongs in.
 *
 *   Done         the writer marked it finished
 *   In progress  it has words in it
 *   Not started  it was created and never written in
 *
 * "Not started" replaced a column called Backlog, which counted nothing: a
 * document either has words or it does not, and a page you have not begun is
 * the one worth being reminded of.
 */
function stageOf(doc) {
  if (doc.status === 'done') return 'Done';
  return (doc.wordCount ?? 0) > 0 ? 'In progress' : 'Not started';
}

/** Shapes a stored document record into what DocumentRow draws. */
function toRow(doc) {
  const edited = formatModified(doc.updatedAt);
  return {
    id: doc.id,
    title: doc.title,
    type: doc.format ?? 'DOCX',
    edited: edited.charAt(0).toUpperCase() + edited.slice(1),
    pages: pagesFor(doc.wordCount),
    status: stageOf(doc),
    words: doc.wordCount ?? 0,
    color: doc.tint ?? 'gold',
  };
}

/** "Tuesday, 15 September 2026" — today, in the reader's own language. */
function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** What the Filter button steps through, in order. */
const STAGES = ['All', 'In progress', 'Done', 'Not started'];

/* ==========================================================================
   Pieces
   ========================================================================== */

function QuickAction({ icon: Icon, title, description, tone, onClick, onDrop }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      className={`dash-quick dash-quick-${tone}`}
    >
      <span className="dash-quick-icon"><Icon size={17} strokeWidth={1.8} /></span>
      <span>
        <span className="dash-quick-title">{title}</span>
        <span className="dash-quick-desc">{description}</span>
      </span>
      <span className="dash-quick-go"><ArrowUpRight size={13} /></span>
    </button>
  );
}

/**
 * The completion ring — counted from the reader's own documents.
 *
 * It used to say 71% over eight finished projects no matter what was on the
 * screen, which is worse than saying nothing: a dashboard that invents numbers
 * teaches you to stop reading it. Now the ring is finished ÷ total and the
 * three counts are real; the line under it says what an empty one means.
 */
function ProjectSummary({ documents }) {
  const total = documents.length;
  const done = documents.filter((doc) => doc.status === 'Done').length;
  const inProgress = documents.filter((doc) => doc.status === 'In progress').length;
  const notStarted = total - done - inProgress;

  const percent = total ? Math.round((done / total) * 100) : 0;
  const CIRCUMFERENCE = 295; // 2πr for r = 47
  const words = documents.reduce((sum, doc) => sum + doc.words, 0);

  const pad = (value) => String(value).padStart(2, '0');

  return (
    <section className="dash-summary">
      <div className="dash-summary-head">
        <div>
          <p className="dash-eyebrow">Your work</p>
          <h2 className="dash-card-title dash-serif">Documents finished</h2>
        </div>
        {/* A "filter project summary" button used to sit here with nothing
            behind it. A summary of everything has nothing to filter. */}
      </div>

      <div className="dash-summary-body">
        <div className="dash-ring">
          <svg viewBox="0 0 128 128" role="img" aria-label={`${percent} per cent of your documents are marked done`}>
            <circle className="dash-ring-track" cx="64" cy="64" r="47" fill="none" strokeWidth="12" />
            <circle
              className="dash-ring-fill"
              cx="64" cy="64" r="47" fill="none" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE - (CIRCUMFERENCE * percent) / 100}
            />
          </svg>
          <div className="dash-ring-centre">
            <span className="dash-ring-value dash-serif">{percent}%</span>
            {/* One short word. "no documents" was two words too many for a
                circle this size — the line under the ring already says what
                an empty dashboard means. */}
            <span className="dash-ring-label">done</span>
          </div>
        </div>

        <div className="dash-legend">
          <div className="dash-legend-row"><span className="dash-swatch dash-swatch-done" />Finished<strong>{pad(done)}</strong></div>
          <div className="dash-legend-row"><span className="dash-swatch dash-swatch-progress" />In progress<strong>{pad(inProgress)}</strong></div>
          <div className="dash-legend-row"><span className="dash-swatch dash-swatch-backlog" />Not started<strong>{pad(notStarted)}</strong></div>
        </div>
      </div>

      <p className="dash-summary-foot">
        <Lightbulb size={13} />
        {total === 0
          ? 'Create a document and this fills in on its own.'
          : `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} across ${total} ${total === 1 ? 'document' : 'documents'}`}
      </p>
    </section>
  );
}

function DocumentRow({ doc, selected, onSelect, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); } }}
      className={`dash-row ${selected ? 'is-selected' : ''}`}
    >
      <div className="dash-row-main">
        <span className={`dash-glyph dash-glyph-${doc.color}`}><FileText size={17} strokeWidth={2} /></span>
        <div style={{ minWidth: 0 }}>
          <p className="dash-row-title">{doc.title}</p>
          <p className="dash-row-meta">Edited {doc.edited} · {pageLabel(doc.pages)}</p>
        </div>
      </div>
      {/* The "In progress" / "Not started" pill used to sit here. It repeated
          what the line already shows and crowded every row; the ring above
          still counts the same three stages in one place. */}
      <div className="dash-row-side">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
          className="dash-row-open"
          aria-label={`Open ${doc.title}`}
        >
          <ArrowUpRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */
function Dashboard() {
  const { darkMode, toggleDarkMode } = useTheme();
  const { firstName, isSignedIn } = useAuth(); // the real name from the account (S5)
  // How many documents are still waiting to be described to the server.
  const pending = useLiveQuery(pendingCount, [], 0);

  // Workspace Chrome shell states
  const [activeNav, setActiveNav] = useState('Dashboard');
  // Kept in the browser's settings store, so the choice survives a reload
  // and is the same on every page.
  const [privacyMode, setPrivacyMode] = usePreference('privacyMode');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  // Live list from IndexedDB, newest first.
  const storedDocuments = useLiveQuery(listDocuments, []);
  const loading = storedDocuments === undefined;
  const documents = useMemo(() => (storedDocuments ?? []).map(toRow), [storedDocuments]);
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null);
  const [draftValue] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [stageFilter, setStageFilter] = useState('All');
  const [storageReport, setStorageReport] = useState(null);

  // Real browser storage use for the Storage tile; re-measured when the document list changes.
  useEffect(() => {
    let cancelled = false;
    getStorageReport()
      .then((report) => { if (!cancelled) setStorageReport(report); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [storedDocuments]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredDocuments = useMemo(() => {
    // Searching lives on My documents now. Here the only narrowing is the
    // Filter button's stage.
    const matching = stageFilter === 'All'
      ? documents
      : documents.filter((doc) => doc.status === stageFilter);
    return showAll ? matching : matching.slice(0, 4);
  }, [documents, showAll, stageFilter]);

  const announce = (message) => setToast(message);

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Dashboard') {
      navigate(route);
      return;
    }
    
    if (label === 'Editor') return navigate('/editor');
    if (label === 'Subscription' || label === 'Pricing') return navigate('/pricing');
    if (label === 'Version history') return navigate('/version');
    if (label === 'Features') return navigate('/features');
    if (label === 'Settings') return navigate('/settings');
    if (label === 'Help and Guide') return navigate('/help');
    if (label === 'Storage') return navigate('/storage');
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    if (label !== 'Dashboard') announce(`${label} view selected`);
    setMobileSidebar(false);
  };

  // 1. Create document -> navigates to /create-document
  const openNewDocument = () => {
    navigate('/CreateDocument');
  };

  // 2. Create folder -> navigates to /create-folder
  const openNewFolder = () => {
    navigate('/CreateFolder');
  };

  // With an id: open that document. Without one: the "pick a document" screen.
  const openEditDocument = (id) => {
    if (id) {
      navigate(`/editor?doc=${id}`);
      return;
    }
    navigate('/Edit');
  };

  const submitModal = async (value) => {
    const title = value.trim();
    if (!title) return;
    try {
      const doc = await createDocument({ title });
      setModal(null);
      navigate(`/editor?doc=${doc.id}`);
    } catch (error) {
      console.error(error);
      // A plan limit is a decision, not a failure — say which one it was.
      announce(error?.code === 'plan_limit'
          ? error.message
          : 'The document could not be saved. Check that your browser allows site storage, then try again.');
    }
  };

  /** A file dropped on "Upload / drop" becomes a new document (.docx, .txt, .md). */
  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;
    announce(`Reading ${file.name}…`);
    try {
      const imported = await importFile(file);
      const doc = await createDocument({ title: imported.title, source: 'imported' });
      await updateDocument(doc.id, { content: imported.html, wordCount: imported.wordCount, format: imported.format });
      navigate(`/editor?doc=${doc.id}`);
    } catch (error) {
      announce(error.message || 'That file could not be imported.');
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const handleLogout = () => {
    setModal(null);
    navigate('/');
  };

  return (
    <div className={`dash-shell ${darkMode ? 'dash-dark' : ''} ${privacyMode ? 'dash-private' : ''}`}>
      <MobileTopbar
        onMenu={() => setMobileSidebar(true)}
        onThemeToggle={toggleDarkMode}
        darkMode={darkMode}
      />

      <Sidebar
        activeNav={activeNav}
        onNavigate={selectNav}
        privacyMode={privacyMode}
        onPrivacyToggle={() => {
          setPrivacyMode(!privacyMode);
          announce(privacyMode ? 'Titles are visible again' : 'Titles are hidden until you point at them');
        }}
        darkMode={darkMode}
        onThemeToggle={toggleDarkMode}
        onLogout={() => setModal('logout')}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <MobileDrawer
        open={mobileSidebar}
        onClose={() => setMobileSidebar(false)}
        activeNav={activeNav}
        onNavigate={selectNav}
        onPrivacyToggle={() => setPrivacyMode(!privacyMode)}
        onLogout={() => setModal('logout')}
      />

      <main className={`dash-main ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <WorkspaceHeader onAnnounce={announce} />

        <div className="dash-body">
          {/* Greeting */}
          <div className="dash-greeting dash-rise dash-d1">
            <div>
              <p className="dash-date">{todayLabel()}</p>
              <h1 className="dash-title dash-serif">Hello, {firstName || 'there'}<em>.</em></h1>
              <p className="dash-subtitle">Welcome back. Your ideas are safe here, ready when you are.</p>
            </div>
            {/* Privacy mode used to be a word with nothing behind it. It now
                blurs the titles in the list, for reading in a library or on a
                train; moving the pointer over a line shows that one. */}
            <button
              type="button"
              className="dash-privacy-pill"
              onClick={() => setPrivacyMode(!privacyMode)}
              aria-pressed={privacyMode}
              title={privacyMode ? 'Show document titles' : 'Hide document titles from anyone looking over your shoulder'}
            >
              {privacyMode
                ? <LockKeyhole size={13} className="dash-privacy-on" />
                : <UnlockKeyhole size={13} className="dash-privacy-off" />}
              {privacyMode ? 'Titles hidden' : 'Titles visible'}
            </button>
          </div>

          {/* Quick actions + completion donut */}
          <div className="dash-grid-top">
            <section className="dash-desk dash-rise dash-d2">
              <div className="dash-desk-head">
                <div>
                  <p className="dash-eyebrow">Your desk</p>
                  <h2 className="dash-card-title dash-serif">Make something good.</h2>
                </div>
                {/* "More quick actions" is gone: all four are already here. */}
              </div>

              <div className="dash-quick-row">
                <QuickAction icon={Plus} title="Create document" description="Begin with a blank page" tone="gold" onClick={openNewDocument} />
                {/* Clicking opens the import screen, which validates the file and
                    explains what is stored. Dropping straight on the tile stays
                    the fast path and is handled here. */}
                <QuickAction icon={Upload} title="Upload / drop" description="Bring in a document" tone="green" onClick={() => navigate('/upload')} onDrop={handleDrop} />
                <QuickAction icon={FolderPlus} title="Create folder" description="Keep thoughts together" tone="plum" onClick={openNewFolder} />
                <QuickAction icon={Pencil} title="Edit document" description="Continue where you left" tone="coral" onClick={() => openEditDocument()} />
              </div>

              {/* Both halves used to be invented ("Synced just now", "2.4 GB
                  of 10 GB"). They now say what is actually true of this
                  browser and this account. */}
              <div className="dash-desk-foot">
                <span>
                  {isSignedIn ? <Cloud size={14} /> : <CloudOff size={14} />}
                  {' '}
                  {!isSignedIn
                    ? 'Saved on this device'
                    : pending > 0
                      ? 'Updating your list…'
                      : 'List saved to your account'}
                </span>
                <span>
                  {storageReport?.quota
                    ? `${formatBytes(storageReport.usage)} of ${formatBytes(storageReport.quota)} used`
                    : 'Measuring storage…'}
                </span>
              </div>
            </section>

            <div className="dash-rise dash-d3"><ProjectSummary documents={documents} /></div>
          </div>

          {/* Recent uploads */}
          <section className="dash-card dash-uploads dash-rise dash-d4">
            <div className="dash-uploads-head">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 className="dash-card-title dash-serif">Recent uploads</h2>
                  <span className="dash-count">{documents.length}</span>
                </div>
                <p className="dash-uploads-sub">The pages you touched most recently.</p>
              </div>
              <div className="dash-uploads-tools">
                {/* This button used to answer "filters are available from
                    search", which was a polite way of doing nothing. It now
                    steps through the three stages. */}
                <button
                  type="button"
                  onClick={() => setStageFilter((current) => STAGES[(STAGES.indexOf(current) + 1) % STAGES.length])}
                  className={`dash-tool-btn ${stageFilter !== 'All' ? 'dash-tool-accent' : ''}`}
                >
                  <ListFilter size={14} /> {stageFilter === 'All' ? 'Filter' : stageFilter}
                </button>
                <button type="button" onClick={() => setShowAll((current) => !current)} className="dash-tool-btn dash-tool-accent">
                  {showAll ? 'Show less' : 'View all'}
                  <ChevronRight size={14} className={`dash-chevron ${showAll ? 'is-open' : ''}`} />
                </button>
              </div>
            </div>

            {loading ? null : documents.length === 0 ? (
              <div className="dash-empty">
                <FileText size={22} />
                <p>No documents yet. Create one, or drop a Word, text or Markdown file on "Upload / drop".</p>
                <button type="button" onClick={openNewDocument}>Create a document</button>
              </div>
            ) : filteredDocuments.length > 0 ? (
              <div className="dash-rows">
                {filteredDocuments.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    selected={selectedId === doc.id}
                    onSelect={() => setSelectedId(doc.id)}
                    onOpen={() => openEditDocument(doc.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <ListFilter size={22} />
                <p>Nothing is marked &quot;{stageFilter}&quot; yet</p>
                <button type="button" onClick={() => setStageFilter('All')}>
                  Show everything
                </button>
              </div>
            )}
          </section>

          {/* Writing nudge + storage */}
          <section className="dash-grid-bottom">
            <div className="dash-note dash-lift">
              <div className="dash-note-head">
                <div>
                  <p className="dash-eyebrow">A small nudge</p>
                  <h2 className="dash-card-title dash-serif">Leave room for the rough draft.</h2>
                </div>
                <BookOpen size={20} />
              </div>
              <p>Good writing rarely arrives polished. Give today&apos;s thought a place to land, then let tomorrow help you shape it.</p>
              <button type="button" onClick={openNewDocument} className="dash-link-btn">
                Open a blank page <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="dash-storage dash-lift">
              <div className="dash-storage-head">
                <p className="dash-eyebrow">Storage</p>
                <CloudOff size={17} />
              </div>
              <div className="dash-storage-figures">
                <span className="dash-storage-value dash-serif">{formatPercent(storageReport?.percent ?? 0).replace('%', '')}<span>%</span></span>
                <span className="dash-storage-used">
                  {storageReport?.quota ? `${formatBytes(storageReport.usage)} / ${formatBytes(storageReport.quota)}` : 'Measuring…'}
                </span>
              </div>
              <div className="dash-meter"><span style={{ width: `${Math.min(100, storageReport?.percent ?? 0)}%` }} /></div>
              {storageReport?.nearlyFull && <p className="dash-storage-warn">Almost full. Clear old versions on the Storage page.</p>}
              <button type="button" onClick={() => selectNav('Storage')} className="dash-link-btn">
                Manage storage <ChevronRight size={13} />
              </button>
            </div>
          </section>
        </div>
      </main>

      <WorkspaceModal
        key={`${modal}-${draftValue}`}
        mode={modal}
        initialValue={draftValue}
        onClose={() => setModal(null)}
        onSubmit={submitModal}
        onLogout={handleLogout}
      />

      {toast && <div className="dash-toast" role="status">{toast}</div>}
    </div>
  );
}

export default Dashboard;