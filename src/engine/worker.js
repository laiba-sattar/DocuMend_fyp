/**
 * worker.js — the engine's own thread.
 *
 * Analysis runs here, not on the page, so a long document never freezes the
 * cursor. The worker first tries to load the Rust engine (WebAssembly); if that
 * file has not been built yet it quietly uses the JavaScript version instead,
 * and tells the page which one is running.
 *
 * Messages in:  { type: 'analyze', id, text, outline, kind }
 * Messages out: { type: 'ready', engine, version, ms }
 *               { type: 'result', id, issues, stats, engine, ms }
 *               { type: 'error', id, message }
 *
 * Build the Rust engine with:
 *   wasm-pack build engine --target web --out-dir ../src/engine/pkg
 */
import { analyze as analyzeWithJs } from './fallback';

/** Where wasm-pack puts the browser build. */
const WASM_ENTRY = './pkg/documend_engine.js';

let engine = null;

async function loadEngine() {
  const started = performance.now();
  try {
    // @vite-ignore keeps the bundler from failing when the file is not built yet.
    const wasm = await import(/* @vite-ignore */ WASM_ENTRY);
    await wasm.default();
    engine = {
      name: 'wasm',
      version: wasm.engine_version(),
      analyze: (text, outline, kind) => JSON.parse(wasm.analyze_json(text, outline, kind)),
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

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type !== 'analyze') return;
  await ready;
  const started = performance.now();
  try {
    const report = engine.analyze(message.text || '', message.outline || '', message.kind || 'Other');
    self.postMessage({
      type: 'result',
      id: message.id,
      issues: report.issues ?? [],
      stats: report.stats ?? null,
      engine: engine.name,
      ms: Math.round(performance.now() - started),
    });
  } catch (error) {
    self.postMessage({ type: 'error', id: message.id, message: error?.message ?? String(error) });
  }
};
