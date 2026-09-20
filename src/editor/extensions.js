/**
 * extensions.js — everything the Tiptap editor can do, in one list.
 *
 * StarterKit (Tiptap 3) already includes paragraphs, headings, bold, italic,
 * underline, strike, links, lists, blockquote, code, horizontal rule and
 * undo/redo. The rest are added here. Build the list once per editor.
 */
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { DocumentHighlights } from './highlights';
import { ParagraphFormat } from './paragraphFormat';

export function buildExtensions({ onHighlightClick } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    TextStyleKit, // text colour, font family, font size
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Subscript,
    Superscript,
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: 'Start writing, or open a Word, text or Markdown file from the File menu…' }),
    ParagraphFormat, // indent, line spacing, borders, Title/Subtitle/No Spacing styles
    DocumentHighlights.configure({ onHighlightClick }),
  ];
}
