import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  FileText,
  History,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  MobileDrawer,
  MobileTopbar,
  Sidebar,
  WorkspaceModal,
} from '../components/WorkspaceChrome';
import { workspaceRoutes } from '../components/workspace-nav';
import { useTheme } from '../components/theme';
import { navigate } from '../router';
import {
  formatBytes,
  formatPercent,
  getStorageReport,
  requestPersistentStorage,
  WARN_AT_PERCENT,
  wipeAllData,
} from '../storage/quota';
import { deleteOldAutoVersions } from '../storage/versions';
import { clockTime } from '../storage/format';
import { deleteNliModels, nliModelBytes } from '../engine/nliModelCache';
import './storage.css';

export default function Storage() {
  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // Workspace Chrome Shell States
  const [activeNav, setActiveNav] = useState('Storage');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  // Real numbers from IndexedDB and the browser's Storage API (src/storage/quota.js).
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [report, setReport] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  // S7 — bytes the on-device NLI model is using, read from Cache Storage
  // rather than the Dexie-based report above (see engine/nliModelCache.js).
  const [nliBytes, setNliBytes] = useState(0);
  const refreshNliBytes = () => { nliModelBytes().then(setNliBytes).catch(() => setNliBytes(0)); };
  useEffect(() => { refreshNliBytes(); }, []);

  const notify = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2700);
  };

  const runStorageDiagnostics = async () => {
    setIsRefreshing(true);
    try {
      setReport(await getStorageReport());
      setLastCheck(Date.now());
    } catch (error) {
      console.error(error);
      notify('Storage could not be measured in this browser.');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    runStorageDiagnostics();
  }, []);

  // Bar widths are a share of the browser quota; tiny non-zero parts stay visible.
  const share = (bytes) => {
    if (!report?.quota || !bytes) return 0;
    return Math.max(0.6, Math.min(100, (bytes / report.quota) * 100));
  };
  const usedPercentage = report?.percent ?? 0;
  const nearlyFull = usedPercentage >= WARN_AT_PERCENT;

  const handleProtect = async () => {
    const granted = await requestPersistentStorage();
    notify(granted
      ? 'Protected: the browser will not clear DocuMend data to free space.'
      : 'The browser declined for now. Chrome and Edge usually allow it once you use the app more often.');
    runStorageDiagnostics();
  };

  const handleRunAction = async (actionId) => {
    setConfirmAction(null);
    try {
      if (actionId === 'cache') {
        const removed = await deleteOldAutoVersions(30 * 24 * 60 * 60 * 1000);
        notify(removed
          ? `${removed} old auto-saved ${removed === 1 ? 'version' : 'versions'} removed. Named snapshots were kept.`
          : 'Nothing to clear: there are no auto-saved versions older than 30 days.');
        runStorageDiagnostics();
      } else if (actionId === 'wipe') {
        await wipeAllData();
        notify('All local data deleted.');
        window.setTimeout(() => window.location.reload(), 800);
      } else if (actionId === 'nli-model') {
        await deleteNliModels();
        notify('The on-device meaning model has been removed. It downloads again next time it is turned on.');
        refreshNliBytes();
      }
    } catch (error) {
      console.error(error);
      notify('That did not work. Close other DocuMend tabs and try again.');
    }
  };

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Storage') {
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
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    if (label !== 'Storage') notify(`${label} view selected`);
    setMobileSidebar(false);
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

      <main className={`dash-main stor-main-area ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <div className="stor-ambient-glow stor-glow-1" aria-hidden="true" />
        <div className="stor-ambient-glow stor-glow-2" aria-hidden="true" />

        <div className="stor-container">
          {/* Top Page Banner */}
          <header className="stor-header-bar">
            <div>
              <div className="stor-pill-tag">
                <Database size={13} />
                <span>IndexedDB Persistent Storage</span>
              </div>
              <h1>IndexedDB Local Storage & Memory Vault</h1>
              <p>
                Manage client-side browser quotas, offline vector embeddings, and zero-knowledge encrypted blobs.
              </p>
            </div>

            <div className="stor-header-actions">
              <button
                type="button"
                className="stor-action-capsule-btn"
                onClick={() => navigate('/create-document')}
                title="Create a new document"
              >
                <Plus size={15} />
                <span>New Document</span>
              </button>

              <button
                type="button"
                className={`stor-refresh-btn ${isRefreshing ? 'is-rotating' : ''}`}
                onClick={runStorageDiagnostics}
                title="Refresh Storage Footprint"
              >
                <RefreshCw size={15} />
                <span>{isRefreshing ? 'Scanning...' : 'Refresh Vault'}</span>
              </button>
            </div>
          </header>

          {/* 1. Primary Dynamic Multi-Color Storage Meter Card */}
          <section className="stor-glass-card stor-meter-card" aria-label="Storage Usage Overview">
            <div className="stor-meter-top">
              <div className="stor-used-headline">
                <span className="stor-pct-number">{formatPercent(usedPercentage)}</span>
                <div className="stor-used-text">
                  <strong>used — {formatBytes(report?.usage)} of {report?.quota ? formatBytes(report.quota) : 'unknown'}</strong>
                  <small>Space this browser allows DocuMend on this device</small>
                </div>
              </div>

              <div className={`stor-status-badge ${nearlyFull ? 'is-warning' : 'is-healthy'}`}>
                <span className="stor-pulsing-dot" />
                <span>{nearlyFull ? 'Almost full: clear old versions below' : 'Plenty of space'}</span>
              </div>
            </div>

            {/* Segmented Dynamic Track */}
            <div className="stor-dynamic-track">
              <div
                className="stor-track-seg stor-seg-green"
                style={{ width: `${isRefreshing ? 0 : share(report?.documentsBytes)}%` }}
                title={`Documents: ${formatBytes(report?.documentsBytes)}`}
              />
              <div
                className="stor-track-seg stor-seg-gold"
                style={{ width: `${isRefreshing ? 0 : share(report?.versionsBytes)}%` }}
                title={`Versions: ${formatBytes(report?.versionsBytes)}`}
              />
              <div
                className="stor-track-seg stor-seg-blue"
                style={{ width: `${isRefreshing ? 0 : share(report?.otherBytes)}%` }}
                title={`Other app data: ${formatBytes(report?.otherBytes)}`}
              />
            </div>

            {/* Legend Labels with Values */}
            <div className="stor-legend-row">
              <div className="stor-legend-chip">
                <span className="stor-legend-dot stor-dot-green" />
                <span>Documents ({formatBytes(report?.documentsBytes)})</span>
              </div>
              <div className="stor-legend-chip">
                <span className="stor-legend-dot stor-dot-gold" />
                <span>Versions ({formatBytes(report?.versionsBytes)})</span>
              </div>
              <div className="stor-legend-chip">
                <span className="stor-legend-dot stor-dot-blue" />
                <span>Other app data ({formatBytes(report?.otherBytes)})</span>
              </div>
            </div>
          </section>

          {/* 2. Top-Level Metric Stats Grid */}
          <section className="stor-metrics-grid" aria-label="Storage Metrics">
            <div className="stor-stat-box" onClick={() => navigate('/documents')} style={{ cursor: 'pointer' }}>
              <div className="stor-stat-icon stor-icon-green">
                <FileText size={18} />
              </div>
              <strong className="stor-stat-value">{report?.documentCount ?? '–'}</strong>
              <span className="stor-stat-label">Documents Stored</span>
              <small>Open My documents</small>
            </div>

            <div className="stor-stat-box" onClick={() => navigate('/version')} style={{ cursor: 'pointer' }}>
              <div className="stor-stat-icon stor-icon-gold">
                <History size={18} />
              </div>
              <strong className="stor-stat-value">{report?.versionCount ?? '–'}</strong>
              <span className="stor-stat-label">Version Snapshots</span>
              <small>Open Version history</small>
            </div>

            <div className="stor-stat-box">
              <div className="stor-stat-icon stor-icon-blue">
                <Lock size={18} />
              </div>
              <strong className="stor-stat-value">Soon</strong>
              <span className="stor-stat-label">Encrypted on Disk</span>
              <small>AES-256 arrives with the encryption layer (S3)</small>
            </div>

            <div className="stor-stat-box" onClick={report?.persisted ? undefined : handleProtect} style={{ cursor: report?.persisted ? 'default' : 'pointer' }}>
              <div className="stor-stat-icon stor-icon-teal">
                <Cloud size={18} />
              </div>
              <strong className="stor-stat-value">{report?.persisted ? 'Protected' : 'Not yet'}</strong>
              <span className="stor-stat-label">Kept when disk is low</span>
              <small>{report?.persisted ? `Last check ${lastCheck ? clockTime(lastCheck) : '–'}` : 'Click to ask the browser to keep your data'}</small>
            </div>
          </section>

          {/* 3. Deep Breakdown Cards Grid */}
          <section className="stor-breakdown-grid" aria-label="Component Storage Breakdown">
            <div className="stor-breakdown-card">
              <div className="stor-bd-header">
                <div className="stor-bd-title">
                  <FileText size={16} className="stor-color-green" />
                  <h4>Documents</h4>
                </div>
                <span className="stor-bd-size">{formatBytes(report?.documentsBytes)}</span>
              </div>
              <p>The text of every document, saved on this device.</p>
              <div className="stor-bd-mini-bar">
                <div className="stor-bd-fill stor-bg-green" style={{ width: `${report?.usage ? Math.min(100, (report.documentsBytes / report.usage) * 100) : 0}%` }} />
              </div>
              <span className="stor-bd-meta">{report?.documentCount ?? 0} documents · share of space DocuMend uses</span>
            </div>

            <div className="stor-breakdown-card">
              <div className="stor-bd-header">
                <div className="stor-bd-title">
                  <History size={16} className="stor-color-gold" />
                  <h4>Version Cache</h4>
                </div>
                <span className="stor-bd-size">{formatBytes(report?.versionsBytes)}</span>
              </div>
              <p>Full copies kept by auto-save and your named snapshots.</p>
              <div className="stor-bd-mini-bar">
                <div className="stor-bd-fill stor-bg-gold" style={{ width: `${report?.usage ? Math.min(100, (report.versionsBytes / report.usage) * 100) : 0}%` }} />
              </div>
              <span className="stor-bd-meta">{report?.autoVersionCount ?? 0} auto-saved · {(report?.versionCount ?? 0) - (report?.autoVersionCount ?? 0)} named</span>
            </div>

            <div className="stor-breakdown-card">
              <div className="stor-bd-header">
                <div className="stor-bd-title">
                  <Cpu size={16} className="stor-color-purple" />
                  <h4>On-device meaning model</h4>
                </div>
                <span className="stor-bd-size">{formatBytes(nliBytes)}</span>
              </div>
              <p>The small language model ODIE uses to catch contradictions that don&rsquo;t share any words.</p>
              <div className="stor-bd-mini-bar">
                <div className="stor-bd-fill stor-bg-purple" style={{ width: `${report?.usage ? Math.min(100, (nliBytes / report.usage) * 100) : 0}%` }} />
              </div>
              <span className="stor-bd-meta">
                {nliBytes ? 'Downloaded — turn it off in Settings to stop it running.' : 'Not downloaded — turned on from Settings → Checks (S7).'}
              </span>
            </div>
          </section>

          {/* 4. Storage Maintenance & Action Table */}
          <section className="stor-glass-card stor-management-section" aria-label="Storage Management Utilities">
            <div className="stor-mgmt-header">
              <div>
                <h3>Storage Management & Vault Operations</h3>
                <p>Purge stale version checkpoints or wipe cached browser data safely.</p>
              </div>
            </div>

            <div className="stor-table-container">
              <table className="stor-action-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Frees Up</th>
                    <th>Risk Level</th>
                    <th className="stor-th-action">Execute</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div className="stor-action-cell">
                        <strong>Clear old version cache (&gt; 30 days)</strong>
                        <span>Removes expired intermediate auto-saves while preserving named checkpoints</span>
                      </div>
                    </td>
                    <td>
                      <span className="stor-frees-tag">named snapshots kept</span>
                    </td>
                    <td>
                      <span className="stor-risk-pill stor-risk-safe">
                        <CheckCircle2 size={12} /> Safe
                      </span>
                    </td>
                    <td className="stor-td-action">
                      <button
                        type="button"
                        className="stor-run-action-btn stor-btn-green"
                        onClick={() => handleRunAction('cache')}
                      >
                        Run
                      </button>
                    </td>
                  </tr>

                  {nliBytes > 0 && (
                    <tr>
                      <td>
                        <div className="stor-action-cell">
                          <strong>Delete the on-device meaning model</strong>
                          <span>Frees the model&rsquo;s storage; it downloads again if turned back on in Settings</span>
                        </div>
                      </td>
                      <td>
                        <span className="stor-frees-tag">{formatBytes(nliBytes)}</span>
                      </td>
                      <td>
                        <span className="stor-risk-pill stor-risk-safe">
                          <CheckCircle2 size={12} /> Safe
                        </span>
                      </td>
                      <td className="stor-td-action">
                        <button
                          type="button"
                          className="stor-run-action-btn stor-btn-green"
                          onClick={() => handleRunAction('nli-model')}
                        >
                          Run
                        </button>
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td>
                      <div className="stor-action-cell">
                        <strong>Wipe all data (Full reset)</strong>
                        <span>Purges all documents, encryption keys, and IndexedDB snapshots permanently</span>
                      </div>
                    </td>
                    <td>
                      <span className="stor-frees-tag stor-frees-danger">{formatBytes(report?.usage)}</span>
                    </td>
                    <td>
                      <span className="stor-risk-pill stor-risk-danger">
                        <AlertOctagon size={12} /> Permanent
                      </span>
                    </td>
                    <td className="stor-td-action">
                      <button
                        type="button"
                        className="stor-run-action-btn stor-btn-danger"
                        onClick={() => setConfirmAction('wipe')}
                      >
                        Wipe
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Confirmation Dialog Modal */}
      {confirmAction === 'wipe' && (
        <div className="stor-modal-backdrop" role="presentation">
          <div className="stor-confirm-dialog" role="dialog" aria-modal="true">
            <div className="stor-dialog-head">
              <div className="stor-dialog-icon-danger">
                <AlertOctagon size={24} />
              </div>
              <div>
                <h3>Wipe entire local IndexedDB vault?</h3>
                <p>
                  This action will permanently erase all <strong>{report?.documentCount ?? 0} documents</strong> and 
                  their snapshot histories from this browser. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="stor-dialog-actions">
              <button
                type="button"
                className="stor-btn-quiet"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="stor-btn-danger-confirm"
                onClick={() => handleRunAction('wipe')}
              >
                Yes, Wipe Everything
              </button>
            </div>
          </div>
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

      {/* Dynamic Toast Feedback */}
      {toast && (
        <div className="stor-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}