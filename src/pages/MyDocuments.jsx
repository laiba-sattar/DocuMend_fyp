/**
 * MyDocuments — the private library, served at the `/documents` route.
 *
 * Built from the design screenshot (my-document.png) rather than ported from
 * prototype source — unlike the dashboard, no TSX original exists for this
 * page. It follows the same conventions as Dashboard.jsx: plain JSX, the
 * shared shell from components/WorkspaceChrome.jsx, hand-written `docs-*`
 * classes in my-documents.css, and the project palette throughout.
 *
 * The page: an editor-style tab strip, the "My Documents" heading with a New
 * Document action, a library-wide search, category filter chips, four stat
 * tiles, and a card grid of documents (colour-tinted preview, title, meta,
 * tag chips).
 *
 * Documents come from IndexedDB through src/storage/documents.js, so they
 * survive a reload. useLiveQuery re-renders the grid when a record changes.
 */
/**
 * MyDocuments — the private library, served at the `/documents` route.
 *
 * Integrated with the shared ThemeContext for synchronized Light/Dark mode switching.
 */
import { useEffect, useMemo, useState } from 'react';
import './my-documents.css';
import {
  Copy,
  FileText,
  Laptop,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
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
import { usePreference } from '../settings/preferences';
import { useLiveQuery } from 'dexie-react-hooks';
import { createDocument, deleteDocument, duplicateDocument, listDocuments } from '../storage/documents';
import { listRemote } from '../sync/metadata';
import { formatModified, pageLabel, pagesFor } from '../storage/format';

/* ==========================================================================
   Content data
   ========================================================================== */

/**
 * What the strip along the top offers.
 *
 * It used to read Home / Insert / References / AI Tools — the editor's ribbon
 * tabs, copied onto a page where no document is open, each one raising
 * "Insert view selected" and changing nothing. These three keep the names that
 * were already there and give them a meaning the library can actually answer:
 * everything, what you touched this week, and what came in from a file.
 */
const RECENT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // "the last day or two"

const VIEWS = [
  { id: 'home', label: 'Home', empty: 'No documents yet.' },
  { id: 'recent', label: 'Recent', empty: 'Nothing edited in the last two days.' },
  { id: 'insert', label: 'Insert', empty: 'Nothing imported yet. Open a .docx, .txt or .md file and it appears here.' },
];

/**
 * Was this document brought in from a file, rather than started here?
 *
 * New records say so themselves (`source`, set by createDocument). Records
 * made before that field existed do not, so there is one honest guess for
 * them: createDocument always writes DOCX, so any other format can only have
 * arrived through an import.
 */
function isImported(doc) {
  if (doc.elsewhere) return false; // the server is not told where a document came from
  if (doc.source) return doc.source === 'imported';
  return (doc.format ?? 'DOCX') !== 'DOCX';
}

const categories = ['All', 'Academic', 'Legal', 'Researcher', 'Corporate', 'Draft'];

/** Shapes a stored document record into what DocumentCard draws. */
function toCard(doc) {
  return {
    ...doc,
    type: doc.format ?? 'DOCX',
    modified: formatModified(doc.updatedAt),
    pages: pagesFor(doc.wordCount),
    tags: doc.tags ?? [{ label: doc.type, tone: 'info' }],
  };
}

/**
 * A document the account knows about but this computer does not have.
 *
 * The server keeps names and dates, never text, so this card can say what the
 * document is and cannot open it. Saying so plainly is better than hiding it:
 * the reader knows the work is safe, and knows which machine to go to.
 */
function toElsewhereCard(row) {
  return {
    id: row.id,
    title: row.title,
    type: 'DOCX',
    category: row.category ?? 'Draft',
    tint: 'sage',
    status: 'elsewhere',
    elsewhere: true,
    wordCount: row.wordCount ?? 0,
    pages: Math.max(1, row.pages ?? 1),
    updatedAt: new Date(row.deviceUpdatedAt).getTime(), // so sorting treats both the same
    modified: formatModified(new Date(row.deviceUpdatedAt).getTime()),
    tags: [{ label: row.type ?? 'Other', tone: 'info' }],
  };
}

/* ==========================================================================
   Pieces
   ========================================================================== */

/**
 * One document.
 *
 * The card used to be a single <button>, which meant no control could ever sit
 * inside it — a button cannot contain a button. So the clickable area is its
 * own button now, and Copy and Delete sit beside it. They stay out of the way
 * until the card is hovered or focused, and they are never offered for a
 * document that lives on another computer: this browser cannot reach its text.
 */
function DocumentCard({ doc, onOpen, onDuplicate, onDelete }) {
  return (
    <article className={`docs-card dash-lift${doc.elsewhere ? ' docs-card-elsewhere' : ''}`}>
      <button type="button" onClick={onOpen} className="docs-card-open">
        <span className={`docs-preview docs-preview-${doc.tint}`}>
          <span className="docs-preview-lines" aria-hidden="true">
            <span /><span /><span />
          </span>
          <span className="docs-preview-icon"><FileText size={22} strokeWidth={2} /></span>
          <span className="docs-preview-type">{doc.type}</span>
          {doc.elsewhere && (
            <span className="docs-preview-badge">
              <Laptop size={12} strokeWidth={2} /> Another device
            </span>
          )}
        </span>
        <span className="docs-card-body">
          <span className="docs-card-title dash-serif">{doc.title}</span>
          <span className="docs-card-meta">
            {doc.elsewhere ? 'Last edited' : 'Modified'} {doc.modified} · {pageLabel(doc.pages)}
          </span>
          <span className="docs-tags">
            {doc.tags.map((tag) => (
              <span key={tag.label} className={`docs-tag docs-tag-${tag.tone}`}>{tag.label}</span>
            ))}
          </span>
        </span>
      </button>

      {!doc.elsewhere && (
        <div className="docs-card-actions">
          <button
            type="button"
            className="docs-card-action"
            onClick={() => onDuplicate(doc)}
            title={`Make a copy of “${doc.title}”`}
            aria-label={`Make a copy of ${doc.title}`}
          >
            <Copy size={15} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            className="docs-card-action is-danger"
            onClick={() => onDelete(doc)}
            title={`Delete “${doc.title}”`}
            aria-label={`Delete ${doc.title}`}
          >
            <Trash2 size={15} strokeWidth={1.9} />
          </button>
        </div>
      )}
    </article>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */
function MyDocuments() {
  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  const [activeNav, setActiveNav] = useState('My documents');
  // Which of Home / Recent / Insert the strip is on. A tab, not a setting:
  // every visit starts at Home.
  const [view, setView] = useState('home');
  const [activeCategory, setActiveCategory] = useState('All');
  // Kept in the browser's settings store, so the choice survives a reload
  // and is the same on every page.
  const [privacyMode, setPrivacyMode] = usePreference('privacyMode');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [search, setSearch] = useState('');
  // Live list from IndexedDB: updates by itself when a document is added or changed.
  const storedDocuments = useLiveQuery(listDocuments, []);
  // What the account has, as last heard from the server. Empty when signed out.
  const remoteDocuments = useLiveQuery(listRemote, []);
  const loading = storedDocuments === undefined;

  const documents = useMemo(() => {
    const here = (storedDocuments ?? []).map(toCard);
    const hereIds = new Set(here.map((doc) => doc.id));
    // Anything the account knows about that is not on this computer.
    const elsewhere = (remoteDocuments ?? [])
      .filter((row) => !hereIds.has(row.id))
      .map(toElsewhereCard);
    return [...here, ...elsewhere];
  }, [storedDocuments, remoteDocuments]);

  const elsewhereCount = documents.filter((doc) => doc.elsewhere).length;

  const stats = [
    { icon: FileText, value: String(documents.length), label: 'Total Documents', tone: 'cream' },
    { icon: Pencil, value: String(documents.filter((doc) => doc.status === 'draft').length), label: 'Drafts in progress', tone: 'lavender' },
    { icon: TriangleAlert, value: String(documents.reduce((sum, doc) => sum + (doc.issueCount ?? 0), 0)), label: 'Issues found', tone: 'peach' },
    // Switches to "AES-256 · All docs encrypted" once section S3 (encryption) is done.
    elsewhereCount > 0
      ? { icon: Laptop, value: String(elsewhereCount), label: 'On another device', tone: 'sky' }
      : { icon: LockKeyhole, value: 'Local', label: 'Stored on this device', tone: 'sky' },
  ];
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredDocuments = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const freshAfter = Date.now() - RECENT_WINDOW_MS;

    const matching = documents.filter((doc) => {
      // The tab comes first: it decides which documents are on the page at all.
      if (view === 'recent' && (doc.updatedAt ?? 0) < freshAfter) return false;
      if (view === 'insert' && !isImported(doc)) return false;
      if (activeCategory !== 'All' && doc.category !== activeCategory) return false;
      if (!normalized) return true;
      const haystack = `${doc.title} ${doc.type} ${doc.category} ${doc.tags.map((tag) => tag.label).join(' ')}`;
      return haystack.toLowerCase().includes(normalized);
    });

    // Sorted on a copy: `documents` is memoised from the live queries and must
    // not be reordered in place. Newest first, on every tab.
    return [...matching].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [documents, search, activeCategory, view]);

  /** What the strip says the tab is showing, in plain words. */
  const viewNote = view === 'recent'
    ? 'Edited in the last two days'
    : view === 'insert'
      ? 'Brought in from a file on this device'
      : `${documents.length} ${documents.length === 1 ? 'document' : 'documents'}`;

  const announce = (message) => setToast(message);

  /** Copy a document. The plan's limit applies, so it can be refused. */
  const copyDocument = async (doc) => {
    try {
      const copy = await duplicateDocument(doc.id);
      announce(`Copied as “${copy.title}”.`);
    } catch (error) {
      announce(error?.code === 'plan_limit'
        ? error.message
        : 'That document could not be copied.');
    }
  };

  /**
   * Delete a document. It asks first and names the document, because this
   * cannot be undone: the text lives in this browser and nowhere else, so
   * there is no copy on a server to fetch back.
   */
  const removeDocument = async (doc) => {
    const sure = window.confirm(
      `Delete “${doc.title}” and its saved versions?\n\n`
      + 'The text is stored in this browser only, so this cannot be undone.',
    );
    if (!sure) return;
    try {
      await deleteDocument(doc.id);
      announce(`“${doc.title}” was deleted.`);
    } catch (error) {
      announce('That document could not be deleted.');
    }
  };

  const selectNav = (label) => {
    const route = workspaceRoutes[label];
    if (route && label !== 'My documents') {
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
    if (label !== 'My documents') announce(`${label} view selected`);
    setMobileSidebar(false);
  };

  const submitModal = async (value) => {
    const title = value.trim();
    if (!title) return;
    try {
      await createDocument({ title, type: 'Other' });
      setModal(null);
      announce('New document created');
    } catch (error) {
      console.error(error);
      // A plan limit is a decision, not a failure — say which one it was.
      announce(error?.code === 'plan_limit'
          ? error.message
          : 'The document could not be saved. Check that your browser allows site storage, then try again.');
    }
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
          announce(`Privacy mode ${privacyMode ? 'paused' : 'enabled'}`);
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
          {/* Home / Recent / Insert — three views of the same library. */}
          <div className="docs-tabs-row dash-rise dash-d1">
            <div className="docs-tabs" role="group" aria-label="Which documents to show">
              {VIEWS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={view === item.id}
                  onClick={() => setView(item.id)}
                  className={`docs-tab ${view === item.id ? 'is-active' : ''}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="docs-tab-note">{viewNote}</p>
          </div>

          {/* Heading + New Document */}
          <div className="docs-title-row dash-rise dash-d2">
            <div>
              <p className="docs-kicker">Your private library</p>
              <h1 className="docs-title dash-serif">My Documents</h1>
            </div>
            <button type="button" onClick={() => setModal('document')} className="docs-new-btn">
              <Plus size={15} strokeWidth={2.4} /> New Document
            </button>
          </div>

          {/* Library search */}
          <label className="docs-search dash-rise dash-d2">
            <span className="dash-sr">Search documents</span>
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search documents by title, tag, or content"
            />
          </label>

          {/* Category chips */}
          <div className="docs-chips dash-rise dash-d3" role="group" aria-label="Filter by category">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
                className={`docs-chip ${activeCategory === category ? 'is-active' : ''}`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Stat tiles */}
          <div className="docs-stats dash-rise dash-d3">
            {stats.map(({ icon: Icon, value, label, tone }) => (
              <div key={label} className={`docs-stat docs-stat-${tone}`}>
                <Icon size={17} strokeWidth={1.9} className="docs-stat-icon" />
                <strong className="docs-stat-value">{value}</strong>
                <span className="docs-stat-label">{label}</span>
              </div>
            ))}
          </div>

          {/* Document card grid */}
          {filteredDocuments.length > 0 ? (
            <div className="docs-grid dash-rise dash-d4">
              {filteredDocuments.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDuplicate={copyDocument}
                  onDelete={removeDocument}
                  onOpen={() => {
                    // A document that is only on the account cannot be opened
                    // here: the server has its name, never its words.
                    if (doc.elsewhere) {
                      announce(`"${doc.title}" is on another device. Its text never left that computer.`);
                      return;
                    }
                    navigate(`/editor?doc=${doc.id}`);
                  }}
                />
              ))}
            </div>
          ) : loading ? null : documents.length === 0 ? (
            <div className="docs-empty dash-rise dash-d4">
              <FileText size={22} />
              <p>No documents yet. Create one and it stays here, even after you reload.</p>
              <button type="button" onClick={() => setModal('document')}>
                Create your first document
              </button>
            </div>
          ) : (
            <div className="docs-empty dash-rise dash-d4">
              <Search size={22} />
              {/* An empty tab is not an empty search: saying "nothing matches
                  your search" when the search box is blank is a small lie the
                  reader has to work out for themselves. */}
              <p>
                {search || activeCategory !== 'All'
                  ? `Nothing here matches${search ? ` "${search}"` : ' that filter'}`
                  : VIEWS.find((item) => item.id === view)?.empty}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveCategory('All');
                  setView('home');
                }}
              >
                Show every document
              </button>
            </div>
          )}
        </div>
      </main>

      <WorkspaceModal
        key={String(modal)}
        mode={modal}
        initialValue=""
        onClose={() => setModal(null)}
        onSubmit={submitModal}
        onLogout={handleLogout}
      />

      {toast && <div className="dash-toast" role="status">{toast}</div>}
    </div>
  );
}

export default MyDocuments;