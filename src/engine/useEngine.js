/**
 * useEngine.js — connects the editor to the analysis engine.
 *
 * The hook owns the Web Worker, asks it for a new analysis about a second
 * after typing stops, paints the highlights on the page and hands the page a
 * plain list of issues to show in the review panel.
 *
 *   const engine = useEngine(editor, { enabled: heatmapOn, docId: selectedId, kind: 'Thesis' });
 *   engine.status     // 'starting' | 'ready' | 'off'
 *   engine.issues     // [{ id, kind, title, message, severity, location, repairs… }]
 *   engine.applyRepair(issue, repair)
 *   engine.goToIssue(issue)
 *   engine.ignoreIssue(issue)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildTextMap, highlightClass, serializeOutline, toRange } from './textmap';
import { checkIdOf } from './checks';
import { usePreference } from '../settings/preferences';

/** How long to wait after the last keystroke before analysing again. */
const IDLE_MS = 1200;

export function useEngine(editor, { enabled = true, docId = null, kind = 'Other' } = {}) {
  const [status, setStatus] = useState('starting');
  // Why the engine is off, or why it fell back to JavaScript. Shown to the reader.
  const [engineReason, setEngineReason] = useState('');
  // Checks the reader switched off on the Settings page.
  const [mutedChecks] = usePreference('mutedChecks');
  const [engineName, setEngineName] = useState(null);
  const [issues, setIssues] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastRunMs, setLastRunMs] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const [outline, setOutline] = useState([]); // the document's headings

  const workerRef = useRef(null);
  const timerRef = useRef(0);
  const requestRef = useRef(0);
  const analysisRef = useRef(null); // { doc, map } the current issues belong to

  // ---- the worker ----------------------------------------------------------
  useEffect(() => {
    let worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      console.error('The analysis engine could not start', error);
      setEngineReason(error?.message ?? String(error));
      setStatus('off');
      return undefined;
    }
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === 'ready') {
        setEngineName(message.engine);
        // The worker says why it fell back to JavaScript; without this the
        // reason was thrown away and a silent fallback looked like a failure.
        if (message.reason) {
          setEngineReason(message.reason);
          console.info('[engine] WebAssembly did not load, using JavaScript:', message.reason);
        }
        setStatus('ready');
        return;
      }
      if (message.type === 'result') {
        if (message.id !== requestRef.current) return; // an older answer; a newer one is coming
        setAnalyzing(false);
        setIssues(message.issues);
        setStats(message.stats);
        setLastRunMs(message.ms);
        return;
      }
      if (message.type === 'error') {
        setAnalyzing(false);
        console.error('Analysis failed:', message.message);
      }
    };
    worker.onerror = (event) => {
      const why = event?.message || 'the engine thread stopped before it could start';
      console.error('The analysis engine stopped:', why, event);
      setEngineReason(why);
      setStatus('off');
      setAnalyzing(false);
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ---- asking for an analysis ---------------------------------------------
  const runNow = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || !editor || editor.isDestroyed) return;
    const map = buildTextMap(editor.state.doc);
    analysisRef.current = { doc: editor.state.doc, map };
    setOutline(map.outline);
    requestRef.current += 1;
    setAnalyzing(true);
    worker.postMessage({
      type: 'analyze',
      id: requestRef.current,
      text: map.text,
      outline: serializeOutline(map.outline),
      kind,
    });
  }, [editor, kind]);

  const schedule = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(runNow, IDLE_MS);
  }, [runNow]);

  // Re-analyse while the writer types, and once when a document is opened.
  useEffect(() => {
    if (!editor || editor.isDestroyed || status !== 'ready') return undefined;
    editor.on('update', schedule);
    return () => { editor.off('update', schedule); };
  }, [editor, schedule, status]);

  useEffect(() => {
    if (!editor || status !== 'ready') return undefined;
    setDismissed({}); // a new document starts with a clean slate
    const timer = window.setTimeout(runNow, 150); // let the content load first
    return () => window.clearTimeout(timer);
  }, [docId, editor, runNow, status]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // ---- what the page sees --------------------------------------------------
  /**
   * Two things hide an issue: "Ignore" on the card (this session only), and a
   * check switched off in Settings (for good, on this device). The engine
   * still finds them; the writer has said they do not want to be told.
   */
  const openIssues = useMemo(
    () => issues.filter((issue) => {
      if (dismissed[issue.id]) return false;
      const check = checkIdOf(issue);
      return !(check && mutedChecks.includes(check));
    }),
    [issues, dismissed, mutedChecks],
  );

  const counts = useMemo(() => ({
    total: openIssues.length,
    contradiction: openIssues.filter((issue) => issue.kind === 'contradiction').length,
    redundancy: openIssues.filter((issue) => issue.kind === 'redundancy').length,
    structure: openIssues.filter((issue) => issue.kind === 'structure').length,
  }), [openIssues]);

  /** Turns an engine range into an editor range, using the analysed document. */
  const rangeOf = useCallback((start, end) => {
    const analysis = analysisRef.current;
    if (!analysis || !editor || editor.isDestroyed) return null;
    if (analysis.doc !== editor.state.doc) return null; // the text moved since the analysis
    return toRange(analysis.map, start, end);
  }, [editor]);

  // ---- highlights ----------------------------------------------------------
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!enabled) {
      editor.commands.clearHighlights('issues');
      return;
    }
    const analysis = analysisRef.current;
    if (!analysis || analysis.doc !== editor.state.doc) return; // keep the old marks; they move with the text
    const ranges = [];
    openIssues.forEach((issue) => {
      const spans = [{ start: issue.start, end: issue.end }, ...(issue.related ?? [])];
      spans.forEach((span) => {
        const range = toRange(analysis.map, span.start, span.end);
        if (range) ranges.push({ ...range, className: highlightClass(issue.kind), id: issue.id });
      });
    });
    editor.commands.setHighlights('issues', ranges);
  }, [editor, enabled, openIssues]);

  // ---- actions -------------------------------------------------------------
  /** Scrolls to an issue and selects the text it is about. */
  const goToIssue = useCallback((issue) => {
    const range = rangeOf(issue.start, issue.end);
    if (!range || !editor) return false;
    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    return true;
  }, [editor, rangeOf]);

  /** Applies a one-click fix. Returns false if the text moved and it needs a fresh analysis. */
  const applyRepair = useCallback((issue, repair) => {
    const range = rangeOf(repair.start, repair.end);
    if (!range || !editor) {
      runNow();
      return false;
    }
    if (repair.text) {
      editor.chain().focus().insertContentAt(range, repair.text).run();
    } else {
      editor.chain().focus().deleteRange(range).run();
    }
    setDismissed((current) => ({ ...current, [issue.id]: 'fixed' }));
    runNow();
    return true;
  }, [editor, rangeOf, runNow]);

  /** Scrolls to a heading (or any engine range). */
  const goToOffset = useCallback((start, end) => {
    const range = rangeOf(start, end);
    if (!range || !editor) return false;
    editor.chain().focus().setTextSelection(range).scrollIntoView().run();
    return true;
  }, [editor, rangeOf]);

  /** Adds a missing section's heading at the end of the document. */
  const addHeading = useCallback((issue) => {
    if (!issue.suggestion || !editor || editor.isDestroyed) return false;
    const { title, level } = issue.suggestion;
    editor
      .chain()
      .focus('end')
      .insertContentAt(editor.state.doc.content.size, [
        { type: 'heading', attrs: { level: Math.min(3, Math.max(1, level)) }, content: [{ type: 'text', text: title }] },
        { type: 'paragraph' },
      ])
      .scrollIntoView()
      .run();
    setDismissed((current) => ({ ...current, [issue.id]: 'fixed' }));
    runNow();
    return true;
  }, [editor, runNow]);

  /**
   * Adds every heading the issue suggests, in one edit.
   *
   * One edit rather than eight matters for two reasons: undo puts the document
   * back with a single Ctrl+Z, and the analysis runs once at the end instead of
   * after each heading.
   */
  const addOutline = useCallback((issue) => {
    const wanted = issue?.outline ?? [];
    if (!wanted.length || !editor || editor.isDestroyed) return false;
    const blocks = wanted.flatMap((heading) => ([
      {
        type: 'heading',
        attrs: { level: Math.min(3, Math.max(1, heading.level)) },
        content: [{ type: 'text', text: heading.title }],
      },
      { type: 'paragraph' },
    ]));
    editor
      .chain()
      .focus('end')
      .insertContentAt(editor.state.doc.content.size, blocks)
      .scrollIntoView()
      .run();
    setDismissed((current) => ({ ...current, [issue.id]: 'fixed' }));
    runNow();
    return true;
  }, [editor, runNow]);

  const ignoreIssue = useCallback((issue) => {
    setDismissed((current) => ({ ...current, [issue.id]: 'ignored' }));
  }, []);

  return {
    status,
    engineName,
    engineReason,
    analyzing,
    issues: openIssues,
    counts,
    outline,
    stats,
    lastRunMs,
    dismissedCount: Object.keys(dismissed).length,
    reanalyze: runNow,
    goToIssue,
    goToOffset,
    addHeading,
    addOutline,
    applyRepair,
    ignoreIssue,
  };
}

export default useEngine;
