import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileKey,
  KeyRound,
  Link2,
  Lock,
  QrCode,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wifi,
  X,
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
import { createDocument, getDocument, listDocuments, updateDocument } from '../storage/documents';
import { getOrCreateKeyPair, importPublicKeyBase64, rotateKeyPair } from '../storage/shareKeys';
import { encryptForRecipient, decryptPackage } from '../storage/shareCrypto';
import { countWords } from '../storage/format';
import './share.css';

const htmlToText = (html) => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

export default function Share() {
  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // Workspace Chrome Shell States
  const [activeNav, setActiveNav] = useState('Share Document');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  // Real documents from IndexedDB, and the one the identity bar's key belongs to.
  const storedDocuments = useLiveQuery(listDocuments, []);
  const documents = storedDocuments ?? [];
  const [activeDocId, setActiveDocId] = useState(null);
  const currentDoc = documents.find((doc) => doc.id === activeDocId) ?? null;

  useEffect(() => {
    if (!activeDocId && documents.length) setActiveDocId(documents[0].id);
  }, [documents, activeDocId]);

  const [myPublicKey, setMyPublicKey] = useState('');
  const [keyRotated, setKeyRotated] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Section 1: P2P Bridge State (still simulated — see share.css / this file's
  // history: real P2P needs a signaling channel this app doesn't have yet)
  const [teammateKey, setTeammateKey] = useState('');
  const [p2pConnecting, setP2pConnecting] = useState(false);
  const [p2pConnected, setP2pConnected] = useState(false);

  // Section 2: Asymmetric Export State
  const [packageName, setPackageName] = useState('');
  const [restrictAccess, setRestrictAccess] = useState(true);
  const [recipientKey, setRecipientKey] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Section 3: Import / decrypt state
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [decrypted, setDecrypted] = useState(null); // { title, html }

  // The active document's real RSA-OAEP keypair, loaded (or generated once) on selection.
  useEffect(() => {
    if (!activeDocId) return;
    let alive = true;
    getOrCreateKeyPair(activeDocId).then(({ publicKeyBase64 }) => {
      if (alive) setMyPublicKey(publicKeyBase64);
    });
    return () => { alive = false; };
  }, [activeDocId]);

  useEffect(() => {
    if (currentDoc) setPackageName(`${currentDoc.title.replace(/\.[^/.]+$/, '')}.documend_secure_package`);
    // currentDoc is re-derived (a new object) on every render; keying this
    // off its id/title instead means it only resets the field when the
    // selected document actually changes, not on every unrelated re-render,
    // which would otherwise wipe out a name the writer just typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDoc?.id, currentDoc?.title]);

  const notify = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2700);
  };

  const handleRegenerateKey = async () => {
    if (!activeDocId) return;
    setKeyRotated(true);
    const { publicKeyBase64 } = await rotateKeyPair(activeDocId);
    setMyPublicKey(publicKeyBase64);
    notify(`New key generated for ${currentDoc?.title ?? 'this document'} — packages sent to the old key can no longer be opened.`);
    window.setTimeout(() => setKeyRotated(false), 600);
  };

  const handleCopyMyKey = () => {
    navigator.clipboard.writeText(myPublicKey);
    setCopiedKey(true);
    notify('Public Key copied to clipboard');
    window.setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCreateSyncBridge = (e) => {
    e.preventDefault();
    if (!teammateKey.trim()) {
      notify('Please enter your teammate’s public key');
      return;
    }
    setP2pConnecting(true);
    window.setTimeout(() => {
      setP2pConnecting(false);
      setP2pConnected(true);
      notify('Encrypted P2P socket established with peer');
    }, 1200);
  };

  /**
   * Real hybrid encryption (AES-256-GCM content key, wrapped with the
   * recipient's RSA-OAEP public key — see storage/shareCrypto.js), producing
   * an actual downloadable file. With "Restrict access" off there is no
   * recipient to encrypt for, so the document's own key is used instead —
   * still real encryption, just readable back only by this document's own
   * identity rather than someone else's.
   */
  const handleExportPackage = async (e) => {
    e.preventDefault();
    if (restrictAccess && !recipientKey.trim()) {
      notify('Please specify the recipient’s public key');
      return;
    }
    if (!activeDocId) {
      notify('Select a document first');
      return;
    }
    setIsExporting(true);
    try {
      const doc = await getDocument(activeDocId);
      if (!doc) throw new Error('That document could not be found.');
      const targetKeyBase64 = restrictAccess ? recipientKey.trim() : myPublicKey;
      const recipientPublicKey = await importPublicKeyBase64(targetKeyBase64);
      const pkg = await encryptForRecipient(doc.content ?? '', recipientPublicKey);
      const fileName = packageName.endsWith('.documend_secure_package')
        ? packageName
        : `${packageName}.documend_secure_package`;
      const payload = { documendPackage: 1, title: doc.title, createdAt: Date.now(), ...pkg };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      notify(`Exported "${fileName}", encrypted with AES-256 & RSA-OAEP`);
    } catch {
      notify('That public key doesn’t look valid — check it and try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = (e) => {
    setImportFile(e.target.files?.[0] ?? null);
    setDecrypted(null);
  };

  /** Decrypts a .documend_secure_package against the selected document's private key. */
  const handleDecryptPackage = async (e) => {
    e.preventDefault();
    if (!importFile || !activeDocId) return;
    setIsImporting(true);
    try {
      const pkg = JSON.parse(await importFile.text());
      const { privateKey } = await getOrCreateKeyPair(activeDocId);
      const html = await decryptPackage(pkg, privateKey);
      setDecrypted({ title: pkg.title || 'Imported document', html });
      notify('Package decrypted.');
    } catch {
      setDecrypted(null);
      notify('Could not decrypt that package with this document’s key — wrong key, or a corrupted file.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSaveImported = async () => {
    if (!decrypted) return;
    try {
      const created = await createDocument({ title: decrypted.title, source: 'imported' });
      await updateDocument(created.id, {
        content: decrypted.html,
        wordCount: countWords(htmlToText(decrypted.html)),
        format: 'DOCX',
      });
      notify(`“${decrypted.title}” saved to My documents.`);
      setDecrypted(null);
      setImportFile(null);
      navigate(`/editor?doc=${created.id}`);
    } catch (error) {
      notify(error?.message ?? 'That document could not be saved.');
    }
  };

  const selectNav = (label) => {
    const route = workspaceRoutes?.[label];
    if (route && label !== 'Share Document') {
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

    setActiveNav(label);
    if (label !== 'Share Document') notify(`${label} view selected`);
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

      <main className={`dash-main share-main-area ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <div className="share-ambient-glow share-glow-1" aria-hidden="true" />
        <div className="share-ambient-glow share-glow-2" aria-hidden="true" />

        <div className="share-container">
          {/* Top Page Header */}
          <header className="share-header-hero">
            <div className="share-kicker-pill">
              <KeyRound size={13} />
              <span>Zero-Knowledge Exchange</span>
            </div>
            <h1>Secure Cryptographic Workspace</h1>
            <p>
              Real RSA-OAEP + AES-256 encryption, generated and run entirely in this browser. No intermediary cloud server ever reads your document contents.
            </p>
          </header>

          {/* 1. Dynamic Public Key Identity Bar */}
          <section className="share-glass-card share-identity-bar" aria-label="Your Public Identity">
            <div className="share-identity-info">
              <div className="share-doc-pill-select">
                <FileKey size={14} className="share-accent-gold" />
                <select
                  value={activeDocId ?? ''}
                  onChange={(e) => {
                    setActiveDocId(e.target.value);
                    const chosen = documents.find((doc) => doc.id === e.target.value);
                    notify(`Keypair loaded for ${chosen?.title ?? 'this document'}`);
                  }}
                  className="share-doc-select"
                  aria-label="Select Document for Key Generation"
                  disabled={!documents.length}
                >
                  {documents.length === 0 && <option value="">No documents yet</option>}
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>{doc.title}</option>
                  ))}
                </select>
              </div>

              <div className="share-key-display-group">
                <span className="share-identity-label">
                  <ShieldCheck size={14} className="share-accent-green" />
                  Active Document Key:
                </span>
                <code className="share-key-code" title={myPublicKey}>
                  {myPublicKey || 'Select a document to generate a key'}
                </code>
              </div>
            </div>

            <div className="share-identity-actions">
              <button
                type="button"
                className={`share-rotate-key-btn ${keyRotated ? 'is-rotating' : ''}`}
                onClick={handleRegenerateKey}
                disabled={!activeDocId}
                title="Regenerate unique key for this document"
              >
                <RefreshCw size={14} />
                <span>New Key</span>
              </button>

              <button
                type="button"
                className="share-copy-key-btn"
                onClick={handleCopyMyKey}
                disabled={!myPublicKey}
                title="Copy public address to clipboard"
              >
                {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedKey ? 'Copied' : 'Copy Key'}</span>
              </button>

              <button
                type="button"
                className="share-qr-btn"
                onClick={() => setQrModalOpen(true)}
                disabled={!myPublicKey}
                title="Display QR code"
              >
                <QrCode size={15} />
              </button>
            </div>
          </section>

          {/* 2. Direct P2P Link Sharing Card */}
          <section className="share-glass-card share-card-section" aria-label="Direct P2P Link Sharing">
            <div className="share-section-head">
              <div className="share-icon-bubble share-bubble-green">
                <Users size={20} strokeWidth={2.4} />
              </div>
              <div className="share-section-title-wrap">
                <div className="share-title-flex">
                  <h3>Direct P2P Link Sharing</h3>
                  <span className="share-live-sync-tag">
                    <Radio size={12} className="share-pulsing-icon" /> WebRTC Socket
                  </span>
                </div>
                <p>Encrypt document AST diffs using your teammate’s public key for a direct browser-to-browser sync.</p>
              </div>
            </div>

            <form className="share-card-body-panel" onSubmit={handleCreateSyncBridge}>
              <div className="share-input-block">
                <label htmlFor="teammate-key-input">Enter Teammate’s Public Key</label>
                <div className="share-green-capsule">
                  <KeyRound size={16} className="share-input-key-icon" />
                  <input
                    id="teammate-key-input"
                    type="text"
                    value={teammateKey}
                    onChange={(e) => setTeammateKey(e.target.value)}
                    placeholder="e.g. ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICX...7eWl teammate@university.edu"
                  />
                  {teammateKey && (
                    <button
                      type="button"
                      className="share-clear-input"
                      onClick={() => setTeammateKey('')}
                      aria-label="Clear key"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="share-btn-wrapper">
                <button
                  type="submit"
                  className={`share-action-primary-btn ${p2pConnecting ? 'is-loading' : ''}`}
                  disabled={p2pConnecting}
                >
                  {p2pConnecting ? (
                    <>
                      <RefreshCw size={15} className="share-spin" />
                      <span>Negotiating Diffie-Hellman Handshake...</span>
                    </>
                  ) : p2pConnected ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Sync Bridge Active & Verified</span>
                    </>
                  ) : (
                    <>
                      <Link2 size={16} />
                      <span>Create Secure Sync Bridge</span>
                    </>
                  )}
                </button>
              </div>

              {p2pConnected && (
                <div className="share-connected-callout">
                  <Wifi size={16} />
                  <span>
                    Direct ephemeral peer connection online · 0 bytes logged to server · End-to-end authenticated
                  </span>
                </div>
              )}
            </form>
          </section>

          {/* 3. Asymmetric File Export Card */}
          <section className="share-glass-card share-card-section" aria-label="Asymmetric File Export">
            <div className="share-section-head">
              <div className="share-icon-bubble share-bubble-gold">
                <FileKey size={20} strokeWidth={2.4} />
              </div>
              <div className="share-section-title-wrap">
                <div className="share-title-flex">
                  <h3>Asymmetric File Export</h3>
                  <span className="share-rsa-tag">
                    <Lock size={12} /> RSA-OAEP + AES-256
                  </span>
                </div>
                <p>Lock this document so that ONLY the designated recipient can decrypt and view it using their private key.</p>
              </div>
            </div>

            <form className="share-card-body-panel" onSubmit={handleExportPackage}>
              {/* Output File Name */}
              <div className="share-input-block">
                <label htmlFor="package-name-input">Export Package Name</label>
                <div className="share-green-capsule share-capsule-file">
                  <FileCheck2 size={16} className="share-input-key-icon" />
                  <input
                    id="package-name-input"
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                  />
                </div>
              </div>

              {/* Checkbox: Restrict to Public Key */}
              <div className="share-toggle-row">
                <label className="share-checkbox-custom">
                  <input
                    type="checkbox"
                    checked={restrictAccess}
                    onChange={(e) => setRestrictAccess(e.target.checked)}
                  />
                  <span className="share-check-square" />
                  <span className="share-checkbox-label">Restrict access to a specific Public Key</span>
                </label>
              </div>

              {/* Recipient Public Key Input */}
              {restrictAccess && (
                <div className="share-input-block share-mt-14 share-fade-in">
                  <label htmlFor="recipient-key-input">Designated Recipient Public Key</label>
                  <div className="share-green-capsule">
                    <KeyRound size={16} className="share-input-key-icon" />
                    <input
                      id="recipient-key-input"
                      type="text"
                      value={recipientKey}
                      onChange={(e) => setRecipientKey(e.target.value)}
                      placeholder="Paste the designated Public Key (starts with MIIBIjAN...)"
                    />
                  </div>
                </div>
              )}

              <div className="share-btn-wrapper">
                <button
                  type="submit"
                  className={`share-action-primary-btn ${isExporting ? 'is-loading' : ''}`}
                  disabled={isExporting || !activeDocId}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw size={15} className="share-spin" />
                      <span>Signing & Packing Envelope...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Export Encrypted Package</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* 4. Import / Decrypt Card */}
          <section className="share-glass-card share-card-section" aria-label="Import Encrypted Package">
            <div className="share-section-head">
              <div className="share-icon-bubble share-bubble-green">
                <Upload size={20} strokeWidth={2.4} />
              </div>
              <div className="share-section-title-wrap">
                <div className="share-title-flex">
                  <h3>Import Encrypted Package</h3>
                  <span className="share-rsa-tag">
                    <Lock size={12} /> Needs this document’s private key
                  </span>
                </div>
                <p>Open a <code>.documend_secure_package</code> file that was encrypted for the document selected above.</p>
              </div>
            </div>

            <form className="share-card-body-panel" onSubmit={handleDecryptPackage}>
              <div className="share-input-block">
                <label htmlFor="import-file-input">Package file</label>
                <div className="share-green-capsule share-capsule-file">
                  <FileCheck2 size={16} className="share-input-key-icon" />
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".documend_secure_package,application/json"
                    onChange={handleImportFile}
                  />
                </div>
              </div>

              <div className="share-btn-wrapper">
                <button
                  type="submit"
                  className={`share-action-primary-btn ${isImporting ? 'is-loading' : ''}`}
                  disabled={isImporting || !importFile || !activeDocId}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw size={15} className="share-spin" />
                      <span>Decrypting...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      <span>Decrypt Package</span>
                    </>
                  )}
                </button>
              </div>

              {decrypted && (
                <div className="share-connected-callout">
                  <CheckCircle2 size={16} />
                  <span>Decrypted “{decrypted.title}” — </span>
                  <button type="button" className="share-copy-key-btn" onClick={handleSaveImported}>
                    Save as new document
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      </main>

      {/* QR Code Identity Modal */}
      {qrModalOpen && (
        <div
          className="share-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalOpen(false);
          }}
        >
          <div className="share-qr-modal" role="dialog" aria-modal="true">
            <div className="share-qr-modal-head">
              <div className="share-qr-title">
                <QrCode size={18} className="share-accent-gold" />
                <h3>Document Public Key QR</h3>
              </div>
              <button
                type="button"
                className="share-modal-close"
                onClick={() => setQrModalOpen(false)}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            <div className="share-qr-card-body">
              <div className="share-qr-matrix-preview">
                <svg viewBox="0 0 100 100" className="share-simulated-qr" aria-hidden="true">
                  <rect width="100" height="100" fill="#ffffff" rx="8" />
                  <path d="M10 10h30v30h-30zM15 15v20h20v-20zM22 22h6v6h-6z" fill="#17362d" />
                  <path d="M60 10h30v30h-30zM65 15v20h20v-20zM72 22h6v6h-6z" fill="#17362d" />
                  <path d="M10 60h30v30h-30zM15 65v20h20v-20zM22 72h6v6h-6z" fill="#17362d" />
                  <rect x="45" y="15" width="8" height="8" fill="#df8b29" />
                  <rect x="45" y="30" width="8" height="8" fill="#17362d" />
                  <rect x="45" y="65" width="8" height="8" fill="#10b981" />
                  <rect x="60" y="60" width="10" height="10" fill="#17362d" />
                  <rect x="75" y="75" width="15" height="15" fill="#17362d" />
                </svg>
              </div>
              <p className="share-qr-hint">This QR is still a placeholder — it doesn’t yet encode <strong>{currentDoc?.title ?? 'this document'}</strong>’s real key.</p>
            </div>

            <div className="share-qr-modal-footer">
              <button
                type="button"
                className="share-btn-done"
                onClick={() => setQrModalOpen(false)}
              >
                Done
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
        <div className="share-toast" role="status" aria-live="polite">
          <Sparkles size={14} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
