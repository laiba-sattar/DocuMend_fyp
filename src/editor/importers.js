/**
 * importers.js — turns a file the user picks into editor HTML (PB-06).
 *
 *   .docx      → mammoth (keeps headings, lists, bold/italic, tables; images are skipped)
 *   .txt / .md → plain paragraphs
 *
 * The libraries are loaded only when a file is imported, so they don't slow
 * down the first page load. Nothing leaves the device.
 */
import { countWords } from '../storage/format';

export const IMPORT_EXTENSIONS = /\.(docx|txt|md)$/i;
export const IMPORT_ACCEPT = '.docx,.txt,.md';
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Blank lines separate paragraphs; single line breaks stay inside one. */
export function textToHtml(text) {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

function htmlToText(html) {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent || '';
}

async function docxToHtml(file) {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) }, // skip images for now
  );
  return result.value.replace(/<img[^>]*>/g, '');
}

/**
 * Reads a file and returns { title, html, wordCount, format }.
 * Throws an Error with a user-facing message when the file can't be used.
 */
export async function importFile(file) {
  if (!IMPORT_EXTENSIONS.test(file.name)) {
    throw new Error('That file type can’t be imported. Use a .docx, .txt or .md file (save a .pdf, .doc or .rtf as .docx first).');
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('That file is over the 20 MB limit.');
  }

  const extension = file.name.split('.').pop().toLowerCase();
  let html;
  try {
    if (extension === 'docx') html = await docxToHtml(file);
    else html = textToHtml(await file.text());
  } catch (error) {
    console.error(error);
    // Only say "password-protected" when the library actually says so. Guessing
    // sends people off to check a file that was never the problem.
    if (error?.name === 'PasswordException') {
      throw new Error(`“${file.name}” is password-protected. Remove the password and try again.`);
    }
    throw new Error(`“${file.name}” could not be read: ${error?.message ?? 'unknown error'}`);
  }

  if (!htmlToText(html).trim()) {
    throw new Error('That file has no text to import.');
  }

  return {
    title: file.name.replace(/\.[^/.]+$/, '') || 'Imported document',
    html,
    wordCount: countWords(htmlToText(html)),
    format: extension.toUpperCase(),
  };
}
