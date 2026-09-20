import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Compass,
  Cpu,
  ExternalLink,
  FileCheck,
  FileQuestion,
  FileText,
  HardDrive,
  HelpCircle,
  Key,
  Keyboard,
  Layers,
  Lock,
  MessageSquare,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
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
import { usePreference } from '../settings/preferences';
import './help.css';

/**
 * Every article below describes something you can actually go and do.
 *
 * The version before this one did not. It explained how to switch on
 * "strict air-gapped offline mode", how AES-GCM keeps your drafts encrypted
 * on disk, how to validate a DOI against CrossRef, and how to pick the "UCP
 * Final Year Project" blueprint in Settings. None of those exist in this
 * build. Help that sends someone looking for a button that was never written
 * is worse than a blank page: they assume they are the problem.
 *
 * Where something is not built, the article says so, and says where it is in
 * the plan. Where a number is quoted, it comes from the code.
 */
const helpSections = [
  {
    id: 'start',
    title: 'Getting started',
    icon: Compass,
    tone: 'mint',
    description: 'Making a document, bringing one in, and finding your way around the editor.',
    articles: [
      {
        id: 'first-document',
        title: 'Making your first document',
        time: '2 min read',
        tag: 'Basics',
        content:
          'From the dashboard, choose "Create document". Give it a name and a type — Thesis, Research paper, Report, Legal or Other. The type matters: it tells the engine which sections this kind of document usually has, so it can tell you when one is missing. You can change the default type under Settings → Document types.',
      },
      {
        id: 'import-file',
        title: 'Opening a file you already have',
        time: '2 min read',
        tag: 'Basics',
        content:
          'Word (.docx), plain text and Markdown files can be opened. Use "Upload / drop" on the dashboard, or drag the file straight onto that tile. The file is converted inside your browser — it is not uploaded anywhere — and becomes an ordinary DocuMend document you can edit. PDFs are not accepted: a PDF stores characters and positions, not headings and paragraphs, so its structure could only be guessed, and structure is the thing DocuMend checks. Open the PDF in Word, save it as .docx, and import that.',
      },
      {
        id: 'saving',
        title: 'How saving works',
        time: '1 min read',
        tag: 'Basics',
        content:
          'There is no save button to remember. The editor saves to this browser a few seconds after you stop typing, and Ctrl+S saves immediately. The status bar at the bottom shows when it last saved.',
      },
      {
        id: 'export',
        title: 'Getting your document back out',
        time: '2 min read',
        tag: 'Basics',
        content:
          'Editor → Export offers Word (.docx) and plain text, and printing to PDF through your browser\u2019s print dialogue. Nothing you write is locked inside DocuMend.',
      },
    ],
  },
  {
    id: 'checks',
    title: 'The writing checks',
    icon: Cpu,
    tone: 'gold',
    description: 'What the engine looks for, how to act on it, and how to quieten it.',
    articles: [
      {
        id: 'what-checks',
        title: 'What DocuMend checks for',
        time: '3 min read',
        tag: 'Checks',
        content:
          'Eight things. Three are about what you have written: figures that disagree (40% in one place, 45% in another about the same thing), two sentences that contradict each other, and a sentence that repeats one you already wrote. Five are about shape: a section your kind of document usually has but yours does not, a heading under an unusual name, a heading with nothing under it, a jump from Heading 1 to Heading 3, and two sections with the same name. The full list with descriptions is on the Features page.',
      },
      {
        id: 'where-issues',
        title: 'Where the findings appear',
        time: '2 min read',
        tag: 'Workflow',
        content:
          'Open a document and turn on the Review panel from the editor toolbar. Findings are listed there, and the words they refer to are highlighted in the page. "Show me" jumps to the sentence. Where DocuMend can offer a fix, the card has a button that makes the change for you — for example, using the same figure in both places, or adding a missing heading in the right position with the numbering kept.',
      },
      {
        id: 'turn-off-check',
        title: 'Turning a check off',
        time: '1 min read',
        tag: 'Settings',
        content:
          'Settings → Checks & storage lists all eight with a switch each; the Features page has the same switches. Turning one off stops it appearing in the review panel on this computer, for good. "Ignore" on a single card is different: it hides that one finding until you reload.',
      },
      {
        id: 'where-it-runs',
        title: 'Where the analysis happens',
        time: '2 min read',
        tag: 'Architecture',
        content:
          'On your computer. The checks are written in Rust and compiled to WebAssembly, and they run in a background thread in this browser, so typing never stutters. If WebAssembly cannot load for any reason, an identical set of checks written in JavaScript runs instead — the status pill in the editor\u2019s footer says which one you have. Either way, no sentence of yours is sent anywhere to be analysed.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Where your work lives',
    icon: Lock,
    tone: 'blue',
    description: 'What is on your computer, what the server knows, and what is not built yet.',
    articles: [
      {
        id: 'what-is-stored',
        title: 'What is stored, and where',
        time: '3 min read',
        tag: 'Privacy',
        content:
          'The text of your documents is stored in this browser, in IndexedDB, and nowhere else. When you are signed in, DocuMend tells the server a title, a type, a date and a word count for each document — never the text. The server refuses a request that contains document content outright, with an error, rather than quietly ignoring it. That is why a document created on another computer appears in your list with its name but cannot be opened here.',
      },
      {
        id: 'no-encryption-yet',
        title: 'Is my document encrypted on disk?',
        time: '2 min read',
        tag: 'Privacy',
        content:
          'Not yet, and it is worth being straight about it. Documents sit in this browser\u2019s own storage, protected by your computer\u2019s login and by the browser keeping sites apart, but they are not encrypted with a password of yours. Encryption — a password that unlocks the documents, with the key never leaving your device — is section S3 of the build plan and will come with encrypted sync (S9). Until then, treat this browser profile as you would a folder on your desktop.',
      },
      {
        id: 'privacy-mode',
        title: 'Hiding titles from the person beside you',
        time: '1 min read',
        tag: 'Privacy',
        content:
          'The Privacy mode switch in the sidebar blurs document titles in the dashboard and library until you point at one. It is for reading in a library or on a train. It does not encrypt anything, and it is remembered between visits.',
      },
      {
        id: 'offline',
        title: 'Working without the internet',
        time: '1 min read',
        tag: 'Offline',
        content:
          'Everything except signing in works offline: writing, importing, exporting, version history and all eight checks. Changes to your document list wait in a queue and go up the next time you are online.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account and plan',
    icon: Sparkles,
    tone: 'mint',
    description: 'Signing in, what each plan allows, and how to leave.',
    articles: [
      {
        id: 'sign-in',
        title: 'Ways to sign in',
        time: '2 min read',
        tag: 'Account',
        content:
          'With Google, with a one-time link sent to your email, or with an email address and password. They all reach the same account: if you sign up with a password and later use Google with the same address, it is still you. "Forgot password" sends the same one-time link and lands you on a page where you choose a new password.',
      },
      {
        id: 'plan-limits',
        title: 'What the plans actually limit',
        time: '2 min read',
        tag: 'Plans',
        content:
          'Basic keeps 10 documents and the last 10 automatic versions of each. Premium removes the document limit and keeps 50 automatic versions; Enterprise keeps 200. Versions you save by hand are never removed, on any plan. These numbers are enforced in the app, not decoration — the eleventh document on Basic is refused with a message saying why. Payments are not connected in this build, so no plan can be bought yet.',
      },
      {
        id: 'sign-out-everywhere',
        title: 'Signing out of a computer you no longer have',
        time: '1 min read',
        tag: 'Account',
        content:
          'Settings → Account → "Sign out everywhere" ends every session on every device, this one included. Changing your password does the same thing to every device except the one you changed it on.',
      },
      {
        id: 'leaving',
        title: 'Erasing your work, or closing your account',
        time: '2 min read',
        tag: 'Account',
        content:
          'Two separate buttons at the bottom of Settings → Account. "Erase the documents in this browser" removes the text and leaves the account. "Close your account" does both: the account, the document list on the server, and every document here. Neither can be undone, and neither can reach documents on your other computers — those you clear from those computers.',
      },
    ],
  },
  {
    id: 'planned',
    title: 'Not built yet',
    icon: BookOpen,
    tone: 'blue',
    description: 'Things people ask about that this build does not do.',
    articles: [
      {
        id: 'citations-planned',
        title: 'Reference and citation checking',
        time: '1 min read',
        tag: 'Planned',
        content:
          'Looking each reference up in CrossRef and Semantic Scholar, and repairing APA, MLA or IEEE formatting, is section S8 of the build plan. Nothing in this build reads your bibliography.',
      },
      {
        id: 'sharing-planned',
        title: 'Sharing a document with someone',
        time: '1 min read',
        tag: 'Planned',
        content:
          'Sharing, comments and a link a supervisor can open are section S9, and they depend on encryption (S3) coming first — sending a document anywhere before it can be encrypted would break the promise the rest of this page makes. For now, export to Word or PDF and send that.',
      },
      {
        id: 'mobile-planned',
        title: 'A phone app',
        time: '1 min read',
        tag: 'Planned',
        content:
          'An Android app built from this same workspace with Capacitor is section S10. The site works in a phone browser today, though the editor is happiest with a keyboard.',
      },
    ],
  },
];

/** Only shortcuts that are really wired up. Checked against Editor.jsx. */
const keyboardShortcuts = [
  { keys: ['Ctrl', 'S'], label: 'Save now' },
  { keys: ['Ctrl', 'F'], label: 'Find in document' },
  { keys: ['Ctrl', 'H'], label: 'Find and replace' },
  { keys: ['Ctrl', 'B'], label: 'Bold' },
  { keys: ['Ctrl', 'I'], label: 'Italic' },
  { keys: ['Ctrl', 'U'], label: 'Underline' },
  { keys: ['Ctrl', 'Z'], label: 'Undo' },
  { keys: ['Ctrl', 'Y'], label: 'Redo' },
];

export default function Help() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState({ start: true, checks: true, privacy: true });
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [toast, setToast] = useState('');

  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // Workspace Chrome Shell States
  const [activeNav, setActiveNav] = useState('Help and Guide');
  // The same stored preference every other page uses.
  const [privacyMode, setPrivacyMode] = usePreference('privacyMode');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return helpSections;

    return helpSections
      .map((sec) => {
        const matchingArticles = sec.articles.filter(
          (art) =>
            art.title.toLowerCase().includes(q) ||
            art.content.toLowerCase().includes(q) ||
            art.tag.toLowerCase().includes(q)
        );
        return {
          ...sec,
          articles: matchingArticles,
        };
      })
      .filter((sec) => sec.articles.length > 0 || sec.title.toLowerCase().includes(q));
  }, [searchQuery]);

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Help and Guide') {
      navigate(route);
      return;
    }
    if (label === 'Dashboard') return navigate('/dashboard');
    if (label === 'Editor') return navigate('/editor');
    if (label === 'Subscription' || label === 'Pricing') return navigate('/pricing');
    if (label === 'Version history') return navigate('/version');
    if (label === 'Features') return navigate('/features');
    if (label === 'Settings') return navigate('/settings');
    if (label === 'Storage') return navigate('/storage');
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    if (label !== 'Help and Guide') notify(`${label} view selected`);
    setMobileSidebar(false);
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
        onPrivacyToggle={() => setPrivacyMode(!privacyMode)}
        onLogout={() => setModal('logout')}
      />

      <main className={`dash-main help-main-area ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <div className="help-glow-orb help-orb-1" aria-hidden="true" />
        <div className="help-glow-orb help-orb-2" aria-hidden="true" />

        <div className="help-container">
          {/* Top Page Banner */}
          <header className="help-hero">
            <div className="help-hero-badge">
              <Compass size={13} />
              <span>DocuMend Knowledge Base</span>
            </div>
            <h1>How DocuMend works</h1>
            <p>
              Short answers to the things people actually ask, and a plain note wherever
              something is not built yet.
            </p>

            {/* Prominent Search Bar */}
            <div className="help-search-capsule">
              <Search size={18} className="help-search-icon" />
              <input
                type="text"
                placeholder="Search help — try saving, import, privacy, plans…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="help-clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </header>

          {/* 3 Interactive Quick Start Cards */}
          <section className="help-quick-cards-grid" aria-label="Quick Start Guides">
            <div
              className="help-quick-card help-quick-card-mint"
              onClick={() => {
                setSelectedArticle(helpSections[0].articles[0]);
              }}
            >
              <div className="help-quick-card-icon">
                <Cpu size={22} />
              </div>
              <div className="help-quick-card-body">
                <span className="help-quick-tag">Start here</span>
                <h3>Making your first document</h3>
                <p>Create one, or open a Word or text file you already have.</p>
              </div>
              <span className="help-quick-arrow">
                Read Guide <ArrowRight size={13} />
              </span>
            </div>

            <div
              className="help-quick-card help-quick-card-gold"
              onClick={() => {
                setSelectedArticle(helpSections[1].articles[0]); // the checks
              }}
            >
              <div className="help-quick-card-icon">
                <Lock size={22} />
              </div>
              <div className="help-quick-card-body">
                <span className="help-quick-tag">The checks</span>
                <h3>What DocuMend checks for</h3>
                <p>Eight things, all of them found on your own computer.</p>
              </div>
              <span className="help-quick-arrow">
                Read Guide <ArrowRight size={13} />
              </span>
            </div>

            <div
              className="help-quick-card help-quick-card-blue"
              onClick={() => {
                setSelectedArticle(helpSections[2].articles[0]); // where your work lives
              }}
            >
              <div className="help-quick-card-icon">
                <BookOpen size={22} />
              </div>
              <div className="help-quick-card-body">
                <span className="help-quick-tag">Privacy</span>
                <h3>What is stored, and where</h3>
                <p>Your text stays in this browser. The server only learns a title and a date.</p>
              </div>
              <span className="help-quick-arrow">
                Read Guide <ArrowRight size={13} />
              </span>
            </div>
          </section>

          {/* Accordion Documentation Categories */}
          <section className="help-sections-wrap" aria-label="Help Categories">
            {filteredSections.map((sec) => {
              const IconComp = sec.icon;
              const isOpen = openSections[sec.id] ?? true;

              return (
                <div key={sec.id} className={`help-accordion-block help-tone-${sec.tone}`}>
                  <button
                    type="button"
                    className="help-accordion-header"
                    onClick={() => toggleSection(sec.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="help-accordion-title">
                      <div className="help-accordion-icon-badge">
                        <IconComp size={18} />
                      </div>
                      <div>
                        <h3>{sec.title}</h3>
                        <p>{sec.description}</p>
                      </div>
                    </div>
                    <div className="help-accordion-right">
                      <span className="help-article-count-pill">{sec.articles.length} articles</span>
                      <ChevronDown
                        size={17}
                        className={`help-chevron-toggle ${isOpen ? 'is-expanded' : ''}`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="help-articles-list">
                      {sec.articles.map((art) => (
                        <div
                          key={art.id}
                          className="help-article-row"
                          onClick={() => setSelectedArticle(art)}
                        >
                          <div className="help-article-info">
                            <span className="help-article-tag">{art.tag}</span>
                            <h4>{art.title}</h4>
                          </div>
                          <div className="help-article-actions">
                            <span className="help-read-time">{art.time}</span>
                            <div className="help-row-arrow-circle">
                              <ArrowRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Keyboard Shortcuts Matrix Card */}
          <section className="help-shortcuts-matrix-card" aria-label="Keyboard Shortcuts">
            <div className="help-shortcuts-head">
              <div className="help-shortcuts-title">
                <div className="help-shortcuts-icon-badge">
                  <Keyboard size={18} />
                </div>
                <div>
                  <h3>Power User Keyboard Shortcuts</h3>
                  <p>Accelerate your research writing and engine execution with rapid key bindings.</p>
                </div>
              </div>
              <span className="help-shortcuts-counter">{keyboardShortcuts.length} Shortcuts Available</span>
            </div>

            <div className="help-shortcuts-grid">
              {keyboardShortcuts.map((item) => (
                <div key={item.label} className="help-shortcut-card">
                  <span className="help-shortcut-label">{item.label}</span>
                  <div className="help-shortcut-keys">
                    {item.keys.map((k) => (
                      <kbd key={k} className="help-kbd">
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer Contact Support Banner */}
          <footer className="help-support-banner">
            <div className="help-support-copy">
              <div className="help-support-icon">
                <MessageSquare size={20} />
              </div>
              <div>
                <h4>Still need guidance on your manuscript?</h4>
                <p>DocuMend’s local-first community documentation and research guides are constantly updated.</p>
              </div>
            </div>
            <button
              type="button"
              className="help-support-btn"
              onClick={() => notify('Community forum & docs opening locally')}
            >
              <span>Explore Community Knowledge</span>
              <ExternalLink size={14} />
            </button>
          </footer>
        </div>
      </main>

      {/* Article Detail Drawer Modal */}
      {selectedArticle && (
        <div
          className="help-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedArticle(null);
          }}
        >
          <article className="help-article-drawer" role="dialog" aria-modal="true">
            <div className="help-drawer-top">
              <div className="help-drawer-tags">
                <span className="help-drawer-tag-pill">{selectedArticle.tag}</span>
                <span className="help-drawer-time">{selectedArticle.time}</span>
              </div>
              <button
                type="button"
                className="help-drawer-close-btn"
                onClick={() => setSelectedArticle(null)}
                aria-label="Close article"
              >
                <X size={18} />
              </button>
            </div>

            <h2 className="help-drawer-title">{selectedArticle.title}</h2>

            <div className="help-drawer-body">
              <p>{selectedArticle.content}</p>
            </div>

            {/* "Validated by DocuMend ODIE Local Specification v2.4" used to
                sit here. There is no such specification and nothing validated
                these articles. This says something true instead. */}
            <div className="help-drawer-verified-box">
              <ShieldCheck size={16} />
              <span>Everything described here runs on your own computer.</span>
            </div>

            <div className="help-drawer-footer">
              <button
                type="button"
                className="help-drawer-action-btn"
                onClick={() => {
                  setSelectedArticle(null);
                  navigate('/editor');
                }}
              >
                <FileText size={15} />
                <span>Try in Document Editor</span>
              </button>
            </div>
          </article>
        </div>
      )}

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

      {/* Toast Notification */}
      {toast && (
        <div className="help-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}