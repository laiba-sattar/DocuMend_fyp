# ODIE engine protocol

How the editor talks to the analysis engine. Written down here so the Rust side
and the JavaScript side can change independently.

## Where the pieces live

| Piece | Path | Runs in |
| --- | --- | --- |
| Rules (the real engine) | `engine/` — Rust, compiled to WebAssembly | Web Worker |
| JavaScript fallback | `src/engine/fallback.js` | Web Worker |
| Worker | `src/engine/worker.js` | Web Worker |
| React hook | `src/engine/useEngine.js` | the page |
| Offsets ↔ editor positions | `src/engine/textmap.js` | the page |

The page never calls the engine directly; it uses the hook.

## Building the Rust engine

```
wasm-pack build engine --target web --out-dir ../src/engine/pkg
```

The output lands in `src/engine/pkg/` and is **not** committed (it is rebuilt
from the Rust source). Without it the worker quietly uses the JavaScript
fallback, so the app always works.

Run the engine's own tests (no internet needed):

```
cargo test --manifest-path engine/Cargo.toml
```

## Messages

The page sends:

```js
{
  type: 'analyze',
  id: 7,
  text: 'the whole document as plain text',
  outline: '1\t0\t12\tIntroduction\n2\t140\t151\tMethodology',  // one heading per line:
                                                                //   level TAB start TAB end TAB title
  kind: 'Thesis',        // the document's type, for the structure template
}
```

The worker answers:

```js
{ type: 'ready',  engine: 'wasm' | 'javascript', version: '0.1.0', ms: 412 }
{ type: 'result', id: 7, issues: [...], stats: {...}, engine: 'wasm', ms: 18 }
{ type: 'error',  id: 7, message: '…' }
```

Only the answer whose `id` matches the newest request is used; older answers are
dropped.

## An issue

```js
{
  id: 'number-120-260',          // stable for the same finding
  kind: 'contradiction',         // contradiction | redundancy | structure | citation
  title: 'Numbers do not match',
  message: 'Sentence 3 says PKR 45,000 but sentence 7 says PKR 32,000 …',
  severity: 'high',              // high | medium | low
  location: 'Sentence 3 · Sentence 7',
  start: 120, end: 130,          // the main place to highlight
  related: [{ start: 260, end: 270 }],
  repairs: [                     // may be empty
    { label: 'Use PKR 45,000 everywhere', start: 260, end: 270, text: 'PKR 45,000' }
  ],
  suggestion: null               // structure issues may carry { title, level }:
                                 // a heading the editor can add with one click
}
```

`stats` carries `{ sentences, words, numbers, headings, checks }`.

## Offsets

Every `start` / `end` is a **UTF-16 offset** into the plain text that was sent —
the same numbers JavaScript uses, so `text.slice(start, end)` gives back exactly
the words the issue is about. `src/engine/textmap.js` turns those offsets into
ProseMirror positions for highlighting, and refuses to do so if the document has
changed since the analysis (a fresh analysis follows a second later).

## The checks today

Sentence checks (`engine/src/rules.rs`):

1. **Numbers do not match** — two sentences about the same topic give different
   values for the same unit (PKR 45,000 vs PKR 32,000). Two repairs offered.
2. **Claims disagree** — two near-identical sentences, one of them negated.
   No automatic repair: the writer has to decide which one is true.
3. **Repeated sentence** — two sentences at least 70% the same. Repair: delete
   the second one.

Structure checks (`engine/src/structure.rs`), which read the outline:

4. **Section missing** — the document's type has a template (Thesis, Research
   paper, Report, Legal) and one of its sections has no heading. Carries a
   `suggestion`, so the editor can add the heading. Only runs once the document
   has at least two headings.
5. **Section has no text** — a heading with nothing written under it. A heading
   whose next heading is deeper is a parent, not an empty section.
6. **Heading level skipped** — a Heading 3 directly under a Heading 1.
7. **Two sections share a name** — the same heading title twice.
8. **A more standard name** — a heading uses a different word for a section the
   template knows ("Findings" where a thesis puts "Results", "Summary" for
   "Abstract"). Repair: rename it, keeping any "3." numbering. The section
   still counts as present, so it is never also reported as missing.

Planned next: citation checks (S8) and the on-device NLI model for softer
contradictions (S7). The templates will move into Settings so a user can edit
them.
