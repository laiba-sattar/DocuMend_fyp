import { useMemo, useState } from 'react';
import './edit.css';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FileCheck2,
  FileCode2,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  Layers,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  MobileDrawer,
  MobileTopbar,
  Sidebar,
  WorkspaceModal,
} from '../components/WorkspaceChrome';
import { workspaceRoutes } from '../components/workspace-nav';
import { useTheme } from '../components/ThemeContext';
import { navigate } from '../router';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDocuments } from '../storage/documents';
import { formatModified, pagesFor } from '../storage/format';
import { formatBytes } from '../storage/quota';

const ICON_BY_TYPE = {
  Thesis: BookOpen,
  Legal: Scale,
  Report: FileSpreadsheet,
  'Research paper': FileCode2,
  Other: FileCheck2,
};

const TONE_BY_TINT = { sage: 'mint', gold: 'gold', saffron: 'gold', coral: 'coral', lavender: 'amber', sky: 'amber' };

/**
 * What the engine found in this document, as one badge.
 *
 * Every card used to be a hardcoded "NOT CHECKED YET", which made the other
 * four badge designs below unreachable — a whole health display that could
 * only ever show one state, for a feature the page did not have. The editor
 * records its findings on the document now (`setDocumentIssues`), so the
 * badge can say which kind of trouble it is, and the worst kind wins:
 * a sentence that contradicts another is a bigger problem than a missing
 * heading, which is bigger than a repeated line.
 */
function healthOf(doc) {
  if (!doc.issuesCheckedAt) {
    return { status: 'unchecked', label: 'NOT CHECKED YET' };
  }
  const total = doc.issueCount ?? 0;
  if (!total) return { status: 'clean', label: 'NO ISSUES' };

  const kinds = doc.issueKinds ?? {};
  const suffix = total === 1 ? '1 ISSUE' : `${total} ISSUES`;
  if (kinds.contradiction) return { status: 'conflict', label: suffix };
  if (kinds.structure) return { status: 'gap', label: suffix };
  return { status: 'issues', label: suffix };
}

/** A stored document, shaped for the cards below. */
function toCard(doc) {
  const words = doc.wordCount ?? 0;
  const health = healthOf(doc);
  return {
    id: doc.id,
    name: doc.title,
    category: doc.type ?? 'Other',
    pages: pagesFor(words),
    modified: formatModified(doc.updatedAt),
    type: doc.format ?? 'DOCX',
    status: health.status,
    statusLabel: health.label,
    statusDetail: doc.issuesCheckedAt
      ? `${words.toLocaleString()} words · checked ${formatModified(doc.issuesCheckedAt)}`
      : `${words.toLocaleString()} words · open it to run the checks`,
    icon: ICON_BY_TYPE[doc.type] ?? FileText,
    size: formatBytes(new Blob([doc.content ?? '']).size),
    tone: TONE_BY_TINT[doc.tint] ?? 'mint',
  };
}

