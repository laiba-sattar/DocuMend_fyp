/**
 * WorkspaceChrome — the shell shared by every signed-in page.
 *
 * The dashboard and My Documents pages wear the same frame: dark sidebar,
 * mobile top bar + drawer, the notifications/profile header, and the
 * name/logout dialog. This module owns that frame so the pages only ship
 * their own content; add a nav destination here once and every page gets it.
 *
 * Exports (components only — the nav data lives in workspace-nav.js so this
 * file stays compatible with Vite's fast refresh):
 *   Sidebar         — fixed desktop rail (collapsible)
 *   MobileTopbar    — sticky bar shown under 768px
 *   MobileDrawer    — slide-in nav for the top bar's menu button
 *   WorkspaceHeader — notification switch + profile chip
 *   WorkspaceModal  — one dialog for naming documents/folders and logout
 *
 * Styling lives in workspace-chrome.css (imported here, so any page using
 * these components gets the shell styles for free). Page-specific styles
 * stay in each page's own stylesheet.
 */
import { useState } from 'react';
import { useAuth } from './AuthContext';
import { navigate, usePathname } from '../router';
import './workspace-chrome.css';
import {
  Bell,
  BellOff,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { navPrimary, navWorkspace, workspaceRoutes } from './workspace-nav';

/**
 * Route → the name shown in the header. Built from the same nav table the
 * sidebar uses, so a destination added there is named here too; the extras
 * below are the pages that have no sidebar entry of their own.
 */
const PAGE_NAMES = {
  ...Object.fromEntries(Object.entries(workspaceRoutes).map(([label, route]) => [route, label])),
  '/documents': 'My documents',
  '/my-documents': 'My documents',
  '/create-document': 'New document',
  '/createdocument': 'New document',
  '/create-folder': 'New folder',
  '/createfolder': 'New folder',
  '/upload': 'Upload',
  '/upload-document': 'Upload',
  '/edit': 'Choose a document',
  '/select-document': 'Choose a document',
  '/version-history': 'Version history',
  '/set-password': 'Your password',
  '/help-and-guide': 'Help and guide',
  '/subscription': 'Subscription',
};

/* ==========================================================================
   Pieces
   ========================================================================== */

// Brand lockup. `compact` drops the wordmark for the collapsed sidebar.
// Kept as a named export so the Sidebar/MobileTopbar/MobileDrawer call sites
// stay unchanged; the logo itself now comes from the shared BrandMark.
export function LogoMark({ compact = false }) {
  return (
    <BrandMark
      size={36}
      wordmark={!compact}
      tagline="write with clarity"
      className="dash-logo"
    />
  );
}

/**
 * One sidebar row. Renders either a badge or a caller-supplied `trailing`
 * element (the privacy switch) on the right — never both.
 */
export function NavButton({ item, active, onClick, trailing, collapsed = false }) {
  const Icon = item.icon;
  const badge = item.badge ? <span className="dash-nav-badge">{item.badge}</span> : null;
  return (
    <button
      type="button"
      onClick={onClick}
      // When collapsed the label is gone, so it has to survive as a tooltip
      // and an accessible name.
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={`dash-nav-item ${active ? 'is-active' : ''}`}
    >
      <span><Icon size={15} strokeWidth={active ? 2.4 : 1.8} />{!collapsed && item.label}</span>
      {!collapsed && (trailing ?? badge)}
    </button>
  );
}

export function Sidebar({
  activeNav,
  onNavigate,
  privacyMode,
  onPrivacyToggle,
  darkMode,
  onThemeToggle,
  onLogout,
  collapsed,
  onToggleCollapse,
}) {
  return (
    <aside className={`dash-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="dash-sidebar-head">
        <LogoMark compact={collapsed} />
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="dash-collapse-btn"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="dash-nav" aria-label="Primary navigation">
        {!collapsed && <p className="dash-nav-label">Your workspace</p>}
        {navPrimary.map((item) => (
          <NavButton
            key={item.label}
            item={item}
            active={activeNav === item.label}
            onClick={() => onNavigate(item.label)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <nav className="dash-nav dash-nav-secondary" aria-label="Workspace settings">
        {navWorkspace.map((item) => {
          const isPrivacy = item.label === 'Privacy mode';
          return (
            <NavButton
              key={item.label}
              item={item}
              active={activeNav === item.label}
              onClick={() => (isPrivacy ? onPrivacyToggle() : onNavigate(item.label))}
              collapsed={collapsed}
              trailing={isPrivacy ? (
                <span
                  className={`dash-switch ${privacyMode ? 'is-on' : ''}`}
                  role="img"
                  aria-label={privacyMode ? 'Privacy mode on' : 'Privacy mode off'}
                />
              ) : undefined}
            />
          );
        })}
      </nav>

      <div className="dash-sidebar-foot">
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          title={collapsed ? (darkMode ? 'Light mode' : 'Dark mode') : undefined}
          className="dash-theme-btn"
        >
          <span>{darkMode ? <Moon size={15} /> : <Sun size={15} />}{!collapsed && (darkMode ? 'Dark mode' : 'Light mode')}</span>
          {!collapsed && <span className={`dash-switch ${darkMode ? 'is-on' : ''}`} />}
        </button>
        <button type="button" onClick={onLogout} className="dash-logout" title={collapsed ? 'Log out' : undefined}>
          <LogOut size={14} /> {!collapsed && 'Log out'}
        </button>
        {!collapsed && <p className="dash-sidebar-note">Private by default. Your words stay yours.</p>}
      </div>
    </aside>
  );
}

// Shown in place of the sidebar below 768px.
export function MobileTopbar({ onMenu, onThemeToggle, darkMode }) {
  return (
    <div className="dash-topbar">
      <button type="button" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <LogoMark />
      <button type="button" onClick={onThemeToggle} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
        {darkMode ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    </div>
  );
}

/**
 * Slide-in nav for small screens. The inner stopPropagation keeps clicks
 * inside the panel from reaching the backdrop's close handler.
 */
export function MobileDrawer({ open, onClose, activeNav, onNavigate, onPrivacyToggle, onLogout }) {
  if (!open) return null;
  return (
    <div className="dash-drawer" onMouseDown={onClose}>
      <div className="dash-drawer-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dash-drawer-head">
          <LogoMark />
          <button type="button" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="dash-nav" aria-label="Mobile navigation">
          {[...navPrimary, ...navWorkspace].map((item) => (
            <NavButton
              key={item.label}
              item={item}
              active={activeNav === item.label}
              onClick={() => (item.label === 'Privacy mode' ? onPrivacyToggle() : onNavigate(item.label))}
            />
          ))}
        </nav>
        <button type="button" onClick={onLogout} className="dash-logout">
          <LogOut size={14} /> Log out
        </button>
      </div>
    </div>
  );
}

/**
 * Top bar of the main column: the notification switch and the profile chip.
 *
 * Two things used to live here and no longer do.
 *
 * The "All changes saved" badge was painted on: it said the same thing whether
 * or not anything had been saved, and the editor already reports saving where
 * it actually matters.
 *
 * The "Search your workspace" box has gone too. My documents has its own
 * search, right above the documents it searches, which is where a reader looks
 * for it; a second box in the chrome only raised the question of which one
 * searched what. Pages may still pass `search` props — they are ignored.
 */
export function WorkspaceHeader({ onAnnounce }) {
  const pathname = usePathname();
  const here = PAGE_NAMES[pathname?.toLowerCase().replace(/\/$/, '')] ?? 'Workspace';

  return (
    <header className="dash-header dash-soft">
      {/* The left of the bar used to hold a search box, and before that a badge
          that always said the same thing. It now says where you are, which is
          the one thing a top bar is genuinely good at. */}
      <nav className="dash-header-where" aria-label="You are here">
        <button type="button" onClick={() => navigate('/dashboard')} className="dash-crumb-root">
          DocuMend
        </button>
        <ChevronRight size={13} aria-hidden="true" />
        <span className="dash-crumb-here" aria-current="page">{here}</span>
      </nav>

      <div className="dash-header-actions">
        <NotificationToggle onAnnounce={onAnnounce} />
        <span className="dash-divider" />
        <ProfileButton />
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------------
   The notification switch
   ------------------------------------------------------------------------- */

const NOTIFY_KEY = 'documend.notifications';

const readChoice = () => {
  try { return window.localStorage.getItem(NOTIFY_KEY) === 'on'; } catch { return false; }
};

/**
 * One button, two states: notifications on, notifications off.
 *
 * The bell used to be decorative — a click said "You are all caught up" and a
 * red dot sat there for ever. It is now a real switch over the browser's own
 * Notification permission.
 *
 * Two things a browser insists on, and this respects both:
 *   · permission can only be asked for from a real click, so the request
 *     happens here and nowhere else;
 *   · permission cannot be taken back by a page. So "off" is remembered by us
 *     instead — DocuMend stays quiet even though the browser would allow it.
 * If the reader has blocked notifications in their browser settings, the
 * button says so rather than pretending to switch on.
 */
function NotificationToggle({ onAnnounce }) {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [on, setOn] = useState(() => supported && readChoice() && Notification.permission === 'granted');

  const blocked = supported && Notification.permission === 'denied';

  const toggle = async () => {
    if (!supported) return onAnnounce('This browser cannot show notifications.');

    if (on) {
      try { window.localStorage.setItem(NOTIFY_KEY, 'off'); } catch { /* private window */ }
      setOn(false);
      return onAnnounce('Notifications are off. DocuMend will stay quiet.');
    }

    if (blocked) {
      return onAnnounce('Your browser is blocking notifications for this site. Allow them in the padlock menu beside the address bar.');
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

    if (permission !== 'granted') {
      return onAnnounce('Notifications stay off.');
    }
    try { window.localStorage.setItem(NOTIFY_KEY, 'on'); } catch { /* private window */ }
    setOn(true);
    onAnnounce('Notifications are on. DocuMend will tell you when a scan finishes.');
  };

  const label = on ? 'Turn notifications off' : 'Turn notifications on';

  return (
    <button
      type="button"
      onClick={toggle}
      className={`dash-icon-btn dash-bell ${on ? 'is-on' : ''}`}
      aria-label={label}
      aria-pressed={on}
      title={blocked ? 'Your browser is blocking notifications for this site' : label}
    >
      {on ? <Bell size={17} strokeWidth={1.8} /> : <BellOff size={17} strokeWidth={1.8} />}
      {on && <span className="dash-pip" />}
    </button>
  );
}

/**
 * The signed-in user in the header: their initials, their first name (S5).
 * Before anyone signs in it simply says "You", so the header never looks broken.
 */
function ProfileButton() {
  const { user } = useAuth();
  const name = user?.name?.trim() || 'You';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'Y';

  return (
    // It used to raise "Profile menu is ready" and open nothing at all. There
    // is no menu; there is a Settings page, and that is where a name and a
    // plan belong. So the chip goes there — and the arrow points right rather
    // than down, because a chevron pointing down promises a dropdown.
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className="dash-profile"
      title="Open your settings"
    >
      <span className="dash-avatar">{initials}</span>
      <span className="dash-profile-text">
        <span className="dash-profile-name">{name.split(/\s+/)[0]}</span>
        <span className="dash-profile-role">{user ? `${user.tier[0]}${user.tier.slice(1).toLowerCase()} plan` : 'Personal workspace'}</span>
      </span>
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  );
}

/**
 * One dialog serving three jobs, chosen by `mode`: naming a document, naming
 * a folder, or confirming logout. Returns null when closed.
 *
 * State is seeded once per mount: give this component a `key` derived from
 * the mode and the draft name, so reopening it for a different document
 * remounts it and re-seeds the field — no syncing effect needed.
 */
export function WorkspaceModal({ mode, initialValue, onClose, onSubmit, onLogout }) {
  const [value, setValue] = useState(initialValue);
  const { signOut } = useAuth();

  if (!mode) return null;

  const isLogout = mode === 'logout';
  const isFolder = mode === 'folder';
  const title = isLogout
    ? 'Take a quiet exit?'
    : isFolder
      ? 'Create a new folder'
      : initialValue ? 'Rename document' : 'Start a new document';

  const submit = (event) => {
    event.preventDefault();
    // Really sign out — the refresh token is revoked on the server too —
    // and then let the page do whatever it does next (usually go home).
    if (isLogout) signOut().finally(() => onLogout());
    else if (value.trim()) onSubmit(value.trim());
  };

  return (
    // Closes on backdrop click only -- the guard stops a drag that ends
    // outside the panel from dismissing it.
    <div
      className="dash-modal-backdrop"
      onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}
    >
      <div className="dash-modal" role="dialog" aria-modal="true" aria-labelledby="dash-modal-title">
        <div className="dash-modal-head">
          <div>
            <p className="dash-modal-kicker">{isLogout ? 'Session' : 'Workspace'}</p>
            <h2 id="dash-modal-title" className="dash-modal-title dash-serif">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="dash-modal-close" aria-label="Close dialog"><X size={17} /></button>
        </div>

        {isLogout ? (
          <form onSubmit={submit}>
            <p className="dash-modal-text">Your drafts are safely tucked away. You can return whenever the next sentence finds you.</p>
            <div className="dash-modal-actions">
              <button type="button" onClick={onClose} className="dash-btn-quiet">Stay here</button>
              <button type="submit" className="dash-btn-dark">Log out</button>
            </div>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label className="dash-modal-label" htmlFor="dash-modal-input">{isFolder ? 'Folder name' : 'Document name'}</label>
            <input
              id="dash-modal-input"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={isFolder ? 'e.g. Research & references' : 'e.g. The shape of an idea'}
              className="dash-modal-input"
            />
            <div className="dash-modal-actions">
              <button type="button" onClick={onClose} className="dash-btn-quiet">Cancel</button>
              <button type="submit" className="dash-btn-primary">
                {initialValue ? 'Save changes' : isFolder ? 'Create folder' : 'Create document'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
