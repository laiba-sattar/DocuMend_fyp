/**
 * exporters.js — download the open document as .docx, .pdf or .txt (FR-03-02-04).
 *
 *   .docx → built from the editor's JSON with the `docx` library (loaded on demand)
 *   .pdf  → the browser's print dialog with only the document on the page;
 *           choose "Save as PDF" as the printer
 *   .txt  → plain text
 */
import { downloadBlob, downloadText, sanitizeHtml } from '../storage/html';

const safeName = (title) => (title || 'Untitled document').trim();

export function exportTxt(title, text) {
  downloadText(`${safeName(title)}.txt`, text);
}

/** Opens the print dialog for just the document (Save as PDF lives there). */
export function printDocument(title, html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);

  const page = frame.contentDocument;
  page.open();
  page.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeName(title).replace(/</g, '&lt;')}</title>
<style>
  @page { margin: 2.2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  h1, h2, h3 { font-family: Georgia, serif; margin: 1.2em 0 .4em; }
  p { margin: 0 0 .7em; }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #999; font-style: italic; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #999; padding: 4pt 6pt; vertical-align: top; }
  hr { border: 0; page-break-after: always; break-after: page; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; gap: .5em; }
  mark { padding: 0 1px; }
</style></head><body>${sanitizeHtml(html)}</body></html>`);
  page.close();

  const win = frame.contentWindow;
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup);
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 60000); // in case afterprint never fires
  }, 250);
}

/** Builds a Word file from Tiptap JSON (editor.getJSON()). */
export async function exportDocx(title, json) {
  const {
    AlignmentType, Document, ExternalHyperlink, HeadingLevel, LevelFormat, Packer, PageBreak,
    Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx');

  const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  const ALIGN = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  };
  const hex = (color) => (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : undefined);
  let orderedListCount = 0;

  const runsOf = (node) => (node.content ?? []).flatMap((child) => {
    if (child.type === 'hardBreak') return [new TextRun({ text: '', break: 1 })];
    if (child.type !== 'text') return [];
    const marks = Object.fromEntries((child.marks ?? []).map((mark) => [mark.type, mark.attrs ?? {}]));
    const run = new TextRun({
      text: child.text,
      bold: Boolean(marks.bold),
      italics: Boolean(marks.italic),
      underline: marks.underline || marks.link ? {} : undefined,
      strike: Boolean(marks.strike),
      superScript: Boolean(marks.superscript),
      subScript: Boolean(marks.subscript),
      color: hex(marks.textStyle?.color) ?? (marks.link ? '0563C1' : undefined),
      font: marks.textStyle?.fontFamily || undefined,
      shading: marks.highlight
        ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(marks.highlight.color) ?? 'F4D995' }
        : undefined,
    });
    return marks.link?.href ? [new ExternalHyperlink({ link: marks.link.href, children: [run] })] : [run];
  });

  const paragraph = (node, extra = {}) => new Paragraph({
    children: runsOf(node),
    alignment: ALIGN[node.attrs?.textAlign],
    ...extra,
  });

  const list = (node, kind, level, instance) => (node.content ?? []).flatMap((item) => (
    (item.content ?? []).flatMap((child) => {
      if (child.type === 'bulletList') return list(child, 'bullet', level + 1, instance);
      if (child.type === 'orderedList') return list(child, 'ordered', level + 1, instance);
      if (child.type === 'taskList') return list(child, 'task', level + 1, instance);
      if (child.type !== 'paragraph' && child.type !== 'heading') return blocks([child]);
      const para = paragraph(child, kind === 'bullet'
        ? { bullet: { level: Math.min(level, 3) } }
        : kind === 'ordered'
          ? { numbering: { reference: 'documend-numbers', level: Math.min(level, 3), instance } }
          : { indent: { left: 360 * (level + 1) } });
      if (kind === 'task') {
        return [new Paragraph({
          children: [new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' }), ...runsOf(child)],
          indent: { left: 360 * (level + 1) },
        })];
      }
      return [para];
    })
  ));

  const blocks = (nodes) => nodes.flatMap((node) => {
    switch (node.type) {
      case 'paragraph':
        return [paragraph(node)];
      case 'heading':
        return [paragraph(node, { heading: HEADINGS[node.attrs?.level] ?? HeadingLevel.HEADING_2 })];
      case 'blockquote':
        return (node.content ?? []).map((child) => paragraph(child, { indent: { left: 720 } }));
      case 'bulletList':
        return list(node, 'bullet', 0, 0);
      case 'orderedList':
        orderedListCount += 1;
        return list(node, 'ordered', 0, orderedListCount); // each list restarts at 1
      case 'taskList':
        return list(node, 'task', 0, 0);
      case 'horizontalRule':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'codeBlock':
        return [new Paragraph({
          children: [new TextRun({ text: (node.content ?? []).map((c) => c.text ?? '').join(''), font: 'Courier New' })],
        })];
      case 'table':
        return [new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: (node.content ?? []).map((row) => new TableRow({
            children: (row.content ?? []).map((cell) => {
              const children = blocks(cell.content ?? []).filter((child) => child instanceof Paragraph);
              return new TableCell({ children: children.length ? children : [new Paragraph('')] });
            }),
          })),
        })];
      default:
        return node.content ? blocks(node.content) : [];
    }
  });

  const children = blocks(json?.content ?? []);
  const doc = new Document({
    creator: 'DocuMend',
    title: safeName(title),
    numbering: {
      config: [{
        reference: 'documend-numbers',
        levels: [0, 1, 2, 3].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ children: children.length ? children : [new Paragraph('')] }],
  });

  downloadBlob(`${safeName(title)}.docx`, await Packer.toBlob(doc));
}
