# DocuMend

A privacy-first document editor — marketing site and signed-in workspace in one
React app. Documents are analysed on the device; nothing is uploaded.

University final-year project.

---

## Tech stack

| | |
|---|---|
| **React 19** | plain JSX — no TypeScript anywhere in `src/` |
| **Vite 8** | dev server and production build |
| **Plain CSS** | one stylesheet per page, no CSS framework |
| **lucide-react** | icons |
| **Tiptap 3** | the rich-text editor |
| **Dexie** | browser database (IndexedDB) — documents, folders, versions |
| **mammoth · pdf.js · docx** | import .docx/.pdf, export .docx (loaded only when used) |
| **oxlint** | linting |

No router library, no state library, no UI kit. Routing is under 20 lines in
[`src/router.js`](src/router.js); shared state is React context.

> An earlier version of this project was built on Replit with TypeScript,
> Tailwind and shadcn/ui. None of that remains — the stack above is the whole
> dependency story.

---

## Running it

Requires **Node 20+**.

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

### All commands

| Command | What it does |
|---|---|
| `npm run dev` | start the dev server with hot reload |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the built `dist/` locally |
| `npm run lint` | run oxlint over the project |

### Viewing it on a phone

```bash
npm run dev -- --host
```

Vite then prints a **Network** address (e.g. `http://192.168.1.20:5173`) — open
that on a phone connected to the same Wi-Fi. Without `--host` it binds locally
only and the phone cannot reach it. That address comes from your router, so it
changes when you reconnect; if the page stops loading, re-read the address Vite
prints.

### On Windows, if `npm` is not found

Node may be installed but missing from `PATH`. In PowerShell:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
npm run dev
```

### If a page looks stale or wrong

Another project may already hold the port, in which case Vite quietly moves to
the next one — check the address it actually printed, not the one you expected.

---

## Project structure

```
src/
├── App.jsx                  route table
├── main.jsx                 entry point
├── router.js                navigate() + usePathname()
├── index.css                design tokens, reset, fonts
├── styles-utilities.css     vendored utility classes (see note below)
├── components/
│   ├── BrandMark.jsx        the logo, used everywhere
│   ├── WorkspaceChrome.jsx  sidebar, header, drawer, modal
│   ├── workspace-nav.js     sidebar navigation data
│   ├── ThemeContext.jsx     dark mode, persisted to localStorage
│   ├── ErrorBoundary.jsx
│   └── Reveal.jsx           scroll-in animation
└── pages/                   one component + one stylesheet each
```

**Conventions:** components are `PascalCase.jsx`, stylesheets are
`kebab-case.css`, and every page's CSS classes carry a page-specific prefix
(`dash-`, `editor-`, `folder-`) so no two stylesheets can collide.

**`styles-utilities.css` is a frozen, pre-compiled Tailwind subset** — not a
live Tailwind build. A utility class that is not already in that file does
nothing at all, with no build error. Write real CSS instead.

---

## Pages

**Public** — landing page, sign up, log in, password reset, pricing.

**Workspace** — dashboard, my documents, editor, version history, features,
settings, storage, share, help, plus setup screens for creating a document and
a folder.

Every page shares the same sidebar and header from `WorkspaceChrome`, and
follows the dark-mode setting from `ThemeContext`.

---

## Status

No backend yet, so sign-in and password reset are simulated. Documents,
folders, versions and settings are stored in the browser (IndexedDB) and
survive a reload; nothing is uploaded.

Project conventions, architecture notes and known open issues are kept in
[CLAUDE.md](CLAUDE.md).
