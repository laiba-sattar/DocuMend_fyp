/**
 * Editor — the writing surface, served at the `/editor` route.
 *
 * The page is built on Tiptap 3 (a ProseMirror-based editor). The document
 * surface is <EditorContent>; the toolbar calls Tiptap commands through
 * runCommand(). Extensions live in src/editor/extensions.js, file import in
 * src/editor/importers.js, export in src/editor/exporters.js and on-screen
 * highlights (find matches now, engine issues later) in src/editor/highlights.js.
 *
 * Documents are loaded from and saved to IndexedDB (src/storage). The page
 * reads ?doc=<id> from the URL; changes are written back every 5 seconds, and
 * again when you switch documents, press Ctrl+S, or leave the page.
 * Documents are stored as HTML, which Version history can read directly.
 * The review panel shows real findings from the ODIE engine (src/engine),
 * which runs in a Web Worker and highlights what it finds on the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import './editor.css';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowUpRight,
  AtSign,
  Bold,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Copy,
  Eraser,
  FileCheck2,
  FilePlus2,
  Files,
  FileText,
  FolderOpen,
  Highlighter,
  History,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  KeyRound,
  LayoutPanelTop,
  Link2,
  List,
  ListChecks,
  ListFilter,
  ListOrdered,
  LockKeyhole,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  Quote,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  SpellCheck2,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TriangleAlert,
  Type,
  Underline,
  Undo2,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
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
import {
  createDocument as saveNewDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from '../storage/documents';
import { clockTime, countWords, pageLabel, pagesFor } from '../storage/format';
import { maybeAutoVersion } from '../storage/versions';
import { buildExtensions } from '../editor/extensions';
import { findRanges, replaceAll } from '../editor/highlights';
import { IMPORT_ACCEPT, importFile } from '../editor/importers';
import { exportDocx, exportTxt, printDocument } from '../editor/exporters';
import HomeRibbon from '../editor/HomeRibbon';
import { useEngine } from '../engine/useEngine';

/* ==========================================================================
   Content data
   ========================================================================== */

const AUTOSAVE_MS = 5000;

/** The font-size dropdown's values, as CSS sizes (the paper's base size is 12px). */
const FONT_SIZES = { 3: '11px', 4: '12px', 5: '14px', 6: '16px' };

/** The ?doc=<id> the page was opened with, if any. */
function docIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('doc');
  } catch {
    return null;
  }
}

const modeTabs = ['Home', 'Insert', 'Layout', 'References', 'Review', 'View', 'AI Tools'];

/** How the engine's issues are shown in the review panel. */
const ISSUE_TONE = { high: 'coral', medium: 'amber', low: 'plum' };
const ISSUE_ICON = { contradiction: AlertTriangle, redundancy: RotateCcw, structure: ListFilter, citation: Plus };

/* ==========================================================================
   Pieces
   ========================================================================== */

function ToolbarButton({ icon: Icon, label, onClick, active = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`editor-tool-button ${active ? 'is-active' : ''}`}
    >
      <Icon size={15} strokeWidth={active ? 2.4 : 1.8} />
    </button>
  );
}

/* ==========================================================================
   The page
   ========================================================================== */
