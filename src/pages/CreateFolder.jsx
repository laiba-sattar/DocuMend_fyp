import { useMemo, useState } from 'react';
import './create-folder.css';
import {
  ArrowRight,
  Check,
  FolderOpen,
  FolderPlus,
  Info,
  ShieldCheck,
  Sparkles, 
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
import { useTheme } from '../components/theme';
import { navigate } from '../router';
import { useLiveQuery } from 'dexie-react-hooks';
import { createFolder as saveNewFolder, listFolderOptions, ROOT_FOLDER } from '../storage/folders';

const MAX_NAME = 48;

const COLORS = [
  { id: 'saffron', label: 'Saffron' },
  { id: 'sage', label: 'Sage' },
  { id: 'coral', label: 'Coral' },
  { id: 'lavender', label: 'Lavender' },
  { id: 'sky', label: 'Sky' },
  { id: 'gold', label: 'Gold' },
];

function nameFromUrl() {
  try {
    return (new URLSearchParams(window.location.search).get('name') ?? '').slice(0, MAX_NAME);
  } catch {
    return '';
  }
}

export default function CreateFolder() {
  const { darkMode, toggleDarkMode } = useTheme();

  const [activeNav, setActiveNav] = useState('My documents');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [chromeModal, setChromeModal] = useState(null);
  const [toast, setToast] = useState('');

  const [name, setName] = useState(nameFromUrl);
  const [color, setColor] = useState('gold');
  // "New folder" inside an open folder arrives here as ?parent=<id>.
  const [parent, setParent] = useState(
    () => new URLSearchParams(window.location.search).get('parent') || 'root',
  );

  // Real folders from IndexedDB, so a new folder can sit inside an existing one.
  const parentOptions = useLiveQuery(listFolderOptions, []) ?? [ROOT_FOLDER];
  const [created, setCreated] = useState(false);

  const swatch = useMemo(() => COLORS.find((c) => c.id === color) ?? COLORS[0], [color]);
  const parentLabel = parentOptions.find((p) => p.id === parent)?.name ?? 'Root level';
  const trimmedName = name.trim();

  const announce = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
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
    announce(`${label} view selected`);
    setMobileSidebar(false);
  };

  const createFolder = async () => {
    if (!trimmedName || created) return;
    try {
      await saveNewFolder({ name: trimmedName, color, parentId: parent });
      setCreated(true);
      announce(`Folder "${trimmedName}" created`);
    } catch (error) {
      console.error(error);
      announce('The folder could not be saved. Check that your browser allows site storage, then try again.');
    }
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
          onAnnounce={announce}
        />

        <div className="folder-page">
          <div className="folder-frame">
            <section className="folder-card">
              <span className="folder-bloom" aria-hidden="true" />

              <header className="folder-card-head">
                <span className="folder-head-icon"><FolderPlus size={20} /></span>
                <div className="folder-head-copy">
                  <p className="folder-eyebrow">Workspace · Step 1 of 1</p>
                  <h1>Create folder</h1>
                  <p className="folder-head-sub">
                    Organise your documents by creating a new folder.
                  </p>
                </div>
                <button
                  type="button"
                  className="folder-close"
                  aria-label="Close and return to the dashboard"
                  onClick={() => navigate('/dashboard')}
                >
                  <X size={17} />
                </button>
              </header>

              <div className="folder-card-body">
                {/* Folder Name */}
                <div className="folder-field">
                  <label className="folder-eyebrow" htmlFor="folder-name">Folder name</label>
                  <div className="folder-input">
                    <span className={`folder-dot dash-glyph-${color}`} aria-hidden="true" />
                    <input
                      id="folder-name"
                      value={name}
                      maxLength={MAX_NAME}
                      placeholder="e.g. PHP Research"
                      onChange={(event) => {
                        setName(event.target.value);
                        setCreated(false);
                      }}
                    />
                    <span className="folder-count">{name.length}/{MAX_NAME}</span>
                  </div>
                </div>

                {/* Color Tag */}
                <div className="folder-field">
                  <span className="folder-eyebrow">Colour tag</span>
                  <div className="folder-swatches">
                    {COLORS.map((option) => {
                      const active = option.id === color;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-label={option.label}
                          aria-pressed={active}
                          onClick={() => setColor(option.id)}
                          className={`folder-swatch dash-glyph-${option.id} ${active ? 'is-active' : ''}`}
                        >
                          {active && <Check size={15} strokeWidth={3} />}
                        </button>
                      );
                    })}
                    <span className="folder-swatch-name">{swatch.label}</span>
                  </div>
                </div>

                {/* Parent Folder */}
                <div className="folder-field">
                  <span className="folder-eyebrow">Nest inside existing folder (optional)</span>
                  <div className="folder-parents">
                    {parentOptions.map((option) => {
                      const active = option.id === parent;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setParent(option.id)}
                          className={`folder-parent ${active ? 'is-active' : ''}`}
                        >
                          <FolderOpen size={19} />
                          <span className="folder-parent-name">{option.name}</span>
                          <span className="folder-parent-meta">{option.meta}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Preview */}
                <div className="folder-preview">
                  <span className={`folder-dot dash-glyph-${color}`} aria-hidden="true" />
                  <p>
                    <span>Preview: </span>
                    {parentLabel} / {trimmedName || 'Untitled folder'}
                  </p>
                  <Info size={15} />
                </div>
              </div>

              <footer className="folder-card-foot">
                {created ? (
                  <button type="button" className="folder-primary" onClick={() => navigate('/documents')}>
                    <Check size={15} /> Folder created — open documents <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="folder-primary"
                    disabled={!trimmedName}
                    onClick={createFolder}
                  >
                    <FolderPlus size={15} /> Create folder
                  </button>
                )}

                <button
                  type="button"
                  className="folder-quiet"
                  onClick={() => navigate('/dashboard')}
                >
                  Cancel
                </button>

                <p className="folder-saved">
                  Saved locally <ShieldCheck size={15} />
                </p>
              </footer>
            </section>
          </div>

          <p className="folder-tip">
            <Sparkles size={14} />
            Tip: colour tags make folders instantly scannable in your workspace.
          </p>
        </div>
      </main>

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

      {toast && <div className="folder-toast">{toast}</div>}
    </div>
  );
}