/**
 * Settings — the account, the templates, and the checks. At `/settings`.
 *
 * This page used to be a showroom. It greeted "Mahnoor Aslam", offered a
 * password field full of bullets that saved nowhere, listed four invented
 * document blueprints ("IEEE Conference Manuscript", "Corporate Mutual NDA")
 * that the engine had never heard of, and switched on "Zero-Knowledge Disk
 * Encryption" that does not exist in this build. Every control has been
 * replaced by one that does what it says.
 *
 * Three tabs, three real subjects:
 *
 *   Account    the signed-in user, their plan, their password, their sessions,
 *              and the two ways to leave (clear this device, close the account)
 *   Templates  the document types the engine actually checks against, straight
 *              out of engine/src/structure.rs, and which one new documents start as
 *   Checks     the eight rules the engine runs, each one switchable, plus the
 *              browser storage this device is really using
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  FileCheck,
  KeyRound,
  Layers,
  LogOut,
  Save,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  User,
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
import { TEMPLATES } from '../engine/fallback';
import { CHECKS, KIND_LABELS } from '../engine/checks';
import { usePreference } from '../settings/preferences';
import { formatBytes, formatPercent, getStorageReport, wipeAllData } from '../storage/quota';
import './settings.css';

/* ==========================================================================
   Document types — the engine's own list, not a made-up one
   ========================================================================== */

/**
 * The kinds "Create document" offers. The first four have a template in the
 * engine; "Other" deliberately has none, so no section is ever called missing
 * in a document that was never meant to have chapters.
 */
const KINDS = [
  { name: 'Thesis', key: 'thesis', blurb: 'A long academic document with chapters, from Abstract to References.' },
  { name: 'Research paper', key: 'research paper', blurb: 'A conference or journal paper: shorter, same bones as a thesis.' },
  { name: 'Report', key: 'report', blurb: 'A working document that ends in findings and what to do about them.' },
  { name: 'Legal', key: 'legal', blurb: 'An agreement: who, what they must do, and which court decides.' },
  { name: 'Other', key: 'other', blurb: 'No template. Wording and repetition are still checked; sections are not.' },
];

const sectionsFor = (key) => TEMPLATES[key] ?? [];

/* ==========================================================================
   The page
   ========================================================================== */

