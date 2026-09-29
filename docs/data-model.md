# DocuMend data model (browser storage)

Everything a user writes is stored in the browser's IndexedDB, in one database
called `documend`, through [Dexie](https://dexie.org). Pages never talk to the
database directly — they call the functions in `src/storage/`.

Timestamps are milliseconds since 1970 (`Date.now()`). Ids are random UUIDs.

## Version 1 (now)

### `documents`
Indexed: `id` (key), `folderId`, `category`, `updatedAt`

| Field | Example | Notes |
|---|---|---|
| `id` | `"3f2c…"` | primary key |
| `title` | `"FYP Phase 2 Report"` | |
| `type` | `"Thesis"` | from the Create document screen: Thesis, Research paper, Legal, Report, Other |
| `category` | `"Academic"` | derived from `type`; used by the My documents filter chips |
| `folderId` | `"root"` | `"root"` or a `folders.id` |
| `checks` | `["grammar","contradiction"]` | analyses picked at setup |
| `tint` | `"sage"` | card colour |
| `format` | `"DOCX"` | label on the card |
| `content` | `"<p>…</p>"` | HTML from the Tiptap editor (`editor.getHTML()`); ciphertext after S3 |
| `wordCount` | `0` | |
| `status` | `"draft"` | `draft` / `done` |
| `syncStatus` | `"local"` | `local` / `queued` / `synced` (S9) |
| `issueCount` | `0` | set by the engine (S6) |
| `createdAt`, `updatedAt` | `1789000000000` | |

### `folders`
Indexed: `id` (key), `parentId`, `name`

| Field | Example | Notes |
|---|---|---|
| `id` | `"9ab1…"` | primary key; `"root"` is never stored |
| `name` | `"Legal drafts"` | |
| `color` | `"gold"` | saffron, sage, coral, lavender, sky, gold |
| `parentId` | `"root"` | |
| `createdAt` | | |

### `versions`
Indexed: `id` (key), `docId`, `createdAt`

| Field | Example | Notes |
|---|---|---|
| `id` | | primary key |
| `docId` | | the document it belongs to |
| `kind` | `"auto"` | `auto` (timer) or `manual` (named snapshot) |
| `label`, `note` | `"Before supervisor review"` | manual snapshots only |
| `content` | | full copy of the document at that moment |
| `wordCount` | | |
| `createdAt` | | |

### `settings`
Indexed: `key` (key). One row per setting, e.g. `{ key: "hybridMode", value: "offline" }`.

## Planned (add as `db.version(2)`, never by editing version 1)

| Store | Section | Holds |
|---|---|---|
| `analysis` | S6 | issues found per document: type, character range, confidence, status |
| `citations` | S8 | DOI, fetched metadata, style, valid / invalid |
| `auditLog` | S3 | append-only, each entry hashes the previous one |
| `syncQueue` | S9 | document id, checksum, retry count, status |
| `keys` | S3 | the wrapped (locked) data key and its salt |
