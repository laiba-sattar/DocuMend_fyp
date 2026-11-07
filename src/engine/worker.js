/**
 * worker.js — the engine's own thread.
 *
 * Analysis runs here, not on the page, so a long document never freezes the
 * cursor. The worker first tries to load the Rust engine (WebAssembly); if that
 * file has not been built yet it quietly uses the JavaScript version instead,
 * and tells the page which one is running.
 *
 * Messages in:  { type: 'analyze', id, text, outline, kind, style }
 *               { type: 'enable-nli' } / { type: 'disable-nli' }
 * Messages out: { type: 'ready', engine, version, ms }
 *               { type: 'result', id, issues, stats, engine, ms }
 *               { type: 'error', id, message }
 *               { type: 'nli-status', state: 'loading'|'ready'|'error', progress?, message? }
 *               { type: 'nli-result', id, issues, ms }
 *
 * Build the Rust engine with:
 *   wasm-pack build engine --target web --out-dir ../src/engine/pkg
 *
 * The NLI pass (S7, see nli.js) is separate from the engine above on purpose:
 * it is JavaScript-only (a transformer cannot run inside the Rust/WASM
 * binary), off by default, and answers well after the deterministic `result`
 * — never before it, and never blocking it.
 */
import { analyze as analyzeWithJs } from './fallback';

/**
 * Where wasm-pack puts the browser build. A glob rather than a plain import:
 * when the folder is built, Vite bundles it (and its .wasm) into production;
 * when it is not, the glob is simply empty and the JavaScript engine is used.
 */
const builtEngine = import.meta.glob('./pkg/documend_engine.js');

let engine = null;

async function loadEngine() {
  const started = performance.now();
  try {
    const load = builtEngine['./pkg/documend_engine.js'];
    if (!load) throw new Error('The Rust engine has not been built (src/engine/pkg is missing).');
    const wasm = await load();
    await wasm.default();
    engine = {
      name: 'wasm',
      version: wasm.engine_version(),
      analyze: (text, outline, kind, style) => JSON.parse(wasm.analyze_json(text, outline, kind, style)),
    };
  } catch (error) {
    engine = {
      name: 'javascript',
      version: 'fallback',
      analyze: analyzeWithJs,
      reason: error?.message ?? String(error),
    };
  }
  self.postMessage({
    type: 'ready',
    engine: engine.name,
    version: engine.version,
    reason: engine.reason ?? null,
    ms: Math.round(performance.now() - started),
  });
}

const ready = loadEngine();

/* ---------------------------------------------------------------------------
   S7 — the on-device NLI pass. Off until the reader turns it on in Settings;
   see nli.js for why it lives entirely in JavaScript.
   ------------------------------------------------------------------------- */
let nliEnabled = false;
// Bumped on every 'analyze', so an in-flight NLI pass from an older request
// can tell it has been superseded and stop early instead of finishing a scan
// for a document the writer already changed.
let latestRequestId = 0;

async function enableNli() {
  nliEnabled = true;
  self.postMessage({ type: 'nli-status', state: 'loading' });
  try {
    const { ensurePipelines } = await import('./nli');
    await ensurePipelines((progress) => self.postMessage({ type: 'nli-status', state: 'loading', progress }));
    self.postMessage({ type: 'nli-status', state: 'ready' });
  } catch (error) {
    console.error('[nli] failed to load', error);
    nliEnabled = false;
    self.postMessage({ type: 'nli-status', state: 'error', message: error?.message ?? String(error) });
  }
}

function disableNli() {
  nliEnabled = false;
  self.postMessage({ type: 'nli-status', state: 'off' });
}

async function runNliFor(message, deterministicIssues) {
  const requestId = message.id;
  const isStale = () => requestId !== latestRequestId;
  if (isStale()) return;
  const started = performance.now();
  try {
    const { runNli } = await import('./nli');
    const issues = await runNli(message.text || '', deterministicIssues, { isStale });
    if (isStale()) return;
    self.postMessage({ type: 'nli-result', id: requestId, issues, ms: Math.round(performance.now() - started) });
  } catch (error) {
    if (isStale()) return;
    self.postMessage({ type: 'nli-status', state: 'error', message: error?.message ?? String(error) });
  }
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === 'enable-nli') {
    enableNli();
    return;
  }
  if (message.type === 'disable-nli') {
    disableNli();
    return;
  }
  if (message.type !== 'analyze') return;
  latestRequestId = message.id;
  await ready;
  const started = performance.now();
  try {
    const report = engine.analyze(message.text || '', message.outline || '', message.kind || 'Other', message.style || '');
    self.postMessage({
      type: 'result',
      id: message.id,
      issues: report.issues ?? [],
      stats: report.stats ?? null,
      engine: engine.name,
      ms: Math.round(performance.now() - started),
    });
    if (nliEnabled) runNliFor(message, report.issues ?? []);
  } catch (error) {
    self.postMessage({ type: 'error', id: message.id, message: error?.message ?? String(error) });
  }
};
