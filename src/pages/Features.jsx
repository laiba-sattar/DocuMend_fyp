/**
 * Features — what DocuMend can do, at `/features`.
 *
 * The old version of this page was the most confident fiction in the project.
 * It advertised ten "engine modules" with invented specifications: a
 * "60 FPS Canvas Renderer", "Hybrid AI Deep Reasoning" with "Cloud Inference",
 * "Zero-Knowledge cloud sync", latencies of "< 50ms" and "16.6ms", and a live
 * readout of "● 42ms runtime" that was simply typed into the markup. Eight of
 * the ten were switched on, and each had a toggle that changed a number in
 * this file and nothing else.
 *
 * What it says now comes from the code:
 *
 *   · the eight writing checks are read from engine/checks.js — the same list
 *     the engine runs and the Settings page shows, and their switches are the
 *     same real preference, so turning one off here turns it off everywhere;
 *   · everything else is marked "Working now" or "Planned", where planned
 *     means a section of the build plan that has not been written yet.
 *
 * A page that lists unbuilt work as finished is worse than no page: the first
 * person to look for "Zero-Knowledge cloud sync" and not find it stops
 * believing the other nine.
 */
import { useMemo, useState } from 'react';
import {
  BookOpen,
  Cloud,
  Cpu,
  Download,
  FileCheck2,
  FileInput,
  History,
  Laptop,
  Layers,
  ListTree,
  Lock,
  Search,
  Smartphone,
  Sparkles,
  Type,
  Users,
  WifiOff,
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
import { CHECKS } from '../engine/checks';
import './features.css';

/* ==========================================================================
   What DocuMend actually does
   ========================================================================== */

/**
 * The eight writing checks, taken from the engine itself. Their switches are
 * real: they write to the same `mutedChecks` preference the editor reads, so
 * a check turned off here stops appearing in the review panel.
 */
const checkCapabilities = CHECKS.map((check) => ({
  id: `check-${check.id}`,
  checkId: check.id,
  title: check.title,
  description: check.blurb,
  group: 'Writing checks',
  status: 'now',
  where: 'Editor → Review panel',
  icon: check.kind === 'structure' ? Layers : check.kind === 'redundancy' ? Type : FileCheck2,
  tone: check.kind === 'structure' ? 'gold' : check.kind === 'redundancy' ? 'mint' : 'coral',
}));

/** Everything else, each line something you can go and do right now — or not. */
const otherCapabilities = [
  {
    id: 'import',
    title: 'Open what you already have',
    description: 'Word (.docx), PDF, plain text and Markdown files become editable documents, converted in your own browser.',
    group: 'Writing',
    status: 'now',
    where: 'Upload, or drop a file on the dashboard',
    icon: FileInput,
    tone: 'blue',
  },
  {
    id: 'export',
    title: 'Take it away again',
    description: 'Export to Word or plain text, or print to PDF. No format you cannot get back out of.',
    group: 'Writing',
    status: 'now',
    where: 'Editor → Export',
    icon: Download,
    tone: 'blue',
  },
  {
    id: 'formatting',
    title: 'A familiar editor',
    description: 'Headings, bold and italic, lists, tables, alignment, indents, highlight, find and replace.',
    group: 'Writing',
    status: 'now',
    where: 'Editor → Home ribbon',
    icon: Type,
    tone: 'mint',
  },
  {
    id: 'outline',
    title: 'The shape of the document',
    description: 'Every heading in order, indented by level. Click one to jump to it.',
    group: 'Writing',
    status: 'now',
    where: 'Editor → Structure tab',
    icon: ListTree,
    tone: 'gold',
  },
  {
    id: 'versions',
    title: 'Going back',
    description: 'Versions are saved as you work and whenever you ask. Read an old one, or restore it.',
    group: 'Writing',
    status: 'now',
    where: 'Version history',
    icon: History,
    tone: 'coral',
  },
  {
    id: 'offline',
    title: 'Works with the internet off',
    description: 'The editor and every check run on this computer. Only signing in needs a connection.',
    group: 'Privacy',
    status: 'now',
    where: 'Everywhere',
    icon: WifiOff,
    tone: 'mint',
  },
  {
    id: 'local',
    title: 'Your text stays on your device',
    description: 'Documents are stored in this browser. The server is told a title, a date and a word count, and refuses anything more.',
    group: 'Privacy',
    status: 'now',
    where: 'By design',
    icon: Lock,
    tone: 'gold',
  },
  {
    id: 'account',
    title: 'One account, any computer',
    description: 'Sign in with Google or a one-time email link. Your document list follows you; the documents themselves do not.',
    group: 'Account',
    status: 'now',
    where: 'Sign in',
    icon: Laptop,
    tone: 'blue',
  },
  {
    id: 'plans',
    title: 'Plans that mean something',
    description: 'Basic keeps 10 documents and 10 automatic versions each; Premium removes the first limit and raises the second.',
    group: 'Account',
    status: 'now',
    where: 'Pricing',
    icon: Sparkles,
    tone: 'gold',
  },

  /* ---- not written yet. Said plainly, not dressed up as a feature. ------- */
  {
    id: 'citations',
    title: 'Reference checking',
    description: 'Looking up each reference in CrossRef and Semantic Scholar, and repairing APA, MLA and IEEE formatting.',
    group: 'Planned',
    status: 'planned',
    where: 'Section S8 of the build plan',
    icon: BookOpen,
    tone: 'blue',
  },
  {
    id: 'models',
    title: 'Reading meaning, not just words',
    description: 'A small language model running in the browser, to catch claims that disagree without repeating each other word for word.',
    group: 'Planned',
    status: 'planned',
    where: 'Section S7',
    icon: Cpu,
    tone: 'coral',
  },
  {
    id: 'encrypted-sync',
    title: 'Encrypted sync',
    description: 'A whole document opening on another computer, encrypted here first so the server only ever holds unreadable data.',
    group: 'Planned',
    status: 'planned',
    where: 'Sections S3 and S9',
    icon: Cloud,
    tone: 'gold',
  },
  {
    id: 'sharing',
    title: 'Sharing and comments',
    description: 'Sending a document to a supervisor and getting notes back, without either of you emailing a file around.',
    group: 'Planned',
    status: 'planned',
    where: 'Section S9',
    icon: Users,
    tone: 'mint',
  },
  {
    id: 'mobile',
    title: 'On a phone',
    description: 'The same workspace as an Android app, wrapped with Capacitor.',
    group: 'Planned',
    status: 'planned',
    where: 'Section S10',
    icon: Smartphone,
    tone: 'blue',
  },
];

const CAPABILITIES = [...checkCapabilities, ...otherCapabilities];

const GROUPS = ['All', 'Writing checks', 'Writing', 'Privacy', 'Account', 'Planned'];

/* ==========================================================================
   The page
   ========================================================================== */

export default function Features() {
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState('');

  const { darkMode, toggleDarkMode } = useTheme();
  const [mutedChecks, setMutedChecks] = usePreference('mutedChecks');
  const [privacyMode, setPrivacyMode] = usePreference('privacyMode');

  const [activeNav, setActiveNav] = useState('Features');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2700);
  };

  /** Only the writing checks can be switched, and this is the real switch. */
  const toggleCheck = (item) => {
    const muted = mutedChecks.includes(item.checkId)
      ? mutedChecks.filter((id) => id !== item.checkId)
      : [...mutedChecks, item.checkId];
    setMutedChecks(muted);
    notify(muted.includes(item.checkId)
      ? `The editor will stop flagging "${item.title}".`
      : `"${item.title}" is back on.`);
  };

  const isOn = (item) => item.status === 'now' && !(item.checkId && mutedChecks.includes(item.checkId));

  const workingNow = useMemo(() => CAPABILITIES.filter((item) => item.status === 'now').length, []);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return CAPABILITIES.filter((item) => {
      if (selectedFilter !== 'All' && item.group !== selectedFilter) return false;
      if (!query) return true;
      return `${item.title} ${item.description} ${item.where}`.toLowerCase().includes(query);
    });
  }, [selectedFilter, searchQuery, mutedChecks]);

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Features') return navigate(route);
    if (label === 'Dashboard') return navigate('/dashboard');
    setActiveNav(label);
    setMobileSidebar(false);
  };

  return (
    <div className={`dash-shell ${darkMode ? 'dash-dark' : ''} ${privacyMode ? 'dash-private' : ''}`}>
      <MobileTopbar onMenu={() => setMobileSidebar(true)} onThemeToggle={toggleDarkMode} darkMode={darkMode} />

      <Sidebar
        activeNav={activeNav}
        onNavigate={selectNav}
        privacyMode={privacyMode}
        onPrivacyToggle={() => setPrivacyMode(!privacyMode)}
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

      <main className={`dash-main feat-main-area ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <WorkspaceHeader onAnnounce={notify} />

        <div className="feat-container">
          <div className="feat-glow-orb feat-orb-1" aria-hidden="true" />
          <div className="feat-glow-orb feat-orb-2" aria-hidden="true" />

          <header className="feat-hero-header">
            <div className="feat-hero-text">
              <div className="feat-kicker">
                <Cpu size={14} className="feat-kicker-icon" />
                <span>What DocuMend can do</span>
              </div>
              <h1>Everything here is either working, or labelled.</h1>
              <p>
                The writing checks below are the ones the engine really runs, and their
                switches are the same ones on the Settings page. Anything still to be
                built says so.
              </p>
            </div>

            {/* A real count, not a fixed "42ms runtime". */}
            <div className="feat-meter-card">
              <div className="feat-meter-info">
                <span className="feat-meter-num">
                  {workingNow}
                  <small>/{CAPABILITIES.length}</small>
                </span>
                <span className="feat-meter-label">working today</span>
              </div>
              <div className="feat-progress-track">
                <div className="feat-progress-bar" style={{ width: `${(workingNow / CAPABILITIES.length) * 100}%` }} />
              </div>
              <div className="feat-meter-footer">
                <span><Lock size={12} /> Runs on this computer</span>
                <span>{CAPABILITIES.length - workingNow} still to build</span>
              </div>
            </div>
          </header>

          <div className="feat-filter-toolbar">
            <div className="feat-tabs" role="tablist">
              {GROUPS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selectedFilter === tab}
                  className={`feat-tab-btn ${selectedFilter === tab ? 'is-active' : ''}`}
                  onClick={() => setSelectedFilter(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="feat-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search what DocuMend does…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </div>

          <section className="feat-grid" aria-label="What DocuMend can do">
            {filtered.map((item) => {
              const Icon = item.icon;
              const on = isOn(item);
              const planned = item.status === 'planned';
              return (
                <article
                  key={item.id}
                  className={`feat-card feat-tone-${item.tone} ${on ? 'is-enabled' : 'is-disabled'}`}
                >
                  <div className="feat-card-top">
                    <div className={`feat-icon-bubble feat-bubble-${item.tone}`}>
                      <Icon size={20} strokeWidth={2.2} />
                    </div>
                    <div className="feat-badges-group">
                      <span className="feat-tech-tag">{item.where}</span>
                      <span className={`feat-tier-pill ${planned ? 'feat-tier-premium' : 'feat-tier-core'}`}>
                        {planned ? 'Planned' : 'Working now'}
                      </span>
                    </div>
                  </div>

                  <div className="feat-card-body">
                    <div className="feat-title-row">
                      <h3>{item.title}</h3>
                    </div>
                    <p>{item.description}</p>
                  </div>

                  <div className="feat-card-footer">
                    <span className="feat-status-caption">
                      {planned ? (
                        <span className="feat-status-inactive">Not built yet</span>
                      ) : item.checkId ? (
                        on
                          ? <span className="feat-status-active"><FileCheck2 size={13} /> On</span>
                          : <span className="feat-status-inactive">You switched this off</span>
                      ) : (
                        <span className="feat-status-active"><FileCheck2 size={13} /> Ready to use</span>
                      )}
                    </span>

                    {/* Only the checks get a switch, because only the checks
                        have something behind one. */}
                    {item.checkId && (
                      <label className="feat-switch" onClick={(event) => event.stopPropagation()}>
                        <span className="dash-sr">{item.title}</span>
                        <input type="checkbox" checked={on} onChange={() => toggleCheck(item)} />
                        <span className="feat-slider" />
                      </label>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {filtered.length === 0 && (
            <p className="feat-empty-note">Nothing here matches that.</p>
          )}
        </div>
      </main>

      <WorkspaceModal
        mode={modal}
        onClose={() => setModal(null)}
        onSubmit={() => setModal(null)}
        onLogout={() => { setModal(null); navigate('/'); }}
      />

      {toast && (
        <div className="feat-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