export default function Edit() {
  const { darkMode, toggleDarkMode } = useTheme();

  // Workspace Chrome shell states
  const [activeNav, setActiveNav] = useState('Editor');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  // Page interactive state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDocId, setSelectedDocId] = useState(null);

  // Real documents from IndexedDB.
  const storedDocuments = useLiveQuery(listDocuments, []);
  const documents = useMemo(() => (storedDocuments ?? []).map(toCard), [storedDocuments]);
  const categoryFilters = useMemo(() => {
    const counts = {};
    documents.forEach((doc) => { counts[doc.category] = (counts[doc.category] ?? 0) + 1; });
    return [
      { id: 'all', label: 'All', count: documents.length },
      ...Object.entries(counts).map(([id, count]) => ({ id, label: id, count })),
    ];
  }, [documents]);

  const notify = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const selectedDoc = useMemo(
    () => documents.find((doc) => doc.id === selectedDocId) ?? documents[0] ?? null,
    [documents, selectedDocId]
  );

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchCat =
        selectedCategory === 'all' || doc.category === selectedCategory;
      const matchSearch =
        !q ||
        doc.name.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q) ||
        doc.statusLabel.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [documents, searchQuery, selectedCategory]);

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
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
    setMobileSidebar(false);
  };

  const handleOpenEditor = () => {
    if (!selectedDoc) {
      notify('Create a document first.');
      return;
    }
    navigate(`/editor?doc=${selectedDoc.id}`);
  };

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
        onPrivacyToggle={() => {
          setPrivacyMode((prev) => !prev);
          notify(`Privacy mode ${privacyMode ? 'paused' : 'enabled'}`);
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
        onPrivacyToggle={() => setPrivacyMode((prev) => !prev)}
        onLogout={() => setModal('logout')}
      />

      <main className={`dash-main edit-main-area ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <div className="edit-ambient-glow edit-glow-1" aria-hidden="true" />
        <div className="edit-ambient-glow edit-glow-2" aria-hidden="true" />

        <div className="edit-container">
          {/* Breadcrumb Navigation */}
          <div className="edit-breadcrumbs">
            <button
              type="button"
              className="edit-back-crumb"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft size={14} />
              <span>Dashboard</span>
            </button>
            <ChevronRight size={13} className="edit-crumb-sep" />
            <span className="edit-crumb-active">Document Selection</span>
          </div>

          {/* Top Hero Banner */}
          <header className="edit-hero-header">
            <div className="edit-hero-copy">
              <div className="edit-pill-badge">
                <Sparkles size={13} className="edit-accent-gold" />
                <span>DocuMend Edge Studio</span>
              </div>
              <h1>Select a document to edit</h1>
              <p>
                Choose a document below — it will launch inside the secure, offline-first AST studio.
              </p>
            </div>

            <div className="edit-hero-actions">
              <button
                type="button"
                className="edit-new-doc-btn"
                onClick={() => navigate('/create-document')}
              >
                <Plus size={16} strokeWidth={2.4} />
                <span>New Document</span>
              </button>
            </div>
          </header>

          {/* Search & Filter Toolbar */}
          <section className="edit-toolbar-box" aria-label="Filters and Search">
            <div className="edit-search-capsule">
              <Search size={16} className="edit-search-icon" />
              <input
                type="text"
                placeholder="Search by document title, category, or health status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search documents"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="edit-clear-search"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="edit-pills-row" role="tablist" aria-label="Document Categories">
              {categoryFilters.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`edit-filter-pill ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    <span>{cat.label}</span>
                    <span className="edit-pill-count">{cat.count}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Documents Grid */}
          <section className="edit-cards-grid" aria-label="Available Documents">
            {filteredDocs.map((doc) => {
              const isSelected = selectedDoc?.id === doc.id;
              const IconComponent = doc.icon;

              return (
                <article
                  key={doc.id}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  className={`edit-doc-card edit-tone-${doc.tone} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedDocId(doc.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDocId(doc.id);
                    }
                  }}
                >
                  {/* Card Header */}
                  <div className="edit-card-topline">
                    <div className="edit-doc-icon-badge">
                      <IconComponent size={18} />
                    </div>

                    <div className="edit-status-wrap">
                      <span className={`edit-badge-status edit-badge-${doc.status}`}>
                        {doc.status === 'clean' && <Check size={11} strokeWidth={3} />}
                        {doc.status === 'issues' && <TriangleAlert size={11} />}
                        {doc.status === 'conflict' && <ShieldAlert size={11} />}
                        {doc.status === 'gap' && <Layers size={11} />}
                        <span>{doc.statusLabel}</span>
                      </span>

                      {isSelected && (
                        <span className="edit-selected-checkmark" title="Selected for editing">
                          <Check size={12} strokeWidth={3.2} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="edit-card-body">
                    <h3 title={doc.name}>{doc.name}</h3>
                    <p className="edit-card-detail">{doc.statusDetail}</p>
                  </div>

                  {/* Card Footer */}
                  <div className="edit-card-meta">
                    <span>{doc.pages} {doc.pages === 1 ? 'page' : 'pages'} · {doc.size}</span>
                    <span className="edit-meta-dot">•</span>
                    <span>{doc.modified}</span>
                  </div>
                </article>
              );
            })}

            {filteredDocs.length === 0 && (
              <div className="edit-empty-state">
                <FileQuestion size={36} className="edit-empty-icon" />
                <h3>No documents matched your criteria</h3>
                <p>Try searching for a different keyword or reset category filters.</p>
                <button
                  type="button"
                  className="edit-reset-btn"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                >
                  Reset Filters
                </button>
              </div>
            )}
          </section>

          {/* Integrated Static Bottom Action Bar (Zero Overlap) */}
          <section className="edit-action-card-footer" aria-label="Selected Document Action Bar">
            <div className="edit-action-footer-inner">
              <div className="edit-action-left">
                <span className="edit-action-label">Selected Document:</span>
                <strong className="edit-action-filename" title={selectedDoc?.name}>
                  {selectedDoc?.name ?? 'No documents yet'}
                </strong>
                {selectedDoc && (
                  <span className="edit-action-badge">
                    {selectedDoc.pages} {selectedDoc.pages === 1 ? 'page' : 'pages'} · {selectedDoc.type}
                  </span>
                )}
              </div>

              <div className="edit-action-right">
                <button
                  type="button"
                  className="edit-action-cancel-btn"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="edit-action-open-btn"
                  onClick={handleOpenEditor}
                >
                  <span>Open in Editor</span>
                  <ArrowRight size={15} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Workspace Dialog Modal */}
      <WorkspaceModal
        mode={modal}
        onClose={() => setModal(null)}
        onSubmit={() => setModal(null)}
        onLogout={() => {
          setModal(null);
          navigate('/');
        }}
      />

      {/* Toast Feedback */}
      {toast && (
        <div className="edit-toast" role="status" aria-live="polite">
          <Sparkles size={14} className="edit-accent-gold" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}