export default function Settings() {
  const [activeTab, setActiveTab] = useState('account');
  const [toast, setToast] = useState('');

  const { darkMode, toggleDarkMode } = useTheme();
  const { user, tier, hasPassword, updateProfile, signOutEverywhere, deleteAccount } = useAuth();

  // WorkspaceChrome shell states
  const [activeNav, setActiveNav] = useState('Settings');
  const [privacyMode, setPrivacyMode] = usePreference('privacyMode');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);

  // --- the account form -----------------------------------------------------
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);
  const nameChanged = name.trim() !== (user?.name ?? '').trim() && name.trim().length >= 2;

  // --- templates and checks -------------------------------------------------
  const [defaultKind, setDefaultKind] = usePreference('defaultKind');
  const [mutedChecks, setMutedChecks] = usePreference('mutedChecks');
  const activeKind = useMemo(
    () => KINDS.find((entry) => entry.name === defaultKind) ?? KINDS[0],
    [defaultKind],
  );

  // --- real browser storage -------------------------------------------------
  const [storage, setStorage] = useState(null);
  useEffect(() => {
    let alive = true;
    getStorageReport().then((report) => { if (alive) setStorage(report); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };

  const saveName = async (event) => {
    event.preventDefault();
    if (!nameChanged || savingName) return;
    setSavingName(true);
    try {
      await updateProfile({ name: name.trim() });
      notify('Your name is saved.');
    } catch (error) {
      notify(error?.message ?? 'That could not be saved.');
    } finally {
      setSavingName(false);
    }
  };

  const endEverySession = async () => {
    if (!window.confirm('Sign out of DocuMend on every device, including this one?')) return;
    try {
      await signOutEverywhere();
      navigate('/login');
    } catch (error) {
      notify(error?.message ?? 'That did not work.');
    }
  };

  /**
   * Closing the account. The local documents are cleared first, on purpose:
   * the server cannot reach them, so if the order were the other way round a
   * failed request would leave a browser full of documents with no account.
   */
  const closeAccount = async () => {
    const typed = window.prompt('This erases your account and every document in this browser. It cannot be undone.\n\nType DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try {
      await wipeAllData();
      await deleteAccount();
      navigate('/');
    } catch (error) {
      notify(error?.message ?? 'The account could not be closed.');
    }
  };

  const clearThisDevice = async () => {
    if (!window.confirm('Erase every document stored in this browser? Your account stays, but the text is gone for good.')) return;
    await wipeAllData();
    notify('This browser no longer holds any documents.');
  };

  const toggleCheck = (check) => {
    const muted = mutedChecks.includes(check.id)
      ? mutedChecks.filter((id) => id !== check.id)
      : [...mutedChecks, check.id];
    setMutedChecks(muted);
    notify(muted.includes(check.id)
      ? `The editor will stop flagging "${check.title}".`
      : `"${check.title}" is back on.`);
  };

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Settings') return navigate(route);
    if (label === 'Dashboard') return navigate('/dashboard');
    setActiveNav(label);
    setMobileSidebar(false);
  };

  const initials = (user?.name ?? 'You')
    .split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();

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

      <main className={`dash-main set-v2-main ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <WorkspaceHeader onAnnounce={notify} />

        <div className="set-v2-wrapper">
          <header className="set-v2-hero">
            <div className="set-v2-hero-copy">
              <div className="set-v2-pill-tag">
                <Sliders size={13} className="set-v2-tag-icon" />
                <span>Settings</span>
              </div>
              <h2>Your account, and how DocuMend reads for you.</h2>
              <p>
                Everything on this page is real: the account lives on the server, the
                templates are the ones the engine checks against, and the switches
                change what the editor tells you.
              </p>
            </div>
          </header>

          <div className="set-v2-tabs-dock" role="tablist">
            {[
              { id: 'account', icon: User, label: 'Account' },
              { id: 'templates', icon: Layers, label: 'Document types' },
              { id: 'checks', icon: Cpu, label: 'Checks & storage' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                className={`set-v2-tab-item ${activeTab === id ? 'is-active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* ================================================== TAB 1: ACCOUNT */}
          {activeTab === 'account' && (
            <div className="set-v2-panel set-v2-fade-in">
              <div className="set-v2-card-glass">
                <div className="set-v2-profile-card">
                  <div className="set-v2-avatar-badge">
                    <span>{initials || 'YOU'}</span>
                    <div className="set-v2-avatar-status" title="Signed in" />
                  </div>
                  <div className="set-v2-profile-info">
                    <div className="set-v2-profile-title">
                      <h3>{user?.name ?? 'Your account'}</h3>
                      <span className="set-v2-badge-verified">
                        <CheckCircle2 size={12} /> {tier.charAt(0) + tier.slice(1).toLowerCase()} plan
                      </span>
                    </div>
                    <div className="set-v2-avatar-actions">
                      <span className="set-v2-avatar-limits">
                        {user?.createdAt
                          ? `With DocuMend since ${new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
                          : 'Signed in on this device'}
                      </span>
                    </div>
                  </div>
                </div>

                <form className="set-v2-form" onSubmit={saveName}>
                  <div className="set-v2-input-field">
                    <label htmlFor="set-name">Your name</label>
                    <div className="set-v2-input-shell">
                      <input
                        id="set-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="The name shown around the app"
                        maxLength={80}
                      />
                    </div>
                  </div>

                  <div className="set-v2-input-field set-v2-mt-20">
                    <label htmlFor="set-email">Email address</label>
                    <div className="set-v2-input-shell">
                      <input id="set-email" type="email" value={user?.email ?? ''} readOnly disabled />
                    </div>
                    {/* Said plainly rather than hidden behind a disabled box. */}
                    <p className="set-v2-field-note">
                      This address cannot be changed here. Both ways back into your
                      account — the sign-in link and “forgot password” — go to it, so
                      moving it needs a confirmation email that DocuMend does not send yet.
                    </p>
                  </div>

                  <div className="set-v2-form-submit">
                    <button type="submit" className="set-v2-save-btn" disabled={!nameChanged || savingName}>
                      <Save size={15} />
                      <span>{savingName ? 'Saving…' : 'Save your name'}</span>
                    </button>
                  </div>
                </form>

                <div className="set-v2-security-section">
                  <div className="set-v2-action-strip">
                    <div className="set-v2-strip-copy">
                      <div className="set-v2-strip-title">
                        <KeyRound size={16} className="set-v2-accent-icon" />
                        <strong>{hasPassword ? 'Change your password' : 'Choose a password'}</strong>
                      </div>
                      <p>
                        {hasPassword
                          ? 'Saving a new one signs you out everywhere else.'
                          : 'This account signs in with Google or an emailed link. A password gives you a second way in.'}
                      </p>
                    </div>
                    <button type="button" className="set-v2-secondary-btn" onClick={() => navigate('/set-password')}>
                      {hasPassword ? 'Change' : 'Set one'} <ArrowRight size={13} />
                    </button>
                  </div>

                  <div className="set-v2-action-strip">
                    <div className="set-v2-strip-copy">
                      <div className="set-v2-strip-title">
                        <Sparkles size={16} className="set-v2-accent-icon" />
                        <strong>Your plan</strong>
                      </div>
                      <p>You are on the {tier.toLowerCase()} plan.</p>
                    </div>
                    <button type="button" className="set-v2-secondary-btn" onClick={() => navigate('/pricing')}>
                      See plans <ArrowRight size={13} />
                    </button>
                  </div>

                  <div className="set-v2-action-strip">
                    <div className="set-v2-strip-copy">
                      <div className="set-v2-strip-title">
                        <LogOut size={16} className="set-v2-accent-icon" />
                        <strong>Sign out everywhere</strong>
                      </div>
                      <p>Ends every session on every computer and phone, this one included. For a laptop you no longer have.</p>
                    </div>
                    <button type="button" className="set-v2-secondary-btn" onClick={endEverySession}>
                      Sign out everywhere
                    </button>
                  </div>

                  <div className="set-v2-action-strip set-v2-danger-strip">
                    <div className="set-v2-strip-copy">
                      <div className="set-v2-strip-title">
                        <Database size={16} className="set-v2-danger-icon" />
                        <strong className="set-v2-danger-text">Erase the documents in this browser</strong>
                      </div>
                      <p>
                        Your account and your document list stay. The text itself is only
                        here, so this cannot be undone{storage?.usage ? ` (${formatBytes(storage.usage)} stored)` : ''}.
                      </p>
                    </div>
                    <button type="button" className="set-v2-danger-btn" onClick={clearThisDevice}>
                      <Trash2 size={14} /> <span>Erase</span>
                    </button>
                  </div>

                  <div className="set-v2-action-strip set-v2-danger-strip">
                    <div className="set-v2-strip-copy">
                      <div className="set-v2-strip-title">
                        <AlertTriangle size={16} className="set-v2-danger-icon" />
                        <strong className="set-v2-danger-text">Close your account</strong>
                      </div>
                      <p>Erases the account, the document list on the server, and every document in this browser.</p>
                    </div>
                    <button type="button" className="set-v2-danger-btn" onClick={closeAccount}>
                      <Trash2 size={14} /> <span>Close account</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================ TAB 2: DOCUMENT TYPES */}
          {activeTab === 'templates' && (
            <div className="set-v2-panel set-v2-fade-in">
              <div className="set-v2-template-layout">
                <div className="set-v2-blueprints-column">
                  <div className="set-v2-section-heading">
                    <h3>What the engine expects of each kind of document</h3>
                    <p>
                      Pick the one new documents should start as. You can still change a
                      document&apos;s type when you create it; this is only the default.
                    </p>
                  </div>

                  <div className="set-v2-bp-grid">
                    {KINDS.map((entry) => {
                      const selected = defaultKind === entry.name;
                      const sections = sectionsFor(entry.key);
                      return (
                        <div
                          key={entry.key}
                          className={`set-v2-bp-card ${selected ? 'is-selected' : ''}`}
                          onClick={() => setDefaultKind(entry.name)}
                        >
                          <div className="set-v2-bp-top">
                            <span className="set-v2-bp-badge">
                              {sections.length ? `${sections.length} sections` : 'No template'}
                            </span>
                            {selected && (
                              <span className="set-v2-selected-indicator">
                                <Check size={12} strokeWidth={3} /> Default
                              </span>
                            )}
                          </div>

                          <h4>{entry.name}</h4>
                          <p>{entry.blurb}</p>

                          <div className="set-v2-bp-tags">
                            {sections.slice(0, 4).map(([sectionName]) => (
                              <span key={sectionName} className="set-v2-bp-tag-pill">{sectionName}</span>
                            ))}
                            {sections.length > 4 && (
                              <span className="set-v2-bp-tag-pill">+{sections.length - 4} more</span>
                            )}
                          </div>

                          <button
                            type="button"
                            className={`set-v2-bp-use-btn ${selected ? 'is-active-btn' : ''}`}
                            onClick={(event) => { event.stopPropagation(); setDefaultKind(entry.name); }}
                          >
                            <span>{selected ? 'Default for new documents' : 'Make this the default'}</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <aside className="set-v2-specs-aside">
                  <div className="set-v2-specs-card">
                    <div className="set-v2-specs-head">
                      <div className="set-v2-specs-kicker">
                        <FileCheck size={14} />
                        <span>What it looks for</span>
                      </div>
                      <h4>{activeKind.name}</h4>
                    </div>

                    <div className="set-v2-specs-tree">
                      {sectionsFor(activeKind.key).length === 0 ? (
                        <p className="set-v2-field-note">
                          No template, so no heading is ever reported as missing. Wording,
                          figures and repetition are still checked.
                        </p>
                      ) : (
                        sectionsFor(activeKind.key).map(([sectionName, keywords]) => (
                          <div key={sectionName} className="set-v2-tree-node">
                            <div className="set-v2-node-title">
                              <span className="set-v2-node-bullet" />
                              <strong>{sectionName}</strong>
                            </div>
                            {/* These are the words a heading may use and still
                                count as this section — the engine's own list. */}
                            <div className="set-v2-node-sublist">
                              <div className="set-v2-subnode">
                                <span>↳</span> also accepts: {keywords.join(', ')}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="set-v2-specs-footer-callout">
                      <ShieldCheck size={16} className="set-v2-accent-gold" />
                      <p>
                        This list is read straight from the engine, so what you see here is
                        exactly what your draft is measured against.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {/* ========================================== TAB 3: CHECKS & STORAGE */}
          {activeTab === 'checks' && (
            <div className="set-v2-panel set-v2-fade-in">
              <div className="set-v2-diag-layout">
                <div className="set-v2-card-glass set-v2-mb-24">
                  <div className="set-v2-diag-head">
                    <div className="set-v2-diag-title-wrap">
                      <Database size={18} className="set-v2-accent-icon" />
                      <div>
                        <h4>Storage in this browser</h4>
                        <p>Your documents are here and nowhere else. This is what the browser says it is holding.</p>
                      </div>
                    </div>
                    <span className="set-v2-quota-pill">
                      {storage?.quota
                        ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} (${formatPercent(storage.percent)})`
                        : 'Measuring…'}
                    </span>
                  </div>

                  <div className="set-v2-meter-box">
                    <div className="set-v2-meter-track">
                      <div
                        className="set-v2-seg-snap"
                        style={{ width: `${Math.min(100, storage?.percent ?? 0)}%` }}
                        title={storage ? formatBytes(storage.usage) : ''}
                      />
                    </div>
                    <div className="set-v2-meter-legend">
                      <div className="set-v2-legend-item">
                        <span className="set-v2-dot set-v2-dot-blue" />
                        <span>Used by DocuMend{storage ? ` (${formatBytes(storage.usage)})` : ''}</span>
                      </div>
                      <div className="set-v2-legend-item">
                        <span className="set-v2-dot set-v2-dot-empty" />
                        <span>
                          Still free
                          {storage?.quota ? ` (${formatBytes(Math.max(0, storage.quota - storage.usage))})` : ''}
                        </span>
                      </div>
                    </div>
                    {storage?.nearlyFull && (
                      <p className="set-v2-field-note">
                        Nearly full. Old versions are the usual culprit — the Storage page can clear them.
                      </p>
                    )}
                  </div>
                </div>

                <div className="set-v2-card-glass">
                  <div className="set-v2-diag-head">
                    <div className="set-v2-diag-title-wrap">
                      <Cpu size={18} className="set-v2-accent-green" />
                      <div>
                        <h4>What the editor checks</h4>
                        <p>
                          Switch one off and the editor stops raising it. The engine runs on
                          this computer, so nothing you write is sent anywhere to be read.
                        </p>
                      </div>
                    </div>
                    <span className="set-v2-badge-verified">
                      <CheckCircle2 size={12} /> {CHECKS.length - mutedChecks.length} of {CHECKS.length} on
                    </span>
                  </div>

                  <div className="set-v2-rules-list">
                    {CHECKS.map((check) => {
                      const on = !mutedChecks.includes(check.id);
                      return (
                        <div key={check.id} className="set-v2-rule-card">
                          <div className="set-v2-rule-info">
                            <div className="set-v2-rule-title">
                              <strong>{check.title}</strong>
                              <span className={on ? 'set-v2-pill-on' : 'set-v2-pill-off'}>
                                {KIND_LABELS[check.kind]}
                              </span>
                            </div>
                            <p>{check.blurb}</p>
                          </div>
                          <label className="set-v2-switch">
                            <span className="dash-sr">{check.title}</span>
                            <input type="checkbox" checked={on} onChange={() => toggleCheck(check)} />
                            <span className="set-v2-slider" />
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="set-v2-validation-banner">
                    <ShieldCheck size={16} />
                    <span>
                      Every check runs inside this browser, in WebAssembly compiled from Rust.
                      No sentence of yours leaves the device to be analysed.
                    </span>
                  </div>
                </div>
              </div>
            </div>
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
        <div className="set-v2-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
