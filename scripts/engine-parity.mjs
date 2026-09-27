/**
 * engine-parity.mjs — asks the Rust engine and the JavaScript engine the same
 * questions and checks they give the same answers.
 *
 * The editor uses the Rust engine when it is built and the JavaScript one when
 * it is not. That only works if they agree, and nothing else guarantees it.
 *
 *   npm run test:engine
 *
 * Needs the Rust engine built first:
 *   npx wasm-pack build engine --target web --out-dir ../src/engine/pkg
 *
 * Exit code: 0 all agree, 1 they disagree, 2 the Rust build is missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cases from './engine-parity-cases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'src', 'engine', 'pkg');
const glue = path.join(pkg, 'documend_engine.js');
const binary = path.join(pkg, 'documend_engine_bg.wasm');

if (!fs.existsSync(glue) || !fs.existsSync(binary)) {
  console.error('The Rust engine is not built, so there is nothing to compare.');
  console.error('Build it with:  npx wasm-pack build engine --target web --out-dir ../src/engine/pkg');
  process.exit(2);
}

const { analyze: runJs } = await import(pathToFileURL(path.join(root, 'src', 'engine', 'fallback.js')).href);
const rust = await import(pathToFileURL(glue).href);
await rust.default({ module_or_path: fs.readFileSync(binary) });

/** Key order must not matter, so objects are written with their keys sorted. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compare(name, text, outline, kind) {
  const js = runJs(text, outline, kind);
  const rs = JSON.parse(rust.analyze_json(text, outline, kind));
  const problems = [];

  const jsIssues = js.issues.map(canonical);
  const rsIssues = rs.issues.map(canonical);
  const onlyJs = jsIssues.filter((issue) => !rsIssues.includes(issue));
  const onlyRust = rsIssues.filter((issue) => !jsIssues.includes(issue));
  if (onlyJs.length || onlyRust.length) {
    problems.push({ what: 'issues differ', onlyJs, onlyRust });
  } else if (jsIssues.length !== rsIssues.length) {
    problems.push({ what: `issue counts differ (${jsIssues.length} vs ${rsIssues.length})` });
  } else if (jsIssues.some((issue, i) => issue !== rsIssues[i])) {
    problems.push({ what: 'same issues, different order' });
  }
  if (canonical(js.stats) !== canonical(rs.stats)) {
    problems.push({ what: 'stats differ', js: canonical(js.stats), rust: canonical(rs.stats) });
  }
  return { name, problems, count: jsIssues.length };
}

let issuesSeen = 0;
const failures = [];
for (const { name, text, outline, kind } of cases) {
  const result = compare(name, text, outline, kind);
  issuesSeen += result.count;
  if (result.problems.length) failures.push(result);
}

const short = (json) => (json.length > 260 ? `${json.slice(0, 260)}...` : json);
if (failures.length) {
  for (const { name, problems } of failures.slice(0, 8)) {
    console.log(`\nDIFFER  ${name}`);
    for (const problem of problems) {
      console.log(`   ${problem.what}`);
      (problem.onlyJs ?? []).slice(0, 2).forEach((issue) => console.log(`     only JavaScript: ${short(issue)}`));
      (problem.onlyRust ?? []).slice(0, 2).forEach((issue) => console.log(`     only Rust:       ${short(issue)}`));
      if (problem.js) console.log(`     JavaScript: ${problem.js}\n     Rust:       ${problem.rust}`);
    }
  }
  if (failures.length > 8) console.log(`\n... and ${failures.length - 8} more`);
}

console.log(`\nRust ${rust.engine_version()} vs JavaScript: ${cases.length} documents, ${issuesSeen} issues compared.`);
console.log(failures.length ? `${failures.length} document(s) got different answers.` : 'Both engines gave identical answers on every document.');
process.exit(failures.length ? 1 : 0);
