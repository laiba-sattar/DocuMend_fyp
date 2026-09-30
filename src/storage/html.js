/**
 * html.js — safe helpers for document HTML saved by the editor.
 *
 * DOMParser builds an inert document: scripts don't run and images don't
 * load while we read it, unlike innerHTML on a live element.
 */

function parse(html) {
  return new DOMParser().parseFromString(html || '', 'text/html');
}

/** The document's text as a list of paragraphs (headings, list items and quotes count too). */
export function paragraphsOf(html) {
  const doc = parse(html);
  const blocks = [...doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td')]
    .filter((node) => !node.querySelector('p, li, blockquote, td')) // skip wrappers, keep the innermost blocks
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (blocks.length) return blocks;
  const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
  return text ? [text] : [];
}

/** Removes scripts, frames and inline event handlers before showing saved HTML. */
export function sanitizeHtml(html) {
  const doc = parse(html);
  doc.body.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((node) => node.remove());
  doc.body.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

/** Saves a file to the user's Downloads folder. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves text to the user's Downloads folder. */
export function downloadText(filename, text) {
  downloadBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}