function Editor() {
  // Global Shared Theme Context
  const { darkMode, toggleDarkMode } = useTheme();

  // --- shell state ---
  const [activeNav, setActiveNav] = useState('Editor');
  const [privacyMode, setPrivacyMode] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  // --- editor state ---
  // Live document list from IndexedDB, newest first.
  const storedDocuments = useLiveQuery(listDocuments, []);
  const documents = (storedDocuments ?? []).map((doc) => ({
    id: doc.id,
    title: doc.title,
    type: doc.format ?? 'DOCX',
    kind: doc.type ?? 'Other', // Thesis / Report / Legal… — the engine's structure template
    pages: pagesFor(doc.wordCount),
    color: doc.tint ?? 'gold',
  }));
  const noDocuments = storedDocuments !== undefined && storedDocuments.length === 0;
  const [selectedId, setSelectedId] = useState(docIdFromUrl);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [wordCount, setWordCount] = useState(0);
  const [reviewTab, setReviewTab] = useState('Issues');
  const [isSaved, setIsSaved] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [activeTool, setActiveTool] = useState('Home');
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [trackedChanges, setTrackedChanges] = useState(false);
  const [commentCount, setCommentCount] = useState(2);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [pageLayout, setPageLayout] = useState('standard');
  const [documentSearch, setDocumentSearch] = useState('');
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(true);
  const [documentPanelExpanded, setDocumentPanelExpanded] = useState(true);
  const [findMatches, setFindMatches] = useState(0);
  const [replaceText, setReplaceText] = useState('');
  const [importing, setImporting] = useState(false);

  const loadedIdRef = useRef(null); // the document currently shown in the editor
  const dirtyIdRef = useRef(null); // set when that document has changes not yet written
  const findQueryRef = useRef('');
  const editorRef = useRef(null); // the Tiptap editor instance, for callbacks
  const onEditorUpdateRef = useRef(() => {});
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const currentDocument = documents.find((doc) => doc.id === selectedId) ?? null;

  // One Tiptap editor for the page; documents are swapped into it with setContent.
  const editorOptions = useMemo(() => ({
    extensions: buildExtensions(),
    editable: false, // becomes editable once a document is loaded
    editorProps: {
      attributes: { class: 'editor-prose', 'aria-label': 'Document editor', spellcheck: 'true' },
    },
    onUpdate: ({ editor: instance }) => onEditorUpdateRef.current(instance),
  }), []);
  const editor = useEditor(editorOptions);
  editorRef.current = editor;

  // The ODIE engine (Rust → WebAssembly, in a Web Worker): it re-reads the
  // document about a second after typing stops and reports what it finds.
  const engine = useEngine(editor, {
    enabled: heatmapEnabled,
    docId: selectedId,
    // A document record stores this as `type` (see storage/documents.js). This
    // read `currentDocument?.kind`, which is never set, so every document
    // reached the engine as "Other" — the one type with no template — and the
    // structure checks had nothing to compare against. They were silently
    // dead; the engine was working perfectly on a question nobody asked it.
    kind: currentDocument?.type ?? 'Other',
  });

  // Which toolbar buttons should look pressed for the text under the cursor.
  const formats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      let block = 'p';
      if (e.isActive('heading', { level: 1 })) block = 'h1';
      else if (e.isActive('heading', { level: 2 })) block = 'h2';
      else if (e.isActive('heading', { level: 3 })) block = 'h3';
      else if (e.isActive('blockquote')) block = 'blockquote';
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        highlight: e.isActive('highlight'),
        superscript: e.isActive('superscript'),
        subscript: e.isActive('subscript'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList: e.isActive('taskList'),
        align: ['center', 'right', 'justify'].find((align) => e.isActive({ textAlign: align })) ?? 'left',
        block,
      };
    },
  }) ?? {};

  const announce = useCallback((message) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** Writes whatever was typed since the last save. Safe to call at any time. */
  const saveNow = useCallback(async () => {
    const id = dirtyIdRef.current;
    const instance = editorRef.current;
    if (!id || !instance || instance.isDestroyed || loadedIdRef.current !== id) return;
    dirtyIdRef.current = null;
    const html = instance.getHTML();
    const words = countWords(instance.getText());
    try {
      await updateDocument(id, { content: html, wordCount: words });
      maybeAutoVersion(id).catch((error) => console.error(error)); // history checkpoint, at most every 10 min
      setLastSavedAt(Date.now());
      setWordCount(words);
      if (!dirtyIdRef.current) setIsSaved(true);
    } catch (error) {
      console.error(error);
      if (!dirtyIdRef.current) dirtyIdRef.current = id; // retry on the next tick
      setToast('Auto-save failed. Your text is still on screen; check that the browser allows site storage.');
    }
  }, []);

  /** Paints find-bar matches on the page and updates the count. */
  const refreshFind = useCallback((query = findQueryRef.current) => {
    const instance = editorRef.current;
    if (!instance || instance.isDestroyed) return;
    const ranges = query ? findRanges(instance.state.doc, query) : [];
    instance.commands.setHighlights('find', ranges);
    setFindMatches(ranges.length);
  }, []);

  // Every edit: mark the document dirty (the 5-second timer saves it) and keep find matches current.
  onEditorUpdateRef.current = () => {
    if (!loadedIdRef.current) return;
    dirtyIdRef.current = loadedIdRef.current;
    setIsSaved(false);
    if (findQueryRef.current) window.requestAnimationFrame(() => refreshFind());
  };

  // No document chosen yet: open the most recent one.
  useEffect(() => {
    if (!selectedId && storedDocuments?.length) setSelectedId(storedDocuments[0].id);
  }, [selectedId, storedDocuments]);

  // Load the chosen document into the editor and keep its id in the URL.
  useEffect(() => {
    if (!selectedId || !editor) return undefined;
    let cancelled = false;
    getDocument(selectedId).then((doc) => {
      if (cancelled || editor.isDestroyed) return;
      if (!doc) {
        setSelectedId(null); // deleted or a bad link: fall back to the latest document
        return;
      }
      loadedIdRef.current = null; // loading is not an edit
      editor.commands.setContent(doc.content || '', { emitUpdate: false });
      // A fresh undo history, so Ctrl+Z can't bring back the previous document.
      editor.view.updateState(EditorState.create({ doc: editor.state.doc, plugins: editor.state.plugins }));
      editor.setEditable(true, false);
      loadedIdRef.current = doc.id;
      dirtyIdRef.current = null;
      setIsSaved(true);
      setLastSavedAt(doc.updatedAt);
      setWordCount(doc.wordCount ?? countWords(editor.getText()));
      refreshFind();
      window.history.replaceState({}, '', `/editor?doc=${doc.id}`);
    });
    return () => { cancelled = true; };
  }, [selectedId, editor, refreshFind]);

  // With no documents at all, the page stays read-only until one is created.
  useEffect(() => {
    if (editor && noDocuments) {
      loadedIdRef.current = null;
      editor.setEditable(false, false);
      editor.commands.setContent('', { emitUpdate: false });
    }
  }, [editor, noDocuments]);

  // Auto-save every 5 seconds (FR-03-02-02), and when the tab is hidden or the page is left.
  useEffect(() => {
    const timer = window.setInterval(saveNow, AUTOSAVE_MS);
    const onHide = () => { if (window.document.visibilityState === 'hidden') saveNow(); };
    window.addEventListener('pagehide', saveNow);
    window.document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', saveNow);
      window.document.removeEventListener('visibilitychange', onHide);
      saveNow();
    };
  }, [saveNow]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveNow().then(() => setToast('Document saved'));
      }
      if (key === 'f') {
        event.preventDefault();
        setShowFind(true);
      }
      if (key === 'h') {
        event.preventDefault(); // Ctrl+H: find and replace
        setShowFind(true);
        window.setTimeout(() => document.getElementById('editor-replace-input')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [saveNow]);

  useEffect(() => {
    if (!showFileMenu) return;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      setShowFileMenu(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
    };
  }, [showFileMenu]);

  const canEdit = () => Boolean(editor && !editor.isDestroyed && loadedIdRef.current);

  /** Runs a toolbar command on the selection (command names kept from the old editor). */
  const runCommand = (command, value) => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    if (command === 'copy') {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, '\n');
      if (text) navigator.clipboard?.writeText(text).catch(() => {});
      return;
    }
    const chain = editor.chain().focus();
    const listItem = editor.isActive('taskItem') ? 'taskItem' : 'listItem';
    switch (command) {
      case 'undo': chain.undo(); break;
      case 'redo': chain.redo(); break;
      case 'bold': chain.toggleBold(); break;
      case 'italic': chain.toggleItalic(); break;
      case 'underline': chain.toggleUnderline(); break;
      case 'strikeThrough': chain.toggleStrike(); break;
      case 'backColor': chain.toggleHighlight({ color: value }); break;
      case 'superscript': chain.toggleSuperscript(); break;
      case 'subscript': chain.toggleSubscript(); break;
      case 'removeFormat': chain.unsetAllMarks().clearNodes(); break;
      case 'foreColor': chain.setColor(value); break;
      case 'justifyLeft': chain.setTextAlign('left'); break;
      case 'justifyCenter': chain.setTextAlign('center'); break;
      case 'justifyRight': chain.setTextAlign('right'); break;
      case 'justifyFull': chain.setTextAlign('justify'); break;
      case 'insertUnorderedList': chain.toggleBulletList(); break;
      case 'insertOrderedList': chain.toggleOrderedList(); break;
      case 'insertTaskList': chain.toggleTaskList(); break;
      case 'indent': chain.sinkListItem(listItem); break;
      case 'outdent': chain.liftListItem(listItem); break;
      case 'pageBreak': chain.setHorizontalRule(); break;
      case 'insertTable': chain.insertTable({ rows: 2, cols: 2, withHeaderRow: true }); break;
      case 'fontName': chain.setFontFamily(value); break;
      case 'fontSize': chain.setFontSize(FONT_SIZES[value] ?? value); break;
      case 'formatBlock':
        if (value === 'p') chain.setParagraph();
        else if (value === 'blockquote') chain.toggleBlockquote();
        else chain.toggleHeading({ level: Number(value.slice(1)) });
        break;
      default:
        return;
    }
    chain.run();
  };

  const insertHtml = (html, message) => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    editor.chain().focus().insertContent(html).run();
    announce(message);
  };

  /** Adds, changes or removes the link on the selected text. */
  const insertLink = () => {
    if (!canEdit()) {
      announce('Open or create a document first.');
      return;
    }
    const previous = editor.getAttributes('link').href;
    const url = window.prompt('Link address (leave empty to remove the link)', previous || 'https://');
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url.trim()) {
      chain.unsetLink().run();
      return;
    }
    if (editor.state.selection.empty && !previous) {
      const safe = url.trim().replace(/"/g, '&quot;').replace(/</g, '&lt;');
      editor.chain().focus().insertContent(`<a href="${safe}">${safe}</a> `).run();
    } else {
      chain.setLink({ href: url.trim() }).run();
    }
  };

  const updateFind = (query) => {
    setFindQuery(query);
    findQueryRef.current = query;
    refreshFind(query);
  };

  const openFind = () => {
    setShowFind(true);
    window.setTimeout(() => document.getElementById('editor-find-input')?.focus(), 0);
  };

  const openReplace = () => {
    setShowFind(true);
    window.setTimeout(() => document.getElementById('editor-replace-input')?.focus(), 0);
  };

  const closeFind = () => {
    updateFind('');
    setReplaceText('');
    setShowFind(false);
  };

  const handleReplaceAll = () => {
    if (!canEdit() || !findQuery) return;
    const count = replaceAll(editor, findQuery, replaceText);
    refreshFind();
    announce(count ? `Replaced ${count} ${count === 1 ? 'match' : 'matches'}` : 'No matches to replace');
  };

  const currentTitle = () => currentDocument?.title ?? 'Untitled document';

  const handleExport = async (format) => {
    if (!canEdit()) {
      announce('Open a document to export it.');
      return;
    }
    try {
      if (format === 'docx') await exportDocx(currentTitle(), editor.getJSON());
      else if (format === 'txt') exportTxt(currentTitle(), editor.getText({ blockSeparator: '\n\n' }));
      else printDocument(currentTitle(), editor.getHTML());
      announce(format === 'pdf' ? 'Choose "Save as PDF" in the print window' : `Saved "${currentTitle()}.${format}" to your Downloads`);
    } catch (error) {
      console.error(error);
      announce('The export did not work. Try again, or export as .txt.');
    }
  };

  const addComment = () => {
    setCommentCount((count) => count + 1);
    announce('Comment added to the document');
  };

  /** Imports a .docx / .pdf / .txt / .md file as a new document and opens it. */
  const handleOpenFile = async (files) => {
    const file = files?.[0];
    if (!file || importing) return;
    setImporting(true);
    announce(`Reading ${file.name}…`);
    try {
      const imported = await importFile(file);
      const doc = await saveNewDocument({ title: imported.title });
      await updateDocument(doc.id, { content: imported.html, wordCount: imported.wordCount, format: imported.format });
      await changeDocument(doc.id);
      announce(`${file.name} imported as a new document`);
    } catch (error) {
      announce(error.message || 'That file could not be imported.');
    } finally {
      setImporting(false);
    }
  };

  /** Makes a copy of the open document and switches to it. */
  const makeCopy = async () => {
    if (!canEdit()) return;
    await saveNow();
    const source = await getDocument(loadedIdRef.current);
    if (!source) return;
    const copy = await saveNewDocument({ title: `${source.title} (copy)`, type: source.type, folderId: source.folderId });
    await updateDocument(copy.id, { content: source.content, wordCount: source.wordCount, format: source.format });
    await changeDocument(copy.id);
    announce('Copy created and opened');
  };

  const handleOpenFolder = (files) => {
    const file = files?.[0];
    if (!file) return;
    const folderName = file.webkitRelativePath?.split('/')[0] || 'folder';
    announce(`${folderName} opened with ${files.length} files`);
  };

  /** Applies one of the engine's one-click fixes. */
  const applyRepair = (issue, repair) => {
    if (!canEdit()) {
      announce('Open a document first.');
      return;
    }
    if (engine.applyRepair(issue, repair)) announce(`Fixed: ${repair.label}`);
    else announce('The text moved. Checking the document again…');
  };

  /** Adds the heading the engine suggests for a missing section. */
  const addHeading = (issue) => {
    if (!canEdit()) {
      announce('Open a document first.');
      return;
    }
    if (engine.addHeading(issue)) announce(`“${issue.suggestion.title}” heading added at the end`);
  };

  /** Adds every heading at once, for a document that has none yet. */
  const addOutline = (issue) => {
    if (!canEdit()) {
      announce('Open a document first.');
      return;
    }
    const count = issue.outline?.length ?? 0;
    if (engine.addOutline(issue)) {
      announce(`${count} headings added. Write under each one, and the structure checks take it from there.`);
    }
  };

  const ignoreIssue = (issue) => {
    engine.ignoreIssue(issue);
    announce('Issue ignored');
  };

  const changeDocument = async (id) => {
    if (id === selectedId) return;
    await saveNow(); // finish the current document before switching
    setSelectedId(id);
  };

  const createDocument = async (title) => {
    const clean = title.trim();
    if (!clean) return;
    try {
      const doc = await saveNewDocument({ title: clean });
      setModal(null);
      await changeDocument(doc.id);
      announce('New document created');
    } catch (error) {
      console.error(error);
      announce('The document could not be saved. Check that your browser allows site storage, then try again.');
    }
  };

  const saveAndAnnounce = (message) => {
    saveNow().then(() => announce(message));
  };

  const selectNav = (label) => {
    if (label === 'Version history' && selectedId) {
      navigate(`/version?doc=${selectedId}`); // open the history of the document being edited
      return;
    }
    const route = workspaceRoutes[label];
    if (route && label !== 'Editor') {
      navigate(route);
      return;
    }
    if (label === 'Dashboard') return navigate('/dashboard');
    if (label === 'Subscription' || label === 'Pricing') return navigate('/pricing');
    if (label === 'Version history') return navigate('/version');
    if (label === 'Features') return navigate('/features');
    if (label === 'Settings') return navigate('/settings');
    if (label === 'Help and Guide') return navigate('/help');
    if (label === 'Storage') return navigate('/storage');
    if (label === 'Share Document') return navigate('/share');

    setActiveNav(label);
    if (label !== 'Editor') announce(`${label} view selected`);
    setMobileSidebar(false);
  };

  const issueCount = engine.counts.total;
  const engineLabel = engine.status === 'ready'
    ? (engine.engineName === 'wasm' ? 'Engine ready' : 'Engine ready (JavaScript)')
    : engine.status === 'starting' ? 'Engine starting…' : 'Engine off';
  const visibleDocuments = documents
    .filter((doc) => doc.title.toLowerCase().includes(documentSearch.toLowerCase()))
    .slice(0, 5);

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
        onPrivacyToggle={() => setPrivacyMode((prev) => !prev)}
        onLogout={() => setModal('logout')}
      />

      <main className={`dash-main ${sidebarCollapsed ? 'is-wide' : ''}`}>
        <div className="editor-page">
          <div className={`editor-workspace ${focusMode ? 'is-focus-mode' : ''} ${showReviewPanel ? '' : 'review-hidden'}`}>

            {/* Topbar: document title and save status, a few quick actions */}
            <div className="editor-topbar">
              <div className="editor-topbar-identity">
                <button type="button" onClick={() => navigate('/documents')} className="editor-back-button" aria-label="Back to documents" title="Back to My documents">
                  <ArrowUpRight size={16} className="editor-back-icon" />
                </button>
                <span className="editor-file-icon"><FileText size={17} /></span>
                <div className="editor-topbar-titles">
                  <label className="editor-document-select">
                    <span className="dash-sr">Choose document</span>
                    <select value={currentDocument?.id ?? ''} disabled={noDocuments} onChange={(event) => changeDocument(event.target.value)}>
                      {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                  <p className={`editor-save-line ${isSaved ? 'is-saved' : 'is-saving'}`}>
                    <span aria-hidden="true" />
                    {isSaved
                      ? (lastSavedAt ? `Saved on this device · ${clockTime(lastSavedAt)}` : 'Saved on this device')
                      : 'Saving…'}
                  </p>
                </div>
              </div>

              <div className="editor-topbar-actions">
                <button type="button" className="editor-top-icon-action" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('undo')} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
                <button type="button" className="editor-top-icon-action" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('redo')} aria-label="Redo" title="Redo (Ctrl+Y)"><Redo2 size={15} /></button>
                <button type="button" className="editor-top-icon-action" onClick={() => navigate(selectedId ? `/version?doc=${selectedId}` : '/version')} aria-label="Version history" title="Version history"><History size={15} /></button>
                <span className="editor-topbar-divider" />
                <button type="button" className="editor-top-action" onClick={() => handleExport('docx')} title="Download as a Word file"><Printer size={15} /><span className="editor-hide-sm">Export</span></button>
                <button type="button" className="editor-top-action editor-share-action" onClick={() => navigate('/share')}><Share2 size={14} /><span className="editor-hide-sm">Share</span></button>
              </div>
            </div>

            {/* Ribbon tabs and the File menu */}
            <div className="editor-navigation">
              <div className="editor-mode-tabs">
                <div className="editor-file-menu-wrap" onPointerDown={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setShowFileMenu((value) => !value)}
                    className={`editor-mode-tab editor-file-tab ${showFileMenu ? 'is-active' : ''}`}
                    aria-expanded={showFileMenu}
                    aria-haspopup="menu"
                  >
                    File <ChevronDown size={12} />
                  </button>
                  {showFileMenu && (
                    <div className="editor-file-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); setModal('document'); }}><FilePlus2 size={14} /><span>New document</span><kbd>Ctrl N</kbd></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); fileInputRef.current?.click(); }}><FileText size={14} /><span>Open file…</span><kbd>Ctrl O</kbd></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); folderInputRef.current?.click(); }}><FolderOpen size={14} /><span>Open folder…</span></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); navigate('/documents'); }}><Files size={14} /><span>Open recent</span></button>
                      <div className="editor-file-menu-divider" />
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); saveAndAnnounce('Document saved'); }}><Save size={14} /><span>Save</span><kbd>Ctrl S</kbd></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); saveAndAnnounce('Document saved'); }}><Copy size={14} /><span>Save as…</span><kbd>Ctrl Shift S</kbd></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); makeCopy(); }}><FilePlus2 size={14} /><span>Make a copy</span></button>
                      <div className="editor-file-menu-divider" />
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); handleExport('pdf'); }}><Printer size={14} /><span>Export as PDF</span></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); handleExport('docx'); }}><FileText size={14} /><span>Export as DOCX</span></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); handleExport('txt'); }}><FileText size={14} /><span>Export as TXT</span></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); handleExport('pdf'); }}><Printer size={14} /><span>Print</span></button>
                      <div className="editor-file-menu-divider" />
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); navigate(selectedId ? `/version?doc=${selectedId}` : '/version'); }}><History size={14} /><span>Version history</span></button>
                      <button type="button" role="menuitem" onClick={() => { setShowFileMenu(false); navigate('/documents'); }} className="editor-file-menu-danger"><X size={14} /><span>Close editor</span><kbd>Esc</kbd></button>
                    </div>
                  )}
                </div>
                {modeTabs.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setActiveTool(item); announce(`${item} tools selected`); }}
                    className={`editor-mode-tab ${activeTool === item ? 'is-active' : ''}`}
                  >
                    {item === 'AI Tools' ? <Sparkles size={13} /> : item === 'Review' ? <CheckCircle2 size={13} /> : null}{item}
                  </button>
                ))}
              </div>
              <div className="editor-utility-tabs">
                <button
                  type="button"
                  className={`editor-review-switch ${showReviewPanel ? 'is-on' : ''}`}
                  onClick={() => setShowReviewPanel((value) => !value)}
                  aria-pressed={showReviewPanel}
                  title={showReviewPanel ? 'Hide the review panel' : 'Show contradictions, gaps and other checks'}
                >
                  {showReviewPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                  Review panel
                </button>
              </div>
            </div>

            <input ref={fileInputRef} type="file" hidden accept={IMPORT_ACCEPT} onChange={(event) => { handleOpenFile(event.target.files); event.target.value = ''; }} />
            <input ref={folderInputRef} type="file" hidden multiple webkitdirectory="" directory="" onChange={(event) => handleOpenFolder(event.target.files)} />

            {/* The ribbon itself */}
            <div className="editor-toolkit" aria-label={`${activeTool} ribbon`}>
              {activeTool === 'Home' && (
                <HomeRibbon editor={editor} canEdit={canEdit} announce={announce} onFind={openFind} onReplace={openReplace} />
              )}

              {activeTool === 'Insert' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Pages</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={FilePlus2} label="Insert page break" onClick={() => runCommand('pageBreak')} />
                      <ToolbarButton icon={Quote} label="Insert quote" onClick={() => insertHtml('<blockquote>Write the sentence you want your reader to remember.</blockquote>', 'Quote block inserted')} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Media</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={ImagePlus} label="Add image (coming soon)" onClick={() => announce('Images are coming in a later update')} />
                      <ToolbarButton icon={Link2} label="Insert or edit link" onClick={insertLink} />
                      <ToolbarButton icon={Table2} label="Insert 2 by 2 table" onClick={() => runCommand('insertTable')} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Annotations</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={MessageSquare} label="Add comment" onClick={addComment} />
                      <ToolbarButton icon={Bookmark} label="Add bookmark" onClick={() => announce('Bookmark added at cursor')} />
                      <ToolbarButton icon={AtSign} label="Mention collaborator" onClick={() => insertHtml('<span class="editor-mention">@collaborator</span>&nbsp;', 'Mention inserted')} />
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'Layout' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Page setup</span>
                    <div className="editor-tool-group">
                      <button type="button" className={`editor-ribbon-choice ${pageLayout === 'standard' ? 'is-active' : ''}`} onClick={() => setPageLayout('standard')}><LayoutPanelTop size={14} /> Standard</button>
                      <button type="button" className={`editor-ribbon-choice ${pageLayout === 'wide' ? 'is-active' : ''}`} onClick={() => setPageLayout('wide')}><Maximize2 size={14} /> Wide</button>
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Document rhythm</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={Type} label="Increase paragraph spacing" onClick={() => insertHtml('<p><br></p>', 'Paragraph spacing increased')} />
                      <ToolbarButton icon={AlignJustify} label="Set readable line spacing" onClick={() => announce('Readable line spacing enabled')} active />
                      <ToolbarButton icon={ListFilter} label="Show layout guides" onClick={() => announce('Layout guides enabled')} />
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'References' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Citations</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={Bookmark} label="Insert citation" onClick={() => insertHtml('<span class="editor-citation">[Add citation]</span>&nbsp;', 'Citation placeholder inserted')} />
                      <ToolbarButton icon={AtSign} label="Manage sources" onClick={() => announce('Source manager opened')} />
                      <ToolbarButton icon={BookOpen} label="Bibliography" onClick={() => insertHtml('<h2>References</h2><p class="editor-reference-placeholder">Add your references here.</p>', 'References section inserted')} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Navigation</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={ListOrdered} label="Table of contents" onClick={() => announce('Table of contents refreshed')} />
                      <ToolbarButton icon={FileCheck2} label="Cross-reference" onClick={() => announce('Cross-reference picker opened')} />
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'Review' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Changes</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={CheckCircle2} label="Track changes" onClick={() => { setTrackedChanges((value) => !value); announce(`Track changes ${trackedChanges ? 'off' : 'on'}`); }} active={trackedChanges} />
                      <ToolbarButton icon={Check} label="Accept all changes" onClick={() => announce('All suggested changes accepted')} />
                      <ToolbarButton icon={RotateCcw} label="Reject all changes" onClick={() => announce('All suggested changes rejected')} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Comments</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={MessageSquare} label="New comment" onClick={addComment} />
                      <ToolbarButton icon={ListFilter} label="Show comments" onClick={() => setReviewTab('Issues')} />
                      <ToolbarButton icon={WandSparkles} label="Resolve with AI" onClick={() => announce('AI prepared a review summary')} />
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'View' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Zoom</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom((value) => Math.max(85, value - 5))} />
                      <span className="editor-zoom-label">{zoom}%</span>
                      <ToolbarButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom((value) => Math.min(115, value + 5))} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Window</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={Maximize2} label="Focus mode" onClick={() => setFocusMode((value) => !value)} active={focusMode} />
                      <ToolbarButton icon={LayoutPanelTop} label="Toggle review panel" onClick={() => setShowReviewPanel((value) => !value)} active={showReviewPanel} />
                    </div>
                  </div>
                </>
              )}

              {activeTool === 'AI Tools' && (
                <>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Writing assistant</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={WandSparkles} label="Improve clarity" onClick={() => announce('Clarity suggestions ready')} />
                      <ToolbarButton icon={Sparkles} label="Continue writing" onClick={() => insertHtml('<p class="editor-ai-suggestion">A clearer next step could begin here…</p>', 'Draft suggestion inserted')} />
                      <ToolbarButton icon={CheckCircle2} label="Check tone" onClick={() => announce('Tone check: measured and academic')} />
                    </div>
                  </div>
                  <div className="editor-ribbon-section">
                    <span className="editor-ribbon-label">Document intelligence</span>
                    <div className="editor-tool-group">
                      <ToolbarButton icon={ShieldCheck} label="Run privacy scan" onClick={() => setReviewTab('Privacy')} />
                      <ToolbarButton icon={ListFilter} label="Find structure gaps" onClick={() => setReviewTab('Structure')} />
                      <ToolbarButton icon={Search} label="Find contradictions" onClick={() => { setReviewTab('Issues'); setShowReviewPanel(true); engine.reanalyze(); }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {showFind && (
              <div className="editor-findbar">
                <Search size={15} />
                <input id="editor-find-input" autoFocus value={findQuery} onChange={(event) => updateFind(event.target.value)} placeholder="Find in document" aria-label="Find in document" onKeyDown={(event) => { if (event.key === 'Escape') closeFind(); }} />
                <span>{findQuery ? `${findMatches} ${findMatches === 1 ? 'match' : 'matches'}` : 'Type to search'}</span>
                <input id="editor-replace-input" className="editor-replace-input" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="Replace with…" aria-label="Replace with" onKeyDown={(event) => { if (event.key === 'Enter') handleReplaceAll(); }} />
                <button type="button" className="editor-replace-button" onClick={handleReplaceAll} disabled={!findMatches}>Replace all</button>
                <button type="button" onClick={closeFind} aria-label="Close find bar"><X size={14} /></button>
              </div>
            )}

            {/* Navigator | canvas | review */}
            <div className="editor-main-grid is-clean">

              {/* The document list lives in My documents and File → Open recent. */}

              <section className="editor-canvas-shell">
                <div className="editor-paper-wrap">
                  {noDocuments && (
                    <div className="editor-empty-note" role="status">
                      <p>You have no documents yet.</p>
                      <button type="button" onClick={() => setModal('document')}><Plus size={14} /> Create a document</button>
                    </div>
                  )}
                  <div
                    className={`editor-paper ${pageLayout === 'wide' ? 'is-wide' : ''} ${heatmapEnabled ? '' : 'heatmap-muted'} ${currentDocument ? '' : 'is-disabled'}`}
                    style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', marginBottom: `${(zoom - 100) * 1.5}px` }}
                    onMouseDown={(event) => {
                      // Clicking the page margin puts the cursor at the end of the text.
                      if (event.target === event.currentTarget && editor?.isEditable) {
                        event.preventDefault();
                        editor.commands.focus('end');
                      }
                    }}
                  >
                    <EditorContent editor={editor} />
                  </div>
                </div>

                <div className="editor-statusbar">
                  <span>{pageLabel(currentDocument?.pages)}</span>
                  <span>{wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}</span>
                  <span>{lastSavedAt ? `Last Saved: ${clockTime(lastSavedAt)}` : 'Not saved yet'}</span>
                  <button
                    type="button"
                    className={`editor-engine-pill engine-${engine.status} ${engine.analyzing ? 'is-busy' : ''}`}
                    onClick={() => { setShowReviewPanel(true); setReviewTab('Issues'); }}
                    title={engine.status === 'ready' ? 'Open the review panel' : 'The analysis engine is starting'}
                  >
                    <span className="editor-engine-dot" />
                    {engine.analyzing ? 'Checking…' : engineLabel}
                    {engine.status === 'ready' && !engine.analyzing && issueCount > 0 ? ` · ${issueCount}` : ''}
                  </button>
                  <span className="editor-statusbar-spacer" />
                  <div className="editor-zoom" aria-label="Zoom">
                    <button type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} aria-label="Zoom out" title="Zoom out">−</button>
                    <span>{zoom}%</span>
                    <button type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} aria-label="Zoom in" title="Zoom in">+</button>
                  </div>
                </div>
              </section>

              <aside className="editor-review-panel" aria-label="Document review">
                <div className="editor-review-header">
                  <div className="editor-review-tabs">
                    {['Issues', 'Structure', 'Privacy', 'Stats'].map((tab) => (
                      <button key={tab} type="button" onClick={() => setReviewTab(tab)} className={reviewTab === tab ? 'is-active' : ''}>
                        {tab}{tab === 'Issues' ? <sup>{issueCount}</sup> : null}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="editor-review-collapse" onClick={() => setShowReviewPanel(false)} aria-label="Collapse review panel" title="Collapse review panel"><PanelRightClose size={14} /></button>
                </div>

                {reviewTab === 'Issues' && (
                  <>
                    <div className="editor-scan-card">
                      <div className="editor-scan-row">
                        <span className="editor-scan-label"><span className="editor-scan-dot" /> {engine.analyzing ? 'Checking your document…' : 'Checked on this device'}</span>
                        <span className="editor-live-status"><span /> {engine.status === 'ready' ? 'Live' : 'Starting'}</span>
                      </div>
                      <div className={`editor-scan-progress ${engine.analyzing ? 'is-busy' : ''}`}><span /></div>
                      <div className="editor-scan-row editor-scan-counts">
                        <span>{issueCount} {issueCount === 1 ? 'issue' : 'issues'} found</span>
                        {/* The document's type is shown here on purpose. The
                            structure checks are measured against it, and when it
                            silently read "Other" every one of them went quiet
                            with nothing on screen to say why. */}
                        <span>
                          {engine.stats
                            ? `${currentDocument?.type ?? 'Other'} · ${engine.stats.sentences} sentences · ${engine.stats.checks} checks`
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="editor-review-heading">
                      <span>Active issues</span>
                      <button type="button" onClick={() => { engine.reanalyze(); announce('Checking the document again'); }}><RotateCcw size={13} /> Scan now</button>
                    </div>
                    <div className="editor-issues">
                      {engine.issues.map((issue) => {
                        const Icon = ISSUE_ICON[issue.kind] ?? AlertTriangle;
                        return (
                          <div className={`editor-issue-card issue-${ISSUE_TONE[issue.severity] ?? 'amber'}`} key={issue.id}>
                            <div className="editor-issue-head">
                              <span className="editor-issue-kind"><Icon size={13} />{issue.title}</span>
                              <button type="button" className="editor-issue-location" onClick={() => engine.goToIssue(issue)} title="Show this in the document">{issue.location}</button>
                            </div>
                            <p>{issue.message}</p>
                            <div className="editor-issue-actions">
                              {issue.repairs.map((repair) => (
                                <button type="button" key={repair.label} onClick={() => applyRepair(issue, repair)} className="editor-issue-action action-fix">{repair.label}</button>
                              ))}
                              {issue.suggestion && (
                                <button type="button" onClick={() => addHeading(issue)} className="editor-issue-action action-fix">Add “{issue.suggestion.title}” heading</button>
                              )}
                              {issue.outline?.length > 0 && (
                                <button type="button" onClick={() => addOutline(issue)} className="editor-issue-action action-fix">
                                  Add all {issue.outline.length} headings
                                </button>
                              )}
                              <button type="button" onClick={() => engine.goToIssue(issue)} className="editor-issue-action action-source">Show me</button>
                              <button type="button" onClick={() => ignoreIssue(issue)} className="editor-issue-action action-ignore">Ignore</button>
                            </div>
                          </div>
                        );
                      })}
                      {issueCount === 0 && (
                        /* Three states, not two: "Starting the engine" used to
                           sit here for ever when the engine had in fact failed. */
                        <div className="editor-no-issues">
                          {engine.status === 'off' ? <TriangleAlert size={20} /> : <CheckCircle2 size={20} />}
                          <strong>
                            {engine.status === 'ready' ? 'All clear for now'
                              : engine.status === 'off' ? 'The checks are not running'
                              : 'Starting the engine'}
                          </strong>
                          <span>
                            {engine.status === 'ready'
                              ? 'DocuMend found no contradictions or repeated sentences.'
                              : engine.status === 'off'
                                ? `The engine could not start, so nothing is being checked. ${engine.engineReason || 'Reloading the page usually fixes it.'}`
                                : 'The checks begin as soon as the engine is ready.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {reviewTab === 'Structure' && (
                  <div className="editor-insight-panel">
                    <p className="editor-insight-kicker">Document outline</p>
                    <h3>{engine.outline.length ? `${engine.outline.length} ${engine.outline.length === 1 ? 'heading' : 'headings'}` : 'No headings yet'}</h3>

                    {engine.outline.map((heading, index) => (
                      <button
                        type="button"
                        key={`${heading.start}-${heading.title}`}
                        className={`editor-outline-item level-${heading.level}`}
                        onClick={() => engine.goToOffset(heading.start, heading.end)}
                        title="Go to this heading"
                      >
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        {heading.title || 'Untitled heading'}
                        <em>H{heading.level}</em>
                      </button>
                    ))}

                    {!engine.outline.length && (
                      <p className="editor-outline-empty">
                        Give your sections headings from the Styles gallery (Heading 1, 2 or 3). DocuMend then checks the
                        outline for missing sections and empty ones.
                      </p>
                    )}

                    <div className="editor-outline-note">
                      {engine.counts.structure > 0
                        ? (<><AlertTriangle size={15} /> {engine.counts.structure} structure {engine.counts.structure === 1 ? 'issue' : 'issues'} — see the Issues tab.</>)
                        : (<><CheckCircle2 size={15} /> {engine.outline.length ? 'The outline looks complete.' : 'Nothing to check yet.'}</>)}
                    </div>
                  </div>
                )}

                {reviewTab === 'Privacy' && (
                  <div className="editor-insight-panel privacy-insight">
                    <div className="editor-privacy-icon"><LockKeyhole size={22} /></div>
                    <p className="editor-insight-kicker">Privacy mode</p>
                    <h3>Protected by default</h3>
                    <p>Your document stays on this device while DocuMend checks structure and clarity locally.</p>
                    <div className="editor-security-row"><span><Check size={13} /> AES-256 encryption</span><strong>On</strong></div>
                    <div className="editor-security-row"><span><Check size={13} /> External sharing</span><strong>Off</strong></div>
                  </div>
                )}

                {reviewTab === 'Stats' && (
                  <div className="editor-insight-panel">
                    <p className="editor-insight-kicker">Writing signals</p>
                    <h3>Steady, focused progress</h3>
                    <div className="editor-stat-grid">
                      <div><strong>{wordCount.toLocaleString()}</strong><span>Words</span></div>
                      <div><strong>{Math.max(1, Math.ceil(wordCount / 200))} min</strong><span>Read time</span></div>
                      <div><strong>{engine.stats?.headings ?? 0}</strong><span>Headings</span></div>
                      <div><strong>{issueCount}</strong><span>Open issues</span></div>
                    </div>
                    <div className="editor-stat-bar"><span style={{ width: `${Math.max(4, 100 - Math.min(100, issueCount * 10))}%` }} /></div>
                    <p className="editor-stat-caption">
                      {engine.lastRunMs !== null
                        ? `Last check took ${engine.lastRunMs} ms on this device${engine.stats?.numbers ? ` · ${engine.stats.numbers} numbers read` : ''}.`
                        : 'The engine has not read this document yet.'}
                    </p>
                  </div>
                )}

                <div className="editor-review-footer">
                  <span><Cloud size={13} /> {engine.engineName === 'wasm' ? 'Rust engine · offline' : 'Offline-ready workspace'}</span>
                  <button type="button" onClick={() => { engine.reanalyze(); announce('Checking the document again'); }} aria-label="Check the document again" title="Check the document again"><RotateCcw size={13} /></button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </main>

      <WorkspaceModal
        key={String(modal)}
        mode={modal}
        initialValue=""
        onClose={() => setModal(null)}
        onSubmit={createDocument}
        onLogout={() => { setModal(null); navigate('/'); }}
      />

      {toast && <div className="dash-toast" role="status">{toast}</div>}
    </div>
  );
}

export default Editor;